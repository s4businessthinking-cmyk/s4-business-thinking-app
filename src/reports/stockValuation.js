// Stock valuation method, the shop's choice (shop.stockValuationMethod): "average" (weighted average purchase cost,
// averageCost.js - the default and how S4 always worked) or "fifo" (first in, first out). Every report that values
// stock asks here, so the P&L cost of goods sold, stock write-offs / warranty values, the Balance Sheet / Funds /
// month-end closing stock, the Stock Hub, the group view and the ledger's stock entries follow the same method.
//
// FIFO: cost layers come from the same documents the average uses - opening stock at its opening rate, then each live
// purchase bill line (without VAT) on the bill date; a purchase return takes its value out of that bill's layer
// (else the newest). Stock then leaves oldest layer first, day by day (same day: receipts before issues):
// - a sale line costs the layers it uses; a sales return comes back at what that sale cost (else the current cost);
// - a stock adjustment down costs the layers it uses, up comes in at the current cost; a warranty replacement comes in
//   at the current cost. Current cost = the oldest layer still in stock, else the last cost seen, else the product's
//   landing / average / opening rate (the average's own fallback).
// - Stock below zero: the shortfall is costed at the current cost; the next receipt fills it first, and the difference
//   to that receipt's cost goes into cost of goods sold on that day, so the P&L and the Balance Sheet stay equal.
// - Closing value = quantity on hand (the stock count, computeStockMap) x the FIFO cost of what is still in the layers;
//   with no delivery note or goods receipt waiting for its bill the two quantities are the same and this is the
//   layers' own value. Negative quantities are not valued (same as the average).
import { itemBaseQty } from "../inventory/unitConversion.js";
import { addAdjustments, addWarrantyClaims, adjustmentDay, warrantyStockDay } from "../inventory/stockMovements.js";
import { averageCosts } from "./averageCost.js";
import { n, dayOf, inRange, liveSalesOf, livePurchasesOf, liveReturnsOf } from "./reportFilters.js";

export const VALUATION_METHODS = ["average", "fifo"];
// read in any case: an older save stored the choice in capitals
export const valuationMethodOf = (shop) => (String(shop?.stockValuationMethod || "").toLowerCase() === "fifo" ? "fifo" : "average");

const ORDER = { opening: 0, purchase: 1, purchaseReturn: 2, adjustIn: 3, warranty: 4, salesReturn: 5, sale: 6, adjustOut: 7 };
const pick = (data, k) => data?.[k] || data?.extras?.[k] || data?.rows?.extras?.[k] || [];

/**
 * Run FIFO over the documents up to `upTo` (all when empty).
 * data: { purchaseInvoices, salesInvoices, extras: { salesReturns, purchaseReturns, stockAdjustments, warrantyClaims } }.
 * -> { unitCost: Map(productId -> cost of one unit still in stock, or the current cost), remaining: Map(productId -> { qty, value }),
 *      issues: [{ kind: "sale" | "salesReturn" | "adjustOut" | "adjustIn" | "warranty" | "shortfall", date, docId, productId, qty, value }] }
 * issue value is always positive; salesReturn / adjustIn / warranty put value back into stock.
 */
export function fifoRun(products, data, { shopId = "", upTo = "" } = {}) {
  const productById = new Map((products || []).filter((p) => p?.id).map((p) => [p.id, p]));
  const within = (d) => !upTo || !d || d <= upTo;
  const events = [];
  const push = (e) => { if (productById.has(e.productId) && e.qty > 0 && within(e.date)) events.push(e); };
  livePurchasesOf(data?.purchaseInvoices || data?.rows?.purchaseInvoices, shopId).filter((inv) => inv.source !== "openingBalance").forEach((inv) => {
    (inv.items || []).forEach((it, i) => {
      if (!it?.productId) return;
      const qty = itemBaseQty(it, productById.get(it.productId));
      const net = n(it.lineTotal) - n(it.taxAmt);
      push({ type: "purchase", date: dayOf(inv.invoiceDate), seq: i, docId: inv.id, productId: it.productId, qty, value: net > 0 ? net : 0 });
    });
  });
  liveReturnsOf(pick(data, "purchaseReturns"), shopId).forEach((r) => (r.items || []).forEach((it, i) => {
    if (!it?.productId) return;
    const net = n(it.amount) - n(it.vatAmt);
    push({ type: "purchaseReturn", date: dayOf(r.returnDate), seq: i, docId: r.id, billId: r.invoiceId || "", productId: it.productId, qty: itemBaseQty(it, productById.get(it.productId)), value: net > 0 ? net : 0 });
  }));
  liveSalesOf(data?.salesInvoices || data?.rows?.salesInvoices, shopId).filter((inv) => inv.source !== "openingBalance").forEach((inv) => {
    (inv.items || []).forEach((it, i) => {
      if (!it?.productId) return;
      push({ type: "sale", date: dayOf(inv.invoiceDate), seq: i, docId: inv.id, productId: it.productId, qty: itemBaseQty(it, productById.get(it.productId)) });
    });
  });
  liveReturnsOf(pick(data, "salesReturns"), shopId).forEach((r) => (r.items || []).forEach((it, i) => {
    if (!it?.productId) return;
    push({ type: "salesReturn", date: dayOf(r.returnDate), seq: i, docId: r.id, billId: r.invoiceId || "", productId: it.productId, qty: itemBaseQty(it, productById.get(it.productId)) });
  }));
  pick(data, "stockAdjustments").forEach((adj) => {
    const moved = new Map();
    addAdjustments([adj], shopId, moved, productById);
    const day = adjustmentDay(adj);
    moved.forEach((q, id) => { if (q < 0) push({ type: "adjustOut", date: day, seq: 0, docId: adj.id, productId: id, qty: -q }); else if (q > 0) push({ type: "adjustIn", date: day, seq: 0, docId: adj.id, productId: id, qty: q }); });
  });
  pick(data, "warrantyClaims").forEach((c) => {
    const moved = new Map();
    addWarrantyClaims([c], shopId, moved, productById);
    const day = warrantyStockDay(c);
    moved.forEach((q, id) => push({ type: "warranty", date: day, seq: 0, docId: c.id, productId: id, qty: q }));
  });
  events.sort((a, b) => a.date.localeCompare(b.date) || ORDER[a.type] - ORDER[b.type] || String(a.docId).localeCompare(String(b.docId)) || a.seq - b.seq);

  // per product: layers [{ qty, value, billId }], short (stock below zero, qty and the cost it was charged at), last cost
  const state = new Map();
  productById.forEach((p, id) => {
    const q = n(p.openingStock);
    const rate = n(p.openingRate) || n(p.landingCost);
    state.set(id, { layers: q > 0 ? [{ qty: q, value: q * rate, billId: "" }] : [], short: [], last: q > 0 ? rate : 0, fallback: n(p.landingCost) || n(p.averageCost) || rate });
  });
  const issues = [];
  const saleCost = new Map(); // `${saleId}|${productId}` -> { qty, value }
  const headCost = (s) => { const l = s.layers.find((x) => x.qty > 1e-9); return l ? l.value / l.qty : s.last || s.fallback; };
  const take = (s, qty) => {
    let left = qty, value = 0;
    while (left > 1e-9 && s.layers.length) {
      const l = s.layers[0];
      const q = Math.min(left, l.qty);
      const v = l.qty > 1e-9 ? (l.value / l.qty) * q : 0;
      if (l.qty > 1e-9) s.last = l.value / l.qty;
      l.qty -= q; l.value -= v; value += v; left -= q;
      if (l.qty <= 1e-9) s.layers.shift();
    }
    if (left > 1e-9) { const c = s.last || s.fallback; value += left * c; s.short.push({ qty: left, cost: c }); }
    return value;
  };
  // a receipt first fills stock that went below zero; the cost difference is a cost of goods sold true-up
  const receive = (s, e, qty, value, billId = "") => {
    let q = qty, v = value;
    while (q > 1e-9 && s.short.length) {
      const sh = s.short[0];
      const fill = Math.min(q, sh.qty);
      const unit = qty > 0 ? value / qty : 0;
      const diff = (unit - sh.cost) * fill;
      if (Math.abs(diff) > 1e-9) issues.push({ kind: "shortfall", date: e.date, docId: e.docId, productId: e.productId, qty: fill, value: diff });
      sh.qty -= fill; q -= fill; v -= unit * fill;
      if (sh.qty <= 1e-9) s.short.shift();
    }
    if (q > 1e-9) s.layers.push({ qty: q, value: Math.max(0, v), billId });
    if (qty > 0) s.last = value / qty || s.last;
  };
  events.forEach((e) => {
    const s = state.get(e.productId);
    if (e.type === "purchase") { receive(s, e, e.qty, e.value, e.docId); return; }
    if (e.type === "purchaseReturn") {
      // out of that bill's layer first, then the newest; the value that leaves is the return's own value
      let left = e.qty, valueLeft = e.value;
      const order = [...s.layers.filter((l) => l.billId && l.billId === e.billId), ...[...s.layers].reverse().filter((l) => !(l.billId && l.billId === e.billId))];
      order.forEach((l) => {
        if (left <= 1e-9) return;
        const q = Math.min(left, l.qty);
        const v = Math.min(l.value, e.qty > 0 ? (e.value / e.qty) * q : 0);
        l.qty -= q; l.value -= v; left -= q; valueLeft -= v;
      });
      s.layers = s.layers.filter((l) => l.qty > 1e-9);
      return;
    }
    if (e.type === "sale" || e.type === "adjustOut") {
      const value = take(s, e.qty);
      issues.push({ kind: e.type, date: e.date, docId: e.docId, productId: e.productId, qty: e.qty, value });
      if (e.type === "sale") {
        const k = `${e.docId}|${e.productId}`;
        const c = saleCost.get(k) || { qty: 0, value: 0 };
        saleCost.set(k, { qty: c.qty + e.qty, value: c.value + value });
      }
      return;
    }
    // stock coming back in: a sales return at what its sale cost, the rest at the current cost
    const sold = e.type === "salesReturn" ? saleCost.get(`${e.billId}|${e.productId}`) : null;
    const unit = sold && sold.qty > 1e-9 ? sold.value / sold.qty : headCost(s);
    const value = unit * e.qty;
    issues.push({ kind: e.type, date: e.date, docId: e.docId, productId: e.productId, qty: e.qty, value });
    receive(s, e, e.qty, value);
  });

  const unitCost = new Map(), remaining = new Map();
  state.forEach((s, id) => {
    const qty = s.layers.reduce((t, l) => t + l.qty, 0), value = s.layers.reduce((t, l) => t + l.value, 0);
    remaining.set(id, { qty, value });
    unitCost.set(id, qty > 1e-9 ? value / qty : s.last || s.fallback);
  });
  return { unitCost, remaining, issues };
}

/**
 * Cost of one unit per product on a day for the method: the weighted average (averageCost.js, exactly as before) or the
 * FIFO cost of what is still in stock. data: the documents dated up to `upTo` (stockDocsUpTo) or all.
 */
export function unitCostsAt(method, products, data, { shopId = "", upTo = "" } = {}) {
  if (method === "fifo") return fifoRun(products, data, { shopId, upTo }).unitCost;
  const purchases = livePurchasesOf(data?.purchaseInvoices || data?.rows?.purchaseInvoices, shopId).filter((inv) => inv.source !== "openingBalance");
  return averageCosts(products, purchases, upTo, liveReturnsOf(pick(data, "purchaseReturns"), shopId));
}

/** FIFO P&L pieces for [from, to]: cost of goods sold (sales less returns, with shortfall true-ups), write-off and warranty values. */
export function fifoPeriod(run, { from = "", to = "" } = {}) {
  let cogs = 0, adjustLoss = 0, warrantyGain = 0;
  const byDoc = new Map();
  run.issues.forEach((x) => {
    if (!inRange(x.date, from, to)) return;
    if (x.kind === "sale" || x.kind === "shortfall") cogs += x.value;
    else if (x.kind === "salesReturn") cogs -= x.value;
    else if (x.kind === "adjustOut") adjustLoss += x.value;
    else if (x.kind === "adjustIn") adjustLoss -= x.value;
    else if (x.kind === "warranty") warrantyGain += x.value;
    if (x.kind === "adjustOut" || x.kind === "adjustIn" || x.kind === "warranty") byDoc.set(x.docId, (byDoc.get(x.docId) || 0) + (x.kind === "adjustOut" ? x.value : -x.value) * (x.kind === "warranty" ? -1 : 1));
  });
  return { cogs, adjustLoss, warrantyGain, byDoc };
}
