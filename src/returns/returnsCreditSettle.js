import { offlinePatch } from "../offline/offlineRepository";
import { planSettleLeftoverReturnCredits } from "./returnsDomain.js";
import { cancelReturnRefundVoucher } from "./returnsRefundVoucher.js";

/**
 * Apply leftover purchase-return refund credit onto the vendor's open bills so cheque / last balance nets.
 * Idempotent when there is nothing left to settle.
 */
export async function settleLeftoverVendorReturnCredits({
  returns = [],
  invoices = [],
  vendorId = null,
  vendorName = "",
  user = null,
}) {
  const plan = planSettleLeftoverReturnCredits({
    returns,
    invoices,
    vendorId,
    vendorName,
    partyIdKey: "vendorId",
    partyNameKey: "vendorName",
  });
  if (!plan.invoicePatches.length && !plan.returnPatches.length) return plan;

  const nowIso = new Date().toISOString();
  const uid = user?.uid || "";

  for (const p of plan.invoicePatches) {
    await offlinePatch(
      "purchaseInvoices",
      p.id,
      {
        amountPaid: p.amountPaid,
        balanceDue: p.balanceDue,
        status: p.status,
        updatedAt: nowIso,
        updatedBy: uid,
      },
      p.prev,
    );
  }

  for (const p of plan.returnPatches) {
    if (p.clearRefundVoucher) {
      await cancelReturnRefundVoucher(p.prev, user);
    }
    const patch = {
      appliedToInvoice: p.appliedToInvoice,
      appliedAllocations: p.appliedAllocations,
      refundAmount: p.refundAmount,
      updatedAt: nowIso,
      updatedBy: uid,
    };
    if (p.clearRefundVoucher) {
      patch.refundMethod = "";
      patch.refundVoucherId = null;
      patch.refundVoucherNo = "";
      patch.refundVoucherCol = "";
    }
    await offlinePatch("purchaseReturns", p.id, patch, p.prev);
  }

  return plan;
}
