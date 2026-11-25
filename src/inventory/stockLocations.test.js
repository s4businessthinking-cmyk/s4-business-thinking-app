import test from "node:test";
import assert from "node:assert/strict";
import { onHandAt, stockMovements, valuation } from "../reports/stockHub.js";
import { buildGlobalLedger, balances } from "../ledger/globalLedger.js";
import { buildBalanceSheet } from "../reports/balanceSheet.js";
import { buildTrialBalance } from "../reports/trialBalance.js";
import {
  MAIN_LOCATION_ID, cancelBlockers, locationItems, locationPath, locationStock, locationSummary, locationTree, moveBlockers, moveDoc, negativeAtLocations,
  nextMoveNo, normalizeLocations, qtyIn, toSavedLocations, usedLocationIds, validateLocation,
} from "./stockLocations.js";

const S = "s1";
const products = [
  { id: "p1", code: "F-100", name: "Oil Filter", openingStock: 10, unit: "Pcs" },
  { id: "p2", code: "B-200", name: "Brake Pad", openingStock: 0, unit: "Pcs" },
];
const rows = {
  purchaseInvoices: [{ id: "pi1", shopId: S, status: "confirmed", invoiceNo: "PI-1", invoiceDate: "2026-10-01", vendorName: "Gulf", grandTotal: 400, totalTax: 0, items: [{ productId: "p2", qty: 20, unitPrice: 20 }] }],
  salesInvoices: [{ id: "si1", shopId: S, status: "paid", invoiceNo: "SI-1", invoiceDate: "2026-10-20", grandTotal: 120, totalVat: 0, amountPaid: 120, paymentMethod: "cash", items: [{ productId: "p1", qty: 4 }] }],
  deliveryNotes: [], extras: {},
};
const movements = stockMovements(products, rows, S);
const locations = normalizeLocations([
  { id: "g1", name: "Al Quoz godown", nameBn: "আল কোজ গোডাউন", kind: "godown" },
  { id: "r1", name: "Rack A", kind: "rack", parentId: "g1" },
]);
const mv = (id, moveDate, fromId, toId, lines, extra = {}) => ({ id, shopId: S, moveNo: id, moveDate, fromId, toId, lines, status: "active", ...extra });
const moves = [
  mv("m1", "2026-10-05", MAIN_LOCATION_ID, "g1", [{ productId: "p2", qty: 12 }, { productId: "p1", qty: 3 }]),
  mv("m2", "2026-10-06", "g1", "r1", [{ productId: "p2", qty: 5 }]),
  mv("m3", "2026-10-07", MAIN_LOCATION_ID, "g1", [{ productId: "p1", qty: 1 }], { status: "cancelled" }),
];
const stockOn = (day, skipId = "", list = moves) => locationStock(onHandAt(products, movements, day), list, locations, { asOf: day, shopId: S, skipId });
const cost = new Map([["p1", 10], ["p2", 20]]);

test("locations: the main store is always there, a tree of up to 3 levels, names and codes unique", () => {
  assert.deepEqual(locationTree(locations).map(({ loc, depth }) => [loc.id, depth]), [["main", 0], ["g1", 0], ["r1", 1]]);
  assert.equal(locationPath(locations, "r1"), "Al Quoz godown > Rack A");
  assert.equal(locationPath(locations, "r1", true), "আল কোজ গোডাউন > Rack A");
  assert.equal(validateLocation({ name: "rack a" }, locations).error, "duplicate");
  assert.equal(validateLocation({ id: "g1", name: "Al Quoz godown", parentId: "r1" }, locations).error, "cycle");
  const deep = normalizeLocations([...toSavedLocations(locations), { id: "s1", name: "Shelf 1", parentId: "r1" }]);
  assert.equal(validateLocation({ name: "Bin 1", parentId: "s1" }, deep).error, "depth");
  assert.equal(validateLocation({ id: "g1", name: "Al Quoz godown", active: false }, locations, { usedIds: new Set(["g1"]) }).error, "inUse");
  const main = validateLocation({ id: "main", name: "Front shop", parentId: "g1", active: false }, locations).location;
  assert.deepEqual([main.parentId, main.active], ["", true], "the main store stays top level and on");
  assert.equal(normalizeLocations([])[0].id, MAIN_LOCATION_ID);
});

test("stock by location: the main store keeps what was not moved, every location adds up to the shop total", () => {
  const day = "2026-10-31";
  const total = onHandAt(products, movements, day);
  const s = stockOn(day);
  assert.deepEqual([qtyIn(s, "main", "p1"), qtyIn(s, "g1", "p1"), qtyIn(s, "r1", "p1")], [3, 3, 0], "10 - 4 sold - 3 moved");
  assert.deepEqual([qtyIn(s, "main", "p2"), qtyIn(s, "g1", "p2"), qtyIn(s, "r1", "p2")], [8, 7, 5]);
  products.forEach((p) => assert.equal([...s.values()].reduce((t, m) => t + (m.get(p.id) || 0), 0), total.get(p.id), p.id));
  // value: locations add up to the stock valuation (and so to the Balance Sheet closing stock)
  const sum = locationSummary(s, locations, cost);
  const top = sum.filter((x) => !x.depth).reduce((t, x) => t + x.value, 0);
  assert.equal(top, valuation(products, total, cost).total);
  assert.equal(sum.find((x) => x.id === "g1").value, 3 * 10 + 7 * 20 + 5 * 20, "a parent includes its racks");
  assert.equal(sum.find((x) => x.id === "g1").ownValue, 170);
  assert.deepEqual(locationItems(s, locations, "g1", cost, { withChildren: true }).map((r) => [r.productId, r.qty]).sort(), [["p1", 3], ["p2", 12]]);
  // before the first move everything is at the main store
  assert.equal(qtyIn(stockOn("2026-10-04"), "g1", "p2"), 0);
  assert.equal(qtyIn(stockOn("2026-10-04"), "main", "p2"), 20);
  assert.ok(usedLocationIds(s, moves).has("r1"));
});

test("moves: available stock checked on the move date and today, cancel only when the goods are still there", () => {
  const today = "2026-10-31";
  const base = { moveDate: "2026-10-30", fromId: "r1", toId: "main", lines: [{ productId: "p2", qty: 6 }] };
  const ctx = { locations, products, stockOn, today };
  assert.deepEqual(moveBlockers(base, ctx).map((b) => b.id), ["short"], "rack A holds 5");
  assert.deepEqual(moveBlockers({ ...base, lines: [{ productId: "p2", qty: 5 }] }, ctx), []);
  assert.deepEqual(moveBlockers({ ...base, toId: "r1" }, ctx).map((b) => b.id), ["same"]);
  assert.deepEqual(moveBlockers({ ...base, moveDate: "2026-11-02" }, ctx).map((b) => b.id), ["future"]);
  assert.deepEqual(moveBlockers({ ...base, lines: [{ productId: "", qty: 1 }] }, ctx).map((b) => b.id), ["product"]);
  // main had 10 p1 on 2026-10-06 but only 3 after the sale on the 20th: a back-dated move of 5 leaves today short
  const back = moveBlockers({ moveDate: "2026-10-06", fromId: "main", toId: "g1", lines: [{ productId: "p1", qty: 5 }] }, ctx);
  assert.deepEqual(back.map((b) => b.id), ["short"]);
  assert.match(back[0].en, /2026-10-31/);
  // cancelling m1 would take 12 p2 back from the godown that sent 5 on to the rack
  assert.deepEqual(cancelBlockers(moves[0], { stockOn, today, locations }).map((b) => b.id), ["used"]);
  assert.deepEqual(cancelBlockers(moves[1], { stockOn, today, locations }), []);
  const doc = moveDoc({ ...base, lines: [{ productId: "p2", qty: "5" }], fromName: "Rack A", toName: "Main store" }, { shopId: S, moveNo: nextMoveNo([]), products, uid: "u" });
  assert.deepEqual([doc.moveNo, doc.status, doc.lines[0].qty, doc.lines[0].code, doc.createdBy], ["LT-0001", "active", 5, "B-200", "u"]);
  assert.equal(nextMoveNo([{ moveNo: "LT-0009" }]), "LT-0010");
});

test("sales come off the main store: goods moved away can leave it below zero, shown as a warning; money unchanged", () => {
  const all = [...moves, mv("m4", "2026-10-08", MAIN_LOCATION_ID, "g1", [{ productId: "p1", qty: 6 }])];
  const s = stockOn("2026-10-31", "", all);
  assert.equal(qtyIn(s, "main", "p1"), -3);
  assert.deepEqual(negativeAtLocations(s), [{ locationId: "main", productId: "p1", qty: -3 }]);
  // location moves are not ledger documents: the books are the same with or without them
  const data = { salesInvoices: rows.salesInvoices, purchaseInvoices: rows.purchaseInvoices, locationMoves: all };
  const a = buildGlobalLedger(data, { shopId: S }), b = buildGlobalLedger({ ...data, locationMoves: [] }, { shopId: S });
  assert.deepEqual(a.postings, b.postings);
  assert.equal(buildTrialBalance(a, { to: "2026-10-31" }).difference, 0);
  const total = onHandAt(products, movements, "2026-10-31");
  const sheet = buildBalanceSheet({ accounts: a.accounts, bal: balances(a.postings, "2026-10-31"), closingStock: valuation(products, total, cost).total, openingStock: 100 });
  assert.equal(sheet.difference, 0);
});
