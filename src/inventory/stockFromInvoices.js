import { offlineList } from "../offline/offlineRepository";
import { itemBaseQty } from "./unitConversion";

const STOCK_AFFECTING_STATUSES = ["confirmed", "paid", "partial"];
const DELIVERY_NOTE_STOCK_STATUSES = ["confirmed", "invoiced"];

export function rowsOf(res) {
  const records = Array.isArray(res) ? res : (res?.records || []);
  return records.map((r) => ({ ...(r.data || r), id: r.data?.id || r.document_id || r.id }));
}

function itemsByProduct(items, productById, into = new Map(), sign = 1) {
  (items || []).forEach((it) => {
    if (!it?.productId) return;
    const qty = itemBaseQty(it, productById.get(it.productId));
    if (qty <= 0) return;
    into.set(it.productId, (into.get(it.productId) || 0) + sign * qty);
  });
  return into;
}

function addInvoices(invoices, shopId, into, sign, productById, statuses = STOCK_AFFECTING_STATUSES, dnById = null, grnById = null) {
  invoices.forEach((inv) => {
    if (!inv || inv.isDeleted || inv.deleted) return;
    if (shopId && inv.shopId && inv.shopId !== shopId) return;
    if (!statuses.includes(inv.status)) return;
    // A branch transfer only moves stock inside the same shop, so its internal purchase invoice is not new stock.
    if (inv.internalTransfer || inv.sourceType === "branch_transfer") return;
    // The delivery note (given or received) already moved its goods; the bill only moves what differs from the note.
    const linked = sign < 0 && inv.deliveryNoteId ? { note: dnById?.get(inv.deliveryNoteId), statuses: DELIVERY_NOTE_STOCK_STATUSES }
      : sign > 0 && inv.goodsReceiptId ? { note: grnById?.get(inv.goodsReceiptId), statuses: GOODS_RECEIPT_STOCK_STATUSES }
      : null;
    if (linked) {
      if (!linked.note) return;
      const noteCounted = !linked.note.isDeleted && !linked.note.deleted && linked.statuses.includes(linked.note.status);
      const diff = itemsByProduct(inv.items, productById);
      if (noteCounted) itemsByProduct(linked.note.items, productById, diff, -1);
      diff.forEach((q, id) => { if (Math.abs(q) > 1e-9) into.set(id, (into.get(id) || 0) + sign * q); });
      return;
    }
    itemsByProduct(inv.items, productById, into, sign);
  });
}

const RETURN_STOCK_STATUSES = ["confirmed"];
export const GOODS_RECEIPT_STOCK_STATUSES = ["confirmed", "invoiced"];

function addAdjustments(adjustments, shopId, into, productById) {
  (adjustments || []).forEach((adj) => {
    if (!adj || adj.isDeleted || adj.deleted || adj.status !== "confirmed") return;
    if (shopId && adj.shopId && adj.shopId !== shopId) return;
    (adj.items || []).forEach((it) => {
      if (!it?.productId) return;
      const qty = itemBaseQty(it, productById.get(it.productId));
      if (qty <= 0) return;
      into.set(it.productId, (into.get(it.productId) || 0) + (it.direction === "out" ? -qty : qty));
    });
  });
}

// Stock = opening stock + purchased + goods received − sold − delivered + sales returns − purchase returns ± adjustments, in base units.
export function computeStockMap(products, purchaseInvoices, salesInvoices, shopId, deliveryNotes = [], extras = {}) {
  const productById = new Map((products || []).map((p) => [p.id, p]));
  const movement = new Map();
  const grnById = new Map((extras.goodsReceipts || []).filter((g) => g?.id).map((g) => [g.id, g]));
  addInvoices(purchaseInvoices || [], shopId, movement, 1, productById, STOCK_AFFECTING_STATUSES, null, grnById);
  addInvoices(extras.goodsReceipts || [], shopId, movement, 1, productById, GOODS_RECEIPT_STOCK_STATUSES);
  const dnById = new Map((deliveryNotes || []).filter((d) => d?.id).map((d) => [d.id, d]));
  addInvoices(salesInvoices || [], shopId, movement, -1, productById, STOCK_AFFECTING_STATUSES, dnById);
  addInvoices(deliveryNotes || [], shopId, movement, -1, productById, DELIVERY_NOTE_STOCK_STATUSES);
  addInvoices(extras.salesReturns || [], shopId, movement, 1, productById, RETURN_STOCK_STATUSES);
  addInvoices(extras.purchaseReturns || [], shopId, movement, -1, productById, RETURN_STOCK_STATUSES);
  addAdjustments(extras.stockAdjustments, shopId, movement, productById);
  const stock = new Map();
  productById.forEach((p, id) => {
    stock.set(id, parseFloat(((Number(p.openingStock) || 0) + (movement.get(id) || 0)).toFixed(4)));
  });
  return stock;
}

export async function loadInvoiceRows() {
  const [pur, sal, dn, sr, pr, adj, grn] = await Promise.all([
    offlineList("purchaseInvoices"), offlineList("salesInvoices"), offlineList("deliveryNotes"),
    offlineList("salesReturns").catch(() => []), offlineList("purchaseReturns").catch(() => []), offlineList("stockAdjustments").catch(() => []),
    offlineList("goodsReceipts").catch(() => []),
  ]);
  const extras = { salesReturns: rowsOf(sr), purchaseReturns: rowsOf(pr), stockAdjustments: rowsOf(adj), goodsReceipts: rowsOf(grn) };
  return { purchaseInvoices: rowsOf(pur), salesInvoices: rowsOf(sal), deliveryNotes: rowsOf(dn), extras, ...extras };
}
