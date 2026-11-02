import { loadPrintDesign, layoutAppliesTo, layoutForPrint, amountInWords, renderLayoutDocument, shopHeaderExtras, applyDesign } from "../print/printDesign.js";
import { loadPrintSettings, docSettingsFor, paperCss, paperHeightMm, printWithSettings } from "../print/printSettings.js";
import { PI_VOUCHER_METHODS, piFmt2, piN2 } from "../shared/appShared.jsx";

// ─── PI: VOUCHER — PRINTABLE HTML ───────────────────────────────
export function generatePaymentVoucherHTML(voucherIn, shopIn, lang, opts={}) {
  const usesLayout = !opts.noLayout && !!(opts.design || loadPrintDesign()).layout.voucher?.enabled;
  const rawVoucher = usesLayout ? voucherIn : siEscDeep(voucherIn);
  const shop = usesLayout ? shopIn : siEscDeep(shopIn);
  const isBn = lang==="bn";
  const isReceipt = !!rawVoucher.receiptNo;
  const voucher = isReceipt
    ? { ...rawVoucher, paymentNo:rawVoucher.receiptNo, paymentDate:rawVoucher.receiptDate, vendorName:rawVoucher.customerName }
    : rawVoucher;
  const isCheque = voucher.method==="cheque";
  const methodLabel = PI_VOUCHER_METHODS[voucher.method]?.[lang] || voucher.method;
  const cur = "AED";
  const docNo = a => (!isReceipt && a.supplierInvoiceNo) || a.invoiceNo || "";
  // allocDetail (optional): each selected bill's own total and its balance left after this voucher —
  // looked up by the caller from live invoice data, since the voucher record itself only keeps what was allocated.
  const allocDetail = opts.allocDetail || null;
  const rows = (voucher.allocations||[]).map(a=>{
    const d = allocDetail?.find(x=>x.invoiceId===a.invoiceId);
    const extra = allocDetail ? `<td style="text-align:right">${cur} ${piFmt2(d?.invoiceAmount)}</td><td style="text-align:right">${cur} ${piFmt2(d?.balanceAfter)}</td>` : "";
    return `<tr><td><strong>${docNo(a)}</strong>${!isReceipt&&a.supplierInvoiceNo?`<div style="font-size:10px;color:#6b7280">${a.invoiceNo}</div>`:""}</td><td>${a.invoiceDate||"—"}</td><td style="text-align:right">${cur} ${piFmt2(a.amount)}</td>${extra}</tr>`;
  }).join("");
  const design = opts.design || loadPrintDesign();
  const layout = design.layout.voucher;
  const vTitle = opts.title || (isReceipt?(isBn?"রিসিট ভাউচার":"RECEIPT VOUCHER"):(isBn?"পেমেন্ট ভাউচার":"PAYMENT VOUCHER"));
  if (!opts.noLayout && layout?.enabled) {
    const isRef = voucher.method==="bank_transfer"||voucher.method==="card";
    const fields = {
      shopName:shop?.companyName||"", shopAddress:[shop?.area,shop?.countryName].filter(Boolean).join(", "), shopPhone:shop?.mobile||"",
      shopNameAr:shop?.companyNameAr||"",
      title:vTitle, voucherNo:voucher.paymentNo||"", date:voucher.paymentDate||"", partyName:voucher.vendorName||"", method:methodLabel||"",
      amount:piFmt2(voucher.totalAmount), amountWords:amountInWords(voucher.totalAmount, cur),
      chequeNo:isCheque?(voucher.chequeNo||""):"", chequeBank:isCheque?(voucher.chequeBank||""):isRef?(voucher.refBank||""):"",
      chequeDate:isCheque?(voucher.chequeDate||""):"", refNo:isRef?(voucher.refNo||""):"", note:voucher.note||"", collectedBy:voucher.collectedByName||"",
    };
    const items = opts.summaryOnly ? [] : (voucher.allocations||[]).map(a=>{
      const d = allocDetail?.find(x=>x.invoiceId===a.invoiceId);
      return { invoiceNo:docNo(a), ourNo:a.invoiceNo||"", invoiceDate:a.invoiceDate||"", amount:piFmt2(a.amount), ...(allocDetail ? { invoiceAmount:piFmt2(d?.invoiceAmount), balanceAfter:piFmt2(d?.balanceAfter) } : {}) };
    });
    return renderLayoutDocument(layout, "voucher", { fields, items, logo:design.style.voucher?.logo }, { title:`${vTitle} - ${voucher.paymentNo}`, bn:isBn });
  }
  const docTitle = opts.title || (isReceipt ? (isBn ? "রিসিট ভাউচার" : "Receipt Voucher") : (isBn ? "পেমেন্ট ভাউচার" : "Payment Voucher"));
  const partyLabel = isReceipt ? (isBn ? "গ্রহণ করা হয়েছে" : "Received From") : (isBn ? "প্রদান করা হয়েছে" : "Paid To");
  const amountLabel = isBn ? "সর্বমোট" : (isReceipt ? "Total Received" : "Total Paid");
  return applyDesign(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${docTitle} - ${voucher.paymentNo}</title>
<style>
@page{size:A4;margin:10mm 12mm}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Tahoma,Arial,'Noto Sans Bengali',sans-serif;font-size:12px;color:#111;background:#fff;padding:12px}
.receipt{max-width:720px;margin:0 auto;border:1px solid #374151;border-radius:4px;overflow:hidden}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:10px 14px;border-bottom:2px solid #111;background:#f8fafc;color:#111}
.hdr-left{flex:1;min-width:0}
.hdr-right{text-align:right;flex-shrink:0}
.shop-name{font-size:15px;font-weight:900;line-height:1.2}
.shop-sub{font-size:10px;color:#475569;margin-top:2px;line-height:1.35}
.title-row{display:flex;justify-content:flex-end;align-items:baseline;gap:10px;margin-top:6px}
.rc-title{font-size:14px;font-weight:900;letter-spacing:0.3px;text-transform:uppercase}
.rc-no{font-size:12px;font-weight:800;font-family:Consolas,monospace}
.body{padding:10px 14px}
.meta-row{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px;font-size:11px}
.meta-row .info-box{padding:5px 8px}
.info-box{background:#fff;border:1px solid #cbd5e1;border-radius:2px}
.info-label{font-size:9px;text-transform:uppercase;color:#64748b;font-weight:700;margin-bottom:1px}
.info-value{font-size:12px;font-weight:700;color:#111;line-height:1.3}
.amount-box{display:flex;justify-content:space-between;align-items:center;gap:10px;border:1px solid #111;padding:6px 10px;margin-bottom:8px;background:#fafafa}
.amount-label{font-size:10px;font-weight:800;text-transform:uppercase;color:#334155}
.amount-val{font-size:16px;font-weight:900;color:#111;font-family:Consolas,monospace}
.cheque-box{border:1px solid #94a3b8;background:#f8fafc;padding:5px 8px;margin-bottom:8px;font-size:11px}
.cheque-row{display:flex;justify-content:space-between;gap:8px;padding:2px 0}
.cheque-row span:first-child{color:#475569;font-weight:600}
.cheque-row span:last-child{font-weight:700;text-align:right}
.alloc-table{width:100%;border-collapse:collapse;margin-bottom:8px;font-size:11px}
.alloc-table th{background:#e2e8f0;text-align:left;font-size:9px;text-transform:uppercase;color:#334155;padding:4px 6px;border:1px solid #94a3b8}
.alloc-table td{padding:4px 6px;border:1px solid #cbd5e1;vertical-align:top}
.alloc-table tbody tr:nth-child(even){background:#f8fafc}
.note-box{border:1px solid #cbd5e1;padding:5px 8px;margin-bottom:8px;font-size:11px;color:#334155}
.sigs{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:12px;padding-top:8px;border-top:1px dashed #94a3b8}
.sig-line{border-top:1px solid #64748b;margin-top:28px;padding-top:4px;font-size:10px;color:#475569;text-align:center}
.footer{text-align:center;padding:6px 14px;border-top:1px solid #cbd5e1;font-size:9px;color:#64748b;font-weight:600}
@media print{body{padding:0}.no-print{display:none!important}.receipt{border-radius:0;box-shadow:none}}
</style></head><body>
<div class="no-print" style="text-align:center;margin-bottom:10px">
  <button onclick="window.print()" style="padding:8px 22px;background:#1e40af;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;margin-right:6px">${isBn?"প্রিন্ট / PDF":"Print / PDF"}</button>
  <button onclick="window.close()" style="padding:8px 16px;background:#e5e7eb;color:#374151;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer">${isBn?"বন্ধ করুন":"Close"}</button>
</div>
<div class="receipt">
  <div class="hdr">
    <div class="hdr-left">
      <div class="shop-name">${shop?.companyName||"Shop"}</div>
      ${shopHeaderExtras(shop).arabic}
      <div class="shop-sub">${[shop?.area,shop?.countryName].filter(Boolean).join(", ")||""}${shop?.mobile?` · ${shop.mobile}`:""}</div>
      ${shopHeaderExtras(shop).details}
    </div>
    <div class="hdr-right">
      <div class="title-row"><span class="rc-title">${docTitle}</span><span class="rc-no">${voucher.paymentNo}</span></div>
    </div>
  </div>
  <div class="body">
    <div class="meta-row">
      <div class="info-box"><div class="info-label">${isBn?"তারিখ":"Date"}</div><div class="info-value">${voucher.paymentDate}</div></div>
      <div class="info-box"><div class="info-label">${isBn?"পদ্ধতি":"Method"}</div><div class="info-value">${methodLabel}</div></div>
      <div class="info-box"><div class="info-label">${partyLabel}</div><div class="info-value">${voucher.vendorName||"—"}</div></div>
    </div>
    <div class="amount-box">
      <div class="amount-label">${amountLabel}</div>
      <div class="amount-val">${cur} ${piFmt2(voucher.totalAmount)}</div>
    </div>
    ${!isCheque&&piN2(voucher.discountAmount)>0?`<div class="cheque-box">
      <div class="cheque-row"><span style="color:#b45309;font-weight:700">${isBn?"ছাড়":"Discount"}</span><span style="font-weight:700">${cur} ${piFmt2(voucher.discountAmount)}</span></div>
      <div class="cheque-row"><span style="color:#4f46e5;font-weight:700">${isReceipt?(isBn?"নেট গ্রহণ":"Net Received"):(isBn?"নেট পরিশোধ":"Net Paid")}</span><span style="font-weight:900">${cur} ${piFmt2(piN2(voucher.totalAmount)-piN2(voucher.discountAmount))}</span></div>
    </div>`:""}
    ${isCheque?`<div class="cheque-box">
      <div class="cheque-row"><span style="color:#4f46e5;font-weight:700">${isBn?"চেক নম্বর":"Cheque No."}</span><span style="font-weight:700">${voucher.chequeNo||"—"}</span></div>
      <div class="cheque-row"><span style="color:#4f46e5;font-weight:700">${isBn?"ব্যাংক":"Bank"}</span><span style="font-weight:700">${voucher.chequeBank||"—"}</span></div>
      <div class="cheque-row"><span style="color:#4f46e5;font-weight:700">${isBn?"চেকের তারিখ":"Cheque Date"}</span><span style="font-weight:700">${voucher.chequeDate||"—"}</span></div>
      ${piN2(voucher.discountAmount)>0?`<div class="cheque-row"><span style="color:#b45309;font-weight:700">${isBn?"ছাড়":"Discount"}</span><span style="font-weight:700">${cur} ${piFmt2(voucher.discountAmount)}</span></div>
      <div class="cheque-row"><span style="color:#4f46e5;font-weight:700">${isBn?"চেকের পরিমাণ":"Cheque Amount"}</span><span style="font-weight:900">${cur} ${piFmt2(voucher.chequeAmount)}</span></div>`:""}
      ${voucher.chequeReceivedBy?`<div class="cheque-row"><span style="color:#4f46e5;font-weight:700">${isBn?"চেক গ্রহণকারী":"Cheque Received By"}</span><span style="font-weight:700">${voucher.chequeReceivedBy}</span></div>`:""}
    </div>`:""}
    ${voucher.vendorReceiptNo?`<div class="cheque-box"><div class="cheque-row"><span style="color:#4f46e5;font-weight:700">${isBn?"ভেন্ডরের রিসিট নম্বর":"Vendor Receipt No."}</span><span style="font-weight:700">${voucher.vendorReceiptNo}</span></div></div>`:""}
    ${(voucher.method==="bank_transfer"||voucher.method==="card")&&(voucher.refNo||voucher.refBank)?`<div class="cheque-box">
      <div class="cheque-row"><span style="color:#4f46e5;font-weight:700">${voucher.method==="card"?(isBn?"অনুমোদন / রেফ নং":"Approval / Ref No."):(isBn?"রেফারেন্স নং":"Reference No.")}</span><span style="font-weight:700">${voucher.refNo||"—"}</span></div>
      <div class="cheque-row"><span style="color:#4f46e5;font-weight:700">${voucher.method==="card"?(isBn?"কার্ডের ধরন":"Card Type"):(isBn?"ব্যাংক":"Bank")}</span><span style="font-weight:700">${voucher.refBank||"—"}</span></div>
    </div>`:""}
    ${opts.summaryOnly
      ? `<div class="note-box">${(voucher.allocations||[]).length} ${isReceipt?(isBn?"টি ইনভয়েস":"invoices"):(isBn?"টি ভেন্ডর ইনভয়েস":"vendor invoices")} ${isBn?"পরিশোধ হয়েছে":"settled"} — ${cur} ${piFmt2(voucher.totalAmount)}</div>`
      : `<table class="alloc-table">
      <thead><tr><th>${isReceipt?(isBn?"ইনভয়েস নং":"Invoice No."):(isBn?"ভেন্ডরের ইনভয়েস নং":"Vendor Invoice No.")}</th><th>${isBn?"তারিখ":"Date"}</th><th style="text-align:right">${isBn?"পরিমাণ":"Amount"}</th>${allocDetail?`<th style="text-align:right">${isBn?"ইনভয়েসের মোট":"Invoice Amount"}</th><th style="text-align:right">${isBn?"বাকি":"Balance"}</th>`:""}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`}
    ${voucher.note?`<div class="note-box">${voucher.note}</div>`:""}
    <div class="sigs">
      <div><div class="sig-line">${isBn?"প্রদানকারীর স্বাক্ষর":"Paid By Signature"}</div></div>${isReceipt&&voucher.collectedByName?`<div style="grid-column:1/3;font-size:11px;color:#6b7280">${isBn?"সংগ্রহকারী":"Collected by"}: ${voucher.collectedByName}</div>`:""}
      <div><div class="sig-line">${isBn?"গ্রহণকারীর স্বাক্ষর":"Received By Signature"}</div></div>
    </div>
  </div>
  <div class="footer">${isBn?"ব্যবসার জন্য ধন্যবাদ।":"Thank you for your business."}</div>
</div>
</body></html>`, "voucher", opts.style || design.style.voucher);
}

export function printPaymentVoucher(voucher, shop, lang, opts={}) {
  printWithSettings(generatePaymentVoucherHTML(voucher, shop, lang, opts), { lang });
}

export const SI_UNITS   = ["Pcs","Set","Nos","Kg","Ltr","Box","Cm","Mtr","Dz"];

// Products saved before the checkbox was ever touched count as enabled.
export function productRatesEnabled(p) {
  return p?.multiCustomerRatesChosen ? !!p.multiCustomerRatesEnabled : true;
}

export function siProductRateRows(prod) {
  if (!prod || !productRatesEnabled(prod) || !Array.isArray(prod.unitPrices)) return [];
  return prod.unitPrices.filter((row) => row && row.unit);
}

// A picked product only offers units it can convert to its base unit; any other unit would be counted as 1 base unit.
export function siUnitOptionsFor(prod, currentUnit) {
  if (!prod) return [...new Set([...SI_UNITS, currentUnit].filter(Boolean))];
  const rows = siProductRateRows(prod).filter((row) => Number(row.factor) > 0).map((row) => row.unit);
  return [...new Set([prod.unit || "Pcs", ...rows, currentUnit].filter(Boolean))];
}

import { SI_PAY, siIsSettledPay, siSettledPayLabel } from "./siPay.js";
export { SI_PAY, siIsSettledPay, siSettledPayLabel };

export const SI_STATUSES = {
  draft:     { bn:"ড্রাফট",        en:"Draft",     color:"#f59e0b", bg:"#451a03" },
  confirmed: { bn:"নিশ্চিত",       en:"Confirmed", color:"#06b6d4", bg:"#083344" },
  partial:   { bn:"আংশিক পরিশোধ", en:"Partial",   color:"#a855f7", bg:"#2e1065" },
  paid:      { bn:"পরিশোধিত",     en:"Paid",      color:"#22c55e", bg:"#052e16" },
  cancelled: { bn:"বাতিল",        en:"Cancelled", color:"#71717a", bg:"#27272a" },
};

export const siR2 = (n) => Math.round(((parseFloat(n)||0)+Number.EPSILON)*100)/100;

export const siFmt2 = (n) => siR2(n).toFixed(2);

export const siN2   = (v) => parseFloat(v)||0;

// A line discount is either Dis% or a flat Dis Amt; a percentage wins when both are set.
export function siCalcLine(it, isTax=true) {
  const qty=siN2(it.qty), price=siN2(it.unitPrice), dp=Math.min(Math.max(siN2(it.discountPerc),0),100);
  const vp = isTax ? siN2(it.vatPerc) : 0; // Regular invoice: no VAT
  const gross=qty*price;
  const disc = dp>0 ? gross*dp/100 : Math.min(Math.max(siN2(it.discountFlat),0), gross);
  const base=gross-disc, vat=base*vp/100;
  return { gross, disc, vat, total:base+vat };
}

// Bill discount reduces the taxable value, so VAT shrinks in the same ratio; adjustment and round off apply last.
export function siCalcTotals(items, isTax=true, extra={}) {
  let sub=0,lineDisc=0,lineVat=0;
  items.forEach(it=>{ const c=siCalcLine(it,isTax); sub+=c.gross; lineDisc+=c.disc; lineVat+=c.vat; });
  const base = sub - lineDisc;
  const billPerc = Math.min(Math.max(siN2(extra.billDiscPerc),0),100);
  const billDisc = billPerc>0 ? base*billPerc/100 : Math.min(Math.max(siN2(extra.billDiscAmt),0), Math.max(base,0));
  const ratio = base>0 ? (base-billDisc)/base : 1;
  const vat = siR2(lineVat*ratio);
  const adjustment = siR2(extra.adjustment), roundOff = siR2(extra.roundOff);
  const net = siR2(siR2(base) - siR2(billDisc) + vat);
  const grand = siR2(net + adjustment + roundOff);
  return { sub, disc:lineDisc+billDisc, lineDisc, billDisc, vat, net, adjustment, roundOff, grand };
}

export const siInvoiceExtras = (inv) => ({
  billDiscPerc: inv?.billDiscPerc, billDiscAmt: inv?.billDiscAmt, adjustment: inv?.adjustment, roundOff: inv?.roundOff,
});

// ── Print / PDF Generator ──
export const siEscHtml = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));

export const siEscDeep = (v) => typeof v === "string" ? siEscHtml(v)
  : Array.isArray(v) ? v.map(siEscDeep)
  : v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, siEscDeep(x)]))
  : v;

// The classic template interpolates text straight into HTML; layout designs escape on their own.
export function generateSalesInvoiceHTML(invoice, shop, appLang, showCode, colorPrint, opts={}) {
  const design = opts.design || loadPrintDesign();
  const raw = !opts.noLayout && layoutAppliesTo(design.layout.invoice, invoice);
  return buildSalesInvoiceHTML(raw ? invoice : siEscDeep(invoice), raw ? shop : siEscDeep(shop), appLang, showCode, colorPrint, { ...opts, design });
}

export function buildSalesInvoiceHTML(invoice, shop, appLang, showCode, colorPrint, opts={}) {
  const ps         = opts.settings || loadPrintSettings();
  const ds         = docSettingsFor(ps, invoice);
  const lang       = ds.language==="en"||ds.language==="bn" ? ds.language : appLang;
  const isBn       = lang==="bn";
  const invType    = invoice.invoiceType||"regular";
  const isTax      = invType==="tax";
  const isDelivery = invType==="delivery";
  const isSO       = invoice.docKind==="salesOrder";
  const isQuote    = invoice.docKind==="quotation" || isSO;

  // Delivery note keeps amount columns, but VAT/Tax is not applied.
  const effectiveTax = isTax && !isDelivery;
  const cur = invoice.currency || (isBn ? "৳" : "AED");
  const { sub, lineDisc, vat, grand, billDisc, adjustment, roundOff } = siCalcTotals(invoice.items||[], effectiveTax, siInvoiceExtras(invoice));
  const balance = grand - (invoice.amountPaid||0);
  const paidAmt = siN2(invoice.amountPaid);
  const payLabel = SI_PAY[invoice.paymentMethod]?.[lang] || invoice.paymentMethod || "";
  const moneyTxt = (n, sign="") => {
    const v = siN2(n);
    if (sign === "-") return `- ${siFmt2(Math.abs(v))}`;
    if (sign === "+") return `${v<0?"-":"+"} ${siFmt2(Math.abs(v))}`;
    return siFmt2(v);
  };
  const totalsLine = (label, value) => `<div class="totals-row"><span class="tl">${label}</span><span class="tv">${value}</span></div>`;
  const printDiscount = ds.printDiscount !== false;
  const printRoundOff = ds.printRoundOff !== false;
  const extraRowsHTML = [
    printDiscount ? totalsLine(`${isBn?"বিলের ছাড়":"Bill Discount"}${siN2(invoice.billDiscPerc)>0?` (${invoice.billDiscPerc}%)`:""}`, moneyTxt(billDisc, "-")) : "",
    totalsLine(isBn?"সমন্বয়":"Adjustment", moneyTxt(adjustment, "+")),
    printRoundOff ? totalsLine("Round Off", moneyTxt(roundOff, "+")) : "",
  ].join("");
  // Reference, salesman, delivery and credit details print inside the payment / validity / delivery box
  // (no separate line or boxes above the items).
  const infoLine = (label, value) => `<div class="info-sub">${label}: <b>${value || "—"}</b></div>`;
  const metaHTML = [
    infoLine("Ref", invoice.refNo),
    invoice.quotationNo ? infoLine(isBn?"কোটেশন":"Quotation", invoice.quotationNo) : "",
    invoice.salesOrderNo ? infoLine(isBn?"সেলস অর্ডার":"Sales Order", invoice.salesOrderNo) : "",
    invoice.jobOrderNo ? infoLine(isBn?"জব কার্ড":"Job Card", invoice.jobOrderNo) : "",
    ps.printSalesman ? infoLine(isBn?"বিক্রেতা":"Salesman", invoice.salesmanName) : "",
    !isDelivery ? infoLine(isBn?"ডেলিভারি নোট নং":"Delivery Note No.", invoice.deliveryNoteNo) : "",
    !isDelivery ? infoLine(isBn?"গাড়ির নম্বর":"Vehicle No.", invoice.vehicleNo) : "",
    ps.printCreditPeriod ? infoLine(isBn?"বাকির মেয়াদ":"Credit", siN2(invoice.creditDays)>0 ? `${invoice.creditDays} ${isBn?"দিন":"days"}` : "") : "",
  ].join("");
  const hideVatCols = isTax && !isDelivery && ds.hideVatDiscCols;
  const userNameHTML = ps.printUserName && invoice.createdByName ? invoice.createdByName : "";
  const timeText = ps.printTime && invoice.createdAt
    ? (()=>{ const d=new Date(invoice.createdAt); return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-GB",{ hour:"2-digit", minute:"2-digit" }); })()
    : "";
  const vatSummaryHTML = (()=>{
    if (!ps.printVatSummary || !effectiveTax) return "";
    const byRate = new Map();
    const lineBase = sub - lineDisc;
    const ratio = lineBase>0 ? (lineBase-billDisc)/lineBase : 1;
    (invoice.items||[]).forEach(it=>{
      const { gross:gr, disc:d, vat:v } = siCalcLine(it, true);
      const rate = siN2(it.vatPerc);
      const g = byRate.get(rate) || { base:0, vat:0 };
      g.base += (gr - d)*ratio;
      g.vat  += v*ratio;
      byRate.set(rate, g);
    });
    if (!byRate.size) return "";
    const rowsV = [...byRate.entries()].sort((a,b)=>a[0]-b[0]).map(([r,g])=>`<tr><td style="text-align:center">${r}%</td><td style="text-align:right">${siFmt2(g.base)}</td><td style="text-align:right">${siFmt2(g.vat)}</td><td style="text-align:right">${siFmt2(g.base+g.vat)}</td></tr>`).join("");
    return `<div style="max-width:420px;margin:0 0 14px"><div style="font-size:11px;font-weight:800;text-transform:uppercase;color:#374151;margin-bottom:4px">${isBn?"VAT সারাংশ":"VAT Summary"}</div><table style="margin:0"><thead><tr><th style="text-align:center">VAT%</th><th style="text-align:right">${isBn?"করযোগ্য":"Taxable"}</th><th style="text-align:right">VAT</th><th style="text-align:right">${isBn?"মোট":"Total"}</th></tr></thead><tbody>${rowsV}</tbody></table></div>`;
  })();
  const custBalance = siN2(opts.customerBalance);
  const custBalanceHTML = ps.printCustomerBalance && !isQuote && !isDelivery && invoice.customerName && custBalance>0.01
    ? `<div class="bal-box"><span style="font-weight:700">${isBn?"কাস্টমারের মোট বাকি (সব বিল)":"Customer's total balance (all bills)"}</span><span style="font-size:15px;font-weight:900">${siFmt2(custBalance)}</span></div>`
    : "";

  const title = isSO
    ? (isBn?"সেলস অর্ডার":"SALES ORDER")
    : isQuote
    ? (isBn?"কোটেশন":"QUOTATION")
    : isTax
    ? (isBn?"কর ইনভয়েস":"TAX INVOICE")
    : isDelivery
      ? (isBn?"ডেলিভারি চালান":"DELIVERY CHALLAN")
      : (isBn?"বিক্রয় ইনভয়েস":"SALES INVOICE");

  const design = opts.design || loadPrintDesign();
  const layout = design.layout.invoice;
  if (!opts.noLayout && layoutAppliesTo(layout, invoice)) {
    const items = (invoice.items||[]).map((it,i)=>{
      const { disc:d, vat:v, total:tot } = siCalcLine(it, effectiveTax);
      return {
        sl:String(i+1), code:it.code||"", name:it.name||"", qty:String(it.qty??""), unit:it.unit||"", rate:siFmt2(it.unitPrice),
        disc:siN2(it.discountPerc)>0?`${it.discountPerc}%`:d>0?siFmt2(d):"", excl:siFmt2(siN2(it.unitPrice)*siN2(it.qty)-d),
        vatPerc:effectiveTax?`${siN2(it.vatPerc)}%`:"", vatAmt:effectiveTax?siFmt2(v):"", total:siFmt2(tot),
      };
    });
    const noMoney = isQuote || isDelivery;
    const vatSummaryText = (vatSummaryHTML.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] || "")
      .replace(/<tr>/g, "").replace(/<\/tr>/g, "\n").replace(/<[^>]+>/g, " ").replace(/[ \t]+/g, " ").trim();
    const fields = {
      shopName:shop?.companyName||"", shopAddress:[shop?.area,shop?.countryName].filter(Boolean).join(", "), shopPhone:shop?.mobile||"",
      shopNameAr:shop?.companyNameAr||"", shopLicense:"", shopEmail:shop?.email||"",
      shopFax:shop?.fax||"", shopWebsite:shop?.website||"", shopVat:isTax?(shop?.vatNumber||""):"",
      shopTrn:isTax?(shop?.trnNumber||shop?.vatNumber||""):"", headerNote:design.style?.invoice?.headerNote||"",
      title, invoiceNo:invoice.invoiceNo||"", date:invoice.invoiceDate||"", time:timeText,
      customerName:invoice.customerName||"", customerMobile:invoice.customerMobile||"", customerAddress:invoice.customerAddress||"",
      customerTrn:isTax?(invoice.customerTrn||""):"", customerCode:invoice.customerCode||"", refNo:invoice.refNo||"",
      salesman:ps.printSalesman?(invoice.salesmanName||""):"",
      payment:noMoney?"":payLabel, userName:userNameHTML,
      quotationNo:invoice.quotationNo||"", salesOrderNo:invoice.salesOrderNo||"", jobOrderNo:invoice.jobOrderNo||"",
      deliveryNo:invoice.deliveryNoteNo||"", vehicleNo:invoice.vehicleNo||"", validUntil:isQuote?(invoice.validUntil||""):"",
      dueDate:ps.printCreditPeriod?(invoice.dueDate||""):"", currency:cur,
      totalQty:String((invoice.items||[]).reduce((s,it)=>s+siN2(it.qty),0)), subtotal:siFmt2(sub),
      discount:printDiscount?siFmt2(lineDisc):"", billDiscount:printDiscount?siFmt2(billDisc):"",
      vat:effectiveTax?siFmt2(vat):"", vatSummary:ps.printVatSummary?vatSummaryText:"",
      adjustment:siFmt2(adjustment), roundOff:printRoundOff?siFmt2(roundOff):"",
      grandTotal:siFmt2(grand),
      paid:noMoney?"":siFmt2(paidAmt), balance:noMoney?"":siFmt2(Math.max(0, balance)),
      customerBalance:custBalanceHTML?siFmt2(custBalance):"", amountWords:amountInWords(grand, cur), note:ps.printNarration?(invoice.note||""):"",
      creditPeriod:ps.printCreditPeriod&&siN2(invoice.creditDays)>0?`${invoice.creditDays} ${isBn?"দিন":"days"}`:"",
      terms:design.style?.invoice?.footerText||"",
      bankDetails:[shop?.bankName, shop?.accountNumber, shop?.ibanNumber].filter(Boolean).join(" · "),
    };
    return renderLayoutDocument(layoutForPrint(layout, { hideVatDiscCols: hideVatCols }), "invoice", { fields, items, logo:design.style.invoice?.logo }, { copies:ds.copies, title:`${title} - ${invoice.invoiceNo}`, bn:isBn });
  }

  // Ledger look: thin black box, no cards / gradients. Color print only tints the header line.
  const line = colorPrint ? (isTax?"#1d4ed8": isDelivery?"#7c3aed":"#166534") : "#111";
  const headerGrad   = "#fff";
  const headerText   = "#111";
  const theadBg      = "#fff";
  const theadText    = "#111";
  const accentBorder = line;
  const grandBg      = "#fff";

  const rows = (invoice.items||[]).map((it,i)=>{
    const { disc:d, vat:v, total:tot } = siCalcLine(it, effectiveTax);
    const codeHtml = showCode&&!invoice.hideCodeInPrint&&(it.code||it.brand)
      ? `<br><span style="font-size:10px;color:#6b7280">${[it.code,it.brand].filter(Boolean).join("  ")}</span>` : "";
    if (isDelivery) {
      return `<tr><td style="text-align:center">${i+1}</td><td><strong>${it.name}</strong>${codeHtml}</td><td style="text-align:center;font-size:15px;font-weight:800">${it.qty} ${it.unit}</td><td style="text-align:right">${siFmt2(it.unitPrice)}</td><td style="text-align:right"><strong>${siFmt2(tot)}</strong></td></tr>`;
    } else if (hideVatCols) {
      return `<tr><td style="text-align:center">${i+1}</td><td><strong>${it.name}</strong>${codeHtml}</td><td style="text-align:center">${it.qty} ${it.unit}</td><td style="text-align:right">${siFmt2(it.unitPrice)}</td><td style="text-align:right"><strong>${siFmt2(tot)}</strong></td></tr>`;
    } else if (isTax) {
      const base = siN2(it.unitPrice)*siN2(it.qty) - d;
      return `<tr><td style="text-align:center">${i+1}</td><td><strong>${it.name}</strong>${codeHtml}</td><td style="text-align:center">${it.qty} ${it.unit}</td><td style="text-align:right">${siFmt2(it.unitPrice)}</td><td style="text-align:center">${siN2(it.discountPerc)>0?it.discountPerc+"%":d>0?siFmt2(d):"—"}</td><td style="text-align:right">${siFmt2(base)}</td><td style="text-align:center">${it.vatPerc||0}%</td><td style="text-align:right">${siFmt2(v)}</td><td style="text-align:right"><strong>${siFmt2(tot)}</strong></td></tr>`;
    } else {
      return `<tr><td style="text-align:center">${i+1}</td><td><strong>${it.name}</strong>${codeHtml}</td><td style="text-align:center">${it.qty} ${it.unit}</td><td style="text-align:right">${siFmt2(it.unitPrice)}</td><td style="text-align:center">${siN2(it.discountPerc)>0?it.discountPerc+"%":d>0?siFmt2(d):"—"}</td><td style="text-align:right"><strong>${siFmt2(tot)}</strong></td></tr>`;
    }
  }).join("");

  const tableHeaders = isDelivery || hideVatCols
    ? `<th style="width:36px">#</th><th>${isBn?"পণ্যের বিবরণ":"Item Description"}</th><th style="text-align:center;width:95px">${isBn?"পরিমাণ":"Qty"}</th><th style="text-align:right;width:110px">${isBn?"একক মূল্য":"Unit Price"}</th><th style="text-align:right;width:120px">${isBn?"মোট":"Amount"}</th>`
    : isTax
      ? `<th>#</th><th>${isBn?"পণ্য":"Description"}</th><th style="text-align:center">${isBn?"পরিমাণ":"Qty"}</th><th style="text-align:right">${isBn?"একক মূল্য":"Unit Price"}</th><th style="text-align:center">${isBn?"ছাড়":"Disc"}</th><th style="text-align:right">${isBn?"VAT বাদে":"Excl.VAT"}</th><th style="text-align:center">VAT%</th><th style="text-align:right">${isBn?"VAT":"VAT Amt"}</th><th style="text-align:right">${isBn?"মোট":"Total"}</th>`
      : `<th>#</th><th>${isBn?"পণ্য":"Description"}</th><th style="text-align:center">${isBn?"পরিমাণ":"Qty"}</th><th style="text-align:right">${isBn?"একক মূল্য":"Unit Price"}</th><th style="text-align:center">${isBn?"ছাড়":"Disc"}</th><th style="text-align:right">${isBn?"মোট":"Total"}</th>`;

  const paidBalHTML = (!isDelivery && !isQuote)
    ? `${totalsLine(isBn?"পরিশোধিত":"Paid", moneyTxt(paidAmt))}${totalsLine(isBn?"বাকি":"Balance Due", moneyTxt(Math.max(0, balance)))}`
    : "";
  const discTotalHTML = printDiscount ? totalsLine(isBn?"ছাড়":"Discount", moneyTxt(lineDisc, "-")) : "";
  const totalsHTML = isDelivery
    ? `${extraRowsHTML}<div class="grand-row"><span class="gl">${isBn?"মোট Amount":"Total Amount"}</span><span class="gv">${siFmt2(grand)}</span></div>`
    : isTax
      ? `${totalsLine(isBn?"সাব-টোটাল (VAT বাদে)":"Subtotal (Excl. VAT)", moneyTxt(sub))}${discTotalHTML}${totalsLine(`VAT (${isBn?"মোট":"Total"})`, moneyTxt(vat, "+"))}${extraRowsHTML}<div class="grand-row"><span class="gl">${isBn?"সর্বমোট (VAT সহ)":"Grand Total (Incl. VAT)"}</span><span class="gv">${siFmt2(grand)}</span></div>${paidBalHTML}`
      : `${totalsLine(isBn?"সাব-টোটাল":"Subtotal", moneyTxt(sub))}${discTotalHTML}${extraRowsHTML}<div class="grand-row"><span class="gl">${isBn?"সর্বমোট":"Grand Total"}</span><span class="gv">${siFmt2(grand)}</span></div>${paidBalHTML}`;

  const custHTML = `<div class="info-box"><div class="info-label">${isBn?"বিল টু":"Bill To"}</div><div class="info-value">${invoice.customerName||"—"}</div>${infoLine(isBn?"কোড":"Code", invoice.customerCode)}${infoLine(isBn?"মোবাইল":"Mobile", invoice.customerMobile)}${infoLine(isBn?"ঠিকানা":"Address", invoice.customerAddress)}${isTax?infoLine("TRN", invoice.customerTrn):""}</div>`;

  const payInfoHTML = isQuote
    ? `<div class="info-box"><div class="info-label">${isSO?(isBn?"ডেলিভারির তারিখ":"Delivery By"):(isBn?"মেয়াদ":"Valid Until")}</div><div class="info-value">${invoice.validUntil||"—"}</div>${infoLine(isBn?"ইউজার":"User", invoice.createdByName)}${metaHTML}</div>`
    : isDelivery
    ? `<div class="info-box"><div class="info-label">${isBn?"ডেলিভারি তথ্য":"Delivery Info"}</div><div class="info-value">${invoice.deliveryNoteNo||(invoice.docKind==="delivery"?invoice.invoiceNo:"—")}</div>${infoLine(isBn?"গাড়ি":"Vehicle", invoice.vehicleNo)}${infoLine(isBn?"ইউজার":"User", invoice.createdByName)}${metaHTML}</div>`
    : `<div class="info-box"><div class="info-label">${isBn?"পেমেন্ট":"Payment"}</div><div class="info-value">${payLabel||"—"}</div>${metaHTML}</div>`;

  const thermal = ds.paper==="80mm" || ds.paper==="58mm";
  const pageH = !thermal && ds.fullPage !== false ? paperHeightMm(ds.paper) : null;
  const sheetH = pageH ? `${pageH - 16}mm` : "auto";
  const rawDoc = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} - ${invoice.invoiceNo}</title>
<style>
@page{size:${paperCss(ds.paper)};margin:${thermal?"3mm":"8mm"}}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Times New Roman','Nirmala UI',serif;font-size:12px;color:#111;background:#fff;padding:16px}
.invoice{max-width:210mm;margin:0 auto;border:1.5px solid ${accentBorder};background:#fff;display:flex;flex-direction:column;${pageH?`min-height:${sheetH};`:""}}
.sheet-top{flex:0 0 auto}
.sheet-mid{flex:1 1 auto;display:flex;flex-direction:column;min-height:${pageH?"70mm":"0"}}
.sheet-bot{flex:0 0 auto;margin-top:auto}
.hdr{background:${headerGrad};color:${headerText};padding:10px 12px;display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1.5px solid ${accentBorder}}
.shop-name{font-size:18px;font-weight:900;letter-spacing:0.3px}
.shop-sub{font-size:11px;margin-top:2px;color:#111}
.inv-title{font-size:15px;font-weight:900;text-align:right;letter-spacing:1px;border:1px solid #111;padding:3px 8px;display:inline-block}
.inv-no{font-size:12px;text-align:right;margin-top:3px}
.body{padding:8px 12px}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;margin:0;border:1px solid #111;align-items:stretch}
.info-box{background:#fff;padding:7px 10px;border:none;border-right:1px solid #111;min-height:38mm}
.info-box:last-child{border-right:none}
.info-label{font-size:10px;text-transform:uppercase;letter-spacing:0.4px;color:#111;font-weight:700;margin-bottom:2px}
.info-value{font-size:13px;font-weight:700;color:#111}
.info-sub{font-size:11px;color:#111;margin-top:2px}
table.items{width:100%;border-collapse:collapse;margin:0;font-size:11px;height:auto}
table.items th,table.items td{border:1px solid #111;padding:5px 6px;vertical-align:top}
thead tr{background:${theadBg};color:${theadText}}
th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.3px;font-weight:700}
tbody tr:nth-child(even){background:#fff}
.totals-wrap{display:flex;align-items:stretch;gap:10px;margin:8px 0}
.totals-left{flex:1;min-width:0;display:flex}
.totals-left .words-box{flex:1;margin:0;display:flex;align-items:center}
.totals{flex:0 0 280px;margin:0}
.totals-box{width:100%;border:1px solid #111}
.totals-row{display:flex;justify-content:space-between;padding:5px 10px;border-bottom:1px solid #111;background:#fff}
.tl{color:#111;font-size:11px}
.tv{font-weight:700;font-size:11px;color:#111}
.grand-row{display:flex;justify-content:space-between;padding:7px 10px;background:${grandBg};border-top:2px solid #111}
.gl{color:#111;font-size:12px;font-weight:800}
.gv{color:#111;font-size:15px;font-weight:900}
.pay-box,.bal-box,.note-box{background:#fff;border:1px solid #111;padding:6px 10px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center}
.note-box{display:block;font-size:11px;color:#111}
.words-box{background:#fff;border:1px solid #111;padding:6px 10px;margin-bottom:8px;font-size:11px;font-weight:600}
${isDelivery?`.recv-box{background:#fff;border:1px solid #111;padding:10px;margin-bottom:8px}.recv-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;text-align:center}.recv-item{border-top:1px solid #111;margin-top:28px;padding-top:4px;font-size:11px}`:""}
.sigs{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:6px;padding:4px 8px 10px}
.sig-line{border-top:1px solid #111;margin-top:22px;padding-top:4px;font-size:11px;text-align:center}
.footer{text-align:left;padding:6px 12px;background:#fff;border-top:1px solid #111;font-size:11px;color:#111;font-weight:600}
@media print{html,body{height:100%!important;padding:0!important}.no-print{display:none!important}.invoice{max-width:100%!important;border-radius:0!important;box-shadow:none!important;${pageH?`min-height:100%!important;`:""}display:flex!important;flex-direction:column!important}.sheet-bot,.sigs{break-inside:avoid;page-break-inside:avoid}}
${thermal?`body{padding:4px;font-size:11px}.invoice{max-width:100%;border-width:1px;min-height:0!important;display:block}.hdr{flex-direction:column;gap:6px;padding:10px}.inv-title,.inv-no{text-align:left}.body{padding:8px}.info-grid{grid-template-columns:1fr}.totals-wrap{flex-direction:column}.totals{flex:1 1 auto;width:100%}table{font-size:10px}th,td{padding:4px 3px}.sigs{display:none}`:""}
${ds.preprinted?`.hdr .shop-block{visibility:hidden}.hdr{min-height:110px}`:""}
</style></head><body>
<div class="no-print" style="text-align:center;margin-bottom:14px">
  <button onclick="window.print()" style="padding:10px 28px;background:#111;color:#fff;border:none;font-size:14px;font-weight:700;cursor:pointer;margin-right:8px">${isBn?"প্রিন্ট / PDF":"Print / PDF"}</button>
  <button onclick="window.close()" style="padding:10px 20px;background:#e5e7eb;color:#374151;border:none;font-size:14px;font-weight:700;cursor:pointer">${isBn?"বন্ধ করুন":"Close"}</button>
</div>
<div class="invoice">
<div class="sheet-top"><div class="hdr"><div class="shop-block"><div class="shop-name">${shop?.companyName||"Shop"}</div>${shopHeaderExtras(shop).arabic}<div class="shop-sub">${[shop?.area,shop?.countryName].filter(Boolean).join(", ")||""}</div>${shop?.mobile?`<div class="shop-sub">${shop.mobile}</div>`:""}${shopHeaderExtras(shop).details} ${isTax&&shop?.trnNumber?`<div class="shop-sub" style="font-weight:800;margin-top:3px">TRN: ${shop.trnNumber}</div>`:""} ${isTax&&shop?.vatNumber?`<div class="shop-sub" style="font-weight:700">VAT: ${shop.vatNumber}</div>`:""}</div><div><div class="inv-title">${title}</div><div class="inv-no" style="font-size:14px;font-weight:800">${invoice.invoiceNo}</div><div class="inv-no">${invoice.invoiceDate}${timeText?`  ${timeText}`:""}</div>${userNameHTML?`<div class="inv-no">${userNameHTML}</div>`:""}</div></div>
<div class="body"><div class="info-grid">${custHTML}${payInfoHTML}</div></div></div>
<div class="sheet-mid"><table class="items"><thead><tr>${tableHeaders}</tr></thead><tbody>${rows}</tbody></table></div>
<div class="sheet-bot"><div class="body">
${totalsHTML?`<div class="totals-wrap">${!isDelivery&&!isQuote?`<div class="totals-left"><div class="words-box"><b>${isBn?"কথায়":"Amount in words"}:</b> ${amountInWords(grand, cur)}</div></div>`:""}<div class="totals"><div class="totals-box">${totalsHTML}</div></div></div>`:(!isDelivery&&!isQuote?`<div class="words-box"><b>${isBn?"কথায়":"Amount in words"}:</b> ${amountInWords(grand, cur)}</div>`:"")}
${vatSummaryHTML}
${isDelivery?`<div class="recv-box"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:14px">${isBn?"মোট পণ্য":"Total Items"}: ${(invoice.items||[]).reduce((s,it)=>s+siN2(it.qty),0)} ${isBn?"পিস":"Pcs"} | ${isBn?"মোট লাইন":"Lines"}: ${(invoice.items||[]).length}</div><div class="recv-grid"><div class="recv-item">${isBn?"প্রেরকের স্বাক্ষর":"Sender Signature"}</div><div class="recv-item">${isBn?"ড্রাইভারের স্বাক্ষর":"Driver Signature"}</div><div class="recv-item">${isBn?"গ্রাহকের স্বাক্ষর":"Receiver Signature"}</div></div></div>`:""}
${custBalanceHTML}
${ps.printNarration&&invoice.note?`<div class="note-box">${invoice.note}</div>`:""}
<div class="footer">${isSO?(isBn?"অর্ডারের জন্য ধন্যবাদ।":"Thank you for your order."):isQuote?(isBn?`এই কোটেশন ${invoice.validUntil||""} পর্যন্ত বৈধ। ধন্যবাদ।`:`This quotation is valid until ${invoice.validUntil||"—"}. Thank you.`):isDelivery?(isBn?"ডেলিভারি সম্পন্ন হলে এই চালানে স্বাক্ষর করুন।":"Please sign this challan upon delivery."):(isBn?"ব্যবসার জন্য ধন্যবাদ।":"Thank you for your business.")}</div>
${!isDelivery?`<div class="sigs"><div><div class="sig-line">${isBn?"অনুমোদনকারী স্বাক্ষর":"Authorized Signature"}</div></div><div><div class="sig-line">${isBn?"গ্রাহক স্বাক্ষর":"Customer Signature"}</div></div></div>`:""}
</div></div></div></body></html>`;
  const doc = applyDesign(rawDoc, "invoice", opts.style || design.style.invoice);
  const copies = Math.max(1, Math.min(10, parseInt(ds.copies, 10) || 1));
  if (copies === 1) return doc;
  const start = doc.indexOf('<div class="invoice">');
  const end = doc.lastIndexOf("</body>");
  const block = doc.slice(start, end);
  const repeated = Array.from({ length:copies }, (_, i) =>
    i ? block.replace('<div class="invoice">', '<div class="invoice" style="page-break-before:always;break-before:page;margin-top:20px">') : block).join("");
  return doc.slice(0, start) + repeated + doc.slice(end);
}
