import test from "node:test";
import assert from "node:assert/strict";
import { REMINDER_STATUS, channelOptions, channelSettingsOf, mailtoUrl, providerRequest, sendViaProvider, smsUrl, statusWord } from "./reminderChannels.js";
import { reminderQueue, reminderRecord, reminderSettingsOf } from "../accounts/overdueReminders.js";
import { buildGlobalLedger } from "../ledger/globalLedger.js";
import { capsSavedText } from "../utils/capsSavedText.js";

const S = "s1";
const customers = [
  { id: "c1", customerName: "Al Noor", whatsappNumber: "0501234567", email: "accounts@alnoor.ae" },
  { id: "c2", customerName: "Mail Only", email: "pay@mailonly.ae" },
  { id: "c3", customerName: "Nothing" },
];
const si = (id, cid, name, total) => ({ id, shopId: S, status: "confirmed", invoiceNo: id, invoiceDate: "2026-10-01", customerId: cid, customerName: name, grandTotal: total, totalVat: 0, amountPaid: 0, paymentMethod: "credit" });
const salesInvoices = [si("SI-1", "c1", "Al Noor", 1000), si("SI-2", "c2", "Mail Only", 500), si("SI-3", "c3", "Nothing", 200)];
const ledger = buildGlobalLedger({ salesInvoices }, { shopId: S, customers });
const settings = reminderSettingsOf({ overdueReminders: { enabled: true } });
const queue = (shop) => reminderQueue(ledger, { asOf: "2026-11-25", salesInvoices, customers, settings, countryCode: "971", channels: channelSettingsOf(shop) });

test("channels: WhatsApp on, SMS and email off unless switched on", () => {
  const c = channelSettingsOf({});
  assert.deepEqual([c.whatsapp, c.sms, c.email, c.whatsappProvider.url, c.smsProvider.url, c.emailProvider.url], [true, false, false, "", "", ""]);
  assert.deepEqual(queue({}).map((r) => [r.name, r.status]), [["Al Noor", "ready"], ["Mail Only", "noPhone"], ["Nothing", "noPhone"]], "WhatsApp only: as before");
});

test("gating: each switched-on channel needs its own contact; email reaches a customer with no phone", () => {
  const shop = { overdueReminders: { channels: { whatsapp: true, sms: true, email: true } } };
  const rows = queue(shop);
  const opt = (name, ch) => rows.find((r) => r.name === name).options.find((o) => o.channel === ch);
  assert.deepEqual([opt("Al Noor", "whatsapp").ok, opt("Al Noor", "sms").ok, opt("Al Noor", "email").ok, opt("Al Noor", "whatsapp").via, opt("Al Noor", "sms").via], [true, true, true, "open", "open"]);
  assert.deepEqual([rows.find((r) => r.name === "Mail Only").status, opt("Mail Only", "email").ok, opt("Mail Only", "sms").reason], ["ready", true, "noPhone"]);
  assert.equal(rows.find((r) => r.name === "Nothing").status, "noPhone");
  assert.match(rows.find((r) => r.name === "Nothing").reason, /switched-on channels/);
  const off = queue({ overdueReminders: { channels: { whatsapp: false, sms: false, email: true } } });
  assert.equal(off.find((r) => r.name === "Al Noor").options.find((o) => o.channel === "whatsapp").reason, "off");
  const badUrl = channelOptions(customers[0], channelSettingsOf({ overdueReminders: { channels: { sms: true }, smsProvider: { url: "http://sms.example" } } }));
  assert.equal(badUrl.find((o) => o.channel === "sms").reason, "providerUrl", "a provider must be https");
});

test("sms: and mailto: links carry the message", () => {
  assert.equal(smsUrl("971501234567", "Pay AED 5 & thanks"), "sms:+971501234567?body=Pay%20AED%205%20%26%20thanks");
  assert.equal(mailtoUrl("accounts@alnoor.ae", "Payment reminder", "Line 1\nLine 2"), "mailto:accounts@alnoor.ae?subject=Payment%20reminder&body=Line%201%0ALine%202");
});

test("provider: only a 2xx reply is a hand-off; errors come back as they are; never 'delivered'", async () => {
  const p = { url: "https://sms.example/send", token: "t1" };
  const req = providerRequest(p, { to: "971501234567", message: "Hi" });
  assert.deepEqual([req.method, req.headers.Authorization, JSON.parse(req.body)], ["POST", "Bearer t1", { to: "971501234567", message: "Hi" }]);
  const calls = [];
  const ok = await sendViaProvider("sms", p, { to: "971501234567", message: "Hi", transport: async (r) => { calls.push(r); return { status: 202, text: JSON.stringify({ id: "msg-9", status: "delivered" }) }; } });
  assert.deepEqual(ok, { ok: true, status: "handedOffSms", httpStatus: 202, providerId: "msg-9" }, "a provider saying 'delivered' is still only a hand-off");
  assert.equal(calls.length, 1);
  assert.deepEqual(await sendViaProvider("sms", p, { to: "x", message: "Hi", transport: async () => ({ status: 401, text: JSON.stringify({ message: "Invalid token" }) }) }), { ok: false, error: "http", httpStatus: 401, message: "Invalid token" });
  assert.deepEqual(await sendViaProvider("email", p, { to: "a@b.ae", message: "Hi", subject: "S", transport: async () => { throw new Error("getaddrinfo ENOTFOUND"); } }), { ok: false, error: "network", httpStatus: 0, message: "getaddrinfo ENOTFOUND" });
  assert.equal((await sendViaProvider("sms", { url: "http://x" }, { to: "1", message: "m", transport: async () => { throw new Error("must not be called"); } })).error, "providerUrl");
  const mail = providerRequest(p, { to: "a@b.ae", message: "Hi", subject: "Reminder" });
  assert.equal(JSON.parse(mail.body).subject, "Reminder");
});

test("WhatsApp https provider: provider via and auto hand-off", async () => {
  const shop = { overdueReminders: { channels: { whatsapp: true }, whatsappProvider: { url: "https://waba.example/send", token: "w1" } } };
  const ch = channelSettingsOf(shop);
  const opt = queue(shop).find((r) => r.name === "Al Noor").options.find((o) => o.channel === "whatsapp");
  assert.deepEqual([opt.ok, opt.via], [true, "provider"]);
  const res = await sendViaProvider("whatsapp", ch.whatsappProvider, { to: "971501234567", message: "Due", transport: async () => ({ status: 200, text: JSON.stringify({ id: "w-1" }) }) });
  assert.deepEqual(res, { ok: true, status: "handedOffWhatsApp", httpStatus: 200, providerId: "w-1" });
});

test("status words never say delivered or sent; the record keeps channel, status and provider id", () => {
  assert.deepEqual([statusWord("whatsapp", "open"), statusWord("whatsapp", "provider"), statusWord("sms", "open"), statusWord("sms", "provider"), statusWord("email", "open"), statusWord("email", "provider")],
    ["openedWhatsApp", "handedOffWhatsApp", "openedSms", "handedOffSms", "openedEmail", "handedOffEmail"]);
  Object.values(REMINDER_STATUS).forEach((t) => { assert.doesNotMatch(t.en, /delivered|\bsent\b/i); });
  const row = queue({ overdueReminders: { channels: { email: true } } }).find((r) => r.name === "Al Noor");
  const rec = reminderRecord(row, { shopId: S, user: { uid: "u1" }, channel: "email", status: "handedOffEmail", providerId: "m-1" });
  assert.deepEqual([rec.channel, rec.sendStatus, rec.providerId, rec.email, rec.status], ["email", "handedOffEmail", "m-1", "accounts@alnoor.ae", "done"]);
  assert.doesNotMatch(rec.title, /delivered|\bsent\b/i);
  assert.match(reminderRecord(row, { shopId: S, user: { uid: "u1" } }).title, /opened in WhatsApp/, "WhatsApp record as before");
});

test("provider address and token keep their case on save", () => {
  const saved = capsSavedText({ overdueReminders: { smsProvider: { url: "https://Sms.Example/Send", token: "AbC-123" }, emailProvider: { url: "https://mail.example/v1", token: "xYz" }, emailSubjectEn: "Reminder from {shop}" } });
  assert.deepEqual(saved.overdueReminders.smsProvider, { url: "https://Sms.Example/Send", token: "AbC-123" });
  assert.equal(saved.overdueReminders.emailProvider.token, "xYz");
  assert.equal(saved.overdueReminders.emailSubjectEn, "Reminder from {shop}");
});
