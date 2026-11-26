// Reorder / low-stock list: products whose stock on hand (computeStockMap - the same count as the Stock Hub and the
// product screen) is at or below their reorder level (product master: reorderMin; Reorder Level window). Products
// without a level are never listed. Suggested buy = the product's reorder quantity when set, else up to its maximum
// level, else back up to the reorder level; never below 0.
const num = (v) => { const x = parseFloat(String(v ?? "").replace(/,/g, "")); return Number.isFinite(x) ? x : 0; };
const r4 = (v) => Math.round((Number(v) || 0) * 10000) / 10000;

/** The product's levels: { min, max, qty } (0 when not set). */
export const reorderLevels = (p) => ({ min: Math.max(0, num(p?.reorderMin)), max: Math.max(0, num(p?.reorderMax)), qty: Math.max(0, num(p?.reorderQty)) });
/** Products that have a reorder level (the only ones worth counting stock for). */
export const watchedProducts = (products) => (products || []).filter((p) => p?.id && !p.isDeleted && !p.deleted && reorderLevels(p).min > 0);

/**
 * stockMap: Map(productId -> base quantity on hand). -> rows at or below the reorder level, most short first:
 * [{ id, code, name, brand, category, rack, unit, stock, min, max, reorderQty, short, suggest, out }]
 */
export function lowStockRows(products, stockMap) {
  return watchedProducts(products).map((p) => {
    const { min, max, qty } = reorderLevels(p);
    const stock = r4(num(stockMap?.get(p.id)));
    if (stock > min) return null;
    const suggest = r4(Math.max(0, qty > 0 ? qty : max > 0 ? max - stock : min - stock));
    return {
      id: p.id, code: p.code || p.barcode || "", name: p.name || p.id, brand: p.brand || p.company || "", category: String(p.category || "").trim(),
      rack: p.rackLocation || "", unit: p.unit || "Pcs", stock, min, max, reorderQty: qty, short: r4(min - stock), suggest, out: stock <= 0,
    };
  }).filter(Boolean).sort((a, b) => b.short - a.short || a.name.localeCompare(b.name));
}

export const REORDER_COLS = ["Code", "Product", "Brand", "Category", "Rack", "Unit", "In stock", "Reorder level", "Max level", "Reorder qty", "Suggested buy"];
export const reorderRows = (rows) => [
  REORDER_COLS,
  ...rows.map((r) => [r.code, r.name, r.brand, r.category, r.rack, r.unit, String(r.stock), String(r.min), r.max ? String(r.max) : "", r.reorderQty ? String(r.reorderQty) : "", String(r.suggest)]),
];
export const reorderFileName = (day) => `low-stock-${day || "today"}.csv`;

/** Plain-text list for copying into a message or a supplier order (no prices). */
export const reorderText = (rows, { shopName = "", day = "", bn = false } = {}) => [
  `${shopName ? `${shopName} - ` : ""}${bn ? "স্টক কম / অর্ডার করতে হবে" : "Low stock / to reorder"}${day ? ` (${day})` : ""}`,
  ...rows.map((r, i) => `${i + 1}. ${r.name}${r.code ? ` [${r.code}]` : ""} - ${bn ? "স্টক" : "stock"} ${r.stock} ${r.unit}, ${bn ? "কিনুন" : "buy"} ${r.suggest}`),
].join("\n");
