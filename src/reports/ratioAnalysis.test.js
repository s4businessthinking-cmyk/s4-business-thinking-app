import test from "node:test";
import assert from "node:assert/strict";
import { buildRatios, periodDays, ratioRows, ratioText } from "./ratioAnalysis.js";
import { buildGlobalLedger, balances } from "../ledger/globalLedger.js";
import { buildBalanceSheet } from "./balanceSheet.js";

const S = "s1";
// November: capital 5000 in cash; bought 3000 on credit (supplier still owed 1200 after paying 1800);
// sold 4200 with VAT 200 (4000 net), customer owes 1050; rent 500 cash; stock 1000 on 31 Oct, 1800 on 30 Nov
const data = {
  partnerEntries: [{ id: "cap", shopId: S, kind: "capitalIn", partnerId: "k", partnerName: "Karim", amount: 5000, method: "cash", date: "2026-10-01" }],
  purchaseInvoices: [{ id: "PI-1", shopId: S, status: "partial", invoiceNo: "PI-1", invoiceDate: "2026-11-02", vendorId: "v1", vendorName: "Gulf", grandTotal: 3000, totalTax: 0, amountPaid: 1800, paymentMethod: "cash" }],
  salesInvoices: [{ id: "SI-1", shopId: S, status: "partial", invoiceNo: "SI-1", invoiceDate: "2026-11-10", customerId: "c1", customerName: "Al Noor", grandTotal: 4200, totalVat: 200, amountPaid: 3150, paymentMethod: "cash" }],
  expenses: [{ id: "E1", shopId: S, status: "active", expenseNo: "E1", expenseDate: "2026-11-15", amount: 500, vatAmount: 0, method: "cash", category: "rent" }],
};
const ledger = buildGlobalLedger(data, { shopId: S, customers: [{ id: "c1", customerName: "Al Noor" }], vendors: [{ id: "v1", vendorName: "Gulf" }], expenseLabel: () => "Rent" });
const sheetOn = (day, closingStock) => buildBalanceSheet({ accounts: ledger.accounts, bal: balances(ledger.postings, day), closingStock, openingStock: 0 });
const sheet = sheetOn("2026-11-30", 1800);
const openingSheet = sheetOn("2026-10-31", 1000);
// the P&L for November as computeAccounts gives it: net sales 4000, cost of goods sold 1000 + 3000 - 1800 = 2200
const pl = { netSales: 4000, grossProfit: 1800, netProfit: 1300, cogs: 2200, grossSales: 4200, salesReturnTotal: 0, grossPurch: 3000, purchReturnTotal: 0 };

test("period days count both ends", () => {
  assert.equal(periodDays("2026-11-01", "2026-11-30"), 30);
  assert.equal(periodDays("", "2026-11-30"), 0);
  assert.equal(periodDays("2026-12-01", "2026-11-30"), 0);
});

test("ratios match the hand calculation from the P&L and the Balance Sheet", () => {
  const rep = buildRatios({ pl, sheet, openingSheet, from: "2026-11-01", to: "2026-11-30" });
  const v = (id) => rep.ratios.find((r) => r.id === id).value;
  // Balance Sheet on 30 Nov: cash 5000 - 1800 + 3150 - 500 = 5850, debtors 1050, stock 1800 -> current assets 8700;
  // supplier 1200 + VAT payable 200 -> current liabilities 1400
  assert.deepEqual([rep.figures.currentAssets, rep.figures.currentLiabilities, rep.figures.receivable, rep.figures.payable, rep.figures.stock, rep.figures.openingStock], [8700, 1400, 1050, 1200, 1800, 1000]);
  assert.equal(sheet.difference, 0);
  assert.equal(v("grossMargin"), 45, "1800 / 4000");
  assert.equal(v("netMargin"), 32.5, "1300 / 4000");
  assert.equal(v("currentRatio"), 6.21, "8700 / 1400");
  assert.equal(v("quickRatio"), 4.93, "(8700 - 1800) / 1400");
  assert.equal(v("debtorDays"), 7.5, "1050 / 4200 x 30");
  assert.equal(v("creditorDays"), 12, "1200 / 3000 x 30");
  assert.equal(v("stockTurnover"), 1.57, "2200 / ((1000 + 1800) / 2)");
  assert.equal(v("stockDays"), 19.09, "30 / (2200 / 1400)");
  assert.equal(v("workingCapital"), 7300, "8700 - 1400");
  assert.deepEqual(rep.ratios.map((r) => ratioText(r)), ["45.0%", "32.5%", "6.21", "4.93", "8", "12", "1.57", "19", "AED 7300.00"]);
});

test("zero divisors show '-', never infinity", () => {
  const empty = buildRatios({ pl: { netSales: 0, grossProfit: 0, netProfit: 0, cogs: 0, grossSales: 0, grossPurch: 0 }, sheet: buildBalanceSheet({ accounts: new Map(), bal: new Map() }), from: "2026-11-01", to: "2026-11-30" });
  empty.ratios.filter((r) => r.unit !== "money").forEach((r) => { assert.equal(r.value, null, r.id); assert.equal(ratioText(r), "-"); });
  assert.equal(empty.ratios.find((r) => r.id === "workingCapital").value, 0);
  const noDays = buildRatios({ pl, sheet, openingSheet });
  assert.equal(noDays.ratios.find((r) => r.id === "debtorDays").value, null, "no period, no days ratio");
});

test("Excel rows are the screen values", () => {
  const rep = buildRatios({ pl, sheet, openingSheet, from: "2026-11-01", to: "2026-11-30" });
  const rows = ratioRows(rep);
  assert.deepEqual(rows[0], ["Ratio", "Value", "Formula", "Figure A", "Figure B", "Note"]);
  assert.deepEqual(rows.slice(1).map((r) => r[1]), rep.ratios.map((r) => ratioText(r)));
  assert.deepEqual(rows[1], ["Gross margin", "45.0%", "Gross profit / Net sales x 100", "1800.00", "4000.00", ""]);
});
