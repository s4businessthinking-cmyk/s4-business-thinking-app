// Accounting period lock (server copy of the app's src/accounts/periodLock.js — keep in step).
// Entries dated on or before shop.periodLock.lockDate cannot be added, changed, cancelled or
// deleted; payment bookkeeping on an old bill stays open.

export const LOCKED_COLLECTIONS = {
  salesInvoices: ["invoiceDate"],
  purchaseInvoices: ["invoiceDate"],
  deliveryNotes: ["invoiceDate"],
  salesReceipts: ["receiptDate"],
  purchasePayments: ["paymentDate"],
  supplierPayments: ["paymentDate"],
  expenses: ["expenseDate"],
  salesReturns: ["returnDate"],
  purchaseReturns: ["returnDate"],
  stockAdjustments: ["adjustDate"],
  accountVouchers: ["voucherDate"],
  goodsReceipts: ["receiveDate"],
  partnerEntries: ["date"],
};

const PROTECTED_FIELDS = new Set([
  "items", "lines", "allocations", "entries",
  "total", "grandTotal", "subtotal", "subTotal", "netTotal", "amount", "totalAmount",
  "vatAmount", "vatTotal", "taxTotal", "discount", "discountTotal", "debit", "credit", "qty",
  "customerId", "vendorId", "partnerId", "accountId", "kind", "method", "isDeleted",
]);

export function dayOf(v) {
  if (!v) return "";
  if (typeof v === "string") return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : "";
  if (typeof v === "object" && Number.isFinite(v.seconds)) return new Date(v.seconds * 1000).toISOString().slice(0, 10);
  if (typeof v === "number") return new Date(v).toISOString().slice(0, 10);
  return "";
}

function recordDay(collection, rec) {
  if (!rec) return "";
  for (const f of LOCKED_COLLECTIONS[collection] || []) {
    const d = dayOf(rec[f]);
    if (d) return d;
  }
  return dayOf(rec.date);
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function protectedChange(collection, before, after) {
  const dateFields = new Set([...(LOCKED_COLLECTIONS[collection] || []), "date"]);
  for (const k of new Set([...Object.keys(before || {}), ...Object.keys(after || {})])) {
    if ((PROTECTED_FIELDS.has(k) || dateFields.has(k)) && !same(before?.[k], after?.[k])) return true;
  }
  return after?.status === "cancelled" && before?.status !== "cancelled";
}

export function periodLockBlocks({ collection, op, before = null, after = null, lockDate }) {
  if (!lockDate || !LOCKED_COLLECTIONS[collection]) return false;
  const beforeDay = recordDay(collection, before);
  const afterDay = recordDay(collection, after);
  if (op === "delete") return !!beforeDay && beforeDay <= lockDate;
  if (!before) return !!afterDay && afterDay <= lockDate;
  if (beforeDay && beforeDay <= lockDate) return protectedChange(collection, before, after);
  return !!afterDay && afterDay <= lockDate;
}
