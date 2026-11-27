import { buildInternalPurchaseInvoice, isPeerTransfer } from "./branchTransferDomain.js";
import { dueToBranchAccountName, dueToHqAccountName } from "./interCompanyAccounts.js";

export function buildChildCompanyReceiptInvoice({
  transfer,
  receipt,
  childShopId,
  actor,
  invoiceId,
}) {
  const id = invoiceId || `pi-ic-${receipt.id}`;
  const base = buildInternalPurchaseInvoice({
    transfer,
    receipt,
    shop: { id: childShopId },
    actor,
    invoiceId: id,
    paymentMethod: transfer?.purchaseInvoicePaymentMethod,
    createdAt: receipt.receivedAt,
  });
  const transferNo = String(transfer?.transferNo || transfer?.id || "TRANSFER");
  const peer = isPeerTransfer(transfer);
  const sourceLabel = peer
    ? (transfer.sourceBranchName || transfer.sourceShopName || "Branch")
  : "HQ";
  const interCompanyDueAccount = peer
    ? dueToBranchAccountName(transfer.sourceBranchName || transfer.sourceShopName)
    : dueToHqAccountName();
  return {
    ...base,
    id,
    shopId: childShopId,
    invoiceNo: `PI-IC-${transferNo}-${receipt.sequence || 1}`,
    internalTransfer: false,
    interCompanyIn: true,
    interCompanyDueAccount,
    sourceShopId: peer ? (transfer.sourceLedgerShopId || transfer.shopId) : transfer.shopId,
    vendorName: String(transfer?.vendorName || sourceLabel).trim() || sourceLabel,
    stockLocation: "main",
    stockLocationName: transfer.branchName || "Main",
    excludeFromSupplierPayable: true,
    sourceType: "inter_company_in",
  };
}