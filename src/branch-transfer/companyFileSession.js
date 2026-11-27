const KEY = "s4-owner-company-file-v1";

export function getOwnerActiveCompanyFile(homeShopId) {
  if (!homeShopId || typeof localStorage === "undefined") return homeShopId || "";
  try {
    const v = localStorage.getItem(`${KEY}:${homeShopId}`);
    return String(v || homeShopId).trim() || homeShopId;
  } catch {
    return homeShopId;
  }
}

export function setOwnerActiveCompanyFile(homeShopId, ledgerShopId) {
  if (!homeShopId || typeof localStorage === "undefined") return;
  try {
    const next = String(ledgerShopId || homeShopId).trim() || homeShopId;
    localStorage.setItem(`${KEY}:${homeShopId}`, next);
  } catch {}
}

export function clearOwnerActiveCompanyFile(homeShopId) {
  if (!homeShopId || typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(`${KEY}:${homeShopId}`);
  } catch {}
}