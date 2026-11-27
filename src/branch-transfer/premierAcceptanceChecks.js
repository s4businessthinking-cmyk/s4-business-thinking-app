import { buildGlobalLedger, balances } from "../ledger/globalLedger.js";
import { shopBankAccountName } from "../ledger/ledgerShopOpts.js";
import { invoiceNeedsPaymentBankRepair } from "../ledger/invoicePaymentBankRepair.js";
const expenseLabel = (e) => e.categoryName || e.category || "Expense";
import { dueFromBranchAccountName, DUE_TO_HQ } from "./interCompanyAccounts.js";
import { measureInterCompanyElimination } from "./consolidatedElimination.js";
import { livePurchasesOf, liveSalesOf } from "../reports/reportFilters.js";
import { r2 } from "../reports/reportFilters.js";

const n = (v) => Number(v) || 0;

const accountBal = (ledger, name, asOf) => {
  if (!ledger) return 0;
  const key = [...ledger.accounts.values()].find(
    (a) => String(a.name || "").toLowerCase() === String(name || "").toLowerCase()
  )?.key;
  if (!key) return 0;
  return r2(balances(ledger.postings, asOf).get(key) || 0);
};

export function scopeShopDocs(data, shopId) {
  const scoped = {
    salesInvoices: (data.salesInvoices || []).filter((d) => d.shopId === shopId),
    purchaseInvoices: (data.purchaseInvoices || []).filter((d) => d.shopId === shopId),
    salesReturns: (data.salesReturns || []).filter((d) => d.shopId === shopId),
    purchaseReturns: (data.purchaseReturns || []).filter((d) => d.shopId === shopId),
    receipts: (data.receipts || []).filter((d) => d.shopId === shopId),
    payments: (data.payments || []).filter((d) => d.shopId === shopId),
    expenses: (data.expenses || []).filter((d) => d.shopId === shopId),
    accountVouchers: (data.accountVouchers || []).filter((d) => d.shopId === shopId),
    partnerEntries: (data.partnerEntries || []).filter((d) => d.shopId === shopId),
    bankEntries: (data.bankEntries || []).filter((d) => d.shopId === shopId),
    stockAdjustments: (data.stockAdjustments || []).filter((d) => d.shopId === shopId),
  };
  return scoped;
}

/** Child company file must not own HQ-tagged SI/PI rows (Premier isolation). */
export function verifyBranchBillIsolation(homeShopId, branchFiles = [], data = {}) {
  const branchIds = branchFiles.filter((f) => f.kind === "branch").map((f) => f.shopId);
  if (!homeShopId || !branchIds.length) {
    return { ok: false, reason: "no_branch_files", hqLeaksOnChild: 0 };
  }
  let crossShop = 0;
  for (const childId of branchIds) {
    const docs = [
      ...liveSalesOf(data.salesInvoices || [], childId),
      ...livePurchasesOf(data.purchaseInvoices || [], childId),
    ];
    crossShop += docs.filter((inv) => inv.shopId && inv.shopId !== childId).length;
  }
  return { ok: crossShop === 0, crossShop, branchCount: branchIds.length };
}

export function verifyBranchCounterShopBinding(team = [], branchFiles = []) {
  const branchIds = new Set(branchFiles.filter((f) => f.kind === "branch").map((f) => f.shopId));
  if (!branchIds.size) return { ok: true, skipped: true, mismatched: 0 };
  const counters = (team || []).filter((m) => /branch counter/i.test(String(m.position || "")));
  const bad = counters.filter((m) => {
    const sid = String(m.shopId || "");
    if (!sid) return false;
  const user = String(m.username || "").toLowerCase();
    if (user === "main") return false;
    return branchIds.size > 0 && !branchIds.has(sid);
  });
  return { ok: bad.length === 0, mismatched: bad.length, counterCount: counters.length };
}

/** HQ Due from (branch) vs child Due to HQ — same amount per branch (as-of). */
export function verifyDueFromToMatch({
  homeShopId,
  branchFiles = [],
  data = {},
  customers = [],
  vendors = [],
  shopById = {},
  asOf = "",
}) {
  const hqScoped = scopeShopDocs(data, homeShopId);
  const pairs = [];
  let allOk = true;
  for (const file of branchFiles.filter((f) => f.kind === "branch")) {
    const branchName = String(file.label || "").replace(/\s+\(.*\)$/, "").trim() || file.branchCode || "Branch";
    const childShop = shopById[file.shopId] || {};
    const childScoped = scopeShopDocs(data, file.shopId);
    const hasIc =
      childScoped.purchaseInvoices.some((p) => p.interCompanyIn === true)
      || childScoped.accountVouchers.some((v) => v.interCompanyOut === true)
      || hqScoped.accountVouchers.some((v) => v.interCompanyOut === true);
    if (!hasIc) {
      pairs.push({ shopId: file.shopId, branchName, skipped: true, ok: true });
      continue;
    }
    const hqLedger = buildGlobalLedger(hqScoped, {
      shopId: homeShopId,
      customers,
      vendors,
      defaultBankAccount: shopBankAccountName(shopById[homeShopId] || {}),
      expenseLabel,
    });
    const childLedger = buildGlobalLedger(childScoped, {
      shopId: file.shopId,
      customers,
      vendors,
      defaultBankAccount: shopBankAccountName(childShop),
      expenseLabel,
    });
    const from = r2(Math.max(0, accountBal(hqLedger, dueFromBranchAccountName(branchName), asOf)));
    const to = r2(Math.max(0, -accountBal(childLedger, DUE_TO_HQ, asOf)));
    const diff = r2(Math.abs(from - to));
    const ok = diff < 0.02 && (from > 0.009 || to > 0.009);
    if (!ok) allOk = false;
    pairs.push({ shopId: file.shopId, branchName, from, to, diff, ok, skipped: false });
  }
  return { ok: allOk, pairs };
}

/** Bank-paid bills on branch files use branch bank name (paymentBank or shop default). */
export function verifyBranchBankLedger(branchFiles = [], data = {}, shopById = {}) {
  const branchIds = branchFiles.filter((f) => f.kind === "branch").map((f) => f.shopId);
  let needRepair = 0;
  let genericBank = 0;
  const details = [];
  for (const childId of branchIds) {
    const shop = shopById[childId] || {};
    const expected = shopBankAccountName(shop);
    const docs = [
      ...liveSalesOf(data.salesInvoices || [], childId),
      ...livePurchasesOf(data.purchaseInvoices || [], childId),
    ];
    for (const inv of docs) {
      if (invoiceNeedsPaymentBankRepair(inv)) {
        needRepair += 1;
        details.push({ id: inv.id, no: inv.invoiceNo, shopId: childId, issue: "missing_paymentBank" });
        continue;
      }
      const pb = String(inv.paymentBank || "").trim();
      if (pb && /^bank$/i.test(pb)) {
        genericBank += 1;
        details.push({ id: inv.id, no: inv.invoiceNo, shopId: childId, issue: "generic_bank" });
      }
    }
    if (!expected || /^bank$/i.test(expected)) {
      details.push({ shopId: childId, issue: "shop_default_not_branch", expected });
    }
  }
  return {
    ok: needRepair === 0 && genericBank === 0,
    needRepair,
    genericBank,
    details: details.slice(0, 8),
  };
}

/** Consolidated inter-company elimination measurable when IC exists. */
export function verifyConsolidatedElimination({
  files = [],
  data = {},
  customers = [],
  vendors = [],
  shopById = {},
  asOf = "",
}) {
  if (files.length < 2) return { ok: false, reason: "need_two_files", elimination: 0 };
  const ledgerFile = [];
  const plScoped = [];
  files.forEach((f) => {
    const scoped = scopeShopDocs(data, f.shopId);
    plScoped.push({ scoped, shopId: f.shopId });
    const shop = shopById[f.shopId] || {};
    ledgerFile.push({
      ledger: buildGlobalLedger(scoped, {
        shopId: f.shopId,
        customers,
        vendors,
        defaultBankAccount: shopBankAccountName(shop),
        expenseLabel,
      }),
    });
  });
  const elimination = measureInterCompanyElimination(ledgerFile, asOf);
  const hasIc = plScoped.some(
    ({ scoped }) => scoped.purchaseInvoices.some((p) => p.interCompanyIn === true)
      || scoped.accountVouchers.some((v) => v.interCompanyOut === true)
  );
  if (!hasIc) return { ok: true, skipped: true, elimination: 0, reason: "no_ic_activity" };
  return { ok: elimination >= 0.01, elimination, skipped: false };
}

export function summarizePremierAcceptance(checks) {
  const branchIsolation = !!(checks.isolation?.ok && checks.counters?.ok !== false);
  const dueMatch = !!checks.due?.ok;
  const bankLedger = !!checks.bank?.ok;
  const consolidatedElimination = !!(checks.consolidated?.ok || checks.consolidated?.skipped);
  return {
    branchIsolation,
    dueMatch,
    bankLedger,
    consolidatedElimination,
    allOk: branchIsolation && dueMatch && bankLedger && consolidatedElimination,
    detail: checks,
  };
}