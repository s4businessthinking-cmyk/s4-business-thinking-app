// Print design: ready-made templates (style) + a free-position layout designer (custom / pre-printed paper).
// Stored per device next to the print settings.
const KEY = "s4-print-design-v1";

export const DESIGN_DOCS = [
  { key: "invoice", en: "Sales Invoice / Quotation / Delivery", bn: "সেলস ইনভয়েস / কোটেশন / ডেলিভারি" },
  { key: "voucher", en: "Receipt / Payment Voucher", bn: "রিসিট / পেমেন্ট ভাউচার" },
  { key: "statement", en: "Customer / Vendor Statement", bn: "কাস্টমার / ভেন্ডর স্টেটমেন্ট" },
];

export const TEMPLATES = [
  { key: "classic", en: "Classic", bn: "ক্লাসিক", accent: "", sample: ["#16a34a", "#f9fafb", "#1f2937"] },
  { key: "modern", en: "Modern", bn: "মডার্ন", accent: "#0f766e", sample: ["#ffffff", "#0f766e", "#0f766e"] },
  { key: "simple", en: "Simple (B&W)", bn: "সাধারণ (সাদা-কালো)", accent: "#000000", sample: ["#ffffff", "#ffffff", "#000000"] },
  { key: "bold", en: "Bold", bn: "বোল্ড", accent: "#1d4ed8", sample: ["#1d4ed8", "#ffffff", "#111111"] },
  { key: "compact", en: "Compact", bn: "কমপ্যাক্ট", accent: "", sample: ["#e5e7eb", "#f9fafb", "#374151"] },
];

const STYLE_DEFAULT = {
  template: "classic", accent: "", fontScale: 100, logo: "", logoSize: 56,
  headerNote: "", footerText: "", showSignatures: true,
};

export const INVOICE_KINDS = [
  { key: "tax", en: "Tax Invoice", bn: "ট্যাক্স ইনভয়েস" },
  { key: "regular", en: "Retail Invoice", bn: "রিটেইল ইনভয়েস" },
  { key: "quotation", en: "Quotation", bn: "কোটেশন" },
  { key: "delivery", en: "Delivery Note", bn: "ডেলিভারি চালান" },
];

// [key, English, Bangla]
export const LAYOUT_FIELDS = {
  invoice: [
    ["shopName", "Shop name", "দোকানের নাম"], ["shopAddress", "Shop address", "দোকানের ঠিকানা"], ["shopPhone", "Shop phone", "দোকানের ফোন"],
    ["shopTrn", "Shop TRN/VAT", "দোকানের TRN/VAT"], ["shopNameAr", "Shop name (Arabic)", "দোকানের আরবি নাম"],
    ["shopLicense", "Shop license no", "দোকানের লাইসেন্স নং"], ["shopEmail", "Shop email", "দোকানের ইমেইল"], ["title", "Document title", "শিরোনাম (Tax Invoice…)"],
    ["invoiceNo", "Invoice no", "ইনভয়েস নং"], ["date", "Date", "তারিখ"], ["time", "Time", "সময়"],
    ["customerName", "Customer name", "কাস্টমারের নাম"], ["customerMobile", "Customer mobile", "কাস্টমারের মোবাইল"],
    ["customerAddress", "Customer address", "কাস্টমারের ঠিকানা"], ["customerTrn", "Customer TRN", "কাস্টমারের TRN"],
    ["customerCode", "Customer code", "কাস্টমার কোড"],
    ["refNo", "Ref / LPO no", "রেফ / LPO নং"], ["salesman", "Salesman", "বিক্রেতা"], ["payment", "Payment method", "পেমেন্ট পদ্ধতি"],
    ["userName", "User", "ইউজার"], ["deliveryNo", "Delivery note no", "ডেলিভারি নোট নং"], ["vehicleNo", "Vehicle no", "গাড়ির নম্বর"],
    ["validUntil", "Valid until", "মেয়াদ"], ["totalQty", "Total qty", "মোট পরিমাণ"],
    ["subtotal", "Subtotal", "সাব-টোটাল"], ["discount", "Discount", "ছাড়"], ["vat", "VAT", "VAT"],
    ["grandTotal", "Grand total", "সর্বমোট"], ["paid", "Paid", "পরিশোধিত"], ["balance", "Balance due", "বাকি"],
    ["customerBalance", "Customer total due", "কাস্টমারের মোট বাকি"], ["amountWords", "Amount in words", "কথায় টাকার অঙ্ক"],
    ["note", "Note / Narration", "নোট"],
  ],
  voucher: [
    ["shopName", "Shop name", "দোকানের নাম"], ["shopAddress", "Shop address", "দোকানের ঠিকানা"], ["shopPhone", "Shop phone", "দোকানের ফোন"],
    ["shopNameAr", "Shop name (Arabic)", "দোকানের আরবি নাম"], ["title", "Document title", "শিরোনাম"], ["voucherNo", "Voucher no", "ভাউচার নং"], ["date", "Date", "তারিখ"],
    ["partyName", "Customer / Vendor", "কাস্টমার / ভেন্ডর"], ["method", "Payment method", "পদ্ধতি"],
    ["amount", "Amount", "পরিমাণ"], ["amountWords", "Amount in words", "কথায় টাকার অঙ্ক"],
    ["chequeNo", "Cheque no", "চেক নং"], ["chequeBank", "Bank", "ব্যাংক"], ["chequeDate", "Cheque date", "চেকের তারিখ"],
    ["refNo", "Reference no", "রেফারেন্স নং"], ["note", "Note", "নোট"], ["collectedBy", "Collected by", "সংগ্রহকারী"],
  ],
  statement: [
    ["shopName", "Shop name", "দোকানের নাম"], ["title", "Title", "শিরোনাম"], ["partyName", "Customer / Vendor", "কাস্টমার / ভেন্ডর"],
    ["partyMobile", "Mobile", "মোবাইল"], ["period", "Period", "সময়কাল"], ["printDate", "Print date", "প্রিন্টের তারিখ"],
    ["totalDebit", "Total debit", "মোট ডেবিট"], ["totalCredit", "Total credit", "মোট ক্রেডিট"], ["closing", "Closing balance", "শেষ ব্যালান্স"],
  ],
};

export const TABLE_COLS = {
  invoice: [
    ["sl", "#", "#"], ["code", "Code", "কোড"], ["name", "Description", "পণ্যের বিবরণ"], ["qty", "Qty", "পরিমাণ"],
    ["unit", "Unit", "একক"], ["rate", "Rate", "দর"], ["disc", "Disc", "ছাড়"], ["excl", "Excl. VAT", "VAT বাদে"],
    ["vatPerc", "VAT %", "VAT %"], ["vatAmt", "VAT", "VAT"], ["total", "Amount", "মোট"],
  ],
  voucher: [["invoiceNo", "Invoice No", "ইনভয়েস নং"], ["ourNo", "Our Ref No", "আমাদের নং"], ["invoiceDate", "Date", "তারিখ"], ["amount", "Amount", "পরিমাণ"]],
  statement: [
    ["date", "Date", "তারিখ"], ["type", "Type", "ধরন"], ["no", "Doc No", "নং"], ["ref", "Ref", "রেফ"],
    ["particulars", "Particulars", "বিবরণ"], ["debit", "Debit", "ডেবিট"], ["credit", "Credit", "ক্রেডিট"], ["balance", "Balance", "ব্যালান্স"],
  ],
};

const RIGHT_COLS = new Set(["rate", "disc", "excl", "vatAmt", "total", "amount", "debit", "credit", "balance", "qty"]);
// Shown only on the last page when the item table runs over several pages.
const TOTAL_FIELDS = new Set(["subtotal", "discount", "vat", "grandTotal", "paid", "balance", "customerBalance", "amountWords", "note", "totalQty", "totalDebit", "totalCredit", "closing", "amount"]);

export const LAYOUT_PAPERS = [
  { key: "A4", w: 210, h: 297 }, { key: "A5", w: 148, h: 210 }, { key: "A5L", label: "A5 Landscape", w: 210, h: 148 },
  { key: "letter", label: "Letter", w: 216, h: 279 }, { key: "8.5x12", w: 216, h: 305 }, { key: "8x6", w: 203, h: 152 },
  { key: "80mm", label: "Thermal 80mm", w: 80, h: 200 }, { key: "custom", label: "Custom", w: 0, h: 0 },
];

let uid = 0;
const nid = () => `e${Date.now().toString(36)}${(uid++).toString(36)}`;
const F = (field, x, y, w, h, extra = {}) => ({ id: nid(), type: "field", field, x, y, w, h, size: 10, bold: false, align: "left", label: "", ...extra });
const T = (text, x, y, w, h, extra = {}) => ({ id: nid(), type: "text", text, x, y, w, h, size: 10, bold: false, align: "left", ...extra });
const L = (x, y, w) => ({ id: nid(), type: "line", x, y, w, h: 1 });

function defaultElements(kind) {
  if (kind === "voucher") {
    return [
      F("shopName", 15, 12, 120, 9, { size: 16, bold: true }), F("shopAddress", 15, 21, 120, 5), F("shopPhone", 15, 26, 120, 5),
      F("title", 120, 12, 75, 9, { size: 15, bold: true, align: "right" }),
      F("voucherNo", 120, 22, 75, 5, { align: "right", label: "No:" }), F("date", 120, 27, 75, 5, { align: "right", label: "Date:" }),
      L(15, 35, 180),
      F("partyName", 15, 42, 180, 6, { size: 12, bold: true, label: "Received with thanks from / Paid to:" }),
      F("amountWords", 15, 50, 180, 6, { label: "The sum of:" }),
      F("method", 15, 58, 90, 6, { label: "By:" }), F("chequeNo", 105, 58, 90, 6, { label: "Cheque No:" }),
      F("chequeBank", 15, 64, 90, 6, { label: "Bank:" }), F("chequeDate", 105, 64, 90, 6, { label: "Cheque Date:" }),
      { id: nid(), type: "table", x: 15, y: 74, w: 120, h: 50, rowH: 7, size: 10, header: true, grid: true, cols: [{ key: "invoiceNo", w: 45 }, { key: "invoiceDate", w: 35 }, { key: "amount", w: 40 }] },
      F("amount", 140, 74, 55, 12, { size: 16, bold: true, align: "right", label: "AED" }),
      F("note", 15, 128, 180, 6, { label: "Note:" }),
      L(15, 152, 60), T("Receiver's Signature", 15, 153, 60, 5, { size: 9, align: "center" }),
      L(135, 152, 60), T("Authorized Signature", 135, 153, 60, 5, { size: 9, align: "center" }),
    ];
  }
  if (kind === "statement") {
    return [
      F("shopName", 15, 12, 120, 9, { size: 16, bold: true }), F("title", 110, 12, 85, 9, { size: 14, bold: true, align: "right" }),
      F("partyName", 15, 26, 120, 6, { size: 12, bold: true }), F("partyMobile", 15, 32, 120, 5),
      F("period", 110, 26, 85, 5, { align: "right" }), F("printDate", 110, 32, 85, 5, { align: "right", label: "Printed:" }),
      { id: nid(), type: "table", x: 10, y: 42, w: 190, h: 220, rowH: 6.5, size: 9, header: true, grid: true, cols: [
        { key: "date", w: 22 }, { key: "type", w: 28 }, { key: "no", w: 22 }, { key: "ref", w: 22 }, { key: "particulars", w: 36 },
        { key: "debit", w: 20 }, { key: "credit", w: 20 }, { key: "balance", w: 20 }] },
      F("totalDebit", 110, 266, 40, 6, { align: "right", bold: true, label: "Dr:" }), F("totalCredit", 150, 266, 50, 6, { align: "right", bold: true, label: "Cr:" }),
      F("closing", 110, 273, 90, 7, { align: "right", bold: true, size: 12, label: "Closing Balance:" }),
    ];
  }
  return [
    F("shopName", 15, 12, 115, 9, { size: 16, bold: true }), F("shopAddress", 15, 21, 115, 5), F("shopPhone", 15, 26, 115, 5), F("shopTrn", 15, 31, 115, 5, { label: "TRN:" }),
    F("title", 130, 12, 65, 9, { size: 15, bold: true, align: "right" }),
    F("invoiceNo", 130, 22, 65, 5, { align: "right", label: "Invoice No:" }), F("date", 130, 27, 65, 5, { align: "right", label: "Date:" }),
    F("refNo", 130, 32, 65, 5, { align: "right", label: "Ref:" }),
    L(15, 38, 180),
    T("Bill To:", 15, 41, 40, 5, { bold: true }),
    F("customerName", 15, 46, 110, 6, { size: 12, bold: true }), F("customerMobile", 15, 52, 110, 5), F("customerAddress", 15, 57, 110, 5),
    F("customerTrn", 15, 62, 110, 5, { label: "TRN:" }),
    F("payment", 130, 46, 65, 5, { align: "right", label: "Payment:" }), F("salesman", 130, 52, 65, 5, { align: "right", label: "Salesman:" }),
    { id: nid(), type: "table", x: 15, y: 70, w: 180, h: 150, rowH: 7, size: 10, header: true, grid: true, cols: [
      { key: "sl", w: 10 }, { key: "name", w: 78 }, { key: "qty", w: 20 }, { key: "rate", w: 24 }, { key: "disc", w: 20 }, { key: "total", w: 28 }] },
    F("subtotal", 125, 224, 70, 6, { align: "right", label: "Subtotal:" }), F("discount", 125, 230, 70, 6, { align: "right", label: "Discount:" }),
    F("vat", 125, 236, 70, 6, { align: "right", label: "VAT:" }),
    F("grandTotal", 115, 243, 80, 8, { align: "right", size: 13, bold: true, label: "Grand Total:" }),
    F("amountWords", 15, 224, 105, 12, { size: 9, label: "In words:" }),
    F("paid", 125, 252, 70, 6, { align: "right", label: "Paid:" }), F("balance", 125, 258, 70, 6, { align: "right", bold: true, label: "Balance:" }),
    F("note", 15, 240, 95, 10, { size: 9, label: "Note:" }),
    L(15, 280, 60), T("Customer Signature", 15, 281, 60, 5, { size: 9, align: "center" }),
    L(135, 280, 60), T("Authorized Signature", 135, 281, 60, 5, { size: 9, align: "center" }),
  ];
}

export function defaultLayout(kind) {
  const paper = kind === "voucher" ? LAYOUT_PAPERS.find((p) => p.key === "A5L") : LAYOUT_PAPERS[0];
  return {
    enabled: false, preprinted: false, paper: paper.key, width: paper.w, height: paper.h, offsetX: 0, offsetY: 0, bg: "",
    appliesTo: { tax: true, regular: true, quotation: true, delivery: true },
    elements: defaultElements(kind),
  };
}

function emptyDesign() {
  const d = { style: {}, layout: {} };
  DESIGN_DOCS.forEach(({ key }) => { d.style[key] = { ...STYLE_DEFAULT }; d.layout[key] = defaultLayout(key); });
  return d;
}

export function loadPrintDesign() {
  const base = emptyDesign();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!raw) return base;
    DESIGN_DOCS.forEach(({ key }) => {
      base.style[key] = { ...STYLE_DEFAULT, ...(raw.style?.[key] || {}) };
      if (raw.layout?.[key]) {
        const l = raw.layout[key];
        base.layout[key] = { ...base.layout[key], ...l, appliesTo: { ...base.layout[key].appliesTo, ...(l.appliesTo || {}) }, elements: Array.isArray(l.elements) ? l.elements : base.layout[key].elements };
      }
    });
  } catch { /* keep defaults */ }
  return base;
}

export function savePrintDesign(design) {
  try { localStorage.setItem(KEY, JSON.stringify(design)); return true; } catch { return false; }
}

// Shrinks an uploaded image so it fits in local storage.
export function imageFileToDataUrl(file, { maxW = 400, type = "image/png", quality = 0.85 } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("bad image"));
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (type === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL(type, quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ─── Amount in words ───────────────────────────────────────────
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
function words999(n) {
  let s = "";
  if (n >= 100) { s += `${ONES[Math.floor(n / 100)]} Hundred`; n %= 100; if (n) s += " "; }
  if (n >= 20) { s += TENS[Math.floor(n / 10)]; if (n % 10) s += `-${ONES[n % 10]}`; } else if (n) s += ONES[n];
  return s;
}
function intWords(n) {
  if (!n) return "Zero";
  const out = [];
  [[1e9, "Billion"], [1e6, "Million"], [1e3, "Thousand"]].forEach(([v, name]) => {
    if (n >= v) { out.push(`${words999(Math.floor(n / v))} ${name}`); n %= v; }
  });
  if (n) out.push(words999(n));
  return out.join(" ");
}
export function amountInWords(amount, cur = "AED") {
  const cents = Math.abs(Math.round((parseFloat(amount) || 0) * 100));
  const main = Math.floor(cents / 100);
  const sub = cents % 100;
  const [big, small] = cur === "৳" || /bdt|taka/i.test(cur) ? ["Taka", "Paisa"] : cur === "AED" ? ["UAE Dirhams", "Fils"] : [cur, "Cents"];
  return `${big} ${intWords(main)}${sub ? ` and ${intWords(sub)} ${small}` : ""} Only`;
}

// ─── Templates (CSS on top of the built-in invoice / voucher / statement HTML) ──
function templateCss(style) {
  const t = TEMPLATES.find((x) => x.key === style.template) || TEMPLATES[0];
  const ac = style.accent || t.accent;
  const boxes = ".info-box,.amount-box,.cheque-box,.pay-box,.bal-box,.note-box,.totals-box,.recv-box";
  let css = "";
  if (t.key === "classic" && ac) {
    css += `.hdr{background:${ac}!important;color:#fff!important}.inv-title,.inv-no{color:#fff!important}.invoice,.receipt{border-color:${ac}!important}.grand-row{background:${ac}!important}.footer{color:${ac}!important;border-top-color:${ac}!important}`;
  }
  if (t.key === "modern") {
    css += `.invoice,.receipt{border:none!important;border-radius:0!important;box-shadow:none!important}
.hdr{background:#fff!important;color:#111!important;border-bottom:3px solid ${ac}!important;border-left:8px solid ${ac}}
.inv-title,.rc-title{color:${ac}!important}.inv-no,.rc-no{color:#374151!important}.title-row{border-top-color:#e5e7eb!important}
.info-box{background:#fff!important;border:none!important;border-left:3px solid ${ac}!important;border-radius:0!important}
thead tr{background:${ac}!important;color:#fff!important}.grand-row{background:${ac}!important}
.amount-box{border-color:${ac}!important;background:#fff!important}.amount-val,.amount-label{color:${ac}!important}
.footer{background:#fff!important;color:${ac}!important;border-top:1px solid ${ac}!important}`;
  }
  if (t.key === "simple") {
    css += `*{box-shadow:none!important}.invoice,.receipt{border:1px solid #000!important;border-radius:0!important}
.hdr{background:#fff!important;color:#000!important;border-bottom:1px solid #000!important}.hdr *,.inv-title,.inv-no,.rc-title,.rc-no{color:#000!important}
${boxes}{background:#fff!important;border:1px solid #000!important;border-radius:0!important}
.info-box *,.amount-box *,.cheque-box *,.pay-box *,.bal-box *,.note-box *,.recv-box *{color:#000!important}
thead tr{background:#fff!important;color:#000!important}th{border-top:1px solid #000;border-bottom:1px solid #000}
td{border-bottom:1px dotted #555!important}tbody tr:nth-child(even){background:#fff!important}
.totals-row{background:#fff!important}.tl,.tv{color:#000!important}
.grand-row{background:#fff!important;border-top:2px solid #000}.gl,.gv{color:#000!important}
.footer{background:#fff!important;color:#000!important;border-top:1px solid #000!important}`;
  }
  if (t.key === "bold") {
    css += `.hdr{background:${ac}!important;color:#fff!important;padding:26px 24px!important}.hdr *{color:#fff!important}
.shop-name{font-size:26px!important}.inv-title,.rc-title{font-size:30px!important}
.receipt .hdr{padding:10px 14px!important}.receipt .shop-name{font-size:15px!important}.receipt .rc-title{font-size:14px!important}
.receipt .amount-val{font-size:16px!important}
thead tr{background:#111!important;color:#fff!important}.grand-row{background:${ac}!important;padding:16px!important}.gv{font-size:22px!important}
.invoice,.receipt{border:3px solid ${ac}!important}.footer{color:${ac}!important;border-top-color:${ac}!important}`;
  }
  if (t.key === "compact") {
    css += `body{font-size:11px!important}.hdr{padding:10px 14px!important}.shop-name{font-size:16px!important}.inv-title,.rc-title{font-size:18px!important}
.body{padding:10px 14px!important}.info-grid{gap:6px!important;margin-bottom:8px!important}.info-box{padding:5px 8px!important}
th{padding:5px!important}td{padding:4px 5px!important}.totals-row{padding:4px 10px!important}.grand-row{padding:6px 10px!important}
.sigs{margin-top:10px!important}.sig-line{margin-top:26px!important}.amount-box{padding:8px!important}.amount-val{font-size:22px!important}`;
  }
  const scale = Math.max(70, Math.min(140, parseInt(style.fontScale, 10) || 100));
  if (scale !== 100) css += `.invoice,.receipt{zoom:${scale / 100}}`;
  if (!style.showSignatures) css += ".sigs,.recv-grid{display:none!important}";
  if (style.logo) css += `.s4-logo{display:block;max-height:${parseInt(style.logoSize, 10) || 56}px;max-width:200px;margin-bottom:6px}`;
  css += `@media print{
@page{size:A4;margin:8mm 10mm}
body{padding:0!important;font-size:10.5pt!important;-webkit-print-color-adjust:economy;print-color-adjust:economy}
.receipt,.invoice{border:1px solid #000!important;border-radius:0!important;box-shadow:none!important;max-width:100%!important}
.hdr{padding:3mm 4mm!important;background:#fff!important;color:#000!important;background-image:none!important}
.hdr *,.rc-title,.rc-no,.shop-name,.shop-sub{color:#000!important}
.shop-name{font-size:12pt!important}.shop-sub{font-size:8.5pt!important;line-height:1.25!important}
.rc-title,.inv-title{font-size:12pt!important;letter-spacing:0!important}
.rc-no,.inv-no{font-size:9.5pt!important;opacity:1!important}
.title-row{margin-top:2px!important;padding-top:2px!important;border-top:1px solid #ccc!important}
.body{padding:3mm 4mm!important}
.info-grid{gap:2mm!important;margin-bottom:3mm!important}
.info-box{padding:1.5mm 2.5mm!important;border-radius:0!important}
.info-label{font-size:7.5pt!important;margin-bottom:0!important;letter-spacing:0!important}
.info-value{font-size:9.5pt!important}
.amount-box{padding:2mm 3mm!important;margin-bottom:3mm!important;border-width:1px!important}
.amount-label{font-size:8pt!important}.amount-val{font-size:13pt!important;margin-top:0!important}
.cheque-box,.pay-box{padding:2mm 3mm!important;margin-bottom:3mm!important;border-radius:0!important}
.cheque-row{padding:0.5px 0!important;font-size:9pt!important}
.alloc-table{margin-bottom:3mm!important}
.alloc-table th,.alloc-table td{padding:1.5mm 2mm!important;font-size:9pt!important}
.alloc-table thead{display:table-header-group}
.note-box{padding:2mm 3mm!important;margin-bottom:3mm!important;font-size:9pt!important}
.sigs{margin-top:5mm!important;padding-top:2mm!important;gap:8mm!important}
.sig-line{margin-top:14mm!important;padding-top:2px!important;font-size:8.5pt!important}
.footer{padding:2mm!important;font-size:8pt!important;background:#fff!important}
}`;
  return css;
}

// Extra shop header lines from Shop Info for the built-in invoice/voucher documents.
export function shopHeaderExtras(shop) {
  return {
    arabic: shop?.companyNameAr ? `<div class="shop-sub" dir="rtl" style="font-size:14px;font-weight:800">${esc(shop.companyNameAr)}</div>` : "",
    details: [shop?.tradeLicenseNumber ? `License: ${esc(shop.tradeLicenseNumber)}` : "", shop?.fax ? `Fax: ${esc(shop.fax)}` : "", shop?.email ? esc(shop.email) : ""]
      .filter(Boolean).map((x) => `<div class="shop-sub">${x}</div>`).join(""),
  };
}

// Applies the chosen template, logo, header note and footer text to a built-in document.
export function applyDesign(html, kind, styleOverride) {
  const style = styleOverride || loadPrintDesign().style[kind] || STYLE_DEFAULT;
  let out = html.replace("</style>", `${templateCss(style)}</style>`);
  const shopName = /(<div class="shop-name">[\s\S]*?<\/div>)/;
  if (style.logo) out = out.replace(shopName, `<img class="s4-logo" src="${style.logo}" alt="">$1`);
  if (style.headerNote) out = out.replace(shopName, `$1<div class="shop-sub" style="white-space:pre-line">${esc(style.headerNote)}</div>`);
  if (style.footerText) out = out.replace(/<div class="footer">[\s\S]*?<\/div>/, `<div class="footer" style="white-space:pre-line">${esc(style.footerText)}</div>`);
  return out;
}

// Built-in statement document (same structure/classes as invoices, so templates apply).
// cols: [{ label, align }], rows: [[cell…]], foot: [cell…] | null
export function generateStatementHTML({ shopName = "", title = "", subtitle = "", partyLine = "", cols = [], rows = [], foot = null, paper = "A4" }, styleOverride) {
  const th = cols.map((c) => `<th style="text-align:${c.align || "left"}">${esc(c.label)}</th>`).join("");
  const body = rows.map((r) => `<tr>${r.map((v, i) => `<td style="text-align:${cols[i]?.align || "left"}">${esc(v)}</td>`).join("")}</tr>`).join("");
  const tfoot = foot ? `<tfoot><tr>${foot.map((v, i) => `<td style="text-align:${cols[i]?.align || "left"};font-weight:800;background:#f1f5f9">${esc(v)}</td>`).join("")}</tr></tfoot>` : "";
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(title)}</title>
<style>
@page{size:${paper};margin:8mm}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Noto Sans Bengali','Noto Sans','Segoe UI',Arial,sans-serif;font-size:12px;color:#111;background:#fff;padding:16px}
.invoice{max-width:900px;margin:0 auto;border:2px solid #374151;border-radius:4px;overflow:hidden}
.hdr{background:#f8f9fa;color:#111;padding:16px 20px;display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #dee2e6}
.shop-name{font-size:19px;font-weight:900}.shop-sub{font-size:11px;opacity:0.75;margin-top:3px}
.inv-title{font-size:18px;font-weight:900;text-align:right;letter-spacing:1px}.inv-no{font-size:12px;text-align:right;margin-top:3px}
.body{padding:14px 20px}
.info-box{background:#f9fafb;border-radius:8px;padding:8px 12px;border:1px solid #e5e7eb;margin-bottom:12px;font-size:13px;font-weight:700}
table{width:100%;border-collapse:collapse;font-size:11px}
thead tr{background:#e5e7eb;color:#111}th{padding:7px 6px;text-align:left;font-size:10px;text-transform:uppercase;font-weight:700}
td{padding:5px 6px;border-bottom:1px solid #e5e7eb;vertical-align:top}tbody tr:nth-child(even){background:#f9fafb}
.footer{text-align:center;padding:9px 20px;background:#f0f0f0;border-top:2px solid #6b7280;font-size:11px;color:#6b7280;font-weight:700}
@media print{body{padding:0}.invoice{border-radius:0}thead{display:table-header-group}}
</style></head><body>
<div class="invoice"><div class="hdr"><div class="shop-block"><div class="shop-name">${esc(shopName)}</div></div>
<div><div class="inv-title">${esc(title)}</div><div class="inv-no">${esc(subtitle)}</div></div></div>
<div class="body">${partyLine ? `<div class="info-box">${esc(partyLine)}</div>` : ""}
<table><thead><tr>${th}</tr></thead><tbody>${body}</tbody>${tfoot}</table></div>
<div class="footer">${esc(new Date().toLocaleString("en-GB"))}</div></div></body></html>`;
  return applyDesign(html, "statement", styleOverride);
}

// ─── Free-position layout renderer ─────────────────────────────
export function layoutAppliesTo(layout, invoice) {
  if (!layout?.enabled) return false;
  if (!invoice) return true;
  const k = invoice.docKind === "quotation" || invoice.docKind === "salesOrder" ? "quotation" : invoice.invoiceType === "delivery" || invoice.docKind === "delivery" ? "delivery" : invoice.invoiceType === "tax" ? "tax" : "regular";
  return layout.appliesTo?.[k] !== false;
}

export function colLabel(kind, key, bn) {
  const c = (TABLE_COLS[kind] || []).find((x) => x[0] === key);
  return c ? (bn ? c[2] : c[1]) : key;
}

function tableHtml(el, kind, rows, layout, ox, oy, bn) {
  const pre = layout.preprinted;
  const showHead = !pre && el.header !== false;
  const grid = !pre && el.grid;
  const rowH = Math.max(3, parseFloat(el.rowH) || 7);
  const border = grid ? "border:0.2mm solid #000;" : "";
  const cols = el.cols || [];
  const colgroup = cols.map((c) => `<col style="width:${c.w}mm">`).join("");
  const cell = (c, v, head) => `<td style="${border}padding:0 1mm;height:${rowH}mm;overflow:hidden;white-space:nowrap;text-overflow:clip;text-align:${c.align || (RIGHT_COLS.has(c.key) ? "right" : c.key === "sl" ? "center" : "left")};${head ? "font-weight:700;" : ""}">${esc(v)}</td>`;
  const head = showHead ? `<tr>${cols.map((c) => cell(c, c.label || colLabel(kind, c.key, bn), true)).join("")}</tr>` : "";
  const body = rows.map((r) => `<tr>${cols.map((c) => cell(c, r[c.key] ?? "", false)).join("")}</tr>`).join("");
  return `<table style="position:absolute;left:${el.x + ox}mm;top:${el.y + oy}mm;width:${el.w}mm;border-collapse:collapse;table-layout:fixed;font-size:${el.size || 10}pt">${colgroup}${head}${body}</table>`;
}

export function tableCapacity(el, preprinted) {
  const rowH = Math.max(3, parseFloat(el.rowH) || 7);
  const head = !preprinted && el.header !== false ? rowH : 0;
  return Math.max(1, Math.floor((el.h - head) / rowH));
}

// data: { fields: { key: text }, items: [{ colKey: text }] }
export function renderLayoutDocument(layout, kind, data, { copies = 1, title = "", bn = false } = {}) {
  const W = parseFloat(layout.width) || 210;
  const H = parseFloat(layout.height) || 297;
  const ox = parseFloat(layout.offsetX) || 0;
  const oy = parseFloat(layout.offsetY) || 0;
  const pre = layout.preprinted;
  const els = layout.elements || [];
  const table = els.find((e) => e.type === "table");
  const items = data.items || [];
  const per = table ? tableCapacity(table, pre) : items.length || 1;
  const chunks = [];
  for (let i = 0; i < Math.max(1, items.length); i += per) chunks.push(items.slice(i, i + per));
  if (!chunks.length) chunks.push([]);

  const page = (chunk, last) => els.map((el) => {
    const pos = `left:${el.x + ox}mm;top:${el.y + oy}mm;width:${el.w}mm;height:${el.h}mm;font-size:${el.size || 10}pt;font-weight:${el.bold ? 700 : 400};text-align:${el.align || "left"}`;
    if (el.type === "table") return tableHtml(el, kind, chunk, layout, ox, oy, bn);
    if (el.type === "text") return pre ? "" : `<div class="el" style="${pos}">${esc(el.text)}</div>`;
    if (el.type === "line") return pre ? "" : `<div class="el" style="left:${el.x + ox}mm;top:${el.y + oy}mm;width:${el.w}mm;height:0;border-top:0.3mm solid #000"></div>`;
    if (el.type === "box") return pre ? "" : `<div class="el" style="${pos};border:0.3mm solid #000"></div>`;
    if (el.type === "logo") return pre || !data.logo ? "" : `<img class="el" src="${data.logo}" style="${pos};object-fit:contain" alt="">`;
    if (el.type !== "field") return "";
    if (TOTAL_FIELDS.has(el.field) && !last) return "";
    const v = data.fields?.[el.field];
    if (v == null || v === "") return "";
    const label = !pre && el.label ? `<span style="font-weight:400">${esc(el.label)} </span>` : "";
    return `<div class="el" style="${pos}">${label}${esc(v)}</div>`;
  }).join("");

  const pages = chunks.map((c, i) => `<div class="pg">${page(c, i === chunks.length - 1)}</div>`).join("");
  const n = Math.max(1, Math.min(10, parseInt(copies, 10) || 1));
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(title)}</title><style>
@page{size:${W}mm ${H}mm;margin:0}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Noto Sans Bengali','Segoe UI',Arial,sans-serif;color:#000;background:#fff}
.pg{position:relative;width:${W}mm;height:${H}mm;overflow:hidden;page-break-after:always;break-after:page}
.pg:last-child{page-break-after:auto;break-after:auto}
.el{position:absolute;overflow:hidden;white-space:pre-wrap;line-height:1.2}
</style></head><body>${Array.from({ length: n }, () => pages).join("")}</body></html>`;
}

export const SAMPLE_DATA = {
  invoice: {
    fields: {
      shopName: "S4 Auto Spare Parts", shopAddress: "Industrial Area 4, Sharjah", shopPhone: "+971 50 000 0000", shopTrn: "100000000000003",
      shopNameAr: "اس فور لقطع غيار السيارات", shopLicense: "CN-1234567", shopEmail: "info@s4parts.ae",
      title: "TAX INVOICE", invoiceNo: "SI-0001", date: "04/10/2026", time: "10:30", customerName: "Al Noor Garage", customerMobile: "+971 55 111 2222",
      customerAddress: "Ajman", customerTrn: "100222333000003", customerCode: "C-0001", refNo: "LPO-778", salesman: "Rahim", payment: "Credit", userName: "Admin",
      deliveryNo: "DN-0005", vehicleNo: "SHJ 12345", validUntil: "15/10/2026", totalQty: "7",
      subtotal: "1,250.00", discount: "50.00", vat: "60.00", grandTotal: "1,260.00", paid: "500.00", balance: "760.00",
      customerBalance: "3,450.00", amountWords: amountInWords(1260), note: "Goods once sold will not be taken back.",
    },
    items: [
      { sl: "1", code: "BP-101", name: "Brake Pad Front", qty: "2", unit: "Pcs", rate: "150.00", disc: "—", excl: "300.00", vatPerc: "5%", vatAmt: "15.00", total: "315.00" },
      { sl: "2", code: "OF-22", name: "Oil Filter", qty: "4", unit: "Pcs", rate: "35.00", disc: "5%", excl: "133.00", vatPerc: "5%", vatAmt: "6.65", total: "139.65" },
      { sl: "3", code: "SA-9", name: "Shock Absorber Rear", qty: "1", unit: "Pcs", rate: "780.00", disc: "—", excl: "780.00", vatPerc: "5%", vatAmt: "39.00", total: "819.00" },
    ],
  },
  voucher: {
    fields: {
      shopName: "S4 Auto Spare Parts", shopAddress: "Industrial Area 4, Sharjah", shopPhone: "+971 50 000 0000", shopNameAr: "اس فور لقطع غيار السيارات", title: "RECEIPT VOUCHER",
      voucherNo: "RV-0012", date: "04/10/2026", partyName: "Al Noor Garage", method: "Cheque", amount: "1,500.00", amountWords: amountInWords(1500),
      chequeNo: "004512", chequeBank: "Emirates NBD", chequeDate: "10/10/2026", refNo: "", note: "Against old bills", collectedBy: "Rahim",
    },
    items: [{ invoiceNo: "SI-0001", ourNo: "SI-0001", invoiceDate: "01/10/2026", amount: "1,000.00" }, { invoiceNo: "SI-0004", ourNo: "SI-0004", invoiceDate: "02/10/2026", amount: "500.00" }],
  },
  statement: {
    fields: {
      shopName: "S4 Auto Spare Parts", title: "CUSTOMER STATEMENT", partyName: "Al Noor Garage", partyMobile: "+971 55 111 2222",
      period: "01/09/2026 — 04/10/2026", printDate: "04/10/2026", totalDebit: "4,950.00", totalCredit: "1,500.00", closing: "3,450.00 Dr",
    },
    items: [
      { date: "01/09/2026", type: "Opening Balance", no: "", ref: "", particulars: "", debit: "", credit: "", balance: "1,200.00 Dr" },
      { date: "05/09/2026", type: "Sales Bill", no: "SI-0001", ref: "LPO-778", particulars: "Credit", debit: "1,260.00", credit: "", balance: "2,460.00 Dr" },
      { date: "12/09/2026", type: "Receipt", no: "RV-0012", ref: "", particulars: "Cheque", debit: "", credit: "1,500.00", balance: "960.00 Dr" },
    ],
  },
};
