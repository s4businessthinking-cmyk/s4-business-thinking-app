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

function addInvoices(invoices, shopId, into, sign, productById, statuses = STOCK_AFFECTING_STATUSES, dnById = null) {
  invoices.forEach((inv) => {
    if (!inv || inv.isDeleted || inv.deleted) return;
    if (shopId && inv.shopId && inv.shopId !== shopId) return;
    if (!statuses.includes(inv.status)) return;
    // A branch transfer only moves stock inside the same shop, so its internal purchase invoice is not new stock.
    if (inv.internalTransfer || inv.sourceType === "branch_transfer") return;
    if (sign < 0 && inv.deliveryNoteId) {
      // The delivery note already took its goods out; the invoice only moves what differs from the note.
      const dn = dnById?.get(inv.deliveryNoteId);
      if (!dn) return;
      const dnCounted = !dn.isDeleted && !dn.deleted && DELIVERY_NOTE_STOCK_STATUSES.includes(dn.status);
      const diff = itemsByProduct(inv.items, productById);
      if (dnCounted) itemsByProduct(dn.items, productById, diff, -1);
      diff.forEach((q, id) => { if (Math.abs(q) > 1e-9) into.set(id, (into.get(id) || 0) - q); });
      return;
    }
    itemsByProduct(inv.items, productById, into, sign);
  });
}

// Stock = opening stock + purchased − sold − delivered, from invoices (which sync across devices), in base units.
export function computeStockMap(products, purchaseInvoices, salesInvoices, shopId, deliveryNotes = []) {
  const productById = new Map((products || []).map((p) => [p.id, p]));
  const movement = new Map();
  addInvoices(purchaseInvoices || [], shopId, movement, 1, productById);
  const dnById = new Map((deliveryNotes || []).filter((d) => d?.id).map((d) => [d.id, d]));
  addInvoices(salesInvoices || [], shopId, movement, -1, productById, STOCK_AFFECTING_STATUSES, dnById);
  addInvoices(deliveryNotes || [], shopId, movement, -1, productById, DELIVERY_NOTE_STOCK_STATUSES);
  const stock = new Map();
  productById.forEach((p, id) => {
    stock.set(id, parseFloat(((Number(p.openingStock) || 0) + (movement.get(id) || 0)).toFixed(4)));
  });
  return stock;
}

export async function loadInvoiceRows() {
  const [pur, sal, dn] = await Promise.all([offlineList("purchaseInvoices"), offlineList("salesInvoices"), offlineList("deliveryNotes")]);
  return { purchaseInvoices: rowsOf(pur), salesInvoices: rowsOf(sal), deliveryNotes: rowsOf(dn) };
}
