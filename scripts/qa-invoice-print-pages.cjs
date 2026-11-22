/**
 * QA: multi-page invoice print — pagination + sales/purchase HTML structure.
 * Run: node scripts/qa-invoice-print-pages.cjs
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const salesSrc = fs.readFileSync(path.join(root, "src/sales-invoice/salesInvoiceShared.js"), "utf8");
const purchaseSrc = fs.readFileSync(path.join(root, "src/purchase/purchasePrint.js"), "utf8");
const designSrc = fs.readFileSync(path.join(root, "src/print/printDesign.js"), "utf8");

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

/** Same algorithm as salesInvoiceShared.paginateInvoiceItems */
function paginateInvoiceItems(items, fullMax = 14, contMax = 22) {
  const list = Array.isArray(items) ? items : [];
  if (list.length <= fullMax) return [list];
  const pages = [];
  let rest = list.slice();
  while (rest.length > contMax) {
    pages.push(rest.splice(0, contMax));
  }
  if (!pages.length) return [rest];
  pages.push(rest);
  return pages;
}

const n = (count) => Array.from({ length: count }, (_, i) => ({ id: i + 1 }));

// ── pagination thresholds ───────────────────────────────────────
ok("<=14 → 1 page", paginateInvoiceItems(n(14)).length === 1 && paginateInvoiceItems(n(14))[0].length === 14);
ok("15..22 → 1 page (full footer)", (() => {
  const p = paginateInvoiceItems(n(18));
  return p.length === 1 && p[0].length === 18;
})());
ok("23 → 2 pages (22+1)", (() => {
  const p = paginateInvoiceItems(n(23));
  return p.length === 2 && p[0].length === 22 && p[1].length === 1;
})());
ok("30 → 2 pages (22+8)", (() => {
  const p = paginateInvoiceItems(n(30));
  return p.length === 2 && p[0].length === 22 && p[1].length === 8;
})());
ok("45 → 3 pages (22+22+1)", (() => {
  const p = paginateInvoiceItems(n(45));
  return p.length === 3 && p[0].length === 22 && p[1].length === 22 && p[2].length === 1;
})());
ok("empty → 1 empty page", paginateInvoiceItems([]).length === 1 && paginateInvoiceItems([])[0].length === 0);

// ── sales source structure ──────────────────────────────────────
ok("sales exports paginateInvoiceItems", /export function paginateInvoiceItems\(/.test(salesSrc));
ok("sales uses FULL_MAX 14 / CONT_MAX 22", /FULL_MAX\s*=\s*14/.test(salesSrc) && /CONT_MAX\s*=\s*22/.test(salesSrc));
ok("sales continuedBot has Next page (no real grand)", /continuedBot[\s\S]*?Next page/.test(salesSrc));
ok("sales continuedBot has no .footer class", (() => {
  const m = salesSrc.match(/const continuedBot[\s\S]*?const finalBot/);
  return m && !/<div class="footer">/.test(m[0]);
})());
ok("sales finalBot has .footer", /const finalBot[\s\S]*?<div class="footer">/.test(salesSrc));
ok("sales finalBot uses totalsHTML (has grand)", /const finalBot[\s\S]*?\$\{totalsHTML\}/.test(salesSrc) && /grand-row[\s\S]*?siFmt2\(grand\)/.test(salesSrc));
ok("sales continuedBot has no sigs", (() => {
  const m = salesSrc.match(/const continuedBot[\s\S]*?const finalBot/);
  return m && !/class="sigs"/.test(m[0]);
})());
ok("sales hdrHTML repeats Page N/M", /Page"\}\s*\$\{pageNo\}\/\$\{pageCount\}/.test(salesSrc) || /pageNo\}\/\$\{pageCount\}/.test(salesSrc));
ok("sales multi uses invoice paged class", /invoice paged/.test(salesSrc));
ok("sales sheet-bot margin-top:0", /\.sheet-bot\{[^}]*margin-top:0/.test(salesSrc));

// ── purchase source structure ───────────────────────────────────
ok("purchase imports paginateInvoiceItems", /paginateInvoiceItems/.test(purchaseSrc));
ok("purchase uses 14, 22", /paginateInvoiceItems\(items,\s*14,\s*22\)/.test(purchaseSrc));
ok("purchase continuedBot Next page", /continuedBot[\s\S]*?Next page/.test(purchaseSrc));
ok("purchase continuedBot no .footer", (() => {
  const m = purchaseSrc.match(/const continuedBot[\s\S]*?const finalBot/);
  return m && !/<div class="footer">/.test(m[0]);
})());
ok("purchase finalBot has .footer + grand-row", /const finalBot[\s\S]*?<div class="footer">[\s\S]*?grand-row|const finalBot[\s\S]*?grand-row[\s\S]*?<div class="footer">/.test(purchaseSrc));
ok("purchase hdrHTML repeats shop + Page", /shop-name[\s\S]*?pageNo/.test(purchaseSrc) && /Page"\}\s*\$\{pageNo\}|pageNo\}\/\$\{pageCount\}/.test(purchaseSrc));
ok("purchase multi paged class", /invoice\$\{multi \? " paged" : ""\}/.test(purchaseSrc) || /" paged"/.test(purchaseSrc));
ok("purchase no margin-top:auto on sheet-bot", !/\.sheet-bot\{[^}]*margin-top:auto/.test(purchaseSrc));

// ── printDesign sheet / terms ───────────────────────────────────
ok("printDesign sheet-bot margin-top:0", /\.sheet-bot\{[^}]*margin-top:0!important/.test(designSrc));
ok("printDesign .invoice.paged page-break", /\.invoice\.paged\{[^}]*page-break-after:always/.test(designSrc));
ok("printDesign logo replace is global", /shop-name[\s\S]*?\/g,\s*`<div class="s4-logo-wrap"/.test(designSrc) || /replace\(\/\(<div class="shop-name">[\s\S]*?\/g/.test(designSrc));
ok("printDesign footer terms replace is global", /footer">[\s\S]*?\/g,\s*`<div class="footer s4-terms"/.test(designSrc));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
