import { unitFactorFor } from "../inventory/unitConversion.js";

export const PURCHASE_OPTION_DEFAULTS = { refNo: false, multiCurrency: false, batchVendor: false, batchMrp: false, batchCost: false };

export const PURCHASE_OPTION_LABELS = [
  ["refNo", "Enable Reference Number Entry", "রেফারেন্স নম্বর (Ref. No) ঘর দেখাও"],
  ["multiCurrency", "Enable Multiple Currency Purchase", "অন্য মুদ্রায় (USD ইত্যাদি) কেনা চালু করো"],
  ["batchVendor", "Ask to maintain separate stock when purchased from a different vendor", "অন্য সাপ্লায়ার থেকে কিনলে আলাদা stock রাখার কথা জিজ্ঞেস করো"],
  ["batchMrp", "Ask to maintain separate stock when the M.R.P of a product changes", "M.R.P বদলালে আলাদা stock রাখার কথা জিজ্ঞেস করো"],
  ["batchCost", "Ask to maintain separate stock when the Landing Cost of a product changes", "Landing Cost বদলালে আলাদা stock রাখার কথা জিজ্ঞেস করো"],
];

export function purchaseOptionsOf(shop) {
  const saved = shop?.purchaseOptions && typeof shop.purchaseOptions === "object" ? shop.purchaseOptions : {};
  return Object.fromEntries(Object.keys(PURCHASE_OPTION_DEFAULTS).map((k) => [k, saved[k] === true]));
}

const num = (v) => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
const r2 = (v) => Math.round((num(v) + Number.EPSILON) * 100) / 100;
const r4 = (v) => Math.round((num(v) + Number.EPSILON) * 10000) / 10000;

// Exchange rate to the shop's own currency; 1 when the bill is already in it.
export function rateOf(form, baseCurrency) {
  const cur = String(form?.currency || "").trim().toUpperCase();
  if (!cur || cur === String(baseCurrency || "").trim().toUpperCase()) return 1;
  return num(form?.exchangeRate);
}

export const isForeign = (form, baseCurrency) => {
  const cur = String(form?.currency || "").trim().toUpperCase();
  return !!cur && cur !== String(baseCurrency || "").trim().toUpperCase();
};

// Line prices are typed in the bill currency; stock, cost, VAT and vendor balance are kept in the shop currency.
export function lineToBase(line, rate) {
  if (rate === 1) return line;
  return { ...line, unitCost: String(r4(num(line.unitCost) * rate)) };
}

// Reasons this purchase line differs from the stock already on hand, for the options that are switched on.
// lastVendor: { id, name } of the latest earlier purchase of the product.
export function batchReasons({ options, product, line, rate = 1, vendorId = "", vendorName = "", lastVendor = null, stock = 0 }) {
  if (!product || !(num(stock) > 0)) return [];
  const out = [];
  if (options.batchVendor && lastVendor) {
    const same = (vendorId && lastVendor.id && vendorId === lastVendor.id)
      || (String(vendorName || "").trim().toLowerCase() === String(lastVendor.name || "").trim().toLowerCase());
    if (!same && String(vendorName || "").trim()) out.push({ key: "vendor", from: lastVendor.name || "", to: vendorName });
  }
  const factor = unitFactorFor(product, line.unit);
  const oldMrp = num(product.mrp) || num(product.vatInclusive);
  const newMrp = num(line.salePrice) / factor;
  if (options.batchMrp && oldMrp > 0 && newMrp > 0 && r2(oldMrp) !== r2(newMrp)) out.push({ key: "mrp", from: r2(oldMrp), to: r2(newMrp) });
  const oldCost = num(product.landingCost);
  const newCost = (num(line.unitCost) * rate) / factor;
  if (options.batchCost && oldCost > 0 && newCost > 0 && r2(oldCost) !== r2(newCost)) out.push({ key: "cost", from: r2(oldCost), to: r2(newCost) });
  return out;
}

export function nextBatchNo(invoiceNo, lines) {
  const used = new Set((lines || []).map((l) => l?.batchNo).filter(Boolean));
  let i = 1;
  while (used.has(`${invoiceNo || "PI"}-B${i}`)) i += 1;
  return `${invoiceNo || "PI"}-B${i}`;
}
