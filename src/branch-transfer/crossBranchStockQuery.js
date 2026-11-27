export function resolveHomeShopId(shop) {
  return String(shop?.parentShopId || shop?.shopId || shop?.id || "").trim();
}

export function crossBranchQtyRows(crossRows, productId) {
  if (!productId) return [];
  return (crossRows || []).map((row) => ({
    branchId: row.branchId,
    name: row.name,
    ledgerShopId: row.ledgerShopId,
    qty: Number(row.qtyByProductId?.get?.(productId) ?? 0),
  }));
}

export function buildCrossBranchRows({ homeShopId, branches = [], productList = [], stockMapForShopId }) {
  if (!homeShopId || typeof stockMapForShopId !== "function") return [];
  const activeBranches = (branches || []).filter((b) => b.active !== false && b.shopId === homeShopId);
  const out = [{
    branchId: "main",
    name: "Main / HQ",
    ledgerShopId: homeShopId,
    qtyByProductId: stockMapForShopId(productList, homeShopId),
  }];
  for (const branch of activeBranches) {
    const lid = String(branch.ledgerShopId || "").trim();
    if (!lid || lid === homeShopId) continue;
    out.push({
      branchId: branch.id,
      name: branch.name || branch.code || branch.id,
      ledgerShopId: lid,
      qtyByProductId: stockMapForShopId(productList, lid),
    });
  }
  return out;
}