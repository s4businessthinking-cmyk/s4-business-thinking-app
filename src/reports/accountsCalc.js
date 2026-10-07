import { computeStockMap } from "../inventory/stockFromInvoices";
import { itemBaseQty } from "../inventory/unitConversion";
import { expenseCategoryLabel } from "../expenses/ExpensesTab.jsx";
import { n, dayOf, inRange, isLive, liveSalesOf, livePurchasesOf, liveReturnsOf } from "./reportFilters.js";

export { r2 } from "./reportFilters.js";

// Weighted average purchase cost per base unit up to a date: opening stock at its rate plus every confirmed purchase (VAT excluded).
function averageCosts(products, purchases, upTo) {
  const acc = new Map();
  (products || []).forEach((p) => {
    const q = n(p.openingStock);
    const rate = n(p.openingRate) || n(p.landingCost);
    acc.set(p.id, { qty: q > 0 ? q : 0, value: q > 0 ? q * rate : 0, fallback: n(p.landingCost) || n(p.averageCost) || rate });
  });
  const productById = new Map((products || []).map((p) => [p.id, p]));
  purchases.forEach((inv) => {
    if (upTo && dayOf(inv.invoiceDate) > upTo) return;
    (inv.items || []).forEach((it) => {
      if (!it?.productId || !acc.has(it.productId)) return;
      const q = itemBaseQty(it, productById.get(it.productId));
      if (q <= 0) return;
      const net = n(it.lineTotal) - n(it.taxAmt);
      const a = acc.get(it.productId);
      a.qty += q;
      a.value += net > 0 ? net : 0;
    });
  });
  const out = new Map();
  acc.forEach((a, id) => out.set(id, a.qty > 0 && a.value > 0 ? a.value / a.qty : a.fallback));
  return out;
}

export function computeAccounts(data, { products = [], shopId, from, to, bn }) {
  if (!data) return null;
  const liveSales = liveSalesOf(data.salesInvoices, shopId);
  const sales = liveSales.filter((inv) => inv.source !== "openingBalance");
  const livePurchases = livePurchasesOf(data.purchaseInvoices, shopId);
  const purchases = livePurchases.filter((inv) => inv.source !== "openingBalance");
  const receipts = (data.receipts || []).filter((r) => isLive(r, shopId) && r.status !== "cancelled");
  const payments = (data.payments || []).filter((p) => isLive(p, shopId) && p.status !== "cancelled");
  const productById = new Map(products.map((p) => [p.id, p]));
  const avg = averageCosts(products, purchases, to);

  const salesIn = sales.filter((inv) => inRange(dayOf(inv.invoiceDate), from, to));
  const purchIn = purchases.filter((inv) => inRange(dayOf(inv.invoiceDate), from, to));

  const salesRet = liveReturnsOf(data.extras?.salesReturns, shopId);
  const purchRet = liveReturnsOf(data.extras?.purchaseReturns, shopId);
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
  const grossProfit = netSales - cogs;

  const grossPurch = purchIn.reduce((t, inv) => t + n(inv.grandTotal), 0);
  const vatIn = purchIn.reduce((t, inv) => t + n(inv.totalTax), 0) - purchReturnVat;

  const allocSum = (vouchers, id) => vouchers.reduce((t, v) => t + (v.allocations || []).filter((a) => a.invoiceId === id).reduce((x, a) => x + n(a.amount), 0), 0);
  const appliedSum = (rets, id) => rets.filter((r) => r.invoiceId === id).reduce((t, r) => t + n(r.appliedToInvoice), 0);
  const cashOnSales = salesIn.reduce((t, inv) => t + Math.max(0, n(inv.amountPaid) - allocSum(receipts, inv.id) - appliedSum(salesRet, inv.id)), 0);
  const receiptsIn = receipts.filter((r) => inRange(dayOf(r.receiptDate || r.createdAt), from, to)).reduce((t, r) => t + n(r.totalAmount), 0);
  const cashOnPurch = purchIn.reduce((t, inv) => t + Math.max(0, n(inv.amountPaid) - allocSum(payments, inv.id) - appliedSum(purchRet, inv.id)), 0);
  const refundsPaid = salesRetIn.reduce((t, r) => t + n(r.refundAmount), 0);
  const refundsReceived = purchRetIn.reduce((t, r) => t + n(r.refundAmount), 0);
  const paymentsIn = payments.filter((p) => inRange(dayOf(p.paymentDate || p.createdAt), from, to));
  const paymentsOut = paymentsIn.reduce((t, p) => t + n(p.chequeAmount ?? p.totalAmount), 0);
  const vendorDiscount = paymentsIn.reduce((t, p) => t + n(p.discountAmount), 0);

  const expensesIn = (data.expenses || []).filter((e) => isLive(e, shopId) && e.status !== "cancelled" && inRange(dayOf(e.expenseDate), from, to));
  const expenseTotal = expensesIn.reduce((t, e) => t + n(e.amount), 0);
  // A bounced expense cheque is still an expense, but the money never left.
  const expensePaid = expensesIn.filter((e) => !(e.method === "cheque" && e.chequeStatus === "bounced")).reduce((t, e) => t + n(e.amount), 0);
  const expenseMap = new Map();
  expensesIn.forEach((e) => { const k = expenseCategoryLabel(e, bn); expenseMap.set(k, (expenseMap.get(k) || 0) + n(e.amount)); });
  const expenseByCat = [...expenseMap.entries()].sort((a, b) => b[1] - a[1]);

  const receivable = liveSales.reduce((t, inv) => t + Math.max(0, n(inv.balanceDue)), 0);
  const payable = livePurchases.reduce((t, inv) => t + Math.max(0, n(inv.balanceDue)), 0);
  const stock = computeStockMap(products, data.purchaseInvoices, data.salesInvoices, shopId, data.deliveryNotes, data.extras);
  let stockValue = 0;
  stock.forEach((q, id) => { if (q > 0) stockValue += q * (avg.get(id) || 0); });

  return {
    count: salesIn.length, purchCount: purchIn.length, grossSales, vatOut, netSales, cogs, grossProfit,
    margin: netSales > 0 ? (grossProfit / netSales) * 100 : 0, unpriced,
    grossPurch, vatIn, netPurch: grossPurch - purchReturnTotal - vatIn, vatPayable: vatOut - vatIn,
    salesReturnTotal, salesReturnCount: salesRetIn.length, purchReturnTotal, purchReturnCount: purchRetIn.length,
    moneyIn: cashOnSales + receiptsIn + refundsReceived, cashOnSales, receiptsIn, refundsReceived,
    moneyOut: cashOnPurch + paymentsOut + expensePaid + refundsPaid, cashOnPurch, paymentsOut, refundsPaid, expensePaid,
    receivable, payable, stockValue,
    expenseTotal, expenseByCat, expenseCount: expensesIn.length, vendorDiscount, netProfit: grossProfit + vendorDiscount - expenseTotal,
  };
}
