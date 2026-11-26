import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_REMINDER_TEXT, fillReminder, lastReminders, reminderQueue, reminderRecord, reminderRows, reminderSettingsOf, reminderText } from "./overdueReminders.js";
import { buildGlobalLedger } from "../ledger/globalLedger.js";
import { buildAging } from "../reports/partyAging.js";

const S = "s1";
const customers = [
  { id: "c1", customerName: "Al Noor", whatsappNumber: "0501234567" },
  { id: "c2", customerName: "Star Parts", mobileNumber: "+971 55 111 2222", paymentTerms: 30 },
  { id: "c3", customerName: "No Phone Garage" },
  { id: "c4", customerName: "Paid Up", mobileNumber: "0509999999" },
];
const si = (id, cid, name, day, total, extra = {}) => ({ id, shopId: S, status: "confirmed", invoiceNo: id, invoiceDate: day, customerId: cid, customerName: name, grandTotal: total, totalVat: 0, amountPaid: 0, paymentMethod: "credit", ...extra });
const salesInvoices = [
  si("SI-1", "c1", "Al Noor", "2026-10-01", 1000),
  si("SI-2", "c1", "Al Noor", "2026-11-20", 300),
  si("SI-3", "c2", "Star Parts", "2026-11-01", 700),
  si("SI-4", "c3", "No Phone Garage", "2026-09-01", 250),
  si("SI-5", "c4", "Paid Up", "2026-09-01", 400, { amountPaid: 400, paymentMethod: "cash" }),
];
const ledger = buildGlobalLedger({ salesInvoices }, { shopId: S, customers });
const ASOF = "2026-11-25";
const settings = reminderSettingsOf({ overdueReminders: { enabled: true, minDays: 7 } });

test("settings: off, 7 days, English unless set", () => {
  assert.deepEqual(reminderSettingsOf({}), { enabled: false, minDays: 7, minAmount: 0, language: "en", textEn: DEFAULT_REMINDER_TEXT.en, textBn: DEFAULT_REMINDER_TEXT.bn });
  assert.equal(reminderSettingsOf({ overdueReminders: { language: "BN" } }).language, "bn", "read in any case");
});

test("queue: overdue customers only, from the ageing's open bills and due dates", () => {
  const q = reminderQueue(ledger, { asOf: ASOF, salesInvoices, customers, settings, countryCode: "971" });
  assert.deepEqual(q.map((r) => [r.name, r.status, r.amount, r.bills, r.oldestDue, r.days]), [
    ["No Phone Garage", "noPhone", 250, 1, "2026-09-01", 85],
    ["Al Noor", "ready", 1000, 1, "2026-10-01", 55],
  ], "SI-2 is 5 days old (under 7); Star's 30 credit days: not due; Paid Up has nothing open");
  assert.equal(q.find((r) => r.name === "Al Noor").phone, "971501234567");
  assert.match(q[0].reason, /No WhatsApp or mobile/);
  const aging = buildAging(ledger.postings, ledger.accounts, { side: "customer", asOf: ASOF });
  assert.equal(aging.rows.find((r) => r.name === "Al Noor").due, 1300, "ageing unchanged: the queue only shows the overdue part");
  assert.deepEqual(reminderQueue(ledger, { asOf: ASOF, salesInvoices, customers, settings: { ...settings, minAmount: 500 } }).map((r) => r.name), ["Al Noor"], "minimum amount");
});

test("message: placeholders filled in the chosen language", () => {
  const row = reminderQueue(ledger, { asOf: ASOF, salesInvoices, customers, settings }).find((r) => r.name === "Al Noor");
  assert.equal(reminderText(row, { settings, shopName: "Gulf Parts" }),
    "Dear Al Noor, this is a reminder from Gulf Parts: AED 1000.00 is overdue on 1 bill(s), the oldest due on 01/10/2026 (55 days). Kindly arrange the payment. Thank you.");
  assert.match(reminderText(row, { settings: { ...settings, language: "bn" }, shopName: "Gulf Parts" }), /প্রিয় Al Noor/);
  assert.equal(fillReminder("{name} {unknown}", { name: "A" }), "A {unknown}", "unknown words are left as typed");
});

test("once a day: a reminder record today marks the customer as reminded", () => {
  const row = reminderQueue(ledger, { asOf: ASOF, salesInvoices, customers, settings }).find((r) => r.name === "Al Noor");
  const rec = reminderRecord(row, { shopId: S, user: { uid: "u1" }, profile: { personName: "Owner" }, mode: "desktop", now: new Date(`${ASOF}T09:30:00Z`) });
  assert.deepEqual([rec.source, rec.status, rec.customerId, rec.amount, rec.shareMode, rec.createdBy], ["overdueReminder", "done", "c1", 1000, "desktop", "u1"]);
  assert.match(rec.title, /opened in WhatsApp/);
  assert.equal(lastReminders([rec]).get("c1"), `${ASOF}T09:30:00.000Z`);
  const again = reminderQueue(ledger, { asOf: ASOF, salesInvoices, customers, settings, reminders: [rec] }).find((r) => r.name === "Al Noor");
  assert.equal(again.status, "done");
  const tomorrow = reminderQueue(ledger, { asOf: "2026-11-26", salesInvoices, customers, settings, reminders: [rec] }).find((r) => r.name === "Al Noor");
  assert.equal(tomorrow.status, "ready", "the next day it is due again");
  assert.equal(reminderQueue(ledger, { asOf: ASOF, salesInvoices, customers, settings, reminders: [{ ...rec, source: "manual" }] }).find((r) => r.name === "Al Noor").status, "ready", "other reminders do not count");
});

test("nothing is marked reminded without a share call", async () => {
  // the screen saves the record only after openWhatsAppText returns; a failing share leaves the customer to remind
  const rows = reminderQueue(ledger, { asOf: ASOF, salesInvoices, customers, settings });
  const saved = [];
  const sendOne = async (row, share) => {
    if (row.status !== "ready") return null;
    const res = await share(row.phone, reminderText(row, { settings }));
    saved.push(reminderRecord(row, { shopId: S, user: { uid: "u1" }, mode: res.mode }));
    return res;
  };
  await assert.rejects(sendOne(rows.find((r) => r.name === "Al Noor"), async () => { throw new Error("pop-up blocked"); }));
  assert.equal(saved.length, 0);
  assert.equal(await sendOne(rows.find((r) => r.name === "No Phone Garage"), async () => ({ mode: "browser" })), null, "no phone: nothing opened");
  assert.equal(saved.length, 0);
  const csv = reminderRows(rows);
  assert.deepEqual(csv[0], ["Customer", "Mobile / WhatsApp", "Overdue amount", "Bills", "Oldest due", "Days overdue", "Last reminded", "Status"]);
  assert.ok(csv.some((r) => r[0] === "No Phone Garage" && r[7].startsWith("Cannot send")));
});

test("message text keeps its case and placeholders on save; old capitalised templates still fill", async () => {
  const { capsSavedText } = await import("../utils/capsSavedText.js");
  const { fillTemplate } = await import("../share/bulkMessage.js");
  const saved = capsSavedText({ overdueReminders: { textEn: "Dear {name}, {amount} is due" }, messageTemplates: [{ name: "Due", body: "Hi {name}, due {due}" }] });
  assert.equal(saved.overdueReminders.textEn, "Dear {name}, {amount} is due");
  assert.equal(saved.messageTemplates[0].body, "Hi {name}, due {due}");
  assert.equal(fillReminder("DEAR {NAME}, {AMOUNT}", { name: "Ali", amount: "AED 5.00" }), "DEAR Ali, AED 5.00");
  assert.equal(fillTemplate("HI {NAME}, DUE {DUE}", { name: "Ali", due: "AED 9.00" }), "HI Ali, DUE AED 9.00");
});
