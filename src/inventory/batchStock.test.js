import test from "node:test";
import assert from "node:assert/strict";
import { batchStockByProduct, saleBatchChoices } from "./batchStock.js";

test("batch stock follows batch lines; the rest is main stock", () => {
  const products = [{ id: "p", unit: "Pcs", unitPrices: [{ unit: "Box", factor: 10 }] }, { id: "q", unit: "Pcs" }];
  const data = {
    purchaseInvoices: [
      { id: "i1", shopId: "x", status: "paid", invoiceDate: "2026-10-01", invoiceNo: "PI-1", vendorName: "Gulf", items: [{ productId: "p", qty: 2, unit: "Box", unitFactor: 10, lineTotal: 210, taxAmt: 10, salePrice: 280, batchNo: "PI-1-B1" }] },
      { id: "i2", shopId: "x", status: "cancelled", invoiceDate: "2026-10-02", items: [{ productId: "p", qty: 5, batchNo: "PI-2-B1" }] },
      { id: "i3", shopId: "x", status: "confirmed", invoiceDate: "2026-10-03", items: [{ productId: "q", qty: 5 }] },
    ],
    salesInvoices: [
      { id: "s1", shopId: "x", status: "paid", items: [{ productId: "p", qty: 3, batchNo: "PI-1-B1" }, { productId: "p", qty: 1 }] },
      { id: "s2", shopId: "x", status: "paid", deliveryNoteId: "d1", items: [{ productId: "p", qty: 2, batchNo: "PI-1-B1" }] },
    ],
    deliveryNotes: [{ id: "d1", shopId: "x", status: "invoiced", items: [{ productId: "p", qty: 2, batchNo: "PI-1-B1" }] }],
    extras: { salesReturns: [{ id: "r1", shopId: "x", status: "confirmed", items: [{ productId: "p", qty: 1, unitFactor: 1, batchNo: "PI-1-B1" }] }], purchaseReturns: [] },
  };
  const stockMap = new Map([["p", 21], ["q", 5]]);
  const res = batchStockByProduct(products, data, "x", stockMap);
  assert.equal(res.has("q"), false);
  const p = res.get("p");
  assert.equal(p.batches.length, 1);
  assert.deepEqual(
    { stock: p.batches[0].stock, qtyIn: p.batches[0].qtyIn, qtyOut: p.batches[0].qtyOut, cost: p.batches[0].cost, mrp: p.batches[0].mrp, vendor: p.batches[0].vendorName },
    { stock: 16, qtyIn: 20, qtyOut: 4, cost: 10, mrp: 28, vendor: "Gulf" },
  );
  assert.equal(p.main, 5);
  assert.deepEqual(saleBatchChoices(p).map((c) => [c.batchNo, c.stock]), [["", 5], ["PI-1-B1", 16]]);
  assert.deepEqual(saleBatchChoices({ main: 0, batches: [{ batchNo: "B", stock: 0 }] }), []);
});
