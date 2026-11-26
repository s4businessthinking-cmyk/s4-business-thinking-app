import test from "node:test";
import assert from "node:assert/strict";
import {
  accountKey, budgetActuals, budgetLineProblem, budgetLinesOf, buildVariance, expenseKey, fyMonths, lineKind, monthAmounts, periodMonths, varianceRows,
} from "./budgets.js";
import { accountNatureOf } from "../ledger/accountNature.js";

const S = "s1";
const FY = "2026-04-01";
const months = fyMonths(FY);
const every = (v) => Array(12).fill(v);
const shop = {
  budgets: [
    { id: "b-rent", fyStart: FY, key: "exp:rent", label: "Rent", kind: "expense", amounts: every(1000) },
    { id: "b-tr-a", fyStart: FY, key: "exp:transport", label: "Transport", kind: "expense", costCentreId: "ccA", amounts: every(200) },
    { id: "b-tr-b", fyStart: FY, key: "exp:transport", label: "Transport", kind: "expense", costCentreId: "ccB", amounts: every(100) },
    { id: "b-sales", fyStart: FY, key: "sales", label: "Net sales", kind: "income", amounts: every(5000) },
    { id: "b-ads", fyStart: FY, key: accountKey("Online Ads"), label: "Online Ads", kind: "expense", amounts: [300] },
    { id: "b-comm", fyStart: FY, key: accountKey("Commission Income"), label: "Commission Income", kind: "income", amounts: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { id: "other-year", fyStart: "2025-04-01", key: "exp:rent", label: "Rent", amounts: every(9) },
  ],
};
const lines = budgetLinesOf(shop, FY);
const exp = (id, day, category, amount, extra = {}) => ({ id, shopId: S, status: "active", expenseNo: id, expenseDate: day, category, amount, vatAmount: 0, ...extra });
const expenses = [
  exp("E1", "2026-04-05", "rent", 630, { vatAmount: 30 }),
  exp("E2", "2026-05-05", "rent", 1200),
  exp("E3", "2026-04-10", "transport", 250, { costCentreId: "ccA" }),
  exp("E4", "2026-04-11", "transport", 40, { costCentreId: "ccB" }),
  exp("E5", "2026-04-12", "transport", 70),
  exp("E6", "2026-04-13", "rent", 999, { status: "cancelled" }),
  exp("E7", "2026-04-13", "rent", 999, { shopId: "other" }),
  exp("E8", "2026-03-31", "rent", 999),
];
const jv = (id, day, lines2) => ({ id, shopId: S, status: "active", voucherType: "journal", voucherNo: id, voucherDate: day, lines: lines2 });
const vouchers = [
  jv("J1", "2026-04-20", [{ account: "Online Ads", debit: 350 }, { account: "Cash in Hand", credit: 350 }]),
  jv("J2", "2026-04-21", [{ account: "Cash in Hand", debit: 80 }, { account: "Commission Income", credit: 80 }]),
];
const natureOf = accountNatureOf([{ name: "Online Ads", groupId: "g1" }, { name: "Commission Income", groupId: "g2" }],
  [{ id: "g1", nameEn: "Marketing", nature: "expense" }, { id: "g2", nameEn: "Other income", nature: "income" }]);
const plByMonth = months.map((m) => (m.i === 0 ? { netSales: 4200, cogs: 2500 } : m.i === 1 ? { netSales: 6000, cogs: 3600 } : { netSales: 0, cogs: 0 }));
const actuals = budgetActuals(lines, { months, plByMonth, expenses, vouchers, shopId: S, natureOf });

test("financial year months and views", () => {
  assert.deepEqual([months.length, months[0].from, months[0].to, months[9].ym, months[11].to], [12, "2026-04-01", "2026-04-30", "2027-01", "2027-03-31"]);
  assert.deepEqual(periodMonths("q2", months), [3, 4, 5]);
  assert.deepEqual(periodMonths("m0", months), [0]);
  assert.deepEqual(periodMonths("ytd", months, "2026-05-15"), [0, 1]);
  assert.equal(periodMonths("year", months).length, 12);
  assert.deepEqual(fyMonths("2026-13-01"), []);
});

test("lines of the year only; keys and kinds", () => {
  assert.deepEqual(lines.map((l) => l.id).sort(), ["b-ads", "b-comm", "b-rent", "b-sales", "b-tr-a", "b-tr-b"]);
  assert.deepEqual(lines.find((l) => l.id === "b-ads").amounts, [300, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "missing months are 0");
  assert.equal(expenseKey("other", " Office  Tea "), "exp:other:office tea");
  assert.deepEqual([lineKind("sales"), lineKind("cogs"), lineKind("exp:rent"), lineKind("acc:x", "income")], ["income", "expense", "expense", "income"]);
  assert.deepEqual(monthAmounts(["1,000", "", "x"]).slice(0, 3), [1000, 0, 0]);
});

test("actuals follow the P&L rules: cost without VAT, live bills of the shop in the month, centre when set", () => {
  assert.deepEqual(actuals.get("b-rent").slice(0, 2), [600, 1200], "VAT left out; cancelled, other shop and last year left out");
  assert.deepEqual(actuals.get("b-tr-a").slice(0, 1), [250]);
  assert.deepEqual(actuals.get("b-tr-b").slice(0, 1), [40], "an expense without a centre is on neither centre line");
  assert.deepEqual(actuals.get("b-sales").slice(0, 2), [4200, 6000]);
  assert.deepEqual(actuals.get("b-ads").slice(0, 1), [350], "journal account in an expense group");
  assert.deepEqual(actuals.get("b-comm").slice(0, 1), [80], "income account shown as a positive income");
});

test("variance: underspend, overspend, income short of plan, totals equal the sum of lines", () => {
  const april = buildVariance(lines, actuals, [0]);
  const row = (id) => april.sections.flatMap((s) => s.rows).find((r) => r.id === id);
  assert.deepEqual([row("b-rent").budget, row("b-rent").actual, row("b-rent").variance, row("b-rent").pct, row("b-rent").status], [1000, 600, -400, -40, "under"], "underspend");
  assert.deepEqual([row("b-tr-a").variance, row("b-tr-a").status], [50, "over"], "overspend");
  assert.deepEqual([row("b-sales").variance, row("b-sales").pct, row("b-sales").status], [-800, -16, "over"], "income below plan is against plan");
  assert.deepEqual([row("b-comm").pct, row("b-comm").status], [null, "under"], "no budget: no percentage");
  const may = buildVariance(lines, actuals, [1]);
  assert.equal(may.sections.flatMap((s) => s.rows).find((r) => r.id === "b-rent").status, "over");

  april.sections.forEach((s) => {
    assert.equal(s.budget, Math.round(s.rows.reduce((t, r) => t + r.budget, 0) * 100) / 100);
    assert.equal(s.actual, Math.round(s.rows.reduce((t, r) => t + r.actual, 0) * 100) / 100);
  });
  const [inc, ex] = april.sections;
  assert.deepEqual([inc.budget, inc.actual, ex.budget, ex.actual], [5000, 4280, 1600, 1240]);
  assert.deepEqual(april.net, { budget: 3400, actual: 3040, variance: -360 });

  const csv = varianceRows(april, { centreName: (id) => ({ ccA: "Branch-A", ccB: "Dept-Sales" }[id]) });
  assert.deepEqual(csv[0], ["Section", "Item", "Cost centre", "Budget", "Actual", "Variance", "Variance %", "Status"]);
  assert.ok(csv.some((r) => r[1] === "Rent" && r[3] === "1000.00" && r[4] === "600.00" && r[5] === "-400.00" && r[6] === "-40.0%" && r[7] === "Within plan"));
  assert.ok(csv.some((r) => r[1] === "Transport" && r[2] === "Branch-A" && r[7] === "Against plan"));
  assert.deepEqual(csv.find((r) => r[0] === "Expenses" && r[1] === "Total").slice(3, 6), ["1600.00", "1240.00", "-360.00"]);
  assert.deepEqual(csv[csv.length - 1].slice(3, 6), ["3400.00", "3040.00", "-360.00"]);
});

test("no budget: empty sections and zero totals", () => {
  const rep = buildVariance([], new Map(), periodMonths("year", months));
  assert.deepEqual([rep.count, rep.sections[0].rows.length, rep.sections[1].rows.length, rep.net.budget, rep.net.actual], [0, 0, 0, 0, 0]);
  assert.deepEqual(budgetLinesOf({}, FY), []);
});

test("line checks", () => {
  const base = { id: "n", fyStart: FY, key: "exp:water", amounts: every(50) };
  assert.equal(budgetLineProblem(base, lines), "");
  assert.equal(budgetLineProblem({ ...base, fyStart: "" }, lines), "fy");
  assert.equal(budgetLineProblem({ ...base, key: "purchase" }, lines), "key");
  assert.equal(budgetLineProblem({ ...base, key: "sales", costCentreId: "ccA" }, lines), "centre", "only expense categories go on a centre");
  assert.equal(budgetLineProblem({ ...base, key: "exp:rent" }, lines), "duplicate");
  assert.equal(budgetLineProblem({ ...base, key: "exp:transport", costCentreId: "ccA" }, lines), "duplicate");
  assert.equal(budgetLineProblem({ ...base, key: "exp:transport" }, lines), "mixCentre", "all-centres and one-centre lines would count bills twice");
  assert.equal(budgetLineProblem({ ...base, key: "exp:rent", costCentreId: "ccA" }, lines), "mixCentre");
  assert.equal(budgetLineProblem({ ...base, amounts: [-5] }, lines), "negative");
  assert.equal(budgetLineProblem({ ...base, amounts: [] }, lines), "empty");
  assert.equal(budgetLineProblem({ ...lines.find((l) => l.id === "b-rent"), amounts: every(900) }, lines), "", "editing a line does not clash with itself");
});
