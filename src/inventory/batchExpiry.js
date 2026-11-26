// Batch expiry: an optional expiry date on a purchase line that already has its own batch (the batch is made by the
// purchase options - other supplier, M.R.P or cost; purchase/purchaseOptions.js). Products without batches, and batches
// without a date, are never asked about. The date travels with the batch (batchStock.js) and is used to:
// - list batches in stock that are expired or expire within the shop's window (default 30 days);
// - offer batches on a sale earliest expiry first (FEFO), expired ones marked;
// - check a bill before it is saved: selling an expired batch asks first (warn), or is refused when the owner has
//   switched on "block expired batches". Expiry is the last day the goods may be sold.
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ""));
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/** The owner's settings: { soonDays (1-365, default 30), blockExpired (default off) }. */
export function batchExpirySettingsOf(shop) {
  const s = shop?.batchExpiry || {};
  const d = Math.round(Number(s.soonDays));
  return { soonDays: d >= 1 && d <= 365 ? d : 30, blockExpired: s.blockExpired === true };
}

/** "expired" (day after the expiry date), "soon" (within soonDays), "ok", or "" (no date). daysLeft: days until expiry. */
export function expiryState(expiry, day, soonDays = 30) {
  if (!isDay(expiry) || !isDay(day)) return { state: "", daysLeft: null };
  const left = daysBetween(day, expiry);
  return { state: left < 0 ? "expired" : left <= soonDays ? "soon" : "ok", daysLeft: left };
}

/** Sale choices earliest expiry first (FEFO); batches without a date and the main stock after them, as before. */
export function fefoChoices(choices, day = "", soonDays = 30) {
  const withState = (choices || []).map((c, i) => ({ ...c, ...expiryState(c.expiry, day, soonDays), order: i }));
  return withState.sort((a, b) => {
    const ea = isDay(a.expiry), eb = isDay(b.expiry);
    if (ea && eb) return a.expiry.localeCompare(b.expiry) || a.order - b.order;
    if (ea !== eb) return ea ? -1 : 1;
    return a.order - b.order;
  });
}

/**
 * Batches in stock that are expired or expire within soonDays, as at `day`.
 * batchMap: batchStockByProduct(); products: the master. -> [{ productId, name, code, batchNo, expiry, daysLeft, state, stock, cost, value }]
 * sorted expired first, then soonest.
 */
export function expiringBatches(batchMap, products, day, soonDays = 30) {
  const byId = new Map((products || []).map((p) => [p.id, p]));
  const out = [];
  (batchMap || new Map()).forEach((info, productId) => (info.batches || []).forEach((b) => {
    if (!(b.stock > 0)) return;
    const { state, daysLeft } = expiryState(b.expiry, day, soonDays);
    if (state !== "expired" && state !== "soon") return;
    const p = byId.get(productId);
    out.push({ productId, name: p?.name || productId, code: p?.code || p?.barcode || "", batchNo: b.batchNo, expiry: b.expiry, daysLeft, state, stock: b.stock, cost: b.cost || 0, value: Math.round((b.stock * (b.cost || 0)) * 100) / 100 });
  }));
  return out.sort((a, b) => a.daysLeft - b.daysLeft || a.name.localeCompare(b.name));
}

/** Lines of a bill that sell an expired batch on the bill date: [{ name, batchNo, expiry }]. */
export function expiredSaleLines(items, batchMap, day) {
  const out = [];
  (items || []).forEach((it) => {
    if (!it?.productId || !it.batchNo) return;
    const b = batchMap?.get(it.productId)?.batches?.find((x) => x.batchNo === it.batchNo);
    if (b && expiryState(b.expiry, day).state === "expired") out.push({ name: it.name || it.productId, batchNo: it.batchNo, expiry: b.expiry });
  });
  return out;
}

export const EXPIRY_COLS = ["Code", "Product", "Batch", "Expiry", "Days left", "Status", "In stock", "Cost value"];
export const expiryRows = (rows) => [EXPIRY_COLS, ...rows.map((r) => [r.code, r.name, r.batchNo, r.expiry, String(r.daysLeft), r.state === "expired" ? "Expired" : "Expires soon", String(r.stock), r.value.toFixed(2)])];
