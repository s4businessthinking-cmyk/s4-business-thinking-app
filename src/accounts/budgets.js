// Budgets: the owner's plan for a financial year, one line per P&L item with an amount for each of the 12 months
// (kept on the shop record as budgets, like the cost centres). A line budgets one of:
// - "sales": net sales (bills less returns, without VAT) and "cogs": cost of goods sold - the P&L's own figures,
//   worked out with computeAccounts for each month (the caller passes them in as plByMonth);
// - "exp:<category>": an Expenses-page category ("exp:other:<name>" for a typed one), cost without VAT, optionally on
//   one cost centre (expense.costCentreId, accounts/costCentres.js);
// - "acc:<account>": a journal account that the P&L counts (reports/journalPl.js, with the chart-of-accounts nature).
// Actuals use the same documents and rules as the P&L: live documents of the shop only, drafts and cancelled left out.
// Nothing is forecast: a month with no budget is 0 and a month not yet over shows what has been booked so far.
import { n, r2, dayOf, inRange, isLive } from "../reports/reportFilters.js";
import { journalPlByAccount } from "../reports/journalPl.js";

const clean = (v) => String(v ?? "").trim();
const lc = (v) => clean(v).toLowerCase().replace(/\s+/g, " ");
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ""));
const pad = (v) => String(v).padStart(2, "0");

/** The 12 months of the financial year that starts on fyStart (YYYY-MM-01): [{ i, from, to, ym }]. */
export function fyMonths(fyStart) {
  if (!isDay(fyStart)) return [];
  const y0 = Number(fyStart.slice(0, 4)), m0 = Number(fyStart.slice(5, 7)) - 1;
  if (m0 < 0 || m0 > 11) return [];
  return Array.from({ length: 12 }, (_, i) => {
    const y = y0 + Math.floor((m0 + i) / 12), m = (m0 + i) % 12;
    const last = new Date(y, m + 1, 0).getDate();
    return { i, ym: `${y}-${pad(m + 1)}`, from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-${pad(last)}` };
  });
}

/** Month indexes (0-11) of a view: "year", "q1".."q4", "m0".."m11", or "ytd" (months that have started by `today`). */
export function periodMonths(view, months, today = "") {
  if (view === "ytd") return months.filter((m) => !today || m.from <= today).map((m) => m.i);
  const q = /^q([1-4])$/.exec(view || "");
  if (q) return [0, 1, 2].map((k) => (Number(q[1]) - 1) * 3 + k);
  const m = /^m(\d{1,2})$/.exec(view || "");
  if (m && Number(m[1]) < 12) return [Number(m[1])];
  return months.map((x) => x.i);
}

/** Kind of a line key: income (sales, income accounts) or expense. accountKind: "income" | "expense" for acc: keys. */
export const lineKind = (key, accountKind = "expense") => (key === "sales" ? "income" : key === "cogs" || String(key).startsWith("exp:") ? "expense" : accountKind === "income" ? "income" : "expense");
/** Key of an Expenses-page category. */
export const expenseKey = (category, categoryName = "") => (category === "other" ? `exp:other:${lc(categoryName)}` : `exp:${clean(category)}`);
export const accountKey = (name) => `acc:${lc(name)}`;

/** Twelve amounts from a saved / typed list (missing, blank or not a number -> 0). */
export const monthAmounts = (list) => Array.from({ length: 12 }, (_, i) => r2(n(Array.isArray(list) ? list[i] : 0)));

/** Saved lines of one financial year, cleaned. */
export function budgetLinesOf(shop, fyStart) {
  return (Array.isArray(shop?.budgets) ? shop.budgets : [])
    .filter((b) => b && clean(b.id) && clean(b.key) && b.fyStart === fyStart)
    // the key read in any case: an older save stored it in capitals
    .map((b) => ({ ...b, key: clean(b.key).toLowerCase(), kind: String(b.kind || "").toLowerCase() }))
    .map((b) => ({ id: clean(b.id), fyStart: b.fyStart, key: clean(b.key), label: clean(b.label) || clean(b.key), kind: b.kind === "income" ? "income" : "expense",
      costCentreId: String(b.key).startsWith("exp:") ? clean(b.costCentreId) : "", amounts: monthAmounts(b.amounts), note: clean(b.note), updatedAt: b.updatedAt || "" }));
}

/**
 * Checks a line before it is saved (lines: the year's other lines). -> "" or an error key:
 * fy, key, centre (a cost centre only goes on an expense category), duplicate (same item and centre), mixCentre (an
 * item budgeted for all centres and for one centre at once would count its bills twice), negative, empty (all 0).
 */
export function budgetLineProblem(line, lines = []) {
  if (!isDay(line?.fyStart)) return "fy";
  const key = clean(line?.key);
  if (!key || !(key === "sales" || key === "cogs" || key.startsWith("exp:") || key.startsWith("acc:"))) return "key";
  const centre = clean(line.costCentreId);
  if (centre && !key.startsWith("exp:")) return "centre";
  const same = (lines || []).filter((l) => l.id !== line.id && l.fyStart === line.fyStart && l.key === key);
  if (same.some((l) => clean(l.costCentreId) === centre)) return "duplicate";
  if (same.some((l) => !clean(l.costCentreId) !== !centre)) return "mixCentre";
  const amounts = monthAmounts(line.amounts);
  if (amounts.some((a) => a < 0)) return "negative";
  if (!amounts.some((a) => a > 0)) return "empty";
  return "";
}

/**
 * Actual per month for every line. months: fyMonths(); plByMonth: [{ netSales, cogs }] per month from computeAccounts;
 * expenses / vouchers: the documents; natureOf: chart-of-accounts nature (ledger/accountNature.js).
 * -> Map(line.id -> [12 amounts]) - expenses and expense accounts as a cost, income accounts as income (positive).
 */
export function budgetActuals(lines, { months = [], plByMonth = [], expenses = [], vouchers = [], shopId = "", natureOf = null } = {}) {
  const fyFrom = months[0]?.from || "", fyTo = months[months.length - 1]?.to || "";
  const monthOf = (day) => months.findIndex((m) => day >= m.from && day <= m.to);
  const liveExp = (expenses || []).filter((e) => isLive(e, shopId) && e.status !== "cancelled" && inRange(dayOf(e.expenseDate), fyFrom, fyTo));
  const journal = months.map((m) => journalPlByAccount(vouchers, shopId, m.from, m.to, natureOf));
  const out = new Map();
  lines.forEach((l) => {
    const row = Array(12).fill(0);
    if (l.key === "sales" || l.key === "cogs") {
      months.forEach((m) => { row[m.i] = r2(n(plByMonth[m.i]?.[l.key === "sales" ? "netSales" : "cogs"])); });
    } else if (l.key.startsWith("exp:")) {
      liveExp.forEach((e) => {
        if (expenseKey(e.category, e.categoryName) !== l.key) return;
        if (l.costCentreId && clean(e.costCentreId) !== l.costCentreId) return;
        const i = monthOf(dayOf(e.expenseDate));
        if (i >= 0) row[i] = r2(row[i] + n(e.amount) - Math.max(0, n(e.vatAmount)));
      });
    } else {
      const name = l.key.slice(4);
      journal.forEach((map, i) => {
        map.forEach((amt, ac) => { if (lc(ac) === name) row[i] = r2(row[i] + (l.kind === "income" ? -amt : amt)); });
      });
    }
    out.set(l.id, row);
  });
  return out;
}

/**
 * Budget against actual for the chosen months (idx: month indexes).
 * -> { sections: [{ kind, rows: [{ id, key, label, costCentreId, kind, budget, actual, variance, pct, status }], budget, actual, variance }],
 *      net: { budget, actual, variance }, count }
 * variance = actual - budget. status: "over" (expense above / income below budget, against plan), "under" (better than
 * plan), "on" (equal). pct = variance / budget x 100, null when the budget is 0.
 */
export function buildVariance(lines, actuals, idx) {
  const pick = (arr) => r2((idx || []).reduce((t, i) => t + n(arr?.[i]), 0));
  const rowOf = (l) => {
    const budget = pick(l.amounts), actual = pick(actuals.get(l.id));
    const variance = r2(actual - budget);
    const against = l.kind === "income" ? variance < 0 : variance > 0;
    return { id: l.id, key: l.key, label: l.label, costCentreId: l.costCentreId, kind: l.kind, budget, actual, variance,
      pct: budget ? r2((variance / budget) * 100) : null, status: Math.abs(variance) < 0.005 ? "on" : against ? "over" : "under" };
  };
  const sections = ["income", "expense"].map((kind) => {
    const rows = lines.filter((l) => l.kind === kind).map(rowOf).sort((a, b) => a.label.localeCompare(b.label));
    const budget = r2(rows.reduce((t, r) => t + r.budget, 0)), actual = r2(rows.reduce((t, r) => t + r.actual, 0));
    return { kind, rows, budget, actual, variance: r2(actual - budget) };
  });
  const [inc, exp] = sections;
  const nb = r2(inc.budget - exp.budget), na = r2(inc.actual - exp.actual);
  return { sections, net: { budget: nb, actual: na, variance: r2(na - nb) }, count: lines.length };
}

export const VARIANCE_COLS = ["Section", "Item", "Cost centre", "Budget", "Actual", "Variance", "Variance %", "Status"];
/** CSV / print rows: each line, each section total, then net (income less expenses). centreName(id) names a centre. */
export function varianceRows(rep, { bn = false, centreName = (id) => id } = {}) {
  const f = (v) => r2(v).toFixed(2);
  const sec = (k) => (k === "income" ? (bn ? "আয়" : "Income") : (bn ? "খরচ" : "Expenses"));
  const st = (s) => ({ over: bn ? "পরিকল্পনার বাইরে" : "Against plan", under: bn ? "পরিকল্পনার ভেতরে" : "Within plan", on: bn ? "সমান" : "On budget" }[s]);
  const out = [VARIANCE_COLS];
  rep.sections.forEach((s) => {
    s.rows.forEach((r) => out.push([sec(s.kind), r.label, r.costCentreId ? centreName(r.costCentreId) : "", f(r.budget), f(r.actual), f(r.variance), r.pct == null ? "" : `${r.pct.toFixed(1)}%`, st(r.status)]));
    out.push([sec(s.kind), bn ? "মোট" : "Total", "", f(s.budget), f(s.actual), f(s.variance), s.budget ? `${((s.variance / s.budget) * 100).toFixed(1)}%` : "", ""]);
  });
  out.push(["", bn ? "নিট (আয় − খরচ)" : "Net (income - expenses)", "", f(rep.net.budget), f(rep.net.actual), f(rep.net.variance), "", ""]);
  return out;
}
export const budgetFileName = (fyStart, view) => `budget-variance-${fyStart || "fy"}-${view || "year"}.csv`;
