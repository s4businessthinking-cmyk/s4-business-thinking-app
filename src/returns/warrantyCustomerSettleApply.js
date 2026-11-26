/** BW05 — persist customer refund voucher / bill credit (offline writes). */
import { offlineCreate, offlinePatch } from "../offline/offlineRepository";
import { deviceSerialTag, reserveShopSerial } from "../shared/appShared.jsx";
import { SETTLE_BY_WARRANTY, settleStatusPatch } from "../invoices/invoiceSettleKind.js";

const n2 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r2 = (v) => Math.round((n2(v) + Number.EPSILON) * 100) / 100;
const f2 = (v) => r2(v).toFixed(2);

async function nextReceiptNo(shopId, isOwner) {
  const serial = await reserveShopSerial(shopId, "lastReceiptSerial", 0);
  if (serial) return `RCT-${String(serial).padStart(4, "0")}`;
  const fallback = `RCT-${String(Date.now()).slice(-6)}`;
  return isOwner ? fallback : `${fallback}-${deviceSerialTag()}`;
}

/** Cash/bank refund out — no invoice allocation. */
export async function createWarrantyCustomerRefundVoucher({
  shopId, user, profile, isOwner, claim, amount, method, settleDate,
}) {
  const amt = r2(amount);
  if (!(amt > 0.009) || !method) return null;
  const nowIso = new Date().toISOString();
  const receiptNo = await nextReceiptNo(shopId, isOwner);
  const note = `Warranty refund · ${claim.claimNo || ""}${claim.invoiceNo ? ` · ${claim.invoiceNo}` : ""}`.trim();
  const payload = {
    shopId,
    receiptNo,
    customerId: claim.customerId || null,
    customerName: claim.customerName || "",
    customerMobile: claim.customerMobile || "",
    receiptDate: settleDate || claim.claimDate || String(nowIso).slice(0, 10),
    method,
    totalAmount: parseFloat(f2(amt)),
    chequeNo: "", chequeBank: "", chequeDate: "",
    chequeStatus: method === "cheque" ? "pending" : null,
    refNo: "", refBank: "", refDate: "",
    note,
    allocations: [],
    status: "active",
    isRefund: true,
    warrantyClaimId: claim.id,
    warrantyClaimNo: claim.claimNo || "",
    createdBy: user?.uid || "",
    createdByName: profile?.personName || "",
    createdAt: nowIso,
    updatedAt: nowIso,
    updatedBy: user?.uid || "",
  };
  const res = await offlineCreate("salesReceipts", payload);
  return { id: res.documentId, no: receiptNo, col: "salesReceipts", data: { ...res.data, id: res.documentId } };
}

/** Raise amountPaid on linked SI; settleKind = warranty when closed. No stock. */
export async function applyWarrantyCustomerCredit({ claim, invoice, amount, user }) {
  const amt = r2(amount);
  const paid = r2(n2(invoice.amountPaid) + amt);
  const total = r2(n2(invoice.grandTotal));
  const balance = r2(Math.max(0, total - paid));
  const settle = settleStatusPatch(balance, paid, { byWarranty: true });
  const nowIso = new Date().toISOString();
  const patch = {
    amountPaid: paid,
    balanceDue: balance,
    status: settle.status,
    settleKind: settle.settleKind,
    updatedAt: nowIso,
    updatedBy: user?.uid || "",
  };
  await offlinePatch("salesInvoices", invoice.id, patch, invoice);
  return { ...patch, settleKindUsed: SETTLE_BY_WARRANTY };
}
