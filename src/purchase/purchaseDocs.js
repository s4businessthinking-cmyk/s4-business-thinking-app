const n2 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const q4 = (v) => parseFloat(n2(v).toFixed(4));

const BILL_LIVE = ["confirmed", "paid", "partial"];
const GRN_LIVE = ["confirmed", "invoiced"];
const lineKey = (it) => `${it.productId || String(it.name || "").trim().toLowerCase()}|${it.unit || ""}`;

// What arrived against a purchase order: its goods received notes plus bills made straight from it
// (a bill made from a goods received note is the same goods, so it is not counted twice).
export function receivedByOrder(order, purchaseInvoices = [], goodsReceipts = []) {
  const got = new Map();
  const add = (items) => (items || []).forEach((it) => { const k = lineKey(it); got.set(k, (got.get(k) || 0) + n2(it.qty)); });
  goodsReceipts.filter((g) => g?.purchaseOrderId === order.id && GRN_LIVE.includes(g.status)).forEach((g) => add(g.items));
  purchaseInvoices.filter((p) => p?.purchaseOrderId === order.id && !p.goodsReceiptId && BILL_LIVE.includes(p.status)).forEach((p) => add(p.items));
  return got;
}

export function orderLines(order, purchaseInvoices, goodsReceipts) {
  const got = receivedByOrder(order, purchaseInvoices, goodsReceipts);
  return (order.items || []).map((it) => {
    const k = lineKey(it);
    const received = Math.min(n2(it.qty), got.get(k) || 0);
    got.set(k, Math.max(0, (got.get(k) || 0) - received));
    return { ...it, received: q4(received), remaining: q4(Math.max(0, n2(it.qty) - received)) };
  });
}

export function orderProgress(order, purchaseInvoices, goodsReceipts) {
  if (order.status === "cancelled") return "cancelled";
  const lines = orderLines(order, purchaseInvoices, goodsReceipts);
  const anyIn = lines.some((l) => l.received > 0);
  if (lines.length && lines.every((l) => l.remaining <= 1e-9)) return "received";
  if (order.status === "closed") return "closed";
  return anyIn ? "partial" : "open";
}

export function billOfReceipt(grn, purchaseInvoices = []) {
  return purchaseInvoices.find((p) => p?.goodsReceiptId === grn.id && p.status !== "cancelled") || null;
}

export function docTotals(items = [], withTax = true) {
  let sub = 0, tax = 0;
  items.forEach((it) => {
    const line = n2(it.qty) * n2(it.unitCost);
    sub += line;
    if (withTax) tax += (line * n2(it.taxPerc)) / 100;
  });
  return { sub: q4(sub), tax: q4(tax), grand: q4(sub + tax) };
}
