import test from "node:test";
import assert from "node:assert/strict";
import { buildGlobalLedger, balances } from "../ledger/globalLedger.js";
import { buildBalanceSheet } from "./balanceSheet.js";
import { accountBalances, buildTrialBalance, closingByKey, comparePeriod, trialBalanceFileName, trialBalanceRows } from "./trialBalance.js";

const S = "s1";
const customers = [{ id: "c1", customerName: "Ali" }];
const data = () => ({
  salesInvoices: [
    { id: "i1", shopId: S, invoiceNo: "SI-1", invoiceDate: "2026-10-20", status: "confirmed", customerId: "c1", grandTotal: 105, totalVat: 5, amountPaid: 0 },
    { id: "i2", shopId: S, invoiceNo: "SI-2", invoiceDate: "2026-11-05", status: "paid", customerId: "c1", grandTotal: 210, totalVat: 10, amountPaid: 210, paymentMethod: "cash" },
    { id: "i3", shopId: S, invoiceNo: "SI-3", invoiceDate: "2026-11-06", status: "cancelled", customerId: "c1", grandTotal: 999, totalVat: 0, amountPaid: 0 },
  ],
  accountVouchers: [
    { id: "j1", shopId: S, voucherType: "journal", voucherNo: "JV-1", voucherDate: "2026-11-10", totalAmount: 300, lines: [{ account: "Furniture", debit: 300 }, { account: "Cash in Hand", credit: 300 }] },
    { id: "j2", shopId: S, voucherType: "journal", voucherNo: "JV-2", voucherDate: "2026-12-02", totalAmount: 50, lines: [{ account: "Furniture", debit: 50 }, { account: "Cash in Hand", credit: 50 }] },
  ],
  partnerEntries: [{ id: "p", shopId: S, kind: "capitalIn", partnerId: "k", partnerName: "Karim", amount: 1000, method: "cash", date: "2026-10-01" }],
});
const ledgerOf = () => buildGlobalLedger(data(), { shopId: S, customers });
const chart = [{ id: "a1", name: "Furniture", code: "1510", groupId: "fur" }, { id: "a2", name: "Sales", groupId: "fa" }];
const coaGroups = [{ id: "fa", code: "1500", nameEn: "Fixed Assets", nature: "other" }, { id: "fur", nameEn: "Furniture & Fittings", nature: "other", parentId: "fa" }];

test("opening + period = closing per account; debits equal credits; cancelled left out", () => {
  const ledger = ledgerOf();
  const tb = buildTrialBalance(ledger, { from: "2026-11-01", to: "2026-11-30", chart, coaGroups });
  const get = (n) => tb.accounts.find((a) => a.name === n);
  assert.deepEqual([get("Ali").opening, get("Ali").dr, get("Ali").cr, get("Ali").closing], [105, 210, 210, 105]);
  assert.deepEqual([get("Cash in Hand").opening, get("Cash in Hand").closing], [1000, 910]);
  assert.equal(get("Furniture").closing, 300, "December journal is after the period");
  assert.equal(tb.difference, 0);
  assert.equal(tb.totals.dr, tb.totals.cr);
  assert.equal(tb.totals.openingDr, tb.totals.openingCr);
  tb.accounts.forEach((a) => assert.equal(a.closing, Math.round((a.opening + a.dr - a.cr) * 100) / 100, a.name));
  assert.equal(tb.accounts.some((a) => a.name.includes("999")), false);
  // closing equals the ledger's own balance to the end date
  const bal = balances(ledger.postings, "2026-11-30");
  tb.accounts.forEach((a) => assert.equal(a.closing, bal.get(a.key) || 0, a.name));
});

test("tree: ledger group > custom group > account; a wrong-nature group is ignored", () => {
  const tb = buildTrialBalance(ledgerOf(), { to: "2026-11-30", chart, coaGroups });
  const other = tb.sections.find((s) => s.id === "other");
  const fa = other.nodes.find((n) => n.type === "group");
  assert.equal(fa.group.nameEn, "Fixed Assets");
  const fur = fa.nodes[0];
  assert.deepEqual([fur.group.nameEn, fur.nodes[0].name, fur.nodes[0].code], ["Furniture & Fittings", "Furniture", "1510"]);
  assert.equal(fa.totals.closing, 300);
  const income = tb.sections.find((s) => s.id === "income");
  assert.ok(income.nodes.some((n) => n.type === "account" && n.name === "Sales"), "Sales stays in income, not under Fixed Assets");
  assert.equal(tb.sections.find((s) => s.id === "customer").nodes[0].name, "Ali");
  const noGroups = buildTrialBalance(ledgerOf(), { to: "2026-11-30" });
  assert.deepEqual(noGroups.totals, tb.totals, "groups change the layout only");
});

test("the trial balance matches the Balance Sheet and never changes postings", () => {
  const ledger = ledgerOf();
  const before = JSON.stringify(ledger.postings);
  const tb = buildTrialBalance(ledger, { to: "2026-12-31", chart, coaGroups, includeZero: true });
  assert.equal(JSON.stringify(ledger.postings), before);
  const sheet = buildBalanceSheet({ accounts: ledger.accounts, bal: balances(ledger.postings, "2026-12-31") });
  assert.equal(sheet.difference, 0);
  assert.equal(tb.difference, 0);
  assert.ok(accountBalances(ledger, { to: "2026-12-31" }).length >= tb.accounts.filter((a) => a.opening || a.dr || a.cr).length);
});

test("compare periods, CSV rows and file name", () => {
  assert.deepEqual(comparePeriod("2026-11-01", "2026-11-30", "previous"), { from: "2026-10-02", to: "2026-10-31" });
  assert.deepEqual(comparePeriod("2026-11-01", "2026-11-30", "lastYear"), { from: "2025-11-01", to: "2025-11-30" });
  assert.equal(comparePeriod("", "2026-11-30", "previous"), null);
  const ledger = ledgerOf();
  const tb = buildTrialBalance(ledger, { from: "2026-11-01", to: "2026-11-30", chart, coaGroups });
  const prev = buildTrialBalance(ledger, { from: "2026-10-01", to: "2026-10-31" });
  const rows = trialBalanceRows(tb, { compare: closingByKey(prev) });
  assert.deepEqual(rows[0].slice(-2), ["Compare closing", "Change"]);
  const cash = rows.find((r) => r[1].trim() === "Cash in Hand");
  assert.deepEqual([cash[3], cash[7], cash[9], cash[10]], ["1000.00", "910.00", "1000.00", "-90.00"]);
  const fur = rows.find((r) => r[1].trim() === "Furniture");
  assert.equal(fur[0], "3", "section 0 > Fixed Assets 1 > Furniture & Fittings 2 > account 3");
  const total = rows[rows.length - 1];
  assert.equal(total[1], "TOTAL");
  assert.equal(total[7], total[8]);
  assert.equal(trialBalanceRows(tb)[0].length, 9);
  assert.equal(trialBalanceFileName("2026-11-01", "2026-11-30"), "trial-balance-2026-11-01-2026-11-30.csv");
});
