/** Party lists for child company files can include HQ master data. */
export function resolvePartyParentShopId(shop, settings = {}) {
  if (settings?.sharePartiesFromHq === false) return "";
  const parent = String(shop?.parentShopId || "").trim();
  const sid = String(shop?.shopId || shop?.id || "").trim();
  if (!parent || !sid || parent === sid) return "";
  if (shop?.isBranchCompanyFile !== true) return "";
  return parent;
}

export function mergeSharedParties(childRows = [], parentRows = [], nameKey = "customerName") {
  const map = new Map();
  (parentRows || []).forEach((row) => {
    if (!row?.id || row.isDeleted) return;
    map.set(row.id, { ...row, sharedFromHq: true });
  });
  (childRows || []).forEach((row) => {
    if (!row?.id || row.isDeleted) return;
    map.set(row.id, { ...row, sharedFromHq: false });
  });
  return [...map.values()].sort((a, b) => String(a[nameKey] || "").localeCompare(String(b[nameKey] || ""), undefined, { sensitivity: "base" }));
}

export function filterPartiesByShops(rows, shopIds = []) {
  const set = new Set((shopIds || []).filter(Boolean));
  if (!set.size) return [];
  return (rows || []).filter((r) => r?.id && !r.isDeleted && set.has(r.shopId));
}