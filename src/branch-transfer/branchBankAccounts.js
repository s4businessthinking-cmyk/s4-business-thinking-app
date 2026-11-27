export const DEFAULT_BANK = "Bank";

/** Per-branch bank ledger name (Premier child file or HQ branch deposit tracking). */
export function branchBankAccountName(branchName = "") {
  const label = String(branchName || "").trim();
  if (!label) return DEFAULT_BANK;
  return `Bank - ${label}`;
}