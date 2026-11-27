import { CASH_ACCOUNT } from "../vouchers/accountVoucherDomain.js";
import { MAIN_BRANCH, branchOfDoc } from "../reports/groupView.js";

/** Ledger name for this branch's drawer cash (Main = company "Cash in Hand"). */
export function branchCashAccountName(branchId, branchName = "") {
  const id = branchOfDoc({ stockLocation: branchId });
  if (id === MAIN_BRANCH) return CASH_ACCOUNT;
  const label = String(branchName || branchId || "").trim() || id;
  return `Cash in Hand - ${label}`;
}

export function cashAccountForDoc(doc) {
  return branchCashAccountName(doc?.stockLocation, doc?.stockLocationName);
}

export function cashAccountKey(accountName) {
  return `a:${String(accountName || CASH_ACCOUNT).trim().toLowerCase()}`;
}

/** Counter shift reads this account only — separate cash book per branch, one company ledger. */
export function branchShiftCashKey(branchId, branchName) {
  return cashAccountKey(branchCashAccountName(branchId, branchName));
}