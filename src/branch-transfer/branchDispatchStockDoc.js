import { numberValue } from "./branchTransferDomain.js";

function dispatchAdjustId(transferId) {
  return `sa-bt-dispatch-${transferId}`;
}

export function buildHqDispatchStockAdjustDoc({ transfer, actor, dispatchShopId = "" }) {
  const shopId = String(dispatchShopId || transfer?.shopId || "").trim();
  if (!transfer?.id || !shopId) return null;
  const items = (transfer.items || []).filter((it) => numberValue(it.quantity) > 0);
  if (!items.length) return null;
  const id = dispatchAdjustId(transfer.id);
  const day = String(transfer.dispatchedAt || new Date().toISOString()).slice(0, 10);
  return {
    id,
    shopId,
    adjustNo: `SA-BT-${transfer.transferNo || transfer.id}`,
    adjustDate: day,
    reason: "branch_transfer_out",
    note: `Branch transfer dispatch · ${transfer.transferNo || transfer.id} · ${transfer.branchName || ""}`.trim(),
    status: "confirmed",
    branchTransferId: transfer.id,
    branchTransferOut: true,
    stockLocation: "main",
    items: items.map((it) => ({
      productId: it.productId,
      name: it.name,
      code: it.code || "",
      unit: it.unit || "Pcs",
      unitFactor: 1,
      direction: "out",
      qty: numberValue(it.quantity),
    })),
    createdAt: transfer.dispatchedAt || new Date().toISOString(),
    createdBy: actor?.uid || actor?.localUserId || "",
    createdByName: actor?.personName || "",
  };
}

export function hqDispatchStockAdjustId(transferId) {
  return dispatchAdjustId(transferId);
}