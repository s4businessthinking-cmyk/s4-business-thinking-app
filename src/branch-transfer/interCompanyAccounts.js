export const DUE_TO_HQ = "Due to HQ";

export function dueFromBranchAccountName(branchName = "") {
  const label = String(branchName || "").trim() || "Branch";
  return `Due from ${label}`;
}

export function dueToHqAccountName() {
  return DUE_TO_HQ;
}

export function dueToBranchAccountName(branchName = "") {
  const label = String(branchName || "").trim() || "Branch";
  return `Due to ${label}`;
}