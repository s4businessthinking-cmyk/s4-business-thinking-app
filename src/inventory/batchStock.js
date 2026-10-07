import { itemBaseQty } from "./unitConversion.js";

const STOCK_STATUSES = ["confirmed", "paid", "partial"];
const DN_STATUSES = ["confirmed", "invoiced"];
const RETURN_STATUSES = ["confirmed"];
const num = (v) => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
const r4 = (v) => Math.round(num(v) * 10000) / 10000;

const liveDoc = (d, shopId, statuses) => d && !d.isDeleted && !d.deleted && (!shopId || !d.shopId || d.shopId === shopId) && statuses.includes(d.status);

// Batches are purchase lines kept as separate stock; everything else (opening stock, merged purchases) is the main stock.
// Sales, delivery notes and returns move a batch only when their line carries its batchNo.
export function batchStockByProduct(products, data, shopId, stockMap) {
  const productById = new Map((products || []).map((p) => [p.id, p]));
  const byProduct = new Map();
  const batchOf = (productId, batchNo) => {
    if (!byProduct.has(productId)) byProduct.set(productId, new Map());
    const m = byProduct.get(productId);
    if (!m.has(batchNo)) m.set(batchNo, { batchNo, productId, date: "", invoiceNo: "", vendorName: "", cost: 0, mrp: 0, qtyIn: 0, qtyOut: 0 });
    return m.get(batchNo);
  };
  const each = (docs, statuses, fn) => (docs || []).forEach((d) => {
    if (!liveDoc(d, shopId, statuses)) return;
    (d.items || []).forEach((it) => { if (it?.productId && it.batchNo) fn(d, it, itemBaseQty(it, productById.get(it.productId))); });
  });

  each(data?.purchaseInvoices, STOCK_STATUSES, (inv, it, qty) => {
    if (inv.internalTransfer || inv.sourceType === "branch_transfer") return;
    const b = batchOf(it.productId, it.batchNo);
    b.qtyIn += qty;
    b.date = inv.invoiceDate || b.date;
    b.invoiceNo = inv.invoiceNo || b.invoiceNo;
    b.vendorName = inv.vendorName || b.vendorName;
    const factor = qty > 0 && num(it.qty) > 0 ? qty / num(it.qty) : 1;
    if (qty > 0) b.cost = r4((num(it.lineTotal) - num(it.taxAmt)) / qty);
    if (num(it.salePrice) > 0) b.mrp = r4(num(it.salePrice) / factor);
  });
  // A sales invoice made from a delivery note does not move stock again; the note already did.
  each((data?.salesInvoices || []).filter((inv) => !inv.deliveryNoteId && inv.docKind !== "quotation"), STOCK_STATUSES, (inv, it, qty) => { batchOf(it.productId, it.batchNo).qtyOut += qty; });
  each(data?.deliveryNotes, DN_STATUSES, (dn, it, qty) => { batchOf(it.productId, it.batchNo).qtyOut += qty; });
  each(data?.extras?.salesReturns, RETURN_STATUSES, (r, it, qty) => { batchOf(it.productId, it.batchNo).qtyOut -= qty; });
  each(data?.extras?.purchaseReturns, RETURN_STATUSES, (r, it, qty) => { batchOf(it.productId, it.batchNo).qtyIn -= qty; });

  const out = new Map();
  byProduct.forEach((m, productId) => {
    const batches = [...m.values()]
      .filter((b) => b.date || b.qtyIn)
      .map((b) => ({ ...b, qtyIn: r4(b.qtyIn), qtyOut: r4(b.qtyOut), stock: r4(b.qtyIn - b.qtyOut) }))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.batchNo.localeCompare(b.batchNo));
    if (!batches.length) return;
    const total = num(stockMap?.get(productId));
    out.set(productId, { main: r4(total - batches.reduce((t, b) => t + b.stock, 0)), total, batches });
  });
  return out;
}

// What the batch window offers when selling: the main stock and every batch that still has stock.
export function saleBatchChoices(info) {
  if (!info) return [];
  const list = [];
  if (info.main > 0) list.push({ batchNo: "", stock: info.main, isMain: true });
  info.batches.forEach((b) => { if (b.stock > 0) list.push(b); });
  return list;
}
