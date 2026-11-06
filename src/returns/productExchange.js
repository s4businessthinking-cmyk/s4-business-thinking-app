const n2 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const q4 = (v) => parseFloat(n2(v).toFixed(4));

/** Stock swap: wrong/damaged/wrong-fitting product out, replacement product in. */
export const EXCHANGE_META = { kind: "exchange", prefix: "PX", serial: "lastPXSerial" };

export const EXCHANGE_REASONS = [
  { key: "wrong", bn: "ভুল পণ্য", en: "Wrong product" },
  { key: "damaged", bn: "নষ্ট / ভাঙা", en: "Damaged" },
  { key: "fitting", bn: "ফিটিং বেশি / কম", en: "Fitting more / less" },
  { key: "other", bn: "অন্যান্য", en: "Other" },
];

export function exchangeReasonLabel(key, bn = false) {
  const row = EXCHANGE_REASONS.find((r) => r.key === key) || EXCHANGE_REASONS[EXCHANGE_REASONS.length - 1];
  return row[bn ? "bn" : "en"];
}

/**
 * Build stock lines for a product exchange (out = leave stock, in = enter stock).
 * Qtys may differ (e.g. fitting more/less).
 */
export function buildExchangeItems({ out, outQty, into, inQty, stockMap = null }) {
  if (!out?.productId) return { error: "noOut" };
  if (!into?.productId) return { error: "noIn" };
  if (out.productId === into.productId) return { error: "same" };
  const oq = n2(outQty);
  const iq = n2(inQty);
  if (!(oq > 0)) return { error: "noOutQty" };
  if (!(iq > 0)) return { error: "noInQty" };
  const stockOf = (id) => (stockMap?.has?.(id) ? stockMap.get(id) : null);
  const line = (p, direction, qty, role) => ({
    productId: p.productId,
    name: p.name || "",
    code: p.code || "",
    unit: p.unit || "Pcs",
    unitFactor: 1,
    direction,
    qty: q4(qty),
    role,
    stockBefore: stockOf(p.productId),
  });
  return {
    items: [
      line(out, "out", oq, "out"),
      line(into, "in", iq, "in"),
    ],
  };
}

export function exchangeSummary(r) {
  const out = (r?.items || []).find((it) => it.direction === "out") || {};
  const inn = (r?.items || []).find((it) => it.direction === "in") || {};
  const fq = (v) => String(parseFloat(n2(v).toFixed(4)));
  return `${out.name || "?"} × ${fq(out.qty)} → ${inn.name || "?"} × ${fq(inn.qty)}`;
}
