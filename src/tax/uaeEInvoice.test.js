import test from "node:test";
import assert from "node:assert/strict";
import { computeVat } from "../reports/taxDomain.js";
import { buildVat201 } from "../reports/vat201.js";
import { buildEDocument, eInvoiceDocs, eInvoiceProblems, eInvoiceRecord, eInvoiceState, eInvoiceXml, emirateCode, payloadDigest, reasonText, registerRows, vatCategory } from "./uaeEInvoice.js";

const S = "s1";
const shop = { companyName: "S4 Auto Parts LLC", trnNumber: "100123456700003", address: "Industrial Area 4", emirate: "Sharjah", country: "ae", tradeLicenseNumber: "TL-778" };
const customers = [
  { id: "c1", customerName: "Al Noor Garage", trnNumber: "100987654300003", address: "Al Quoz 3", emirate: "Dubai" },
  { id: "c2", customerName: "Walk-in Ahmed", address: "", emirate: "" },
];
const line = (name, qty, price, extra = {}) => { const net = qty * price - (extra.discountAmt || 0); const vat = Math.round(net * 5) / 100; return { productId: name, name, code: `C-${name}`, qty, unit: "Pcs", unitPrice: price, discountAmt: 0, vatPerc: 5, vatAmt: vat, lineTotal: net + vat, ...extra }; };
const si = (id, customerId, items, extra = {}) => {
  const vat = items.reduce((t, l) => t + l.vatAmt, 0), total = items.reduce((t, l) => t + l.lineTotal, 0);
  return { id, shopId: S, invoiceNo: id, invoiceType: "tax", invoiceDate: "2026-11-10", status: "paid", customerId, customerName: customers.find((c) => c.id === customerId)?.customerName || "", currency: "AED", items, totalVat: vat, grandTotal: total, amountPaid: total, ...extra };
};
const inv1 = si("SI-101", "c1", [line("Oil Filter", 4, 25), line("Brake Pad", 2, 150, { discountAmt: 20, vatAmt: 14, lineTotal: 294 })]);
const inv2 = si("SI-102", "c2", [line("Spark Plug", 1, 40)]);
const goodsReturn = { id: "SR-1", shopId: S, returnNo: "SR-1", returnDate: "2026-11-12", status: "confirmed", invoiceId: "SI-101", partyId: "c1", items: [{ lineIndex: 0, qty: 2 }], total: 52.5, totalVat: 2.5, subtotal: 50 };
const valueNote = { id: "SR-2", shopId: S, returnNo: "SR-2", returnDate: "2026-11-13", status: "confirmed", invoiceId: "SI-101", partyId: "c1", noteType: "value", reason: "Rate difference", items: [], total: 21, totalVat: 1, subtotal: 20 };
const today = "2026-11-25";

test("tax invoice -> PINT AE document: parties, lines, VAT breakdown, totals; Ready", () => {
  const e = buildEDocument({ kind: "invoice", doc: inv1, shop, customer: customers[0] });
  assert.deepEqual([e.typeCode, e.id, e.currency, e.flags], ["380", "SI-101", "AED", "00000000"]);
  assert.deepEqual([e.seller.trn, e.seller.tin, e.seller.emirate, e.buyer.trn, e.buyer.emirate], ["100123456700003", "1001234567", "SHJ", "100987654300003", "DXB"]);
  assert.deepEqual(e.lines.map((l) => [l.name, l.qty, l.net, l.discount, l.price, l.vat, l.category]), [["Oil Filter", 4, 100, 0, 25, 5, "S"], ["Brake Pad", 2, 280, 20, 150, 14, "S"]]);
  assert.deepEqual(e.breakdown, [{ category: "S", vatPerc: 5, taxable: 380, tax: 19 }]);
  assert.deepEqual([e.totals.taxExclusive, e.totals.tax, e.totals.taxInclusive, e.totals.payable], [380, 19, 399, 0]);
  assert.equal(e.allowance, null);
  assert.deepEqual(eInvoiceProblems(e, { doc: inv1, customer: customers[0], today }), []);
  assert.equal(eInvoiceState({ kind: "invoice", doc: inv1, shop, customer: customers[0], today }).live, "ready");
  assert.deepEqual([emirateCode("Ras Al Khaimah"), emirateCode("dxb"), emirateCode("Mars"), vatCategory(5), vatCategory(0), vatCategory(12)], ["RAK", "DXB", "", "S", "Z", ""]);
});

test("UBL XML: PINT AE ids, both parties, tax total, monetary total, lines; tags balance", () => {
  const xml = eInvoiceXml(buildEDocument({ kind: "invoice", doc: inv1, shop, customer: customers[0] }));
  ["<cbc:CustomizationID>urn:peppol:pint:billing-1@ae-1</cbc:CustomizationID>", "<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>", "<cbc:ProfileExecutionID>00000000</cbc:ProfileExecutionID>",
    '<cbc:EndpointID schemeID="0235">1001234567</cbc:EndpointID>', "<cbc:CompanyID>100987654300003</cbc:CompanyID>", "<cbc:CountrySubentity>SHJ</cbc:CountrySubentity>",
    '<cbc:TaxAmount currencyID="AED">19.00</cbc:TaxAmount>', '<cbc:TaxExclusiveAmount currencyID="AED">380.00</cbc:TaxExclusiveAmount>', '<cbc:PayableAmount currencyID="AED">0.00</cbc:PayableAmount>',
    '<cbc:PrepaidAmount currencyID="AED">399.00</cbc:PrepaidAmount>', '<cbc:InvoicedQuantity unitCode="H87">4</cbc:InvoicedQuantity>', "<cbc:Name>Brake Pad</cbc:Name>"].forEach((s) => assert.ok(xml.includes(s), s));
  const open = (xml.match(/<(cac|cbc):[A-Za-z]+[\s>]/g) || []).length;
  const close = (xml.match(/<\/(cac|cbc):[A-Za-z]+>/g) || []).length;
  const selfClosed = (xml.match(/<(cac|cbc):[A-Za-z]+[^>]*\/>/g) || []).length;
  assert.equal(open - selfClosed, close, "every element is closed");
  assert.ok(eInvoiceXml(buildEDocument({ kind: "invoice", doc: { ...inv1, note: "A & B <x>" }, shop, customer: customers[0] })).includes("<cbc:Note>A &amp; B &lt;x&gt;</cbc:Note>"));
});

test("blocked with reasons the shop can fix: buyer TRN / address, shop TRN, foreign currency, odd VAT rate", () => {
  const st = eInvoiceState({ kind: "invoice", doc: inv2, shop, customer: customers[1], today });
  assert.equal(st.live, "blocked");
  assert.deepEqual(st.problems, ["buyerTrn", "buyerAddress", "buyerEmirate"]);
  assert.match(reasonText("buyerTrn", false), /B2C/);
  assert.match(reasonText("buyerTrn", true), /TRN/);
  assert.ok(eInvoiceState({ kind: "invoice", doc: inv1, shop: { ...shop, trnNumber: "" }, customer: customers[0], today }).problems.includes("sellerTrn"));
  assert.ok(eInvoiceState({ kind: "invoice", doc: { ...inv1, currency: "USD" }, shop, customer: customers[0], today }).problems.includes("currency"));
  const odd = si("SI-9", "c1", [line("X", 1, 100, { vatPerc: 12, vatAmt: 12, lineTotal: 112 })]);
  assert.ok(eInvoiceState({ kind: "invoice", doc: odd, shop, customer: customers[0], today }).problems.includes("vatRate"));
  assert.ok(eInvoiceState({ kind: "invoice", doc: { ...inv1, invoiceType: "regular" }, shop, customer: customers[0], today }).problems.includes("notTax"));
  assert.ok(eInvoiceState({ kind: "invoice", doc: { ...inv1, customerId: null }, shop, customer: null, today }).problems.includes("buyerMaster"));
  assert.ok(eInvoiceState({ kind: "invoice", doc: { ...inv1, totalVat: 30 }, shop, customer: customers[0], today }).problems.includes("vatTotal"));
  // a blocked bill cannot be queued; nothing is ever marked sent
  assert.equal(eInvoiceRecord(st, { action: "queue" }).error, "blocked");
  assert.equal(eInvoiceRecord(st).status, "blocked");
  assert.deepEqual(eInvoiceRecord(st).errors, ["buyerTrn", "buyerAddress", "buyerEmirate"]);
});

test("bill-level discount becomes a document allowance; mixed VAT rates with one is blocked", () => {
  const disc = { ...inv1, grandTotal: 399 - 10.5, totalVat: 19 - 0.5 };
  const e = buildEDocument({ kind: "invoice", doc: disc, shop, customer: customers[0] });
  assert.deepEqual(e.allowance && [e.allowance.amount, e.allowance.charge], [10, false]);
  assert.deepEqual(e.breakdown, [{ category: "S", vatPerc: 5, taxable: 370, tax: 18.5 }], "VAT on the discounted total");
  assert.deepEqual(eInvoiceProblems(e, { doc: disc, customer: customers[0], today }), []);
  // VAT that does not match the taxable amount at 5% is caught
  assert.ok(eInvoiceProblems(buildEDocument({ kind: "invoice", doc: { ...disc, totalVat: 25, grandTotal: 395 }, shop, customer: customers[0] }), { doc: disc, customer: customers[0], today }).includes("vatTotal"));
  assert.ok(eInvoiceXml(e).includes('<cbc:AllowanceTotalAmount currencyID="AED">10.00</cbc:AllowanceTotalAmount>'));
  const mixed = si("SI-M", "c1", [line("A", 1, 100), { ...line("B", 1, 100), vatPerc: 0, vatAmt: 0, lineTotal: 100 }], { grandTotal: 195, totalVat: 5 });
  assert.ok(eInvoiceState({ kind: "invoice", doc: mixed, shop, customer: customers[0], today }).problems.includes("mixedAdjustment"));
});

test("credit notes: goods return from the bill's lines, value note as one money line; type 381 with the bill reference", () => {
  const gr = buildEDocument({ kind: "credit", doc: goodsReturn, original: inv1, shop, customer: customers[0] });
  assert.deepEqual([gr.typeCode, gr.billingRef], ["381", { id: "SI-101", issueDate: "2026-11-10" }]);
  assert.deepEqual(gr.lines.map((l) => [l.name, l.qty, l.net, l.vat]), [["Oil Filter", 2, 50, 2.5]]);
  assert.deepEqual(eInvoiceProblems(gr, { doc: goodsReturn, original: inv1, customer: customers[0], today }), []);
  const vn = buildEDocument({ kind: "credit", doc: valueNote, original: inv1, shop, customer: customers[0] });
  assert.deepEqual(vn.lines.map((l) => [l.name, l.qty, l.net, l.vat, l.vatPerc, l.category]), [["Rate difference", 1, 20, 1, 5, "S"]]);
  const xml = eInvoiceXml(vn);
  ["<CreditNote ", "<cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>", "<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>SI-101</cbc:ID>", "<cac:CreditNoteLine>", '<cbc:CreditedQuantity unitCode="H87">1</cbc:CreditedQuantity>'].forEach((s) => assert.ok(xml.includes(s), s));
  assert.ok(eInvoiceProblems(buildEDocument({ kind: "credit", doc: valueNote, original: null, shop, customer: customers[0] }), { doc: valueNote, original: null, customer: customers[0], today }).includes("noOriginal"));
});

test("status: never checked -> draft; checked -> ready; queued; a changed bill goes back to draft", () => {
  const base = { kind: "invoice", doc: inv1, shop, customer: customers[0], today };
  assert.equal(eInvoiceState(base).status, "draft");
  const rec = eInvoiceRecord(eInvoiceState(base), { uid: "u", by: "Owner", now: new Date("2026-11-20T10:00:00Z") });
  assert.deepEqual([rec.status, rec.errors, rec.validatedAt, rec.queuedAt], ["ready", [], "2026-11-20T10:00:00.000Z", null]);
  const checked = { ...base, doc: { ...inv1, eInvoice: rec } };
  assert.equal(eInvoiceState(checked).status, "ready");
  const q = eInvoiceRecord(eInvoiceState(checked), { action: "queue" });
  assert.equal(q.status, "queued");
  assert.equal(eInvoiceState({ ...base, doc: { ...inv1, eInvoice: q } }).status, "queued");
  const edited = { ...base, doc: { ...inv1, eInvoice: q, items: [inv1.items[0]], grandTotal: 105, totalVat: 5 } };
  assert.deepEqual([eInvoiceState(edited).status, eInvoiceState(edited).stale], ["draft", true]);
  assert.equal(payloadDigest("abc"), payloadDigest("abc"));
  assert.notEqual(payloadDigest("abc"), payloadDigest("abd"));
});

test("register: tax invoices and credit notes of the period; VAT201 unchanged by e-invoice fields", () => {
  const regular = { ...inv2, id: "SI-R", invoiceNo: "SI-R", invoiceType: "regular" };
  const list = eInvoiceDocs({ salesInvoices: [inv1, inv2, regular, { ...inv1, id: "SI-D", status: "draft" }], salesReturns: [goodsReturn, valueNote], customers, shopId: S, from: "2026-11-01", to: "2026-11-30" });
  assert.deepEqual(list.map((x) => [x.kind, x.doc.id]), [["invoice", "SI-101"], ["invoice", "SI-102"], ["credit", "SR-1"], ["credit", "SR-2"]]);
  const rows = registerRows(list.map((x) => ({ ...x, state: eInvoiceState({ ...x, shop, today }) })));
  assert.deepEqual(rows[0].slice(0, 9), ["Tax invoice (380)", "SI-101", "2026-11-10", "Al Noor Garage", "100987654300003", "380.00", "19.00", "399.00", "Not checked (ready)"]);
  assert.match(rows[1][9], /TRN/);
  // the VAT return reads the same figures whether or not bills carry an e-invoice status
  const data = { salesInvoices: [inv1, inv2], purchaseInvoices: [], extras: { salesReturns: [goodsReturn, valueNote], purchaseReturns: [] } };
  const tagged = { ...data, salesInvoices: data.salesInvoices.map((i) => ({ ...i, eInvoice: { status: "queued", digest: "x" } })), extras: { ...data.extras, salesReturns: data.extras.salesReturns.map((r) => ({ ...r, eInvoice: { status: "ready" } })) } };
  const a = computeVat(data, { shopId: S, from: "2026-11-01", to: "2026-11-30", customers }), b = computeVat(tagged, { shopId: S, from: "2026-11-01", to: "2026-11-30", customers });
  assert.deepEqual([a.outputVat, a.inputVat, a.payable], [b.outputVat, b.inputVat, b.payable]);
  assert.deepEqual(buildVat201(a, { customers, shopEmirate: "Sharjah" }), buildVat201(b, { customers, shopEmirate: "Sharjah" }));
});
