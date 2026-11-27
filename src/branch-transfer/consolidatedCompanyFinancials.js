import { buildGlobalLedger, balances } from "../ledger/globalLedger.js";
import { shopAccountNature } from "../ledger/accountNature.js";
import { computeAccounts } from "../reports/accountsCalc.js";
import { buildBalanceSheet, openingStockValue, stockDocsUpTo } from "../reports/balanceSheet.js";
import { computeStockMap } from "../inventory/stockFromInvoices.js";
import { unitCostsAt, valuationMethodOf } from "../reports/stockValuation.js";
import { r2 } from "../reports/reportFilters.js";
import { expenseCategoryLabel } from "../expenses/ExpensesTab.jsx";
import { branchBankAccountName } from "./branchBankAccounts.js";
export function plSnapshot(report) {
  if (!report) return null;
  return {
    netSales: r2(report.netSales),
    grossProfit: r2(report.grossProfit),
    netProfit: r2(report.netProfit),
    expenseTotal: r2(report.expenseTotal),
    stockValue: r2(report.stockValue),
  };
}

export function bsSnapshot(sheet) {
  if (!sheet) return null;
  return {
    totalAssets: r2(sheet.totalAssets),
    totalLiabilities: r2(sheet.totalLiabilities),
    totalEquity: r2(sheet.totalEquity),
    workingCapital: r2(sheet.workingCapital),
    profitToDate: r2(sheet.profit),
    difference: r2(sheet.difference),
  };
}

export function mergeConsolidatedPl(perFile = []) {
  const rows = perFile.map(({ file, pl }) => ({ label: file?.label || file?.shopId, ...plSnapshot(pl) })).filter((r) => r.netSales != null);
  const totals = rows.reduce(
    (t, r) => ({
      netSales: r2(t.netSales + (r.netSales || 0)),
      grossProfit: r2(t.grossProfit + (r.grossProfit || 0)),
      netProfit: r2(t.netProfit + (r.netProfit || 0)),
      expenseTotal: r2(t.expenseTotal + (r.expenseTotal || 0)),
    }),
    { netSales: 0, grossProfit: 0, netProfit: 0, expenseTotal: 0 }
  );
  return { rows, totals };
}

export function mergeConsolidatedBs(perFile = []) {
  const rows = perFile.map(({ file, bs }) => ({ label: file?.label || file?.shopId, ...bsSnapshot(bs) })).filter((r) => r.totalAssets != null);
  const totals = rows.reduce(
    (t, r) => ({
      totalAssets: r2(t.totalAssets + (r.totalAssets || 0)),
      totalLiabilities: r2(t.totalLiabilities + (r.totalLiabilities || 0)),
      totalEquity: r2(t.totalEquity + (r.totalEquity || 0)),
    }),
    { totalAssets: 0, totalLiabilities: 0, totalEquity: 0 }
  );
  totals.groupDifference = r2(totals.totalAssets - totals.totalLiabilities - totals.totalEquity);
  return { rows, totals };
}

function plInputFromScoped(scoped) {
  return {
    salesInvoices: scoped.salesInvoices,
    purchaseInvoices: scoped.purchaseInvoices,
    receipts: scoped.receipts,
    payments: scoped.payments,
    expenses: scoped.expenses,
    accountVouchers: scoped.accountVouchers,
    deliveryNotes: [],
    extras: {
      salesReturns: scoped.salesReturns,
      purchaseReturns: scoped.purchaseReturns,
      stockAdjustments: scoped.stockAdjustments,
    },
  };
}

export function buildFilePl({ scoped, shop, products, shopId, from, to }) {
  if (!scoped || !shopId) return null;
  const natureOf = shopAccountNature(shop);
  const method = valuationMethodOf(shop);
  const shopProducts = (products || []).filter((p) => !p.shopId || p.shopId === shopId);
  return computeAccounts(plInputFromScoped(scoped), {
    products: shopProducts,
    shopId,
    from,
    to,
    bn: false,
    natureOf,
    method,
  });
}

export function buildFileBs({ scoped, shop, products, customers, vendors, shopId, asOf, file }) {
  if (!scoped || !shopId || !asOf) return null;
  const shopProducts = (products || []).filter((p) => !p.shopId || p.shopId === shopId);
  const cust = (customers || []).filter((c) => !c.shopId || c.shopId === shopId);
  const vend = (vendors || []).filter((v) => !v.shopId || v.shopId === shopId);
  const defaultBankAccount = String(shop?.defaultBankAccount || "").trim();
  const ledger = buildGlobalLedger(scoped, {
    shopId,
    customers: cust,
    vendors: vend,
    defaultBankAccount,
    expenseLabel: (e) => expenseCategoryLabel(e, false),
  });
  const rows = {
    purchaseInvoices: scoped.purchaseInvoices,
    salesInvoices: scoped.salesInvoices,
    deliveryNotes: [],
    stockAdjustments: scoped.stockAdjustments,
    extras: {
      salesReturns: scoped.salesReturns,
      purchaseReturns: scoped.purchaseReturns,
      stockAdjustments: scoped.stockAdjustments,
    },
  };
  const cut = stockDocsUpTo(rows, asOf);
  const method = valuationMethodOf(shop);
  const avg = unitCostsAt(method, shopProducts, cut, { shopId, upTo: asOf });
  const qty = computeStockMap(shopProducts, cut.purchaseInvoices, cut.salesInvoices, shopId, cut.deliveryNotes, cut.extras);
  let closingStock = 0;
  qty.forEach((q, id) => {
    if (q > 0) closingStock += q * (avg.get(id) || 0);
  });
  closingStock = r2(closingStock);
  const openingStock = openingStockValue(shopProducts);
  const bal = balances(ledger.postings, asOf);
  const sheet = buildBalanceSheet({
    accounts: ledger.accounts,
    bal,
    closingStock,
    openingStock,
    closedStock: null,
  });
  const branchLabel = file?.kind === "branch" ? String(file.label || "").replace(/\s+\(.*\)$/, "").trim() : "";
  const bankName = shop?.defaultBankAccount || branchBankAccountName(branchLabel);
  return { sheet, bankName };
}