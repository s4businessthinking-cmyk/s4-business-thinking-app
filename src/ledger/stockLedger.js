// Stock written off / found (stock adjustments) and warranty units replaced by the company, as ledger entries.
// The ledger books purchases as an expense and brings stock in from the count on the balance sheet (periodic method),
// so the stock change itself is already in profit. These entries only move the value between accounts inside the P&L,
// the way an abnormal loss is taken out of purchases:
//   loss    Dr Stock Adjustment              Cr Purchase
//   surplus Dr Purchase                      Cr Stock Adjustment
//   warranty Dr Purchase                     Cr Warranty Replacement Stock
// Ledger profit, the balance sheet and the P&L (accountsCalc.stockEffects) are not changed by them - nothing counts twice.
// Value: base quantity x weighted average purchase cost up to the entry's own day, the cost the stock value uses; with
// the FIFO method (reports/stockValuation.js), the cost of the layers the entry used / added - the same as the P&L.
import { addAdjustments, addWarrantyClaims, adjustmentDay, warrantyStockDay } from "../inventory/stockMovements.js";
import { averageCosts } from "../reports/averageCost.js";
import { fifoPeriod, fifoRun } from "../reports/stockValuation.js";
import { r2, livePurchasesOf, liveReturnsOf } from "../reports/reportFilters.js";

export const STOCK_ADJUSTMENT_ACCOUNT = "Stock Adjustment";
export const WARRANTY_STOCK_ACCOUNT = "Warranty Replacement Stock";

/**
 * data: the ledger's data (stockAdjustments / warrantyClaims at the top, in extras or rows.extras). products: the product
 * master; without it nothing is posted. -> [{ kind: "stockAdjust" | "warrantyStock", date, no, col, id, narration, value }]
 * value: stock taken out less stock put in (adjustments, a loss is positive) or stock received (warranty).
 */
export function stockLedgerEntries(data, { shopId = "", products = [], method = "average" } = {}) {
  if (!products?.length) return [];
  const fifoByDoc = method === "fifo" ? fifoPeriod(fifoRun(products, data, { shopId }), {}).byDoc : null;
  const pick = (k) => data?.[k] || data?.extras?.[k] || data?.rows?.extras?.[k] || [];
  const productById = new Map(products.filter((p) => p?.id).map((p) => [p.id, p]));
  const purchases = livePurchasesOf(data?.purchaseInvoices || data?.rows?.purchaseInvoices, shopId).filter((inv) => inv.source !== "openingBalance");
  const purchRet = liveReturnsOf(pick("purchaseReturns"), shopId);
  const avgByDay = new Map();
  const avgAt = (day) => {
    if (!avgByDay.has(day)) avgByDay.set(day, averageCosts(products, purchases, day, purchRet));
    return avgByDay.get(day);
  };
  const valueOf = (moved, day) => {
    const avg = avgAt(day);
    let t = 0;
    moved.forEach((q, id) => { if (productById.has(id)) t += q * (avg.get(id) || 0); });
    return r2(t);
  };
  const out = [];
  pick("stockAdjustments").forEach((adj) => {
    const moved = new Map();
    addAdjustments([adj], shopId, moved, productById);
    const day = adjustmentDay(adj);
    if (!moved.size || !day) return;
    const value = fifoByDoc ? r2(fifoByDoc.get(adj.id) || 0) : r2(-valueOf(moved, day));
    if (value === 0) return;
    out.push({ kind: "stockAdjust", date: day, no: adj.adjustNo || "", col: "stockAdjustments", id: adj.id, narration: [adj.reason, adj.note].filter(Boolean).join(" · "), value });
  });
  pick("warrantyClaims").forEach((c) => {
    const moved = new Map();
    addWarrantyClaims([c], shopId, moved, productById);
    const day = warrantyStockDay(c);
    if (!moved.size || !day) return;
    const value = fifoByDoc ? r2(fifoByDoc.get(c.id) || 0) : valueOf(moved, day);
    if (value === 0) return;
    out.push({ kind: "warrantyStock", date: day, no: c.claimNo || "", col: "warrantyClaims", id: c.id, narration: c.note || "", value });
  });
  return out;
}
