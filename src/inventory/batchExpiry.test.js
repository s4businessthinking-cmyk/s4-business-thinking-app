import test from "node:test";
import assert from "node:assert/strict";
import { batchExpirySettingsOf, expiredSaleLines, expiringBatches, expiryRows, expiryState, fefoChoices } from "./batchExpiry.js";
import { batchStockByProduct, saleBatchChoices } from "./batchStock.js";

const S = "s1";
const products = [{ id: "oil", name: "Engine Oil", code: "EO-1" }, { id: "pad", name: "Brake Pad", code: "BP-1" }];
const pi = (id, day, lines) => ({ id, shopId: S, status: "confirmed", invoiceNo: id, invoiceDate: day, vendorName: "Gulf", items: lines });
const data = {
  purchaseInvoices: [
    pi("PI-1", "2026-01-10", [{ productId: "oil", qty: 10, lineTotal: 100, taxAmt: 0, batchNo: "PI-1/1", expiryDate: "2026-11-20" }]),
    pi("PI-2", "2026-03-10", [{ productId: "oil", qty: 5, lineTotal: 60, taxAmt: 0, batchNo: "PI-2/1", expiryDate: "2026-12-10" }]),
    pi("PI-3", "2026-04-10", [{ productId: "oil", qty: 4, lineTotal: 52, taxAmt: 0, batchNo: "PI-3/1", expiryDate: "2027-06-30" }]),
    pi("PI-4", "2026-05-10", [{ productId: "oil", qty: 3, lineTotal: 36, taxAmt: 0, batchNo: "PI-4/1" }]),
    // a product without batches: nothing to ask
    pi("PI-5", "2026-05-10", [{ productId: "pad", qty: 8, lineTotal: 80, taxAmt: 0 }]),
  ],
  salesInvoices: [{ id: "SI-1", shopId: S, status: "paid", invoiceNo: "SI-1", invoiceDate: "2026-06-01", items: [{ productId: "oil", qty: 2, batchNo: "PI-1/1" }] }],
  deliveryNotes: [], extras: { salesReturns: [], purchaseReturns: [] },
};
const stock = new Map([["oil", 20], ["pad", 8]]);
const batchMap = batchStockByProduct(products, data, S, stock);
const DAY = "2026-11-25";

test("settings: 30-day window and warn by default", () => {
  assert.deepEqual(batchExpirySettingsOf({}), { soonDays: 30, blockExpired: false });
  assert.deepEqual(batchExpirySettingsOf({ batchExpiry: { soonDays: "60", blockExpired: true } }), { soonDays: 60, blockExpired: true });
  assert.equal(batchExpirySettingsOf({ batchExpiry: { soonDays: 0 } }).soonDays, 30, "out of range falls back to 30");
});

test("the expiry date travels from the purchase line to the batch", () => {
  const oil = batchMap.get("oil").batches;
  assert.deepEqual(oil.map((b) => [b.batchNo, b.expiry, b.stock]), [["PI-1/1", "2026-11-20", 8], ["PI-2/1", "2026-12-10", 5], ["PI-3/1", "2027-06-30", 4], ["PI-4/1", "", 3]]);
  assert.equal(batchMap.has("pad"), false, "no batches, no batch record");
});

test("state: expired after the last day, soon within the window", () => {
  assert.deepEqual(expiryState("2026-11-25", DAY), { state: "soon", daysLeft: 0 }, "the expiry day itself can still be sold");
  assert.deepEqual(expiryState("2026-11-24", DAY), { state: "expired", daysLeft: -1 });
  assert.deepEqual(expiryState("2026-12-25", DAY, 30), { state: "soon", daysLeft: 30 });
  assert.deepEqual(expiryState("2026-12-26", DAY, 30), { state: "ok", daysLeft: 31 });
  assert.deepEqual(expiryState("", DAY), { state: "", daysLeft: null });
});

test("expiring list: expired and within the window, in stock only, soonest first", () => {
  const rows = expiringBatches(batchMap, products, DAY, 30);
  assert.deepEqual(rows.map((r) => [r.batchNo, r.state, r.daysLeft, r.stock, r.value]), [["PI-1/1", "expired", -5, 8, 80], ["PI-2/1", "soon", 15, 5, 60]]);
  assert.equal(expiringBatches(batchMap, products, DAY, 10).length, 1, "a shorter window");
  const csv = expiryRows(rows);
  assert.deepEqual(csv[0], ["Code", "Product", "Batch", "Expiry", "Days left", "Status", "In stock", "Cost value"]);
  assert.deepEqual(csv[1], ["EO-1", "Engine Oil", "PI-1/1", "2026-11-20", "-5", "Expired", "8", "80.00"]);
});

test("sale: batches offered earliest expiry first; an expired batch on the bill date is found", () => {
  const choices = fefoChoices(saleBatchChoices(batchMap.get("oil")), DAY, 30);
  assert.deepEqual(choices.map((c) => [c.batchNo || "main", c.state]), [["PI-1/1", "expired"], ["PI-2/1", "soon"], ["PI-3/1", "ok"], ["PI-4/1", ""]]);
  const bill = [{ productId: "oil", name: "Engine Oil", batchNo: "PI-1/1" }, { productId: "oil", name: "Engine Oil", batchNo: "PI-2/1" }, { productId: "pad", name: "Brake Pad" }];
  assert.deepEqual(expiredSaleLines(bill, batchMap, DAY), [{ name: "Engine Oil", batchNo: "PI-1/1", expiry: "2026-11-20" }]);
  assert.deepEqual(expiredSaleLines(bill, batchMap, "2026-11-20"), [], "sold on its last day: fine");
  assert.deepEqual(expiredSaleLines([{ productId: "pad", name: "Brake Pad" }], batchMap, DAY), [], "no batch line, nothing checked");
});
