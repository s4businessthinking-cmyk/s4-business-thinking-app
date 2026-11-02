const n2 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const q4 = (v) => parseFloat(n2(v).toFixed(4));

const BILL_LIVE = ["confirmed", "paid", "partial"];
const GRN_LIVE = ["confirmed", "invoiced"];
export const orderLineKey = (it) => `${it.productId || String(it.name || "").trim().toLowerCase()}|${it.unit || ""}`;
const lineKey = orderLineKey;

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
    const backordered = Math.min(n2(it.qty) - received, n2(it.backorderedQty));
    return { ...it, received: q4(received), backordered: q4(backordered), remaining: q4(Math.max(0, n2(it.qty) - received - backordered)) };
  });
}

export function orderProgress(order, purchaseInvoices, goodsReceipts) {
  if (order.status === "cancelled") return "cancelled";
  const lines = orderLines(order, purchaseInvoices, goodsReceipts);
  const anyIn = lines.some((l) => l.received > 0);
  if (lines.length && lines.every((l) => l.remaining <= 1e-9)) {
    return lines.some((l) => l.backordered > 1e-9) ? "invoiced" : "received";
  }
  if (order.status === "closed") return "closed";
  return anyIn ? "partial" : "open";
}

export function pendingProductCount(order, purchaseInvoices, goodsReceipts) {
  return orderLines(order, purchaseInvoices, goodsReceipts).filter((l) => l.remaining > 1e-9).length;
}

// Lines still on the order after this bill — goods the supplier did not send.
export function shortageAfterBill(order, billedItems = [], purchaseInvoices = [], goodsReceipts = []) {
  const billed = new Map();
  (billedItems || []).forEach((it) => { const k = lineKey(it); billed.set(k, (billed.get(k) || 0) + n2(it.qty)); });
  return orderLines(order, purchaseInvoices, goodsReceipts).map((l) => {
    const take = Math.min(l.remaining, billed.get(lineKey(l)) || 0);
    billed.set(lineKey(l), Math.max(0, (billed.get(lineKey(l)) || 0) - take));
    return { ...l, billed: q4(take), shortage: q4(l.remaining - take) };
  }).filter((l) => l.shortage > 1e-9);
}

export function applyBackorderToOrder(order, shortageLines = []) {
  const extra = new Map();
  shortageLines.forEach((l) => extra.set(lineKey(l), (extra.get(lineKey(l)) || 0) + n2(l.shortage ?? l.qty)));
  return (order.items || []).map((it) => {
    const add = extra.get(lineKey(it)) || 0;
    if (add <= 0) return it;
    extra.delete(lineKey(it));
    return { ...it, backorderedQty: q4(n2(it.backorderedQty) + add) };
  });
}

export function mergeOrderItems(existing = [], incoming = []) {
  const list = existing.map((it) => ({ ...it }));
  incoming.forEach((n) => {
    const i = list.findIndex((it) => lineKey(it) === lineKey(n));
    if (i >= 0) {
      const qty = q4(n2(list[i].qty) + n2(n.qty));
      list[i] = { ...list[i], ...n, qty, lineTotal: q4(qty * n2(n.unitCost ?? list[i].unitCost) * (1 + n2(n.taxPerc ?? list[i].taxPerc) / 100)) };
    } else list.push(n);
  });
  return list;
}

export function backorderItemsFromShortage(shortageLines = []) {
  return shortageLines.map((l) => {
    const qty = n2(l.shortage ?? l.qty);
    return {
      productId: l.productId || null, name: l.name, code: l.code || "", brand: l.brand || "", unit: l.unit || "Pcs", unitFactor: l.unitFactor || 1,
      qty, unitCost: n2(l.unitCost), taxPerc: n2(l.taxPerc), lineTotal: q4(qty * n2(l.unitCost) * (1 + n2(l.taxPerc) / 100)),
    };
  });
}

export function billOfReceipt(grn, purchaseInvoices = []) {
  return purchaseInvoices.find((p) => p.status !== "cancelled" && (p?.goodsReceiptId === grn.id || (p?.goodsReceiptIds || []).includes(grn.id))) || null;
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
