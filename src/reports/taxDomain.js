import { n, r2, dayOf, inRange, isLive, liveSalesOf, livePurchasesOf, liveReturnsOf } from "./reportFilters.js";

// dueDays: days after the period ends to file and pay; null when the country has no single fixed rule.
export const TAX_PRESETS = {
  ae: { bn: "সংযুক্ত আরব আমিরাত (UAE)", en: "United Arab Emirates (UAE)", taxName: "VAT", rate: 5, currency: "AED", filingUrl: "https://eservices.tax.gov.ae", dueDays: 28, ct: true },
  sa: { bn: "সৌদি আরব", en: "Saudi Arabia", taxName: "VAT", rate: 15, currency: "SAR", filingUrl: "https://zatca.gov.sa", dueDays: null, ct: false },
  om: { bn: "ওমান", en: "Oman", taxName: "VAT", rate: 5, currency: "OMR", filingUrl: "https://tms.taxoman.gov.om", dueDays: 30, ct: false },
  bh: { bn: "বাহরাইন", en: "Bahrain", taxName: "VAT", rate: 10, currency: "BHD", filingUrl: "https://www.nbr.gov.bh", dueDays: null, ct: false },
  qa: { bn: "কাতার", en: "Qatar", taxName: "Tax", rate: 0, currency: "QAR", filingUrl: "https://dhareeba.gov.qa", dueDays: null, ct: false },
  kw: { bn: "কুয়েত", en: "Kuwait", taxName: "Tax", rate: 0, currency: "KWD", filingUrl: "https://www.mof.gov.kw", dueDays: null, ct: false },
  bd: { bn: "বাংলাদেশ", en: "Bangladesh", taxName: "VAT", rate: 15, currency: "BDT", filingUrl: "https://vat.gov.bd", dueDays: 15, ct: false },
  in: { bn: "ভারত", en: "India", taxName: "GST", rate: 18, currency: "INR", filingUrl: "https://www.gst.gov.in", dueDays: 20, ct: false },
  custom: { bn: "অন্য দেশ (নিজে লিখুন)", en: "Other country (custom)", taxName: "VAT", rate: 0, currency: "", filingUrl: "", dueDays: null, ct: false },
};

export const UAE_CT_DEFAULTS = { ctThreshold: 375000, ctRate: 9, sbrLimit: 3000000 };

export function presetSettings(country) {
  const p = TAX_PRESETS[country] || TAX_PRESETS.custom;
  return {
    country: TAX_PRESETS[country] ? country : "custom",
    taxName: p.taxName, rate: p.rate, currency: p.currency, filingUrl: p.filingUrl,
    dueDays: p.dueDays, ctEnabled: p.ct, ctFilingUrl: p.ct ? p.filingUrl : "",
  };
}

export const DEFAULT_TAX_SETTINGS = {
  ...presetSettings("ae"),
  period: "quarterly",
  periodStartMonth: 1,
  fyStartMonth: 1,
  ...UAE_CT_DEFAULTS,
  sbrElected: false,
};

export const CURRENCIES = [
  ["AED", "Dirhams (AED)"], ["SAR", "Saudi Riyal (SAR)"], ["OMR", "Omani Rial (OMR)"], ["BHD", "Bahraini Dinar (BHD)"],
  ["QAR", "Qatari Riyal (QAR)"], ["KWD", "Kuwaiti Dinar (KWD)"], ["BDT", "Taka (BDT)"], ["INR", "Rupee (INR)"], ["USD", "US Dollar (USD)"], ["EUR", "Euro (EUR)"],
];
export const UAE_EMIRATES = ["Abu Dhabi", "Dubai", "Sharjah", "Ajman", "Umm Al Quwain", "Ras Al Khaimah", "Fujairah"];

const PRESET_KEYS = ["taxName", "rate", "filingUrl", "dueDays", "ctEnabled", "ctFilingUrl"];

// Country, currency, financial year and "tax applicable" live on the shop (Shop Info); the Tax page reads them from there.
export function taxSettingsOf(shop) {
  const saved = shop?.taxSettings && typeof shop.taxSettings === "object" ? shop.taxSettings : {};
  const country = shop?.country || saved.country || DEFAULT_TAX_SETTINGS.country;
  const preset = presetSettings(country);
  // A shop that moved to another country gets that country's rate and website instead of the old ones.
  const presetPart = saved.country === country
    ? {}
    : { ...Object.fromEntries(PRESET_KEYS.map((k) => [k, preset[k]])), ...(country === "ae" ? UAE_CT_DEFAULTS : {}) };
  const merged = {
    ...DEFAULT_TAX_SETTINGS, ...preset, ...saved, ...presetPart,
    country: preset.country,
    currency: shop?.currency || saved.currency || preset.currency,
    fyStartMonth: shop?.fyStartMonth || saved.fyStartMonth || 1,
    taxApplicable: shop?.taxApplicable === "none" ? "none" : "yes",
  };
  merged.period = merged.period === "monthly" ? "monthly" : "quarterly";
  merged.periodStartMonth = clampMonth(merged.periodStartMonth);
  merged.fyStartMonth = clampMonth(merged.fyStartMonth);
  return merged;
}

const clampMonth = (m) => Math.min(12, Math.max(1, Math.round(n(m)) || 1));
const pad = (v) => String(v).padStart(2, "0");
export const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// offset 0 = the period that contains `today`, -1 = the one before it.
export function periodRange(settings, offset = 0, today = new Date()) {
  const len = settings.period === "monthly" ? 1 : 3;
  const m = today.getMonth();
  const first = len === 1 ? m : m - ((((m - (clampMonth(settings.periodStartMonth) - 1)) % 3) + 3) % 3);
  const start = new Date(today.getFullYear(), first + offset * len, 1);
  const end = new Date(today.getFullYear(), first + (offset + 1) * len, 0);
  const label = len === 1
    ? `${MONTHS[start.getMonth()]} ${start.getFullYear()}`
    : `${MONTHS[start.getMonth()]} ${start.getFullYear() === end.getFullYear() ? "" : `${start.getFullYear()} `}– ${MONTHS[end.getMonth()]} ${end.getFullYear()}`;
  return { from: isoDay(start), to: isoDay(end), label };
}

export function fyRange(settings, offset = 0, today = new Date()) {
  const fm = clampMonth(settings.fyStartMonth) - 1;
  const sy = (today.getMonth() >= fm ? today.getFullYear() : today.getFullYear() - 1) + offset;
  const start = new Date(sy, fm, 1);
  const end = new Date(sy + 1, fm, 0);
  return { from: isoDay(start), to: isoDay(end), label: fm === 0 ? String(sy) : `${sy}-${String(sy + 1).slice(2)}`, endDate: end };
}

export function addDays(iso, days) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return isoDay(new Date(y, m - 1, d + days));
}

// UAE Corporate Tax return and payment are due within 9 months of the financial year end.
export function ctDueDate(fyEndIso) {
  const [y, m] = String(fyEndIso).split("-").map(Number);
  return isoDay(new Date(y, m - 1 + 10, 0));
}

const partyRegion = (party) => String(party?.emirate || party?.city || party?.area || "").trim();

// defaultRegion: the shop's own Emirate/region, used for cash sales and customers without one.
export function computeVat(data, { shopId, from, to, customers = [], vendors = [], defaultRegion = "" }) {
  if (!data) return null;
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const vendorById = new Map(vendors.map((v) => [v.id, v]));
  const inPeriod = (d) => inRange(dayOf(d), from, to);

  const sales = liveSalesOf(data.salesInvoices, shopId).filter((inv) => inv.source !== "openingBalance" && inPeriod(inv.invoiceDate));
  const purchases = livePurchasesOf(data.purchaseInvoices, shopId).filter((inv) => inv.source !== "openingBalance" && inPeriod(inv.invoiceDate));
  const salesRet = liveReturnsOf(data.extras?.salesReturns, shopId).filter((r) => inPeriod(r.returnDate));
  const purchRet = liveReturnsOf(data.extras?.purchaseReturns, shopId).filter((r) => inPeriod(r.returnDate));
  // Only expense bills with VAT on them (rent, electricity, repairs…) are claimable; salary and other no-VAT costs stay out.
  const expenseBills = (data.expenses || []).filter((e) => isLive(e, shopId) && e.status !== "cancelled" && n(e.vatAmount) > 0 && inPeriod(e.expenseDate));

  const salesRows = [
    ...sales.map((inv) => ({
      id: inv.id, date: dayOf(inv.invoiceDate), no: inv.invoiceNo || "", party: inv.customerName || "", partyId: inv.customerId || null,
      trn: inv.customerTrn || customerById.get(inv.customerId)?.trnNumber || "",
      taxable: r2(n(inv.grandTotal) - n(inv.totalVat)), vat: r2(inv.totalVat), total: r2(inv.grandTotal), isReturn: false,
    })),
    ...salesRet.map((r) => ({
      id: r.id, date: dayOf(r.returnDate), no: r.returnNo || "", ref: r.invoiceNo || "", party: r.partyName || "", partyId: r.partyId || null,
      trn: customerById.get(r.partyId)?.trnNumber || "",
      taxable: -r2(n(r.total) - n(r.totalVat)), vat: -r2(r.totalVat), total: -r2(r.total), isReturn: true,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.no.localeCompare(b.no));

  const purchaseRows = [
    ...purchases.map((inv) => ({
      id: inv.id, date: dayOf(inv.invoiceDate), no: inv.invoiceNo || "", ref: inv.supplierInvoiceNo || "", party: inv.vendorName || "",
      trn: vendorById.get(inv.vendorId)?.trnNumber || "",
      taxable: r2(n(inv.grandTotal) - n(inv.totalTax)), vat: r2(inv.totalTax), total: r2(inv.grandTotal), isReturn: false,
    })),
    ...purchRet.map((r) => ({
      id: r.id, date: dayOf(r.returnDate), no: r.returnNo || "", ref: r.supplierInvoiceNo || r.invoiceNo || "", party: r.partyName || "",
      trn: vendorById.get(r.partyId)?.trnNumber || "",
      taxable: -r2(n(r.total) - n(r.totalVat)), vat: -r2(r.totalVat), total: -r2(r.total), isReturn: true,
    })),
    ...expenseBills.map((e) => ({
      id: e.id, date: dayOf(e.expenseDate), no: e.expenseNo || "", ref: e.refNo || "", party: e.paidTo || e.categoryName || e.category || "",
      trn: e.supplierTrn || "", taxable: r2(n(e.amount) - n(e.vatAmount)), vat: r2(e.vatAmount), total: r2(e.amount), isReturn: false, isExpense: true,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.no.localeCompare(b.no));

  // A return of a VAT bill is VAT-able even if its own VAT rounds to 0, so split on the bill that was sold.
  const vatBillIds = new Set(liveSalesOf(data.salesInvoices, shopId).filter((inv) => n(inv.totalVat) > 0).map((inv) => inv.id));
  const vatPurchIds = new Set(livePurchasesOf(data.purchaseInvoices, shopId).filter((inv) => n(inv.totalTax) > 0).map((inv) => inv.id));
  const salesRetVatable = (row) => n(row.vat) !== 0 || vatBillIds.has(salesRet.find((r) => r.id === row.id)?.invoiceId);
  const purchRetVatable = (row) => n(row.vat) !== 0 || vatPurchIds.has(purchRet.find((r) => r.id === row.id)?.invoiceId);

  const sum = (rows, key) => r2(rows.reduce((t, r) => t + n(r[key]), 0));
  const stdSalesRows = salesRows.filter((r) => (r.isReturn ? salesRetVatable(r) : n(r.vat) !== 0));
  const noVatSalesRows = salesRows.filter((r) => !stdSalesRows.includes(r));
  const stdPurchRows = purchaseRows.filter((r) => (r.isReturn ? purchRetVatable(r) : n(r.vat) !== 0));
  const noVatPurchRows = purchaseRows.filter((r) => !stdPurchRows.includes(r));

  const regionMap = new Map();
  stdSalesRows.forEach((r) => {
    const key = partyRegion(customerById.get(r.partyId)) || String(defaultRegion || "").trim();
    const cur = regionMap.get(key) || { region: key, taxable: 0, vat: 0, bills: 0 };
    cur.taxable += n(r.taxable);
    cur.vat += n(r.vat);
    if (!r.isReturn) cur.bills += 1;
    regionMap.set(key, cur);
  });
  const regionRows = [...regionMap.values()].map((x) => ({ ...x, taxable: r2(x.taxable), vat: r2(x.vat) })).sort((a, b) => b.vat - a.vat);

  const productMap = new Map();
  const productRow = (it) => {
    const key = it.productId || `${it.code || ""}|${it.name || ""}`;
    if (!productMap.has(key)) productMap.set(key, { key, code: it.code || "", name: it.name || "", soldQty: 0, salesTaxable: 0, salesVat: 0, boughtQty: 0, purchTaxable: 0, purchVat: 0 });
    return productMap.get(key);
  };
  sales.forEach((inv) => (inv.items || []).forEach((it) => {
    if (!it) return;
    const p = productRow(it);
    p.soldQty += n(it.qty); p.salesTaxable += n(it.lineTotal) - n(it.vatAmt); p.salesVat += n(it.vatAmt);
  }));
  salesRet.forEach((r) => (r.items || []).forEach((it) => {
    if (!it) return;
    const p = productRow(it);
    p.soldQty -= n(it.qty); p.salesTaxable -= n(it.amount) - n(it.vatAmt); p.salesVat -= n(it.vatAmt);
  }));
  purchases.forEach((inv) => (inv.items || []).forEach((it) => {
    if (!it) return;
    const p = productRow(it);
    p.boughtQty += n(it.qty); p.purchTaxable += n(it.lineTotal) - n(it.taxAmt); p.purchVat += n(it.taxAmt);
  }));
  purchRet.forEach((r) => (r.items || []).forEach((it) => {
    if (!it) return;
    const p = productRow(it);
    p.boughtQty -= n(it.qty); p.purchTaxable -= n(it.amount) - n(it.vatAmt); p.purchVat -= n(it.vatAmt);
  }));
  const productRows = [...productMap.values()]
    .map((p) => ({ ...p, salesTaxable: r2(p.salesTaxable), salesVat: r2(p.salesVat), purchTaxable: r2(p.purchTaxable), purchVat: r2(p.purchVat), soldQty: r2(p.soldQty), boughtQty: r2(p.boughtQty) }))
    .sort((a, b) => b.salesVat - a.salesVat || b.purchVat - a.purchVat);

  const outputVat = sum(salesRows, "vat");
  const inputVat = sum(purchaseRows, "vat");
  return {
    salesRows, purchaseRows, regionRows, productRows,
    stdSales: sum(stdSalesRows, "taxable"), noVatSales: sum(noVatSalesRows, "taxable"),
    stdPurch: sum(stdPurchRows, "taxable"), noVatPurch: sum(noVatPurchRows, "taxable"),
    outputVat, inputVat, payable: r2(outputVat - inputVat),
    salesCount: sales.length, purchCount: purchases.length, salesReturnCount: salesRet.length, purchReturnCount: purchRet.length,
    expenseCount: expenseBills.length, expenseVat: sum(purchaseRows.filter((r) => r.isExpense), "vat"),
    missingCustomerTrn: sales.filter((inv) => n(inv.totalVat) > 0 && inv.invoiceType === "tax" && inv.customerId && !(inv.customerTrn || customerById.get(inv.customerId)?.trnNumber)).length,
  };
}

// Simple estimate only: accounting profit, no add-backs, exempt income or loss carry-forward.
export function corporateTax({ profit, revenue, settings }) {
  const threshold = Math.max(0, n(settings.ctThreshold));
  const rate = Math.max(0, n(settings.ctRate));
  const sbrLimit = Math.max(0, n(settings.sbrLimit));
  const sbrEligible = sbrLimit > 0 && n(revenue) <= sbrLimit;
  const sbrApplied = !!settings.sbrElected && sbrEligible;
  const taxable = Math.max(0, r2(profit));
  const atZero = Math.min(taxable, threshold);
  const atRate = Math.max(0, taxable - threshold);
  const tax = sbrApplied ? 0 : r2((atRate * rate) / 100);
  return { taxable, threshold, rate, atZero: r2(atZero), atRate: r2(atRate), tax, sbrEligible, sbrApplied, sbrLimit, isLoss: n(profit) < 0 };
}
