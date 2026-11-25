// Group view: the shop and its branches in one picture. All branches share one set of books (one shopId, one
// ledger), and goods sent between branches are not sales or purchases (internal transfer bills stay out of the
// ledger, stock and P&L), so the group trial balance / balance sheet are the shop's own. What this adds is the split:
// each sale is tagged with the branch it was sold from (stockLocation), so sales, returns, cost of goods and gross
// profit are worked out per branch; costs that are not tagged to a branch (expenses, journals, supplier discount)
// sit in a shop-level column. Every column adds up to the group P&L.

const num = (v) => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
const r2 = (v) => Math.round(((Number(v) || 0) + Number.EPSILON) * 100) / 100;
const clean = (v) => String(v ?? "").trim();
export const MAIN_BRANCH = "main";
const dayOf = (v) => {
  if (!v) return "";
  if (typeof v === "object" && Number.isFinite(v.seconds)) return new Date(v.seconds * 1000).toISOString().slice(0, 10);
  return String(v).slice(0, 10);
};

export const branchOfDoc = (doc) => (clean(doc?.stockLocation) && clean(doc.stockLocation) !== MAIN_BRANCH ? clean(doc.stockLocation) : MAIN_BRANCH);

/** Branch columns: main first, then the branch master, then any branch id only seen on a sale (named from the bill). */
export function branchColumns(branches, salesInvoices, deliveryNotes = []) {
  const out = [{ id: MAIN_BRANCH, name: "Main", nameBn: "মূল দোকান" }];
  const seen = new Set([MAIN_BRANCH]);
  (branches || []).filter((b) => b?.id && !b.isDeleted).forEach((b) => { if (!seen.has(b.id)) { seen.add(b.id); out.push({ id: b.id, name: clean(b.name) || b.id, nameBn: clean(b.nameBn) || clean(b.name) || b.id }); } });
  [...(salesInvoices || []), ...(deliveryNotes || [])].forEach((d) => {
    const id = branchOfDoc(d);
    if (!seen.has(id)) { seen.add(id); out.push({ id, name: clean(d.stockLocationName) || id, nameBn: clean(d.stockLocationName) || id }); }
  });
  return out;
}

/**
 * The data for one branch's column, in the shape computeAccounts() reads: its own sales, delivery notes and the
 * returns of its bills (a return without a bill counts at the main shop); all purchases stay so the average cost is
 * the shop's; nothing shop-level (expenses, journals, payments, receipts).
 */
export function branchData(data, branchId) {
  const sales = (data?.salesInvoices || []).filter((inv) => branchOfDoc(inv) === branchId);
  const billBranch = new Map((data?.salesInvoices || []).map((inv) => [inv.id, branchOfDoc(inv)]));
  const returns = (data?.extras?.salesReturns || data?.salesReturns || []).filter((r) => (billBranch.get(r.invoiceId) || MAIN_BRANCH) === branchId);
  const extras = { ...(data?.extras || {}), salesReturns: returns };
  return {
    ...data, salesInvoices: sales, deliveryNotes: (data?.deliveryNotes || []).filter((d) => branchOfDoc(d) === branchId),
    salesReturns: returns, extras, expenses: [], accountVouchers: [], receipts: [], payments: [],
  };
}

const LINES = ["grossSales", "salesReturnTotal", "vatOut", "netSales", "cogs", "grossProfit"];

/**
 * columns: [{ id, name, pl }] from computeAccounts(branchData(...)); group: computeAccounts(all data).
 * -> { columns: [{ id, name, grossSales, salesReturnTotal, vatOut, netSales, cogs, grossProfit, margin, count }],
 *      shopLevel: { vendorDiscount, expenseTotal, expenseByCat, net }, group: { ...same lines, netProfit }, difference }
 * difference: group net sales less the branch columns (0 unless a sale could not be placed).
 */
export function groupPl(columns, group) {
  const cols = columns.map(({ id, name, nameBn, pl }) => {
    const row = { id, name, nameBn, count: pl?.count || 0 };
    LINES.forEach((k) => { row[k] = r2(pl?.[k]); });
    row.margin = row.netSales > 0 ? r2((row.grossProfit / row.netSales) * 100) : 0;
    return row;
  });
  const sum = (k) => r2(cols.reduce((t, c) => t + c[k], 0));
  const branchGross = sum("grossProfit");
  const shopLevel = {
    vendorDiscount: r2(group?.vendorDiscount), expenseTotal: r2(group?.expenseTotal), expenseByCat: group?.expenseByCat || [],
    net: r2(num(group?.netProfit) - branchGross),
  };
  const g = Object.fromEntries(LINES.map((k) => [k, r2(group?.[k])]));
  return {
    columns: cols, shopLevel, group: { ...g, netProfit: r2(group?.netProfit), margin: g.netSales > 0 ? r2((g.grossProfit / g.netSales) * 100) : 0, count: group?.count || 0 },
    difference: r2(g.netSales - sum("netSales")),
  };
}

/**
 * Stock by branch at average cost: branch stock = received at the branch less sold there (branchStock rows);
 * the main shop holds the rest of the shop total. -> [{ id, name, qty, value }] (sum = shop stock value)
 */
export function stockByBranch(columns, branchRows, shopQty, cost) {
  const at = new Map();
  (branchRows || []).forEach((r) => {
    const m = at.get(r.branchId) || new Map();
    m.set(r.productId, (m.get(r.productId) || 0) + num(r.current));
    at.set(r.branchId, m);
  });
  const value = (m) => { let q = 0, v = 0; m.forEach((qty, pid) => { if (qty > 0) { q += qty; v += qty * (num(cost?.get(pid))); } }); return { qty: Math.round(q * 1000) / 1000, value: r2(v) }; };
  const main = new Map();
  (shopQty || new Map()).forEach((q, pid) => {
    let away = 0;
    // as the Stock Hub: a branch below zero does not add to the main shop
    at.forEach((m) => { away += Math.max(0, m.get(pid) || 0); });
    main.set(pid, q - away);
  });
  const ids = new Set([MAIN_BRANCH, ...at.keys()]);
  const named = new Map(columns.map((c) => [c.id, c]));
  return [...ids].map((id) => ({ id, name: named.get(id)?.name || id, nameBn: named.get(id)?.nameBn || id, ...(id === MAIN_BRANCH ? value(main) : value(at.get(id))) }));
}

/** Goods sent between branches in the period (a memo: they are neither sales nor purchases of the group). */
export function internalTransfers(transfers, { from = "", to = "", shopId = "" } = {}) {
  // dispatched transfers only (a draft or packed one has not left the shop)
  const list = (transfers || []).filter((t) => t && !t.isDeleted && (!shopId || !t.shopId || t.shopId === shopId) && !["cancelled", "draft", "packed"].includes(t.status));
  const day = (t) => dayOf(t.dispatchedAt || t.createdAt);
  const inRange = list.filter((t) => (!from || day(t) >= from) && (!to || day(t) <= to));
  const value = (t) => num(t.grandTotal ?? t.totalValue ?? (t.items || []).reduce((s, it) => s + num(it.lineTotal ?? num(it.quantity ?? it.qty) * num(it.unitCost)), 0));
  return { count: inRange.length, value: r2(inRange.reduce((s, t) => s + value(t), 0)) };
}

export const GROUP_COLS = (cols, bn = false) => ["Line", ...cols.map((c) => (bn ? c.nameBn : c.name)), "Shop level", "Group"];
export function groupCsvRows(view) {
  const f = (v) => r2(v).toFixed(2);
  const line = (label, key, shop = "") => [label, ...view.columns.map((c) => f(c[key])), shop, f(view.group[key])];
  return [
    line("Total sales (incl. VAT)", "grossSales"), line("Sales returns", "salesReturnTotal"), line("VAT on sales", "vatOut"), line("Net sales", "netSales"),
    line("Cost of goods sold", "cogs"), line("Gross profit", "grossProfit"),
    ["Gross margin %", ...view.columns.map((c) => c.margin.toFixed(1)), "", view.group.margin.toFixed(1)],
    ["Discount received from suppliers", ...view.columns.map(() => ""), f(view.shopLevel.vendorDiscount), f(view.shopLevel.vendorDiscount)],
    ["Expenses (not tagged to a branch)", ...view.columns.map(() => ""), f(-view.shopLevel.expenseTotal), f(-view.shopLevel.expenseTotal)],
    ["Net profit", ...view.columns.map((c) => f(c.grossProfit)), f(view.shopLevel.net), f(view.group.netProfit)],
  ];
}
