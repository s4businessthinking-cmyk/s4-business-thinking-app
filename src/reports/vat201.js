// UAE VAT return (FTA VAT201) laid out box by box from the Tax page's own VAT figures (computeVat), so the
// numbers to type into the FTA portal come straight from the bills. Nothing is filed: S4 never submits to FTA.
// - Boxes 1a-1g: standard-rated sales (taxable value and VAT) by Emirate of the customer - the customer's Emirate /
//   city / area is read through common spellings (Dubai, DXB, Deira...); a bill with no customer uses the shop's
//   Emirate. Sales that cannot be placed are listed, and still counted in box 8 so the VAT due is right.
// - Box 4 or 5: sales without VAT, as zero-rated (4, the default) or exempt (5) - the owner's choice.
// - Box 9: purchases and expense bills with VAT from suppliers with a TRN (recoverable). Bills from a supplier
//   without a TRN stay out of box 9 and are listed.
// - Boxes 2, 3, 6, 7, 10 (tourist refunds, reverse charge, imports): S4 bills do not record these, so the boxes are
//   marked "not tracked" - enter them on the portal from your customs / import papers if you have any.
// - Credit notes (returns and value notes) are already netted into the boxes of the period they were made in.
import { UAE_EMIRATES } from "./taxDomain.js";
import { r2 } from "./reportFilters.js";

const ALIASES = {
  "Abu Dhabi": ["abu dhabi", "abudhabi", "auh", "al ain", "alain", "mussafah", "musaffah", "ruwais", "madinat zayed", "khalifa city"],
  Dubai: ["dubai", "dxb", "deira", "bur dubai", "jebel ali", "al quoz", "karama", "qusais", "al qusais", "satwa", "jumeirah", "al barsha", "dip", "ras al khor"],
  Sharjah: ["sharjah", "shj", "khor fakkan", "khorfakkan", "kalba", "dhaid", "al dhaid", "industrial area", "sajaa"],
  Ajman: ["ajman", "ajm"],
  "Umm Al Quwain": ["umm al quwain", "umm al qaiwain", "uaq"],
  "Ras Al Khaimah": ["ras al khaimah", "ras al khaima", "rak"],
  Fujairah: ["fujairah", "fujeirah", "fuj", "dibba"],
};
const clean = (v) => String(v || "").toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();

/** Emirate for a free-text Emirate / city / area ("" when it can't be told). */
export function emirateOf(text) {
  const t = clean(text);
  if (!t) return "";
  for (const em of UAE_EMIRATES) if (t === clean(em)) return em;
  for (const [em, list] of Object.entries(ALIASES)) {
    if (list.some((a) => (a.length <= 3 ? t.split(" ").includes(a) : ` ${t} `.includes(` ${a} `)))) return em;
  }
  return "";
}

const partyText = (c) => [c?.emirate, c?.city, c?.area].filter(Boolean);
const emirateOfParty = (c) => { for (const t of partyText(c)) { const em = emirateOf(t); if (em) return em; } return ""; };
const sumOf = (rows, k) => r2(rows.reduce((t, r) => t + (Number(r[k]) || 0), 0));
const TRACKED_NOT = new Set(["2", "3", "6", "7", "10"]);

/**
 * vat: computeVat(...) result. -> { boxes: [{ id, en, bn, amount, vat, adjustment, tracked, rows }], unmapped, excluded, totals }
 * Box ids: 1a-1g, 2-14 (with only the boxes the FTA form has).
 */
export function buildVat201(vat, { customers = [], shopEmirate = "", noVatBox = "4" } = {}) {
  if (!vat) return null;
  const byId = new Map(customers.map((c) => [c.id, c]));
  const shopEm = emirateOf(shopEmirate);
  const stdSales = vat.salesRows.filter((r) => r.std);
  const noVatSales = vat.salesRows.filter((r) => !r.std);
  const stdPurch = vat.purchaseRows.filter((r) => r.std);
  const excluded = vat.purchaseRows.filter((r) => r.noTrn);

  const byEmirate = new Map(UAE_EMIRATES.map((e) => [e, []]));
  const unmappedRows = [];
  stdSales.forEach((r) => {
    const c = r.partyId ? byId.get(r.partyId) : null;
    const em = (c ? emirateOfParty(c) : "") || (!c || !partyText(c).length ? shopEm : "");
    if (em) byEmirate.get(em).push(r); else unmappedRows.push(r);
  });
  const box = (id, en, bn, rows, extra = {}) => ({ id, en, bn, amount: sumOf(rows, "taxable"), vat: sumOf(rows, "vat"), adjustment: 0, tracked: !TRACKED_NOT.has(id), rows, ...extra });
  const empty = (id, en, bn) => ({ id, en, bn, amount: 0, vat: 0, adjustment: 0, tracked: false, rows: [] });

  const emBoxes = UAE_EMIRATES.map((em, i) => box(`1${String.fromCharCode(97 + i)}`, `Standard rated supplies in ${em}`, `${em}-এ স্ট্যান্ডার্ড রেটের বিক্রি`, byEmirate.get(em), { emirate: em }));
  const zero = noVatBox === "5" ? [] : noVatSales;
  const exempt = noVatBox === "5" ? noVatSales : [];
  const outBoxes = [
    ...emBoxes,
    empty("2", "Tax refunds provided to tourists", "পর্যটকদের VAT ফেরত"),
    empty("3", "Supplies subject to the reverse charge", "রিভার্স চার্জের সরবরাহ"),
    box("4", "Zero rated supplies", "জিরো-রেটেড বিক্রি", zero),
    box("5", "Exempt supplies", "VAT-মুক্ত বিক্রি", exempt),
    empty("6", "Goods imported into the UAE", "UAE-তে আমদানি করা মাল"),
    empty("7", "Adjustments to goods imported into the UAE", "আমদানির সমন্বয়"),
  ];
  const unmapped = { amount: sumOf(unmappedRows, "taxable"), vat: sumOf(unmappedRows, "vat"), rows: unmappedRows,
    parties: [...new Map(unmappedRows.map((r) => [r.partyId || r.party, { partyId: r.partyId, party: byId.get(r.partyId)?.customerName || r.party || "-", text: partyText(byId.get(r.partyId)).join(", ") }])).values()] };
  const b8 = { id: "8", en: "Totals", bn: "মোট (বিক্রি)", amount: r2(outBoxes.reduce((t, b) => t + b.amount, 0) + unmapped.amount), vat: r2(outBoxes.reduce((t, b) => t + b.vat, 0) + unmapped.vat), adjustment: 0, tracked: true, rows: [], total: true };
  const b9 = box("9", "Standard rated expenses", "স্ট্যান্ডার্ড রেটের ক্রয় ও খরচ", stdPurch);
  const b10 = empty("10", "Supplies subject to the reverse charge", "রিভার্স চার্জের ক্রয়");
  const b11 = { id: "11", en: "Totals", bn: "মোট (ক্রয়)", amount: b9.amount, vat: b9.vat, adjustment: 0, tracked: true, rows: [], total: true };
  const due = b8.vat, recoverable = b11.vat, payable = r2(due - recoverable);
  const net = [
    { id: "12", en: "Total value of due tax for the period", bn: "এই সময়ের মোট দেয় VAT", amount: null, vat: due, tracked: true, rows: [], total: true },
    { id: "13", en: "Total value of recoverable tax for the period", bn: "এই সময়ের মোট ফেরতযোগ্য VAT", amount: null, vat: recoverable, tracked: true, rows: [], total: true },
    { id: "14", en: payable >= 0 ? "Payable tax for the period" : "Refundable tax for the period", bn: payable >= 0 ? "এই সময়ে দিতে হবে" : "এই সময়ে ফেরত পাবেন", amount: null, vat: payable, tracked: true, rows: [], total: true },
  ];
  return {
    boxes: [...outBoxes, b8, b9, b10, b11, ...net], unmapped,
    excluded: { amount: sumOf(excluded, "taxable"), vat: sumOf(excluded, "vat"), rows: excluded },
    totals: { due, recoverable, payable },
    agrees: Math.abs(due - vat.outputVat) < 0.01 && Math.abs(recoverable - vat.inputVat) < 0.01,
  };
}

export const VAT201_COLS = ["Box", "Description", "Amount (AED)", "VAT amount (AED)", "Adjustment (AED)", "Note"];
/** CSV rows ready to type into the FTA portal. */
export function vat201Rows(ret) {
  const num = (v) => (v == null ? "" : r2(v).toFixed(2));
  return [
    VAT201_COLS,
    ...ret.boxes.map((b) => [b.id, b.en, num(b.amount), num(b.vat), b.amount == null ? "" : num(b.adjustment), b.tracked ? "" : "Not tracked in S4 - enter from your own records if any"]),
    ...(ret.unmapped.rows.length ? [["", "Sales not allocated to an Emirate (included in box 8)", num(ret.unmapped.amount), num(ret.unmapped.vat), "", "Set the customer's Emirate and allocate before filing"]] : []),
    ...(ret.excluded.rows.length ? [["", "Purchases from suppliers without TRN (not in box 9)", num(ret.excluded.amount), num(ret.excluded.vat), "", "Not recoverable until the supplier's TRN is on file"]] : []),
  ];
}
export const vat201FileName = (from, to) => `vat201-${from || "start"}-${to || "end"}.csv`;
