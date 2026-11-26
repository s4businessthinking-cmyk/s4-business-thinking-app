import test from "node:test";
import assert from "node:assert/strict";
import { accountNatureOf, natureEditable, shopAccountNature } from "./accountNature.js";
import { buildGlobalLedger, balances } from "./globalLedger.js";
import { buildBalanceSheet } from "../reports/balanceSheet.js";
import { buildTrialBalance } from "../reports/trialBalance.js";
import { journalPlByAccount, journalPlTotal } from "../reports/journalPl.js";
import { normalizeChart } from "./chartOfAccounts.js";

const S = "s1";
const groups = [
  { id: "ox", code: "6100", nameEn: "Office Expenses", nameBn: "অফিস খরচ", nature: "expense" },
  { id: "dep", code: "1300", nameEn: "Deposits", nature: "asset" },
  { id: "loans", code: "2500", nameEn: "Loans", nature: "liability" },
  { id: "misc", nameEn: "Misc assets", nature: "asset" },
];
const chart = [
  { id: "a1", name: "Office Rent", groupId: "ox" },
  { id: "a2", name: "Shop Deposit", groupId: "dep" },
  { id: "a3", name: "Loan - Rahman", groupId: "loans" },
  // engine and bank accounts in a group of another nature keep their own
  { id: "a4", name: "Purchase", groupId: "misc" },
  { id: "a5", name: "Stock Adjustment", groupId: "misc" },
  { id: "a6", name: "Bank - ADCB", groupId: "misc" },
];
const jv = (id, day, lines) => ({ id, shopId: S, status: "active", voucherType: "journal", voucherNo: id, voucherDate: day, lines });
const data = {
  partnerEntries: [{ id: "p", shopId: S, kind: "capitalIn", partnerId: "k", partnerName: "Karim", amount: 5000, method: "cash", date: "2026-10-01" }],
  accountVouchers: [
    jv("JV-1", "2026-11-01", [{ account: "Office Rent", debit: 300 }, { account: "Cash in Hand", credit: 300 }]),
    jv("JV-2", "2026-11-02", [{ account: "Shop Deposit", debit: 1000 }, { account: "Cash in Hand", credit: 1000 }]),
    jv("JV-3", "2026-11-03", [{ account: "Cash in Hand", debit: 500 }, { account: "Loan - Rahman", credit: 500 }]),
    jv("JV-4", "2026-11-04", [{ account: "Bank - ADCB", debit: 200 }, { account: "Cash in Hand", credit: 200 }]),
  ],
};
const natureOf = accountNatureOf(chart, groups);
const groupOf = (ledger, name) => [...ledger.accounts.values()].find((a) => a.name === name)?.group;
const sheetOf = (ledger) => buildBalanceSheet({ accounts: ledger.accounts, bal: balances(ledger.postings, "") });
const lineOf = (sheet, side, name) => sheet[side].flatMap((s) => s.lines.map((l) => ({ ...l, section: s.id }))).find((l) => l.name === name);

test("nature comes only from a group the account is in; engine and bank accounts are never changed", () => {
  assert.equal(natureOf("Office Rent"), "expense");
  assert.equal(natureOf("office rent"), "expense", "names match as the ledger does, ignoring case");
  assert.equal(natureOf("Shop Deposit"), "asset");
  assert.equal(natureOf("Loan - Rahman"), "liability");
  assert.equal(natureOf("Purchase"), "", "a FIXED engine account keeps its nature");
  assert.equal(natureOf("Stock Adjustment"), "");
  assert.equal(natureOf("Bank - ADCB"), "", "a bank account stays cash & bank");
  assert.equal(natureOf("Furniture"), "", "an account with no group keeps the name rule");
  assert.deepEqual([natureEditable("Cash in Hand"), natureEditable("Warranty Replacement Stock"), natureEditable("Office Rent")], [false, false, true]);
  assert.equal(shopAccountNature({ chartOfAccounts: chart, coaGroups: groups })("Office Rent"), "expense");
  assert.equal(shopAccountNature(null)("Office Rent"), "");
});

test("the group's nature drives the ledger, the Trial Balance section and the Balance Sheet side", () => {
  const ledger = buildGlobalLedger(data, { shopId: S, natureOf });
  assert.deepEqual(["Office Rent", "Shop Deposit", "Loan - Rahman", "Purchase", "Bank - ADCB"].map((n) => groupOf(ledger, n)), ["expense", "asset", "liability", "expense", "money"]);
  const sheet = sheetOf(ledger);
  assert.equal(sheet.difference, 0);
  assert.equal(lineOf(sheet, "assets", "Shop Deposit").section, "otherAsset");
  assert.equal(lineOf(sheet, "liabilities", "Loan - Rahman").amount, 500);
  assert.equal(lineOf(sheet, "assets", "Office Rent"), undefined, "an expense is not an asset");
  assert.equal(sheet.profit, -300, "the expense is in profit to date");
  assert.equal(lineOf(sheet, "assets", "Bank - ADCB").section, "cash");

  const tb = buildTrialBalance(ledger, { chart, coaGroups: groups });
  const section = (id) => tb.sections.find((s) => s.id === id);
  const accountsIn = (sec) => { const out = []; const walk = (nodes) => nodes.forEach((n) => (n.type === "account" ? out.push(n.name) : walk(n.nodes))); walk(sec?.nodes || []); return out; };
  assert.ok(accountsIn(section("expense")).includes("Office Rent"));
  assert.deepEqual(accountsIn(section("asset")), ["Shop Deposit"]);
  assert.deepEqual(accountsIn(section("liability")), ["Loan - Rahman"]);
  assert.equal(section("expense").nodes.find((n) => n.type === "group")?.group.id, "ox", "under the shop's own group");
  assert.equal(tb.difference, 0);
});

test("journal P&L follows the same nature, so P&L and the Balance Sheet agree", () => {
  const withNature = journalPlByAccount(data.accountVouchers, S, "", "", natureOf);
  assert.deepEqual([...withNature.entries()], [["Office Rent", 300]], "deposit and loan stay off the P&L");
  assert.equal(-journalPlTotal(withNature), sheetOf(buildGlobalLedger(data, { shopId: S, natureOf })).profit);
});

test("no groups: ledger, Balance Sheet and journal P&L exactly as before", () => {
  const plain = buildGlobalLedger(data, { shopId: S });
  const same = buildGlobalLedger(data, { shopId: S, natureOf: accountNatureOf([], []) });
  assert.deepEqual(same.postings, plain.postings);
  assert.deepEqual([...same.accounts.values()].map((a) => a.group), [...plain.accounts.values()].map((a) => a.group));
  assert.equal(groupOf(plain, "Loan - Rahman"), "other");
  assert.deepEqual([...journalPlByAccount(data.accountVouchers, S, "", "").keys()], [...journalPlByAccount(data.accountVouchers, S, "", "", accountNatureOf([], [])).keys()]);
  assert.equal(sheetOf(plain).difference, 0);
});

test("changing a group's nature moves its accounts on every report; the sheet still balances", () => {
  const asAsset = accountNatureOf(chart, groups.map((g) => (g.id === "ox" ? { ...g, nature: "asset" } : g)));
  const ledger = buildGlobalLedger(data, { shopId: S, natureOf: asAsset });
  const sheet = sheetOf(ledger);
  assert.equal(groupOf(ledger, "Office Rent"), "asset");
  assert.equal(lineOf(sheet, "assets", "Office Rent").amount, 300);
  assert.equal(sheet.profit, 0);
  assert.equal(sheet.difference, 0);
  assert.equal(journalPlByAccount(data.accountVouchers, S, "", "", asAsset).size, 0);
});

test("the chart shows each account with the nature it posts with", () => {
  const rows = normalizeChart(chart, { expenseNames: ["Rent"], coaGroups: groups });
  const get = (n) => rows.find((a) => a.name === n);
  assert.deepEqual([get("Office Rent").group, get("Office Rent").baseGroup, get("Office Rent").groupId], ["expense", "other", "ox"]);
  assert.deepEqual([get("Loan - Rahman").group, get("Shop Deposit").group], ["liability", "asset"]);
  assert.deepEqual([get("Purchase").group, get("Purchase").groupId], ["expense", ""], "an engine account cannot sit in a group of another nature");
  assert.deepEqual([get("Bank - ADCB").group, get("Bank - ADCB").groupId], ["money", ""]);
  assert.equal(normalizeChart(chart, { expenseNames: ["Rent"] }).find((a) => a.name === "Office Rent").group, "other", "without groups, the name rule");
});
