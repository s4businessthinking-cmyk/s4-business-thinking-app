/**
 * Live HTML QA for multi-page invoice print (sheet rules + applyDesign).
 * Mirrors purchase/sales page contract without loading .jsx deps.
 * Run: node scripts/qa-invoice-print-live.mjs
 */
import { applyDesign } from "../src/print/printDesign.js";

if (typeof globalThis.localStorage === "undefined") {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`PASS  ${name}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function paginateInvoiceItems(items, fullMax = 14, contMax = 22) {
  const list = Array.isArray(items) ? items : [];
  if (list.length <= fullMax) return [list];
  const pages = [];
  let rest = list.slice();
  while (rest.length > contMax) pages.push(rest.splice(0, contMax));
  if (!pages.length) return [rest];
  pages.push(rest);
  return pages;
}

/** Minimal multi-page invoice HTML matching sales/purchase contract. */
function buildPagedInvoiceHTML(items, style) {
  const pages = paginateInvoiceItems(items, 14, 22);
  const multi = pages.length > 1;
  const amountOptions = `<div class="totals-row"><span class="tl">Subtotal</span><span class="tv">AED 100.00</span></div>`;
  const hdr = (pageNo, pageCount) =>
    `<div class="sheet-top"><div class="hdr"><div class="shop-block"><div class="shop-name">QA Shop</div></div><div><div class="inv-title">INVOICE</div>${pageCount > 1 ? `<div class="inv-no">Page ${pageNo}/${pageCount}</div>` : ""}</div></div>
<div class="body"><div class="info-grid"><div class="info-box"><div class="info-label">Bill To</div><div class="info-value">QA Customer</div></div></div></div></div>`;
  const continuedBot = (pageNo, pageCount) =>
    `<div class="sheet-bot"><div class="body"><div class="totals"><div class="totals-box">${amountOptions}<div class="totals-row"><span class="tl">Grand Total</span><span class="tv">Next page</span></div></div></div><div class="cont-note">Continued… Page ${pageNo}/${pageCount}</div></div></div>`;
  const finalBot = () =>
    `<div class="sheet-bot"><div class="body"><div class="totals"><div class="totals-box">${amountOptions}<div class="grand-row"><span class="gl">Grand Total</span><span class="gv">AED 100.00</span></div></div></div><div class="footer">Thank you for your business.</div><div class="sigs"><div><div class="sig-line">Authorized</div></div></div></div></div>`;

  let offset = 0;
  const sheets = pages
    .map((chunk, idx) => {
      const isLast = idx === pages.length - 1;
      const rows = chunk.map((it, j) => `<tr><td>${offset + j + 1}</td><td>${it.name}</td></tr>`).join("");
      offset += chunk.length;
      return `<div class="invoice${multi ? " paged" : ""}">
${hdr(idx + 1, pages.length)}
<div class="sheet-mid"><table class="items"><tbody>${rows}</tbody></table></div>
${isLast ? finalBot() : continuedBot(idx + 1, pages.length)}
</div>`;
    })
    .join("");

  const raw = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
.sheet-bot{margin-top:0}
.footer{text-align:left}
</style></head><body>${sheets}</body></html>`;
  return applyDesign(raw, "invoice", style);
}

const style = {
  template: "pro",
  accent: "",
  fontScale: 100,
  logo: "data:image/png;base64,xx",
  logoSize: 56,
  logoAlign: "left",
  logoX: 0,
  logoY: 0,
  headerNote: "HeaderNoteQA",
  footerText: "Terms & Conditions\n1. Goods sold are not returnable.\nThank you",
  showSignatures: true,
};

const n = (count) => Array.from({ length: count }, (_, i) => ({ name: `Item ${i + 1}` }));

ok("paginate 23 → [22,1]", (() => {
  const p = paginateInvoiceItems(n(23));
  return p.length === 2 && p[0].length === 22 && p[1].length === 1;
})());

{
  const html = buildPagedInvoiceHTML(n(10), style);
  ok("10 → 1 sheet", (html.match(/class="invoice"/g) || []).length === 1);
  ok("10 → grand-row present", /grand-row/.test(html));
  ok("10 → footer + terms", /s4-terms/.test(html) && /Goods sold are not returnable/.test(html));
  ok("10 → no Continued / Next page", !/Continued…/.test(html) && !/Next page/.test(html));
  ok("10 → logo once", (html.match(/<img class="s4-logo"/g) || []).length === 1);
  ok("10 → header note", html.includes("HeaderNoteQA"));
}

{
  const html = buildPagedInvoiceHTML(n(30), style);
  const sheets = (html.match(/class="invoice paged"/g) || []).length;
  ok("30 → 2 paged sheets", sheets === 2, `sheets=${sheets}`);
  ok("30 → Page 1/2 and 2/2", html.includes("Page 1/2") && html.includes("Page 2/2"));
  ok("30 → shop twice", (html.match(/QA Shop/g) || []).length >= 2);
  ok("30 → customer twice", (html.match(/QA Customer/g) || []).length >= 2);
  ok("30 → Next page once", (html.match(/Next page/g) || []).length === 1);
  ok("30 → Continued once", (html.match(/Continued…/g) || []).length === 1);
  ok("30 → one grand-row", (html.match(/class="grand-row"/g) || []).length === 1);
  ok("30 → one footer", (html.match(/class="footer/g) || []).length === 1);
  ok("30 → one sigs", (html.match(/class="sigs"/g) || []).length === 1);
  ok("30 → logo both pages", (html.match(/<img class="s4-logo"/g) || []).length === 2);
  ok("30 → header note both pages", (html.match(/HeaderNoteQA/g) || []).length === 2);
  ok("30 → terms once", (html.match(/class="footer s4-terms"/g) || []).length === 1);
  ok("30 → Item 1 and Item 30", html.includes("Item 1") && html.includes("Item 30"));
  ok("30 → page-break CSS", /page-break-after:always/.test(html));
  ok("30 → paged sheet-bot not pinned", /\.invoice\.paged \.sheet-bot\{[^}]*margin-top:0!important/.test(html));
  ok("30 → single-page pin still in CSS", /\.invoice:not\(\.paged\) \.sheet-bot\{[^}]*margin-top:auto!important/.test(html));
}

{
  const html = buildPagedInvoiceHTML(n(5), style);
  ok("5 → one non-paged sheet class", (html.match(/class="invoice"/g) || []).length === 1 && !(html.match(/class="invoice paged"/g) || []).length);
  ok("5 → single-page pin CSS present", /\.invoice:not\(\.paged\) \.sheet-bot\{[^}]*margin-top:auto!important/.test(html));
}

{
  const html = buildPagedInvoiceHTML(n(45), style);
  ok("45 → 3 paged sheets", (html.match(/class="invoice paged"/g) || []).length === 3);
  ok("45 → Page 3/3", html.includes("Page 3/3"));
  ok("45 → two Next page + one grand", (html.match(/Next page/g) || []).length === 2 && (html.match(/class="grand-row"/g) || []).length === 1);
  ok("45 → logos x3", (html.match(/<img class="s4-logo"/g) || []).length === 3);
}

{
  const raw = `<!DOCTYPE html><html><head><style>x{}</style></head><body>
<div class="invoice paged"><div class="shop-name">A</div><div class="cont-note">Continued…</div></div>
<div class="invoice paged"><div class="shop-name">B</div><div class="footer">Thanks</div></div>
</body></html>`;
  const out = applyDesign(raw, "invoice", style);
  ok("applyDesign logos x2", (out.match(/<img class="s4-logo"/g) || []).length === 2);
  ok("applyDesign terms only on last footer", (out.match(/class="footer s4-terms"/g) || []).length === 1);
  const continuedChunk = out.match(/class="invoice paged">[\s\S]*?Continued…[\s\S]*?(?=<div class="invoice paged">)/);
  ok("applyDesign continued page has no terms footer", continuedChunk && !/class="footer s4-terms"/.test(continuedChunk[0]));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
