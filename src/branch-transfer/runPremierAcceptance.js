import { offlineList } from "../offline/offlineRepository.js";
import { loadInvoiceRows, rowsOf } from "../inventory/stockFromInvoices.js";
import { loadShopRecord } from "../offline/shopService.js";
import { listOwnerCompanyFiles } from "./branchCompanyFile.js";
import {
  summarizePremierAcceptance,
  verifyBranchBillIsolation,
  verifyBranchBankLedger,
  verifyBranchCounterShopBinding,
  verifyConsolidatedElimination,
  verifyDueFromToMatch,
} from "./premierAcceptanceChecks.js";

const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export async function runPremierAcceptance(homeShopId, { team = [], customers = [], vendors = [], asOf = "" } = {}) {
  if (!homeShopId) throw new Error("HOME_SHOP_REQUIRED");
  const files = await listOwnerCompanyFiles(homeShopId);
  const branchFiles = files.filter((f) => f.kind === "branch");
  const [rows, rc, pm, ex, av, pe, br, sa] = await Promise.all([
    loadInvoiceRows(),
    offlineList("salesReceipts"),
    offlineList("purchasePayments"),
    offlineList("expenses"),
    offlineList("accountVouchers").catch(() => []),
    offlineList("partnerEntries").catch(() => []),
    offlineList("bankReconciliations").catch(() => []),
    offlineList("stockAdjustments").catch(() => []),
  ]);
  const data = {
    salesInvoices: rows.salesInvoices,
    purchaseInvoices: rows.purchaseInvoices,
    salesReturns: rows.extras?.salesReturns || [],
    purchaseReturns: rows.extras?.purchaseReturns || [],
    receipts: rowsOf(rc),
    payments: rowsOf(pm),
    expenses: rowsOf(ex),
    accountVouchers: rowsOf(av),
    partnerEntries: rowsOf(pe),
    bankEntries: rowsOf(br).filter((d) => d?.kind === "entry"),
    stockAdjustments: rowsOf(sa),
  };
  const shopById = {};
  await Promise.all(
    files.map(async (f) => {
      shopById[f.shopId] = (await loadShopRecord(f.shopId).catch(() => ({}))) || {};
    })
  );
  const day = asOf || localDay();
  const isolation = verifyBranchBillIsolation(homeShopId, branchFiles, data);
  const counters = verifyBranchCounterShopBinding(team, files);
  const due = verifyDueFromToMatch({
    homeShopId,
    branchFiles,
    data,
    customers,
    vendors,
    shopById,
    asOf: day,
  });
  const bank = verifyBranchBankLedger(branchFiles, data, shopById);
  const consolidated = verifyConsolidatedElimination({
    files,
    data,
    customers,
    vendors,
    shopById,
    asOf: day,
  });
  const checks = { isolation, counters, due, bank, consolidated };
  const summary = summarizePremierAcceptance(checks);
  return { summary, checks, asOf: day };
}

/** Map passing automated checks to UAT checklist ids */
export function uatTicksFromAcceptance(summary) {
  const passed = {};
  if (summary.branchIsolation) {
    passed.A2 = true;
    passed.E2 = true;
  }
  if (summary.dueMatch) {
    passed.C3 = true;
  }
  if (summary.bankLedger) {
    passed.D2 = true;
    passed.D3 = true;
  }
  if (summary.consolidatedElimination) {
    passed.C4 = true;
    passed.E3 = true;
  }
  return passed;
}