// Price list: what each product sells for, per unit and per customer type, and what one customer pays.
// Prices are never worked out here: `rates.resolve` is the sales invoice's own siResolveRate (exact unit + customer
// type row, then the unit's default row, then the product's base price), so this list always shows the rate a new
// invoice line would get. The line discount follows the invoice too: the larger of the product's default discount and
// the customer's discount %.
//
// rates = { resolve(prod, unit, type) -> { unitPrice }, rows(prod) -> unitPrices rows in use, normType(v), normUnit(v) }

const n = (v) => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
const r2 = (v) => Math.round((n(v) + Number.EPSILON) * 100) / 100;
export const vatOf = (p) => n(p?.salesVat ?? p?.vatPerc);
const withVat = (price, vat) => r2(n(price) * (1 + vat / 100));

/** Units a product is sold in: its base unit first, then every unit that has a selling-rate row. */
export function unitsOf(prod, rates) {
  const base = String(prod?.unit || "Pcs").trim() || "Pcs";
  const out = [{ unit: base, factor: 1 }];
  (rates.rows(prod) || []).forEach((row) => {
    if (out.some((u) => rates.normUnit(u.unit) === rates.normUnit(row.unit))) return;
    out.push({ unit: String(row.unit).trim(), factor: n(row.factor) || 1 });
  });
  return out;
}

/** Which rule gives the rate: "special" (a row for this customer type), "default" (the unit's all-customers row) or "base". */
export function rateSource(prod, unit, type, rates) {
  const rows = (rates.rows(prod) || []).filter((row) => rates.normUnit(row.unit) === rates.normUnit(unit));
  const want = rates.normType(type);
  if (want && rows.some((row) => rates.normType(row.customerType) === want)) return "special";
  if (rows.some((row) => !String(row.customerType || "").trim())) return "default";
  return "base";
}

/** Customer types that have at least one special rate, in first-seen order (spelling as saved). */
export function typesWithRates(products, rates) {
  const seen = new Map();
  (products || []).forEach((p) => (rates.rows(p) || []).forEach((row) => {
    const t = String(row.customerType || "").trim();
    if (t && !seen.has(rates.normType(t))) seen.set(rates.normType(t), t);
  }));
  return [...seen.values()];
}

export function productMatches(p, { search = "", brand = "", category = "" } = {}) {
  const q = String(search || "").trim().toLowerCase();
  const brandOf = String(p?.brand || p?.company || "").trim();
  return (!q || [p?.code, p?.name, p?.barcode, brandOf, p?.category].some((v) => String(v || "").toLowerCase().includes(q)))
    && (!brand || brandOf === brand) && (!category || String(p?.category || "").trim() === category);
}

/**
 * One row per product per unit: default price (no customer type), MRP, VAT, and the price for each customer type.
 * -> [{ productId, code, name, brand, category, barcode, unit, factor, vat, price, priceIncl, mrp, byType: { [type]: { price, special } } }]
 */
export function priceListRows(products, rates, { types = [], search = "", brand = "", category = "", pricedOnly = false } = {}) {
  const out = [];
  (products || []).filter((p) => p?.id && !p.isDeleted && productMatches(p, { search, brand, category })).forEach((p) => {
    const vat = vatOf(p);
    unitsOf(p, rates).forEach(({ unit, factor }) => {
      const price = r2(rates.resolve(p, unit, "").unitPrice);
      const byType = {};
      types.forEach((t) => { byType[t] = { price: r2(rates.resolve(p, unit, t).unitPrice), special: rateSource(p, unit, t, rates) === "special" }; });
      if (pricedOnly && !price && !Object.values(byType).some((x) => x.price)) return;
      const row = (rates.rows(p) || []).find((x) => rates.normUnit(x.unit) === rates.normUnit(unit) && !String(x.customerType || "").trim());
      out.push({
        productId: p.id, code: p.code || "", name: p.name || "", brand: String(p.brand || p.company || "").trim(), category: p.category || "", barcode: row?.barcode || p.barcode || "",
        unit, factor, vat, price, priceIncl: withVat(price, vat), mrp: r2(row?.mrp || (factor === 1 ? p.mrp : 0)), byType,
      });
    });
  });
  return out.sort((a, b) => a.name.localeCompare(b.name) || a.factor - b.factor);
}

/**
 * What one customer pays: list rate for their type, the line discount the invoice will start with, and the net.
 * -> [{ ...priceListRow fields, type, source, list, discount, net, netIncl }]
 */
export function customerRates(products, customer, rates, filters = {}) {
  const type = String(customer?.customerType || "").trim();
  const custDisc = n(customer?.discountPerc);
  return priceListRows(products, rates, { ...filters, types: [] }).map((row) => {
    const p = (products || []).find((x) => x.id === row.productId);
    const list = r2(rates.resolve(p, row.unit, type).unitPrice);
    const discount = Math.max(0, Math.min(100, Math.max(n(p?.defaultDiscount), custDisc)));
    const net = r2(list * (1 - discount / 100));
    return { ...row, type, source: rateSource(p, row.unit, type, rates), list, discount, net, netIncl: withVat(net, row.vat) };
  });
}
