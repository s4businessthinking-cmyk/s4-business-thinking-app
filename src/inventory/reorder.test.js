import test from "node:test";
import assert from "node:assert/strict";
import { lowStockRows, reorderLevels, reorderRows, reorderText, watchedProducts } from "./reorder.js";

const products = [
  { id: "a", code: "A1", name: "Air Filter", unit: "Pcs", reorderMin: "5" },
  { id: "b", code: "B1", name: "Brake Pad", unit: "Set", reorderMin: 5 },
  { id: "c", code: "C1", name: "Coolant", unit: "Ltr" },
  { id: "d", code: "D1", name: "Disc", unit: "Pcs", reorderMin: 4, reorderMax: 20 },
  { id: "e", code: "E1", name: "Engine Oil", unit: "Ltr", reorderMin: 10, reorderQty: 24 },
  { id: "x", code: "X1", name: "Deleted", reorderMin: 99, isDeleted: true },
];
const stock = new Map([["a", 3], ["b", 10], ["c", 0], ["d", 0], ["e", 10], ["x", 0]]);

test("levels and the products that are watched", () => {
  assert.deepEqual(reorderLevels(products[3]), { min: 4, max: 20, qty: 0 });
  assert.deepEqual(watchedProducts(products).map((p) => p.id), ["a", "b", "d", "e"], "no level or deleted: not watched");
});

test("min 5 with 3 in stock is listed; 10 in stock is not; no level is never listed", () => {
  const rows = lowStockRows(products, stock);
  assert.deepEqual(rows.map((r) => r.id), ["d", "a", "e"], "most short first (4, 2, 0 short), at the level counts");
  assert.equal(rows.some((r) => r.id === "b"), false);
  assert.equal(rows.some((r) => r.id === "c"), false);
  const a = rows.find((r) => r.id === "a"), d = rows.find((r) => r.id === "d"), e = rows.find((r) => r.id === "e");
  assert.deepEqual([a.stock, a.min, a.short, a.suggest, a.out], [3, 5, 2, 2, false], "back up to the level");
  assert.deepEqual([d.suggest, d.out], [20, true], "up to the maximum");
  assert.equal(e.suggest, 24, "the reorder quantity");
  assert.deepEqual(lowStockRows(products, new Map([["a", 6], ["b", 10], ["d", 5], ["e", 11]])), [], "raised stock leaves the list");
  assert.deepEqual(lowStockRows([{ ...products[0], reorderMin: 2 }], stock), [], "a lower level leaves the list");
});

test("CSV and copy text match the list", () => {
  const rows = lowStockRows(products, stock);
  const csv = reorderRows(rows);
  assert.deepEqual(csv[0], ["Code", "Product", "Brand", "Category", "Rack", "Unit", "In stock", "Reorder level", "Max level", "Reorder qty", "Suggested buy"]);
  assert.deepEqual(csv.find((r) => r[0] === "A1"), ["A1", "Air Filter", "", "", "", "Pcs", "3", "5", "", "", "2"]);
  assert.equal(csv.length, rows.length + 1);
  const text = reorderText(rows, { shopName: "Gulf Parts", day: "2026-11-25" });
  assert.equal(text.split("\n")[2], "2. Air Filter [A1] - stock 3 Pcs, buy 2");
});
