import test from "node:test";
import assert from "node:assert/strict";
import {
  activeCostCentres, buildCostCentreReport, costCentreLabel, costCentreProblem, costCentreRequired, costCentreRows, costCentresOf, expenseCentreProblem,
} from "./costCentres.js";

const S = "s1";
const shop = {
  costCentreRequired: true,
  costCentres: [
    { id: "cc2", code: "D-SALES", name: "Dept-Sales", nameBn: "বিক্রয় বিভাগ", type: "department" },
    { id: "cc1", code: "B-A", name: "Branch-A", type: "branch", branchId: "br-a" },
    { id: "cc3", code: "JOB-1", name: "Old job", type: "job", active: false },
    { code: "NO-ID", name: "dropped" },
  ],
};
const centres = costCentresOf(shop);
const exp = (id, centre, amount, vat = 0, extra = {}) => ({ id, shopId: S, status: "active", expenseNo: id, expenseDate: "2026-11-10", category: "rent", amount, vatAmount: vat, costCentreId: centre, ...extra });

test("centres from the shop: sorted by code, id required, stopped kept but not active", () => {
  assert.deepEqual(centres.map((c) => c.id), ["cc1", "cc2", "cc3"]);
  assert.deepEqual(activeCostCentres(centres).map((c) => c.id), ["cc1", "cc2"]);
  assert.equal(centres.find((c) => c.id === "cc2").branchId, "", "only a branch centre keeps a branch link");
  assert.equal(costCentreLabel(centres[1], true), "D-SALES - বিক্রয় বিভাগ");
  assert.equal(costCentreRequired(shop), true);
  assert.equal(costCentreRequired({}), false, "off unless switched on");
});

test("centre checks: code, name, type, duplicate code, one centre per branch", () => {
  assert.equal(costCentreProblem({ id: "n", code: "X", name: "X", type: "job" }, centres), "");
  assert.equal(costCentreProblem({ id: "n", code: " ", name: "X", type: "job" }, centres), "code");
  assert.equal(costCentreProblem({ id: "n", code: "X", name: "", type: "job" }, centres), "name");
  assert.equal(costCentreProblem({ id: "n", code: "X", name: "X", type: "cost" }, centres), "type");
  assert.equal(costCentreProblem({ id: "n", code: "b-a", name: "X", type: "job" }, centres), "dupCode");
  assert.equal(costCentreProblem({ id: "n", code: "B-B", name: "X", type: "branch", branchId: "br-a" }, centres), "dupBranch");
  assert.equal(costCentreProblem({ ...centres[0], name: "Branch A renamed" }, centres), "", "editing a centre does not clash with itself");
});

test("expense centre rule: optional by default, required only when switched on and a centre exists", () => {
  assert.equal(expenseCentreProblem({ costCentreId: "", centres, required: false }), "");
  assert.equal(expenseCentreProblem({ costCentreId: "", centres, required: true }), "required");
  assert.equal(expenseCentreProblem({ costCentreId: "", centres: [], required: true }), "", "no centres yet: nothing to choose, nothing blocked");
  assert.equal(expenseCentreProblem({ costCentreId: "cc1", centres, required: true }), "");
  assert.equal(expenseCentreProblem({ costCentreId: "gone", centres }), "unknown");
  assert.equal(expenseCentreProblem({ costCentreId: "cc3", centres }), "inactive");
  assert.equal(expenseCentreProblem({ costCentreId: "cc3", centres, keepId: "cc3" }), "", "an old bill keeps its stopped centre");
});

test("report: expenses by centre without VAT, not allocated, branch sales only where linked, totals add up", () => {
  const expenses = [
    exp("E1", "cc1", 105, 5),
    exp("E2", "cc1", 40, 0, { category: "transport", categoryName: "" }),
    exp("E3", "cc2", 300),
    exp("E4", "", 50),
    exp("E5", "deleted-centre", 20),
    exp("E6", "cc2", 999, 0, { status: "cancelled" }),
    exp("E7", "cc2", 999, 0, { expenseDate: "2026-12-01" }),
    exp("E8", "cc2", 999, 0, { shopId: "other" }),
    exp("E9", "cc3", 10),
  ];
  const branchPl = new Map([["br-a", { netSales: 1000, cogs: 600, grossProfit: 400 }], ["main", { netSales: 500, cogs: 300, grossProfit: 200 }]]);
  const rep = buildCostCentreReport({ expenses, centres, branchPl, shopId: S, from: "2026-11-01", to: "2026-11-30", expenseLabel: (e) => e.category });
  const row = (id) => rep.rows.find((r) => r.id === id);
  assert.deepEqual([row("cc1").expenses, row("cc1").count, row("cc1").grossProfit, row("cc1").net], [140, 2, 400, 260]);
  assert.deepEqual(row("cc1").byCategory, [["rent", 100], ["transport", 40]]);
  assert.deepEqual([row("cc2").expenses, row("cc2").hasSales, row("cc2").net], [300, false, -300], "a department has no sales of its own");
  assert.deepEqual([row("cc3").expenses, row("cc3").active], [10, false], "a stopped centre with bills in the period still shows");
  assert.deepEqual([rep.unallocated.expenses, rep.unallocated.count], [70, 2], "no centre, or a centre no longer on the list");
  assert.deepEqual(rep.unlinkedSales, [{ branchId: "main", netSales: 500, grossProfit: 200 }], "main shop sales are not given to any centre");
  assert.deepEqual(rep.totals, { netSales: 1500, grossProfit: 600, expenses: 520, allocated: 450, net: 80 });
  assert.equal(rep.totals.expenses, r2sum([row("cc1").expenses, row("cc2").expenses, row("cc3").expenses, rep.unallocated.expenses]));

  const csv = costCentreRows(rep, { branchName: (id) => (id === "main" ? "Main" : id) });
  assert.deepEqual(csv[0], ["Code", "Cost centre", "Type", "Net sales", "Gross profit", "Expenses", "Bills", "Net"]);
  assert.deepEqual(csv[1], ["B-A", "Branch-A", "Branch", "1000.00", "400.00", "140.00", "2", "260.00"]);
  assert.ok(csv.some((r) => r[1] === "Not allocated" && r[5] === "70.00"));
  assert.ok(csv.some((r) => r[1].includes("Main") && r[4] === "200.00"));
  assert.deepEqual(csv[csv.length - 1].slice(1), ["Total", "", "1500.00", "600.00", "520.00", "", "80.00"]);
});

test("no centres at all: every expense is not allocated", () => {
  const rep = buildCostCentreReport({ expenses: [exp("E1", "", 100)], centres: [], shopId: S });
  assert.deepEqual([rep.rows.length, rep.unallocated.expenses, rep.totals.expenses], [0, 100, 100]);
});

function r2sum(list) { return Math.round(list.reduce((t, v) => t + v, 0) * 100) / 100; }
