// UAE VAT return (FTA VAT201) laid out box by box from the Tax page's own VAT figures (computeVat), so the
// numbers to type into the FTA portal come straight from the bills. Nothing is filed: S4 never submits to FTA.
// - Boxes 1a-1g: standard-rated sales (taxable value and VAT) by Emirate of the customer - the customer's Emirate /
//   city / area is read through common spellings (Dubai, DXB, Deira...); a bill with no customer uses the shop's
//   Emirate. Sales that cannot be placed are listed, and still counted in box 8 so the VAT due is right.
// - Box 4 or 5: sales without VAT, as zero-rated (4, the default) or exempt (5) - the owner's choice.
// - Box 9: purchases and expense bills with VAT from suppliers with a TRN (recoverable). Bills from a supplier
//   without a TRN stay out of box 9 and are listed.
// - Boxes 2, 3, 6, 7, 10 (tourist refunds, reverse charge, imports): S4 bills do not record these. The owner enters
//   them by hand from the customs declaration / supplier papers (vat201Entries, kept under the shop's taxSettings); an
//   entry counts in the period that holds its date. Box 8 takes boxes 2-7 and box 11 takes box 10, as on the form.
//   With no entries the boxes stay at 0 and are marked "not tracked".
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

/** Boxes the owner fills by hand. pair: the box that recovers the same VAT (box 10) when the owner can recover it. */
export const VAT201_MANUAL_BOXES = [
  { id: "2", en: "Tax refunds provided to tourists", bn: "পর্যটকদের VAT ফেরত" },
  { id: "3", en: "Supplies subject to the reverse charge", bn: "রিভার্স চার্জের সরবরাহ", pair: "10" },
  { id: "6", en: "Goods imported into the UAE", bn: "UAE-তে আমদানি করা মাল", pair: "10" },
  { id: "7", en: "Adjustments to goods imported into the UAE", bn: "আমদানির সমন্বয়" },
  { id: "10", en: "Supplies subject to the reverse charge (recoverable)", bn: "রিভার্স চার্জের ক্রয় (ফেরতযোগ্য)" },
];
const MANUAL_IDS = new Set(VAT201_MANUAL_BOXES.map((b) => b.id));
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ""));
const toNum = (v) => { const x = parseFloat(String(v ?? "").replace(/,/g, "")); return Number.isFinite(x) ? x : NaN; };

/**
 * Checks one hand entry before it is saved. -> "" when fine, else an error key:
 * box (not a hand-filled box), date, amount / vat (not a number), zero (both 0), ref (no reference).
 * Figures are taken as typed (an adjustment or refund can be negative), so the box shows what goes on the portal.
 */
export function vat201EntryProblem(e) {
  if (!MANUAL_IDS.has(String(e?.box || ""))) return "box";
  if (!isDay(e?.date)) return "date";
  if (Number.isNaN(toNum(e?.amount))) return "amount";
  if (Number.isNaN(toNum(e?.vat))) return "vat";
  if (r2(toNum(e.amount)) === 0 && r2(toNum(e.vat)) === 0) return "zero";
  if (!String(e?.ref || "").trim()) return "ref";
  return "";
}

/**
 * The saved entries for one hand entry. recover: for box 3 / 6, also put the same VAT in box 10 (the two are linked
 * by pairId and removed together). -> [{ id, box, date, amount, vat, ref, note, pairId, createdAt, createdBy, createdByName }]
 */
export function vat201NewEntries(form, { id, now = new Date().toISOString(), by = "", byName = "", recover = false } = {}) {
  const base = { date: String(form.date), amount: r2(toNum(form.amount)), vat: r2(toNum(form.vat)), ref: String(form.ref || "").trim(), note: String(form.note || "").trim(), createdAt: now, createdBy: by, createdByName: byName };
  const box = String(form.box);
  const pair = VAT201_MANUAL_BOXES.find((b) => b.id === box)?.pair;
  if (!recover || !pair) return [{ id, box, ...base, pairId: "" }];
  return [{ id, box, ...base, pairId: id }, { id: `${id}-${pair}`, box: pair, ...base, pairId: id }];
}

/** Entries removed with `entry`: its linked pair, or the entry alone. */
export const vat201EntriesWithout = (entries, entry) => (entries || []).filter((e) => (entry.pairId ? e.pairId !== entry.pairId : e.id !== entry.id));

/** Hand entries dated in [from, to] that pass vat201EntryProblem, oldest first. */
export function vat201EntriesIn(entries, from = "", to = "") {
  return (Array.isArray(entries) ? entries : [])
    .filter((e) => e && !vat201EntryProblem(e) && (!from || e.date >= from) && (!to || e.date <= to))
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.ref).localeCompare(String(b.ref)));
}

/**
 * vat: computeVat(...) result. -> { boxes: [{ id, en, bn, amount, vat, adjustment, tracked, rows }], unmapped, excluded, totals }
 * Box ids: 1a-1g, 2-14 (with only the boxes the FTA form has).
 */
// entries: hand entries of the period (vat201EntriesIn) for boxes 2, 3, 6, 7, 10.
export function buildVat201(vat, { customers = [], shopEmirate = "", noVatBox = "4", entries = [] } = {}) {
  if (!vat) return null;
  const manualRows = (id) => entries.filter((e) => e.box === id).map((e) => ({
    id: e.id, date: e.date, no: e.ref, party: e.note || "", taxable: r2(e.amount), vat: r2(e.vat), isManual: true, pairId: e.pairId || "", box: e.box,
  }));
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
  // a hand-filled box: 0 and "not tracked" until the owner enters something for the period
  const empty = (id, en, bn) => {
    const rows = manualRows(id);
    return { id, en, bn, amount: sumOf(rows, "taxable"), vat: sumOf(rows, "vat"), adjustment: 0, tracked: false, manual: rows.length > 0, rows };
  };

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
  const b11 = { id: "11", en: "Totals", bn: "মোট (ক্রয়)", amount: r2(b9.amount + b10.amount), vat: r2(b9.vat + b10.vat), adjustment: 0, tracked: true, rows: [], total: true };
  const due = b8.vat, recoverable = b11.vat, payable = r2(due - recoverable);
  const net = [
    { id: "12", en: "Total value of due tax for the period", bn: "এই সময়ের মোট দেয় VAT", amount: null, vat: due, tracked: true, rows: [], total: true },
    { id: "13", en: "Total value of recoverable tax for the period", bn: "এই সময়ের মোট ফেরতযোগ্য VAT", amount: null, vat: recoverable, tracked: true, rows: [], total: true },
    { id: "14", en: payable >= 0 ? "Payable tax for the period" : "Refundable tax for the period", bn: payable >= 0 ? "এই সময়ে দিতে হবে" : "এই সময়ে ফেরত পাবেন", amount: null, vat: payable, tracked: true, rows: [], total: true },
  ];
  // hand entries sit on top of the bills, so the bill part of boxes 8 / 11 must still equal the page's output / input VAT
  const manualDue = r2(outBoxes.filter((b) => MANUAL_IDS.has(b.id)).reduce((t, b) => t + b.vat, 0));
  const manualRecoverable = b10.vat;
  return {
    boxes: [...outBoxes, b8, b9, b10, b11, ...net], unmapped,
    excluded: { amount: sumOf(excluded, "taxable"), vat: sumOf(excluded, "vat"), rows: excluded },
    totals: { due, recoverable, payable },
    manual: { due: manualDue, recoverable: manualRecoverable, count: entries.length, rows: entries },
    agrees: Math.abs(due - manualDue - vat.outputVat) < 0.01 && Math.abs(recoverable - manualRecoverable - vat.inputVat) < 0.01,
  };
}

/**
 * The VAT201 of a period exactly as the Tax page builds it: the shop's hand entries (taxSettings.vat201Entries) dated in
 * [from, to] go into boxes 2, 3, 6, 7, 10. Every screen that shows VAT201 boxes (Tax page, month-end pack) calls this,
 * so they always agree for the same period.
 */
export function vat201ForPeriod(vat, { shop = null, customers = [], from = "", to = "", noVatBox } = {}) {
  if (!vat) return null;
  const box = noVatBox || (shop?.taxSettings?.vat201NoVatBox === "5" ? "5" : "4");
  return buildVat201(vat, { customers, shopEmirate: shop?.emirate || "", noVatBox: box, entries: vat201EntriesIn(shop?.taxSettings?.vat201Entries, from, to) });
}

/** Emirate rows (1a-1g, then the unallocated sales) in the shape of computeVat's regionRows. */
export const vat201RegionRows = (ret) => [
  ...ret.boxes.filter((b) => b.emirate).map((b) => ({ region: b.emirate, bills: b.rows.filter((r) => !r.isReturn).length, taxable: b.amount, vat: b.vat })),
  ...(ret.unmapped.rows.length ? [{ region: "", bills: ret.unmapped.rows.filter((r) => !r.isReturn).length, taxable: ret.unmapped.amount, vat: ret.unmapped.vat }] : []),
];

/** Box lines for the VAT period pack summary: { box, label, labelBn, amount } (amount and VAT on their own lines). */
export function vat201SummaryLines(ret) {
  const out = [];
  ret.boxes.forEach((b) => {
    if (b.amount != null) out.push({ box: `Box ${b.id}`, label: `${b.en} - amount`, labelBn: `${b.bn} - মূল্য`, amount: b.amount });
    out.push({ box: `Box ${b.id}`, label: `${b.en} - VAT`, labelBn: `${b.bn} - VAT`, amount: b.vat });
  });
  if (ret.unmapped.rows.length) out.push({ box: "", label: "Sales not allocated to an Emirate (in box 8) - amount", labelBn: "Emirate বরাদ্দ হয়নি - মূল্য", amount: ret.unmapped.amount });
  (ret.manual?.rows || []).forEach((e) => {
    const what = `entered by hand ${e.date} ${e.ref}${e.note ? ` (${e.note})` : ""}`;
    out.push({ box: `Box ${e.box}`, label: `${what} - amount`, labelBn: `হাতে দেওয়া ${e.date} ${e.ref} - মূল্য`, amount: e.amount });
    out.push({ box: `Box ${e.box}`, label: `${what} - VAT`, labelBn: `হাতে দেওয়া ${e.date} ${e.ref} - VAT`, amount: e.vat });
  });
  return out;
}

export const VAT201_COLS = ["Box", "Description", "Amount (AED)", "VAT amount (AED)", "Adjustment (AED)", "Note"];
/** CSV rows ready to type into the FTA portal. */
export function vat201Rows(ret) {
  const num = (v) => (v == null ? "" : r2(v).toFixed(2));
  return [
    VAT201_COLS,
    ...ret.boxes.map((b) => [b.id, b.en, num(b.amount), num(b.vat), b.amount == null ? "" : num(b.adjustment),
      b.tracked ? "" : b.manual ? `Entered by hand in S4 (${b.rows.length}) - check against the customs / supplier papers` : "Not tracked in S4 - enter from your own records if any"]),
    ...(ret.unmapped.rows.length ? [["", "Sales not allocated to an Emirate (included in box 8)", num(ret.unmapped.amount), num(ret.unmapped.vat), "", "Set the customer's Emirate and allocate before filing"]] : []),
    ...(ret.excluded.rows.length ? [["", "Purchases from suppliers without TRN (not in box 9)", num(ret.excluded.amount), num(ret.excluded.vat), "", "Not recoverable until the supplier's TRN is on file"]] : []),
    ...(ret.manual?.rows || []).map((e) => [e.box, `Hand entry ${e.date} - ${e.ref}${e.note ? ` - ${e.note}` : ""}`, num(e.amount), num(e.vat), "", `Entered by ${e.createdByName || "owner"}`]),
  ];
}
export const vat201FileName = (from, to) => `vat201-${from || "start"}-${to || "end"}.csv`;
