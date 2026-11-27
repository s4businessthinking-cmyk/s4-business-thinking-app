import { offlineGetById, offlineUpsert } from "../offline/offlineRepository.js";
import { buildHqDispatchStockAdjustDoc, hqDispatchStockAdjustId } from "./branchDispatchStockDoc.js";
import { dispatchShopIdForTransfer } from "./branchTransferDomain.js";

export { buildHqDispatchStockAdjustDoc } from "./branchDispatchStockDoc.js";

const COL = "stockAdjustments";

/** Reduce sending shop qty on branch transfer dispatch (HQ or peer source file). */
export async function postDispatchStockOut({ transfer, actor, settings }) {
  if (settings?.companyFilePerBranch === false) return null;
  const dispatchShopId = dispatchShopIdForTransfer(transfer);
  if (!dispatchShopId) return null;
  const doc = buildHqDispatchStockAdjustDoc({ transfer, actor, dispatchShopId });
  if (!doc) return null;
  const existing = await offlineGetById(COL, doc.id);
  if (existing?.data?.status === "confirmed") return { ...existing.data, id: doc.id };
  const result = await offlineUpsert(COL, doc.id, doc);
  return { ...result.data, id: doc.id };
}

export async function postHqDispatchStockOut(args) {
  return postDispatchStockOut(args);
}

export async function cancelHqDispatchStockOut({ transfer, actor }) {
  if (!transfer?.id) return null;
  const id = hqDispatchStockAdjustId(transfer.id);
  const existing = await offlineGetById(COL, id);
  if (!existing?.data) return null;
  if (existing.data.status === "cancelled") return existing.data;
  const doc = {
    ...existing.data,
    status: "cancelled",
    cancelledAt: new Date().toISOString(),
    cancelledBy: actor?.uid || actor?.localUserId || "",
    cancelledByName: actor?.personName || "",
  };
  await offlineUpsert(COL, id, doc);
  return doc;
}