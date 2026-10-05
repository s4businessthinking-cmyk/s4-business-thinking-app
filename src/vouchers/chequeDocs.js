// Vendor cheque documents: the "Cheque Payment" voucher (A4, room for the
// cheque photocopy underneath) and the cheque handover receipt (receiver's ID
// card and signature, for vendors who never give a receipt).

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const n2 = (v) => Number.parseFloat(v) || 0;
const f2 = (v) => n2(v).toFixed(2);
const fmtDate = (v) => {
  const s = String(v || "").slice(0, 10);
  const [y, m, d] = s.split("-");
  return y && m && d ? `${d}-${m}-${y}` : s;
};

const safeImg = (src) => (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(String(src || "")) ? src : "");

export const chequeAmountOfVoucher = (v) => n2(v?.chequeAmount ?? v?.totalAmount);

// Phone photos are several MB; documents live inside the voucher record, so
// images are scaled down and re-encoded before they are stored.
export function compressImage(file, { maxSide = 1100, quality = 0.62 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file) { resolve(""); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the image"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Unsupported image"));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

const BASE_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
@page{size:A4 portrait;margin:10mm}
body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;background:#fff}
.doc{width:100%;max-width:190mm;margin:0 auto}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:6px}
.shop{font-size:18px;font-weight:900;letter-spacing:.5px}
.sub{font-size:11px;color:#333;margin-top:2px}
.contact{font-size:11px;text-align:right;line-height:1.5}
.title{text-align:center;margin:8px 0 6px;font-size:15px;font-weight:900;text-decoration:underline;letter-spacing:1px}
.row{display:flex;gap:10px;align-items:baseline;margin:5px 0}
.lbl{white-space:nowrap;color:#333}
.val{flex:1;border-bottom:1px dotted #555;font-weight:700;min-height:16px;padding:0 4px}
.right{margin-left:auto;text-align:right}
table{width:100%;border-collapse:collapse;margin-top:8px}
th,td{border:1px solid #333;padding:4px 6px;font-size:11.5px}
th{background:#eee;text-align:left}
td.num,th.num{text-align:right}
.tot td{font-weight:900}
.note{font-size:10.5px;color:#444;margin-top:4px}
.sign{display:flex;justify-content:space-between;gap:20px;margin-top:22px}
.sign div{flex:1;border-top:1px solid #333;padding-top:4px;text-align:center;font-size:11px;color:#333}
@media print{.no-print{display:none!important}}
`;

function header(shop) {
  const addr = [shop?.area, shop?.countryName].filter(Boolean).join(", ");
  return `<div class="hdr">
  <div><div class="shop">${esc(shop?.companyName || "")}</div>${addr ? `<div class="sub">${esc(addr)}</div>` : ""}</div>
  <div class="contact">${shop?.mobile ? `Phone: ${esc(shop.mobile)}<br>` : ""}${shop?.email ? esc(shop.email) : ""}</div>
</div>`;
}

function invoiceTable(voucher, cur) {
  const rows = (voucher.allocations || []).map((a, i) => `<tr>
    <td>${i + 1}</td><td>${esc(a.supplierInvoiceNo || a.invoiceNo || "")}</td><td>${esc(fmtDate(a.invoiceDate))}</td>
    <td class="num">${a.invoiceAmount != null ? f2(a.invoiceAmount) : ""}</td><td class="num">${f2(a.amount)}</td></tr>`).join("");
  const total = n2(voucher.totalAmount);
  const discount = n2(voucher.discountAmount);
  return `<table>
  <thead><tr><th style="width:36px">Sl.</th><th>Invoice No.</th><th>Invoice Date</th><th class="num">Invoice Amount</th><th class="num">Paid Amount</th></tr></thead>
  <tbody>${rows}
    <tr class="tot"><td colspan="4" class="num">Total (${esc(cur)})</td><td class="num">${f2(total)}</td></tr>
    ${discount > 0 ? `<tr><td colspan="4" class="num">Less: Discount</td><td class="num">${f2(discount)}</td></tr>
    <tr class="tot"><td colspan="4" class="num">Cheque Amount (${esc(cur)})</td><td class="num">${f2(chequeAmountOfVoucher(voucher))}</td></tr>` : ""}
  </tbody></table>`;
}

function chequeLines(voucher, cur, amountWords) {
  return `
<div class="row"><span class="lbl">Paid to</span><span class="val">${esc(voucher.vendorName)}</span>
  <span class="lbl right">Voucher No:</span><span class="val" style="flex:0 0 90px">${esc(voucher.paymentNo)}</span></div>
<div class="row"><span class="lbl">A sum of ${esc(cur)}</span><span class="val">${f2(chequeAmountOfVoucher(voucher))}</span>
  <span class="lbl right">Voucher Date:</span><span class="val" style="flex:0 0 90px">${esc(fmtDate(voucher.paymentDate))}</span></div>
<div class="row"><span class="lbl">In words</span><span class="val">${esc(amountWords || "")}</span></div>
<div class="row"><span class="lbl">Cheque No:</span><span class="val">${esc(voucher.chequeNo)}</span>
  <span class="lbl">Cheque Date:</span><span class="val">${esc(fmtDate(voucher.chequeDate))}</span>
  <span class="lbl">Bank:</span><span class="val">${esc(voucher.chequeBank)}</span></div>
${voucher.vendorReceiptNo ? `<div class="row"><span class="lbl">Vendor Receipt No:</span><span class="val">${esc(voucher.vendorReceiptNo)}</span></div>` : ""}
${voucher.note ? `<div class="row"><span class="lbl">Narration:</span><span class="val">${esc(voucher.note)}</span></div>` : ""}`;
}

export function chequeVoucherHtml(voucher, shop, { cur = "AED", amountWords = "" } = {}) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Cheque Payment - ${esc(voucher.paymentNo)}</title><style>${BASE_CSS}
.attach{margin-top:14px;height:95mm;border:1.5px dashed #888;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#999;font-size:13px;letter-spacing:1px}
</style></head><body><div class="doc">
${header(shop)}
<div class="title">CHEQUE PAYMENT</div>
${chequeLines(voucher, cur, amountWords)}
<div class="note">as a payment towards the following invoices:</div>
${invoiceTable(voucher, cur)}
<div class="sign"><div>Prepared by</div><div>Received by${voucher.chequeReceivedBy ? `: ${esc(voucher.chequeReceivedBy)}` : ""}</div><div>Signature &amp; Date</div></div>
<div class="attach">ATTACH CHEQUE COPY HERE</div>
</div></body></html>`;
}

export function chequeHandoverHtml(voucher, shop, handover = {}, { cur = "AED", amountWords = "" } = {}) {
  const idFront = safeImg(handover.idFront), idBack = safeImg(handover.idBack);
  const signature = safeImg(handover.signature), signedPaper = safeImg(handover.signedPaper);
  const img = (src, label) => src
    ? `<div class="idbox"><img src="${src}" alt=""><span>${label}</span></div>`
    : `<div class="idbox empty"><span>${label}</span></div>`;
  const receivedAt = handover.receivedAt ? fmtDate(handover.receivedAt) : "";
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Cheque Handover - ${esc(voucher.paymentNo)}</title><style>${BASE_CSS}
.ids{display:flex;gap:10mm;margin-top:10px}
.idbox{flex:1;height:58mm;border:1px solid #999;border-radius:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;position:relative}
.idbox img{max-width:100%;max-height:52mm;object-fit:contain}
.idbox span{font-size:10px;color:#666;margin-top:2px}
.idbox.empty{border-style:dashed}
.decl{margin-top:12px;font-size:12px;line-height:1.6}
.sigbox{margin-top:10px;display:flex;justify-content:space-between;align-items:flex-end;gap:20px}
.sigimg{height:30mm;min-width:70mm;border-bottom:1px solid #333;display:flex;align-items:flex-end;justify-content:center}
.sigimg img{max-height:28mm;max-width:80mm}
.paper{page-break-before:always}
.paper img{display:block;max-width:100%;max-height:260mm;margin:4mm auto 0;object-fit:contain}
</style></head><body><div class="doc">
${header(shop)}
<div class="title">CHEQUE HANDOVER RECEIPT</div>
${chequeLines(voucher, cur, amountWords)}
${invoiceTable(voucher, cur)}
<div class="decl">I, <b>${esc(handover.receiverName || voucher.chequeReceivedBy || "______________________")}</b>, have received the above cheque
on behalf of <b>${esc(voucher.vendorName)}</b>${receivedAt ? ` on <b>${esc(receivedAt)}</b>` : ""}.</div>
<div class="ids">${img(idFront, "ID card — front")}${img(idBack, "ID card — back")}</div>
<div class="sigbox">
  <div><div class="sigimg">${signature ? `<img src="${signature}" alt="">` : ""}</div><div style="text-align:center;font-size:11px;margin-top:3px">Receiver's signature</div></div>
  <div><div class="sigimg"></div><div style="text-align:center;font-size:11px;margin-top:3px">Issued by</div></div>
</div>
${signedPaper ? `<div class="paper"><div class="note">Signed copy:</div><img src="${signedPaper}" alt=""></div>` : ""}
</div></body></html>`;
}
