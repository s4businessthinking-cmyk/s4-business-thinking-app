// A4 "Security Cheque Handover / Receipt Acknowledgement" — matches the layout of
// Security_Cheque_Handover_Receipt_A4.pdf exactly, filled in with the record's data.
// Printed via the app's normal print pipeline (printWithSettings), same as every
// other voucher/list print in this app.
import { printWithSettings } from "../print/printSettings.js";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const money = (v, cur) => `${esc(cur)} ${(Math.round((parseFloat(v) || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const box = (on) => (on ? "☑" : "☐"); // ☑ / ☐

const CONDITIONS = {
  bn: [
    "চেকটি উল্লিখিত ব্যবসা / ক্রেডিট শর্তের জামানত হিসেবে রেকর্ড করা হচ্ছে; লিখিতভাবে সম্মত না হলে এটি সাধারণ পেমেন্ট নয়।",
    "গ্রহণকারী প্রতিনিধি চেকের বিবরণ ও সংযুক্ত ডকুমেন্টের কপি স্বীকার করছেন; চেকটি নিরাপদে রাখতে হবে এবং অনুমোদনহীন কোনো পক্ষকে হস্তান্তর করা যাবে না।",
    "হিসাব মিলে যাওয়ার পর এবং জামানতের আর প্রয়োজন না থাকলে, উভয় পক্ষ মূল চেক ফেরত দেওয়ার ব্যবস্থা করবে এবং একটি ফেরত-স্বীকৃতিতে সই করবে, লিখিত চুক্তি ও প্রযোজ্য আইন সাপেক্ষে।",
    "যেকোনো ব্যবহার বা উপস্থাপন লিখিত চুক্তি ও প্রযোজ্য আইন অনুসারে হতে হবে। সই করার আগে সঠিক শর্ত নিয়ে আইনি পরামর্শ নিন।",
  ],
  en: [
    "The cheque is recorded as security for the stated business / credit terms and is not an ordinary payment unless agreed in writing.",
    "The receiving representative acknowledges the cheque details and attached document copies; the cheque must be kept securely and not transferred to an unauthorised party.",
    "Once the account is reconciled and the security is no longer required, the parties should arrange return of the original cheque and sign a return acknowledgement, subject to the written agreement and applicable law.",
    "Any use or presentation must follow the written agreement and applicable law. Obtain legal advice on the exact terms before signing.",
  ],
};

export function buildSecurityChequeReceiptHTML(record, shop, lang = "en", cur = "AED", docs = {}) {
  const bn = lang === "bn";
  const give = record.direction === "give";
  const title = bn ? "সিকিউরিটি চেক হস্তান্তর / গ্রহণ স্বীকৃতি" : "SECURITY CHEQUE HANDOVER / RECEIPT ACKNOWLEDGEMENT";
  const conditions = CONDITIONS[bn ? "bn" : "en"];
  const dash = "________________________";
  const row2 = (l1, v1, l2, v2) => `<tr><th>${esc(l1)}</th><td>${esc(v1 || dash)}</td><th>${esc(l2)}</th><td>${l2 ? esc(v2 || dash) : ""}</td></tr>`;
  // A captured photo or PDF fills the box (scaled to fit, never stretching it); otherwise show the placeholder text.
  const photoBox = (src, placeholder) => {
    if (!src) return placeholder;
    return String(src).startsWith("data:application/pdf") ? `<embed src="${esc(src)}" type="application/pdf" />` : `<img src="${esc(src)}" alt="" />`;
  };

  return `<!doctype html><html lang="${bn ? "bn" : "en"}"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
@page{size:A4 portrait;margin:10mm}
body{font-family:"Segoe UI",Arial,sans-serif;font-size:11px;color:#111;margin:0}
.wrap{max-width:190mm;margin:auto}
h2{text-align:center;font-size:15px;margin:0 0 8px}
.meta{font-size:10.5px;margin-bottom:6px}
.partyline{border:1px solid #444;padding:6px 8px;margin:6px 0;font-size:10.5px}
.typeline{border:1px solid #444;border-top:0;padding:6px 8px;margin:0 0 6px;font-size:10.5px;display:flex;gap:18px;flex-wrap:wrap}
.topboxes{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:6px 0}
.topbox{border:1.5px solid #222;padding:4px 8px;min-height:12mm}
.topbox b{display:block;font-size:8px;text-transform:uppercase;margin-bottom:3px}
.topbox span{font-size:13px;font-weight:bold}
table.detail{width:100%;border-collapse:collapse;margin:5px 0}
table.detail th,table.detail td{border:1px solid #555;padding:4px 6px;text-align:left;font-size:10.5px}
table.detail th{width:16%;background:#f1f5f9}
table.detail td{width:34%}
.chequearea{border:1.5px dashed #333;width:100%;height:55mm;display:flex;align-items:center;justify-content:center;text-align:center;margin:5px 0;font-size:11px;color:#555;overflow:hidden;padding:0}
.chequearea img,.chequearea embed{width:100%;height:100%;object-fit:cover;display:block}
.idrow{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:5px 0}
.idbox{width:100%;aspect-ratio:85.6 / 54;max-height:54mm;border:1.5px dashed #333;display:flex;align-items:center;justify-content:center;text-align:center;font-size:10px;color:#555;overflow:hidden;padding:0}
.idbox img,.idbox embed{width:100%;height:100%;object-fit:cover;display:block}
.conditions{font-size:9.5px;line-height:1.3;margin:5px 0}
.conditions ol{margin:3px 0 3px 18px;padding:0}
.siggrid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:8px}
.sig{border-top:1px solid #333;padding-top:4px;font-size:9.5px}
.footnote{font-size:8.5px;margin-top:8px;color:#444}
</style></head><body><div class="wrap">
<h2>${esc(title)}</h2>
<div class="meta">${bn ? "রেফারেন্স" : "Reference"}: <b>${esc(record.id)}</b> &nbsp;&nbsp;&nbsp; ${bn ? "তারিখ" : "Date"}: <b>${esc(new Date().toISOString().slice(0, 10).split("-").reverse().join("/"))}</b></div>
<div class="partyline"><b>${bn ? "পার্টি / কোম্পানির নাম" : "PARTY / COMPANY NAME"}:</b> ${esc(record.party || dash)}</div>
<div class="typeline">
<span><b>${bn ? "পার্টির ধরন" : "PARTY TYPE"}:</b> ${box(record.partyType === "vendor")} ${bn ? "ভেন্ডর" : "Vendor"} &nbsp; ${box(record.partyType === "customer")} ${bn ? "কাস্টমার" : "Customer"}</span>
<span><b>${bn ? "চেকের দিক" : "CHEQUE DIRECTION"}:</b> ${box(give)} ${bn ? "আমরা দিচ্ছি" : "We give cheque"} &nbsp; ${box(!give)} ${bn ? "আমরা নিচ্ছি" : "We receive cheque"}</span>
</div>
<div class="topboxes">
<div class="topbox"><b>${bn ? "চেক নম্বর" : "CHEQUE NUMBER"}</b><span>${esc(record.chequeNo || dash)}</span></div>
<div class="topbox"><b>${bn ? "চেকের পরিমাণ" : "CHEQUE AMOUNT"} (${esc(cur)})</b><span>${money(record.amount, cur)}</span></div>
</div>
<table class="detail">
${row2(bn ? "ব্যাংক" : "Bank", record.bank, bn ? "হস্তান্তর / গ্রহণের তারিখ" : "Handover / received date", fmtDay(record.handoverDate))}
${row2(bn ? "প্রতিনিধির নাম / পদ" : "Representative name / role", [record.rep, record.repRole].filter(Boolean).join(" / "), bn ? "আইডির ধরন / নম্বর" : "ID type / number", [record.idType, record.idNumber].filter(Boolean).join(" / "))}
${row2(bn ? "দায়িত্বে থাকা কর্মী" : "Responsible staff", record.staff, bn ? "ক্রেডিট / ব্যবসায়িক শর্ত" : "Credit / business terms", record.terms)}
${row2(bn ? "রসিদ নম্বর" : "Receipt number", record.receiptNo, bn ? "রসিদের তারিখ" : "Receipt date", fmtDay(record.receiptDate))}
</table>
<div style="font-weight:800;font-size:10.5px;margin-top:4px">${bn ? "চেকের কপি — বড় সংযুক্তি এলাকা" : "CHEQUE COPY — LARGE ATTACHMENT AREA"}</div>
<div class="chequearea${docs.chequePhoto ? " filled" : ""}">${photoBox(docs.chequePhoto, bn ? "চেকের কপি এখানে রাখুন" : "PLACE / PASTE CHEQUE COPY HERE")}</div>
<div style="font-weight:800;font-size:10.5px;margin-top:4px">${bn ? "প্রতিনিধির আইডি কার্ড — সামনে ও পেছনে" : "REPRESENTATIVE ID CARD — FRONT AND BACK"}</div>
<div class="idrow">
<div class="idbox${docs.idFront ? " filled" : ""}">${photoBox(docs.idFront, bn ? "আইডি কার্ড সামনে" : "ID CARD FRONT")}</div>
<div class="idbox${docs.idBack ? " filled" : ""}">${photoBox(docs.idBack, bn ? "আইডি কার্ড পেছনে" : "ID CARD BACK")}</div>
</div>
<div class="conditions"><b>${bn ? "শর্ত / স্বীকৃতি" : "CONDITIONS / ACKNOWLEDGEMENT"}</b><ol>${conditions.map((c, i) => `<li>${esc(c)}</li>`).join("")}</ol></div>
<div class="siggrid">
<div class="sig"><b>${bn ? "চেক হস্তান্তরকারী / গ্রহণকারী" : "Cheque handed over / received by"}</b><br>${bn ? "নাম" : "Name"}: ${dash}<br>${bn ? "সই" : "Signature"}: ______________ ${bn ? "তারিখ" : "Date"}: ______</div>
<div class="sig"><b>${bn ? "কোম্পানির অনুমোদিত প্রতিনিধি" : "Company authorised representative"}</b><br>${bn ? "নাম" : "Name"}: ${dash}<br>${bn ? "সই / সিল" : "Signature / stamp"}: ______ ${bn ? "তারিখ" : "Date"}: ______</div>
<div class="sig"><b>${bn ? "সাক্ষী (প্রয়োজনে)" : "Witness (if required)"}</b><br>${bn ? "নাম" : "Name"}: ${dash}<br>${bn ? "সই" : "Signature"}: ______________ ${bn ? "তারিখ" : "Date"}: ______</div>
</div>
<div class="footnote"><b>${bn ? "গুরুত্বপূর্ণ" : "Important"}:</b> ${bn ? "এটি শুধু টেমপ্লেট, আইনি পরামর্শ নয়। আসল লেনদেনের শর্ত ও প্রযোজ্য আইন অনুযায়ী যাচাই করে সই করার আগে কপি সংযুক্ত করুন।" : "Template only, not legal advice. Review the conditions for the actual transaction and applicable law before signing. Attach copies before signing."}</div>
</div></body></html>`;
}

export function printSecurityChequeReceipt(record, shop, lang = "en", cur = "AED", docs = {}) {
  printWithSettings(buildSecurityChequeReceiptHTML(record, shop, lang, cur, docs), { lang, kind: "bill" });
}
