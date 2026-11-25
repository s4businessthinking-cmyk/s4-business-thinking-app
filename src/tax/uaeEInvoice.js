// UAE e-invoicing (Peppol PINT AE): builds the structured e-invoice of a tax invoice, and the e-credit note of a sales
// return / value note, from the documents S4 already keeps - no second bill engine. The UAE model is the Peppol
// "5-corner" one: the shop's Accredited Service Provider (ASP) receives the UBL 2.1 XML, runs the official PINT AE
// validation, delivers it to the buyer's ASP and reports it to the FTA. S4 therefore does the local half:
//   1. the document model with the fields the format needs (seller / buyer TRN, address and emirate, lines, VAT
//      category and amount per line, VAT breakdown, totals, currency, type, reference to the original bill);
//   2. readiness checks the shop can fix (status Ready | Blocked, each reason in BN + EN);
//   3. the UBL XML payload (Invoice 380 / CreditNote 381);
//   4. a status kept on the document (eInvoice: draft / ready / blocked / queued for the ASP).
// Nothing here talks to a government or ASP service: there is no API client, so nothing is ever marked sent or
// cleared. PINT AE sets no general QR code requirement, so no QR is produced.

const num = (v) => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
const r2 = (v) => Math.round((num(v) + Number.EPSILON) * 100) / 100;
const r4 = (v) => Math.round((num(v) + Number.EPSILON) * 10000) / 10000;
const clean = (v) => String(v ?? "").trim();
const day = (v) => String(v || "").slice(0, 10);

export const PINT_AE_CUSTOMIZATION = "urn:peppol:pint:billing-1@ae-1";
export const PINT_PROFILE = "urn:peppol:bis:billing";
// Participant identifier scheme for UAE TINs (the first 10 digits of the 15-digit TRN)
export const UAE_ENDPOINT_SCHEME = "0235";
// Invoice transaction type flags (free zone, deemed supply, margin scheme, summary, continuous supply, disclosed
// agent, e-commerce, exports): none of these special cases are raised by S4's ordinary tax invoices.
export const DEFAULT_TRANSACTION_FLAGS = "00000000";
export const EINVOICE_STATUSES = ["draft", "ready", "blocked", "queued"];
export const EMIRATE_CODES = { "Abu Dhabi": "AUH", Dubai: "DXB", Sharjah: "SHJ", Ajman: "AJM", "Umm Al Quwain": "UAQ", "Ras Al Khaimah": "RAK", Fujairah: "FUJ" };
const LIVE = ["confirmed", "partial", "paid"];

export const emirateCode = (name) => {
  const v = clean(name);
  if (!v) return "";
  if (Object.values(EMIRATE_CODES).includes(v.toUpperCase())) return v.toUpperCase();
  const hit = Object.keys(EMIRATE_CODES).find((k) => k.toLowerCase() === v.toLowerCase());
  return hit ? EMIRATE_CODES[hit] : "";
};
const trnOk = (v) => /^\d{15}$/.test(clean(v).replace(/[\s-]/g, ""));
const trnOf = (v) => clean(v).replace(/[\s-]/g, "");
/** VAT category of a line: S standard (5%), Z zero-rated; anything else is not a UAE rate. */
export const vatCategory = (perc) => (Math.abs(num(perc) - 5) < 1e-6 ? "S" : Math.abs(num(perc)) < 1e-6 ? "Z" : "");

const REASON = {
  sellerTrn: ["দোকানের TRN (১৫ সংখ্যা) নেই - সেটিংস > দোকানের তথ্য", "Shop TRN (15 digits) missing - Settings > Shop info"],
  sellerName: ["দোকানের নাম নেই", "Shop name missing"],
  sellerAddress: ["দোকানের ঠিকানা নেই - সেটিংস > দোকানের তথ্য", "Shop address missing - Settings > Shop info"],
  sellerEmirate: ["দোকানের এমিরেট নেই - সেটিংস > দোকানের তথ্য", "Shop emirate missing - Settings > Shop info"],
  notTax: ["এটা ট্যাক্স ইনভয়েস নয় (শুধু ট্যাক্স ইনভয়েসের ই-ইনভয়েস হয়)", "Not a tax invoice (only tax invoices are e-invoiced)"],
  buyerMaster: ["কাস্টমার মাস্টারে নেই - বিলে মাস্টারের কাস্টমার বাছুন", "Customer is not in the customer master - pick a master customer on the bill"],
  buyerTrn: ["কাস্টমারের TRN (১৫ সংখ্যা) নেই - VAT-নিবন্ধিত ব্যবসা হলে কাস্টমার মাস্টারে TRN দিন; সাধারণ ভোক্তার (B2C) বিক্রি এই পর্যায়ের ই-ইনভয়েসের বাইরে", "Customer TRN (15 digits) missing - for a VAT-registered business add the TRN on the customer master; a sale to a consumer (B2C) is outside this e-invoicing phase"],
  buyerName: ["কাস্টমারের নাম নেই", "Customer name missing"],
  buyerAddress: ["কাস্টমারের ঠিকানা নেই - কাস্টমার মাস্টারে দিন", "Customer address missing - add it on the customer master"],
  buyerEmirate: ["কাস্টমারের এমিরেট নেই - কাস্টমার মাস্টারে দিন", "Customer emirate missing - add it on the customer master"],
  currency: ["AED ছাড়া অন্য মুদ্রার বিল এখনো সাপোর্ট নেই", "Bills in a currency other than AED are not supported yet"],
  noLines: ["কোনো লাইন নেই", "No lines"],
  lineName: ["কোনো লাইনে আইটেমের নাম নেই", "A line has no item name"],
  lineQty: ["কোনো লাইনে পরিমাণ ০", "A line has quantity 0"],
  vatRate: ["VAT হার ৫% বা ০% নয় এমন লাইন আছে", "A line has a VAT rate other than 5% or 0%"],
  totals: ["লাইনের যোগফল বিলের মোটের সাথে মেলে না", "The lines do not add up to the bill total"],
  vatTotal: ["লাইনের VAT বিলের VAT-এর সাথে মেলে না", "The line VAT does not add up to the bill VAT"],
  mixedAdjustment: ["বিলের সমন্বয় / ছাড় একাধিক VAT হারে ভাগ করা যায় না", "A bill-level adjustment cannot be split across VAT rates"],
  future: ["তারিখ ভবিষ্যতে", "The date is in the future"],
  noOriginal: ["মূল বিল পাওয়া যায়নি", "The original bill was not found"],
  originalNotTax: ["মূল বিল ট্যাক্স ইনভয়েস নয়", "The original bill is not a tax invoice"],
};
export const reasonText = (id, bn = false) => (REASON[id] ? REASON[id][bn ? 0 : 1] : id);

function party({ name, trn, address, city, emirate, country = "AE", licence = "" }) {
  const t = trnOf(trn);
  return { name: clean(name), trn: t, tin: t.slice(0, 10), address: clean(address), city: clean(city), emirate: emirateCode(emirate), emirateName: clean(emirate), country, licence: clean(licence) };
}
const seller = (shop) => party({ name: shop?.companyName, trn: shop?.trnNumber, address: shop?.address || shop?.area, city: shop?.city || shop?.area, emirate: shop?.emirate, licence: shop?.tradeLicenseNumber });
const buyer = (doc, customer) => party({
  name: customer?.customerName || doc?.customerName, trn: customer?.trnNumber || doc?.customerTrn,
  address: customer?.address || doc?.customerAddress, city: customer?.city || customer?.area, emirate: customer?.emirate, licence: customer?.tradeLicenseNumber,
});

/** Lines of a tax invoice: net (after line discount, before VAT), VAT, category. */
function invoiceLines(inv) {
  return (inv.items || []).map((it, i) => {
    const qty = num(it.qty), vat = r2(it.vatAmt), net = r2(num(it.lineTotal) - vat), disc = r2(it.discountAmt);
    return { id: String(i + 1), name: clean(it.name), code: clean(it.code), unit: clean(it.unit) || "Pcs", qty, net, discount: disc, price: qty > 0 ? r4((net + disc) / qty) : 0, vatPerc: num(it.vatPerc), vat, category: vatCategory(it.vatPerc) };
  });
}

/** Lines of a credit note: a goods return takes its lines from the bill (pro rata); a value note is one money line. */
function creditLines(ret, inv) {
  if (ret.noteType === "value" || !(ret.items || []).length) {
    const vat = r2(ret.totalVat), net = r2(num(ret.total) - vat);
    const perc = net > 0 && vat > 0 ? Math.round((vat / net) * 10000) / 100 : 0;
    return [{ id: "1", name: clean(ret.reason || ret.note) || `Credit on ${inv?.invoiceNo || ""}`.trim(), code: "", unit: "Pcs", qty: 1, net, discount: 0, price: net, vatPerc: perc, vat, category: vatCategory(perc) }];
  }
  const src = inv?.items || [];
  return (ret.items || []).map((it, i) => {
    const line = src[Number(it.lineIndex)] || {};
    const sold = num(line.qty) || 1, qty = num(it.qty), share = qty / sold;
    const vat = r2(num(line.vatAmt) * share), net = r2((num(line.lineTotal) - num(line.vatAmt)) * share);
    return { id: String(i + 1), name: clean(line.name || it.name), code: clean(line.code || it.code), unit: clean(line.unit) || "Pcs", qty, net, discount: 0, price: qty > 0 ? r4(net / qty) : 0, vatPerc: num(line.vatPerc), vat, category: vatCategory(line.vatPerc) };
  });
}

/**
 * The e-document of a sales invoice (kind "invoice") or sales return / value note (kind "credit").
 * -> { kind, typeCode, id, issueDate, currency, flags, seller, buyer, lines, allowance, breakdown, totals, billingRef, source }
 */
export function buildEDocument({ kind = "invoice", doc, original = null, shop, customer = null }) {
  const credit = kind === "credit";
  const inv = credit ? original : doc;
  const lines = credit ? creditLines(doc, original) : invoiceLines(doc);
  const totalVat = r2(credit ? doc.totalVat : doc.totalVat);
  const grand = r2(credit ? doc.total : doc.grandTotal);
  const taxExclusive = r2(grand - totalVat);
  const lineNet = r2(lines.reduce((t, l) => t + l.net, 0));
  // bill-level adjustment / discount after the lines (an allowance when negative, a charge when positive)
  const adjust = r2(taxExclusive - lineNet);
  const cats = [...new Set(lines.map((l) => `${l.category}|${l.vatPerc}`))];
  const allowance = Math.abs(adjust) >= 0.005 ? { amount: Math.abs(adjust), charge: adjust > 0, category: lines[0]?.category || "", vatPerc: lines[0]?.vatPerc || 0, reason: adjust > 0 ? "Adjustment" : "Discount" } : null;
  const breakdown = cats.map((key) => {
    const [category, perc] = key.split("|");
    const ls = lines.filter((l) => `${l.category}|${l.vatPerc}` === key);
    const taxable = r2(ls.reduce((t, l) => t + l.net, 0) + (allowance && cats.length === 1 ? (allowance.charge ? allowance.amount : -allowance.amount) : 0));
    // with a bill-level discount / charge the bill's VAT is worked out on the adjusted total, so it is the category's tax
    const tax = allowance && cats.length === 1 ? totalVat : r2(ls.reduce((t, l) => t + l.vat, 0));
    return { category, vatPerc: num(perc), taxable, tax };
  });
  return {
    kind, typeCode: credit ? "381" : "380", id: clean(credit ? doc.returnNo : doc.invoiceNo), issueDate: day(credit ? doc.returnDate : doc.invoiceDate),
    currency: clean(inv?.currency || doc.currency || "AED").toUpperCase() || "AED", flags: DEFAULT_TRANSACTION_FLAGS,
    seller: seller(shop), buyer: buyer(inv || doc, customer), lines, allowance, breakdown,
    totals: { lineNet, taxExclusive, tax: totalVat, taxInclusive: grand, paid: credit ? 0 : r2(doc.amountPaid), payable: credit ? grand : r2(grand - num(doc.amountPaid)), lineVat: r2(lines.reduce((t, l) => t + l.vat, 0)) },
    billingRef: credit && original ? { id: clean(original.invoiceNo), issueDate: day(original.invoiceDate) } : null,
    note: clean(credit ? doc.reason || doc.note : doc.note),
    source: { collection: credit ? "salesReturns" : "salesInvoices", id: doc.id },
  };
}

/** Readiness: [] = Ready; else reason ids (reasonText() gives BN / EN). */
export function eInvoiceProblems(edoc, { doc, original = null, customer = null, today = "" }) {
  const out = [];
  const s = edoc.seller, b = edoc.buyer;
  if (!trnOk(s.trn)) out.push("sellerTrn");
  if (!s.name) out.push("sellerName");
  if (!s.address) out.push("sellerAddress");
  if (!s.emirate) out.push("sellerEmirate");
  if (edoc.kind === "credit") {
    if (!original) out.push("noOriginal");
    else if (original.invoiceType !== "tax") out.push("originalNotTax");
  } else if (doc.invoiceType !== "tax") out.push("notTax");
  const billCustomer = edoc.kind === "credit" ? original : doc;
  if (!customer && !billCustomer?.customerId) out.push("buyerMaster");
  if (!trnOk(b.trn)) out.push("buyerTrn");
  if (!b.name) out.push("buyerName");
  if (!b.address) out.push("buyerAddress");
  if (!b.emirate) out.push("buyerEmirate");
  if (edoc.currency !== "AED") out.push("currency");
  if (!edoc.lines.length) out.push("noLines");
  if (edoc.lines.some((l) => !l.name)) out.push("lineName");
  if (edoc.lines.some((l) => !(l.qty > 0))) out.push("lineQty");
  if (edoc.lines.some((l) => !l.category)) out.push("vatRate");
  if (edoc.allowance && edoc.breakdown.length > 1) out.push("mixedAdjustment");
  // VAT: the breakdown adds up to the bill's VAT, and each category's tax is its taxable amount at its rate
  // (line-by-line rounding allowed: one fils per line)
  const tolerance = 0.01 * Math.max(1, edoc.lines.length);
  const breakdownTax = r2(edoc.breakdown.reduce((t, x) => t + x.tax, 0));
  if (Math.abs(breakdownTax - edoc.totals.tax) > tolerance || edoc.breakdown.some((x) => Math.abs(r2((x.taxable * x.vatPerc) / 100) - x.tax) > tolerance)) out.push("vatTotal");
  const sumTaxable = r2(edoc.breakdown.reduce((t, x) => t + x.taxable, 0));
  if (!edoc.allowance || edoc.breakdown.length === 1) { if (Math.abs(sumTaxable - edoc.totals.taxExclusive) > 0.01) out.push("totals"); }
  if (today && edoc.issueDate > today) out.push("future");
  return [...new Set(out)];
}

// ---- UBL 2.1 XML ----

const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const amt = (v, cur) => `currencyID="${esc(cur)}">${r2(v).toFixed(2)}`;
const unitCode = (unit) => (/^(pcs?|piece|nos?|ea|each|unit)$/i.test(clean(unit)) ? "H87" : "C62");

function partyXml(tag, p) {
  return [
    `  <cac:${tag}>`, "    <cac:Party>",
    p.tin ? `      <cbc:EndpointID schemeID="${UAE_ENDPOINT_SCHEME}">${esc(p.tin)}</cbc:EndpointID>` : "",
    "      <cac:PostalAddress>",
    p.address ? `        <cbc:StreetName>${esc(p.address)}</cbc:StreetName>` : "",
    p.city ? `        <cbc:CityName>${esc(p.city)}</cbc:CityName>` : "",
    p.emirate ? `        <cbc:CountrySubentity>${esc(p.emirate)}</cbc:CountrySubentity>` : "",
    `        <cac:Country><cbc:IdentificationCode>${esc(p.country)}</cbc:IdentificationCode></cac:Country>`,
    "      </cac:PostalAddress>",
    "      <cac:PartyTaxScheme>", `        <cbc:CompanyID>${esc(p.trn)}</cbc:CompanyID>`, "        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>", "      </cac:PartyTaxScheme>",
    "      <cac:PartyLegalEntity>", `        <cbc:RegistrationName>${esc(p.name)}</cbc:RegistrationName>`, p.licence ? `        <cbc:CompanyID>${esc(p.licence)}</cbc:CompanyID>` : "", "      </cac:PartyLegalEntity>",
    "    </cac:Party>", `  </cac:${tag}>`,
  ].filter(Boolean).join("\n");
}
const taxCategoryXml = (tag, category, perc, indent) => [`${indent}<cac:${tag}>`, `${indent}  <cbc:ID>${category}</cbc:ID>`, `${indent}  <cbc:Percent>${num(perc).toFixed(2)}</cbc:Percent>`, `${indent}  <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>`, `${indent}</cac:${tag}>`].join("\n");

/** The UBL 2.1 Invoice / CreditNote XML for PINT AE. */
export function eInvoiceXml(edoc) {
  const credit = edoc.kind === "credit";
  const root = credit ? "CreditNote" : "Invoice";
  const cur = edoc.currency;
  const lineTag = credit ? "CreditNoteLine" : "InvoiceLine";
  const qtyTag = credit ? "CreditedQuantity" : "InvoicedQuantity";
  const lines = edoc.lines.map((l) => [
    `  <cac:${lineTag}>`, `    <cbc:ID>${esc(l.id)}</cbc:ID>`, `    <cbc:${qtyTag} unitCode="${unitCode(l.unit)}">${r4(l.qty)}</cbc:${qtyTag}>`,
    `    <cbc:LineExtensionAmount ${amt(l.net, cur)}</cbc:LineExtensionAmount>`,
    l.discount > 0 ? [`    <cac:AllowanceCharge>`, `      <cbc:ChargeIndicator>false</cbc:ChargeIndicator>`, `      <cbc:AllowanceChargeReason>Discount</cbc:AllowanceChargeReason>`, `      <cbc:Amount ${amt(l.discount, cur)}</cbc:Amount>`, `    </cac:AllowanceCharge>`].join("\n") : "",
    `    <cac:TaxTotal><cbc:TaxAmount ${amt(l.vat, cur)}</cbc:TaxAmount></cac:TaxTotal>`,
    "    <cac:Item>", `      <cbc:Name>${esc(l.name)}</cbc:Name>`, l.code ? `      <cac:SellersItemIdentification><cbc:ID>${esc(l.code)}</cbc:ID></cac:SellersItemIdentification>` : "",
    taxCategoryXml("ClassifiedTaxCategory", l.category, l.vatPerc, "      "), "    </cac:Item>",
    `    <cac:Price><cbc:PriceAmount currencyID="${esc(cur)}">${r4(l.price)}</cbc:PriceAmount></cac:Price>`, `  </cac:${lineTag}>`,
  ].filter(Boolean).join("\n"));
  const a = edoc.allowance;
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<${root} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${root}-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">`,
    `  <cbc:CustomizationID>${PINT_AE_CUSTOMIZATION}</cbc:CustomizationID>`, `  <cbc:ProfileID>${PINT_PROFILE}</cbc:ProfileID>`, `  <cbc:ProfileExecutionID>${edoc.flags}</cbc:ProfileExecutionID>`,
    `  <cbc:ID>${esc(edoc.id)}</cbc:ID>`, `  <cbc:IssueDate>${esc(edoc.issueDate)}</cbc:IssueDate>`,
    `  <cbc:${credit ? "CreditNoteTypeCode" : "InvoiceTypeCode"}>${edoc.typeCode}</cbc:${credit ? "CreditNoteTypeCode" : "InvoiceTypeCode"}>`,
    edoc.note ? `  <cbc:Note>${esc(edoc.note)}</cbc:Note>` : "",
    `  <cbc:DocumentCurrencyCode>${esc(cur)}</cbc:DocumentCurrencyCode>`,
    edoc.billingRef ? `  <cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${esc(edoc.billingRef.id)}</cbc:ID><cbc:IssueDate>${esc(edoc.billingRef.issueDate)}</cbc:IssueDate></cac:InvoiceDocumentReference></cac:BillingReference>` : "",
    partyXml("AccountingSupplierParty", edoc.seller), partyXml("AccountingCustomerParty", edoc.buyer),
    a ? [`  <cac:AllowanceCharge>`, `    <cbc:ChargeIndicator>${a.charge ? "true" : "false"}</cbc:ChargeIndicator>`, `    <cbc:AllowanceChargeReason>${a.reason}</cbc:AllowanceChargeReason>`, `    <cbc:Amount ${amt(a.amount, cur)}</cbc:Amount>`, taxCategoryXml("TaxCategory", a.category, a.vatPerc, "    "), `  </cac:AllowanceCharge>`].join("\n") : "",
    "  <cac:TaxTotal>", `    <cbc:TaxAmount ${amt(edoc.totals.tax, cur)}</cbc:TaxAmount>`,
    ...edoc.breakdown.map((x) => ["    <cac:TaxSubtotal>", `      <cbc:TaxableAmount ${amt(x.taxable, cur)}</cbc:TaxableAmount>`, `      <cbc:TaxAmount ${amt(x.tax, cur)}</cbc:TaxAmount>`, taxCategoryXml("TaxCategory", x.category, x.vatPerc, "      "), "    </cac:TaxSubtotal>"].join("\n")),
    "  </cac:TaxTotal>",
    "  <cac:LegalMonetaryTotal>",
    `    <cbc:LineExtensionAmount ${amt(edoc.totals.lineNet, cur)}</cbc:LineExtensionAmount>`,
    `    <cbc:TaxExclusiveAmount ${amt(edoc.totals.taxExclusive, cur)}</cbc:TaxExclusiveAmount>`,
    `    <cbc:TaxInclusiveAmount ${amt(edoc.totals.taxInclusive, cur)}</cbc:TaxInclusiveAmount>`,
    a && !a.charge ? `    <cbc:AllowanceTotalAmount ${amt(a.amount, cur)}</cbc:AllowanceTotalAmount>` : "",
    a && a.charge ? `    <cbc:ChargeTotalAmount ${amt(a.amount, cur)}</cbc:ChargeTotalAmount>` : "",
    edoc.totals.paid > 0 ? `    <cbc:PrepaidAmount ${amt(edoc.totals.paid, cur)}</cbc:PrepaidAmount>` : "",
    `    <cbc:PayableAmount ${amt(edoc.totals.payable, cur)}</cbc:PayableAmount>`,
    "  </cac:LegalMonetaryTotal>",
    ...lines,
    `</${root}>`, "",
  ].filter(Boolean).join("\n");
  return xml;
}

/** Short digest of a payload (FNV-1a) - tells whether a bill changed after it was checked. Not a signature. */
export function payloadDigest(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

/**
 * Everything the panel shows for one document. saved: doc.eInvoice. -> { edoc, problems, live, status, xml, digest, stale }
 * status: the saved one (queued / ready / blocked) unless the bill changed since, then "draft"; never saved -> "draft".
 */
export function eInvoiceState({ kind, doc, original, shop, customer, today = "" }) {
  const edoc = buildEDocument({ kind, doc, original, shop, customer });
  const problems = eInvoiceProblems(edoc, { doc, original, customer, today });
  const xml = eInvoiceXml(edoc);
  const digest = payloadDigest(xml);
  const saved = doc.eInvoice || null;
  const stale = !!saved && saved.digest && saved.digest !== digest;
  const status = !saved || stale ? "draft" : EINVOICE_STATUSES.includes(saved.status) ? saved.status : "draft";
  return { edoc, problems, live: problems.length ? "blocked" : "ready", status, xml, digest, stale };
}

/** The status kept on the document after a check / queue. Queue only a Ready document. */
export function eInvoiceRecord(state, { action = "validate", uid = "", by = "", now = new Date() } = {}) {
  const at = new Date(now).toISOString();
  if (action === "queue") {
    if (state.problems.length) return { error: "blocked" };
    return { status: "queued", errors: [], digest: state.digest, validatedAt: at, queuedAt: at, by, uid, format: "PINT AE (UBL 2.1)" };
  }
  if (action === "unqueue") return { status: "ready", errors: [], digest: state.digest, validatedAt: at, queuedAt: null, by, uid, format: "PINT AE (UBL 2.1)" };
  return { status: state.problems.length ? "blocked" : "ready", errors: state.problems, digest: state.digest, validatedAt: at, queuedAt: null, by, uid, format: "PINT AE (UBL 2.1)" };
}

/** Tax invoices and credit notes in a period for the register: [{ kind, doc, original, customer }] */
export function eInvoiceDocs({ salesInvoices = [], salesReturns = [], customers = [], shopId = "", from = "", to = "" }) {
  const byId = new Map(salesInvoices.map((i) => [i.id, i]));
  const custById = new Map(customers.filter((c) => c?.id).map((c) => [c.id, c]));
  const live = (d) => d && !d.isDeleted && (!shopId || !d.shopId || d.shopId === shopId);
  const inRange = (d) => (!from || d >= from) && (!to || d <= to);
  // tax invoices only; a credit note on a non-tax bill is listed and shown blocked (originalNotTax)
  const invoices = salesInvoices.filter((i) => live(i) && LIVE.includes(i.status) && i.invoiceType === "tax" && i.docKind !== "quotation" && i.source !== "openingBalance" && inRange(day(i.invoiceDate)))
    .map((doc) => ({ kind: "invoice", doc, original: null, customer: custById.get(doc.customerId) || null }));
  const credits = salesReturns.filter((r) => live(r) && r.status !== "cancelled" && r.status !== "draft" && inRange(day(r.returnDate)))
    .map((doc) => { const original = byId.get(doc.invoiceId) || null; return { kind: "credit", doc, original, customer: custById.get(original?.customerId || doc.partyId) || null }; });
  return [...invoices, ...credits].sort((a, b) => day(a.kind === "credit" ? a.doc.returnDate : a.doc.invoiceDate).localeCompare(day(b.kind === "credit" ? b.doc.returnDate : b.doc.invoiceDate)));
}

export const REGISTER_COLS = ["Type", "No", "Date", "Customer", "Customer TRN", "Taxable (AED)", "VAT (AED)", "Total (AED)", "Status", "Reasons"];
export function registerRows(items) {
  return items.map(({ state, kind }) => [kind === "credit" ? "Credit note (381)" : "Tax invoice (380)", state.edoc.id, state.edoc.issueDate, state.edoc.buyer.name, state.edoc.buyer.trn,
    r2(state.edoc.totals.taxExclusive).toFixed(2), r2(state.edoc.totals.tax).toFixed(2), r2(state.edoc.totals.taxInclusive).toFixed(2),
    state.status === "draft" ? `Not checked (${state.live})` : state.status, state.problems.map((p) => reasonText(p)).join("; ") || (state.stale ? "Changed since it was checked" : "")]);
}
