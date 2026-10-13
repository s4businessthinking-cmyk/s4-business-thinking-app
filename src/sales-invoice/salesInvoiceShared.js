import { loadPrintDesign, layoutAppliesTo, amountInWords, renderLayoutDocument, shopHeaderExtras, applyDesign } from "../print/printDesign.js";
import { loadPrintSettings, docSettingsFor, paperCss, printWithSettings } from "../print/printSettings.js";
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
  const rows = (voucher.allocations||[]).map(a=>`
    <tr><td><strong>${docNo(a)}</strong>${!isReceipt&&a.supplierInvoiceNo?`<div style="font-size:10px;color:#6b7280">${a.invoiceNo}</div>`:""}</td><td>${a.invoiceDate||"—"}</td><td style="text-align:right">${cur} ${piFmt2(a.amount)}</td></tr>
  `).join("");
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
    const items = (voucher.allocations||[]).map(a=>({ invoiceNo:docNo(a), ourNo:a.invoiceNo||"", invoiceDate:a.invoiceDate||"", amount:piFmt2(a.amount) }));
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
  <button onclick="window.print()" style="padding:8px 22px;background:#1e40af;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;margin-right:6px">🖨️ ${isBn?"প্রিন্ট / PDF":"Print / PDF"}</button>
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
      <div class="info-box"><div class="info-label">${isBn?"পদ্ধতি":"Method"}</div><div class="info-value">${PI_VOUCHER_METHODS[voucher.method]?.icon||""} ${methodLabel}</div></div>
      <div class="info-box"><div class="info-label">${partyLabel}</div><div class="info-value">${voucher.vendorName||"—"}</div></div>
    </div>
    <div class="amount-box">
      <div class="amount-label">${amountLabel}</div>
      <div class="amount-val">${cur} ${piFmt2(voucher.totalAmount)}</div>
    </div>
    ${isCheque?`<div class="cheque-box">
      <div class="cheque-row"><span style="color:#4f46e5;font-weight:700">📃 ${isBn?"চেক নম্বর":"Cheque No."}</span><span style="font-weight:700">${voucher.chequeNo||"—"}</span></div>
      <div class="cheque-row"><span style="color:#4f46e5;font-weight:700">🏦 ${isBn?"ব্যাংক":"Bank"}</span><span style="font-weight:700">${voucher.chequeBank||"—"}</span></div>
      <div class="cheque-row"><span style="color:#4f46e5;font-weight:700">📅 ${isBn?"চেকের তারিখ":"Cheque Date"}</span><span style="font-weight:700">${voucher.chequeDate||"—"}</span></div>
      ${piN2(voucher.discountAmount)>0?`<div class="cheque-row"><span style="color:#b45309;font-weight:700">🏷️ ${isBn?"ছাড়":"Discount"}</span><span style="font-weight:700">${cur} ${piFmt2(voucher.discountAmount)}</span></div>
      <div class="cheque-row"><span style="color:#4f46e5;font-weight:700">🖋️ ${isBn?"চেকের পরিমাণ":"Cheque Amount"}</span><span style="font-weight:900">${cur} ${piFmt2(voucher.chequeAmount)}</span></div>`:""}
      ${voucher.chequeReceivedBy?`<div class="cheque-row"><span style="color:#4f46e5;font-weight:700">🙋 ${isBn?"চেক গ্রহণকারী":"Cheque Received By"}</span><span style="font-weight:700">${voucher.chequeReceivedBy}</span></div>`:""}
    </div>`:""}
    ${voucher.vendorReceiptNo?`<div class="cheque-box"><div class="cheque-row"><span style="color:#4f46e5;font-weight:700">🧾 ${isBn?"ভেন্ডরের রিসিট নম্বর":"Vendor Receipt No."}</span><span style="font-weight:700">${voucher.vendorReceiptNo}</span></div></div>`:""}
    ${(voucher.method==="bank_transfer"||voucher.method==="card")&&(voucher.refNo||voucher.refBank)?`<div class="cheque-box">
      <div class="cheque-row"><span style="color:#4f46e5;font-weight:700">🔖 ${voucher.method==="card"?(isBn?"অনুমোদন / রেফ নং":"Approval / Ref No."):(isBn?"রেফারেন্স নং":"Reference No.")}</span><span style="font-weight:700">${voucher.refNo||"—"}</span></div>
      <div class="cheque-row"><span style="color:#4f46e5;font-weight:700">${voucher.method==="card"?(isBn?"💳 কার্ডের ধরন":"💳 Card Type"):(isBn?"🏦 ব্যাংক":"🏦 Bank")}</span><span style="font-weight:700">${voucher.refBank||"—"}</span></div>
    </div>`:""}
    <table class="alloc-table">
      <thead><tr><th>${isReceipt?(isBn?"ইনভয়েস নং":"Invoice No."):(isBn?"ভেন্ডরের ইনভয়েস নং":"Vendor Invoice No.")}</th><th>${isBn?"তারিখ":"Date"}</th><th style="text-align:right">${isBn?"পরিমাণ":"Amount"}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${voucher.note?`<div class="note-box">📝 ${voucher.note}</div>`:""}
    <div class="sigs">
      <div><div class="sig-line">${isBn?"প্রদানকারীর স্বাক্ষর":"Paid By Signature"}</div></div>${isReceipt&&voucher.collectedByName?`<div style="grid-column:1/3;font-size:11px;color:#6b7280">${isBn?"সংগ্রহকারী":"Collected by"}: ${voucher.collectedByName}</div>`:""}
      <div><div class="sig-line">${isBn?"গ্রহণকারীর স্বাক্ষর":"Received By Signature"}</div></div>
    </div>
  </div>
  <div class="footer">${isBn?"ব্যবসার জন্য ধন্যবাদ! 🙏":"Thank you for your business! 🙏"}</div>
</div>
</body></html>`, "voucher", opts.style || design.style.voucher);
}

export function printPaymentVoucher(voucher, shop, lang) {
  printWithSettings(generatePaymentVoucherHTML(voucher, shop, lang), { lang });
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

export const SI_PAY     = {
  cash:   { bn:"নগদ",            en:"Cash",          icon:"💵" },
  bank:   { bn:"ব্যাংক ট্রান্সফার", en:"Bank Transfer",  icon:"🏦" },
  cheque: { bn:"চেক",             en:"Cheque",         icon:"📃" },
  credit: { bn:"বাকি (ক্রেডিট)",  en:"Credit",         icon:"📅" },
};

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
  const extraRowsHTML = [
    billDisc>0 ? `<div class="totals-row"><span class="tl">${isBn?"বিলের ছাড়":"Bill Discount"}${siN2(invoice.billDiscPerc)>0?` (${invoice.billDiscPerc}%)`:""}</span><span class="tv" style="color:#ef4444">- ${cur} ${siFmt2(billDisc)}</span></div>` : "",
    adjustment ? `<div class="totals-row"><span class="tl">${isBn?"সমন্বয়":"Adjustment"}</span><span class="tv">${adjustment>0?"+":"-"} ${cur} ${siFmt2(Math.abs(adjustment))}</span></div>` : "",
    roundOff ? `<div class="totals-row"><span class="tl">Round Off</span><span class="tv">${roundOff>0?"+":"-"} ${cur} ${siFmt2(Math.abs(roundOff))}</span></div>` : "",
  ].join("");
  const metaHTML = [
    invoice.refNo ? `Ref: ${invoice.refNo}` : "",
    invoice.quotationNo ? `${isBn?"কোটেশন":"Quotation"}: ${invoice.quotationNo}` : "",
    invoice.salesOrderNo ? `${isBn?"সেলস অর্ডার":"Sales Order"}: ${invoice.salesOrderNo}` : "",
    invoice.jobOrderNo ? `${isBn?"জব কার্ড":"Job Card"}: ${invoice.jobOrderNo}` : "",
    ps.printSalesman&&invoice.salesmanName ? `${isBn?"বিক্রেতা":"Salesman"}: ${invoice.salesmanName}` : "",
    ps.printCreditPeriod&&siN2(invoice.creditDays)>0 ? `${isBn?"বাকির মেয়াদ":"Credit"}: ${invoice.creditDays} ${isBn?"দিন":"days"}` : "",
  ].filter(Boolean).join(" &nbsp;·&nbsp; ");
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
    ? `<div class="bal-box" style="background:#fff7ed;border-color:#f59e0b"><span style="font-weight:700;color:#b45309">📒 ${isBn?"কাস্টমারের মোট বাকি (সব বিল)":"Customer's total balance (all bills)"}</span><span style="font-size:15px;font-weight:900;color:#b45309">${cur} ${siFmt2(custBalance)}</span></div>`
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
    const fields = {
      shopName:shop?.companyName||"", shopAddress:[shop?.area,shop?.countryName].filter(Boolean).join(", "), shopPhone:shop?.mobile||"",
      shopNameAr:shop?.companyNameAr||"", shopLicense:shop?.tradeLicenseNumber||"", shopEmail:shop?.email||"",
      shopTrn:isTax?(shop?.trnNumber||shop?.vatNumber||""):"", title, invoiceNo:invoice.invoiceNo||"", date:invoice.invoiceDate||"", time:timeText,
      customerName:invoice.customerName||"", customerMobile:invoice.customerMobile||"", customerAddress:invoice.customerAddress||"",
      customerTrn:isTax?(invoice.customerTrn||""):"", customerCode:invoice.customerCode||"", refNo:invoice.refNo||"", salesman:ps.printSalesman?(invoice.salesmanName||""):"",
      payment:noMoney?"":(SI_PAY[invoice.paymentMethod]?.[lang]||invoice.paymentMethod||""), userName:userNameHTML,
      deliveryNo:invoice.deliveryNoteNo||"", vehicleNo:invoice.vehicleNo||"", validUntil:isQuote?(invoice.validUntil||""):"",
      totalQty:String((invoice.items||[]).reduce((s,it)=>s+siN2(it.qty),0)), subtotal:siFmt2(sub),
      discount:lineDisc+billDisc>0?siFmt2(lineDisc+billDisc):"", vat:effectiveTax?siFmt2(vat):"", grandTotal:`${cur} ${siFmt2(grand)}`,
      paid:!noMoney&&invoice.amountPaid>0?siFmt2(invoice.amountPaid):"", balance:!noMoney&&balance>0.01?siFmt2(balance):"",
      customerBalance:custBalanceHTML?siFmt2(custBalance):"", amountWords:amountInWords(grand, cur), note:ps.printNarration?(invoice.note||""):"",
    };
    return renderLayoutDocument(layout, "invoice", { fields, items, logo:design.style.invoice?.logo }, { copies:ds.copies, title:`${title} - ${invoice.invoiceNo}`, bn:isBn });
  }

  // B&W vs Color — clearly distinct
  const headerColor  = colorPrint ? (isTax?"#1d4ed8": isDelivery?"#7c3aed":"#16a34a") : "#374151";
  const headerGrad   = colorPrint
    ? (isTax?"linear-gradient(135deg,#1d4ed8,#1e40af)":
       isDelivery?"linear-gradient(135deg,#7c3aed,#6d28d9)":
       "linear-gradient(135deg,#16a34a,#15803d)")
    : "#f8f9fa"; // B&W: light grey header
  const headerText   = colorPrint ? "#ffffff" : "#111111"; // B&W: black text
  const theadBg      = colorPrint ? "#1f2937" : "#e5e7eb";
  const theadText    = colorPrint ? "#ffffff" : "#111111";
  const accentBorder = colorPrint ? headerColor : "#6b7280";
  const grandBg      = colorPrint ? headerColor : "#374151";

  const rows = (invoice.items||[]).map((it,i)=>{
    const { disc:d, vat:v, total:tot } = siCalcLine(it, effectiveTax);
    const codeHtml = showCode&&!invoice.hideCodeInPrint&&(it.code||it.brand)
      ? `<br><span style="font-size:10px;color:#6b7280">${[it.code&&("📋 "+it.code),it.brand&&("🏷️ "+it.brand)].filter(Boolean).join("  ")}</span>` : "";
    if (isDelivery) {
      return `<tr><td style="text-align:center">${i+1}</td><td><strong>${it.name}</strong>${codeHtml}</td><td style="text-align:center;font-size:15px;font-weight:800;color:#7c3aed">${it.qty} ${it.unit}</td><td style="text-align:right">${cur} ${siFmt2(it.unitPrice)}</td><td style="text-align:right"><strong>${cur} ${siFmt2(tot)}</strong></td></tr>`;
    } else if (hideVatCols) {
      return `<tr><td style="text-align:center">${i+1}</td><td><strong>${it.name}</strong>${codeHtml}</td><td style="text-align:center">${it.qty} ${it.unit}</td><td style="text-align:right">${cur} ${siFmt2(it.unitPrice)}</td><td style="text-align:right"><strong>${cur} ${siFmt2(tot)}</strong></td></tr>`;
    } else if (isTax) {
      const base = siN2(it.unitPrice)*siN2(it.qty) - d;
      return `<tr><td style="text-align:center">${i+1}</td><td><strong>${it.name}</strong>${codeHtml}</td><td style="text-align:center">${it.qty} ${it.unit}</td><td style="text-align:right">${cur} ${siFmt2(it.unitPrice)}</td><td style="text-align:center">${siN2(it.discountPerc)>0?it.discountPerc+"%":d>0?siFmt2(d):"—"}</td><td style="text-align:right">${cur} ${siFmt2(base)}</td><td style="text-align:center">${it.vatPerc||0}%</td><td style="text-align:right">${cur} ${siFmt2(v)}</td><td style="text-align:right"><strong>${cur} ${siFmt2(tot)}</strong></td></tr>`;
    } else {
      return `<tr><td style="text-align:center">${i+1}</td><td><strong>${it.name}</strong>${codeHtml}</td><td style="text-align:center">${it.qty} ${it.unit}</td><td style="text-align:right">${cur} ${siFmt2(it.unitPrice)}</td><td style="text-align:center">${siN2(it.discountPerc)>0?it.discountPerc+"%":d>0?siFmt2(d):"—"}</td><td style="text-align:right"><strong>${cur} ${siFmt2(tot)}</strong></td></tr>`;
    }
  }).join("");

  const tableHeaders = isDelivery || hideVatCols
    ? `<th style="width:36px">#</th><th>${isBn?"পণ্যের বিবরণ":"Item Description"}</th><th style="text-align:center;width:95px">${isBn?"পরিমাণ":"Qty"}</th><th style="text-align:right;width:110px">${isBn?"একক মূল্য":"Unit Price"}</th><th style="text-align:right;width:120px">${isBn?"মোট":"Amount"}</th>`
    : isTax
      ? `<th>#</th><th>${isBn?"পণ্য":"Description"}</th><th style="text-align:center">${isBn?"পরিমাণ":"Qty"}</th><th style="text-align:right">${isBn?"একক মূল্য":"Unit Price"}</th><th style="text-align:center">${isBn?"ছাড়":"Disc"}</th><th style="text-align:right">${isBn?"VAT বাদে":"Excl.VAT"}</th><th style="text-align:center">VAT%</th><th style="text-align:right">${isBn?"VAT":"VAT Amt"}</th><th style="text-align:right">${isBn?"মোট":"Total"}</th>`
      : `<th>#</th><th>${isBn?"পণ্য":"Description"}</th><th style="text-align:center">${isBn?"পরিমাণ":"Qty"}</th><th style="text-align:right">${isBn?"একক মূল্য":"Unit Price"}</th><th style="text-align:center">${isBn?"ছাড়":"Disc"}</th><th style="text-align:right">${isBn?"মোট":"Total"}</th>`;

  const totalsHTML = isDelivery
    ? `${extraRowsHTML}<div class="grand-row"><span class="gl">${isBn?"মোট Amount":"Total Amount"}</span><span class="gv">${cur} ${siFmt2(grand)}</span></div>`
    : isTax
      ? `<div class="totals-row"><span class="tl">${isBn?"সাব-টোটাল (VAT বাদে)":"Subtotal (Excl. VAT)"}</span><span class="tv">${cur} ${siFmt2(sub)}</span></div>${lineDisc>0?`<div class="totals-row"><span class="tl">${isBn?"ছাড়":"Discount"}</span><span class="tv" style="color:#ef4444">- ${cur} ${siFmt2(lineDisc)}</span></div>`:""}<div class="totals-row" style="background:#fef9c3"><span class="tl" style="color:#92400e;font-weight:700">VAT (${isBn?"মোট":"Total"})</span><span class="tv" style="color:#92400e">+ ${cur} ${siFmt2(vat)}</span></div>${extraRowsHTML}<div class="grand-row"><span class="gl">${isBn?"সর্বমোট (VAT সহ)":"Grand Total (Incl. VAT)"}</span><span class="gv">${cur} ${siFmt2(grand)}</span></div>`
    : `${lineDisc>0?`<div class="totals-row"><span class="tl">${isBn?"ছাড়":"Discount"}</span><span class="tv" style="color:#ef4444">- ${cur} ${siFmt2(lineDisc)}</span></div>`:""}${extraRowsHTML}<div class="grand-row"><span class="gl">${isBn?"সর্বমোট":"Grand Total"}</span><span class="gv">${cur} ${siFmt2(grand)}</span></div>`;

  const custHTML = `<div class="info-box"><div class="info-label">👤 ${isBn?"কাস্টমার":"Customer"}</div><div class="info-value">${invoice.customerName||"—"}</div>${invoice.customerCode?`<div class="info-sub">${isBn?"কোড":"Code"}: ${invoice.customerCode}</div>`:""}${invoice.customerMobile?`<div class="info-sub">📱 ${invoice.customerMobile}</div>`:""} ${invoice.customerAddress?`<div class="info-sub">📍 ${invoice.customerAddress}</div>`:""} ${isTax&&invoice.customerTrn?`<div class="info-sub" style="color:#b45309;font-weight:700;font-size:12px">TRN: ${invoice.customerTrn}</div>`:""}</div>`;

  const payInfoHTML = isQuote
    ? `<div class="info-box"><div class="info-label">📅 ${isSO?(isBn?"ডেলিভারির তারিখ":"Delivery By"):(isBn?"মেয়াদ":"Valid Until")}</div><div class="info-value">${invoice.validUntil||"—"}</div><div class="info-sub">👤 ${invoice.createdByName||""}</div></div>`
    : isDelivery
    ? `<div class="info-box"><div class="info-label">📦 ${isBn?"ডেলিভারি তথ্য":"Delivery Info"}</div><div class="info-value">${invoice.deliveryNoteNo||(invoice.docKind==="delivery"?invoice.invoiceNo:"—")}</div>${invoice.vehicleNo?`<div class="info-sub">🚗 ${invoice.vehicleNo}</div>`:""}<div class="info-sub">👤 ${invoice.createdByName}</div></div>`
    : `<div class="info-box"><div class="info-label">💳 ${isBn?"পেমেন্ট":"Payment"}</div><div class="info-value">${SI_PAY[invoice.paymentMethod]?.icon||""} ${SI_PAY[invoice.paymentMethod]?.[lang]||invoice.paymentMethod}</div><div class="info-sub">${SI_STATUSES[invoice.status]?.[lang]||invoice.status}</div></div>`;

  const deliveryHTML = !isDelivery&&(invoice.deliveryNoteNo||invoice.vehicleNo)
    ? `<div style="display:flex;gap:16px;margin-bottom:14px">${invoice.deliveryNoteNo?`<div class="info-box" style="flex:1"><div class="info-label">🚚 ${isBn?"ডেলিভারি নোট নং":"Delivery Note No."}</div><div class="info-value">${invoice.deliveryNoteNo}</div></div>`:""} ${invoice.vehicleNo?`<div class="info-box" style="flex:1"><div class="info-label">🚗 ${isBn?"গাড়ির নম্বর":"Vehicle No."}</div><div class="info-value">${invoice.vehicleNo}</div></div>`:""}</div>` : "";

  const thermal = ds.paper==="80mm" || ds.paper==="58mm";
  const rawDoc = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} - ${invoice.invoiceNo}</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;700;900&family=Noto+Sans:wght@400;700;900&display=swap" rel="stylesheet">
<style>
@page{size:${paperCss(ds.paper)};margin:${thermal?"3mm":"8mm"}}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Noto Sans Bengali','Noto Sans','Segoe UI',Arial,sans-serif;font-size:13px;color:#111;background:#fff;padding:20px}
.invoice{max-width:820px;margin:0 auto;border:2px solid ${accentBorder};border-radius:${colorPrint?"12px":"4px"};overflow:hidden;box-shadow:${colorPrint?"0 4px 20px rgba(0,0,0,0.12)":"none"}}
.hdr{background:${headerGrad};color:${headerText};padding:18px 22px;display:flex;justify-content:space-between;align-items:flex-start;border-bottom:${colorPrint?"none":"2px solid #dee2e6"}}
.shop-name{font-size:20px;font-weight:900}
.shop-sub{font-size:11px;opacity:${colorPrint?"0.85":"0.7"};margin-top:3px}
.inv-title{font-size:24px;font-weight:900;text-align:right;letter-spacing:2px}
.inv-no{font-size:12px;text-align:right;margin-top:3px;opacity:0.9}
.body{padding:18px 22px}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
.info-box{background:#f9fafb;border-radius:8px;padding:10px 13px;border:1px solid #e5e7eb}
.info-label{font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;font-weight:700;margin-bottom:3px}
.info-value{font-size:14px;font-weight:700;color:#111}
.info-sub{font-size:11px;color:#6b7280;margin-top:2px}
table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:12px}
thead tr{background:${theadBg};color:${theadText}}
th{padding:9px 8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.4px;font-weight:700}
td{padding:8px;border-bottom:1px solid #e5e7eb;vertical-align:top}
tbody tr:nth-child(even){background:#f9fafb}
.totals{display:flex;justify-content:flex-end;margin-bottom:14px}
.totals-box{width:300px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden}
.totals-row{display:flex;justify-content:space-between;padding:8px 13px;border-bottom:1px solid #f3f4f6}
.tl{color:#6b7280;font-size:12px}
.tv{font-weight:700;font-size:12px}
.grand-row{display:flex;justify-content:space-between;padding:11px 13px;background:${grandBg}}
.gl{color:#fff;font-size:13px;font-weight:800}
.gv{color:#fff;font-size:17px;font-weight:900}
.pay-box{background:#f0fdf4;border:1px solid #22c55e;border-radius:8px;padding:9px 13px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center}
.bal-box{background:#fef2f2;border:1px solid #ef4444;border-radius:8px;padding:9px 13px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center}
.note-box{background:#fff7ed;border:1px solid #fdba74;border-radius:8px;padding:9px 13px;margin-bottom:14px;font-size:12px;color:#92400e}
${isDelivery?`.recv-box{background:${colorPrint?"#f3e8ff":"#f8f9fa"};border:2px solid ${colorPrint?"#7c3aed":"#6b7280"};border-radius:8px;padding:14px;margin-bottom:14px}.recv-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;text-align:center}.recv-item{border-top:1.5px solid #9ca3af;margin-top:36px;padding-top:6px;font-size:11px;color:#6b7280}`:""}
.sigs{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:24px;padding-top:14px;border-top:1px dashed #e5e7eb}
.sig-line{border-top:1.5px solid #9ca3af;margin-top:44px;padding-top:6px;font-size:11px;color:#6b7280;text-align:center}
.footer{text-align:center;padding:11px 22px;background:${colorPrint?"#f9fafb":"#f0f0f0"};border-top:2px solid ${accentBorder};font-size:12px;color:${accentBorder};font-weight:700}
@media print{body{padding:0}.no-print{display:none!important}.invoice{border-radius:0;box-shadow:none}}
${thermal?`body{padding:4px;font-size:11px}.invoice{max-width:100%;border-width:1px}.hdr{flex-direction:column;gap:6px;padding:10px}.inv-title,.inv-no{text-align:left}.body{padding:8px}.info-grid{grid-template-columns:1fr;gap:6px}.totals-box{width:100%}table{font-size:10px}th,td{padding:4px 3px}.sigs{display:none}`:""}
${ds.preprinted?`.hdr .shop-block{visibility:hidden}.hdr{min-height:110px}`:""}
</style></head><body>
<div class="no-print" style="text-align:center;margin-bottom:14px">
  <button onclick="window.print()" style="padding:10px 28px;background:${grandBg};color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;margin-right:8px">🖨️ ${isBn?"প্রিন্ট / PDF":"Print / PDF"}</button>
  <button onclick="window.close()" style="padding:10px 20px;background:#e5e7eb;color:#374151;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">${isBn?"বন্ধ করুন":"Close"}</button>
</div>
<div class="invoice"><div class="hdr"><div class="shop-block"><div class="shop-name">🏢 ${shop?.companyName||"Shop"}</div>${shopHeaderExtras(shop).arabic}<div class="shop-sub">${[shop?.area,shop?.countryName].filter(Boolean).join(", ")||""}</div>${shop?.mobile?`<div class="shop-sub">📱 ${shop.mobile}</div>`:""}${shopHeaderExtras(shop).details} ${isTax&&shop?.trnNumber?`<div class="shop-sub" style="font-weight:800;margin-top:3px;color:${colorPrint?"inherit":"#b45309"}">TRN: ${shop.trnNumber}</div>`:""} ${isTax&&shop?.vatNumber?`<div class="shop-sub" style="font-weight:700">VAT: ${shop.vatNumber}</div>`:""}</div><div><div class="inv-title" style="color:${colorPrint?"#fff":accentBorder}">${title}</div><div class="inv-no" style="font-size:14px;font-weight:800;color:${colorPrint?"rgba(255,255,255,0.9)":"#333"}">${invoice.invoiceNo}</div><div class="inv-no" style="color:${colorPrint?"rgba(255,255,255,0.8)":"#555"}">📅 ${invoice.invoiceDate}${timeText?` &nbsp;🕒 ${timeText}`:""}</div>${userNameHTML?`<div class="inv-no" style="color:${colorPrint?"rgba(255,255,255,0.8)":"#555"}">👤 ${userNameHTML}</div>`:""}</div></div>
<div class="body"><div class="info-grid">${custHTML}${payInfoHTML}</div>${metaHTML?`<div style="margin:-4px 0 12px;font-size:12px;color:#374151">${metaHTML}</div>`:""}
${deliveryHTML}<table><thead><tr>${tableHeaders}</tr></thead><tbody>${rows}</tbody></table>
${totalsHTML?`<div class="totals"><div class="totals-box">${totalsHTML}</div></div>`:""}
${vatSummaryHTML}
${!isDelivery&&!isQuote&&invoice.amountPaid>0?`<div class="pay-box"><span style="font-weight:700;color:#15803d">✅ ${isBn?"পরিশোধিত":"Paid"}</span><span style="font-size:17px;font-weight:900;color:#15803d">${cur} ${siFmt2(invoice.amountPaid)}</span></div>`:""}
${!isDelivery&&!isQuote&&balance>0.01?`<div class="bal-box"><span style="font-weight:700;color:#dc2626">⚠️ ${isBn?"বাকি":"Balance Due"}</span><span style="font-size:17px;font-weight:900;color:#dc2626">${cur} ${siFmt2(balance)}</span></div>`:""}
${isDelivery?`<div class="recv-box"><div style="font-size:11px;color:#7c3aed;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:14px">✅ ${isBn?"মোট পণ্য":"Total Items"}: ${(invoice.items||[]).reduce((s,it)=>s+siN2(it.qty),0)} ${isBn?"পিস":"Pcs"} | ${isBn?"মোট লাইন":"Lines"}: ${(invoice.items||[]).length}</div><div class="recv-grid"><div class="recv-item">${isBn?"প্রেরকের স্বাক্ষর":"Sender Signature"}</div><div class="recv-item">${isBn?"ড্রাইভারের স্বাক্ষর":"Driver Signature"}</div><div class="recv-item">${isBn?"গ্রাহকের স্বাক্ষর":"Receiver Signature"}</div></div></div>`:""}
${custBalanceHTML}
${ps.printNarration&&invoice.note?`<div class="note-box">📝 ${invoice.note}</div>`:""}
${!isDelivery?`<div class="sigs"><div><div class="sig-line">${isBn?"অনুমোদনকারী স্বাক্ষর":"Authorized Signature"}</div></div><div><div class="sig-line">${isBn?"গ্রাহক স্বাক্ষর":"Customer Signature"}</div></div></div>`:""}
</div><div class="footer">${isSO?(isBn?"অর্ডারের জন্য ধন্যবাদ! 🙏":"Thank you for your order! 🙏"):isQuote?(isBn?`এই কোটেশন ${invoice.validUntil||""} পর্যন্ত বৈধ। ধন্যবাদ! 🙏`:`This quotation is valid until ${invoice.validUntil||"—"}. Thank you! 🙏`):isDelivery?(isBn?"ডেলিভারি সম্পন্ন হলে এই চালানে স্বাক্ষর করুন 🚚":"Please sign this challan upon delivery 🚚"):(isBn?"ব্যবসার জন্য ধন্যবাদ! 🙏":"Thank you for your business! 🙏")}</div></div></body></html>`;
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
