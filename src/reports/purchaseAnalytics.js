// Purchase analytics for a period, the purchase-side mirror of salesAnalytics.js: one set of filters over the live
// purchase bills and purchase returns, broken down by period, supplier, product, brand, category, payment method and
// user. Same bills and VAT rule as the P&L (accountsCalc): confirmed / partial / paid bills only, no branch-transfer
// bills and no party opening balances; net purchases = purchases - returns - (VAT on purchases - VAT on returns).
// Product amounts: a bill's net (without VAT) is shared over its lines in proportion to each line's net, so bill
// discount and adjustments are spread over the lines and product totals add up to the bill totals.
import { n, r2, dayOf, inRange, livePurchasesOf, liveReturnsOf } from "./reportFilters.js";
import { periodUnit } from "./cashFlow.js";
import { itemBaseQty } from "../inventory/unitConversion.js";

const lc = (v) => String(v || "").trim().toLowerCase();
const q4 = (v) => parseFloat((Number(v) || 0).toFixed(4));
const lineNet = (it) => Math.max(0, n(it.lineTotal) - n(it.taxAmt));

/** Status as the user sees it on the bill list: paid, partial or unpaid. */
export const payStatus = (inv) => (inv.status === "paid" ? "paid" : inv.status === "partial" ? "partial" : "unpaid");
export const enteredBy = (inv) => String(inv.createdByName || "").trim();

function bump(map, key, init, add) {
  const row = map.get(key) || init();
  add(row);
  map.set(key, row);
}

/**
 * data: { purchaseInvoices, purchaseReturns, products }.
 * filters: { shopId, from, to, today, vendor, item, brand, category, method, user, status }
 *   vendor: name / mobile / supplier bill no text; item: product code / name / brand text; others exact.
 */
export function buildPurchaseAnalytics(data, filters = {}) {
  const { shopId = "", from = "", to = "", today = "", vendor = "", item = "", brand = "", category = "", method = "", user = "", status = "" } = filters;
  const productById = new Map((data?.products || []).filter((p) => p?.id).map((p) => [p.id, p]));
  const catOf = (it) => String(productById.get(it.productId)?.category || "").trim();
  const brandOf = (it) => String(it.brand || productById.get(it.productId)?.brand || "").trim();
  const itemQ = lc(item), vendQ = lc(vendor);
  const lineFilter = !!(itemQ || brand || category);
  const lineMatches = (it) => (!itemQ || [it.code, it.name, brandOf(it)].some((v) => lc(v).includes(itemQ)))
    && (!brand || brandOf(it) === brand) && (!category || catOf(it) === category);
  const vendMatches = (...fields) => !vendQ || fields.some((v) => lc(v).includes(vendQ));

  const allBills = livePurchasesOf(data?.purchaseInvoices, shopId).filter((inv) => inv.source !== "openingBalance");
  const options = {
    methods: [...new Set(allBills.map((i) => i.paymentMethod).filter(Boolean))].sort(),
    users: [...new Set(allBills.map(enteredBy).filter(Boolean))].sort(),
    brands: [...new Set(allBills.flatMap((i) => (i.items || []).map(brandOf)).filter(Boolean))].sort(),
    categories: [...new Set(allBills.flatMap((i) => (i.items || []).map(catOf)).filter(Boolean))].sort(),
  };

  const bills = allBills.filter((inv) => inRange(dayOf(inv.invoiceDate), from, to)
    && vendMatches(inv.vendorName, inv.vendorMobile, inv.supplierInvoiceNo)
    && (!method || inv.paymentMethod === method) && (!user || enteredBy(inv) === user) && (!status || payStatus(inv) === status));

  const byProduct = new Map(), byBrand = new Map(), byCategory = new Map(), byVendor = new Map(), byMethod = new Map(), byUser = new Map(), byPeriod = new Map();
  const invoices = [];
  let gross = 0, vat = 0, discount = 0, paid = 0, balance = 0, qty = 0;
  const firstDate = bills.reduce((d, inv) => (!d || dayOf(inv.invoiceDate) < d ? dayOf(inv.invoiceDate) : d), "");
  const unit = periodUnit(from, to || today, firstDate);

  bills.forEach((inv) => {
    const items = inv.items || [];
    const invNet = n(inv.grandTotal) - n(inv.totalTax);
    const weightAll = items.reduce((t, it) => t + lineNet(it), 0);
    const shareOf = (it) => (weightAll > 0 ? lineNet(it) / weightAll : items.length ? 1 / items.length : 0);
    const matched = lineFilter ? items.filter(lineMatches) : items;
    if (lineFilter && !matched.length) return;
    // With a product filter only the matching lines' share of the bill counts.
    const part = lineFilter ? matched.reduce((t, it) => t + shareOf(it), 0) : 1;
    const amount = r2(n(inv.grandTotal) * part), tax = r2(n(inv.totalTax) * part), net = r2(amount - tax);
    gross += amount; vat += tax;
    if (!lineFilter) { discount += n(inv.totalDiscount); paid += n(inv.amountPaid); balance += Math.max(0, n(inv.balanceDue)); }

    const vend = String(inv.vendorName || "").trim() || "-";
    const vendKey = inv.vendorId || `n:${lc(vend)}`;
    const count = (row) => { row.count += 1; row.amount = r2(row.amount + amount); row.net = r2(row.net + net); };
    bump(byVendor, vendKey, () => ({ key: vendKey, name: vend, count: 0, amount: 0, net: 0, balance: 0 }), (row) => { count(row); if (!lineFilter) row.balance = r2(row.balance + Math.max(0, n(inv.balanceDue))); });
    bump(byMethod, inv.paymentMethod || "-", () => ({ key: inv.paymentMethod || "-", count: 0, amount: 0, net: 0 }), count);
    const who = enteredBy(inv) || "-";
    bump(byUser, who, () => ({ key: who, count: 0, amount: 0, net: 0 }), count);
    const d = dayOf(inv.invoiceDate), period = unit === "day" ? d : d.slice(0, 7);
    bump(byPeriod, period, () => ({ period, count: 0, amount: 0, net: 0, vat: 0 }), (row) => { count(row); row.vat = r2(row.vat + tax); });

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
      id: inv.id, no: inv.invoiceNo || "", supplierNo: inv.supplierInvoiceNo || "", date: d, vendor: vend, user: enteredBy(inv), method: inv.paymentMethod || "",
      status: payStatus(inv), amount, vat: tax, net, paid: lineFilter ? null : r2(n(inv.amountPaid)), balance: lineFilter ? null : r2(Math.max(0, n(inv.balanceDue))), qty: q4(lineQty),
    });
  });

  // Returns in the period for the same supplier / product filters (bill-level filters do not apply to a return).
  let returnsTotal = 0, returnsVat = 0, returnsCount = 0;
  liveReturnsOf(data?.purchaseReturns, shopId).forEach((ret) => {
    if (!inRange(dayOf(ret.returnDate), from, to) || !vendMatches(ret.partyName, ret.partyMobile, ret.supplierInvoiceNo)) return;
    if (lineFilter) {
      const lines = (ret.items || []).filter(lineMatches);
      if (!lines.length) return;
      returnsTotal += lines.reduce((t, it) => t + n(it.amount), 0);
      returnsVat += lines.reduce((t, it) => t + n(it.vatAmt), 0);
    } else {
      returnsTotal += n(ret.total);
      returnsVat += n(ret.totalVat);
    }
    returnsCount += 1;
  });

  const kpi = {
    count: invoices.length, gross: r2(gross), vat: r2(vat), net: r2(gross - vat), discount: lineFilter ? null : r2(discount),
    avgBill: invoices.length ? r2(gross / invoices.length) : 0, paid: lineFilter ? null : r2(paid), balance: lineFilter ? null : r2(balance), qty: q4(qty),
    returnsTotal: r2(returnsTotal), returnsVat: r2(returnsVat), returnsCount, netPurchases: r2(gross - returnsTotal - (vat - returnsVat)),
  };
  const byAmount = (a, b) => b.amount - a.amount || String(a.name || a.key).localeCompare(String(b.name || b.key));
  const byNet = (a, b) => b.net - a.net || String(a.name || a.key).localeCompare(String(b.name || b.key));
  return {
    kpi, unit, options, lineFilter,
    invoices: invoices.sort((a, b) => b.date.localeCompare(a.date) || String(b.no).localeCompare(String(a.no), undefined, { numeric: true })),
    byPeriod: [...byPeriod.values()].sort((a, b) => a.period.localeCompare(b.period)),
    byVendor: [...byVendor.values()].sort(byAmount),
    byProduct: [...byProduct.values()].sort(byNet),
    byBrand: [...byBrand.values()].sort(byNet),
    byCategory: [...byCategory.values()].sort(byNet),
    byMethod: [...byMethod.values()].sort(byAmount),
    byUser: [...byUser.values()].sort(byAmount),
  };
}
