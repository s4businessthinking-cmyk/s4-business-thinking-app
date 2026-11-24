import test from "node:test";
import assert from "node:assert/strict";
import { buildGlobalLedger, balances } from "../ledger/globalLedger.js";
import {
  alignSides, buildBalanceSheet, excludedDocs, fyStartDate, moneyBreakdown, negativeStock, openingBsAsOf, openingStockValue, stockDocsUpTo,
} from "./balanceSheet.js";

const S = "s1";
const data = {
  salesInvoices: [
    { id: "si1", shopId: S, status: "partial", invoiceNo: "SI-1", invoiceDate: "2026-10-01", customerId: "c1", customerName: "Al Noor", grandTotal: 105, totalVat: 5, amountPaid: 90, paymentMethod: "cash" },
    { id: "si2", shopId: S, status: "confirmed", invoiceNo: "OB-1", invoiceDate: "2026-09-30", customerId: "c1", grandTotal: 50, totalVat: 0, amountPaid: 0, source: "openingBalance" },
    { id: "d1", shopId: S, status: "draft", invoiceNo: "SI-D", invoiceDate: "2026-10-01", customerId: "c1", grandTotal: 999 },
    { id: "x1", shopId: S, status: "cancelled", invoiceNo: "SI-X", invoiceDate: "2026-10-01", customerId: "c1", grandTotal: 999 },
    { id: "si3", shopId: S, status: "confirmed", invoiceNo: "SI-3", invoiceDate: "2026-11-15", customerId: "c2", customerName: "Star", grandTotal: 21, totalVat: 1, amountPaid: 50, paymentMethod: "cash" },
  ],
  purchaseInvoices: [
    { id: "pi1", shopId: S, status: "confirmed", invoiceNo: "PI-1", invoiceDate: "2026-10-02", vendorId: "v1", vendorName: "Gulf", grandTotal: 210, totalTax: 10, amountPaid: 0, paymentMethod: "credit" },
  ],
  payments: [{ id: "p1", shopId: S, status: "confirmed", paymentNo: "PV-1", paymentDate: "2026-10-06", vendorId: "v1", method: "bank_transfer", totalAmount: 100, allocations: [{ invoiceId: "pi1", amount: 100 }] }],
  expenses: [{ id: "e1", shopId: S, status: "active", expenseNo: "EX-1", expenseDate: "2026-10-03", category: "rent", amount: 105, vatAmount: 5, method: "cash" }],
  partnerEntries: [{ id: "pe1", shopId: S, kind: "capitalIn", partnerId: "pt1", partnerName: "Karim", amount: 1000, method: "cash", date: "2026-09-01" }],
  accountVouchers: [{ id: "j1", shopId: S, status: "active", voucherType: "journal", voucherNo: "JV-1", voucherDate: "2026-10-08", lines: [{ account: "Cash in Hand", debit: 500 }, { account: "Loan - Rahman", credit: 500 }] }],
};
const opts = { shopId: S, customers: [{ id: "c1", customerName: "Al Noor" }, { id: "c2", customerName: "Star" }], vendors: [{ id: "v1", vendorName: "Gulf" }], expenseLabel: () => "Rent" };
const ledger = buildGlobalLedger(data, opts);
const lineOf = (sheet, side, id) => sheet[side].find((s) => s.id === id);

test("assets equal liabilities plus equity with stock brought in", () => {
  const sheet = buildBalanceSheet({ accounts: ledger.accounts, bal: balances(ledger.postings, "2026-10-31"), closingStock: 300, openingStock: 120 });
  assert.equal(sheet.difference, 0);
  assert.equal(sheet.totalAssets, sheet.totalLiabilities + sheet.totalEquity);
  // cash: 1000 capital + 90 on bill + 500 loan - 105 rent; bank paid 100 to the supplier with nothing in it
  assert.deepEqual(lineOf(sheet, "assets", "cash").lines.map((l) => [l.name, l.amount]), [["Cash in Hand", 1485]]);
  assert.deepEqual(lineOf(sheet, "liabilities", "overdraft").lines.map((l) => [l.name, l.amount]), [["Bank", 100]]);
  assert.equal(lineOf(sheet, "assets", "stock").total, 300);
  assert.equal(lineOf(sheet, "assets", "receivable").total, 65);
  assert.equal(lineOf(sheet, "liabilities", "payable").total, 110);
  assert.equal(lineOf(sheet, "liabilities", "otherLiability").lines[0].name, "Loan - Rahman");
  // VAT: input 10 + 5 on rent, output 5
  assert.equal(lineOf(sheet, "assets", "vatRefundable").total, 10);
  // profit: sales 100 - purchase 200 - rent 100 + stock change 180
  assert.equal(sheet.profit, -20);
  const eq = Object.fromEntries(sheet.equity[0].lines.map((l) => [l.name, l.amount]));
  assert.equal(eq.Karim, 1000);
  assert.equal(eq["Opening stock"], 120);
  assert.equal(eq["Opening Balance"], 50);
});

test("as-of date drops later documents and splits credit balances to liabilities", () => {
  const oct = buildBalanceSheet({ accounts: ledger.accounts, bal: balances(ledger.postings, "2026-10-31") });
  assert.equal(lineOf(oct, "liabilities", "customerAdvance"), undefined);
  const nov = buildBalanceSheet({ accounts: ledger.accounts, bal: balances(ledger.postings, "2026-11-30") });
  assert.equal(nov.difference, 0);
  // Star paid 50 on a 21 bill: 29 advance
  assert.equal(lineOf(nov, "liabilities", "customerAdvance").total, 29);
  assert.equal(lineOf(nov, "liabilities", "vatPayable"), undefined);
});

test("drafts and cancelled are counted up to the date, not posted", () => {
  const ex = excludedDocs([["salesInvoices", data.salesInvoices]], S, "2026-10-31");
  assert.equal(ex.draft, 1);
  assert.equal(ex.cancelled, 1);
  assert.deepEqual(ex.list.map((d) => [d.no, d.status, d.amount]).sort(), [["SI-D", "draft", 999], ["SI-X", "cancelled", 999]]);
  assert.deepEqual(excludedDocs([["salesInvoices", data.salesInvoices]], S, "2026-09-30"), { draft: 0, cancelled: 0, list: [] });
  assert.equal(ledger.postings.some((p) => p.docId === "d1" || p.docId === "x1"), false);
});

test("stock documents are cut at the as-of date", () => {
  const rows = {
    salesInvoices: data.salesInvoices, purchaseInvoices: data.purchaseInvoices, deliveryNotes: [],
    extras: { stockAdjustments: [{ id: "a1", adjustDate: "2026-12-01" }, { id: "a2", adjustDate: "2026-10-01" }], warrantyClaims: [{ id: "w1", claimDate: "2026-09-01", replacedDate: "2026-12-05" }] },
  };
  const cut = stockDocsUpTo(rows, "2026-10-31");
  assert.deepEqual(cut.extras.stockAdjustments.map((a) => a.id), ["a2"]);
  assert.deepEqual(cut.extras.warrantyClaims, []);
  assert.equal(cut.salesInvoices.some((i) => i.id === "si3"), false);
  assert.equal(stockDocsUpTo(rows, "").salesInvoices.length, data.salesInvoices.length);
});

test("opening stock uses opening rate, then landing cost", () => {
  assert.equal(openingStockValue([{ openingStock: 2, openingRate: 10, landingCost: 99 }, { openingStock: 3, landingCost: 5 }, { openingStock: -1, openingRate: 7 }]), 35);
});

test("working capital equals assets minus liabilities", () => {
  const sheet = buildBalanceSheet({ accounts: ledger.accounts, bal: balances(ledger.postings, "2026-10-31"), closingStock: 300, openingStock: 120 });
  assert.equal(sheet.workingCapital, sheet.totalAssets - sheet.totalLiabilities);
});

test("FY start and Opening BS date follow fyStartMonth", () => {
  assert.equal(fyStartDate("2026-11-24", 1), "2026-01-01");
  assert.equal(openingBsAsOf("2026-11-24", 1), "2025-12-31");
  assert.equal(fyStartDate("2026-03-15", 4), "2025-04-01");
  assert.equal(openingBsAsOf("2026-03-15", 4), "2025-03-31");
  assert.equal(fyStartDate("2026-04-01", 4), "2026-04-01");
});

test("cash and bank: debit balance is an asset, credit balance is a liability", () => {
  const accounts = new Map([
    ["a:cash in hand", { key: "a:cash in hand", name: "Cash in Hand", group: "money" }],
    ["a:bank", { key: "a:bank", name: "Bank", group: "money" }],
    ["a:bank - adcb", { key: "a:bank - adcb", name: "Bank - ADCB", group: "money" }],
  ]);
  const bal = new Map([["a:cash in hand", 5000], ["a:bank", -1200], ["a:bank - adcb", 300]]);
  const sheet = buildBalanceSheet({ accounts, bal });
  assert.deepEqual(lineOf(sheet, "assets", "cash").lines.map((l) => [l.name, l.amount]), [["Bank - ADCB", 300], ["Cash in Hand", 5000]]);
  assert.deepEqual(lineOf(sheet, "liabilities", "overdraft").lines.map((l) => [l.name, l.amount]), [["Bank", 1200]]);
  const pos = buildBalanceSheet({ accounts, bal: new Map([["a:cash in hand", 10], ["a:bank", 20]]) });
  assert.equal(lineOf(pos, "liabilities", "overdraft"), undefined);
  assert.equal(lineOf(pos, "assets", "cash").total, 30);
});

test("money breakdown explains a cash account with no money put in", () => {
  const unfunded = buildGlobalLedger({
    purchaseInvoices: [{ id: "pi", shopId: S, status: "paid", invoiceNo: "PI-9", invoiceDate: "2026-10-02", vendorId: "v1", grandTotal: 300, totalTax: 0, amountPaid: 300, paymentMethod: "cash" }],
    salesInvoices: [{ id: "si", shopId: S, status: "paid", invoiceNo: "SI-9", invoiceDate: "2026-10-03", customerId: "c1", grandTotal: 100, totalVat: 0, amountPaid: 100, paymentMethod: "cash" }],
  }, opts);
  const [cash] = moneyBreakdown(unfunded.postings, unfunded.accounts, "").filter((m) => m.name === "Cash in Hand");
  assert.equal(cash.balance, -200);
  assert.equal(cash.funded, false);
  assert.deepEqual(cash.byType.map((t) => [t.type, t.dr, t.cr]), [["purchasePayment", 0, 300], ["saleReceipt", 100, 0]]);
  const sheet = buildBalanceSheet({ accounts: unfunded.accounts, bal: balances(unfunded.postings, "") });
  assert.equal(lineOf(sheet, "liabilities", "overdraft").lines[0].name, "Cash in Hand");
  assert.equal(sheet.difference, 0);
  const [funded] = moneyBreakdown(ledger.postings, ledger.accounts, "2026-10-31").filter((m) => m.name === "Cash in Hand");
  assert.equal(funded.funded, true);
});

test("journal capital and drawings go to equity, other journal accounts stay outside", () => {
  const j = buildGlobalLedger({ accountVouchers: [
    { id: "j1", shopId: S, status: "active", voucherType: "journal", voucherNo: "JV-1", voucherDate: "2026-10-01", lines: [{ account: "Cash in Hand", debit: 800 }, { account: "capital", credit: 800 }] },
    { id: "j2", shopId: S, status: "active", voucherType: "journal", voucherNo: "JV-2", voucherDate: "2026-10-02", lines: [{ account: "Owner Drawings", debit: 50 }, { account: "Cash in Hand", credit: 50 }] },
    { id: "j3", shopId: S, status: "active", voucherType: "journal", voucherNo: "JV-3", voucherDate: "2026-10-03", lines: [{ account: "Furniture", debit: 200 }, { account: "Cash in Hand", credit: 200 }] },
  ] }, opts);
  const sheet = buildBalanceSheet({ accounts: j.accounts, bal: balances(j.postings, "") });
  const eq = Object.fromEntries(sheet.equity[0].lines.map((l) => [l.name, l.amount]));
  assert.equal(eq.capital, 800);
  assert.equal(eq["Owner Drawings"], -50);
  assert.equal(lineOf(sheet, "assets", "otherAsset").lines[0].name, "Furniture");
  assert.equal(sheet.difference, 0);
});

test("negative stock list keeps code, name and quantity", () => {
  const list = negativeStock(new Map([["p1", -3], ["p2", 4], ["p3", -0.5], ["gone", -1]]), [{ id: "p1", code: "A1", name: "Filter" }, { id: "p3", barcode: "999", name: "Belt" }]);
  assert.deepEqual(list.map((p) => [p.code, p.name, p.qty]), [["A1", "Filter", -3], ["", "gone", -1], ["999", "Belt", -0.5]]);
});

test("compare keeps sections and lines that exist on only one date", () => {
  const oct = buildBalanceSheet({ accounts: ledger.accounts, bal: balances(ledger.postings, "2026-10-31") });
  const nov = buildBalanceSheet({ accounts: ledger.accounts, bal: balances(ledger.postings, "2026-11-30") });
  const adv = alignSides(oct, nov, "liabilities").find((s) => s.id === "customerAdvance");
  assert.equal(adv.total, 0);
  assert.equal(adv.then, 29);
  assert.deepEqual(adv.lines.map((l) => [l.name, l.amount, l.then]), [["Star", 0, 29]]);
  assert.equal(alignSides(oct, null, "assets").every((s) => s.then === null), true);
});
