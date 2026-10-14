import { withoutPeriodLock } from "../accounts/periodLock.js";
import { offlineCreate, offlineRemove } from "../offline/offlineRepository";
import { loadPrintSettings, printHtmlDocument, printWithSettings } from "../print/printSettings.js";
import { generateSalesInvoiceHTML, SI_STATUSES, siProductRateRows, generatePaymentVoucherHTML } from "./salesInvoiceShared.js";
import { localIsoDate } from "../utils/localIsoDate.js";

export const SI_PAY_TO_VOUCHER_METHOD = { cash:"cash", bank:"bank_transfer", cheque:"cheque", card:"card" };

// Money taken with the bill itself (not through receipt vouchers or credit notes), printed as a receipt for the customer.
export function printMoneyReceipt(inv, amount, shop, lang) {
  const receipt = {
    receiptNo:inv.invoiceNo, receiptDate:inv.invoiceDate, customerName:inv.customerName||"Walk-in",
    method:SI_PAY_TO_VOUCHER_METHOD[inv.paymentMethod]||"cash", totalAmount:amount,
    chequeNo:inv.chequeNo||"", chequeBank:inv.chequeBank||"", chequeDate:inv.chequeDate||"",
    collectedByName:inv.salesmanName||inv.createdByName||"",
    allocations:[{ invoiceNo:inv.invoiceNo, invoiceDate:inv.invoiceDate, amount }],
  };
  printWithSettings(generatePaymentVoucherHTML(receipt, shop, lang, { title:lang==="bn"?"মানি রিসিট":"MONEY RECEIPT" }), { lang });
}

// ─── SALES INVOICE ────────────────────────────────────────────
export const SI_PREFIX  = "SI-";

export const QT_PREFIX  = "QT-";

export const DN_PREFIX  = "DN-";

export const SO_PREFIX  = "SO-";

export const QT_VALID_DAYS = 15;

export const CUSTOMER_TYPE_ALIASES = {
  "রিটেইল":"retail", "হোলসেল":"wholesale", "কর্পোরেট":"corporate", "vip":"vip",
  "সরকারি":"government", "প্রজেক্ট":"project", "অন্যান্য":"other",
};

export const normCustomerType = (v) => {
  const key = String(v || "").trim().toLowerCase();
  return CUSTOMER_TYPE_ALIASES[key] || key;
};

export const normUnit = (v) => String(v || "").trim().toLowerCase();

// Exact unit + customer type wins, then the unit's "All / Default" row, then the product's base price.
export function siResolveRate(prod, unit, customerType) {
  const basePrice = prod?.vatExclusive || prod?.mrp || "";
  const wantUnit = normUnit(unit || prod?.unit || "Pcs");
  const wantType = normCustomerType(customerType);
  const rows = siProductRateRows(prod).filter((row) => normUnit(row.unit) === wantUnit);
  const match =
    (wantType && rows.find((row) => normCustomerType(row.customerType) === wantType)) ||
    rows.find((row) => !String(row.customerType || "").trim());
  if (!match) return { unitPrice: basePrice, name: prod?.name || "" };
  return {
    unitPrice: match.vatExclusive || match.mrp || match.vatInclusive || basePrice,
    name: String(match.altName || "").trim() || prod?.name || "",
  };
}

export const QT_STATUSES = {
  draft:     SI_STATUSES.draft,
  open:      { bn:"খোলা",          en:"Open",      color:"#06b6d4", bg:"#083344" },
  converted: { bn:"ইনভয়েস হয়েছে", en:"Converted", color:"#22c55e", bg:"#052e16" },
  cancelled: SI_STATUSES.cancelled,
};

export const DN_STATUSES = {
  draft:     SI_STATUSES.draft,
  confirmed: { bn:"ডেলিভারি হয়েছে", en:"Delivered", color:"#06b6d4", bg:"#083344" },
  invoiced:  { bn:"ইনভয়েস হয়েছে",  en:"Invoiced",  color:"#22c55e", bg:"#052e16" },
  cancelled: SI_STATUSES.cancelled,
};

export const SO_STATUSES = {
  draft:     SI_STATUSES.draft,
  open:      { bn:"অপেক্ষায়",        en:"Pending",   color:"#06b6d4", bg:"#083344" },
  delivered: { bn:"ডেলিভারি হয়েছে", en:"Delivered", color:"#a855f7", bg:"#2e1065" },
  invoiced:  { bn:"ইনভয়েস হয়েছে",  en:"Invoiced",  color:"#22c55e", bg:"#052e16" },
  cancelled: SI_STATUSES.cancelled,
};

// Where a converted quotation / sales order / delivery note lives and what it becomes.
export const SOURCE_DOC = {
  delivery:   { col:"deliveryNotes", idKey:"deliveryNoteId", noKey:"deliveryNoteNo" },
  salesOrder: { col:"salesOrders",   idKey:"salesOrderId",   noKey:"salesOrderNo" },
  quotation:  { col:"quotations",    idKey:"quotationId",    noKey:"quotationNo" },
  jobOrder:   { col:"jobOrders",     idKey:"jobOrderId",     noKey:"jobOrderNo" },
};

export const sourceDocOf = (src) => SOURCE_DOC[src?.docKind] || SOURCE_DOC.quotation;

export const siToday= () => localIsoDate();

export const siAddDays = (iso, days) => {
  const d = new Date(`${iso || siToday()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
};

export const qtIsExpired = (q) => q?.status==="open" && !!q.validUntil && q.validUntil < siToday();

// A delivery note carries no discount or VAT.
export const siDeliveryLines = (items) => items.map(it=>({ ...it, discountPerc:"0", discountFlat:"", vatPerc:"0" }));

export function siEmptyLine() {
  return { id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`, productId:null, name:"", code:"", brand:"", qty:"", unit:"Pcs", unitPrice:"", discountPerc:"0", discountFlat:"", vatPerc:"5" };
}

export function siEmptyForm() {
  return {
    invoiceType:loadPrintSettings().defaultBillType==="regular" ? "regular" : "tax",
    invoiceDate:siToday(),
    customerId:"", customerName:"", customerMobile:"", customerAddress:"", customerTrn:"", customerType:"",
    paymentMethod:"cash", amountPaid:"",
    deliveryNoteNo:"", vehicleNo:"",
    note:"",
    refNo:"", salesmanId:"", salesmanName:"", currency:"AED", stockLocation:"main", stockLocationName:"Main",
    billDiscPerc:"", billDiscAmt:"", adjustment:"", roundOff:"", creditDays:"", hideCodeInPrint:false,
    validUntil:"",
  };
}

export function printSalesInvoice(invoice, shop, lang, showCode, colorPrint, opts={}) {
  const settings = loadPrintSettings();
  const html = generateSalesInvoiceHTML(invoice, shop, lang, showCode||false, colorPrint||false, { ...opts, settings });
  printHtmlDocument(html, { preview:settings.showPreview, lang, printer:settings.billPrinter });
}

// ── SI Customer Picker ──
export const CUSTOMER_PICKER_LIMIT = 200;

// Delivery notes used to be saved inside salesInvoices; move them keeping the same id so their stock-ledger entries still match.
export const dnMigratedIds = new Set();

export async function migrateLegacyDeliveryNotes(rows) {
  const legacy = (rows || []).filter(r => r?.id && r.invoiceType==="delivery" && r.docKind!=="delivery" && !dnMigratedIds.has(r.id));
  const moved = [];
  for (const inv of legacy) {
    dnMigratedIds.add(inv.id);
    try {
      const createdAt = inv.createdAt instanceof Date ? inv.createdAt.toISOString() : inv.createdAt;
      await withoutPeriodLock(async () => {
        await offlineCreate("deliveryNotes", { ...inv, docKind:"delivery", createdAt });
        await offlineRemove("salesInvoices", inv.id);
      });
      moved.push(inv.id);
    } catch (err) {
      dnMigratedIds.delete(inv.id);
      console.warn("[S4 DN] legacy delivery note move failed", inv.id, err);
    }
  }
  if (moved.length && navigator.onLine) {
    window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] delivery note move sync failed", err));
  }
  return moved;
}
