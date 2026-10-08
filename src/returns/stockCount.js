// Physical stock count: compare what was counted on the shelf with the system stock.

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r4 = (v) => parseFloat(n(v).toFixed(4));

export const countDraftKey = (shopId) => `s4_stock_count_${shopId || "local"}`;

export function liveProducts(products = []) {
  return products.filter((p) => p && p.id && p.name && !p.isDeleted && !p.deleted && p.isService !== true && p.type !== "service");
}

export function productGroupOf(p, by) {
  if (by === "company") return String(p.company || p.brand || "").trim();
  if (by === "category") return String(p.category || "").trim();
  if (by === "rack") return String(p.rackLocation || "").split("/")[0].trim();
  return "";
}

export function groupValues(products, by) {
  return [...new Set(liveProducts(products).map((p) => productGroupOf(p, by)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

// Rows shown on the count sheet.
export function countSheetRows(products, { by = "", value = "", q = "", onlyInStock = false, stockOf = () => null } = {}) {
  const needle = q.trim().toLowerCase();
  return liveProducts(products)
    .filter((p) => !by || !value || productGroupOf(p, by) === value)
    .filter((p) => !needle || `${p.name} ${p.code || ""} ${p.barcode || ""} ${p.company || p.brand || ""}`.toLowerCase().includes(needle))
    .filter((p) => !onlyInStock || n(stockOf(p.id)) !== 0)
    .sort((a, b) => String(a.rackLocation || "").localeCompare(String(b.rackLocation || "")) || String(a.name).localeCompare(String(b.name)));
}

// Counted products whose number differs from the system stock.
export function countDifferences(products, counted = {}, stockOf = () => null) {
  const byId = new Map(liveProducts(products).map((p) => [p.id, p]));
  const out = [];
  for (const [id, raw] of Object.entries(counted)) {
    if (String(raw ?? "").trim() === "") continue;
    const p = byId.get(id);
    const system = stockOf(id);
    if (!p || system == null) continue;
    const diff = r4(n(raw) - n(system));
    if (Math.abs(diff) < 1e-9) continue;
    out.push({ product: p, system: n(system), counted: n(raw), diff });
  }
  return out;
}

export function countSummary(products, counted = {}, stockOf = () => null) {
  const entered = Object.values(counted).filter((v) => String(v ?? "").trim() !== "").length;
  const diffs = countDifferences(products, counted, stockOf);
  const short = diffs.filter((d) => d.diff < 0);
  const extra = diffs.filter((d) => d.diff > 0);
  const value = (list) => r4(list.reduce((t, d) => t + Math.abs(d.diff) * n(d.product.landingCost ?? d.product.purchasePrice ?? d.product.cost), 0));
  return { entered, diffs, short: short.length, extra: extra.length, shortValue: value(short), extraValue: value(extra) };
}
