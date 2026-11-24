import test from "node:test";
import assert from "node:assert/strict";
import { buildGlobalLedger, balances } from "../ledger/globalLedger.js";
import { buildCashBook } from "./booksHub.js";
import { buildCashFlow, periodUnit } from "./cashFlow.js";

const S = "s1";
const data = {
  partnerEntries: [{ id: "pe1", shopId: S, kind: "capitalIn", partnerId: "pt1", partnerName: "Karim", amount: 1000, method: "cash", date: "2026-09-01" }],
  salesInvoices: [
    { id: "si1", shopId: S, status: "partial", invoiceNo: "SI-1", invoiceDate: "2026-10-01", customerId: "c1", grandTotal: 105, totalVat: 5, amountPaid: 90, paymentMethod: "cash" },
    { id: "d1", shopId: S, status: "draft", invoiceNo: "SI-D", invoiceDate: "2026-10-01", customerId: "c1", grandTotal: 999, amountPaid: 999, paymentMethod: "cash" },
    { id: "x1", shopId: S, status: "cancelled", invoiceNo: "SI-X", invoiceDate: "2026-10-01", customerId: "c1", grandTotal: 999, amountPaid: 999, paymentMethod: "cash" },
  ],
  receipts: [{ id: "r1", shopId: S, status: "confirmed", receiptNo: "RV-1", receiptDate: "2026-10-05", customerId: "c1", method: "cheque", totalAmount: 15 }],
  purchaseInvoices: [{ id: "pi1", shopId: S, status: "confirmed", invoiceNo: "PI-1", invoiceDate: "2026-10-02", vendorId: "v1", grandTotal: 210, totalTax: 10, amountPaid: 0, paymentMethod: "credit" }],
  payments: [{ id: "p1", shopId: S, status: "confirmed", paymentNo: "PV-1", paymentDate: "2026-10-06", vendorId: "v1", method: "cash", totalAmount: 200 }],
  expenses: [{ id: "e1", shopId: S, status: "active", expenseNo: "EX-1", expenseDate: "2026-11-03", category: "rent", amount: 105, vatAmount: 5, method: "bank_transfer" }],
  accountVouchers: [{ id: "cv1", shopId: S, status: "active", voucherType: "contra", voucherNo: "CV-1", voucherDate: "2026-10-09", lines: [{ account: "Bank", debit: 300 }, { account: "Cash in Hand", credit: 300 }] }],
};
const opts = { shopId: S, customers: [{ id: "c1", customerName: "Al Noor" }], vendors: [{ id: "v1", vendorName: "Gulf" }], expenseLabel: () => "Rent" };
const { postings, accounts } = buildGlobalLedger(data, opts);
const key = (name) => [...accounts.values()].find((a) => a.name === name).key;

test("all accounts: opening + in - out = closing, transfers left out of in / out", () => {
  const cf = buildCashFlow(postings, accounts, { from: "2026-10-01", to: "2026-10-31" });
  assert.equal(cf.opening, 1000);
  // in: 90 on bill (cash) + 15 receipt (bank); out: 200 supplier payment (cash)
  assert.equal(cf.totalIn, 105);
  assert.equal(cf.totalOut, 200);
  assert.equal(cf.net, -95);
  assert.equal(cf.transfers, 300);
  assert.equal(cf.closing, 905);
  const bal = balances(postings, "2026-10-31");
  assert.equal(cf.closing, bal.get(key("Cash in Hand")) + bal.get(key("Bank")));
  assert.deepEqual(cf.byAccount.map((a) => [a.name, a.opening, a.in, a.out, a.closing]), [["Bank", 0, 315, 0, 315], ["Cash in Hand", 1000, 90, 500, 590]]);
});

test("one account: matches the Cash Book and counts the contra as money out", () => {
  const range = { from: "2026-10-01", to: "2026-10-31" };
  const cf = buildCashFlow(postings, accounts, { ...range, accountKey: key("Cash in Hand") });
  const book = buildCashBook(postings, accounts, range);
  assert.equal(cf.opening, book.opening);
  assert.equal(cf.totalIn, book.dr);
  assert.equal(cf.totalOut, book.cr);
  assert.equal(cf.closing, book.closing);
  assert.equal(cf.transfers, 0);
  assert.deepEqual(cf.byType.find((t) => t.type === "contra"), { type: "contra", activity: "other", in: 0, out: 300 });
});

test("types group into operating / owner / other", () => {
  const cf = buildCashFlow(postings, accounts, {});
  const act = Object.fromEntries(cf.byActivity.map((a) => [a.id, [a.in, a.out]]));
  assert.deepEqual(act.operating, [105, 305]);
  assert.deepEqual(act.owner, [1000, 0]);
  assert.deepEqual(act.other, [0, 0]);
  assert.equal(cf.opening, 0);
  assert.equal(cf.closing, 800);
});

test("drafts and cancelled bills never reach cash flow", () => {
  const cf = buildCashFlow(postings, accounts, { from: "2026-10-01", to: "2026-10-01" });
  assert.equal(cf.totalIn, 90);
});

test("period rows run a closing balance by day or month", () => {
  const cf = buildCashFlow(postings, accounts, { from: "2026-10-01", to: "2026-10-31" });
  assert.equal(cf.unit, "day");
  assert.deepEqual(cf.byPeriod.map((r) => [r.period, r.net, r.closing]), [["2026-10-01", 90, 1090], ["2026-10-05", 15, 1105], ["2026-10-06", -200, 905]]);
  const all = buildCashFlow(postings, accounts, { to: "2026-11-30" });
  assert.equal(all.unit, "month");
  assert.deepEqual(all.byPeriod.map((r) => [r.period, r.net, r.closing]), [["2026-09", 1000, 1000], ["2026-10", -95, 905], ["2026-11", -105, 800]]);
  assert.equal(periodUnit("2026-01-01", "2026-12-31"), "month");
  assert.equal(periodUnit("", ""), "month");
});
