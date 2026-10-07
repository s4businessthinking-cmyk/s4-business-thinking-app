import test from "node:test";
import assert from "node:assert/strict";
import { batchReasons, isForeign, lineToBase, nextBatchNo, purchaseOptionsOf, rateOf } from "./purchaseOptions.js";

const all = { refNo: true, multiCurrency: true, batchVendor: true, batchMrp: true, batchCost: true };
const product = { id: "p", name: "Filter", unit: "Pcs", mrp: "25", landingCost: "10", unitPrices: [{ unit: "Box", factor: 12 }] };

test("options default to off and only true switches them on", () => {
  assert.deepEqual(purchaseOptionsOf({}), { refNo: false, multiCurrency: false, batchVendor: false, batchMrp: false, batchCost: false });
  assert.equal(purchaseOptionsOf({ purchaseOptions: { refNo: true, batchMrp: "yes" } }).refNo, true);
  assert.equal(purchaseOptionsOf({ purchaseOptions: { refNo: true, batchMrp: "yes" } }).batchMrp, false);
});

test("foreign currency bills convert line costs to the shop currency", () => {
  assert.equal(isForeign({ currency: "" }, "AED"), false);
  assert.equal(isForeign({ currency: "aed" }, "AED"), false);
  assert.equal(rateOf({ currency: "USD", exchangeRate: "3.6725" }, "AED"), 3.6725);
  assert.equal(rateOf({ currency: "USD", exchangeRate: "" }, "AED"), 0);
  assert.equal(rateOf({ currency: "" }, "AED"), 1);
  assert.equal(lineToBase({ unitCost: "10" }, 3.6725).unitCost, "36.725");
  const same = { unitCost: "5" };
  assert.equal(lineToBase(same, 1), same);
});

test("separate-batch question only when stock is on hand and something differs", () => {
  const line = { unit: "Pcs", unitCost: "10", salePrice: "25" };
  const lastVendor = { id: "v1", name: "Al Noor" };
  assert.deepEqual(batchReasons({ options: all, product, line, vendorId: "v1", vendorName: "Al Noor", lastVendor, stock: 5 }), []);
  assert.deepEqual(batchReasons({ options: all, product, line: { ...line, unitCost: "12", salePrice: "28" }, vendorId: "v2", vendorName: "Gulf", lastVendor, stock: 0 }), []);
  const r = batchReasons({ options: all, product, line: { ...line, unitCost: "12", salePrice: "28" }, vendorId: "v2", vendorName: "Gulf", lastVendor, stock: 5 });
  assert.deepEqual(r.map((x) => x.key), ["vendor", "mrp", "cost"]);
  assert.deepEqual(r[2], { key: "cost", from: 10, to: 12 });
  assert.deepEqual(batchReasons({ options: { ...all, batchVendor: false, batchMrp: false }, product, line: { ...line, unitCost: "12", salePrice: "28" }, vendorName: "Gulf", lastVendor, stock: 5 }).map((x) => x.key), ["cost"]);
  // A box of 12 at 120 is still 10 a piece; 300 a box is still 25 a piece.
  assert.deepEqual(batchReasons({ options: all, product, line: { unit: "Box", unitCost: "120", salePrice: "300" }, vendorName: "Al Noor", lastVendor, stock: 5 }), []);
  // A USD cost is compared after conversion.
  assert.deepEqual(batchReasons({ options: all, product, line: { ...line, unitCost: "2.7230" }, rate: 3.6725, vendorName: "Al Noor", lastVendor, stock: 5 }), []);
});

test("batch numbers are unique within the bill", () => {
  assert.equal(nextBatchNo("PI-0007", []), "PI-0007-B1");
  assert.equal(nextBatchNo("PI-0007", [{ batchNo: "PI-0007-B1" }, {}]), "PI-0007-B2");
});
