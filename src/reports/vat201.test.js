import test from "node:test";
import assert from "node:assert/strict";
import { computeVat } from "./taxDomain.js";
import { buildVat201, emirateOf, vat201FileName, vat201RegionRows, vat201Rows, vat201SummaryLines } from "./vat201.js";
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
