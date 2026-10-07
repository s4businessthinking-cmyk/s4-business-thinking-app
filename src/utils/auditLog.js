import { offlineCreate } from "../offline/offlineRepository";

export const AUDIT_ACTIONS = {
  create: { bn: "তৈরি", en: "Created", color: "#16a34a" },
  edit: { bn: "এডিট", en: "Edited", color: "#2563eb" },
  cancel: { bn: "বাতিল", en: "Cancelled", color: "#f59e0b" },
  delete: { bn: "মুছে ফেলা", en: "Deleted", color: "#dc2626" },
  receive: { bn: "রিসিভ", en: "Received", color: "#0e7490" },
};

export const AUDIT_COLLECTION_LABELS = {
  salesInvoices: { bn: "সেলস ইনভয়েস", en: "Sales Invoice" },
  quotations: { bn: "কোটেশন", en: "Quotation" },
  deliveryNotes: { bn: "ডেলিভারি নোট", en: "Delivery Note" },
  purchaseInvoices: { bn: "পারচেজ ইনভয়েস", en: "Purchase Invoice" },
  salesReceipts: { bn: "রিসিট", en: "Receipt" },
  purchasePayments: { bn: "পেমেন্ট ভাউচার", en: "Payment Voucher" },
  salesReturns: { bn: "সেলস রিটার্ন", en: "Sales Return" },
  purchaseReturns: { bn: "পারচেজ রিটার্ন", en: "Purchase Return" },
  stockAdjustments: { bn: "স্টক সমন্বয়", en: "Stock Adjustment" },
  accountVouchers: { bn: "জার্নাল / কন্ট্রা", en: "Journal / Contra" },
  purchaseOrders: { bn: "পারচেজ অর্ডার", en: "Purchase Order" },
  salesOrders: { bn: "সেলস অর্ডার", en: "Sales Order" },
  goodsReceipts: { bn: "মাল গ্রহণ (DN Received)", en: "Delivery Note (Received)" },
  employees: { bn: "কর্মচারী", en: "Employee" },
  employeeDocs: { bn: "কর্মচারীর ডকুমেন্ট", en: "Employee Document" },
  attendance: { bn: "হাজিরা", en: "Attendance" },
  bankReconciliations: { bn: "ব্যাংক মেলানো", en: "Bank Reconciliation" },
  jobOrders: { bn: "জব অর্ডার", en: "Job Order" },
  partners: { bn: "পার্টনার", en: "Partner" },
  partnerEntries: { bn: "পার্টনারের লেনদেন", en: "Partner Entry" },
  partnerDocs: { bn: "পার্টনারের ডকুমেন্ট", en: "Partner Document" },
  expenses: { bn: "খরচ", en: "Expense" },
  branchTransfers: { bn: "ব্রাঞ্চ ট্রান্সফার", en: "Branch Transfer" },
  products: { bn: "পণ্য", en: "Product" },
  vendors: { bn: "ভেন্ডর", en: "Vendor" },
  customers: { bn: "কাস্টমার", en: "Customer" },
};

// Never throws: a failed log must not block the action it records.
export async function logAudit({ shopId, user, profile, action, collection, docId = "", docNo = "", amount = null, note = "" }) {
  if (!shopId || !user?.uid) return;
  try {
    await offlineCreate("auditLogs", {
      shopId,
      action,
      collection,
      docId: String(docId || ""),
      docNo: String(docNo || ""),
      amount: amount == null || amount === "" ? null : Number(amount) || 0,
      note: String(note || ""),
      byUid: user.uid,
      byName: profile?.personName || profile?.name || user?.displayName || "",
      byRole: profile?.role || "",
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("[S4 Audit] log failed", err);
  }
}
