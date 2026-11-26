import test from "node:test";
import assert from "node:assert/strict";
import { bomRecipeLines, normalizeManufacturingBom, validateManufacturingBom } from "./manufacturingBom.js";

test("BOM: normalize drops self, zero qty, duplicates", () => {
  const lines = normalizeManufacturingBom([
    { productId: "p1", qtyPer: 2 },
    { productId: "p1", qtyPer: 3 },
    { productId: "p2", qtyPer: 0 },
    { productId: "kit", qtyPer: 1 },
  ], { productId: "kit" });
  assert.deepEqual(lines.map((l) => [l.productId, l.qtyPer]), [["p1", 2]]);
});

test("BOM: recipe lines for bundle", () => {
  const p = { id: "kit", manufacturingBom: [{ productId: "a", qtyPer: 1.5 }, { productId: "b", qtyPer: 4 }] };
  assert.deepEqual(bomRecipeLines(p), [{ productId: "a", per: 1.5 }, { productId: "b", per: 4 }]);
});

test("BOM: validate known products", () => {
  const byId = new Map([["p1", {}]]);
  assert.equal(validateManufacturingBom([{ productId: "p1", qtyPer: 1 }], { productById: byId }).ok, true);
  assert.equal(validateManufacturingBom([{ productId: "gone", qtyPer: 1 }], { productById: byId }).ok, false);
});