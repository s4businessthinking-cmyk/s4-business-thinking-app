// Active branch for this login session (one shop, many counters — Premier-style branch login without extra shops).
const KEY = "s4_active_branch_v1";

const readMap = () => {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || "{}") || {};
  } catch {
    return {};
  }
};

const writeMap = (map) => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(map || {}));
  } catch {
    /* storage blocked */
  }
};

/** @returns {{ branchId, branchName } | null} */
export function getActiveBranch(shopId) {
  if (!shopId) return null;
  const row = readMap()[shopId];
  if (!row?.branchId) return null;
  return { branchId: String(row.branchId), branchName: String(row.branchName || row.branchId) };
}

export function setActiveBranch(shopId, { branchId, branchName }) {
  if (!shopId || !branchId) return;
  const map = readMap();
  map[shopId] = { branchId: String(branchId), branchName: String(branchName || branchId) };
  writeMap(map);
}

export function clearActiveBranch(shopId) {
  if (!shopId) return;
  const map = readMap();
  delete map[shopId];
  writeMap(map);
}

export function clearAllActiveBranches() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* */
  }
}

/** For new sales bills — same shape as user defaults stockLocation fields. */
export function activeBranchForBilling(shopId) {
  const b = getActiveBranch(shopId);
  if (!b) return null;
  return { stockLocation: b.branchId, stockLocationName: b.branchName };
}