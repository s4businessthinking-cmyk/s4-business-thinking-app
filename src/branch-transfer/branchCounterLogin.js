import { DEFAULT_PERMISSIONS } from "../shared/appShared.jsx";

/** Minimal rights: this login is the branch counter (Premier-style branch1 / branch2 user). */
export const BRANCH_COUNTER_PERMISSIONS = Object.freeze({
  ...DEFAULT_PERMISSIONS,
  manageSales: true,
  manageCustomers: true,
  viewProducts: true,
  printSales: true,
  editDraftSales: true,
  editConfirmedSales: false,
  viewCustomerBalance: true,
  sendOrder: false,
  manageProducts: false,
  managePurchase: false,
  viewVendors: false,
  manageReturns: false,
  accountVouchers: false,
  viewAccounts: false,
});

export function suggestBranchLoginUsername(branch) {
  const code = String(branch?.code || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (code) return code;
  const slug = String(branch?.name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (slug) return slug.slice(0, 24);
  return `branch${String(branch?.id || "").replace(/[^\d]/g, "").slice(-4) || "1"}`;
}

export function branchCounterDefaults(branch, { ownCompanyFile = false } = {}) {
  if (ownCompanyFile) {
    return {
      stockLocation: "main",
      stockLocationName: branch?.name || "Branch",
      startTab: "counter",
    };
  }
  const id = branch?.id === "main" ? "main" : (branch?.id || "main");
  const name = branch?.name || (id === "main" ? "Main" : id);
  return {
    stockLocation: id,
    stockLocationName: name,
    startTab: "counter",
  };
}

export function defaultCounterPassword(branch) {
  const u = suggestBranchLoginUsername(branch);
  return `${u}123`;
}