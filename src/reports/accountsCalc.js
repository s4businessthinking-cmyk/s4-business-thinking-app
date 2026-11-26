import { computeStockMap, addAdjustments, addWarrantyClaims } from "../inventory/stockFromInvoices";
import { adjustmentDay, warrantyStockDay } from "../inventory/stockMovements.js";
import { itemBaseQty } from "../inventory/unitConversion";
import { expenseCategoryLabel } from "../expenses/ExpensesTab.jsx";
import { journalPlByAccount, journalPlTotal } from "./journalPl.js";
import { averageCosts } from "./averageCost.js";
import { fifoPeriod, fifoRun } from "./stockValuation.js";
import { n, dayOf, inRange, isLive, liveSalesOf, livePurchasesOf, liveReturnsOf, r2 } from "./reportFilters.js";

export { r2 } from "./reportFilters.js";

/**
 * Stock gained or lost outside buying and selling, at the same average cost the stock value uses, so profit moves
 * with the closing stock on the balance sheet. Adjustments (damage, loss, count difference, exchange, convert) count on
 * their adjust date; a warranty unit replaced by the company counts on its replaced day (the day the balance sheet adds it).
 * -> { adjustLoss: value taken out less value put in, warrantyGain, adjustCount, warrantyCount }
 */
export function stockEffects(extras, { products = [], shopId, from, to, avg }) {
  const productById = new Map((products || []).filter((p) => p?.id).map((p) => [p.id, p]));
  const adjIn = (extras?.stockAdjustments || []).filter((a) => inRange(adjustmentDay(a), from, to));
  const wcIn = (extras?.warrantyClaims || []).filter((c) => inRange(warrantyStockDay(c), from, to));
  const adj = new Map(), wc = new Map();
  addAdjustments(adjIn, shopId, adj, productById);
  addWarrantyClaims(wcIn, shopId, wc, productById);
  const value = (m) => { let t = 0; m.forEach((q, id) => { if (productById.has(id)) t += q * (avg.get(id) || 0); }); return t; };
  const counted = (list, status) => list.filter((d) => d && !d.isDeleted && !d.deleted && d.status === status && (!shopId || !d.shopId || d.shopId === shopId)).length;
  return { adjustLoss: r2(-value(adj)), warrantyGain: r2(value(wc)), adjustCount: counted(adjIn, "confirmed"), warrantyCount: counted(wcIn, "replaced") };
}

// natureOf: chart-of-accounts nature of custom accounts (ledger/accountNature.js), so journal P&L follows the shop's groups
// method: stock valuation, "average" (default) or "fifo" (stockValuation.js) - cost of goods sold, write-offs and stock value
// fifoShared: a FIFO run of the whole shop (group view): this data's own sales / returns take their cost from it
export function computeAccounts(data, { products = [], shopId, from, to, bn, natureOf = null, method = "average", fifoShared = null }) {
  if (!data) return null;
  const liveSales = liveSalesOf(data.salesInvoices, shopId);
  const sales = liveSales.filter((inv) => inv.source !== "openingBalance");
  const livePurchases = livePurchasesOf(data.purchaseInvoices, shopId);
  const purchases = livePurchases.filter((inv) => inv.source !== "openingBalance");
  const receipts = (data.receipts || []).filter((r) => isLive(r, shopId) && r.status !== "cancelled");
  const payments = (data.payments || []).filter((p) => isLive(p, shopId) && p.status !== "cancelled");
  const productById = new Map(products.map((p) => [p.id, p]));
  const salesRet = liveReturnsOf(data.extras?.salesReturns, shopId);
  const purchRet = liveReturnsOf(data.extras?.purchaseReturns, shopId);
  const avg = averageCosts(products, purchases, to, purchRet);

  const salesIn = sales.filter((inv) => inRange(dayOf(inv.invoiceDate), from, to));
  const purchIn = purchases.filter((inv) => inRange(dayOf(inv.invoiceDate), from, to));

  const salesRetIn = salesRet.filter((r) => inRange(dayOf(r.returnDate), from, to));
  const purchRetIn = purchRet.filter((r) => inRange(dayOf(r.returnDate), from, to));
  const salesReturnTotal = salesRetIn.reduce((t, r) => t + n(r.total), 0);
  const salesReturnVat = salesRetIn.reduce((t, r) => t + n(r.totalVat), 0);
  const purchReturnTotal = purchRetIn.reduce((t, r) => t + n(r.total), 0);
  const purchReturnVat = purchRetIn.reduce((t, r) => t + n(r.totalVat), 0);

  const grossSales = salesIn.reduce((t, inv) => t + n(inv.grandTotal), 0);
  const vatOut = salesIn.reduce((t, inv) => t + n(inv.totalVat), 0) - salesReturnVat;
  const netSales = grossSales - salesReturnTotal - vatOut;
  let cogs = 0;
  let unpriced = 0;
  const fifo = method === "fifo" ? fifoShared || fifoRun(products, data, { shopId, upTo: to }) : null;
  const ownDocs = fifoShared ? new Set([...sales.map((inv) => inv.id), ...salesRet.map((r) => r.id)]) : null;
  const fifoPl = fifo ? fifoPeriod(ownDocs ? { ...fifo, issues: fifo.issues.filter((x) => (x.kind === "sale" || x.kind === "salesReturn" ? ownDocs.has(x.docId) : x.kind !== "shortfall")) } : fifo, { from, to }) : null;
  if (fifo) {
    cogs = fifoPl.cogs;
    unpriced = fifo.issues.filter((x) => x.kind === "sale" && inRange(x.date, from, to) && !(x.value > 0)).length;
  } else {
    salesIn.forEach((inv) => (inv.items || []).forEach((it) => {
      if (!it?.productId) return;
      const cost = avg.get(it.productId) || 0;
      if (!cost) unpriced += 1;
      cogs += itemBaseQty(it, productById.get(it.productId)) * cost;
    }));
    salesRetIn.forEach((r) => (r.items || []).forEach((it) => {
      if (!it?.productId) return;
      cogs -= itemBaseQty(it, productById.get(it.productId)) * (avg.get(it.productId) || 0);
    }));
  }
  const grossProfit = netSales - cogs;
  const effects = stockEffects(data.extras, { products, shopId, from, to, avg });
  const { adjustCount, warrantyCount } = effects;
  const adjustLoss = fifo ? r2(fifoPl.adjustLoss) : effects.adjustLoss;
  const warrantyGain = fifo ? r2(fifoPl.warrantyGain) : effects.warrantyGain;

  const grossPurch = purchIn.reduce((t, inv) => t + n(inv.grandTotal), 0);
  const vatIn = purchIn.reduce((t, inv) => t + n(inv.totalTax), 0) - purchReturnVat;

  const allocSum = (vouchers, id) => vouchers.filter((v) => !v.isRefund).reduce((t, v) => t + (v.allocations || []).filter((a) => a.invoiceId === id).reduce((x, a) => x + n(a.amount), 0), 0);
  const appliedSum = (rets, id) => rets.filter((r) => r.invoiceId === id).reduce((t, r) => t + n(r.appliedToInvoice), 0);
  // fxSettledAed: closed by an exchange loss journal, not cash (reports/salesForex.js)
  const cashOnSales = salesIn.reduce((t, inv) => t + Math.max(0, n(inv.amountPaid) - allocSum(receipts, inv.id) - appliedSum(salesRet, inv.id) - n(inv.fxSettledAed)), 0);
  // Refund vouchers are not customer receipts — refundsPaid/Received come from returns.
  const receiptsIn = receipts.filter((r) => !r.isRefund && inRange(dayOf(r.receiptDate || r.createdAt), from, to)).reduce((t, r) => t + n(r.totalAmount), 0);
  const cashOnPurch = purchIn.reduce((t, inv) => t + Math.max(0, n(inv.amountPaid) - allocSum(payments, inv.id) - appliedSum(purchRet, inv.id)), 0);
  const refundsPaid = salesRetIn.reduce((t, r) => t + n(r.refundAmount), 0);
  const refundsReceived = purchRetIn.reduce((t, r) => t + n(r.refundAmount), 0);
  const paymentsIn = payments.filter((p) => !p.isRefund && inRange(dayOf(p.paymentDate || p.createdAt), from, to));
  const paymentsOut = paymentsIn.reduce((t, p) => t + n(p.chequeAmount ?? p.totalAmount), 0);
  const vendorDiscount = paymentsIn.reduce((t, p) => t + n(p.discountAmount), 0);

  const expensesIn = (data.expenses || []).filter((e) => isLive(e, shopId) && e.status !== "cancelled" && inRange(dayOf(e.expenseDate), from, to));
  // VAT on an expense bill is claimed back in the VAT return, so only the amount without it is a cost.
  const expenseCost = (e) => n(e.amount) - Math.max(0, n(e.vatAmount));
  const journalVouchers = (data.accountVouchers || data.extras?.accountVouchers || []).filter((v) => isLive(v, shopId));
  const journalPl = journalPlByAccount(journalVouchers, shopId, from, to, natureOf);
  const journalExpenseTotal = journalPlTotal(journalPl);

  const expenseTotal = r2(expensesIn.reduce((t, e) => t + expenseCost(e), 0) + journalExpenseTotal);
  // Bounced cheques and partner-pocket payments do not reduce shop cash.
  const expensePaid = expensesIn.filter((e) => !(e.method === "cheque" && e.chequeStatus === "bounced") && e.method !== "partner")
    .reduce((t, e) => t + n(e.amount), 0);
  const expenseMap = new Map();
  expensesIn.forEach((e) => { const k = expenseCategoryLabel(e, bn); expenseMap.set(k, (expenseMap.get(k) || 0) + expenseCost(e)); });
  journalPl.forEach((amt, ac) => { expenseMap.set(ac, r2((expenseMap.get(ac) || 0) + amt)); });
  const expenseByCat = [...expenseMap.entries()].sort((a, b) => b[1] - a[1]);

  const receivable = liveSales.reduce((t, inv) => t + Math.max(0, n(inv.balanceDue)), 0);
  const payable = livePurchases.reduce((t, inv) => t + Math.max(0, n(inv.balanceDue)), 0);
  const stock = computeStockMap(products, data.purchaseInvoices, data.salesInvoices, shopId, data.deliveryNotes, data.extras);
  let stockValue = 0;
  const unit = fifo ? fifo.unitCost : avg;
  stock.forEach((q, id) => { if (q > 0) stockValue += q * (unit.get(id) || 0); });

  return {
    count: salesIn.length, purchCount: purchIn.length, grossSales, vatOut, netSales, cogs, grossProfit,
    margin: netSales > 0 ? (grossProfit / netSales) * 100 : 0, unpriced,
    grossPurch, vatIn, netPurch: grossPurch - purchReturnTotal - vatIn, vatPayable: vatOut - vatIn,
    salesReturnTotal, salesReturnCount: salesRetIn.length, purchReturnTotal, purchReturnCount: purchRetIn.length,
    moneyIn: cashOnSales + receiptsIn + refundsReceived, cashOnSales, receiptsIn, refundsReceived,
    moneyOut: cashOnPurch + paymentsOut + expensePaid + refundsPaid, cashOnPurch, paymentsOut, refundsPaid, expensePaid,
    receivable, payable, stockValue,
    expenseTotal, expenseByCat, expenseCount: expensesIn.length, journalExpenseTotal, vendorDiscount,
    stockAdjustLoss: adjustLoss, stockAdjustCount: adjustCount, warrantyStockGain: warrantyGain, warrantyStockCount: warrantyCount,
    netProfit: grossProfit + vendorDiscount - expenseTotal - adjustLoss + warrantyGain,
  };
}
