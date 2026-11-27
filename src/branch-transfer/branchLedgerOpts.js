import { BRANCH_TRANSFER_COLLECTIONS, listShopRecords } from "./branchTransferService.js";
import { ledgerOptsFromShop } from "../ledger/ledgerShopOpts.js";

export function isBranchCashSplitEnabled(shop) {
  return shop?.branchTransferSettings?.enabled === true;
}

/** Extra buildGlobalLedger options: branch cash split + default bank account. */
export function ledgerOptsWithBranches(shop, branches = []) {
  return ledgerOptsFromShop(shop, branches);
}

export async function loadBranchMaster(shopId, shop) {
  if (!isBranchCashSplitEnabled(shop) || !shopId) return [];
  return listShopRecords(BRANCH_TRANSFER_COLLECTIONS.BRANCHES, shopId).catch(() => []);
}