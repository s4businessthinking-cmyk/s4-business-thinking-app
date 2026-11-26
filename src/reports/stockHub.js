// Stock Hub: on-hand, movement, item ledger and valuation from the saved documents, one line per product per
// document. The rules are the ones computeStockMap (inventory/stockFromInvoices.js) uses for the stock shown
// everywhere else, so opening + movements here always lands on the same quantity; the screen checks that per product.
// - purchases, goods received, sales returns and warranty replacements bring stock in; sales, delivery notes and
//   purchase returns take it out; adjustments go either way;
// - a bill linked to a delivery note / goods receipt moves only what differs from the note;
// - branch-transfer purchase bills move nothing (the goods stay inside the shop);
// - drafts, cancelled and deleted documents move nothing.
// Each line also carries the godown the document names (locationId; a return takes its bill's when it has none, a bill
// linked to a note takes the note's) - inventory/stockLocations.js documentMoves places the stock there.
import { itemBaseQty } from "../inventory/unitConversion.js";

const INVOICE_STATUSES = ["confirmed", "paid", "partial"];
const NOTE_STATUSES = ["confirmed", "invoiced"];
const RETURN_STATUSES = ["confirmed"];

const q4 = (v) => parseFloat((Number(v) || 0).toFixed(4));
const r2 = (v) => Math.round(((Number(v) || 0) + Number.EPSILON) * 100) / 100;
const day = (v) => String(v || "").slice(0, 10);
const liveDoc = (d, shopId) => d && !d.isDeleted && !d.deleted && (!shopId || !d.shopId || d.shopId === shopId);
const docNo = (d) => d.invoiceNo || d.docNo || d.grnNo || d.returnNo || d.adjustNo || d.claimNo || "";
const partyOf = (d) => d.customerName || d.vendorName || d.partyName || "";

function qtyByProduct(items, productById, into = new Map(), sign = 1) {
  (items || []).forEach((it) => {
    if (!it?.productId) return;
    const q = itemBaseQty(it, productById.get(it.productId));
    if (q <= 0) return;
    into.set(it.productId, (into.get(it.productId) || 0) + sign * q);
  });
  return into;
}

/**
 * rows: loadInvoiceRows() result. -> movements sorted by date:
 * [{ date, col, docId, no, party, kind, productId, qtyIn, qtyOut, locationId }] in base units ("" = main location).
 */
export function stockMovements(products, rows, shopId) {
  const productById = new Map((products || []).filter((p) => p?.id).map((p) => [p.id, p]));
  const x = rows?.extras || rows || {};
  const out = [];
  const salesById = new Map((rows?.salesInvoices || []).filter((d) => d?.id).map((d) => [d.id, d]));
  const purchById = new Map((rows?.purchaseInvoices || []).filter((d) => d?.id).map((d) => [d.id, d]));
  const locOf = (doc, col) => String(doc.locationId || (col === "salesReturns" ? salesById.get(doc.invoiceId)?.locationId : col === "purchaseReturns" ? purchById.get(doc.invoiceId)?.locationId : "") || "").trim();
  const push = (doc, col, kind, date, byProduct, sign, locationId = locOf(doc, col)) => {
    byProduct.forEach((q, productId) => {
      if (!productById.has(productId) || Math.abs(q) < 1e-9) return;
      const signed = sign * q;
      out.push({ date: day(date), col, docId: doc.id, no: docNo(doc), party: partyOf(doc), kind, productId, qtyIn: q4(Math.max(0, signed)), qtyOut: q4(Math.max(0, -signed)), locationId });
    });
  };
  const grnById = new Map((x.goodsReceipts || []).filter((g) => g?.id).map((g) => [g.id, g]));
  const dnById = new Map((rows?.deliveryNotes || []).filter((d) => d?.id).map((d) => [d.id, d]));
  const bills = (list, col, kind, sign, statuses, dateOf, noteById, noteField) => (list || []).forEach((doc) => {
    if (!liveDoc(doc, shopId) || !statuses.includes(doc.status)) return;
    if (doc.internalTransfer || doc.sourceType === "branch_transfer") return;
    const noteId = noteField ? doc[noteField] : "";
    if (noteId) {
      const note = noteById.get(noteId);
      if (!note) return;
      const diff = qtyByProduct(doc.items, productById);
      if (!note.isDeleted && !note.deleted && NOTE_STATUSES.includes(note.status)) qtyByProduct(note.items, productById, diff, -1);
      push(doc, col, kind, dateOf(doc), diff, sign, locOf(doc, col) || String(note.locationId || "").trim());
      return;
    }
    push(doc, col, kind, dateOf(doc), qtyByProduct(doc.items, productById), sign);
  });

  bills(rows?.purchaseInvoices, "purchaseInvoices", "purchase", 1, INVOICE_STATUSES, (d) => d.invoiceDate, grnById, "goodsReceiptId");
  bills(x.goodsReceipts, "goodsReceipts", "goodsReceipt", 1, NOTE_STATUSES, (d) => d.receiveDate || d.invoiceDate);
  bills(rows?.salesInvoices, "salesInvoices", "sale", -1, INVOICE_STATUSES, (d) => d.invoiceDate, dnById, "deliveryNoteId");
  bills(rows?.deliveryNotes, "deliveryNotes", "delivery", -1, NOTE_STATUSES, (d) => d.invoiceDate);
  bills(x.salesReturns, "salesReturns", "salesReturn", 1, RETURN_STATUSES, (d) => d.returnDate);
  bills(x.purchaseReturns, "purchaseReturns", "purchaseReturn", -1, RETURN_STATUSES, (d) => d.returnDate);
  (x.stockAdjustments || []).forEach((adj) => {
    if (!liveDoc(adj, shopId) || adj.status !== "confirmed") return;
    const m = new Map();
    (adj.items || []).forEach((it) => {
      if (!it?.productId) return;
      const q = itemBaseQty(it, productById.get(it.productId));
      if (q <= 0) return;
      m.set(it.productId, (m.get(it.productId) || 0) + (it.direction === "out" ? -q : q));
    });
    push(adj, "stockAdjustments", "adjustment", adj.adjustDate || adj.createdAt, m, 1);
  });
  (x.warrantyClaims || []).forEach((c) => {
    if (!liveDoc(c, shopId) || c.status !== "replaced") return;
    const productId = c.replacedProductId || c.productId;
    if (!productId) return;
    const q = itemBaseQty({ productId, qty: c.qty, unitFactor: c.unitFactor || 1 }, productById.get(productId));
    if (q <= 0) return;
    push(c, "warrantyClaims", "warranty", c.replacedDate || c.claimDate, new Map([[productId, q]]), 1);
  });
  return out.sort((a, b) => a.date.localeCompare(b.date) || String(a.no).localeCompare(String(b.no), undefined, { numeric: true }));
}

/** Opening stock from the product master: Map(productId -> base qty). It has no date, so it comes before everything. */
export const openingQty = (products) => new Map((products || []).filter((p) => p?.id).map((p) => [p.id, Number(p.openingStock) || 0]));

/** On hand on a date (all when empty): Map(productId -> qty). */
export function onHandAt(products, movements, asOf = "") {
  const m = openingQty(products);
  (movements || []).forEach((mv) => {
    if (asOf && mv.date > asOf) return;
    if (m.has(mv.productId)) m.set(mv.productId, m.get(mv.productId) + mv.qtyIn - mv.qtyOut);
  });
  m.forEach((v, k) => m.set(k, q4(v)));
  return m;
}

/** Per product in a date range: { in, out, net, docs, last } - the moving-item view. */
export function movementByProduct(movements, { from = "", to = "" } = {}) {
  const m = new Map();
  (movements || []).forEach((mv) => {
    if ((from && mv.date < from) || (to && mv.date > to)) return;
    const r = m.get(mv.productId) || { in: 0, out: 0, docs: 0, last: "" };
    r.in = q4(r.in + mv.qtyIn);
    r.out = q4(r.out + mv.qtyOut);
    r.docs += 1;
    if (mv.date > r.last) r.last = mv.date;
    m.set(mv.productId, r);
  });
  m.forEach((r) => { r.net = q4(r.in - r.out); });
  return m;
}

/** One product: opening before `from`, the movements inside with a running quantity, closing. */
export function itemLedger(products, movements, productId, { from = "", to = "" } = {}) {
  const p = (products || []).find((x) => x?.id === productId);
  let opening = Number(p?.openingStock) || 0;
  const lines = [];
  (movements || []).forEach((mv) => {
    if (mv.productId !== productId || (to && mv.date > to)) return;
    if (from && mv.date < from) { opening += mv.qtyIn - mv.qtyOut; return; }
    lines.push(mv);
  });
  let run = q4(opening);
  const out = lines.map((mv) => { run = q4(run + mv.qtyIn - mv.qtyOut); return { ...mv, balance: run }; });
  return {
    opening: q4(opening), lines: out, qtyIn: q4(lines.reduce((t, l) => t + l.qtyIn, 0)), qtyOut: q4(lines.reduce((t, l) => t + l.qtyOut, 0)), closing: run,
  };
}

/**
 * qty: Map(productId -> on hand), cost: Map(productId -> average cost per base unit).
 * Negative stock is listed but not valued; a positive quantity without a cost is valued at 0 and flagged.
 * -> { rows: [{ id, code, name, brand, category, unit, qty, cost, value }], total, unpriced, negative, byCategory: [{ name, qty, value }] }
 */
export function valuation(products, qty, cost) {
  const rows = [];
  let total = 0, unpriced = 0, negative = 0;
  const cat = new Map();
  (products || []).forEach((p) => {
    if (!p?.id) return;
    const q = q4(qty?.get(p.id) || 0);
    if (Math.abs(q) < 1e-9) return;
    const c = Number(cost?.get(p.id)) || 0;
    const value = q > 0 ? r2(q * c) : 0;
    if (q < 0) negative += 1;
    else if (!c) unpriced += 1;
    total += value;
    const name = String(p.category || "").trim() || "-";
    const g = cat.get(name) || { name, qty: 0, value: 0 };
    g.qty = q4(g.qty + Math.max(0, q));
    g.value = r2(g.value + value);
    cat.set(name, g);
    rows.push({ id: p.id, code: p.code || p.barcode || "", name: p.name || p.id, brand: p.brand || "", category: p.category || "", unit: p.unit || "", qty: q, cost: r2(c), value });
  });
  return { rows, total: r2(total), unpriced, negative, byCategory: [...cat.values()].sort((a, b) => b.value - a.value) };
}

/**
 * Branch stock from the branch-transfer balances (received at the branch) less what the branch sold.
 * balances: branchStockBalances rows, sold: Map("branchId|productId" -> qty), shopQty: Map(productId -> shop total).
 * -> { rows: [{ branchId, branchName, productId, received, sold, current }], atBranches: Map(productId -> qty), main: Map(productId -> qty) }
 */
export function branchStock(balances, sold, shopQty, branches = []) {
  const names = new Map((branches || []).map((b) => [b.id, b.name]));
  const rows = (balances || []).filter((b) => b && !b.isDeleted && b.productId).map((b) => {
    const received = Number(b.quantity) || 0;
    const s = sold?.get(`${b.branchId}|${b.productId}`) || 0;
    return { branchId: b.branchId, branchName: names.get(b.branchId) || b.branchName || b.branchId, productId: b.productId, received: q4(received), sold: q4(s), current: q4(received - s) };
  }).filter((r) => r.received || r.current);
  const atBranches = new Map();
  rows.forEach((r) => atBranches.set(r.productId, q4((atBranches.get(r.productId) || 0) + Math.max(0, r.current))));
  const main = new Map();
  (shopQty || new Map()).forEach((q, id) => main.set(id, q4(q - (atBranches.get(id) || 0))));
  return { rows, atBranches, main };
}

/** Product search over code, name, brand, category, barcode and rack. */
export function productMatches(p, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  return [p?.code, p?.name, p?.brand, p?.category, p?.barcode, p?.rackLocation].some((v) => String(v || "").toLowerCase().includes(q));
}
