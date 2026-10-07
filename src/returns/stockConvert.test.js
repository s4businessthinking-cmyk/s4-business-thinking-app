import test from "node:test";
import assert from "node:assert/strict";
import { buildConvertItems, lastRecipe } from "./stockConvert.js";
const box = { productId: "box", name: "Bulb Box", unit: "Box" };
const pcs = { productId: "pcs", name: "Bulb", unit: "Pcs" };

test("loosening takes the box out and puts pieces in", () => {
  const stockMap = new Map([["box", 5], ["pcs", 2]]);
  const r = buildConvertItems("loosen", box, "2", [{ ...pcs, per: "10" }], stockMap);
  assert.deepEqual(r.items.map((it) => [it.productId, it.direction, it.qty]), [["box", "out", 2], ["pcs", "in", 20]]);
  assert.equal(r.items[0].stockBefore, 5);
  assert.equal(r.items[1].perUnit, 10);
});

test("bundling takes parts out and puts the kit in", () => {
  const r = buildConvertItems("bundle", { productId: "kit", name: "Kit" }, 3, [{ productId: "f", name: "Filter", per: 1 }, { productId: "o", name: "Oil", per: 4 }], null);
  assert.deepEqual(r.items.map((it) => [it.productId, it.direction, it.qty]), [["kit", "in", 3], ["f", "out", 3], ["o", "out", 12]]);
});

test("bad input is refused", () => {
  assert.equal(buildConvertItems("loosen", null, 1, [pcs], null).error, "noSingle");
  assert.equal(buildConvertItems("loosen", box, 0, [{ ...pcs, per: 1 }], null).error, "noQty");
  assert.equal(buildConvertItems("loosen", box, 1, [{ ...pcs, per: 0 }], null).error, "noLines");
  assert.equal(buildConvertItems("loosen", box, 1, [{ ...box, per: 1 }], null).error, "same");
});

test("the last conversion of a product is remembered per unit", () => {
  const rows = [
    { kind: "loosen", status: "confirmed", singleProductId: "box", singleQty: 2, createdAt: "2026-10-01", items: [{ role: "single", productId: "box", qty: 2 }, { role: "part", productId: "pcs", qty: 20, perUnit: 10 }] },
    { kind: "loosen", status: "cancelled", singleProductId: "box", singleQty: 1, createdAt: "2026-10-05", items: [{ role: "part", productId: "pcs", qty: 99 }] },
  ];
  assert.deepEqual(lastRecipe(rows, "loosen", "box"), [{ productId: "pcs", per: 10 }]);
  assert.deepEqual(lastRecipe(rows, "bundle", "box"), []);
});
