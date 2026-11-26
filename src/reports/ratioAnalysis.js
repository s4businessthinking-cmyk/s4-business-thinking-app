// Ratio analysis: a few plain ratios from the P&L of a period (computeAccounts) and the Balance Sheet on its last day
// (buildBalanceSheet, with the stock valuation method the shop uses). Every ratio carries its formula and the two
// figures it divides, so the owner can check it by hand; a ratio whose divisor is zero shows "-", never a made-up number.
// - Current assets = every asset except the fixed asset register's section; current liabilities = every liability (the
//   Balance Sheet has no long-term split, so a long loan counts as current - stated on screen).
// - Receivables / payables are the Balance Sheet's customer / supplier balances on the last day (VAT included, as on
//   the bills), set against the period's sales / purchases with VAT, less returns.
// - Average stock = (stock on the day before the period + stock on its last day) / 2.
import { r2 } from "./reportFilters.js";

const sectionTotal = (sheet, side, id) => r2((sheet?.[side] || []).find((s) => s.id === id)?.total || 0);
const ratio = (a, b, mult = 1) => (Math.abs(b) < 0.005 ? null : r2((a / b) * mult));

/** Days in [from, to] counting both ends; 0 without both dates. */
export function periodDays(from, to) {
  if (!from || !to) return 0;
  const d = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
  return d > 0 ? d : 0;
}

/**
 * pl: computeAccounts() for [from, to]; sheet: buildBalanceSheet() on `to`; openingSheet: buildBalanceSheet() on the day
 * before `from` (null to use the closing stock only). -> { days, figures, ratios: [{ id, en, bn, value, unit, formula, a, b, note }] }
 * unit: "%" | "x" | "days" | "money".
 */
export function buildRatios({ pl, sheet, openingSheet = null, from = "", to = "" }) {
  const days = periodDays(from, to);
  const fixed = sectionTotal(sheet, "assets", "fixedAsset");
  const stock = sectionTotal(sheet, "assets", "stock");
  const openingStock = openingSheet ? sectionTotal(openingSheet, "assets", "stock") : stock;
  const currentAssets = r2((sheet?.totalAssets || 0) - fixed);
  const currentLiabilities = r2(sheet?.totalLiabilities || 0);
  const receivable = sectionTotal(sheet, "assets", "receivable");
  const payable = sectionTotal(sheet, "liabilities", "payable");
  const netSales = r2(pl?.netSales || 0), grossProfit = r2(pl?.grossProfit || 0), netProfit = r2(pl?.netProfit || 0), cogs = r2(pl?.cogs || 0);
  const salesWithVat = r2((pl?.grossSales || 0) - (pl?.salesReturnTotal || 0));
  const purchWithVat = r2((pl?.grossPurch || 0) - (pl?.purchReturnTotal || 0));
  const avgStock = r2((openingStock + stock) / 2);
  const turnover = ratio(cogs, avgStock);
  const turnoverExact = Math.abs(avgStock) < 0.005 ? 0 : cogs / avgStock;
  const figures = { days, netSales, grossProfit, netProfit, cogs, salesWithVat, purchWithVat, currentAssets, currentLiabilities, stock, openingStock, avgStock, receivable, payable, fixed };
  const row = (id, en, bn, value, unit, formula, a, b, note = "") => ({ id, en, bn, value, unit, formula, a, b, note });
  const ratios = [
    row("grossMargin", "Gross margin", "মোট লাভের হার", ratio(grossProfit, netSales, 100), "%", "Gross profit / Net sales x 100", grossProfit, netSales),
    row("netMargin", "Net margin", "নিট লাভের হার", ratio(netProfit, netSales, 100), "%", "Net profit / Net sales x 100", netProfit, netSales),
    row("currentRatio", "Current ratio", "চলতি অনুপাত", ratio(currentAssets, currentLiabilities), "x", "Current assets / Current liabilities", currentAssets, currentLiabilities,
      "Current assets = all assets except fixed assets; current liabilities = all liabilities (no long-term split)"),
    row("quickRatio", "Quick ratio", "দ্রুত অনুপাত", ratio(r2(currentAssets - stock), currentLiabilities), "x", "(Current assets - Stock) / Current liabilities", r2(currentAssets - stock), currentLiabilities),
    row("debtorDays", "Debtors days", "পাওনা আদায়ের দিন", days ? ratio(receivable, salesWithVat, days) : null, "days", "Customer balances / Sales with VAT less returns x Days in period", receivable, salesWithVat),
    row("creditorDays", "Creditors days", "দেনা শোধের দিন", days ? ratio(payable, purchWithVat, days) : null, "days", "Supplier balances / Purchases with VAT less returns x Days in period", payable, purchWithVat),
    row("stockTurnover", "Stock turnover", "স্টক ঘোরার হার", turnover, "x", "Cost of goods sold / Average stock", cogs, avgStock, "Average stock = (stock before the period + stock at its end) / 2"),
    row("stockDays", "Stock days", "স্টক থাকার দিন", days && turnoverExact ? r2(days / turnoverExact) : null, "days", "Days in period / Stock turnover", days, turnover),
    row("workingCapital", "Working capital", "ওয়ার্কিং ক্যাপিটাল", r2(sheet?.workingCapital || 0), "money", "Current assets - Current liabilities", currentAssets, currentLiabilities),
  ];
  return { days, figures, ratios };
}

/** Shown value: "-" for no ratio. */
export function ratioText(r, cur = "AED") {
  if (r.value == null) return "-";
  if (r.unit === "%") return `${r.value.toFixed(1)}%`;
  if (r.unit === "x") return `${r.value.toFixed(2)}`;
  if (r.unit === "days") return `${Math.round(r.value)}`;
  return `${cur} ${r.value.toFixed(2)}`;
}

export const RATIO_COLS = ["Ratio", "Value", "Formula", "Figure A", "Figure B", "Note"];
export const ratioRows = (rep, cur = "AED") => [
  RATIO_COLS,
  ...rep.ratios.map((r) => [r.en, ratioText(r, cur), r.formula, r2(r.a).toFixed(2), r2(r.b).toFixed(2), r.note]),
];
export const ratioFileName = (from, to) => `ratios-${from || "start"}-${to || "today"}.csv`;
