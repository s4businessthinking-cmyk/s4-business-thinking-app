// Accounting period lock: once the owner closes the books up to a date, entries dated
// on or before it cannot be added, changed, cancelled or deleted. Payment bookkeeping on
// an old bill (amount paid / balance) stays open so new receipts can still settle it.
// Keep in step with erp-server/src/periodLock.js.

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
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  if (typeof v === "object" && Number.isFinite(v.seconds)) return new Date(v.seconds * 1000).toISOString().slice(0, 10);
  if (typeof v === "number") return new Date(v).toISOString().slice(0, 10);
  return "";
}

export function recordDay(collection, rec) {
  if (!rec) return "";
  for (const f of LOCKED_COLLECTIONS[collection] || []) {
    const d = dayOf(rec[f]);
    if (d) return d;
  }
  return dayOf(rec.date);
}

export function periodLockOf(shop) {
  const p = shop?.periodLock || {};
  const lockDate = dayOf(p.lockDate);
  return { ...p, lockDate };
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function protectedChange(collection, before, after) {
  const dateFields = new Set([...(LOCKED_COLLECTIONS[collection] || []), "date"]);
  for (const k of new Set([...Object.keys(before || {}), ...Object.keys(after || {})])) {
    if ((PROTECTED_FIELDS.has(k) || dateFields.has(k)) && !same(before?.[k], after?.[k])) return k;
  }
  if (after?.status === "cancelled" && before?.status !== "cancelled") return "status";
  return "";
}

// op: "create" | "update" | "delete". `after` is the whole record after the write.
// Returns "" when allowed, otherwise the locked day that blocks it.
export function periodLockBlock({ collection, op, before = null, after = null, lockDate }) {
  if (!lockDate || !LOCKED_COLLECTIONS[collection]) return "";
  const beforeDay = recordDay(collection, before);
  const afterDay = recordDay(collection, after);
  if (op === "delete") return beforeDay && beforeDay <= lockDate ? beforeDay : "";
  if (!before) return afterDay && afterDay <= lockDate ? afterDay : "";
  if (beforeDay && beforeDay <= lockDate) return protectedChange(collection, before, after) ? beforeDay : "";
  return afterDay && afterDay <= lockDate ? afterDay : "";
}

export function periodLockMessage(lockDate) {
  return `🔒 ${lockDate} পর্যন্ত হিসাব বন্ধ (লক) করা আছে — এই তারিখের এন্ট্রি যোগ / এডিট / বাতিল করা যাবে না। মালিক সেটিংস → হিসাব বছর বন্ধ থেকে তারিখ বদলাতে পারেন। (Books are locked up to ${lockDate}.)`;
}

let activeLockDate = "";
let bypassDepth = 0;

export function setActivePeriodLock(lockDate) {
  activeLockDate = dayOf(lockDate);
}

export function activePeriodLock() {
  return activeLockDate;
}

// Internal moves of existing data (e.g. migrations) that must not be stopped by the lock.
export async function withoutPeriodLock(fn) {
  bypassDepth += 1;
  try {
    return await fn();
  } finally {
    bypassDepth -= 1;
  }
}

export function assertPeriodOpen(collection, op, before, after) {
  if (bypassDepth > 0 || !activeLockDate) return;
  const day = periodLockBlock({ collection, op, before, after, lockDate: activeLockDate });
  if (!day) return;
  const err = new Error(periodLockMessage(activeLockDate));
  err.code = "PERIOD_LOCKED";
  err.lockDate = activeLockDate;
  err.day = day;
  throw err;
}
