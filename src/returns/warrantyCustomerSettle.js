/**
 * BW05 — Customer money on a battery/company warranty claim (pure domain).
 * Product path already moves stock at replaced/delivered. Money path must NOT create a goods return
 * (that would double stock). Options: refund | credit (bill adjust).
 */

const n2 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r2 = (v) => Math.round((n2(v) + Number.EPSILON) * 100) / 100;

export const CUSTOMER_SETTLE_KINDS = {
  refund: { key: "refund", bn: "কাস্টমারকে টাকা ফেরত", en: "Refund to customer" },
  credit: { key: "credit", bn: "মূল বিল থেকে কেটে নিন", en: "Credit against bill" },
};

export function customerSettleLabel(kind, bn = false) {
  const row = CUSTOMER_SETTLE_KINDS[kind];
  if (!row) return bn ? "কোনো টাকা নয়" : "No money";
  return row[bn ? "bn" : "en"];
}

export function hasCustomerSettle(claim) {
  const kind = String(claim?.customerSettleKind || "");
  return (kind === "refund" || kind === "credit") && n2(claim?.customerSettleAmount) > 0.009;
}

/** Open claim, not cancelled, money not yet recorded. */
export function canRecordCustomerSettle(claim) {
  if (!claim || claim.isDeleted || claim.deleted) return false;
  if (claim.status === "cancelled") return false;
  if (hasCustomerSettle(claim)) return false;
  return true;
}

export function invoiceBalanceDue(invoice) {
  if (!invoice) return 0;
  if (invoice.balanceDue != null && Number.isFinite(Number(invoice.balanceDue))) {
    return r2(Math.max(0, n2(invoice.balanceDue)));
  }
  return r2(Math.max(0, n2(invoice.grandTotal) - n2(invoice.amountPaid)));
}

/**
 * "" when ok, else KIND | AMOUNT | METHOD | NO_INVOICE | INVOICE_MISSING | NO_DUE | OVER | ALREADY | CLOSED
 */
export function validateCustomerSettle({ claim, kind, amount, method, invoice } = {}) {
  if (!canRecordCustomerSettle(claim)) return "ALREADY";
  if (kind !== "refund" && kind !== "credit") return "KIND";
  const amt = r2(amount);
  if (!(amt > 0.009)) return "AMOUNT";
  if (kind === "refund") {
    if (!method) return "METHOD";
    return "";
  }
  if (!claim?.invoiceId && !claim?.invoiceNo) return "NO_INVOICE";
  if (!invoice || (claim.invoiceId && invoice.id !== claim.invoiceId)) return "INVOICE_MISSING";
  if (["cancelled", "draft"].includes(invoice.status)) return "CLOSED";
  const due = invoiceBalanceDue(invoice);
  if (!(due > 0.009)) return "NO_DUE";
  if (amt > due + 0.01) return "OVER";
  return "";
}

export function customerSettleErrorText(code, bn = false) {
  const map = {
    ALREADY: [bn ? "টাকা আগেই রেকর্ড হয়েছে" : "Money already recorded", "err"],
    KIND: [bn ? "রিফান্ড বা বিল ক্রেডিট বেছে নিন" : "Pick refund or bill credit", "err"],
    AMOUNT: [bn ? "টাকার পরিমাণ দিন" : "Enter an amount", "err"],
    METHOD: [bn ? "রিফান্ডের মাধ্যম বেছে নিন" : "Pick refund method", "err"],
    NO_INVOICE: [bn ? "মূল বিল লিংক নেই — ক্রেডিট করতে বিল লাগবে" : "No linked bill — credit needs the original invoice", "err"],
    INVOICE_MISSING: [bn ? "মূল বিল পাওয়া যায়নি" : "Linked bill not found", "err"],
    NO_DUE: [bn ? "বিলে বাকি নেই" : "Bill has no balance due", "err"],
    OVER: [bn ? "বাকির চেয়ে বেশি কাটা যাবে না" : "Cannot credit more than balance due", "err"],
    CLOSED: [bn ? "বিল বাতিল/ড্রাফট — ক্রেডিট নয়" : "Bill cancelled/draft — cannot credit", "err"],
  };
  return map[code] || [bn ? "সেটেল ব্যর্থ" : "Settle failed", "err"];
}

export function claimCustomerSettleFields({ kind, amount, method, settleDate, voucher = null }) {
  return {
    customerSettleKind: kind,
    customerSettleAmount: r2(amount),
    customerSettleMethod: kind === "refund" ? String(method || "") : "",
    customerSettleDate: String(settleDate || "").slice(0, 10),
    customerSettleAt: new Date().toISOString(),
    customerRefundVoucherId: voucher?.id || null,
    customerRefundVoucherNo: voucher?.no || "",
    customerRefundVoucherCol: voucher?.col || "",
  };
}
