import { loadPrintDesign, applyDesign, shopHeaderExtras } from "../print/printDesign.js";
import { paperHeightMm, printWithSettings } from "../print/printSettings.js";
import { piFmt2, piN2 } from "../shared/appShared.jsx";
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

  const accentBorder = "#1d4ed8";
  const headerGrad = "linear-gradient(135deg,#1d4ed8,#1e40af)";
  const headerText = "#ffffff";
  const theadBg = "#1f2937";
  const theadText = "#ffffff";
  const grandBg = accentBorder;

  const rows = items.map((it, i) => {
    const codeHtml = (it.code || it.brand) ? `<br><span style="font-size:10px;color:#6b7280">${[it.code && `📋 ${it.code}`, it.brand && `🏷️ ${it.brand}`].filter(Boolean).join("  ")}</span>` : "";
    const discHtml = piN2(it.discountPerc) > 0 ? `${it.discountPerc}%` : piN2(it.discountAmt) > 0 ? piFmt2(it.discountAmt) : "—";
    return hasTax
      ? `<tr><td style="text-align:center">${i + 1}</td><td><strong>${it.name || ""}</strong>${codeHtml}</td><td style="text-align:center">${it.qty} ${it.unit}</td><td style="text-align:right">${cur} ${piFmt2(it.unitCost)}</td><td style="text-align:center">${discHtml}</td><td style="text-align:center">${it.taxPerc || 0}%</td><td style="text-align:right"><strong>${cur} ${piFmt2(it.lineTotal)}</strong></td></tr>`
      : `<tr><td style="text-align:center">${i + 1}</td><td><strong>${it.name || ""}</strong>${codeHtml}</td><td style="text-align:center">${it.qty} ${it.unit}</td><td style="text-align:right">${cur} ${piFmt2(it.unitCost)}</td><td style="text-align:center">${discHtml}</td><td style="text-align:right"><strong>${cur} ${piFmt2(it.lineTotal)}</strong></td></tr>`;
  }).join("");

  const tableHeaders = hasTax
    ? `<th>#</th><th>${isBn ? "পণ্য" : "Description"}</th><th style="text-align:center">${isBn ? "পরিমাণ" : "Qty"}</th><th style="text-align:right">${isBn ? "একক মূল্য" : "Unit Cost"}</th><th style="text-align:center">${isBn ? "ছাড়" : "Disc"}</th><th style="text-align:center">Tax%</th><th style="text-align:right">${isBn ? "মোট" : "Total"}</th>`
    : `<th>#</th><th>${isBn ? "পণ্য" : "Description"}</th><th style="text-align:center">${isBn ? "পরিমাণ" : "Qty"}</th><th style="text-align:right">${isBn ? "একক মূল্য" : "Unit Cost"}</th><th style="text-align:center">${isBn ? "ছাড়" : "Disc"}</th><th style="text-align:right">${isBn ? "মোট" : "Total"}</th>`;

  const metaRows = [
    (invoice.entryDate || invoice.createdAt) ? [isBn ? "এন্ট্রি তারিখ" : "Entry Date", invoice.entryDate || String(invoice.createdAt).slice(0, 10)] : null,
    invoice.supplierInvoiceNo ? [isBn ? "সাপ্লায়ার Inv No" : "Supplier Inv No", invoice.supplierInvoiceNo] : null,
    invoice.refNo ? ["Ref", invoice.refNo] : null,
    invoice.purchaseOrderNo ? [isBn ? "পারচেজ অর্ডার" : "Purchase Order", invoice.purchaseOrderNo] : null,
    invoice.goodsReceiptNo ? [isBn ? "মাল গ্রহণ (DN)" : "Goods Received (DN)", (invoice.goodsReceiptNos||[]).length>1 ? invoice.goodsReceiptNos.join(", ") : invoice.goodsReceiptNo] : null,
    invoice.currency ? [isBn ? "মুদ্রা" : "Currency", `${invoice.currency} ${piFmt2(invoice.fcGrandTotal)} @ ${invoice.exchangeRate}`] : null,
  ].filter(Boolean);
  const metaHTML = metaRows.map(([l, v]) => `<div class="info-sub">${l}: <b>${v}</b></div>`).join("");

  const totalsHTML = `
    <div class="totals-row"><span class="tl">${isBn ? "সাব-টোটাল" : "Subtotal"}</span><span class="tv">${cur} ${piFmt2(sub)}</span></div>
    ${disc > 0 ? `<div class="totals-row"><span class="tl">${isBn ? "ছাড়" : "Discount"}</span><span class="tv" style="color:#ef4444">- ${cur} ${piFmt2(disc)}</span></div>` : ""}
    ${tax > 0 ? `<div class="totals-row" style="background:#fef9c3"><span class="tl" style="color:#92400e;font-weight:700">Tax</span><span class="tv" style="color:#92400e">+ ${cur} ${piFmt2(tax)}</span></div>` : ""}
  `;

  const custHTML = `<div class="info-box"><div class="info-label">🏭 ${isBn ? "সাপ্লায়ার" : "Supplier"}</div><div class="info-value">${invoice.vendorName || "—"}</div>${invoice.vendorMobile ? `<div class="info-sub">📱 ${invoice.vendorMobile}</div>` : ""}${invoice.vendorAddress ? `<div class="info-sub">📍 ${invoice.vendorAddress}</div>` : ""}${invoice.vendorTrn ? `<div class="info-sub" style="color:#b45309;font-weight:700;font-size:12px">TRN: ${invoice.vendorTrn}</div>` : ""}</div>`;
  const payInfoHTML = `<div class="info-box"><div class="info-label">💳 ${isBn ? "পেমেন্ট" : "Payment"}</div><div class="info-value">${PI_PAY_METHODS[invoice.paymentMethod]?.icon || ""} ${PI_PAY_METHODS[invoice.paymentMethod]?.[lang] || invoice.paymentMethod || ""}</div>${metaHTML}</div>`;

  const design = opts.design || loadPrintDesign();
  // Full-page A4: the invoice box becomes a table at least one page tall, items row takes the free
  // space, so totals/signatures/footer sit at the bottom even with one item (same trick as Sales Invoice).
  const pageH = paperHeightMm("A4");
  const fpRow = `<div class="fp-r">`, fpGrow = `<div class="fp-r fp-grow">`, fpEnd = `</div>`;

  const rawDoc = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} - ${invoice.invoiceNo}</title>
<style>
@page{size:A4;margin:8mm}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI','Nirmala UI',Arial,sans-serif;font-size:13px;color:#111;background:#fff;padding:20px}
.invoice{max-width:820px;margin:0 auto;border:2px solid ${accentBorder};border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.12)}
.hdr{background:${headerGrad};color:${headerText};padding:18px 22px;display:flex;justify-content:space-between;align-items:flex-start}
.shop-name{font-size:20px;font-weight:900}
.shop-sub{font-size:11px;opacity:0.85;margin-top:3px}
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
.sigs{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:24px;padding-top:14px;border-top:1px dashed #e5e7eb}
.sig-line{border-top:1.5px solid #9ca3af;margin-top:44px;padding-top:6px;font-size:11px;color:#6b7280;text-align:center}
.footer{text-align:center;padding:11px 22px;background:#f9fafb;border-top:2px solid ${accentBorder};font-size:12px;color:${accentBorder};font-weight:700}
@media print{body{padding:0}.no-print{display:none!important}.invoice{border-radius:0;box-shadow:none}}
.fp-grow .body{padding-bottom:0}.fp-tail{padding-top:0}@media print{.invoice{display:table;width:100%;height:${pageH - 17}mm;margin-top:0!important}.fp-r{display:table-row}.fp-grow{height:100%}}
</style></head><body>
<div class="no-print" style="text-align:center;margin-bottom:14px">
  <button onclick="window.print()" style="padding:10px 28px;background:${grandBg};color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;margin-right:8px">🖨️ ${isBn ? "প্রিন্ট / PDF" : "Print / PDF"}</button>
  <button onclick="window.close()" style="padding:10px 20px;background:#e5e7eb;color:#374151;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">${isBn ? "বন্ধ করুন" : "Close"}</button>
</div>
<div class="invoice">${fpRow}<div class="hdr"><div class="shop-block"><div class="shop-name">🏢 ${shop?.companyName || "Shop"}</div>${shopHeaderExtras(shop).arabic}<div class="shop-sub">${[shop?.area, shop?.countryName].filter(Boolean).join(", ") || ""}</div>${shop?.mobile ? `<div class="shop-sub">📱 ${shop.mobile}</div>` : ""}${shopHeaderExtras(shop).details}${shop?.trnNumber ? `<div class="shop-sub" style="font-weight:800;margin-top:3px">TRN: ${shop.trnNumber}</div>` : ""}</div><div><div class="inv-title">${title}</div><div class="inv-no" style="font-size:14px;font-weight:800">${invoice.invoiceNo}</div><div class="inv-no">📅 ${invoice.invoiceDate || ""}</div>${invoice.createdByName ? `<div class="inv-no">👤 ${invoice.createdByName}</div>` : ""}</div></div>${fpEnd}
${fpGrow}<div class="body"><div class="info-grid">${custHTML}${payInfoHTML}</div>
<table><thead><tr>${tableHeaders}</tr></thead><tbody>${rows}</tbody></table></div>${fpEnd}${fpRow}<div class="body fp-tail">
<div class="totals"><div class="totals-box">${totalsHTML}<div class="grand-row"><span class="gl">${isBn ? "সর্বমোট" : "Grand Total"}</span><span class="gv">${cur} ${piFmt2(grand)}</span></div></div></div>
${paid > 0 ? `<div class="pay-box"><span style="font-weight:700;color:#15803d">✅ ${isBn ? "পরিশোধিত" : "Paid"}</span><span style="font-size:17px;font-weight:900;color:#15803d">${cur} ${piFmt2(paid)}</span></div>` : ""}
${bal > 0.01 ? `<div class="bal-box"><span style="font-weight:700;color:#dc2626">⚠️ ${isBn ? "বাকি" : "Balance Due"}</span><span style="font-size:17px;font-weight:900;color:#dc2626">${cur} ${piFmt2(bal)}</span></div>` : ""}
${invoice.note ? `<div class="note-box">📝 ${invoice.note}</div>` : ""}
<div class="sigs"><div><div class="sig-line">${isBn ? "সাপ্লায়ারের স্বাক্ষর" : "Supplier Signature"}</div></div><div><div class="sig-line">${isBn ? "গ্রহণকারীর স্বাক্ষর" : "Received By Signature"}</div></div></div>
</div>${fpEnd}${fpRow}<div class="footer">${isBn ? "ব্যবসার জন্য ধন্যবাদ! 🙏" : "Thank you for your business! 🙏"}</div>${fpEnd}</div></body></html>`;

  return applyDesign(rawDoc, "invoice", opts.style || design.style.invoice);
}

export function printPurchaseInvoice(invoice, shop, lang) {
  printWithSettings(generatePurchaseInvoiceHTML(invoice, shop, lang), { lang });
}
