// Arabic on the printed / PDF sales documents (tax invoice, sales invoice, quotation, sales order, delivery note):
// the shop's choice in Shop Info (shop.invoiceArabic):
// - "en": English only, as before;
// - "both": every heading in English with its Arabic under it, and the Arabic names (shop, customer, items) under the
//   English ones where they are filled in;
// - "ar": Arabic headings, Arabic names where filled in (English names stay for anything without an Arabic one).
// Not set: a UAE shop with an Arabic company name prints "both"; any other shop prints English only.
// The Arabic is laid out right-to-left inside its own block; numbers, amounts and the column order stay as they are.
// A Bangla print (print settings language) never mixes in Arabic.
import { countryKey } from "../reports/taxDomain.js";

export const INVOICE_ARABIC_MODES = ["en", "both", "ar"];

/** Standard UAE invoice wording. */
export const INVOICE_AR = {
  taxInvoice: "فاتورة ضريبية", salesInvoice: "فاتورة مبيعات", quotation: "عرض سعر", salesOrder: "أمر بيع", deliveryNote: "إشعار تسليم",
  billTo: "فاتورة إلى", code: "الرمز", mobile: "الجوال", address: "العنوان", trn: "الرقم الضريبي", vat: "ضريبة القيمة المضافة",
  payment: "طريقة الدفع", validUntil: "صالح حتى", deliveryBy: "التسليم بحلول", deliveryInfo: "معلومات التسليم", user: "المستخدم", vehicle: "المركبة",
  description: "الوصف", itemDescription: "وصف الصنف", qty: "الكمية", unitPrice: "سعر الوحدة", disc: "الخصم", exclVat: "بدون الضريبة",
  vatPerc: "نسبة الضريبة", amount: "المبلغ", total: "الإجمالي",
  subtotalExcl: "المجموع الفرعي (بدون الضريبة)", subtotal: "المجموع الفرعي", discount: "الخصم", vatTotal: "إجمالي الضريبة",
  grandTotalIncl: "الإجمالي (شامل الضريبة)", grandTotal: "الإجمالي", totalAmount: "إجمالي المبلغ", paid: "المدفوع", balanceDue: "الرصيد المستحق",
  amountInWords: "المبلغ بالكلمات", vatSummary: "ملخص الضريبة", taxable: "المبلغ الخاضع للضريبة",
  authorizedSignature: "التوقيع المعتمد", customerSignature: "توقيع العميل", page: "صفحة",
};

/** The mode a shop prints with. */
export function invoiceArabicMode(shop) {
  const set = String(shop?.invoiceArabic || "").toLowerCase();
  if (INVOICE_ARABIC_MODES.includes(set)) return set;
  return countryKey(shop?.country || shop?.taxSettings?.country) === "ae" && String(shop?.companyNameAr || "").trim() ? "both" : "en";
}

/**
 * Label helpers for one document. mode: invoiceArabicMode(); bn: the document prints in Bangla (no Arabic then).
 * label(en, key): the heading; name(en, ar): a name with its Arabic; on: Arabic is printed at all.
 */
export function arabicLabels(mode, bn = false) {
  const m = bn ? "en" : INVOICE_ARABIC_MODES.includes(mode) ? mode : "en";
  const ar = (text) => `<span class="ar" dir="rtl" lang="ar">${text}</span>`;
  const label = (en, key) => {
    const a = INVOICE_AR[key];
    if (m === "en" || !a) return en;
    if (m === "ar") return ar(a);
    return `${en}<span class="ar-sub" dir="rtl" lang="ar">${a}</span>`;
  };
  const name = (en, arText) => {
    const a = String(arText || "").trim();
    if (m === "en" || !a) return en;
    if (m === "ar") return ar(a);
    return `${en}<span class="ar-sub" dir="rtl" lang="ar">${a}</span>`;
  };
  return { mode: m, on: m !== "en", label, name };
}

/** Print CSS for the Arabic blocks (an Arabic-capable font, right-to-left, a second line under the English). */
export const ARABIC_PRINT_CSS = `
.ar,.ar-sub{font-family:'Segoe UI','Tahoma','Arial','Noto Naskh Arabic',sans-serif;unicode-bidi:isolate}
.ar-sub{display:block;font-size:0.86em;font-weight:600;line-height:1.25;margin-top:1px}
th .ar-sub{font-size:0.82em}
.shop-ar{text-align:inherit;direction:rtl;unicode-bidi:isolate}
`;
