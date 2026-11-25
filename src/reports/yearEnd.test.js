import test from "node:test";
import assert from "node:assert/strict";
import { buildGlobalLedger, balances } from "../ledger/globalLedger.js";
import { buildBalanceSheet } from "./balanceSheet.js";
import { buildTrialBalance } from "./trialBalance.js";
import { journalPlByAccount, journalPlTotal } from "./journalPl.js";
import { closedYearAt, closingBalances, yearEndChecks, yearEndDocIds, yearEndJournal, yearEndJournalId, yearEndRecord } from "./yearEnd.js";

const S = "s1";
const customers = [{ id: "c1", customerName: "Ali" }];
const vendors = [{ id: "v1", vendorName: "Gulf" }];
const base = () => ({
  partnerEntries: [{ id: "k", shopId: S, kind: "capitalIn", partnerId: "o", partnerName: "Owner", amount: 5000, method: "cash", date: "2025-01-01" }],
  salesInvoices: [{ id: "i1", shopId: S, invoiceNo: "SI-1", invoiceDate: "2025-06-10", status: "paid", customerId: "c1", grandTotal: 2100, totalVat: 100, amountPaid: 2100, paymentMethod: "cash" }],
  purchaseInvoices: [{ id: "p1", shopId: S, invoiceNo: "PI-1", invoiceDate: "2025-03-01", status: "confirmed", vendorId: "v1", grandTotal: 1050, totalTax: 50, amountPaid: 0 }],
  expenses: [{ id: "e1", shopId: S, expenseNo: "EX-1", expenseDate: "2025-08-01", amount: 300, method: "cash", category: "rent", categoryName: "Rent" }],
  accountVouchers: [],
  receipts: [], payments: [],
});
const opts = { shopId: S, customers, vendors, expenseLabel: (e) => e.categoryName };
const FY = { from: "2025-01-01", to: "2025-12-31" };

test("closing journal empties every income / expense account into Capital and balances", () => {
  const ledger = buildGlobalLedger(base(), opts);
  const { lines, net } = closingBalances(ledger, FY.to);
  assert.deepEqual(lines.map((l) => [l.name, l.balance]), [["Purchase", 1000], ["Rent", 300], ["Sales", -2000]]);
  assert.equal(net, -700, "profit 700 (credit)");
  const j = yearEndJournal({ ledger, fyStart: FY.from, fyEnd: FY.to, shopId: S, uid: "u" });
  assert.equal(j.id, yearEndJournalId(FY.to));
  assert.deepEqual([j.doc.voucherDate, j.doc.source, j.doc.voucherType, j.profit], [FY.to, "yearEnd", "journal", 700]);
  const dr = j.doc.lines.reduce((t, l) => t + l.debit, 0), cr = j.doc.lines.reduce((t, l) => t + l.credit, 0);
  assert.equal(dr, cr);
  assert.deepEqual(j.doc.lines.find((l) => l.account === "Capital"), { account: "Capital", debit: 0, credit: 700, note: "Profit for the year" });
  assert.equal(yearEndJournal({ ledger: buildGlobalLedger({ partnerEntries: base().partnerEntries }, opts), fyStart: FY.from, fyEnd: FY.to }), null, "nothing to close");
});

test("after closing: P&L accounts are zero, Capital holds the profit, TB balances, BS totals unchanged, P&L report unchanged", () => {
  const data = base();
  const before = buildGlobalLedger(data, opts);
  const j = yearEndJournal({ ledger: before, fyStart: FY.from, fyEnd: FY.to, shopId: S });
  const closedData = { ...data, accountVouchers: [{ id: j.id, ...j.doc }] };
  const after = buildGlobalLedger(closedData, opts);
  const bal = balances(after.postings, FY.to);
  const key = (n) => [...after.accounts.values()].find((a) => a.name === n)?.key;
  ["Sales", "Purchase", "Rent"].forEach((n) => assert.ok(Math.abs(bal.get(key(n)) || 0) < 0.005, n));
  assert.equal(bal.get(key("Capital")), -700);
  assert.equal(buildTrialBalance(after, { from: FY.from, to: FY.to }).difference, 0);
  // stock: started 0, 400 at the year end; the close keeps 400
  const stockEnd = 400;
  const sheetBefore = buildBalanceSheet({ accounts: before.accounts, bal: balances(before.postings, FY.to), closingStock: stockEnd, openingStock: 0 });
  const sheetAfter = buildBalanceSheet({ accounts: after.accounts, bal, closingStock: stockEnd, openingStock: 0, closedStock: stockEnd });
  assert.deepEqual([sheetAfter.totalAssets, sheetAfter.totalLiabilities, sheetAfter.totalEquity, sheetAfter.difference], [sheetBefore.totalAssets, sheetBefore.totalLiabilities, sheetBefore.totalEquity, 0]);
  const eq = sheetAfter.equity[0].lines;
  assert.equal(eq.some((l) => l.key === "profit"), false, "nothing left in profit to date on the year-end day");
  assert.equal(eq.find((l) => l.key === "closedStockGain").amount, 400);
  assert.equal(sheetBefore.equity[0].lines.find((l) => l.key === "profit").amount, 1100, "profit 700 + stock 400 before closing");
  // the next year: profit counts from the kept stock
  const next = buildBalanceSheet({ accounts: after.accounts, bal: balances(after.postings, "2026-06-30"), closingStock: 450, openingStock: 0, closedStock: stockEnd });
  assert.equal(next.equity[0].lines.find((l) => l.key === "profit").amount, 50);
  assert.equal(next.difference, 0);
  // the P&L report does not count the closing journal
  assert.equal(journalPlTotal(journalPlByAccount(closedData.accountVouchers, S, FY.from, FY.to)), 0);
  // the trial balance can show the year before closing
  const tbBefore = buildTrialBalance(after, { from: FY.from, to: FY.to, excludeDocIds: yearEndDocIds(closedData.accountVouchers, FY.from, FY.to) });
  assert.equal(tbBefore.accounts.find((a) => a.name === "Sales").closing, -2000);
  assert.equal(tbBefore.difference, 0);
  // without a close the balance sheet is exactly as before
  assert.deepEqual(buildBalanceSheet({ accounts: before.accounts, bal: balances(before.postings, FY.to), closingStock: stockEnd, openingStock: 0, closedStock: null }), sheetBefore);
});

test("close record and the latest live close; a cancelled closing journal does not count", () => {
  const rec = yearEndRecord({ fyStart: FY.from, fyEnd: FY.to, journalId: yearEndJournalId(FY.to), profit: 1100, stockValue: 400, uid: "u", by: "Owner", now: new Date("2026-01-05T00:00:00Z") });
  assert.deepEqual([rec.fyEnd, rec.stockValue, rec.target, rec.closedByName], [FY.to, 400, "Capital", "Owner"]);
  const live = [{ id: yearEndJournalId(FY.to), source: "yearEnd", status: "active", voucherDate: FY.to }];
  assert.equal(closedYearAt([rec], "2026-03-01", live).stockValue, 400);
  assert.equal(closedYearAt([rec], "2025-12-30", live), null, "before the year end");
  assert.equal(closedYearAt([rec], "2026-03-01", [{ ...live[0], status: "cancelled" }]), null);
  assert.equal(closedYearAt([rec], "2026-03-01", []), null, "journal not here");
  assert.deepEqual([...yearEndDocIds(live, "2025-01-01", "2025-12-31")], [yearEndJournalId(FY.to)]);
  assert.equal(yearEndDocIds(live, "2026-01-01", "").size, 0);
});

test("checks: future year, already closed, locked, nothing to close, earlier year open, red pack", () => {
  const j = { id: "x" };
  const ids = (list) => list.map((c) => [c.id, c.ok]);
  assert.deepEqual(ids(yearEndChecks({ fyEnd: "2026-12-31", today: "2026-11-25", journal: j })), [["future", false]]);
  assert.deepEqual(ids(yearEndChecks({ fyEnd: FY.to, today: "2026-11-25", journal: null, existing: { closedByName: "O" } })), [["closed", false]]);
  assert.deepEqual(ids(yearEndChecks({ fyEnd: FY.to, today: "2026-11-25", journal: j, lockDate: "2025-12-31" })), [["locked", false]]);
  assert.deepEqual(ids(yearEndChecks({ fyEnd: FY.to, today: "2026-11-25", journal: null })), [["nothing", false]]);
  assert.deepEqual(ids(yearEndChecks({ fyEnd: FY.to, today: "2026-11-25", journal: j, earlierOpen: "2024-12-31" })), [["earlier", true]]);
  assert.deepEqual(ids(yearEndChecks({ fyEnd: FY.to, today: "2026-11-25", journal: j, packStatus: "blocked" })), [["pack", false]]);
  assert.deepEqual(yearEndChecks({ fyEnd: FY.to, today: "2026-11-25", journal: j, lockDate: "2025-06-30" }), []);
});
