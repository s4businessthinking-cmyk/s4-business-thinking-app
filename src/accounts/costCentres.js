// Cost centres: the shop's own split of costs by branch, department, job or anything else (shop.costCentres, owner-kept,
// like the chart-of-accounts groups). An expense is put on a centre by choosing it on the bill (expense.costCentreId);
// nothing is guessed, so an expense without a centre shows as "Not allocated". A branch centre linked to a branch also
// shows that branch's own sales and gross profit, read from the branch tag the sale already carries (group view);
// no other sales are split. shop.costCentreRequired (default off) makes the centre a must on new and edited expenses.
import { n, r2, dayOf, inRange, isLive } from "../reports/reportFilters.js";

export const COST_CENTRE_TYPES = [
  { id: "branch", bn: "ব্রাঞ্চ", en: "Branch" },
  { id: "department", bn: "বিভাগ", en: "Department" },
  { id: "job", bn: "কাজ / প্রজেক্ট", en: "Job / project" },
  { id: "other", bn: "অন্যান্য", en: "Other" },
];
const TYPE_IDS = new Set(COST_CENTRE_TYPES.map((t) => t.id));
const clean = (v) => String(v ?? "").trim();
const key = (v) => clean(v).toLowerCase();

/** Saved centres in display order (code, then name); entries without an id are dropped. */
export function costCentresOf(shop) {
  return (Array.isArray(shop?.costCentres) ? shop.costCentres : [])
    .filter((c) => c && clean(c.id))
    .map((c) => ({ id: clean(c.id), code: clean(c.code), name: clean(c.name), nameBn: clean(c.nameBn), type: TYPE_IDS.has(c.type) ? c.type : "other", branchId: c.type === "branch" ? clean(c.branchId) : "", active: c.active !== false }))
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }) || a.name.localeCompare(b.name));
}
export const activeCostCentres = (list) => (list || []).filter((c) => c.active);
export const costCentreRequired = (shop) => shop?.costCentreRequired === true;
export const costCentreLabel = (c, bn) => (c ? [c.code, (bn && c.nameBn) || c.name].filter(Boolean).join(" - ") : "");

/**
 * Checks a centre before it is saved (list: the other saved centres). -> "" or an error key:
 * code, name, type, dupCode (same code as another centre), dupBranch (another centre already holds that branch).
 */
export function costCentreProblem(c, list = []) {
  if (!clean(c?.code)) return "code";
  if (!clean(c?.name)) return "name";
  if (!TYPE_IDS.has(c?.type)) return "type";
  const others = (list || []).filter((o) => o.id !== c.id);
  if (others.some((o) => key(o.code) === key(c.code))) return "dupCode";
  if (c.type === "branch" && clean(c.branchId) && others.some((o) => o.type === "branch" && o.active !== false && clean(o.branchId) === clean(c.branchId))) return "dupBranch";
  return "";
}

/**
 * Can this expense be saved with this centre? -> "" or "required" (setting on, active centres exist, none chosen) /
 * "unknown" (a centre id that is not on the list) / "inactive" (a stopped centre chosen on a new pick).
 * keepId: the centre the expense already had (an old bill may keep a centre that was stopped since).
 */
export function expenseCentreProblem({ costCentreId = "", centres = [], required = false, keepId = "" } = {}) {
  const id = clean(costCentreId);
  if (!id) return required && activeCostCentres(centres).length ? "required" : "";
  const c = (centres || []).find((x) => x.id === id);
  if (!c) return "unknown";
  if (!c.active && id !== clean(keepId)) return "inactive";
  return "";
}

/**
 * Cost centre P&L for [from, to].
 * expenses: expense documents; centres: costCentresOf(shop); branchPl: Map(branchId -> computeAccounts() of that branch)
 * for the branches that sold in the period; expenseLabel(e): the category name shown.
 * Expense cost is the amount less its VAT (claimed back in the VAT return), the same as the P&L.
 * -> { rows: [{ id, code, name, nameBn, type, branchId, active, netSales, cogs, grossProfit, hasSales, expenses, count, byCategory, net }],
 *      unallocated: { expenses, count, byCategory }, unlinkedSales: [{ branchId, netSales, grossProfit }],
 *      totals: { netSales, grossProfit, expenses, allocated, net } }
 * totals.expenses = every centre + not allocated; totals.grossProfit = every branch that sold, linked or not.
 */
export function buildCostCentreReport({ expenses = [], centres = [], branchPl = new Map(), shopId = "", from = "", to = "", expenseLabel = (e) => e.categoryName || e.category || "Expense" } = {}) {
  const byId = new Map(centres.map((c) => [c.id, c]));
  const rows = new Map(centres.map((c) => [c.id, { ...c, netSales: 0, cogs: 0, grossProfit: 0, hasSales: false, expenses: 0, count: 0, cats: new Map() }]));
  const unallocated = { expenses: 0, count: 0, cats: new Map() };
  const addTo = (bucket, e) => {
    const cost = n(e.amount) - Math.max(0, n(e.vatAmount));
    const label = clean(expenseLabel(e)) || "Expense";
    bucket.expenses = r2(bucket.expenses + cost);
    bucket.count += 1;
    bucket.cats.set(label, r2((bucket.cats.get(label) || 0) + cost));
  };
  (expenses || []).filter((e) => isLive(e, shopId) && e.status !== "cancelled" && inRange(dayOf(e.expenseDate), from, to)).forEach((e) => {
    const c = byId.get(clean(e.costCentreId));
    addTo(c ? rows.get(c.id) : unallocated, e);
  });
  const linked = new Set();
  rows.forEach((row) => {
    if (row.type !== "branch" || !row.branchId || linked.has(row.branchId)) return;
    const pl = branchPl.get(row.branchId);
    linked.add(row.branchId);
    if (!pl) return;
    row.netSales = r2(pl.netSales); row.cogs = r2(pl.cogs); row.grossProfit = r2(pl.grossProfit); row.hasSales = true;
  });
  const unlinkedSales = [...branchPl.entries()].filter(([id]) => !linked.has(id))
    .map(([branchId, pl]) => ({ branchId, netSales: r2(pl.netSales), grossProfit: r2(pl.grossProfit) }));
  const cats = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  const outRows = [...rows.values()].map(({ cats: m, ...row }) => ({ ...row, byCategory: cats(m), net: r2(row.grossProfit - row.expenses) }))
    .filter((r) => r.active || r.count || r.hasSales);
  const sum = (list, k) => r2(list.reduce((t, r) => t + n(r[k]), 0));
  const grossProfit = r2(sum(outRows, "grossProfit") + sum(unlinkedSales, "grossProfit"));
  const allocated = sum(outRows, "expenses");
  const expensesTotal = r2(allocated + unallocated.expenses);
  return {
    rows: outRows,
    unallocated: { expenses: unallocated.expenses, count: unallocated.count, byCategory: cats(unallocated.cats) },
    unlinkedSales,
    totals: { netSales: r2(sum(outRows, "netSales") + sum(unlinkedSales, "netSales")), grossProfit, expenses: expensesTotal, allocated, net: r2(grossProfit - expensesTotal) },
  };
}

export const COST_CENTRE_COLS = ["Code", "Cost centre", "Type", "Net sales", "Gross profit", "Expenses", "Bills", "Net"];
/** CSV / print rows: one per centre, then not allocated, branch sales without a centre and the total. */
export function costCentreRows(rep, { bn = false, branchName = (id) => id } = {}) {
  const typeName = (t) => { const x = COST_CENTRE_TYPES.find((y) => y.id === t); return x ? (bn ? x.bn : x.en) : t; };
  const f = (v) => r2(v).toFixed(2);
  return [
    COST_CENTRE_COLS,
    ...rep.rows.map((r) => [r.code, `${(bn && r.nameBn) || r.name}${r.active ? "" : bn ? " (বন্ধ)" : " (stopped)"}`, typeName(r.type), r.hasSales ? f(r.netSales) : "", r.hasSales ? f(r.grossProfit) : "", f(r.expenses), String(r.count), f(r.net)]),
    ["", bn ? "বরাদ্দ হয়নি" : "Not allocated", "", "", "", f(rep.unallocated.expenses), String(rep.unallocated.count), f(-rep.unallocated.expenses)],
    ...rep.unlinkedSales.map((s) => ["", `${bn ? "ব্রাঞ্চের বিক্রি, সেন্টার নেই" : "Branch sales without a centre"}: ${branchName(s.branchId)}`, "", f(s.netSales), f(s.grossProfit), "", "", f(s.grossProfit)]),
    ["", bn ? "মোট" : "Total", "", f(rep.totals.netSales), f(rep.totals.grossProfit), f(rep.totals.expenses), "", f(rep.totals.net)],
  ];
}
export const costCentreFileName = (from, to) => `cost-centres-${from || "start"}-${to || "end"}.csv`;
