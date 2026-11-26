import test from "node:test";
import assert from "node:assert/strict";
import { buildGlobalLedger, balances } from "./globalLedger.js";
import { buildBalanceSheet } from "../reports/balanceSheet.js";
import { fundsFromSheet } from "../reports/fundsSummary.js";
import { chartCsvRows, normalizeChart, toSaved } from "./chartOfAccounts.js";
import { GROUP_NATURES, applyGroups, assignIssue, canDeleteGroup, groupPath, groupTree, groupsForAccount, normalizeGroups, toSavedGroups, validateGroup } from "./coaGroups.js";

const EXP = ["Rent", "Salary"];
const G = normalizeGroups([
  { id: "fa", code: "1500", nameEn: "Fixed Assets", nameBn: "স্থায়ী সম্পদ", nature: "other" },
  { id: "fur", code: "1510", nameEn: "Furniture & Fittings", nature: "other", parentId: "fa" },
  { id: "ind", nameEn: "Indirect Expenses", nature: "expense" },
  { id: "banks", nameEn: "Bank Accounts", nature: "money" },
  { id: "bad", nameEn: "Debtors", nature: "customer" },
  { id: "x", nameEn: "Wrong parent", nature: "expense", parentId: "fa" },
]);

test("groups: natures are the ledger's own (no parties), bad parents cleared, tree and path", () => {
  assert.deepEqual(GROUP_NATURES, ["money", "income", "expense", "tax", "equity", "asset", "liability", "other"]);
  assert.equal(G.some((g) => g.id === "bad"), false, "customer nature is not a CoA group");
  assert.equal(G.find((g) => g.id === "x").parentId, "", "a parent of another nature is cleared");
  assert.deepEqual(groupTree(G, "other").map((r) => [r.group.id, r.depth]), [["fa", 0], ["fur", 1]]);
  assert.equal(groupPath(G, "fur"), "Fixed Assets > Furniture & Fittings");
  assert.equal(groupPath(G, "fa", true), "স্থায়ী সম্পদ");
  const loop = normalizeGroups([{ id: "a", nameEn: "A", nature: "other", parentId: "b" }, { id: "b", nameEn: "B", nature: "other", parentId: "a" }]);
  assert.ok(loop.some((g) => g.parentId === ""), "a loop is broken");
});

test("a custom account may go into any group; engine and bank accounts only into a group of their own nature", () => {
  const chart = normalizeChart([{ id: "f", name: "Furniture" }, { id: "b2", name: "Bank - ADCB" }], { expenseNames: EXP });
  const get = (n) => chart.find((a) => a.name === n);
  assert.equal(assignIssue(get("Furniture"), "fur", G), "");
  assert.equal(assignIssue(get("Furniture"), "ind", G), "", "a custom account takes the group's nature");
  assert.equal(assignIssue(get("Cash in Hand"), "banks", G), "");
  assert.equal(assignIssue(get("Sales"), "fa", G), "nature", "Sales can't leave income");
  assert.equal(assignIssue(get("VAT Input"), "ind", G), "nature");
  assert.equal(assignIssue(get("Rent"), "ind", G), "");
  assert.equal(assignIssue(get("Rent"), "fa", G), "nature", "an expense category stays an expense");
  assert.equal(assignIssue(get("Bank - ADCB"), "fa", G), "nature", "a bank account stays cash & bank");
  assert.equal(assignIssue(get("Rent"), "missing", G), "group");
  assert.deepEqual(groupsForAccount(G, get("Bank - ADCB")).map((g) => g.id), ["banks"]);
  const placed = applyGroups(chart.map((a) => (a.name === "Furniture" ? { ...a, groupId: "fur" } : a.name === "Sales" ? { ...a, groupId: "fa" } : a)), G);
  assert.equal(placed.find((a) => a.name === "Furniture").groupId, "fur");
  assert.equal(placed.find((a) => a.name === "Sales").groupId, "", "a wrong-nature group is dropped");
  assert.deepEqual(toSaved(placed).find((a) => a.name === "Furniture").groupId, "fur");
  assert.equal("groupId" in toSaved(placed).find((a) => a.name === "Sales"), false);
  const rows = chartCsvRows(placed, (a) => groupPath(G, a.groupId));
  assert.deepEqual(rows[0], ["Code", "Name", "Group", "System", "Active", "Sub-group"]);
  assert.equal(rows.find((r) => r[1] === "Furniture")[5], "Fixed Assets > Furniture & Fittings");
  assert.deepEqual(chartCsvRows(placed)[0], ["Code", "Name", "Group", "System", "Active"]);
});

test("group rules: name, nature, parent, loop, depth, duplicate, code, nature lock, busy, delete", () => {
  const chart = applyGroups(normalizeChart([{ id: "f", name: "Furniture", groupId: "fur" }], { expenseNames: EXP }), G);
  assert.equal(validateGroup({ nameEn: "", nature: "other" }, G).error, "name");
  assert.equal(validateGroup({ nameEn: "Debtors", nature: "customer" }, G).error, "nature");
  assert.equal(validateGroup({ nameEn: "Office", nature: "expense", parentId: "fa" }, G).error, "parent");
  assert.equal(validateGroup({ id: "fa", nameEn: "Fixed Assets", nature: "other", parentId: "fur" }, G).error, "cycle");
  const deep = [...G, { id: "d3", nameEn: "Level 3", nature: "other", parentId: "fur", active: true }];
  assert.equal(validateGroup({ nameEn: "Level 4", nature: "other", parentId: "d3" }, deep).error, "depth");
  assert.equal(validateGroup({ nameEn: "furniture & fittings", nature: "other", parentId: "fa" }, G).error, "duplicate");
  assert.equal(validateGroup({ nameEn: "Furniture & Fittings", nature: "other" }, G).ok, true, "same name under another parent is fine");
  assert.equal(validateGroup({ nameEn: "Vehicles", nature: "other", parentId: "fa", code: "1510" }, G).error, "duplicateCode");
  const moveFur = validateGroup({ id: "fur", nameEn: "Furniture & Fittings", nature: "expense" }, G, chart);
  assert.deepEqual([moveFur.ok, moveFur.group.nature, moveFur.moved.map((a) => a.name), moveFur.cascade], [true, "expense", ["Furniture"], []], "custom accounts move with the group");
  const moveFa = validateGroup({ id: "fa", nameEn: "Fixed Assets", nature: "asset" }, G, chart);
  assert.deepEqual([moveFa.ok, moveFa.cascade, moveFa.moved.map((a) => a.name)], [true, ["fur"], ["Furniture"]], "sub-groups follow the parent's new nature");
  const withRent = applyGroups(normalizeChart([{ id: "r", name: "Rent", groupId: "ind" }], { expenseNames: EXP }), G);
  assert.equal(validateGroup({ id: "ind", nameEn: "Indirect Expenses", nature: "other" }, G, withRent).error, "natureLocked", "an expense category inside keeps the group's nature");
  assert.equal(validateGroup({ id: "fur", nameEn: "Furniture & Fittings", nature: "other", parentId: "fa", active: false }, G, chart).error, "busy");
  assert.equal(validateGroup({ id: "fa", nameEn: "Fixed Assets", nature: "other", active: false }, G, chart).error, "busy", "active sub-group inside");
  const ok = validateGroup({ nameEn: "Vehicles", nameBn: "গাড়ি", nature: "other", parentId: "fa", code: "1520" }, G);
  assert.deepEqual([ok.ok, ok.group.parentId, ok.group.nature], [true, "fa", "other"]);
  assert.equal(canDeleteGroup(G.find((g) => g.id === "fur"), G, chart), false);
  assert.equal(canDeleteGroup(G.find((g) => g.id === "fa"), G, chart), false, "has a sub-group");
  assert.equal(canDeleteGroup(G.find((g) => g.id === "ind"), G, chart), true);
  assert.deepEqual(Object.keys(toSavedGroups(G)[0]).sort(), ["active", "code", "createdAt", "id", "nameBn", "nameEn", "nature", "parentId", "updatedAt"]);
});

test("groups never change the ledger, the Balance Sheet or Funds", () => {
  const S = "s1";
  const data = {
    accountVouchers: [
      { id: "j1", shopId: S, voucherType: "journal", voucherNo: "JV-1", voucherDate: "2026-11-01", totalAmount: 500, lines: [{ account: "Furniture", debit: 500 }, { account: "Cash in Hand", credit: 500 }] },
      { id: "c1", shopId: S, voucherType: "contra", voucherNo: "CV-1", voucherDate: "2026-11-02", totalAmount: 100, fromAccount: "Cash in Hand", toAccount: "Bank - ADCB" },
    ],
    partnerEntries: [{ id: "p", shopId: S, kind: "capitalIn", partnerId: "k", partnerName: "Karim", amount: 2000, method: "cash", date: "2026-10-01" }],
    expenses: [{ id: "e1", shopId: S, expenseDate: "2026-11-03", amount: 50, method: "cash", category: "rent", categoryName: "Rent" }],
  };
  const sheetOf = () => {
    const ledger = buildGlobalLedger(data, { shopId: S, expenseLabel: (e) => e.categoryName });
    const sheet = buildBalanceSheet({ accounts: ledger.accounts, bal: balances(ledger.postings, "") });
    return { ledger, sheet, funds: fundsFromSheet(sheet) };
  };
  const before = sheetOf();
  const chart = applyGroups(normalizeChart([{ name: "Furniture", groupId: "fur" }, { name: "Bank - ADCB", groupId: "banks" }, { name: "Rent", groupId: "ind" }], { expenseNames: EXP }), G);
  toSavedGroups(G); toSaved(chart);
  const after = sheetOf();
  assert.deepEqual(after.ledger.postings, before.ledger.postings);
  assert.equal(after.sheet.difference, 0);
  assert.deepEqual([after.sheet.totalAssets, after.sheet.totalLiabilities, after.sheet.workingCapital], [before.sheet.totalAssets, before.sheet.totalLiabilities, before.sheet.workingCapital]);
  assert.deepEqual(after.funds, before.funds);
  // every grouped account sits in a group of the same nature the ledger gave it
  chart.filter((a) => a.groupId).forEach((a) => {
    const led = [...after.ledger.accounts.values()].find((x) => x.name === a.name);
    if (led) assert.equal(G.find((g) => g.id === a.groupId).nature, led.group, a.name);
  });
});
