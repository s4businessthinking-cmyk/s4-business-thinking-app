import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { INVOICE_AR, arabicLabels, invoiceArabicMode } from "./arabicPrint.js";
import { capsSavedText } from "../utils/capsSavedText.js";
import { valuationMethodOf } from "../reports/stockValuation.js";
import { normalizeGroups } from "../ledger/coaGroups.js";
import { budgetLinesOf } from "../accounts/budgets.js";
import { postedInterest } from "../accounts/overdueInterest.js";

// the sales print builder is a browser module (.jsx imports), so it is bundled as-is and the real template is tested
const here = fileURLToPath(new URL(".", import.meta.url));
const outDir = mkdtempSync(join(tmpdir(), "s4-ar-print-"));
const outFile = join(outDir, "bundle.mjs");
await build({
  stdin: { contents: 'export { generateSalesInvoiceHTML } from "../sales-invoice/salesInvoiceShared.js";', resolveDir: here, loader: "js" },
  bundle: true, format: "esm", platform: "node", outfile: outFile, logLevel: "silent", loader: { ".js": "jsx", ".jsx": "jsx", ".png": "dataurl", ".jpg": "dataurl", ".svg": "dataurl", ".css": "empty" }, jsx: "automatic",
  external: ["firebase", "firebase/*"],
});
const { generateSalesInvoiceHTML } = await import(pathToFileURL(outFile).href);
test.after(() => rmSync(outDir, { recursive: true, force: true }));

const shop = { companyName: "Gulf Parts", companyNameAr: "قطع غيار الخليج", addressAr: "مصفح، أبوظبي", country: "AE", trnNumber: "100000000000003", area: "Mussafah" };
const bill = {
  invoiceNo: "SI-0001", invoiceType: "tax", invoiceDate: "2026-11-20", customerName: "Al Noor", customerNameAr: "النور", customerTrn: "100000000000011", paymentMethod: "cash",
  items: [{ productId: "p1", name: "Brake Pad", nameAr: "فحمات فرامل", qty: 2, unit: "Pcs", unitPrice: 50, discountPerc: 0, discountFlat: 0, vatPerc: 5 }],
  amountPaid: 105,
};
const html = (shopIn, inv = bill) => generateSalesInvoiceHTML(inv, shopIn, "en", false, false, { noLayout: true });

test("mode: a UAE shop with an Arabic name prints both unless the owner chose otherwise", () => {
  assert.equal(invoiceArabicMode(shop), "both", "country saved as 'AE' at sign-up");
  assert.equal(invoiceArabicMode({ ...shop, companyNameAr: "" }), "en");
  assert.equal(invoiceArabicMode({ ...shop, country: "BD" }), "en");
  assert.equal(invoiceArabicMode({ ...shop, invoiceArabic: "en" }), "en");
  assert.equal(invoiceArabicMode({ ...shop, invoiceArabic: "BOTH" }), "both", "read in any case");
  assert.equal(arabicLabels("both", true).on, false, "a Bangla print never mixes in Arabic");
  assert.equal(arabicLabels("both").label("Qty", "qty"), `Qty<span class="ar-sub" dir="rtl" lang="ar">${INVOICE_AR.qty}</span>`);
  assert.equal(arabicLabels("ar").name("Brake Pad", ""), "Brake Pad", "no Arabic name: the English one stays");
});

test("tax invoice in English + Arabic: header, TRN, VAT labels and item names", () => {
  const h = html(shop);
  [INVOICE_AR.taxInvoice, INVOICE_AR.billTo, INVOICE_AR.trn, INVOICE_AR.qty, INVOICE_AR.unitPrice, INVOICE_AR.vatPerc, INVOICE_AR.grandTotalIncl, INVOICE_AR.subtotalExcl]
    .forEach((a) => assert.ok(h.includes(a), a));
  assert.ok(h.includes("TAX INVOICE"));
  assert.ok(h.includes("قطع غيار الخليج") && h.includes("مصفح، أبوظبي"), "shop Arabic name and address");
  assert.ok(h.includes("Brake Pad") && h.includes("فحمات فرامل"), "item in both languages");
  assert.ok(h.includes("Al Noor") && h.includes("النور"), "customer in both languages");
  assert.ok(h.includes('dir="rtl"') && h.includes(".ar-sub"), "Arabic laid out right to left with its style");
  assert.ok(h.includes("105.00"), "amounts as before");
});

test("Arabic mode: Arabic headings and names", () => {
  const h = html({ ...shop, invoiceArabic: "ar" });
  assert.ok(h.includes(INVOICE_AR.taxInvoice) && h.includes("فحمات فرامل"));
  assert.ok(!h.includes(">Qty<"), "the English column heading is replaced");
});

test("English only: no Arabic blocks, no right-to-left style", () => {
  const h = html({ ...shop, invoiceArabic: "en" });
  assert.ok(!h.includes(INVOICE_AR.taxInvoice) && !h.includes("فحمات فرامل") && !h.includes(".ar-sub"));
  assert.ok(h.includes("TAX INVOICE") && h.includes("Brake Pad") && h.includes("105.00"));
  const delivery = html({ ...shop, invoiceArabic: "en" }, { ...bill, invoiceType: "delivery" });
  assert.ok(!delivery.includes('class="ar'), "delivery note too");
});

test("quotation and delivery note print their Arabic titles", () => {
  assert.ok(html(shop, { ...bill, docKind: "quotation", invoiceType: "regular" }).includes(INVOICE_AR.quotation));
  assert.ok(html(shop, { ...bill, invoiceType: "delivery" }).includes(INVOICE_AR.deliveryNote));
});

test("system words are no longer capitalised on save, and old capitalised values still read", () => {
  const saved = capsSavedText({ invoiceArabic: "both", stockValuationMethod: "fifo", budgets: [{ key: "exp:rent", label: "Rent" }], coaGroups: [{ nameEn: "Office", nature: "expense" }], interestSide: "customer", fxKind: "reval" });
  assert.deepEqual([saved.invoiceArabic, saved.stockValuationMethod, saved.budgets[0].key, saved.coaGroups[0].nature, saved.interestSide, saved.fxKind], ["both", "fifo", "exp:rent", "expense", "customer", "reval"]);
  assert.equal(saved.budgets[0].label, "RENT", "user text is still capitalised");
  assert.equal(valuationMethodOf({ stockValuationMethod: "FIFO" }), "fifo");
  assert.equal(normalizeGroups([{ id: "g", nameEn: "OFFICE", nature: "EXPENSE" }])[0]?.nature, "expense");
  assert.deepEqual(budgetLinesOf({ budgets: [{ id: "b", fyStart: "2026-04-01", key: "EXP:RENT", kind: "EXPENSE", amounts: [10] }] }, "2026-04-01").map((l) => [l.key, l.kind]), [["exp:rent", "expense"]]);
  assert.equal(postedInterest([{ id: "v", source: "overdueInterest", interestSide: "CUSTOMER", voucherDate: "2026-10-31", lines: [{ billId: "SI-1", interestTo: "2026-10-31" }] }], { side: "customer" }).get("SI-1"), "2026-10-31");
});
