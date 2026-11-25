import test from "node:test";
import assert from "node:assert/strict";
import { buildGlobalLedger, balances } from "../ledger/globalLedger.js";
import { buildTrialBalance } from "./trialBalance.js";
import { buildBalanceSheet } from "./balanceSheet.js";
import { valuation } from "./stockHub.js";
import { yearEndJournal } from "./yearEnd.js";
import { MAIN_BRANCH, branchColumns, branchData, branchOfDoc, groupCsvRows, groupPl, internalTransfers, stockByBranch } from "./groupView.js";

const S = "s1";
const branches = [{ id: "b1", name: "Sharjah branch", nameBn: "শারজাহ ব্রাঞ্চ" }];
const si = (id, branch, total, vat, extra = {}) => ({ id, shopId: S, invoiceNo: id, invoiceDate: "2026-11-05", status: "paid", grandTotal: total, totalVat: vat, amountPaid: total, paymentMethod: "cash", items: [{ productId: "p1", qty: 1 }], ...(branch ? { stockLocation: branch, stockLocationName: branch === "b1" ? "Sharjah branch" : branch } : {}), ...extra });
const data = {
  salesInvoices: [si("SI-1", "", 1050, 50), si("SI-2", "main", 210, 10), si("SI-3", "b1", 525, 25), si("SI-4", "b9", 105, 5)],
  purchaseInvoices: [
    { id: "PI-1", shopId: S, invoiceNo: "PI-1", invoiceDate: "2026-11-01", status: "confirmed", vendorName: "Gulf", grandTotal: 630, totalTax: 30, amountPaid: 630, paymentMethod: "cash", items: [{ productId: "p1", qty: 6, lineTotal: 600 }] },
    // goods sent to the branch: an internal transfer bill, never a purchase of the group
    { id: "BT-1", shopId: S, invoiceNo: "BT-1", invoiceDate: "2026-11-02", status: "confirmed", internalTransfer: true, sourceType: "branch_transfer", grandTotal: 300, totalTax: 0, items: [{ productId: "p1", qty: 3 }] },
  ],
  extras: { salesReturns: [{ id: "SR-1", shopId: S, returnNo: "SR-1", returnDate: "2026-11-06", status: "confirmed", invoiceId: "SI-3", partyName: "Walk-in", total: 105, totalVat: 5, items: [{ productId: "p1", qty: 1 }] }] },
  expenses: [{ id: "e1", shopId: S, expenseNo: "EXP-1", expenseDate: "2026-11-10", amount: 200, method: "cash", category: "rent", categoryName: "Rent" }],
  accountVouchers: [], receipts: [], payments: [],
};
data.salesReturns = data.extras.salesReturns;
const opts = { shopId: S, expenseLabel: (e) => e.categoryName };
const salesOf = (d) => { const l = buildGlobalLedger(d, opts); const k = [...l.accounts.values()].find((a) => a.name === "Sales")?.key; return -(balances(l.postings, "2026-11-30").get(k) || 0); };
const retOf = (d) => { const l = buildGlobalLedger(d, opts); const k = [...l.accounts.values()].find((a) => a.name === "Sales Return")?.key; return balances(l.postings, "2026-11-30").get(k) || 0; };

test("branch columns: main first, the master's branches, then any branch only seen on a bill", () => {
  assert.equal(branchOfDoc({}), MAIN_BRANCH);
  assert.equal(branchOfDoc({ stockLocation: "main" }), MAIN_BRANCH);
  assert.deepEqual(branchColumns(branches, data.salesInvoices).map((c) => [c.id, c.name]), [["main", "Main"], ["b1", "Sharjah branch"], ["b9", "b9"]]);
});

test("each branch's sales and returns add up to the group's, with no branch-level costs", () => {
  const ids = branchColumns(branches, data.salesInvoices).map((c) => c.id);
  const parts = ids.map((id) => branchData(data, id));
  assert.deepEqual(parts.map((p) => p.salesInvoices.map((s) => s.id)), [["SI-1", "SI-2"], ["SI-3"], ["SI-4"]]);
  assert.deepEqual(parts.map((p) => p.extras.salesReturns.map((r) => r.id)), [[], ["SR-1"], []], "a return follows its bill");
  assert.ok(parts.every((p) => !p.expenses.length && !p.accountVouchers.length && p.purchaseInvoices.length === 2), "purchases stay whole for the average cost");
  // the ledger agrees: branch Sales and Sales Return add up to the group's
  assert.equal(parts.reduce((t, p) => t + salesOf({ ...p, expenses: [] }), 0), salesOf(data));
  assert.equal(parts.reduce((t, p) => t + retOf(p), 0), retOf(data));
  assert.equal(salesOf(data), 1000 + 200 + 500 + 100);
});

test("group P&L: branch gross profit + shop level = group net profit; Excel rows", () => {
  // the figures computeAccounts() gives for each column and for the whole shop
  const pl = (o) => ({ count: 1, salesReturnCount: 0, grossSales: 0, salesReturnTotal: 0, vatOut: 0, netSales: 0, cogs: 0, grossProfit: 0, ...o });
  const columns = [
    { id: "main", name: "Main", pl: pl({ count: 2, grossSales: 1260, vatOut: 60, netSales: 1200, cogs: 200, grossProfit: 1000 }) },
    { id: "b1", name: "Sharjah branch", pl: pl({ grossSales: 525, salesReturnTotal: 105, vatOut: 20, netSales: 400, cogs: 0, grossProfit: 400 }) },
  ];
  const group = pl({ count: 3, grossSales: 1785, salesReturnTotal: 105, vatOut: 80, netSales: 1600, cogs: 200, grossProfit: 1400, vendorDiscount: 10, expenseTotal: 200, expenseByCat: [["Rent", 200]], netProfit: 1210 });
  const view = groupPl(columns, group);
  assert.equal(view.difference, 0);
  assert.deepEqual([view.columns[0].margin, view.columns[1].margin, view.group.margin], [83.33, 100, 87.5]);
  assert.equal(view.shopLevel.net, -190, "10 discount - 200 expenses");
  assert.equal(r2(view.columns.reduce((t, c) => t + c.grossProfit, 0) + view.shopLevel.net), group.netProfit);
  const rows = groupCsvRows(view);
  assert.deepEqual(rows.at(-1), ["Net profit", "1000.00", "400.00", "-190.00", "1210.00"]);
  assert.deepEqual(rows.find((r) => r[0] === "Net sales"), ["Net sales", "1200.00", "400.00", "", "1600.00"]);
  // a sale missing from the columns shows as a difference
  assert.equal(groupPl(columns.slice(0, 1), group).difference, 400);
});

test("stock by branch adds up to the shop's stock value; transfers stay out of the books", () => {
  const shopQty = new Map([["p1", 10], ["p2", 4]]);
  const cost = new Map([["p1", 100], ["p2", 50]]);
  const rows = [{ branchId: "b1", productId: "p1", current: 3 }, { branchId: "b1", productId: "p2", current: -1 }];
  const st = stockByBranch(branchColumns(branches, []), rows, shopQty, cost);
  assert.deepEqual(st.map((x) => [x.id, x.qty, x.value]), [["main", 11, 900], ["b1", 3, 300]]);
  // a branch below zero is not valued and does not add to the main shop - same rule as the Stock Hub
  assert.equal(st.reduce((t, x) => t + x.value, 0), valuation([{ id: "p1" }, { id: "p2" }], shopQty, cost).total);
  // internal transfers: memo only
  const tr = [
    { id: "t1", shopId: S, status: "received", dispatchedAt: "2026-11-02T08:00:00.000Z", items: [{ quantity: 3, unitCost: 100, lineTotal: 300 }] },
    { id: "t2", shopId: S, status: "draft", createdAt: "2026-11-03T08:00:00.000Z", items: [{ quantity: 1, unitCost: 100 }] },
    { id: "t3", shopId: S, status: "in_transit", dispatchedAt: { seconds: Date.UTC(2026, 9, 30) / 1000 }, items: [{ quantity: 2, unitCost: 50 }] },
  ];
  assert.deepEqual(internalTransfers(tr, { from: "2026-11-01", to: "2026-11-30", shopId: S }), { count: 1, value: 300 });
  assert.deepEqual(internalTransfers(tr, {}), { count: 2, value: 400 });
  const withBt = buildGlobalLedger(data, opts), without = buildGlobalLedger({ ...data, purchaseInvoices: data.purchaseInvoices.filter((p) => !p.internalTransfer) }, opts);
  assert.deepEqual(withBt.postings, without.postings);
  // the group books: TB and BS balance, year-end closes the whole group
  assert.equal(buildTrialBalance(withBt, { to: "2026-11-30" }).difference, 0);
  const capital = [{ id: "k", shopId: S, kind: "capitalIn", partnerId: "o", partnerName: "Owner", amount: 1000, method: "cash", date: "2026-10-01" }];
  const l = buildGlobalLedger({ ...data, partnerEntries: capital }, opts);
  assert.equal(buildBalanceSheet({ accounts: l.accounts, bal: balances(l.postings, "2026-11-30"), closingStock: 1200, openingStock: 0 }).difference, 0);
  const ye = yearEndJournal({ ledger: l, fyStart: "2026-01-01", fyEnd: "2026-12-31", shopId: S });
  assert.ok(ye.doc.lines.some((l2) => l2.account === "Sales" && l2.debit === 1800));
});

function r2(v) { return Math.round(v * 100) / 100; }
