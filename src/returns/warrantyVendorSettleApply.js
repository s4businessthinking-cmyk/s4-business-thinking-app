/** BW06 — persist vendor receive voucher / purchase-bill debit (offline writes). */
import { offlineCreate, offlinePatch } from "../offline/offlineRepository";
import { deviceSerialTag, reserveShopSerial } from "../shared/appShared.jsx";
import { SETTLE_BY_WARRANTY, settleStatusPatch } from "../invoices/invoiceSettleKind.js";

const n2 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r2 = (v) => Math.round((n2(v) + Number.EPSILON) * 100) / 100;
const f2 = (v) => r2(v).toFixed(2);

async function nextPaymentNo(shopId, isOwner) {
  const serial = await reserveShopSerial(shopId, "lastPaymentSerial", 0);
  if (serial) return `PMT-${String(serial).padStart(4, "0")}`;
  const fallback = `PMT-${String(Date.now()).slice(-6)}`;
  return isOwner ? fallback : `${fallback}-${deviceSerialTag()}`;
}

/** Money in from company — purchasePayments isRefund, no PI allocation. */
export async function createWarrantyVendorReceiveVoucher({
  shopId, user, profile, isOwner, claim, amount, method, settleDate,
}) {
  const amt = r2(amount);
  if (!(amt > 0.009) || !method) return null;
  const nowIso = new Date().toISOString();
  const paymentNo = await nextPaymentNo(shopId, isOwner);
  const note = `Warranty receive · ${claim.claimNo || ""}`.trim();
  const payload = {
    shopId,
    paymentNo,
    vendorId: claim.vendorId || null,
    vendorName: claim.vendorName || "",
    vendorMobile: claim.vendorMobile || "",
    method,
    paymentDate: settleDate || claim.claimDate || String(nowIso).slice(0, 10),
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
  const res = await offlineCreate("purchasePayments", payload);
  return { id: res.documentId, no: paymentNo, col: "purchasePayments", data: { ...res.data, id: res.documentId } };
}

/** Raise amountPaid on vendor PI; settleKind warranty when closed. No stock. */
export async function applyWarrantyVendorDebit({ invoice, amount, user }) {
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
  await offlinePatch("purchaseInvoices", invoice.id, patch, invoice);
  return { ...patch, settleKindUsed: SETTLE_BY_WARRANTY };
}
