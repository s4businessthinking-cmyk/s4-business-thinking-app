// Sales analytics for a period: one set of filters over the live sales bills and sales returns, broken down by
// period, customer, product, brand, category, payment method and salesman. Same bills and VAT rule as the P&L
// (accountsCalc): confirmed / partial / paid bills only, no quotations, delivery notes or party opening balances;
// net sales = sales - returns - (VAT on sales - VAT on returns).
// Product amounts: a bill's net (without VAT) is shared over its lines in proportion to each line's net, so bill
// discount, adjustment and round off are spread over the lines and product totals add up to the bill totals.
import { n, r2, dayOf, inRange, liveSalesOf, liveReturnsOf } from "./reportFilters.js";
import { periodUnit } from "./cashFlow.js";
import { itemBaseQty } from "../inventory/unitConversion.js";

const lc = (v) => String(v || "").trim().toLowerCase();
const q4 = (v) => parseFloat((Number(v) || 0).toFixed(4));
const lineNet = (it) => Math.max(0, n(it.lineTotal) - n(it.vatAmt));

/** Status as the user sees it on the bill list: paid, partial or unpaid. */
export const payStatus = (inv) => (inv.status === "paid" ? "paid" : inv.status === "partial" ? "partial" : "unpaid");
export const salesmanOf = (inv) => String(inv.salesmanName || inv.createdByName || "").trim();

function bump(map, key, init, add) {
  const row = map.get(key) || init();
  add(row);
  map.set(key, row);
}

/**
 * data: { salesInvoices, salesReturns, products }.
 * filters: { shopId, from, to, today, customer, item, brand, category, method, salesman, type, status }
 *   customer: name / mobile text; item: product code / name / brand text; others exact.
 */
export function buildSalesAnalytics(data, filters = {}) {
  const { shopId = "", from = "", to = "", today = "", customer = "", item = "", brand = "", category = "", method = "", salesman = "", type = "", status = "" } = filters;
  const productById = new Map((data?.products || []).filter((p) => p?.id).map((p) => [p.id, p]));
  const catOf = (it) => String(productById.get(it.productId)?.category || "").trim();
  const brandOf = (it) => String(it.brand || productById.get(it.productId)?.brand || "").trim();
  const itemQ = lc(item), custQ = lc(customer);
  const lineFilter = !!(itemQ || brand || category);
  const lineMatches = (it) => (!itemQ || [it.code, it.name, brandOf(it)].some((v) => lc(v).includes(itemQ)))
    && (!brand || brandOf(it) === brand) && (!category || catOf(it) === category);
  const custMatches = (name, mobile) => !custQ || lc(name).includes(custQ) || lc(mobile).includes(custQ);

  const allSales = liveSalesOf(data?.salesInvoices, shopId).filter((inv) => inv.source !== "openingBalance");
  const options = {
    methods: [...new Set(allSales.map((i) => i.paymentMethod).filter(Boolean))].sort(),
    salesmen: [...new Set(allSales.map(salesmanOf).filter(Boolean))].sort(),
    types: [...new Set(allSales.map((i) => i.invoiceType).filter(Boolean))].sort(),
    brands: [...new Set(allSales.flatMap((i) => (i.items || []).map(brandOf)).filter(Boolean))].sort(),
    categories: [...new Set(allSales.flatMap((i) => (i.items || []).map(catOf)).filter(Boolean))].sort(),
  };

  const billFilter = !!(method || salesman || type || status);
  const billMatches = (inv) => (!method || inv.paymentMethod === method) && (!salesman || salesmanOf(inv) === salesman)
    && (!type || inv.invoiceType === type) && (!status || payStatus(inv) === status);
  const sales = allSales.filter((inv) => inRange(dayOf(inv.invoiceDate), from, to) && custMatches(inv.customerName, inv.customerMobile) && billMatches(inv));

  const periodRow = (period) => () => ({ period, count: 0, amount: 0, net: 0, vat: 0, returns: 0, returnsVat: 0, netSales: 0 });
  const byProduct = new Map(), byBrand = new Map(), byCategory = new Map(), byCustomer = new Map(), byMethod = new Map(), bySalesman = new Map(), byPeriod = new Map();
  const invoices = [];
  let gross = 0, vat = 0, discount = 0, paid = 0, balance = 0, qty = 0;
  const firstDate = sales.reduce((d, inv) => (!d || dayOf(inv.invoiceDate) < d ? dayOf(inv.invoiceDate) : d), "");
  const unit = periodUnit(from, to || today, firstDate);

  sales.forEach((inv) => {
    const items = inv.items || [];
    const invNet = n(inv.grandTotal) - n(inv.totalVat);
    const weightAll = items.reduce((t, it) => t + lineNet(it), 0);
    const shareOf = (it) => (weightAll > 0 ? lineNet(it) / weightAll : items.length ? 1 / items.length : 0);
    const matched = lineFilter ? items.filter(lineMatches) : items;
    if (lineFilter && !matched.length) return;
    // With a product filter only the matching lines' share of the bill counts.
    const part = lineFilter ? matched.reduce((t, it) => t + shareOf(it), 0) : 1;
    const amount = r2(n(inv.grandTotal) * part), tax = r2(n(inv.totalVat) * part), net = r2(amount - tax);
    gross += amount; vat += tax;
    if (!lineFilter) { discount += n(inv.totalDiscount); paid += n(inv.amountPaid); balance += Math.max(0, n(inv.balanceDue)); }

    const cust = String(inv.customerName || "").trim() || "Walk-in";
    const custKey = inv.customerId || `n:${lc(cust)}`;
    const count = (row) => { row.count += 1; row.amount = r2(row.amount + amount); row.net = r2(row.net + net); };
    bump(byCustomer, custKey, () => ({ key: custKey, name: cust, count: 0, amount: 0, net: 0, balance: 0 }), (row) => { count(row); if (!lineFilter) row.balance = r2(row.balance + Math.max(0, n(inv.balanceDue))); });
    bump(byMethod, inv.paymentMethod || "-", () => ({ key: inv.paymentMethod || "-", count: 0, amount: 0, net: 0 }), count);
    const sm = salesmanOf(inv) || "-";
    bump(bySalesman, sm, () => ({ key: sm, count: 0, amount: 0, net: 0 }), count);
    const d = dayOf(inv.invoiceDate), period = unit === "day" ? d : d.slice(0, 7);
    bump(byPeriod, period, periodRow(period), (row) => { count(row); row.vat = r2(row.vat + tax); });

    let lineQty = 0;
    matched.forEach((it) => {
      const lnNet = r2(invNet * shareOf(it));
      const q = itemBaseQty(it, productById.get(it.productId));
      lineQty += q;
      const key = it.productId || `n:${lc(it.code || it.name)}`;
      const p = productById.get(it.productId);
      bump(byProduct, key, () => ({ key, productId: it.productId || "", code: it.code || p?.code || "", name: it.name || p?.name || "", brand: brandOf(it), category: catOf(it), qty: 0, net: 0, bills: 0 }),
        (row) => { row.qty = q4(row.qty + q); row.net = r2(row.net + lnNet); row.bills += 1; });
      const b = brandOf(it) || "-", c = catOf(it) || "-";
      bump(byBrand, b, () => ({ key: b, qty: 0, net: 0 }), (row) => { row.qty = q4(row.qty + q); row.net = r2(row.net + lnNet); });
      bump(byCategory, c, () => ({ key: c, qty: 0, net: 0 }), (row) => { row.qty = q4(row.qty + q); row.net = r2(row.net + lnNet); });
    });
    qty += lineQty;
    invoices.push({
      id: inv.id, no: inv.invoiceNo || "", date: d, customer: cust, salesman: salesmanOf(inv), method: inv.paymentMethod || "", type: inv.invoiceType || "",
      status: payStatus(inv), amount, vat: tax, net, paid: lineFilter ? null : r2(n(inv.amountPaid)), balance: lineFilter ? null : r2(Math.max(0, n(inv.balanceDue))), qty: q4(lineQty),
    });
  });

  // Returns dated in the period. A return follows its bill: the bill-level filters (payment, salesman, type,
  // status) and the customer filter are checked on the bill it was made against (the bill may be from an earlier
  // period). A return without a live bill only counts when no bill-level filter is set.
  const billById = new Map(allSales.map((inv) => [inv.id, inv]));
  let returnsTotal = 0, returnsVat = 0, returnsCount = 0;
  liveReturnsOf(data?.salesReturns, shopId).forEach((ret) => {
    if (!inRange(dayOf(ret.returnDate), from, to)) return;
    const bill = ret.invoiceId ? billById.get(ret.invoiceId) : null;
    if (!custMatches(ret.partyName, ret.partyMobile) && !(bill && custMatches(bill.customerName, bill.customerMobile))) return;
    if (billFilter && !(bill && billMatches(bill))) return;
    let total, tax;
    if (lineFilter) {
      const lines = (ret.items || []).filter(lineMatches);
      if (!lines.length) return;
      total = lines.reduce((t, it) => t + n(it.amount), 0);
      tax = lines.reduce((t, it) => t + n(it.vatAmt), 0);
    } else {
      total = n(ret.total);
      tax = n(ret.totalVat);
    }
    returnsTotal += total; returnsVat += tax; returnsCount += 1;
    const d = dayOf(ret.returnDate), period = unit === "day" ? d : d.slice(0, 7);
    bump(byPeriod, period, periodRow(period), (row) => { row.returns = r2(row.returns + total); row.returnsVat = r2(row.returnsVat + tax); });
  });
  // net sales of each period, the P&L way (the period rows then add up to the KPI)
  byPeriod.forEach((row) => { row.netSales = r2(row.net - (row.returns - row.returnsVat)); });

  const kpi = {
    count: invoices.length, gross: r2(gross), vat: r2(vat), net: r2(gross - vat), discount: lineFilter ? null : r2(discount),
    avgBill: invoices.length ? r2(gross / invoices.length) : 0, paid: lineFilter ? null : r2(paid), balance: lineFilter ? null : r2(balance), qty: q4(qty),
    returnsTotal: r2(returnsTotal), returnsVat: r2(returnsVat), returnsCount, netSales: r2(gross - returnsTotal - (vat - returnsVat)),
  };
  const byAmount = (a, b) => b.amount - a.amount || String(a.name || a.key).localeCompare(String(b.name || b.key));
  const byNet = (a, b) => b.net - a.net || String(a.name || a.key).localeCompare(String(b.name || b.key));
  return {
    kpi, unit, options, lineFilter,
    invoices: invoices.sort((a, b) => b.date.localeCompare(a.date) || String(b.no).localeCompare(String(a.no), undefined, { numeric: true })),
    byPeriod: [...byPeriod.values()].sort((a, b) => a.period.localeCompare(b.period)),
    byCustomer: [...byCustomer.values()].sort(byAmount),
    byProduct: [...byProduct.values()].sort(byNet),
    byBrand: [...byBrand.values()].sort(byNet),
    byCategory: [...byCategory.values()].sort(byNet),
    byMethod: [...byMethod.values()].sort(byAmount),
    bySalesman: [...bySalesman.values()].sort(byAmount),
  };
}
