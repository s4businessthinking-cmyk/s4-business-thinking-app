const norm = (v) => String(v || "").trim().toLowerCase();

// How many base units one `unit` holds, from the product's Selling Rates rows ("1 Box = 12 Pcs").
export function unitFactorFor(product, unit) {
  if (!product || !unit || norm(unit) === norm(product.unit || "Pcs")) return 1;
  const rows = Array.isArray(product.unitPrices) ? product.unitPrices : [];
  const row = rows.find((r) => r && norm(r.unit) === norm(unit) && Number(r.factor) > 0);
  return row ? Number(row.factor) : 1;
}

// A per-unit price re-expressed for another unit of the same product (cost of 1 Pcs → cost of 1 Box of 12).
export function rescaleForUnit(value, product, fromUnit, toUnit) {
  const amount = Number(value);
  if (!product || !Number.isFinite(amount) || String(value).trim() === "") return value;
  const from = unitFactorFor(product, fromUnit);
  const to = unitFactorFor(product, toUnit);
  if (from === to) return value;
  return String(Math.round((amount / from) * to * 10000) / 10000);
}

// Invoices saved before unit factors existed carry no unitFactor, so fall back to the product's current rows.
export function itemBaseQty(item, product) {
  const qty = Number(item?.qty) || 0;
  const saved = Number(item?.unitFactor);
  const factor = saved > 0 ? saved : unitFactorFor(product, item?.unit);
  return qty * factor;
}
