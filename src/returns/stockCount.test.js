import test from "node:test";
import assert from "node:assert/strict";
import { countDifferences, countSheetRows, countSummary, groupValues } from "./stockCount.js";

const products = [
  { id: "a", name: "Oil filter", code: "OF1", company: "Toyota", rackLocation: "A/1", landingCost: 10 },
  { id: "b", name: "Brake pad", code: "BP1", company: "Nissan", rackLocation: "B/2", landingCost: 25 },
  { id: "c", name: "Spark plug", code: "SP1", company: "Toyota", rackLocation: "A/3" },
  { id: "d", name: "Old", isDeleted: true },
  { id: "e", name: "Labour", isService: true },
];
const stock = { a: 10, b: 4, c: 0 };
const stockOf = (id) => (id in stock ? stock[id] : null);

test("sheet rows filter by group, search and stock", () => {
  assert.deepEqual(groupValues(products, "company"), ["Nissan", "Toyota"]);
  assert.deepEqual(groupValues(products, "rack"), ["A", "B"]);
  assert.deepEqual(countSheetRows(products, { by: "company", value: "Toyota", stockOf }).map((p) => p.id), ["a", "c"]);
  assert.deepEqual(countSheetRows(products, { onlyInStock: true, stockOf }).map((p) => p.id), ["a", "b"]);
  assert.deepEqual(countSheetRows(products, { q: "bp1", stockOf }).map((p) => p.id), ["b"]);
});

test("differences only for counted items that do not match", () => {
  const counted = { a: "8", b: "4", c: "2", d: "5", x: "1", e: "" };
  const diffs = countDifferences(products, counted, stockOf);
  assert.deepEqual(diffs.map((d) => [d.product.id, d.diff]), [["a", -2], ["c", 2]]);
  const sum = countSummary(products, counted, stockOf);
  assert.equal(sum.entered, 5);
  assert.equal(sum.short, 1);
  assert.equal(sum.extra, 1);
  assert.equal(sum.shortValue, 20);
  assert.equal(sum.extraValue, 0);
});
