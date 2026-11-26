import test from "node:test";
import assert from "node:assert/strict";
import { billLocationFields, billLocationId, billLocationStock, billLocationsOf, hasGodowns, locationShortfalls } from "./billLocation.js";
import { MAIN_LOCATION_ID, documentMoves, normalizeLocations, qtyIn } from "./stockLocations.js";
import { onHandAt, stockMovements } from "../reports/stockHub.js";

const S = "s1";
const products = [{ id: "p1", name: "Oil filter", unit: "Pcs", openingStock: 0 }, { id: "p2", name: "Brake pad", unit: "Pcs", openingStock: 5 }];
const shop3 = { stockLocations: [
  { id: "gA", name: "Godown A", nameBn: "গোডাউন A", kind: "godown" },
  { id: "gB", name: "Godown B", kind: "godown" },
  { id: "gC", name: "Godown C", kind: "godown", active: false },
] };
const locs = billLocationsOf(shop3);
const line = (productId, qty) => ({ productId, qty, unit: "Pcs" });
const pi = (id, date, items, extra = {}) => ({ id, shopId: S, status: "confirmed", invoiceNo: id, invoiceDate: date, items, ...extra });
const si = (id, date, items, extra = {}) => ({ id, shopId: S, status: "paid", invoiceNo: id, invoiceDate: date, items, ...extra });
const rowsOf = ({ purchaseInvoices = [], salesInvoices = [], deliveryNotes = [], salesReturns = [], purchaseReturns = [] } = {}) => ({
  purchaseInvoices, salesInvoices, deliveryNotes, extras: { salesReturns, purchaseReturns, stockAdjustments: [], goodsReceipts: [], warrantyClaims: [] },
});
const total = (rows, asOf = "") => onHandAt(products, stockMovements(products, rows, S), asOf);
const sumAt = (stock, pid) => [...stock.values()].reduce((t, m) => t + (m.get(pid) || 0), 0);

test("picker list: main first, active godowns only; a main-only shop has no picker and its bills carry no location", () => {
  assert.deepEqual(locs.map((l) => l.id), ["main", "gA", "gB"], "switched-off Godown C is not offered");
  assert.equal(hasGodowns(locs), true);
  const mainOnly = billLocationsOf({});
  assert.equal(hasGodowns(mainOnly), false);
  assert.deepEqual(billLocationFields("gA", mainOnly), {}, "nothing stored: bills stay as before");
  assert.deepEqual(billLocationFields("gA", locs), { locationId: "gA", locationName: "Godown A" });
  assert.deepEqual(billLocationFields("gone", locs), { locationId: "main", locationName: "Main store" });
  assert.equal(billLocationId({ locationId: "gB" }, locs), "gB");
  assert.equal(billLocationId({ locationId: "gC" }, locs), MAIN_LOCATION_ID, "a switched-off location falls back to main");
  assert.equal(billLocationId({}, locs), MAIN_LOCATION_ID);
});

test("buy into Godown A, sell from A: Stock Hub location stock follows the bills and always adds up to the shop total", () => {
  const rows = rowsOf({
    purchaseInvoices: [pi("PI-1", "2026-11-01", [line("p1", 10)], { locationId: "gA", locationName: "Godown A" }), pi("PI-2", "2026-11-02", [line("p1", 3)])],
    salesInvoices: [si("SI-1", "2026-11-05", [line("p1", 4)], { locationId: "gA" }), si("SI-2", "2026-11-06", [line("p1", 1), line("p2", 2)])],
    // a return of SI-1 with no location of its own goes back to the godown SI-1 sold from
    salesReturns: [{ id: "SR-1", shopId: S, status: "confirmed", returnNo: "SR-1", returnDate: "2026-11-07", invoiceId: "SI-1", items: [line("p1", 1)] }],
  });
  const stock = billLocationStock({ products, rows, locations: locs, shopId: S, asOf: "2026-11-30" });
  assert.equal(qtyIn(stock, "gA", "p1"), 7, "10 in, 4 out, 1 back");
  assert.equal(qtyIn(stock, "main", "p1"), 2, "3 bought into main, 1 sold from main");
  assert.equal(qtyIn(stock, "gB", "p1"), 0);
  assert.equal(sumAt(stock, "p1"), total(rows).get("p1"), "locations = shop total");
  assert.equal(qtyIn(stock, "main", "p2"), 3, "opening 5 on main, 2 sold");
  // as at a date before the sale
  assert.equal(qtyIn(billLocationStock({ products, rows, locations: locs, shopId: S, asOf: "2026-11-04" }), "gA", "p1"), 10);
  // the godown side is a document move, never saved
  const dm = documentMoves(stockMovements(products, rows, S));
  assert.ok(dm.every((m) => m.fromDocument && [m.fromId, m.toId].includes("main")));
  assert.equal(dm.length, 3);
});

test("selling from A what sits only in B is caught; editing a bill leaves its own stock out", () => {
  const rows = rowsOf({
    purchaseInvoices: [pi("PI-1", "2026-11-01", [line("p1", 2)], { locationId: "gA" }), pi("PI-2", "2026-11-01", [line("p1", 8)], { locationId: "gB" })],
    salesInvoices: [si("SI-1", "2026-11-03", [line("p1", 2)], { locationId: "gA" })],
  });
  const stock = billLocationStock({ products, rows, locations: locs, shopId: S, asOf: "2026-11-30" });
  assert.equal(qtyIn(stock, "gA", "p1"), 0);
  assert.equal(qtyIn(stock, "gB", "p1"), 8);
  assert.equal(total(rows).get("p1"), 8, "the shop total alone would let it through");
  assert.deepEqual(locationShortfalls([line("p1", 3)], { products, stock, locationId: "gA" }), [{ productId: "p1", name: "Oil filter", have: 0, need: 3 }]);
  assert.deepEqual(locationShortfalls([line("p1", 3)], { products, stock, locationId: "gB" }), []);
  // editing SI-1: without it, A holds the 2 it sold
  const editing = billLocationStock({ products, rows, locations: locs, shopId: S, asOf: "2026-11-30", skipDocId: "SI-1" });
  assert.equal(qtyIn(editing, "gA", "p1"), 2);
  assert.deepEqual(locationShortfalls([line("p1", 2)], { products, stock: editing, locationId: "gA" }), []);
});

test("location transfers and bill godowns together; drafts, cancelled and branch-transfer bills place nothing", () => {
  const rows = rowsOf({
    purchaseInvoices: [
      pi("PI-1", "2026-11-01", [line("p1", 6)], { locationId: "gA" }),
      pi("PI-D", "2026-11-01", [line("p1", 50)], { locationId: "gA", status: "draft" }),
      pi("PI-X", "2026-11-01", [line("p1", 50)], { locationId: "gA", status: "cancelled" }),
      pi("PI-BT", "2026-11-01", [line("p1", 50)], { locationId: "gA", internalTransfer: true, sourceType: "branch_transfer" }),
    ],
  });
  const moves = [{ id: "m1", shopId: S, moveDate: "2026-11-02", fromId: "gA", toId: "gB", status: "active", lines: [{ productId: "p1", qty: 4 }] }];
  const stock = billLocationStock({ products, rows, moves, locations: locs, shopId: S, asOf: "2026-11-30" });
  assert.deepEqual([qtyIn(stock, "main", "p1"), qtyIn(stock, "gA", "p1"), qtyIn(stock, "gB", "p1")], [0, 2, 4]);
  assert.equal(sumAt(stock, "p1"), 6);
});

test("a main-only shop: every bill stays on main, no document moves", () => {
  const rows = rowsOf({ purchaseInvoices: [pi("PI-1", "2026-11-01", [line("p1", 10)])], salesInvoices: [si("SI-1", "2026-11-02", [line("p1", 4)])] });
  assert.deepEqual(documentMoves(stockMovements(products, rows, S)), []);
  const stock = billLocationStock({ products, rows, locations: normalizeLocations([]), shopId: S });
  assert.equal(qtyIn(stock, "main", "p1"), 6);
  assert.deepEqual([...stock.keys()], ["main"]);
});

test("a bill linked to a delivery note sells from the note's godown when it names none", () => {
  const dn = { id: "DN-1", shopId: S, status: "invoiced", docNo: "DN-1", invoiceDate: "2026-11-02", items: [line("p1", 2)], locationId: "gA" };
  const rows = rowsOf({
    purchaseInvoices: [pi("PI-1", "2026-11-01", [line("p1", 10)], { locationId: "gA" })],
    deliveryNotes: [dn],
    salesInvoices: [si("SI-1", "2026-11-03", [line("p1", 3)], { deliveryNoteId: "DN-1" })],
  });
  const stock = billLocationStock({ products, rows, locations: locs, shopId: S, asOf: "2026-11-30" });
  assert.equal(qtyIn(stock, "gA", "p1"), 7, "2 on the note + 1 more on the bill, both from A");
  assert.equal(qtyIn(stock, "main", "p1"), 0);
});

test("editing a bill saved before it had a godown: left as it was unless the user picks one", () => {
  const legacy = { id: "PI-OLD", items: [] };
  assert.deepEqual(billLocationFields("", locs, { prior: legacy }), {}, "re-saved untouched: no godown written");
  assert.deepEqual(billLocationFields("gB", locs, { prior: legacy }), { locationId: "gB", locationName: "Godown B" }, "picked: stored");
  assert.deepEqual(billLocationFields("", locs, { prior: { locationId: "gA" } }), { locationId: "main", locationName: "Main store" }, "a bill that had a godown and was set back keeps an explicit main");
  assert.deepEqual(billLocationFields("", locs), { locationId: "main", locationName: "Main store" }, "a new bill stores the main it showed");
  assert.deepEqual(billLocationFields("", billLocationsOf({}), { prior: legacy }), {}, "main-only shop: never stored");
});
