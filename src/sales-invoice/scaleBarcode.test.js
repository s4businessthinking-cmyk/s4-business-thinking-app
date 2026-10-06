import test from "node:test";
import assert from "node:assert/strict";
import { parseScaleBarcode } from "./scaleBarcode.js";

const withCheck = (twelve) => {
  const sum = twelve.split("").map(Number).reduce((acc, d, i) => acc + d * (i % 2 ? 3 : 1), 0);
  return twelve + ((10 - (sum % 10)) % 10);
};

const products = [
  { id: "w", name: "Grease", barcode: "12345", weightBarcode: true, vatInclusive: "20" },
  { id: "r", name: "Oil loose", barcode: "00777", rateBarcode: true, vatInclusive: "8" },
  { id: "n", name: "Filter", barcode: "54321", vatInclusive: "50" },
];

test("weight label gives product and kg", () => {
  const hit = parseScaleBarcode(withCheck("211234501250"), products);
  assert.equal(hit.product.id, "w");
  assert.equal(hit.kind, "weight");
  assert.equal(hit.qty, 1.25);
});

test("rate label converts price into quantity", () => {
  const hit = parseScaleBarcode(withCheck("220077702000"), products);
  assert.equal(hit.product.id, "r");
  assert.equal(hit.amount, 20);
  assert.equal(hit.qty, 2.5);
});

test("ignores bad check digit, unflagged products and normal codes", () => {
  const good = withCheck("211234501250");
  const bad = good.slice(0, 12) + ((Number(good[12]) + 1) % 10);
  assert.equal(parseScaleBarcode(bad, products), null);
  assert.equal(parseScaleBarcode(withCheck("215432101000"), products), null);
  assert.equal(parseScaleBarcode("KC374D", products), null);
});
