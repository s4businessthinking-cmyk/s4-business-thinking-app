import { checkJournal } from "../vouchers/accountVoucherDomain.js";
import { dueFromBranchAccountName } from "./interCompanyAccounts.js";
import { isPeerTransfer, numberValue, roundMoney } from "./branchTransferDomain.js";

export function interCompanyReceiptValue(receipt) {
  return roundMoney(
    (receipt?.lines || []).reduce(
      (sum, line) => sum + numberValue(line.acceptedQty) * roundMoney(line.unitCost),
      0
    )
  );
}

export function buildHqInterCompanyJournal({ transfer, receipt, branchName, actor }) {
  const amount = interCompanyReceiptValue(receipt);
  if (amount <= 0) return null;
  const id = `ic-jv-hq-${receipt.id}`;
  const due = dueFromBranchAccountName(branchName || transfer.branchName);
  const transferNo = String(transfer?.transferNo || transfer?.id || "TRANSFER");
  const lines = [
    { account: due, debit: amount, credit: 0, note: "Stock to branch company file" },
    { account: "Purchase", debit: 0, credit: amount, note: "Inter-company stock out" },
  ];
  const checked = checkJournal(lines);
  if (checked.error) return null;
  const day = String(receipt?.receivedAt || new Date().toISOString()).slice(0, 10);
  return {
    id,
    shopId: transfer.shopId,
    voucherType: "journal",
    voucherNo: `JV-IC-${transferNo}-${receipt.sequence || 1}`,
    voucherDate: day,
    status: "active",
    narration: `Inter-company stock to ${branchName || transfer.branchName || "branch"} · ${transferNo}`,
    lines: checked.rows,
    totalAmount: amount,
    interCompanyOut: true,
    branchTransferId: transfer.id,
    branchTransferReceiptId: receipt.id,
    createdBy: actor?.uid || actor?.localUserId || "",
    createdByName: actor?.personName || "",
    createdAt: receipt.receivedAt || new Date().toISOString(),
    updatedAt: receipt.receivedAt || new Date().toISOString(),
  };
}

/** Sender company file (peer): stock out to another branch company file. */
export function buildSenderInterCompanyJournal({ transfer, receipt, destinationBranchName, actor }) {
  const amount = interCompanyReceiptValue(receipt);
  if (amount <= 0) return null;
  const sourceShopId = String(transfer?.sourceLedgerShopId || "").trim();
  if (!sourceShopId || sourceShopId === transfer?.shopId) return null;
  if (!isPeerTransfer(transfer)) return null;
  const id = `ic-jv-send-${receipt.id}`;
  const dest = destinationBranchName || transfer.branchName || "branch";
  const due = dueFromBranchAccountName(dest);
  const transferNo = String(transfer?.transferNo || transfer?.id || "TRANSFER");
  const lines = [
    { account: due, debit: amount, credit: 0, note: "Inter-company stock to branch" },
    { account: "Purchase", debit: 0, credit: amount, note: "Inter-company stock out" },
  ];
  const checked = checkJournal(lines);
  if (checked.error) return null;
  const day = String(receipt?.receivedAt || new Date().toISOString()).slice(0, 10);
  return {
    id,
    shopId: sourceShopId,
    voucherType: "journal",
    voucherNo: `JV-IC-OUT-${transferNo}-${receipt.sequence || 1}`,
    voucherDate: day,
    status: "active",
    narration: `Inter-company stock to ${dest} · ${transferNo}`,
    lines: checked.rows,
    totalAmount: amount,
    interCompanyOut: true,
    branchTransferId: transfer.id,
    branchTransferReceiptId: receipt.id,
    createdBy: actor?.uid || actor?.localUserId || "",
    createdByName: actor?.personName || "",
    createdAt: receipt.receivedAt || new Date().toISOString(),
    updatedAt: receipt.receivedAt || new Date().toISOString(),
  };
}