import { code128Bars, code128SvgMarkup } from "../product-master/code128.js";

// Sizes in millimetres. Roll presets print one row of labels per page.
export const LABEL_PRESETS = [
  { key: "roll_38x25", bn: "রোল স্টিকার 38×25 mm", en: "Roll 38×25 mm", sheet: "roll", width: 38, height: 25, cols: 1, gapX: 0, gapY: 0 },
  { key: "roll_50x25", bn: "রোল স্টিকার 50×25 mm", en: "Roll 50×25 mm", sheet: "roll", width: 50, height: 25, cols: 1, gapX: 0, gapY: 0 },
  { key: "roll_50x30", bn: "রোল স্টিকার 50×30 mm", en: "Roll 50×30 mm", sheet: "roll", width: 50, height: 30, cols: 1, gapX: 0, gapY: 0 },
  { key: "roll_2up_38x25", bn: "রোল ২-পাশাপাশি 38×25 mm", en: "Roll 2-across 38×25 mm", sheet: "roll", width: 38, height: 25, cols: 2, gapX: 2, gapY: 0 },
  { key: "a4_65", bn: "A4 শীট ৬৫টি (38×21 mm)", en: "A4 sheet 65 (38×21 mm)", sheet: "a4", width: 38.1, height: 21.2, cols: 5, gapX: 2.5, gapY: 0 },
  { key: "a4_40", bn: "A4 শীট ৪০টি (48×25 mm)", en: "A4 sheet 40 (48×25 mm)", sheet: "a4", width: 48.5, height: 25.4, cols: 4, gapX: 0, gapY: 0 },
  { key: "a4_24", bn: "A4 শীট ২৪টি (64×34 mm)", en: "A4 sheet 24 (64×34 mm)", sheet: "a4", width: 64, height: 33.9, cols: 3, gapX: 2.5, gapY: 0 },
  { key: "custom", bn: "নিজের মাপ", en: "Custom size", sheet: "roll", width: 40, height: 30, cols: 1, gapX: 0, gapY: 0 },
];

export const LABEL_FIELDS = [
  { key: "shopName", bn: "দোকানের নাম", en: "Shop name" },
  { key: "name", bn: "পণ্যের নাম", en: "Product name" },
  { key: "code", bn: "কোড", en: "Code" },
  { key: "barcodeText", bn: "বারকোডের নিচে নম্বর", en: "Number under barcode" },
  { key: "price", bn: "বিক্রয় দাম", en: "Sale price" },
  { key: "mrp", bn: "MRP", en: "MRP" },
  { key: "unit", bn: "একক", en: "Unit" },
  { key: "rack", bn: "র‍্যাক", en: "Rack" },
];

export const DEFAULT_LABEL_SETTINGS = {
  preset: "roll_38x25",
  sheet: "roll", width: 38, height: 25, cols: 1, gapX: 0, gapY: 0,
  fields: { shopName: true, name: true, code: false, barcodeText: true, price: true, mrp: false, unit: false, rack: false },
  fontSize: 8,
  barHeight: 9,
  priceLabel: "Price",
  currency: "",
  useCodeIfNoBarcode: true,
  border: false,
};

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, num(v)));
const esc = (v) => String(v ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));

export function labelSettingsOf(shop) {
  const saved = shop?.labelSettings || {};
  return { ...DEFAULT_LABEL_SETTINGS, ...saved, fields: { ...DEFAULT_LABEL_SETTINGS.fields, ...(saved.fields || {}) } };
}

export function applyPreset(settings, key) {
  const p = LABEL_PRESETS.find((x) => x.key === key);
  if (!p) return settings;
  const { bn: _bn, en: _en, key: _k, ...size } = p;
  return { ...settings, preset: key, ...size };
}

function baseRate(p) {
  const rows = Array.isArray(p?.unitPrices) ? p.unitPrices : [];
  const unit = String(p?.unit || "").toLowerCase();
  return rows.find((r) => String(r.unit || "").toLowerCase() === unit && !r.customerType) || rows.find((r) => num(r.factor) === 1) || rows[0] || {};
}

export function productPrice(p) {
  const r = baseRate(p);
  for (const v of [p?.vatInclusive, p?.vatExclusive, p?.salePrice, p?.sellingPrice, p?.price, r.vatInclusive, r.vatExclusive]) {
    if (String(v ?? "").trim() !== "" && num(v) > 0) return num(v);
  }
  return 0;
}

export function productMrp(p) {
  const v = p?.mrp || baseRate(p).mrp;
  return num(v) > 0 ? num(v) : 0;
}

export function productBarcode(p, settings = DEFAULT_LABEL_SETTINGS) {
  const v = String(p?.barcode || p?.ean || "").trim();
  if (v) return v;
  return settings.useCodeIfNoBarcode ? String(p?.code || "").trim() : "";
}

export function canEncode(value) {
  return !!value && !!code128Bars(value);
}

// Labels per printed page for the chosen layout.
export function labelsPerPage(s) {
  const cols = Math.max(1, Math.round(clamp(s.cols, 1, 10)));
  if (s.sheet !== "a4") return cols;
  const rows = Math.max(1, Math.floor((297 - 10 + num(s.gapY)) / (num(s.height) + num(s.gapY))));
  return cols * rows;
}

const money = (v, cur) => `${cur ? `${cur} ` : ""}${num(v).toFixed(2)}`;

function labelHtml(p, s, shopName) {
  const f = s.fields || {};
  const code = productBarcode(p, s);
  const svg = code ? code128SvgMarkup(code, { moduleWidth: 2, height: 50, fontSize: 0 }) : "";
  const bars = svg
    ? svg.replace("<svg ", `<svg preserveAspectRatio="none" style="width:100%;height:${clamp(s.barHeight, 4, 30)}mm;display:block" `)
    : `<div class="nobar">NO BARCODE</div>`;
  const price = productPrice(p);
  const mrp = productMrp(p);
  const line2 = [f.code && p.code ? esc(p.code) : "", f.unit && p.unit ? esc(p.unit) : "", f.rack && p.rackLocation ? esc(p.rackLocation) : ""].filter(Boolean).join(" · ");
  return `<div class="lbl">
    ${f.shopName && shopName ? `<div class="shop">${esc(shopName)}</div>` : ""}
    ${f.name ? `<div class="nm">${esc(p.name)}</div>` : ""}
    ${line2 ? `<div class="sub">${line2}</div>` : ""}
    <div class="bc">${bars}</div>
    ${f.barcodeText && code ? `<div class="bt">${esc(code)}</div>` : ""}
    ${(f.price && price) || (f.mrp && mrp) ? `<div class="pr">${f.price && price ? `${esc(s.priceLabel || "")} <b>${esc(money(price, s.currency))}</b>` : ""}${f.price && price && f.mrp && mrp ? " &nbsp; " : ""}${f.mrp && mrp ? `MRP <b>${esc(money(mrp, s.currency))}</b>` : ""}</div>` : ""}
  </div>`.replace(/\n\s*/g, "");
}

// items: [{ product, copies }]. skip: labels already used on the first A4 sheet.
export function buildLabelsHtml({ items = [], settings, shopName = "", skip = 0 }) {
  const s = { ...DEFAULT_LABEL_SETTINGS, ...settings, fields: { ...DEFAULT_LABEL_SETTINGS.fields, ...(settings?.fields || {}) } };
  const w = clamp(s.width, 10, 200);
  const h = clamp(s.height, 10, 200);
  const cols = Math.max(1, Math.round(clamp(s.cols, 1, 10)));
  const gapX = clamp(s.gapX, 0, 20);
  const gapY = clamp(s.gapY, 0, 20);
  const fs = clamp(s.fontSize, 5, 16);
  const a4 = s.sheet === "a4";
  const per = labelsPerPage(s);

  const cells = [];
  if (a4) for (let i = 0; i < Math.max(0, Math.min(per - 1, Math.round(num(skip)))); i += 1) cells.push(`<div class="lbl empty"></div>`);
  for (const it of items) {
    const n = Math.max(0, Math.min(1000, Math.round(num(it.copies))));
    const one = labelHtml(it.product, s, shopName);
    for (let i = 0; i < n; i += 1) cells.push(one);
  }
  const pages = [];
  for (let i = 0; i < cells.length; i += per) pages.push(cells.slice(i, i + per));

  const pageW = a4 ? 210 : cols * w + (cols - 1) * gapX;
  const pageH = a4 ? 297 : h;
  const gridW = cols * w + (cols - 1) * gapX;
  const padX = a4 ? Math.max(0, (210 - gridW) / 2) : 0;
  const rows = Math.ceil(per / cols);
  const gridH = rows * h + (rows - 1) * gapY;
  const padY = a4 ? Math.max(0, (297 - gridH) / 2) : 0;

  const css = `
    @page { size: ${pageW}mm ${pageH}mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; }
    body { font-family: Arial, Helvetica, sans-serif; color: #000; }
    .pg { width: ${pageW}mm; height: ${pageH}mm; padding: ${padY}mm ${padX}mm; display: grid; grid-template-columns: repeat(${cols}, ${w}mm); grid-auto-rows: ${h}mm; column-gap: ${gapX}mm; row-gap: ${gapY}mm; align-content: start; overflow: hidden; page-break-after: always; break-after: page; }
    .pg:last-child { page-break-after: auto; break-after: auto; }
    .lbl { width: ${w}mm; height: ${h}mm; padding: 1mm 1.5mm; overflow: hidden; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; gap: 0.3mm; ${s.border ? "outline: 0.2mm dashed #888; outline-offset: -0.2mm;" : ""} }
    .lbl.empty { visibility: hidden; }
    .shop { font-size: ${Math.max(5, fs - 1.5)}pt; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
    .nm { font-size: ${fs}pt; font-weight: 700; line-height: 1.1; max-width: 100%; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
    .sub { font-size: ${Math.max(5, fs - 1.5)}pt; white-space: nowrap; overflow: hidden; max-width: 100%; }
    .bc { width: 100%; }
    .bt { font-family: monospace; font-size: ${Math.max(5, fs - 1)}pt; letter-spacing: 0.5px; line-height: 1; }
    .pr { font-size: ${fs}pt; white-space: nowrap; }
    .nobar { font-size: ${Math.max(5, fs - 1)}pt; color: #b91c1c; border: 0.2mm solid #b91c1c; padding: 1mm; }
    @media screen { body { background: #e5e7eb; padding: 8px; } .pg { background: #fff; margin: 0 auto 8px; box-shadow: 0 1px 4px rgba(0,0,0,.25); } .lbl { outline: 0.2mm dashed #cbd5e1; outline-offset: -0.2mm; } }
  `.replace(/\n\s*/g, " ");
  const body = pages.map((pg) => `<div class="pg">${pg.join("")}</div>`).join("");
  return { html: `<!doctype html><html><head><meta charset="UTF-8"><title>Barcode labels</title><style>${css}</style></head><body>${body}</body></html>`, labels: cells.length - (a4 ? Math.min(per - 1, Math.max(0, Math.round(num(skip)))) : 0), pages: pages.length };
}
