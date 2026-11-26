import test from "node:test";
import assert from "node:assert/strict";
import {
  INTEREST_DAY_BASIS, interestBlockers, interestJournal, interestRows, interestSettingsOf, interestSettingsProblem, overdueInterest, postedInterest,
} from "./overdueInterest.js";
import { billDueDate, buildAging } from "../reports/partyAging.js";
import { buildGlobalLedger, balances } from "../ledger/globalLedger.js";
import { journalPlByAccount } from "../reports/journalPl.js";

const S = "s1";
const customers = [{ id: "c1", customerName: "Al Noor" }, { id: "c2", customerName: "Star", paymentTerms: 30 }];
const vendors = [{ id: "v1", vendorName: "Gulf" }];
const si = (id, customerId, name, day, total, extra = {}) => ({ id, shopId: S, status: "confirmed", invoiceNo: id, invoiceDate: day, customerId, customerName: name, grandTotal: total, totalVat: 0, amountPaid: 0, paymentMethod: "credit", ...extra });
const salesInvoices = [
  si("SI-1", "c1", "Al Noor", "2026-10-01", 1000),
  si("SI-2", "c2", "Star", "2026-10-01", 500),
  si("SI-3", "c1", "Al Noor", "2026-09-01", 300),
  si("SI-D", "c1", "Al Noor", "2026-08-01", 999, { status: "draft" }),
  si("SI-X", "c1", "Al Noor", "2026-08-01", 999, { status: "cancelled" }),
  si("SI-P", "c2", "Star", "2026-08-01", 200, { amountPaid: 200, paymentMethod: "cash" }),
];
const purchaseInvoices = [{ id: "PI-1", shopId: S, status: "confirmed", invoiceNo: "PI-1", invoiceDate: "2026-09-15", dueDate: "2026-10-15", vendorId: "v1", vendorName: "Gulf", grandTotal: 2000, totalTax: 0, amountPaid: 0, paymentMethod: "credit" }];
const base = { salesInvoices, purchaseInvoices, receipts: [], payments: [], accountVouchers: [] };
const ledgerOf = (data) => buildGlobalLedger(data, { shopId: S, customers, vendors });
const arOf = (data, opts = {}) => overdueInterest(ledgerOf(data), { side: "customer", asOf: "2026-10-31", bills: data.salesInvoices, parties: customers, vouchers: data.accountVouchers, rate: 12, shopId: S, ...opts });

test("due date: the bill's own, else its credit days, else the party's Credit Days, else the bill date", () => {
  assert.equal(billDueDate({ invoiceDate: "2026-10-01", dueDate: "2026-10-20" }, { paymentTerms: 30 }), "2026-10-20");
  assert.equal(billDueDate({ invoiceDate: "2026-10-01", creditDays: 10 }, { paymentTerms: 30 }), "2026-10-11");
  assert.equal(billDueDate({ invoiceDate: "2026-10-01" }, { paymentTerms: 30 }), "2026-10-31");
  assert.equal(billDueDate({ invoiceDate: "2026-10-01" }, null), "2026-10-01");
});

test("1000 due 30 days ago at 12% a year, simple, actual/365", () => {
  const rep = arOf(base);
  const one = rep.rows.find((r) => r.billId === "SI-1");
  assert.equal(INTEREST_DAY_BASIS, 365);
  assert.deepEqual([one.dueDate, one.daysOverdue, one.interestDays, one.principal], ["2026-10-01", 30, 30, 1000]);
  assert.equal(one.interest, Math.round(1000 * 0.12 * 30 / 365 * 100) / 100);
  assert.equal(one.interest, 9.86);
  assert.equal(rep.rows.find((r) => r.billId === "SI-3").interest, 5.92, "300 x 12% x 60/365");
  assert.equal(rep.rows.some((r) => r.billId === "SI-2"), false, "Star's 30 credit days: due on 31 Oct, not overdue yet");
  assert.equal(rep.rows.some((r) => ["SI-D", "SI-X", "SI-P"].includes(r.billId)), false, "draft, cancelled and paid bills carry nothing");
  assert.deepEqual(rep.parties.map((p) => [p.party, p.bills, p.principal, p.interest]), [["Al Noor", 2, 1300, 15.78]]);
  assert.deepEqual(rep.totals, { bills: 2, principal: 1300, interest: 15.78 });
});

test("grace days: inside the grace nothing, after it interest counts from the end of the grace", () => {
  assert.equal(arOf(base, { graceDays: 30 }).rows.some((r) => r.billId === "SI-1"), false, "30 days late with 30 grace days");
  const r = arOf(base, { graceDays: 10 }).rows.find((x) => x.billId === "SI-1");
  assert.deepEqual([r.daysOverdue, r.interestDays, r.interest], [30, 20, 6.58]);
});

test("open amount follows the ageing: a receipt clears the oldest bill first", () => {
  const data = { ...base, receipts: [{ id: "R1", shopId: S, status: "confirmed", receiptNo: "R1", receiptDate: "2026-10-10", customerId: "c1", customerName: "Al Noor", method: "cash", totalAmount: 400 }] };
  const rep = arOf(data);
  assert.equal(rep.rows.some((r) => r.billId === "SI-3"), false, "the 300 bill is cleared");
  assert.equal(rep.rows.find((r) => r.billId === "SI-1").principal, 900);
  const aging = buildAging(ledgerOf(data).postings, ledgerOf(data).accounts, { side: "customer", asOf: "2026-10-31" });
  assert.equal(aging.rows.find((x) => x.name === "Al Noor").due, 900, "same open amount as the ageing");
});

test("posting: a balanced journal, P&L only on Interest Received, and no interest charged twice", () => {
  const rep = arOf(base);
  const j = interestJournal(rep, { side: "customer", asOf: "2026-10-31", rate: 12, shopId: S, uid: "u", by: "Owner", now: new Date("2026-10-31T10:00:00Z") });
  assert.deepEqual([j.id, j.doc.voucherNo, j.doc.source, j.total], ["int-ar-2026-10-31", "INT-AR-2026-10-31", "overdueInterest", 15.78]);
  const dr = j.doc.lines.reduce((t, l) => t + l.debit, 0), cr = j.doc.lines.reduce((t, l) => t + l.credit, 0);
  assert.equal(Math.round(dr * 100), Math.round(cr * 100));
  const voucher = { id: j.id, ...j.doc };
  const data = { ...base, accountVouchers: [voucher] };
  const ledger = ledgerOf(data);
  const balOf = (name) => balances(ledger.postings, "").get([...ledger.accounts.values()].find((a) => a.name === name)?.key) || 0;
  assert.equal(balOf("Al Noor"), 1315.78, "the customer owes the interest");
  assert.equal(balOf("Interest Received"), -15.78);
  assert.equal([...ledger.accounts.values()].find((a) => a.name === "Interest Received").group, "income");
  assert.deepEqual([...journalPlByAccount([voucher], S, "", "").entries()], [["Interest Received", -15.78]], "the customer line is not P&L");
  assert.equal(Math.abs(Math.round([...balances(ledger.postings, "").values()].reduce((t, v) => t + v, 0) * 100)), 0, "trial balance");

  assert.equal(postedInterest([voucher], { shopId: S, side: "customer" }).get("SI-1"), "2026-10-31");
  assert.equal(arOf(data).totals.interest, 0, "same date again: nothing new");
  const later = arOf(data, { asOf: "2026-11-30" });
  const one = later.rows.find((r) => r.billId === "SI-1");
  assert.deepEqual([one.from, one.interestDays, one.interest], ["2026-10-31", 30, 9.86], "only the days after the posted date");
  assert.equal(later.rows.some((r) => r.no === "INT-AR-2026-10-31"), false, "interest already charged carries no interest");
  assert.equal(arOf({ ...data, accountVouchers: [{ ...voucher, status: "cancelled" }] }).totals.interest, 15.78, "a cancelled posting is charged again");
});

test("suppliers: what the shop owes, from the bill's own due date", () => {
  const rep = overdueInterest(ledgerOf(base), { side: "vendor", asOf: "2026-10-31", bills: purchaseInvoices, parties: vendors, rate: 6, shopId: S });
  assert.deepEqual(rep.rows.map((r) => [r.no, r.dueDate, r.daysOverdue, r.interest]), [["PI-1", "2026-10-15", 16, 5.26]]);
  const j = interestJournal(rep, { side: "vendor", asOf: "2026-10-31", rate: 6, shopId: S });
  assert.deepEqual(j.doc.lines.map((l) => [l.account, l.debit, l.credit]), [["Interest Paid", 5.26, 0], ["Gulf", 0, 5.26]]);
});

test("settings, blockers and CSV", () => {
  assert.deepEqual(interestSettingsOf({}), { enabled: false, arRate: 0, apEnabled: false, apRate: 0, graceDays: 0 });
  assert.deepEqual(interestSettingsOf({ overdueInterest: { enabled: true, arRate: "18", graceDays: "7.4" } }).graceDays, 7);
  assert.equal(interestSettingsProblem({ enabled: true, arRate: 0 }), "rate");
  assert.equal(interestSettingsProblem({ enabled: true, arRate: 12, apEnabled: true, apRate: "" }), "apRate");
  assert.equal(interestSettingsProblem({ enabled: false }), "");

  const rep = arOf(base);
  const ids = (b) => b.map((x) => x.id);
  assert.deepEqual(ids(interestBlockers({ asOf: "2026-10-31", today: "2026-11-01", rep, parties: customers })), []);
  assert.deepEqual(ids(interestBlockers({ asOf: "2026-11-05", today: "2026-11-01", lockDate: "2026-11-30", rep, parties: customers })), ["future", "locked"]);
  assert.deepEqual(ids(interestBlockers({ asOf: "2026-10-31", rep, existing: { voucherNo: "INT-AR-2026-10-31" }, parties: [] })), ["done", "party"]);
  assert.deepEqual(ids(interestBlockers({ asOf: "2026-10-31", rep: { rows: [], totals: { interest: 0 } }, parties: customers })), ["nothing"]);

  const csv = interestRows(rep);
  assert.deepEqual(csv[0], ["Party", "Bill", "Bill date", "Due date", "Days overdue", "Interest days", "Open amount", "Interest"]);
  assert.deepEqual(csv[1], ["Al Noor", "SI-3", "2026-09-01", "2026-09-01", "60", "60", "300.00", "5.92"]);
  assert.deepEqual(csv[csv.length - 1], ["Total", "2 bill(s)", "", "", "", "", "1300.00", "15.78"]);
});
