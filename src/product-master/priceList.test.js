import test from "node:test";
import assert from "node:assert/strict";
import { customerRates, priceListRows, rateSource, typesWithRates, unitsOf } from "./priceList.js";

// The invoice's rule (siResolveRate in sales-invoice/siHelpers.js), written out here because that module also loads
// the offline store, which the test runner cannot import.
const normType = (v) => ({ "হোলসেল": "wholesale", "রিটেইল": "retail" })[String(v || "").trim().toLowerCase()] || String(v || "").trim().toLowerCase();
const normUnit = (v) => String(v || "").trim().toLowerCase();
const rows = (p) => (p?.multiCustomerRatesChosen && !p.multiCustomerRatesEnabled ? [] : (p?.unitPrices || []).filter((r) => r && r.unit));
const resolve = (p, unit, type) => {
  const base = p?.vatExclusive || p?.mrp || "";
  const list = rows(p).filter((r) => normUnit(r.unit) === normUnit(unit || p?.unit || "Pcs"));
  const want = normType(type);
  const m = (want && list.find((r) => normType(r.customerType) === want)) || list.find((r) => !String(r.customerType || "").trim());
  return { unitPrice: m ? (m.vatExclusive || m.mrp || m.vatInclusive || base) : base };
};
const rates = { resolve, rows, normType, normUnit };

const products = [
  { id: "p1", code: "F-100", name: "Oil Filter", brand: "Bosch", category: "Filters", unit: "Pcs", vatExclusive: "20", mrp: "25", salesVat: "5", defaultDiscount: "2",
    unitPrices: [
      { unit: "Pcs", customerType: "", vatExclusive: "20", mrp: "25", barcode: "629001" },
      { unit: "Pcs", customerType: "Wholesale", vatExclusive: "17" },
      { unit: "Box", factor: "10", customerType: "", vatExclusive: "190" },
      { unit: "Box", factor: "10", customerType: "Wholesale", vatExclusive: "160" },
    ] },
  { id: "p2", code: "B-200", name: "Brake Pad", brand: "TRW", category: "Brakes", unit: "Set", vatExclusive: "80", salesVat: "5" },
  { id: "p3", code: "S-300", name: "Spark Plug", brand: "NGK", category: "Ignition", unit: "Pcs", vatExclusive: "", salesVat: "5" },
  { id: "p4", code: "X-1", name: "Off Rates", unit: "Pcs", vatExclusive: "10", multiCustomerRatesChosen: true, multiCustomerRatesEnabled: false, unitPrices: [{ unit: "Pcs", customerType: "Wholesale", vatExclusive: "1" }] },
  { id: "p5", code: "D-1", name: "Deleted", unit: "Pcs", vatExclusive: "10", isDeleted: true },
];

test("units: base first, then every unit with a rate row", () => {
  assert.deepEqual(unitsOf(products[0], rates), [{ unit: "Pcs", factor: 1 }, { unit: "Box", factor: 10 }]);
  assert.deepEqual(unitsOf(products[1], rates), [{ unit: "Set", factor: 1 }]);
});

test("rate source follows the invoice order: special, unit default, base", () => {
  assert.equal(rateSource(products[0], "Pcs", "wholesale", rates), "special");
  assert.equal(rateSource(products[0], "Pcs", "Retail", rates), "default");
  assert.equal(rateSource(products[1], "Set", "Wholesale", rates), "base");
  assert.equal(rateSource(products[3], "Pcs", "Wholesale", rates), "base");
  assert.deepEqual(typesWithRates(products, rates), ["Wholesale"]);
});

test("price list: one row per unit, default and type prices, VAT, MRP, barcode", () => {
  const list = priceListRows(products, rates, { types: ["Wholesale"] });
  assert.deepEqual(list.map((r) => [r.name, r.unit, r.price, r.byType.Wholesale.price, r.byType.Wholesale.special]), [
    ["Brake Pad", "Set", 80, 80, false],
    ["Off Rates", "Pcs", 10, 10, false],
    ["Oil Filter", "Pcs", 20, 17, true],
    ["Oil Filter", "Box", 190, 160, true],
    ["Spark Plug", "Pcs", 0, 0, false],
  ]);
  const pcs = list.find((r) => r.name === "Oil Filter" && r.unit === "Pcs");
  assert.deepEqual([pcs.vat, pcs.priceIncl, pcs.mrp, pcs.barcode], [5, 21, 25, "629001"]);
  assert.equal(list.find((r) => r.unit === "Box").factor, 10);
});

test("filters: search, brand, category, priced only; deleted products never listed", () => {
  assert.deepEqual(priceListRows(products, rates, { search: "bosch" }).map((r) => r.unit), ["Pcs", "Box"]);
  assert.deepEqual(priceListRows(products, rates, { brand: "TRW" }).map((r) => r.code), ["B-200"]);
  assert.deepEqual(priceListRows(products, rates, { category: "Ignition" }).map((r) => r.code), ["S-300"]);
  assert.equal(priceListRows(products, rates, { pricedOnly: true }).some((r) => r.code === "S-300"), false);
  assert.equal(priceListRows(products, rates).some((r) => r.code === "D-1"), false);
});

test("customer view: type rate, invoice discount rule, net with and without VAT", () => {
  const wholesale = customerRates(products, { customerType: "হোলসেল", discountPerc: "5" }, rates);
  const pcs = wholesale.find((r) => r.code === "F-100" && r.unit === "Pcs");
  // wholesale row 17, discount = max(product 2, customer 5) = 5 -> 16.15, + 5% VAT
  assert.deepEqual([pcs.source, pcs.list, pcs.discount, pcs.net, pcs.netIncl], ["special", 17, 5, 16.15, 16.96]);
  const walkIn = customerRates(products, null, rates).find((r) => r.code === "F-100" && r.unit === "Pcs");
  assert.deepEqual([walkIn.source, walkIn.list, walkIn.discount, walkIn.net], ["default", 20, 2, 19.6]);
  assert.equal(customerRates(products, { customerType: "Wholesale" }, rates).find((r) => r.code === "B-200").source, "base");
});
