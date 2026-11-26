import test from "node:test";
import assert from "node:assert/strict";
import { computeVat } from "./taxDomain.js";
import { buildVat201, vat201ForPeriod, emirateOf, vat201EntriesIn, vat201EntriesWithout, vat201EntryProblem, vat201FileName, vat201NewEntries, vat201RegionRows, vat201Rows, vat201SummaryLines } from "./vat201.js";
import { vatPackRows } from "./vatExport.js";

const S = "x";
const customers = [
  { id: "c1", customerName: "Dubai Garage", emirate: "Dubai" },
  { id: "c2", customerName: "Deira Parts", city: "Deira" },
  { id: "c3", customerName: "RAK Motors", area: "RAK" },
  { id: "c4", customerName: "Unknown Town", city: "Atlantis" },
  { id: "c5", customerName: "No Address" },
];
const vendors = [{ id: "v1", trnNumber: "100" }, { id: "v2" }];
const si = (id, customerId, taxable, vat, extra = {}) => ({ id, shopId: S, invoiceNo: id, invoiceDate: "2026-11-10", status: "confirmed", customerId, grandTotal: taxable + vat, totalVat: vat, ...extra });
const data = () => ({
  salesInvoices: [
    si("SI-1", "c1", 1000, 50), si("SI-2", "c2", 200, 10), si("SI-3", "c3", 100, 5), si("SI-4", "c4", 400, 20),
    si("SI-5", "c5", 60, 3), si("SI-6", null, 80, 4), si("SI-7", "c1", 300, 0), si("SI-8", "c1", 999, 0, { status: "cancelled" }),
  ],
  purchaseInvoices: [
    { id: "PI-1", shopId: S, invoiceNo: "PI-1", invoiceDate: "2026-11-05", status: "confirmed", vendorId: "v1", grandTotal: 525, totalTax: 25 },
    { id: "PI-2", shopId: S, invoiceNo: "PI-2", invoiceDate: "2026-11-06", status: "confirmed", vendorId: "v2", grandTotal: 210, totalTax: 10 },
  ],
  extras: { salesReturns: [{ id: "SR-1", shopId: S, returnNo: "SR-1", returnDate: "2026-11-12", invoiceId: "SI-1", partyId: "c1", total: 105, totalVat: 5, status: "confirmed", noteType: "value", items: [] }], purchaseReturns: [] },
  expenses: [{ id: "E-1", shopId: S, expenseNo: "E-1", expenseDate: "2026-11-07", amount: 105, vatAmount: 5, supplierTrn: "300", status: "paid" }],
});
const vatOf = () => computeVat(data(), { shopId: S, from: "2026-11-01", to: "2026-11-30", customers, vendors, defaultRegion: "Sharjah" });

test("emirate spellings", () => {
  assert.equal(emirateOf("DXB"), "Dubai");
  assert.equal(emirateOf("Bur Dubai"), "Dubai");
  assert.equal(emirateOf("al ain"), "Abu Dhabi");
  assert.equal(emirateOf("Ras Al Khaimah"), "Ras Al Khaimah");
  assert.equal(emirateOf("UAQ"), "Umm Al Quwain");
  assert.equal(emirateOf("Industrial Area 4, Sharjah"), "Sharjah");
  assert.equal(emirateOf("Roadside"), "", "a short alias only matches as a whole word");
  assert.equal(emirateOf("Atlantis"), "");
  assert.equal(emirateOf(""), "");
});

test("boxes 1a-1g by Emirate, credit notes netted, shop Emirate for bills without an address, unknown listed", () => {
  const ret = buildVat201(vatOf(), { customers, shopEmirate: "Sharjah" });
  const b = (id) => ret.boxes.find((x) => x.id === id);
  assert.deepEqual([b("1b").emirate, b("1b").amount, b("1b").vat], ["Dubai", 1100, 55], "Dubai 1000 + Deira 200 - credit note 100");
  assert.deepEqual([b("1c").emirate, b("1c").amount, b("1c").vat], ["Sharjah", 140, 7], "no customer + customer with no address -> shop Emirate");
  assert.deepEqual([b("1f").emirate, b("1f").amount], ["Ras Al Khaimah", 100]);
  assert.equal(b("1a").amount, 0);
  assert.deepEqual([ret.unmapped.amount, ret.unmapped.vat, ret.unmapped.parties.map((p) => p.party)], [400, 20, ["Unknown Town"]]);
  assert.deepEqual([b("4").amount, b("5").amount], [300, 0], "no-VAT sales default to zero-rated");
  const exempt = buildVat201(vatOf(), { customers, shopEmirate: "Sharjah", noVatBox: "5" });
  assert.deepEqual([exempt.boxes.find((x) => x.id === "4").amount, exempt.boxes.find((x) => x.id === "5").amount], [0, 300]);
  assert.deepEqual([b("8").amount, b("8").vat], [2040, 87], "box 8 includes the unallocated sales");
  ["2", "3", "6", "7", "10"].forEach((id) => assert.equal(b(id).tracked, false, id));
});

test("input side, net payable and agreement with the Tax page", () => {
  const vat = vatOf();
  const ret = buildVat201(vat, { customers, shopEmirate: "Sharjah" });
  const b = (id) => ret.boxes.find((x) => x.id === id);
  assert.deepEqual([b("9").amount, b("9").vat], [600, 30], "PI-1 + expense; PI-2 has no supplier TRN");
  assert.deepEqual([ret.excluded.amount, ret.excluded.vat], [200, 10]);
  assert.deepEqual([b("12").vat, b("13").vat, b("14").vat], [87, 30, 57]);
  assert.equal(ret.agrees, true);
  assert.deepEqual([vat.outputVat, vat.inputVat, vat.payable], [87, 30, 57], "the Tax page figures are unchanged");
  assert.equal(b("1b").rows.length, 3, "drill: SI-1, SI-2 and the credit note");
});

test("CSV rows and file name", () => {
  const rows = vat201Rows(buildVat201(vatOf(), { customers, shopEmirate: "Sharjah" }));
  assert.deepEqual(rows[0], ["Box", "Description", "Amount (AED)", "VAT amount (AED)", "Adjustment (AED)", "Note"]);
  assert.deepEqual(rows.find((r) => r[0] === "1b").slice(2, 4), ["1100.00", "55.00"]);
  assert.ok(rows.find((r) => r[0] === "3")[5].includes("Not tracked"));
  assert.deepEqual(rows.find((r) => r[0] === "14").slice(2, 4), ["", "57.00"]);
  assert.ok(rows.some((r) => r[1].includes("not allocated")));
  assert.ok(rows.some((r) => r[1].includes("without TRN")));
  assert.equal(vat201FileName("2026-10-01", "2026-12-31"), "vat201-2026-10-01-2026-12-31.csv");
});

test("UAE By Emirate tab and the VAT pack use the same split and boxes as the VAT return", () => {
  const vat = vatOf();
  const ret = buildVat201(vat, { customers, shopEmirate: "Sharjah" });
  const regions = vat201RegionRows(ret);
  const dubai = regions.find((r) => r.region === "Dubai");
  assert.deepEqual([dubai.taxable, dubai.vat, dubai.bills], [1100, 55, 2], "DXB / Deira read as Dubai; the credit note is not a bill");
  assert.equal(regions.length, 8, "seven Emirates and the unallocated line");
  assert.deepEqual([regions[7].region, regions[7].taxable], ["", 400]);
  const regionVat = Math.round(regions.reduce((t, r) => t + r.vat, 0) * 100) / 100;
  const stdVat = ret.boxes.filter((b) => b.emirate).reduce((t, b) => t + b.vat, 0) + ret.unmapped.vat;
  assert.equal(regionVat, Math.round(stdVat * 100) / 100);
  const lines = vat201SummaryLines(ret);
  assert.deepEqual(lines.find((l) => l.box === "Box 14" && l.label.endsWith("VAT")).amount, 57);
  assert.deepEqual(lines.find((l) => l.box === "Box 1b" && l.label.endsWith("amount")).amount, 1100);
  const pack = vatPackRows({ vat, summary: lines, meta: {}, regionRows: regions });
  assert.ok(pack.some((r) => r[0] === "Box 1b" && r[3] === "1100.00"));
  assert.ok(pack.some((r) => r[0] === "Dubai" && r[2] === "1100.00"), "pack region split = VAT201");
  assert.equal(pack.some((r) => r[0] === "Deira"), false);
  assert.ok(vatPackRows({ vat, summary: [] }).some((r) => r[0] === "Deira" || r[0] === "Dubai"), "without the override the pack keeps the old raw split");
});

test("box 9 counts a bill whose TRN was typed on the bill when the supplier master has none", () => {
  const d = data();
  d.purchaseInvoices[1] = { ...d.purchaseInvoices[1], vendorTrn: "100000000000003" };
  const vat = computeVat(d, { shopId: S, from: "2026-11-01", to: "2026-11-30", customers, vendors, defaultRegion: "Sharjah" });
  const ret = buildVat201(vat, { customers, shopEmirate: "Sharjah" });
  const b = (id) => ret.boxes.find((x) => x.id === id);
  assert.deepEqual([b("9").amount, b("9").vat], [800, 40], "PI-1 + PI-2 + expense");
  assert.deepEqual([ret.excluded.amount, ret.excluded.vat], [0, 0]);
  assert.deepEqual([b("13").vat, b("14").vat], [40, 47]);
  assert.equal(ret.agrees, true);
  assert.deepEqual([vat.inputVat, vat.payable], [40, 47], "the Tax page reads the same rows");
  const pack = vatPackRows({ vat });
  assert.ok(pack.some((r) => r.includes("PI-2") && r.includes("100000000000003")), "the export lists PI-2 with the bill TRN");
});

test("hand entries: import with box 10 recovery, reverse charge, tourist refund and import adjustment fill boxes 2, 3, 6, 7, 10", () => {
  const imp = vat201NewEntries({ box: "6", date: "2026-11-15", amount: "10,000", vat: "500", ref: "DEC-101-2026", note: "Customs - Jebel Ali" }, { id: "m1", now: "2026-11-20T10:00:00Z", byName: "Owner", recover: true });
  assert.deepEqual(imp.map((e) => [e.box, e.amount, e.vat, e.pairId]), [["6", 10000, 500, "m1"], ["10", 10000, 500, "m1"]]);
  const rc = vat201NewEntries({ box: "3", date: "2026-11-18", amount: 2000, vat: 100, ref: "SVC-77" }, { id: "m2", recover: false });
  const tourist = vat201NewEntries({ box: "2", date: "2026-11-19", amount: -200, vat: -10, ref: "TRS-NOV" }, { id: "m3", recover: true });
  const adj = vat201NewEntries({ box: "7", date: "2026-11-21", amount: 400, vat: 20, ref: "DEC-101-ADJ" }, { id: "m4" });
  assert.equal(tourist.length, 1, "box 2 has no recovery pair");
  const outside = vat201NewEntries({ box: "6", date: "2026-12-02", amount: 999, vat: 50, ref: "DEC-200" }, { id: "m5", recover: true });
  const all = [...imp, ...rc, ...tourist, ...adj, ...outside, { id: "bad", box: "9", date: "2026-11-10", amount: 1, vat: 1, ref: "x" }];
  const entries = vat201EntriesIn(all, "2026-11-01", "2026-11-30");
  assert.deepEqual(entries.map((e) => e.id), ["m1", "m1-10", "m2", "m3", "m4"], "in period, valid boxes only, oldest first");

  const ret = buildVat201(vatOf(), { customers, shopEmirate: "Sharjah", entries });
  const b = (id) => ret.boxes.find((x) => x.id === id);
  assert.deepEqual([b("2").amount, b("2").vat, b("2").manual], [-200, -10, true]);
  assert.deepEqual([b("3").amount, b("3").vat], [2000, 100]);
  assert.deepEqual([b("6").amount, b("6").vat], [10000, 500]);
  assert.deepEqual([b("7").amount, b("7").vat], [400, 20]);
  assert.deepEqual([b("10").amount, b("10").vat], [10000, 500]);
  assert.deepEqual([b("8").amount, b("8").vat], [2040 + 12200, 87 + 610], "box 8 = bills + boxes 2, 3, 6, 7");
  assert.deepEqual([b("11").amount, b("11").vat], [600 + 10000, 30 + 500], "box 11 = box 9 + box 10");
  assert.deepEqual([b("12").vat, b("13").vat, b("14").vat], [697, 530, 167]);
  assert.deepEqual(ret.manual, { due: 610, recoverable: 500, count: 5, rows: entries });
  assert.equal(ret.agrees, true, "the bill part still equals the Tax page output / input VAT");
  assert.equal(b("6").rows[0].isManual, true);

  const csv = vat201Rows(ret);
  assert.ok(csv.find((r) => r[0] === "6")[5].startsWith("Entered by hand in S4 (1)"));
  assert.ok(csv.find((r) => r[0] === "2")[5].startsWith("Entered by hand"));
  assert.ok(csv.some((r) => r[0] === "10" && r[1].includes("DEC-101-2026") && r[3] === "500.00"), "each hand entry listed");
  const lines = vat201SummaryLines(ret);
  assert.ok(lines.some((l) => l.box === "Box 6" && l.label.includes("DEC-101-2026") && l.amount === 500), "the VAT pack lists the entry");
  const pack = vatPackRows({ vat: vatOf(), summary: lines });
  assert.ok(pack.some((r) => r.some((c) => String(c).includes("DEC-101-2026"))));

  // deleting the import removes its box 10 recovery with it
  assert.deepEqual(vat201EntriesWithout(all, imp[1]).map((e) => e.id).filter((id) => id.startsWith("m1")), []);
  assert.deepEqual(vat201EntriesWithout(all, rc[0]).some((e) => e.id === "m2"), false);
});

test("no hand entries: boxes 2, 3, 6, 7, 10 stay 0 and not tracked, totals as before", () => {
  const ret = buildVat201(vatOf(), { customers, shopEmirate: "Sharjah" });
  ["2", "3", "6", "7", "10"].forEach((id) => {
    const x = ret.boxes.find((b) => b.id === id);
    assert.deepEqual([x.amount, x.vat, x.tracked, x.manual, x.rows.length], [0, 0, false, false, 0], id);
  });
  assert.deepEqual(ret.totals, { due: 87, recoverable: 30, payable: 57 });
  assert.deepEqual([ret.manual.due, ret.manual.recoverable, ret.manual.count], [0, 0, 0]);
  assert.ok(vat201Rows(ret).find((r) => r[0] === "3")[5].includes("Not tracked"));
});

test("hand entry checks", () => {
  const ok = { box: "6", date: "2026-11-15", amount: "100", vat: "5", ref: "DEC-1" };
  assert.equal(vat201EntryProblem(ok), "");
  assert.equal(vat201EntryProblem({ ...ok, box: "9" }), "box", "bill boxes are not typed by hand");
  assert.equal(vat201EntryProblem({ ...ok, date: "15/11/2026" }), "date");
  assert.equal(vat201EntryProblem({ ...ok, amount: "abc" }), "amount");
  assert.equal(vat201EntryProblem({ ...ok, vat: "" }), "vat");
  assert.equal(vat201EntryProblem({ ...ok, amount: "0", vat: "0" }), "zero");
  assert.equal(vat201EntryProblem({ ...ok, ref: "  " }), "ref");
  assert.equal(vat201EntryProblem({ ...ok, box: "7", amount: "-50", vat: "-2.5" }), "", "an adjustment can be negative");
});

test("month-end pack and Tax page build the same VAT201 for a period, hand entries included", () => {
  const imp = vat201NewEntries({ box: "6", date: "2026-11-15", amount: 10000, vat: 500, ref: "DEC-101-2026" }, { id: "m1", recover: true });
  const rc = vat201NewEntries({ box: "3", date: "2026-11-18", amount: 2000, vat: 100, ref: "SVC-77" }, { id: "m2", recover: true });
  const later = vat201NewEntries({ box: "6", date: "2026-12-02", amount: 999, vat: 50, ref: "DEC-200" }, { id: "m3" });
  const shop = { emirate: "Sharjah", taxSettings: { vat201Entries: [...imp, ...rc, ...later] } };
  const vat = vatOf();
  const box = (ret, id) => ret.boxes.find((b) => b.id === id);
  // the bug: the month-end pack used to build VAT201 without the hand entries
  const oldMonthEnd = buildVat201(vat, { customers, shopEmirate: "Sharjah", noVatBox: "4" });
  assert.deepEqual([box(oldMonthEnd, "3").vat, box(oldMonthEnd, "10").vat], [0, 0]);
  const tax = vat201ForPeriod(vat, { shop, customers, from: "2026-11-01", to: "2026-11-30", noVatBox: "4" });
  const monthEnd = vat201ForPeriod(vat, { shop, customers, from: "2026-11-01", to: "2026-11-30" });
  ["2", "3", "6", "7", "8", "9", "10", "11", "12", "13", "14"].forEach((id) => {
    assert.deepEqual([box(monthEnd, id).amount, box(monthEnd, id).vat], [box(tax, id).amount, box(tax, id).vat], `box ${id}`);
  });
  assert.deepEqual([box(tax, "3").vat, box(tax, "6").vat, box(tax, "10").vat], [100, 500, 600], "box 10 recovers both; December's entry is not in November");
  assert.equal(monthEnd.agrees, true);
  assert.deepEqual(vat201Rows(monthEnd), vat201Rows(tax), "the pack's VAT201 CSV equals the Tax page's");
  // no hand entries: both as before
  const none = vat201ForPeriod(vat, { shop: { emirate: "Sharjah" }, customers, from: "2026-11-01", to: "2026-11-30" });
  assert.deepEqual([box(none, "3").vat, box(none, "10").vat, box(none, "3").tracked, none.totals.payable], [0, 0, false, 57]);
  assert.equal(vat201ForPeriod(vat, { shop: { emirate: "Sharjah", taxSettings: { vat201NoVatBox: "5" } }, customers }).boxes.find((b) => b.id === "5").amount, 300, "the shop's no-VAT box choice");
});
