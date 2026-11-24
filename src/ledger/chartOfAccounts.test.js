import test from "node:test";
import assert from "node:assert/strict";
import { buildGlobalLedger, balances } from "./globalLedger.js";
import { buildBalanceSheet } from "../reports/balanceSheet.js";
import { activeNames, canDelete, chartCsvRows, missingFromVouchers, moneyNames, normalizeChart, toSaved, usedNames, validateAccount } from "./chartOfAccounts.js";

const EXP = ["Rent", "Salary", "Bank Charges"];
const vouchers = [
  { id: "j1", voucherType: "journal", lines: [{ account: "Furniture", debit: 500 }, { account: "Cash in Hand", credit: 500 }] },
  { id: "c1", voucherType: "contra", fromAccount: "Cash in Hand", toAccount: "Bank - ADCB", lines: [{ account: "Bank - ADCB", debit: 100 }, { account: "Cash in Hand", credit: 100 }] },
  { id: "j2", voucherType: "journal", lines: [{ account: "Al Noor", debit: 10 }, { account: "Discount Allowed", credit: 10 }] },
];

test("seed: every system account and expense category, groups as the ledger gives them", () => {
  const chart = normalizeChart([], { expenseNames: EXP });
  const get = (n) => chart.find((a) => a.name === n);
  assert.equal(get("Cash in Hand").group, "money");
  assert.equal(get("Sales").group, "income");
  assert.equal(get("VAT Input").group, "tax");
  assert.equal(get("Capital").group, "equity");
  assert.equal(get("Rent").group, "expense");
  assert.equal(get("Bank Charges").group, "expense");
  assert.ok(chart.every((a) => a.system && a.active));
  assert.equal(chart.filter((a) => a.name === "Bank Charges").length, 1);
});

test("saved custom accounts keep their code and flag; system ones can't be switched off when essential", () => {
  const chart = normalizeChart([
    { id: "x1", name: "Furniture", code: "1500", active: true },
    { id: "x2", name: "Bank - ADCB", code: "1010" },
    { id: "x3", name: "Sales", code: "4000", active: false },
    { id: "x4", name: "Capital", active: false },
  ], { expenseNames: EXP });
  const get = (n) => chart.find((a) => a.name === n);
  assert.deepEqual([get("Furniture").group, get("Furniture").system, get("Furniture").code], ["other", false, "1500"]);
  assert.equal(get("Bank - ADCB").group, "money");
  assert.deepEqual([get("Sales").active, get("Sales").code], [true, "4000"]);
  assert.equal(get("Capital").active, false);
  assert.equal(activeNames(chart).includes("Capital"), false);
  assert.deepEqual(moneyNames(chart).sort(), ["Bank", "Bank - ADCB", "Cash in Hand"]);
  assert.deepEqual(Object.keys(toSaved(chart)[0]).sort(), ["active", "code", "createdAt", "id", "name", "updatedAt"]);
});

test("validation: duplicate, party name, system rename, used rename, essential off", () => {
  const chart = normalizeChart([{ id: "x1", name: "Furniture" }, { id: "x2", name: "Loan - Rahman" }], { expenseNames: EXP });
  const used = usedNames(vouchers);
  const opt = { used, partyNames: ["Al Noor"], expenseNames: EXP };
  assert.equal(validateAccount({ name: " furniture " }, chart, opt).error, "duplicate");
  assert.equal(validateAccount({ name: "cash in hand" }, chart, opt).error, "duplicate");
  assert.equal(validateAccount({ name: "Al Noor" }, chart, opt).error, "party");
  assert.equal(validateAccount({ name: "" }, chart, opt).error, "name");
  const sales = chart.find((a) => a.name === "Sales");
  assert.equal(validateAccount({ id: sales.id, name: "Revenue" }, chart, opt).error, "systemRename");
  assert.equal(validateAccount({ id: sales.id, name: "Sales", active: false }, chart, opt).error, "essential");
  assert.equal(validateAccount({ id: sales.id, name: "Sales", code: "4000" }, chart, opt).ok, true);
  assert.equal(validateAccount({ id: "x1", name: "Office Furniture" }, chart, opt).error, "usedRename");
  const ok = validateAccount({ id: "x2", name: "Loan - Rahim", code: "2100" }, chart, opt);
  assert.deepEqual([ok.ok, ok.account.name, ok.account.group], [true, "Loan - Rahim", "other"]);
  assert.equal(validateAccount({ name: "Bank - ENBD", code: "2100" }, normalizeChart([{ id: "x2", name: "Loan", code: "2100" }]), opt).error, "duplicateCode");
  assert.equal(validateAccount({ name: "Bank - ENBD" }, chart, opt).account.group, "money");
});

test("delete only unused custom accounts; migration picks up names from vouchers", () => {
  const chart = normalizeChart([{ id: "x1", name: "Furniture" }, { id: "x5", name: "Spare" }], { expenseNames: EXP });
  const used = usedNames(vouchers);
  assert.equal(canDelete(chart.find((a) => a.name === "Furniture"), used), false);
  assert.equal(canDelete(chart.find((a) => a.name === "Spare"), used), true);
  assert.equal(canDelete(chart.find((a) => a.name === "Rent"), used), false);
  const fresh = normalizeChart([], { expenseNames: EXP });
  assert.deepEqual(missingFromVouchers(fresh, vouchers, ["Al Noor"]).map((a) => [a.name, a.migrated]), [["Bank - ADCB", true], ["Furniture", true]]);
});

test("the chart never changes the ledger or the Balance Sheet", () => {
  const data = { accountVouchers: vouchers.map((v) => ({ ...v, shopId: "s1", status: "active", voucherDate: "2026-11-01", totalAmount: 500 })),
    partnerEntries: [{ id: "p", shopId: "s1", kind: "capitalIn", partnerId: "k", partnerName: "Karim", amount: 1000, method: "cash", date: "2026-10-01" }] };
  const opts = { shopId: "s1", customers: [{ id: "c1", customerName: "Al Noor" }] };
  const before = buildGlobalLedger(data, opts);
  normalizeChart(toSaved(normalizeChart([{ name: "Furniture", code: "1500" }], { expenseNames: EXP })), { expenseNames: EXP });
  const after = buildGlobalLedger(data, opts);
  assert.deepEqual(after.postings, before.postings);
  const sheet = buildBalanceSheet({ accounts: after.accounts, bal: balances(after.postings, "") });
  assert.equal(sheet.difference, 0);
  // the chart's group for a used name is the one the ledger gave it
  const chart = normalizeChart([{ name: "Furniture" }, { name: "Bank - ADCB" }], { expenseNames: EXP });
  [...after.accounts.values()].filter((a) => !a.partyId && !a.partnerId).forEach((a) => {
    const c = chart.find((x) => x.name === a.name);
    if (c) assert.equal(c.group, a.group, a.name);
  });
  assert.deepEqual(chartCsvRows(chart)[0], ["Code", "Name", "Group", "System", "Active"]);
});
