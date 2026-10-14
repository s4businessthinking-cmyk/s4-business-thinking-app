import { PARTY_CODE, partyCodeNumber, reserveShopSerial, formatPartyCode } from "../shared/appShared.jsx";
import { offlineUpdate } from "../offline/offlineRepository";
import { generatePaymentVoucherHTML, generateSalesInvoiceHTML } from "../sales-invoice/salesInvoiceShared.js";
import { generateStatementHTML, SAMPLE_DATA } from "../print/printDesign.js";
import { EMPTY_VENDOR } from "../vendor-master/VendorMasterScreen.jsx";
import { specValues } from "../product-master/productSpecs";
import { useState, useEffect } from "react";

export const productNameCollator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

export const compareProductNames = (a, b) => productNameCollator.compare(a?.name || "", b?.name || "");

export function isBlankProduct(product) {
  return !["name", "code", "barcode"].some((k) => String(product?.[k] ?? "").trim() !== "");
}

export function isActiveProduct(product) {
  if (!product) return false;
  return product.isDeleted !== true && product.deleted !== true && !isBlankProduct(product);
}

export function mergeProductCatalog(cloudRows = [], localRows = []) {
  const merged = new Map();
  localRows.forEach((product) => {
    const id = String(product?.id || "").trim();
    if (id) merged.set(id, product);
  });
  cloudRows.forEach((product) => {
    const id = String(product?.id || "").trim();
    if (!id) return;
    const local = merged.get(id);
    if (!local) {
      merged.set(id, product);
      return;
    }
    if (product.isDeleted === true || product.deleted === true) {
      merged.set(id, product);
      return;
    }
    const localTs = String(local._offline_updated_at || local.updatedAt || "");
    const cloudTs = String(product._offline_updated_at || product.updatedAt || "");
    merged.set(id, cloudTs > localTs ? product : local);
  });
  return [...merged.values()]
    .filter(isActiveProduct)
    .sort(compareProductNames);
}

// ─── PRESET POSITIONS ────────────────────────────────────────
// ─── PERMISSIONS ────────────────────────────────────────────
export const PERMISSIONS_LIST = [
  { key: "sendOrder",        bn: "অর্ডার দেওয়া",              en: "Send Orders" },
  { key: "manageCompanies",  bn: "কোম্পানি ম্যানেজ করা",       en: "Manage Companies" },
  { key: "setPrices",        bn: "দাম সেট করা",                en: "Set Prices" },
  { key: "setStatus",        bn: "স্ট্যাটাস পরিবর্তন করা",     en: "Change Item Status" },
  { key: "markDelivery",     bn: "ডেলিভারি মার্ক করা",         en: "Mark as Delivered" },
  { key: "deleteOrder",      bn: "অর্ডার ডিলিট করা",           en: "Delete Orders" },
  { key: "viewProducts",     bn: "পণ্য তালিকা দেখা",           en: "View Product List" },
  { key: "manageProducts",   bn: "পণ্য যোগ / এডিট / Import",   en: "Add / Edit / Import Products" },
  { key: "manageSales",      bn: "বিক্রয় ইনভয়েস ম্যানেজ করা", en: "Manage Sales Invoices" },
  { key: "manageCustomers",  bn: "কাস্টমার যোগ / বেছে নেওয়া", en: "Add / Pick Customers" },

  // Owner-controlled purchase/supplier/payment access for staff.
  // OFF by default. Salesman can see/use these options only after owner turns them ON from Settings → Team.
  { key: "viewVendors",      bn: "সাপ্লায়ার / ভেন্ডর দেখা",   en: "View Suppliers / Vendors" },
  { key: "manageVendors",    bn: "সাপ্লায়ার / ভেন্ডর যোগ ও এডিট", en: "Add / Edit Suppliers / Vendors" },
  { key: "viewSupplierLedger", bn: "সাপ্লায়ার লেজার দেখা",    en: "View Supplier Ledger" },
  { key: "vendorPayments",   bn: "সাপ্লায়ার পেমেন্ট করা",     en: "Make Supplier Payments" },
  { key: "managePurchase",   bn: "ক্রয় ইনভয়েস ম্যানেজ করা",  en: "Manage Purchase Invoices" },
  { key: "managePdc",        bn: "PDC (পোস্ট ডেটেড চেক) দেখা ও পোস্ট করা", en: "Post Dated Cheques (PDC)" },
  { key: "manageExpenses",   bn: "দোকানের খরচ লেখা",           en: "Record Shop Expenses" },
  { key: "sendBranchTransfer", bn: "Branch-এ পণ্য পাঠানো",      en: "Send Branch Products" },
  { key: "receiveBranchTransfer", bn: "Branch Transfer Receive", en: "Receive Branch Products" },
  { key: "printCheques",     bn: "চেক প্রিন্টার ব্যবহার",       en: "Use Cheque Printer" },
  { key: "viewCustomerBalance", bn: "কাস্টমারের বাকি / লেজার দেখা", en: "View Customer Balance / Ledger" },
  { key: "giveDiscount",     bn: "বিক্রয়ে ডিসকাউন্ট দেওয়া",     en: "Give Discount on Sales" },
  { key: "cancelInvoices",   bn: "ইনভয়েস / রিসিট বাতিল ও ডিলিট", en: "Cancel / Delete Invoices & Receipts" },
  { key: "manageReturns",    bn: "সেলস / পারচেজ রিটার্ন করা",   en: "Sales / Purchase Returns" },
  { key: "stockAdjust",      bn: "স্টক সমন্বয় (কম/বেশি) করা",   en: "Stock Adjustment" },
  { key: "accountVouchers",  bn: "জার্নাল / কন্ট্রা ভাউচার",      en: "Journal / Contra Vouchers" },
  { key: "manageEmployees",  bn: "কর্মচারী ও হাজিরা",              en: "Employees & Attendance" },
  { key: "bankReconcile",    bn: "ব্যাংক হিসাব মেলানো",            en: "Bank Reconciliation" },
  { key: "manageJobs",       bn: "জব কার্ড / সার্ভিস কাজ",          en: "Job Cards / Service Jobs" },
];

export const SC = {
  pending:            { color:"#f59e0b", bg:"#451a03" },
  order_confirmed:    { color:"#22c55e", bg:"#052e16" },
  ordered_supplier:   { color:"#06b6d4", bg:"#083344" },
  in_stock:           { color:"#22c55e", bg:"#052e16" },
  out_of_stock:       { color:"#ef4444", bg:"#450a0a" },
  waiting_delivery:   { color:"#f97316", bg:"#431407" },
  arrived_main_shop:  { color:"#a855f7", bg:"#2e1065" },
  out_for_branch:     { color:"#06b6d4", bg:"#083344" },
  delivered:          { color:"#818cf8", bg:"#1e1b4b" },
  cancelled:          { color:"#71717a", bg:"#27272a" },
};

export const LANG_KEY = "sparetrack-lang";

export const WA_STYLE_KEY = "wa-msg-style";

export const THEME_KEY    = "s4-theme";

export const ORDER_PREFIX = "S4-";

export const loadLang     = () => { try { return localStorage.getItem(LANG_KEY)||"bn"; } catch { return "bn"; } };

export const saveLang     = (l) => { try { localStorage.setItem(LANG_KEY,l); } catch {} };

export const loadWaStyle  = () => { try { return localStorage.getItem(WA_STYLE_KEY)||"1"; } catch { return "1"; } };

export const saveWaStyle  = (v) => { try { localStorage.setItem(WA_STYLE_KEY,v); } catch {} };

export const loadTheme    = () => { try { return localStorage.getItem(THEME_KEY)||"dark"; } catch { return "dark"; } };

export const saveTheme    = (v) => { try { localStorage.setItem(THEME_KEY,v); } catch {} };

export const S4_PROFILE_CACHE_KEY = "s4-auth-profile-cache-v1";

export const safeGetJson = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const safeSetJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};

export const profileCacheKey = (uid) => `${S4_PROFILE_CACHE_KEY}:${uid}`;

export const loadCachedProfile = (uid) => uid ? safeGetJson(profileCacheKey(uid)) : null;

export const saveCachedProfile = (uid, profile) => {
  if (!uid || !profile) return;
  safeSetJson(profileCacheKey(uid), { ...profile, uid, cachedAt: new Date().toISOString() });
};

export const ERP_MOBILE_CSS = `
.erp-m { font-family: Tahoma, "Segoe UI", Arial, sans-serif; }
.erp-m input:not([type=checkbox]):not([type=radio]):not([type=range]),
.erp-m select, .erp-m textarea {
  border-radius: 2px !important;
  border: 1px solid #8797a9 !important;
  background-color: #fff !important;
  color: #07101c !important;
  box-shadow: inset 1px 1px 1px rgba(0,0,0,.12) !important;
}
.erp-m input:focus, .erp-m select:focus, .erp-m textarea:focus {
  border-color: #315fa8 !important;
  box-shadow: inset 1px 1px 1px rgba(0,0,0,.14), 0 0 0 1px #b8d4f5 !important;
}
.erp-m button { border-radius: 3px !important; }
.erp-m button:not(:disabled) {
  box-shadow: inset 1px 1px 0 rgba(255,255,255,.55), inset -1px -1px 0 rgba(35,64,104,.35) !important;
}
.erp-m button:active:not(:disabled) { transform: translateY(1px); }
.erp-m-title {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  min-height: 24px; padding: 3px 8px;
  background: linear-gradient(180deg, #dce9f8 0%, #91acd2 58%, #789bcf 100%);
  border-bottom: 1px solid #6c87af; color: #064e22;
  font-family: Tahoma, "Segoe UI", Arial, sans-serif;
}
.erp-m.erp-m-dark input:not([type=checkbox]):not([type=radio]):not([type=range]),
.erp-m.erp-m-dark select, .erp-m.erp-m-dark textarea {
  border-color: #4f6f92 !important;
  background-color: #0d1522 !important;
  color: #f8fafc !important;
  box-shadow: inset 1px 1px 1px rgba(0,0,0,.4) !important;
}
.erp-m.erp-m-dark button:not(:disabled) {
  box-shadow: inset 1px 1px 0 rgba(255,255,255,.12), inset -1px -1px 0 rgba(0,0,0,.45) !important;
}
.erp-m-dark .erp-m-title {
  background: linear-gradient(180deg, #2c4a7d 0%, #1e3a68 58%, #162c52 100%);
  border-bottom-color: #0f1f3d; color: #d8ffe5;
}
.erp-m-dark .erp-m-title span { color: #b6c7df; }
.erp-m-title strong { font-size: 13px; letter-spacing: .3px; text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.erp-m-title span { font-size: 10px; color: #1f2937; white-space: nowrap; }
`;

// ─── WA STYLES ───────────────────────────────────────────────
export const WA_STYLES = [
  {
    id:"1", labelBn:"বুলেট", labelEn:"Bullet",
    previewBn:"▪️ *Brake Pad* | BP-123 | Toyota | 2 Pcs\n▪️ *Air Filter* | AF-456 | Honda | 1 Set",
    previewEn:"▪️ *Brake Pad* | BP-123 | Toyota | 2 Pcs\n▪️ *Air Filter* | AF-456 | Honda | 1 Set",
  },
  {
    id:"2", labelBn:"নম্বর", labelEn:"Numbered",
    previewBn:"1️⃣ *Brake Pad* | BP-123 | Toyota | 2 Pcs\n2️⃣ *Air Filter* | AF-456 | Honda | 1 Set",
    previewEn:"1️⃣ *Brake Pad* | BP-123 | Toyota | 2 Pcs\n2️⃣ *Air Filter* | AF-456 | Honda | 1 Set",
  },
  {
    id:"3", labelBn:"ডায়মন্ড", labelEn:"Diamond",
    previewBn:"🔸 *Brake Pad* | BP-123 | Toyota | 2 Pcs\n🔸 *Air Filter* | AF-456 | Honda | 1 Set",
    previewEn:"🔸 *Brake Pad* | BP-123 | Toyota | 2 Pcs\n🔸 *Air Filter* | AF-456 | Honda | 1 Set",
  },
  {
    id:"4", labelBn:"লাইন", labelEn:"Lined",
    previewBn:"──────────────\n▪️ *Brake Pad*\n   BP-123 | Toyota | 2 Pcs\n──────────────\n▪️ *Air Filter*\n   AF-456 | Honda | 1 Set\n──────────────",
    previewEn:"──────────────\n▪️ *Brake Pad*\n   BP-123 | Toyota | 2 Pcs\n──────────────\n▪️ *Air Filter*\n   AF-456 | Honda | 1 Set\n──────────────",
  },
];

export const newItem  = () => ({ id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`, name:"", code:"", brand:"", qty:"", unit:"Pcs" });

// ─── RESPONSIVE HOOK ─────────────────────────────────────────
export function useWindowWidth() {
  const [width, setWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return width;
}

export const productSearchTextCache = new WeakMap();

export const productSearchText = (p) => {
  let text = productSearchTextCache.get(p);
  if (text === undefined) {
    const codes = [
      p.barcode,
      p.ean,
      ...(Array.isArray(p.moreBarcodes)?p.moreBarcodes:[]),
      ...(Array.isArray(p.unitPrices)?p.unitPrices.map(r=>r?.barcode):[]),
    ].map(v=>String(v||"").trim()).filter(Boolean);
    text = [p.name,p.code,p.barcode,p.ean,p.brand,p.company,p.category,p.subcategory,p.productGroup,codes.join(" "),specValues(p)].filter(Boolean).join(" ");
    productSearchTextCache.set(p, text);
  }
  return text;
};

export const emptyVendor = EMPTY_VENDOR;

export const VM_IMPORT_COLUMNS = {
  VendorName:"vendorName", Address:"address", LedgerCode:"vendorCode",
  Emirate:"emirate", Area:"area", PhoneNo:"phoneNumber", MobileNo:"mobileNumber",
  Fax:"fax", Email:"email", LicenseNo:"tradeLicenseNumber", TRN:"trnNumber",
  CreditLimit:"creditLimit", CreditPeriod:"paymentTerms", OpeningBal:"openingBalance",
};

export const CM_IMPORT_COLUMNS = {
  CustomerName:"customerName", Address:"address", LedgerCode:"customerCode",
  Emirate:"emirate", Area:"area", PhoneNo:"phoneNumber", MobileNo:"mobileNumber",
  Fax:"fax", Email:"email", LicenseNo:"tradeLicenseNumber", TRN:"trnNumber",
  CreditLimit:"creditLimit", CreditPeriod:"paymentTerms", OpeningBal:"openingBalance",
};

// Sample documents for the live preview in Print Settings → Design.
export function designPreviewHtml(kind, style, shop, lang, showCode, colorPrint) {
  const shopInfo = shop?.companyName ? shop : { companyName:"S4 Auto Spare Parts", area:"Industrial Area 4", countryName:"Sharjah", mobile:"+971 50 000 0000", trnNumber:"100000000000003" };
  if (kind === "voucher") {
    return generatePaymentVoucherHTML({
      receiptNo:"RV-0012", receiptDate:"2026-10-04", customerName:"Al Noor Garage", method:"cheque", chequeNo:"004512", chequeBank:"Emirates NBD",
      chequeDate:"2026-10-10", totalAmount:1500, note:"Against old bills",
      allocations:[{ invoiceNo:"SI-0001", invoiceDate:"2026-10-01", amount:1000 }, { invoiceNo:"SI-0004", invoiceDate:"2026-10-02", amount:500 }],
    }, shopInfo, lang, { style, noLayout:true });
  }
  if (kind === "statement") {
    const cols = [["Date"],["Type"],["Doc No"],["Ref"],["Particulars"],["Debit","right"],["Credit","right"],["Balance","right"]].map(([label,align])=>({ label, align }));
    const keys = ["date","type","no","ref","particulars","debit","credit","balance"];
    return generateStatementHTML({
      shopName:shopInfo.companyName, title:"CUSTOMER STATEMENT", subtitle:"01/09/2026 — 04/10/2026", partyLine:"Al Noor Garage · +971 55 111 2222",
      cols, rows:SAMPLE_DATA.statement.items.map(r=>keys.map(k=>r[k])), foot:["","","","","TOTAL","4,950.00","1,500.00","3,450.00 Dr"],
    }, style);
  }
  return generateSalesInvoiceHTML({
    invoiceNo:"SI-0001", invoiceDate:"2026-10-04", invoiceType:"tax", customerName:"Al Noor Garage", customerMobile:"+971 55 111 2222",
    customerAddress:"Ajman", paymentMethod:"credit", status:"partial", amountPaid:500, createdByName:"Admin", salesmanName:"Rahim",
    note:"Goods once sold will not be taken back.",
    items:[
      { name:"Brake Pad Front", code:"BP-101", qty:2, unit:"Pcs", unitPrice:150, discountPerc:0, vatPerc:5 },
      { name:"Oil Filter", code:"OF-22", qty:4, unit:"Pcs", unitPrice:35, discountPerc:5, vatPerc:5 },
      { name:"Shock Absorber Rear", code:"SA-9", qty:1, unit:"Pcs", unitPrice:780, discountPerc:0, vatPerc:5 },
    ],
  }, shopInfo, lang, showCode, colorPrint, { style, noLayout:true, customerBalance:3450 });
}

export function mergePartyRow(prev, row, nameKey) {
  const id = row?.id;
  if (!id) return prev;
  const ix = prev.findIndex((p) => p.id === id);
  const merged = { ...(ix >= 0 ? prev[ix] : {}), ...row, id };
  const next = ix >= 0 ? prev.map((p, i) => (i === ix ? merged : p)) : [...prev, merged];
  return next.sort((a, b) => String(a[nameKey] || "").localeCompare(String(b[nameKey] || "")));
}

// Owner-side: gives a code to every party that has none or shares one with an older party.
export async function backfillPartyCodes(shopId, kind, records = []) {
  const { field, serial } = PARTY_CODE[kind];
  const ts = (r) => { const v = r?.createdAt; return v?.toMillis ? v.toMillis() : (Date.parse(v) || 0); };
  const sorted = [...records].sort((a, b) => ts(a) - ts(b) || String(a.id).localeCompare(String(b.id)));
  const seen = new Set();
  const missing = [];
  for (const r of sorted) {
    const code = String(r?.[field] || "").trim().toUpperCase();
    if (!code || seen.has(code)) missing.push(r);
    else seen.add(code);
  }
  if (!missing.length) return 0;
  const localMax = records.reduce((m, r) => Math.max(m, partyCodeNumber(kind, r?.[field])), 0);
  const first = await reserveShopSerial(shopId, serial, localMax, missing.length);
  if (!first) return 0;
  for (let i = 0; i < missing.length; i++) {
    await offlineUpdate(kind, missing[i].id, { [field]: formatPartyCode(kind, first + i) });
  }
  window.S4Offline?.syncNow?.().catch(err => console.warn(`[S4 Sync] ${kind} code sync failed`, err));
  return missing.length;
}

// Global keyboard shortcuts per menu tab, shown beside the name in the desktop sidebar.
export const TAB_SHORTCUT_KEYS = { products:"F2", purchase:"F3", sales:"F4", vendors:"Ctrl+O", customers:"Ctrl+U" };

export function pushOrdersNow() {
  const off = window.S4Offline;
  if (!off) return;
  Promise.resolve(off.syncCollectionNow?.("orders"))
    .catch(err => console.warn("[S4 Sync] order quick push failed", err))
    .finally(() => off.syncNow?.().catch(err => console.warn("[S4 Sync] order sync failed", err)));
}

export const SI_SHOW_CODE_KEY = "si-show-code";

export const loadSiShowCode = () => { try { return localStorage.getItem(SI_SHOW_CODE_KEY)==="true"; } catch { return false; } };

export const saveSiShowCode = (v) => { try { localStorage.setItem(SI_SHOW_CODE_KEY, v?"true":"false"); } catch {} };

export const SI_COLOR_KEY = "si-color-print";

export const loadSiColor = () => { try { return localStorage.getItem(SI_COLOR_KEY)==="true"; } catch { return false; } };

export const saveSiColor = (v) => { try { localStorage.setItem(SI_COLOR_KEY, v?"true":"false"); } catch {} };
