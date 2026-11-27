import { offlineList } from "../offline/offlineRepository.js";
import { mergeSharedParties, resolvePartyParentShopId } from "./companyPartyScope.js";

const mapPartyRow = (r) => ({ id: r.document_id || r.data?.id, ...(r.data || r) });

export async function loadCustomersForLedgerShop(shopId, shop, settings) {
  if (!shopId) return [];
  const local = await offlineList("customers");
  const all = (local.records || local || [])
    .map(mapPartyRow)
    .filter((c) => c.id && !c.isDeleted);
  const child = all.filter((c) => c.shopId === shopId);
  const parentId = resolvePartyParentShopId({ ...shop, shopId }, settings);
  if (!parentId) {
    return [...child].sort((a, b) => (a.customerName || "").localeCompare(b.customerName || ""));
  }
  return mergeSharedParties(child, all.filter((c) => c.shopId === parentId), "customerName");
}

export async function loadVendorsForLedgerShop(shopId, shop, settings) {
  if (!shopId) return [];
  const local = await offlineList("vendors");
  const all = (local.records || local || [])
    .map(mapPartyRow)
    .filter((v) => v.id && !v.isDeleted);
  const child = all.filter((v) => v.shopId === shopId);
  const parentId = resolvePartyParentShopId({ ...shop, shopId }, settings);
  if (!parentId) {
    return [...child].sort((a, b) => (a.vendorName || "").localeCompare(b.vendorName || ""));
  }
  return mergeSharedParties(child, all.filter((v) => v.shopId === parentId), "vendorName");
}