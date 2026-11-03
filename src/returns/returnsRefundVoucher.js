import { offlineCreate, offlinePatch } from "../offline/offlineRepository";
import { deviceSerialTag, reserveShopSerial } from "../shared/appShared.jsx";

const n2 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r2 = (v) => Math.round((n2(v) + Number.EPSILON) * 100) / 100;
const f2 = (v) => r2(v).toFixed(2);

async function nextVoucherNo(shopId, serialField, prefix, isOwner) {
  const serial = await reserveShopSerial(shopId, serialField, 0);
  if (serial) return `${prefix}-${String(serial).padStart(4, "0")}`;
  const fallback = `${prefix}-${String(Date.now()).slice(-6)}`;
  return isOwner ? fallback : `${fallback}-${deviceSerialTag()}`;
}

/**
 * Create a real receipt/payment voucher for the cash refund side of a return.
 * Does NOT touch invoice amountPaid (appliedToInvoice already handled that).
 * Sales refund → salesReceipts with isRefund (bank dir out).
 * Purchase refund → purchasePayments with isRefund (bank dir in).
 */
export async function createReturnRefundVoucher({
  kind, shopId, user, profile, isOwner, ret, invoice, refundAmount, refundMethod, returnDate,
}) {
  const amt = r2(refundAmount);
  if (!(amt > 0.009) || !refundMethod) return null;
  const nowIso = new Date().toISOString();
  const note = `Refund for ${ret.returnNo || ""} · ${invoice?.invoiceNo || ret.invoiceNo || ""}`.trim();

  if (kind === "sales") {
    const receiptNo = await nextVoucherNo(shopId, "lastReceiptSerial", "RCT", isOwner);
    const payload = {
      shopId,
      receiptNo,
      customerId: ret.partyId || null,
      customerName: ret.partyName || "",
      customerMobile: ret.partyMobile || "",
      receiptDate: returnDate || ret.returnDate,
      method: refundMethod,
      totalAmount: parseFloat(f2(amt)),
      chequeNo: "", chequeBank: "", chequeDate: "",
      chequeStatus: refundMethod === "cheque" ? "pending" : null,
      refNo: "", refBank: "", refDate: "",
      note,
      // Cash refund linked via returnId only — no invoice alloc (avoids AR/AP double-count).
      allocations: [],
      status: "active",
      isRefund: true,
      returnId: ret.id,
      returnNo: ret.returnNo || "",
      createdBy: user?.uid || "",
      createdByName: profile?.personName || "",
      createdAt: nowIso,
      updatedAt: nowIso,
      updatedBy: user?.uid || "",
    };
    const res = await offlineCreate("salesReceipts", payload);
    return { id: res.documentId, no: receiptNo, col: "salesReceipts", data: { ...res.data, id: res.documentId } };
  }

  const paymentNo = await nextVoucherNo(shopId, "lastPaymentSerial", "PMT", isOwner);
  const payload = {
    shopId,
    paymentNo,
    vendorId: ret.partyId || null,
    vendorName: ret.partyName || "",
    vendorMobile: ret.partyMobile || "",
    method: refundMethod,
    paymentDate: returnDate || ret.returnDate,
    totalAmount: parseFloat(f2(amt)),
    chequeNo: "", chequeBank: "", chequeDate: "",
    chequeStatus: refundMethod === "cheque" ? "pending" : null,
    refNo: "", refBank: "", refDate: "",
    note,
    allocations: [],
    status: "active",
    isRefund: true,
    returnId: ret.id,
    returnNo: ret.returnNo || "",
    createdBy: user?.uid || "",
    createdByName: profile?.personName || "",
    createdAt: nowIso,
    updatedAt: nowIso,
    updatedBy: user?.uid || "",
  };
  const res = await offlineCreate("purchasePayments", payload);
  return { id: res.documentId, no: paymentNo, col: "purchasePayments", data: { ...res.data, id: res.documentId } };
}

export async function cancelReturnRefundVoucher(ret, user) {
  if (!ret?.refundVoucherId || !ret?.refundVoucherCol) return null;
  const nowIso = new Date().toISOString();
  const patch = {
    status: "cancelled",
    cancelledAt: nowIso,
    cancelledBy: user?.uid || "",
    updatedAt: nowIso,
    updatedBy: user?.uid || "",
  };
  try {
    await offlinePatch(ret.refundVoucherCol, ret.refundVoucherId, patch, { id: ret.refundVoucherId, status: "active" });
  } catch (err) {
    console.warn("[S4 Return] refund voucher cancel failed", err);
  }
  return patch;
}
