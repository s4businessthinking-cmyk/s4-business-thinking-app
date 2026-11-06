import test from "node:test";
import assert from "node:assert/strict";
import { buildExchangeItems, exchangeSummary, exchangeReasonLabel } from "./productExchange.js";

const wrong = { productId: "a", name: "Fitting 10mm", code: "F10", unit: "Pcs" };
const right = { productId: "b", name: "Fitting 12mm", code: "F12", unit: "Pcs" };

test("exchange takes wrong product out and puts correct product in", () => {
  const stockMap = new Map([["a", 4], ["b", 1]]);
  const r = buildExchangeItems({ out: wrong, outQty: "2", into: right, inQty: "2", stockMap });
  assert.deepEqual(r.items.map((it) => [it.productId, it.direction, it.qty, it.stockBefore]), [
    ["a", "out", 2, 4],
    ["b", "in", 2, 1],
  ]);
});

test("fitting more/less allows different quantities on each side", () => {
  const r = buildExchangeItems({ out: wrong, outQty: 1, into: right, inQty: 3, stockMap: null });
  assert.equal(r.items[0].qty, 1);
  assert.equal(r.items[1].qty, 3);
});

test("bad exchange input is refused", () => {
  assert.equal(buildExchangeItems({ out: null, outQty: 1, into: right, inQty: 1 }).error, "noOut");
  assert.equal(buildExchangeItems({ out: wrong, outQty: 1, into: null, inQty: 1 }).error, "noIn");
  assert.equal(buildExchangeItems({ out: wrong, outQty: 1, into: wrong, inQty: 1 }).error, "same");
  assert.equal(buildExchangeItems({ out: wrong, outQty: 0, into: right, inQty: 1 }).error, "noOutQty");
  assert.equal(buildExchangeItems({ out: wrong, outQty: 1, into: right, inQty: 0 }).error, "noInQty");
});

test("summary and reason labels", () => {
  assert.match(exchangeSummary({ items: [{ direction: "out", name: "A", qty: 1 }, { direction: "in", name: "B", qty: 2 }] }), /A × 1 → B × 2/);
  assert.equal(exchangeReasonLabel("fitting", true), "ফিটিং বেশি / কম");
  assert.equal(exchangeReasonLabel("wrong", false), "Wrong product");
});
