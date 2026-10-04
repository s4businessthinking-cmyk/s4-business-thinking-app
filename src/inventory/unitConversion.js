const norm = (v) => String(v || "").trim().toLowerCase();

// How many base units one `unit` holds, from the product's Selling Rates rows ("1 Box = 12 Pcs").
export function unitFactorFor(product, unit) {
  if (!product || !unit || norm(unit) === norm(product.unit || "Pcs")) return 1;
  const rows = Array.isArray(product.unitPrices) ? product.unitPrices : [];
  const row = rows.find((r) => r && norm(r.unit) === norm(unit) && Number(r.factor) > 0);
  return row ? Number(row.factor) : 1;
}

// Invoices saved before unit factors existed carry no unitFactor, so fall back to the product's current rows.
export function itemBaseQty(item, product) {
  const qty = Number(item?.qty) || 0;
  const saved = Number(item?.unitFactor);
  const factor = saved > 0 ? saved : unitFactorFor(product, item?.unit);
  return qty * factor;
}
