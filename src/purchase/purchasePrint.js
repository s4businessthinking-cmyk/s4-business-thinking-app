import { loadPrintDesign, applyDesign, shopHeaderExtras } from "../print/printDesign.js";
import { printWithSettings } from "../print/printSettings.js";
import { piFmt2, piN2 } from "../shared/appShared.jsx";
import { paginateInvoiceItems } from "../sales-invoice/salesInvoiceShared.js";
import { PI_PAY_METHODS } from "./purchaseShared.js";

// ─── PURCHASE INVOICE (vendor bill) — PRINTABLE HTML, same look as the Sales Invoice, full-page A4 ───
export function generatePurchaseInvoiceHTML(invoice, shop, lang, opts = {}) {
  const isBn = lang === "bn";
  const cur = invoice.currency || "AED";
  const items = invoice.items || [];
  const sub = piN2(invoice.subtotal), disc = piN2(invoice.totalDiscount), tax = piN2(invoice.totalTax), grand = piN2(invoice.grandTotal);
  const paid = piN2(invoice.amountPaid), bal = piN2(invoice.balanceDue);
  const title = isBn ? "ক্রয় ইনভয়েস" : "PURCHASE INVOICE";
  const hasTax = items.some((it) => piN2(it.taxPerc) > 0);

  const accentBorder = "#111";
  const headerGrad = "#fff";
  const headerText = "#111";
  const theadBg = "#fff";
  const theadText = "#111";
  const grandBg = "#111";

  const renderRow = (it, i) => {
    const codeHtml = (it.code || it.brand)
      ? ` <span style="font-size:9px;font-weight:400">(${[it.code, it.brand].filter(Boolean).join(" · ")})</span>`
      : "";
    const discHtml = piN2(it.discountPerc) > 0 ? `${it.discountPerc}%` : piN2(it.discountAmt) > 0 ? piFmt2(it.discountAmt) : "—";
    return hasTax
      ? `<tr><td style="text-align:center">${i + 1}</td><td><strong>${it.name || ""}</strong>${codeHtml}</td><td style="text-align:center">${it.qty} ${it.unit}</td><td style="text-align:right">${cur} ${piFmt2(it.unitCost)}</td><td style="text-align:center">${discHtml}</td><td style="text-align:center">${it.taxPerc || 0}%</td><td style="text-align:right"><strong>${cur} ${piFmt2(it.lineTotal)}</strong></td></tr>`
      : `<tr><td style="text-align:center">${i + 1}</td><td><strong>${it.name || ""}</strong>${codeHtml}</td><td style="text-align:center">${it.qty} ${it.unit}</td><td style="text-align:right">${cur} ${piFmt2(it.unitCost)}</td><td style="text-align:center">${discHtml}</td><td style="text-align:right"><strong>${cur} ${piFmt2(it.lineTotal)}</strong></td></tr>`;
  };

  const tableHeaders = hasTax
    ? `<th>#</th><th>${isBn ? "পণ্য" : "Description"}</th><th style="text-align:center">${isBn ? "পরিমাণ" : "Qty"}</th><th style="text-align:right">${isBn ? "একক মূল্য" : "Unit Cost"}</th><th style="text-align:center">${isBn ? "ছাড়" : "Disc"}</th><th style="text-align:center">Tax%</th><th style="text-align:right">${isBn ? "মোট" : "Total"}</th>`
    : `<th>#</th><th>${isBn ? "পণ্য" : "Description"}</th><th style="text-align:center">${isBn ? "পরিমাণ" : "Qty"}</th><th style="text-align:right">${isBn ? "একক মূল্য" : "Unit Cost"}</th><th style="text-align:center">${isBn ? "ছাড়" : "Disc"}</th><th style="text-align:right">${isBn ? "মোট" : "Total"}</th>`;

  const infoLine = (label, value) => `<div class="info-sub">${label}: <b>${value || "—"}</b></div>`;
  const metaHTML = [
    infoLine(isBn ? "এন্ট্রি তারিখ" : "Entry Date", invoice.entryDate || (invoice.createdAt ? String(invoice.createdAt).slice(0, 10) : "")),
    infoLine(isBn ? "সাপ্লায়ার Inv No" : "Supplier Inv No", invoice.supplierInvoiceNo),
    infoLine("Ref", invoice.refNo),
    infoLine(isBn ? "পারচেজ অর্ডার" : "Purchase Order", invoice.purchaseOrderNo),
    infoLine(isBn ? "মাল গ্রহণ (DN)" : "Goods Received (DN)", (invoice.goodsReceiptNos||[]).length>1 ? invoice.goodsReceiptNos.join(", ") : invoice.goodsReceiptNo),
  ].join("");

  const amountOptionsHTML = `
    <div class="totals-row"><span class="tl">${isBn ? "সাব-টোটাল" : "Subtotal"}</span><span class="tv">${cur} ${piFmt2(sub)}</span></div>
    <div class="totals-row"><span class="tl">${isBn ? "ছাড়" : "Discount"}</span><span class="tv">- ${cur} ${piFmt2(disc)}</span></div>
    <div class="totals-row"><span class="tl">Tax</span><span class="tv">+ ${cur} ${piFmt2(tax)}</span></div>
  `;
  const paidBalHTML = `<div class="totals-row"><span class="tl">${isBn ? "পরিশোধিত" : "Paid"}</span><span class="tv">${cur} ${piFmt2(paid)}</span></div><div class="totals-row"><span class="tl">${isBn ? "বাকি" : "Balance Due"}</span><span class="tv">${cur} ${piFmt2(Math.max(0, bal))}</span></div>`;

  const custHTML = `<div class="info-box"><div class="info-label">${isBn ? "সাপ্লায়ার" : "Supplier"}</div><div class="info-value">${invoice.vendorName || "—"}</div>${infoLine(isBn ? "মোবাইল" : "Mobile", invoice.vendorMobile)}${infoLine(isBn ? "ঠিকানা" : "Address", invoice.vendorAddress)}${infoLine("TRN", invoice.vendorTrn)}</div>`;
  const payInfoHTML = `<div class="info-box"><div class="info-label">${isBn ? "পেমেন্ট" : "Payment"}</div><div class="info-value">${PI_PAY_METHODS[invoice.paymentMethod]?.[lang] || invoice.paymentMethod || "—"}</div>${metaHTML}</div>`;

  const design = opts.design || loadPrintDesign();
  const pages = paginateInvoiceItems(items, 14, 22);
  const multi = pages.length > 1;

  const hdrHTML = (pageNo, pageCount) => `<div class="sheet-top"><div class="hdr"><div class="shop-block"><div class="shop-name">${shop?.companyName || "Shop"}</div>${shopHeaderExtras(shop).arabic}<div class="shop-sub">${[shop?.area, shop?.countryName].filter(Boolean).join(", ") || ""}</div>${shop?.mobile ? `<div class="shop-sub">${shop.mobile}</div>` : ""}${shopHeaderExtras(shop).details}${shop?.trnNumber ? `<div class="shop-sub" style="font-weight:800;margin-top:3px">TRN: ${shop.trnNumber}</div>` : ""}</div><div><div class="inv-title">${title}</div><div class="inv-no" style="font-size:14px;font-weight:800">${invoice.invoiceNo}</div><div class="inv-no">${invoice.invoiceDate || ""}</div>${invoice.createdByName ? `<div class="inv-no">${invoice.createdByName}</div>` : ""}${pageCount > 1 ? `<div class="inv-no">${isBn ? "পৃষ্ঠা" : "Page"} ${pageNo}/${pageCount}</div>` : ""}</div></div>
<div class="body"><div class="info-grid">${custHTML}${payInfoHTML}</div></div></div>`;

  const continuedBot = (pageNo, pageCount) => `<div class="sheet-bot"><div class="body">
<div class="totals"><div class="totals-box">${amountOptionsHTML}<div class="totals-row"><span class="tl">${isBn ? "সর্বমোট" : "Grand Total"}</span><span class="tv">${isBn ? "পরের পেজ" : "Next page"}</span></div></div></div>
<div class="cont-note">${isBn ? `চলবে… পৃষ্ঠা ${pageNo}/${pageCount}` : `Continued… Page ${pageNo}/${pageCount}`}</div>
</div></div>`;

  const finalBot = () => `<div class="sheet-bot"><div class="body">
<div class="totals"><div class="totals-box">${amountOptionsHTML}<div class="grand-row"><span class="gl">${isBn ? "সর্বমোট" : "Grand Total"}</span><span class="gv">${cur} ${piFmt2(grand)}</span></div>${paidBalHTML}</div></div>
${invoice.note ? `<div class="note-box">${invoice.note}</div>` : ""}
<div class="footer">${isBn ? "ব্যবসার জন্য ধন্যবাদ।" : "Thank you for your business."}</div>
<div class="sigs"><div><div class="sig-line">${isBn ? "সাপ্লায়ারের স্বাক্ষর" : "Supplier Signature"}</div></div><div><div class="sig-line">${isBn ? "গ্রহণকারীর স্বাক্ষর" : "Received By Signature"}</div></div></div>
</div></div>`;

  let rowOffset = 0;
  const sheets = pages.map((chunk, idx) => {
    const isLast = idx === pages.length - 1;
    const rowsHtml = chunk.map((it, j) => renderRow(it, rowOffset + j)).join("");
    rowOffset += chunk.length;
    return `<div class="invoice${multi ? " paged" : ""}">
${hdrHTML(idx + 1, pages.length)}
<div class="sheet-mid"><table class="items"><thead><tr>${tableHeaders}</tr></thead><tbody>${rowsHtml}</tbody></table></div>
${isLast ? finalBot() : continuedBot(idx + 1, pages.length)}
</div>`;
  }).join("");

  const rawDoc = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} - ${invoice.invoiceNo}</title>
<style>
@page{size:A4;margin:8mm}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Times New Roman','Nirmala UI',serif;font-size:12px;color:#111;background:#fff;padding:16px}
.invoice{max-width:210mm;margin:0 auto;border:1.5px solid ${accentBorder};background:#fff;display:flex;flex-direction:column;min-height:0}
.sheet-top{flex:0 0 auto}
.sheet-mid{flex:0 1 auto;display:flex;flex-direction:column;min-height:0}
.sheet-bot{flex:0 0 auto;margin-top:0}
.hdr{background:${headerGrad};color:${headerText};padding:8px 12px;display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1.5px solid ${accentBorder}}
.shop-name{font-size:18px;font-weight:900}
.shop-sub{font-size:11px;margin-top:2px}
.inv-title{font-size:15px;font-weight:900;text-align:right;letter-spacing:1px;border:1px solid #111;padding:3px 8px;display:inline-block}
.inv-no{font-size:12px;text-align:right;margin-top:3px}
.body{padding:6px 12px}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #111;align-items:stretch}
.info-box{background:#fff;padding:6px 10px;border:none;border-right:1px solid #111;min-height:${multi ? "24mm" : "32mm"}}
.info-box:last-child{border-right:none}
.info-label{font-size:10px;text-transform:uppercase;letter-spacing:0.4px;color:#111;font-weight:700;margin-bottom:2px}
.info-value{font-size:13px;font-weight:700;color:#111}
.info-sub{font-size:11px;color:#111;margin-top:2px}
table.items{width:100%;border-collapse:collapse;margin:0;font-size:11px;height:auto}
table.items th,table.items td{border:1px solid #111;padding:3px 5px;vertical-align:top}
thead tr{background:${theadBg};color:${theadText}}
th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.3px;font-weight:700}
.totals{display:flex;justify-content:flex-end;margin:6px 0}
.totals-box{width:280px;border:1px solid #111}
.totals-row{display:flex;justify-content:space-between;padding:4px 10px;border-bottom:1px solid #111}
.tl,.tv{color:#111;font-size:11px}.tv{font-weight:700}
.grand-row{display:flex;justify-content:space-between;padding:7px 10px;background:#fff;border-top:2px solid #111}
.gl,.gv{color:#111;font-weight:800}.gv{font-size:15px;font-weight:900}
.pay-box,.bal-box,.note-box{background:#fff;border:1px solid #111;padding:6px 10px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center}
.note-box{display:block;font-size:11px}
.cont-note{text-align:center;padding:4px 12px;border-top:1px dashed #111;font-size:11px;font-weight:700}
.sigs{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:6px;padding:4px 8px 10px}
.sig-line{border-top:1px solid #111;margin-top:22px;padding-top:4px;font-size:11px;text-align:center}
.footer{text-align:left;padding:6px 12px;background:#fff;border-top:1px solid #111;font-size:11px;color:#111;font-weight:600}
@media print{body{padding:0!important}.no-print{display:none!important}.invoice{max-width:100%!important;min-height:0!important;display:flex!important;flex-direction:column!important}thead{display:table-header-group}}
</style></head><body>
<div class="no-print" style="text-align:center;margin-bottom:14px">
  <button onclick="window.print()" style="padding:10px 28px;background:${grandBg};color:#fff;border:none;font-size:14px;font-weight:700;cursor:pointer;margin-right:8px">${isBn ? "প্রিন্ট / PDF" : "Print / PDF"}</button>
  <button onclick="window.close()" style="padding:10px 20px;background:#e5e7eb;color:#374151;border:none;font-size:14px;font-weight:700;cursor:pointer">${isBn ? "বন্ধ করুন" : "Close"}</button>
</div>
${sheets}
</body></html>`;

  return applyDesign(rawDoc, "invoice", opts.style || design.style.invoice);
}

export function printPurchaseInvoice(invoice, shop, lang) {
  printWithSettings(generatePurchaseInvoiceHTML(invoice, shop, lang), { lang });
}
