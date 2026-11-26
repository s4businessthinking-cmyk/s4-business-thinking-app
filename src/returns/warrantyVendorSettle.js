/**
 * BW06 — Vendor / company money on a warranty claim (pure domain).
 * No goods return: stock stays on the guarantee product path.
 * - receive: cash/bank in from company (purchasePayments isRefund)
 * - debit: credit against an open purchase bill of that vendor (settleKind warranty)
 */

const n2 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r2 = (v) => Math.round((n2(v) + Number.EPSILON) * 100) / 100;

export const VENDOR_SETTLE_KINDS = {
  receive: { key: "receive", bn: "কোম্পানি থেকে টাকা পাওয়া", en: "Receive from company" },
  debit: { key: "debit", bn: "কোম্পানির বিল থেকে কেটে নিন", en: "Debit against vendor bill" },
};

export function vendorSettleLabel(kind, bn = false) {
  const row = VENDOR_SETTLE_KINDS[kind];
  if (!row) return bn ? "কোনো টাকা নয়" : "No money";
  return row[bn ? "bn" : "en"];
}

export function hasVendorSettle(claim) {
  const kind = String(claim?.vendorSettleKind || "");
  return (kind === "receive" || kind === "debit") && n2(claim?.vendorSettleAmount) > 0.009;
}

export function canRecordVendorSettle(claim) {
  if (!claim || claim.isDeleted || claim.deleted) return false;
  if (claim.status === "cancelled") return false;
  if (hasVendorSettle(claim)) return false;
  return true;
}

export function purchaseBalanceDue(invoice) {
  if (!invoice) return 0;
  if (invoice.balanceDue != null && Number.isFinite(Number(invoice.balanceDue))) {
    return r2(Math.max(0, n2(invoice.balanceDue)));
  }
  return r2(Math.max(0, n2(invoice.grandTotal) - n2(invoice.amountPaid)));
}

/** Open purchase bills of the claim vendor, oldest first. */
export function vendorOpenPurchaseBills({ invoices = [], vendorId = null, vendorName = "", limit = 25 } = {}) {
  const name = String(vendorName || "").trim().toLowerCase();
  return (invoices || [])
    .filter((inv) => inv && !inv.isDeleted && !inv.deleted)
    .filter((inv) => ["confirmed", "partial"].includes(inv.status))
    .filter((inv) => !inv.internalTransfer && inv.sourceType !== "branch_transfer")
    .filter((inv) => {
      if (vendorId) return inv.vendorId === vendorId;
      if (name) return String(inv.vendorName || "").trim().toLowerCase() === name;
      return false;
    })
    .filter((inv) => purchaseBalanceDue(inv) > 0.009)
    .sort((a, b) => String(a.invoiceDate || "").localeCompare(String(b.invoiceDate || "")))
    .slice(0, Math.max(1, limit))
    .map((inv) => ({
      invoiceId: inv.id,
      invoiceNo: inv.invoiceNo || "",
      invoiceDate: String(inv.invoiceDate || "").slice(0, 10),
      balanceDue: purchaseBalanceDue(inv),
      vendorName: inv.vendorName || "",
    }));
}

/**
 * "" when ok, else KIND | AMOUNT | METHOD | NO_VENDOR | INVOICE_MISSING | NO_DUE | OVER | ALREADY | CLOSED
 */
export function validateVendorSettle({ claim, kind, amount, method, invoice } = {}) {
  if (!canRecordVendorSettle(claim)) return "ALREADY";
  if (kind !== "receive" && kind !== "debit") return "KIND";
  const amt = r2(amount);
  if (!(amt > 0.009)) return "AMOUNT";
  if (!claim?.vendorId && !claim?.vendorName) return "NO_VENDOR";
  if (kind === "receive") {
    if (!method) return "METHOD";
    return "";
  }
  if (!invoice) return "INVOICE_MISSING";
  if (claim?.vendorId && invoice.vendorId && claim.vendorId !== invoice.vendorId) return "WRONG_VENDOR";
  if (!claim?.vendorId && claim?.vendorName) {
    const a = String(claim.vendorName || "").trim().toLowerCase();
    const b = String(invoice.vendorName || "").trim().toLowerCase();
    if (a && b && a !== b) return "WRONG_VENDOR";
  }
  if (["cancelled", "draft", "paid"].includes(invoice.status) && purchaseBalanceDue(invoice) < 0.01) return "CLOSED";
  if (["cancelled", "draft"].includes(invoice.status)) return "CLOSED";
  const due = purchaseBalanceDue(invoice);
  if (!(due > 0.009)) return "NO_DUE";
  if (amt > due + 0.01) return "OVER";
  return "";
}

export function vendorSettleErrorText(code, bn = false) {
  const map = {
    ALREADY: [bn ? "কোম্পানি টাকা আগেই রেকর্ড" : "Vendor money already recorded", "err"],
    KIND: [bn ? "রিসিভ বা বিল ডেবিট বেছে নিন" : "Pick receive or bill debit", "err"],
    AMOUNT: [bn ? "টাকার পরিমাণ দিন" : "Enter an amount", "err"],
    METHOD: [bn ? "মাধ্যম বেছে নিন" : "Pick method", "err"],
    NO_VENDOR: [bn ? "কোম্পানি নেই" : "No company on claim", "err"],
    INVOICE_MISSING: [bn ? "কোম্পানির বিল বেছে নিন" : "Pick a vendor bill", "err"],
    WRONG_VENDOR: [bn ? "বিল অন্য কোম্পানির — মিল নেই" : "Bill belongs to a different company", "err"],
    NO_DUE: [bn ? "বিলে বাকি নেই" : "Bill has no balance due", "err"],
    OVER: [bn ? "বাকির চেয়ে বেশি কাটা যাবে না" : "Cannot debit more than balance due", "err"],
    CLOSED: [bn ? "বিল বাতিল/ড্রাফট" : "Bill cancelled/draft", "err"],
  };
  return map[code] || [bn ? "সেটেল ব্যর্থ" : "Settle failed", "err"];
}

export function claimVendorSettleFields({ kind, amount, method, settleDate, voucher = null, invoice = null }) {
  return {
    vendorSettleKind: kind,
    vendorSettleAmount: r2(amount),
    vendorSettleMethod: kind === "receive" ? String(method || "") : "",
    vendorSettleDate: String(settleDate || "").slice(0, 10),
    vendorSettleAt: new Date().toISOString(),
    vendorReceiveVoucherId: voucher?.id || null,
    vendorReceiveVoucherNo: voucher?.no || "",
    vendorReceiveVoucherCol: voucher?.col || "",
    vendorDebitInvoiceId: kind === "debit" ? (invoice?.id || null) : null,
    vendorDebitInvoiceNo: kind === "debit" ? (invoice?.invoiceNo || "") : "",
  };
}
