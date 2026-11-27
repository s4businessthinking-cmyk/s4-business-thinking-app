/** Stable child shop id for a branch company file (Premier-style separate books). */
export function branchCompanyShopId(parentShopId, branchId) {
  const parent = String(parentShopId || "").trim();
  const branch = String(branchId || "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
  if (!parent || !branch) return "";
  return `${parent}-bf-${branch}`;
}