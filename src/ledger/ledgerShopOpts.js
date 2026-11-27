import { DEFAULT_BANK, branchBankAccountName } from "../branch-transfer/branchBankAccounts.js";
import { INVOICE_BANK_PAY_METHODS } from "./invoiceBankPay.js";

/** Resolved bank ledger name for postings and payment vouchers (Premier default / branch child file). */
export function shopBankAccountName(shop) {
  const custom = String(shop?.defaultBankAccount || "").trim();
  if (custom) return custom;
  if (shop?.isBranchCompanyFile) {
    return branchBankAccountName(shop.branchCode || shop.branchName || shop.companyName);
  }
  return DEFAULT_BANK;
}

/** Ensure shop default bank appears in SI/PI bank dropdowns (e.g. "Bank - Branch 1"). */
export function bankChoicesForShop(baseBanks = [], shop) {
  const list = (baseBanks || []).map((b) => (typeof b === "string" ? b : b?.name || "")).filter(Boolean);
  const name = shopBankAccountName(shop);
  if (name && !list.includes(name)) return [name, ...list];
  return list;
}

/** Stamp on SI/PI when the bill is settled at save via bank/card/cheque — posts to branch bank ledger. */
export function invoicePaymentBankField(method, shop, paid = 0, paymentBank = "") {
  if (!paid || paid < 0.009) return {};
  if (!INVOICE_BANK_PAY_METHODS.has(method)) return {};
  const pick = String(paymentBank || "").trim() || shopBankAccountName(shop);
  return pick ? { paymentBank: pick } : {};
}

export function ledgerOptsFromShop(shop, branchMaster = []) {
  const branchCashSplit = shop?.branchTransferSettings?.enabled === true;
  return {
    branchCashSplit,
    branches: branchCashSplit ? (branchMaster || []) : [],
    defaultBankAccount: shopBankAccountName(shop),
  };
}