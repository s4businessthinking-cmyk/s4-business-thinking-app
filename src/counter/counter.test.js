import test from "node:test";
import assert from "node:assert/strict";
import { buildGlobalLedger, balances } from "../ledger/globalLedger.js";
import { closeShiftPatch, isoOf, openShiftDoc, openShifts, shiftCash, shiftCsvRows, shiftSummary } from "./counterShift.js";
import { loyaltyBalances, memberCsvRows, memberNoIssue, normalizeLoyalty, rateOn, withRate } from "./loyalty.js";
import { billSnapshot, displayHtml } from "./customerDisplay.js";

const S = "s1";
const data = () => ({
  salesInvoices: [
    { id: "i1", shopId: S, invoiceNo: "SI-1", invoiceDate: "2026-11-20", status: "paid", customerId: "c1", grandTotal: 210, totalVat: 10, amountPaid: 210, paymentMethod: "cash", stockLocation: "b1", createdAt: "2026-11-20T09:10:00.000Z" },
    { id: "i2", shopId: S, invoiceNo: "SI-2", invoiceDate: "2026-11-20", status: "paid", customerId: "c2", grandTotal: 105, totalVat: 5, amountPaid: 105, paymentMethod: "card", createdAt: "2026-11-20T09:20:00.000Z" },
    { id: "i3", shopId: S, invoiceNo: "SI-3", invoiceDate: "2026-11-20", status: "cancelled", customerId: "c1", grandTotal: 999, totalVat: 0, amountPaid: 999, paymentMethod: "cash", createdAt: "2026-11-20T09:30:00.000Z" },
    { id: "i4", shopId: S, invoiceNo: "SI-4", invoiceDate: "2026-11-20", status: "paid", customerId: "c1", grandTotal: 50, totalVat: 0, amountPaid: 50, paymentMethod: "cash", createdAt: "2026-11-20T15:00:00.000Z" },
    { id: "i5", shopId: S, invoiceNo: "SI-5", invoiceDate: "2026-11-21", status: "draft", customerId: "c1", grandTotal: 400, totalVat: 0, createdAt: "2026-11-21T10:00:00.000Z" },
    { id: "o1", shopId: S, invoiceNo: "OB-1", invoiceDate: "2026-01-01", status: "confirmed", source: "openingBalance", customerId: "c1", grandTotal: 1000, createdAt: "2026-11-20T09:00:00.000Z" },
  ],
  receipts: [{ id: "r1", shopId: S, receiptNo: "RV-1", receiptDate: "2026-11-20", customerId: "c2", method: "cash", totalAmount: 30, createdAt: "2026-11-20T10:00:00.000Z" }],
  expenses: [{ id: "e1", shopId: S, expenseNo: "EX-1", expenseDate: "2026-11-20", amount: 20, method: "cash", category: "Tea", createdAt: "2026-11-20T11:00:00.000Z" }],
  salesReturns: [{ id: "sr1", shopId: S, returnNo: "SR-1", returnDate: "2026-11-22", invoiceId: "i1", total: 52.5, totalVat: 2.5, status: "confirmed" }],
});
const customers = [
  { id: "c1", customerName: "Ali", loyaltyMember: true, loyaltyNo: "M-001", loyaltySince: "2026-11-01" },
  { id: "c2", customerName: "Sara", loyaltyMember: false, loyaltyNo: "" },
];

test("shift cash: only Cash in Hand postings saved inside the shift; card and cancelled left out", () => {
  const d = data();
  const ledger = buildGlobalLedger(d, { shopId: S, customers });
  const cash = shiftCash(ledger, d, "2026-11-20T09:00:00.000Z", "2026-11-20T12:00:00.000Z");
  assert.deepEqual([cash.cashIn, cash.cashOut, cash.net], [240, 20, 220]);
  const ledgerSplit = buildGlobalLedger(d, { shopId: S, customers, branches: [{ id: "b1", name: "Branch 1" }], branchCashSplit: true });
  const branchOnly = shiftCash(ledgerSplit, d, "2026-11-20T09:00:00.000Z", "2026-11-20T12:00:00.000Z", "b1", "Branch 1");
  assert.deepEqual([branchOnly.cashIn, branchOnly.cashOut], [210, 0]);
  assert.deepEqual(cash.lines.map((l) => l.no), ["SI-1", "RV-1", "EX-1"]);
  assert.equal(shiftCash(ledger, d, "2026-11-20T12:00:00.000Z", "").cashIn, 50);
  const before = JSON.stringify(ledger.postings);
  shiftCash(ledger, d, "", "");
  assert.equal(JSON.stringify(ledger.postings), before);
  assert.ok([...balances(ledger.postings)].length > 0);
});

test("open / close: one open shift, amounts checked, expected and difference frozen at close", () => {
  const who = { shopId: S, uid: "u1", name: "Cashier", now: new Date("2026-11-20T09:00:00.000Z") };
  assert.equal(openShiftDoc({ openingCash: "abc" }, [], who).error, "amount");
  assert.equal(openShiftDoc({ openingCash: "-5" }, [], who).error, "amount");
  const opened = openShiftDoc({ openingCash: "100", counter: " Front " }, [], who);
  assert.deepEqual([opened.doc.status, opened.doc.openingCash, opened.doc.counter, opened.doc.openedBy, opened.doc.openedAt], ["open", 100, "Front", "u1", "2026-11-20T09:00:00.000Z"]);
  const shift = { id: "sh1", ...opened.doc };
  assert.equal(openShiftDoc({ openingCash: "0" }, [shift], who).error, "open");
  assert.equal(openShifts([shift, { ...shift, id: "x", shopId: "other" }], S).length, 1);
  const br2 = { ...shift, id: "sh2", branchId: "b2", branchName: "Branch 2" };
  assert.equal(openShifts([shift, br2], S).length, 2);
  assert.equal(openShifts([shift, br2], S, "b2").length, 1);
  assert.ok(openShiftDoc({ openingCash: "0", branchId: "b2" }, [shift], who).ok);
  assert.equal(openShiftDoc({ openingCash: "0", branchId: "b2" }, [shift, br2], who).error, "open");
  const live = shiftSummary(shift, { cashIn: 240, cashOut: 20 });
  assert.deepEqual([live.expected, live.difference], [320, null]);
  assert.equal(closeShiftPatch(shift, { cashIn: 240, cashOut: 20 }, { closingCash: "" }, who).error, "amount");
  const closed = closeShiftPatch(shift, { cashIn: 240, cashOut: 20 }, { closingCash: "315", note: " short " }, { ...who, now: new Date("2026-11-20T12:00:00.000Z") });
  assert.deepEqual([closed.patch.expectedCash, closed.patch.difference, closed.patch.note, closed.patch.status], [320, -5, "short", "closed"]);
  const done = { ...shift, ...closed.patch };
  assert.equal(closeShiftPatch(done, {}, { closingCash: "1" }, who).error, "closed");
  assert.deepEqual(shiftSummary(done, { cashIn: 999, cashOut: 0 }).expected, 320);
  const rows = shiftCsvRows([done, shift]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1].slice(3, 7), ["100.00", "240.00", "20.00", "320.00"]);
  assert.equal(isoOf({ seconds: 0 }), "1970-01-01T00:00:00.000Z");
  assert.equal(isoOf("not a date"), "");
});

test("loyalty: rule by date, members only, returns and cancelled take points back, opening bill and draft never earn", () => {
  assert.deepEqual(normalizeLoyalty({ enabled: true, rates: [{ from: "2026-12-01", per: 5 }, { from: "bad", per: 1 }, { from: "2026-11-01", per: 10 }] }).rates.map((r) => r.from), ["2026-11-01", "2026-12-01"]);
  assert.equal(normalizeLoyalty({ enabled: true, rates: [] }).enabled, false);
  const settings = normalizeLoyalty({ enabled: true, rates: [{ from: "2026-11-01", per: 10 }] });
  assert.equal(rateOn(settings, "2026-10-31"), 0);
  assert.equal(rateOn(settings, "2026-11-20"), 10);
  const d = data();
  const bal = loyaltyBalances({ customers, salesInvoices: d.salesInvoices, salesReturns: d.salesReturns, settings, shopId: S });
  // SI-1: 200 net - 50 returned = 150 -> 15; SI-4: 50 -> 5; SI-3 cancelled, SI-5 draft, OB-1 opening: nothing
  assert.deepEqual(bal.get("c1"), { points: 20, bills: 2, net: 200, lastDay: "2026-11-20" });
  assert.equal(bal.has("c2"), false, "not a member");
  const later = loyaltyBalances({ customers: [{ ...customers[0], loyaltySince: "2026-11-21" }], salesInvoices: d.salesInvoices, settings, shopId: S });
  assert.equal(later.get("c1").points, 0, "bills before joining do not earn");
  assert.equal(loyaltyBalances({ customers, salesInvoices: d.salesInvoices, settings: { enabled: false, rates: settings.rates } }).size, 0);
  const changed = withRate(settings, "20", "2026-11-20");
  assert.deepEqual(changed.settings.rates.map((r) => [r.from, r.per]), [["2026-11-01", 10], ["2026-11-20", 20]]);
  assert.equal(loyaltyBalances({ customers, salesInvoices: d.salesInvoices, salesReturns: d.salesReturns, settings: changed.settings, shopId: S }).get("c1").points, 9);
  assert.equal(withRate(settings, "0", "2026-11-20").error, "rate");
  assert.equal(withRate(settings, "5", "").error, "date");
  assert.equal(memberNoIssue("m-001", customers, "c9"), "duplicate");
  assert.equal(memberNoIssue("M-001", customers, "c1"), "");
  assert.equal(memberNoIssue(" ", customers), "required");
  assert.deepEqual(memberCsvRows(customers, bal)[1], ["M-001", "Ali", "", "2026-11-01", "2", "200.00", "20", "2026-11-20"]);
});

test("customer display page: escaped text, totals, idle screen, last bill snapshot", () => {
  const html = displayHtml({ shopName: "S4 <Parts>", cur: "AED", mode: "live", title: "Bill", customer: "Ali & Sons", lines: [{ name: "Oil <5W>", qty: 2, amount: 42 }], vat: 2, total: 42 });
  assert.ok(html.includes("S4 &lt;Parts&gt;"));
  assert.ok(html.includes("Ali &amp; Sons"));
  assert.ok(html.includes("Oil &lt;5W&gt;"));
  assert.ok(html.includes("AED 42.00"));
  assert.equal(html.includes("<5W>"), false);
  assert.ok(displayHtml({ shopName: "S4", mode: "idle", welcome: "Welcome" }).includes("class=\"idle\""));
  const many = displayHtml({ shopName: "S4", lines: Array.from({ length: 15 }, (_, i) => ({ name: `P${i}`, qty: 1, amount: 1 })), total: 15 });
  assert.ok(many.includes("+ 3 more item(s)"));
  const snap = billSnapshot({ invoiceNo: "SI-9", customerName: "Ali", items: [{ name: "Filter", qty: 1, total: 10 }], totalVat: 0.5, grandTotal: 10.5, amountPaid: 10.5 }, { shopName: "S4", lineAmount: () => 10.5 });
  assert.deepEqual([snap.mode, snap.no, snap.lines[0].amount, snap.total], ["last", "SI-9", 10.5, 10.5]);
});
