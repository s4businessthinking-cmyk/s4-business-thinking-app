import test from "node:test";
import assert from "node:assert/strict";
import { orderLines, orderProgress, billOfReceipt, docTotals, shortageAfterBill, applyBackorderToOrder, pendingProductCount } from "./purchaseDocs.js";

const po = { id: "po1", status: "open", items: [{ productId: "a", unit: "Pcs", qty: 10, unitCost: 5 }, { productId: "b", unit: "Box", qty: 2, unitCost: 100 }] };

test("an order with nothing received is open", () => {
  assert.equal(orderProgress(po, [], []), "open");
  assert.deepEqual(orderLines(po, [], []).map((l) => l.remaining), [10, 2]);
});

test("goods received notes and direct bills count, bills made from a received note do not count twice", () => {
  const grns = [{ id: "g1", purchaseOrderId: "po1", status: "confirmed", items: [{ productId: "a", unit: "Pcs", qty: 4 }] }];
  const pis = [
    { id: "p1", purchaseOrderId: "po1", goodsReceiptId: "g1", status: "confirmed", items: [{ productId: "a", unit: "Pcs", qty: 4 }] },
    { id: "p2", purchaseOrderId: "po1", status: "paid", items: [{ productId: "b", unit: "Box", qty: 2 }] },
    { id: "p3", purchaseOrderId: "po1", status: "cancelled", items: [{ productId: "a", unit: "Pcs", qty: 6 }] },
  ];
  assert.deepEqual(orderLines(po, pis, grns).map((l) => [l.received, l.remaining]), [[4, 6], [2, 0]]);
  assert.equal(orderProgress(po, pis, grns), "partial");
  grns.push({ id: "g2", purchaseOrderId: "po1", status: "confirmed", items: [{ productId: "a", unit: "Pcs", qty: 6 }] });
  assert.equal(orderProgress(po, pis, grns), "received");
});

test("closing and cancelling", () => {
  assert.equal(orderProgress({ ...po, status: "closed" }, [], []), "closed");
  assert.equal(orderProgress({ ...po, status: "cancelled" }, [], []), "cancelled");
});

test("a full-order bill that drops missing products returns those as shortage", () => {
  const billed = [{ productId: "a", unit: "Pcs", qty: 10 }];
  const miss = shortageAfterBill(po, billed, [], []);
  assert.deepEqual(miss.map((l) => [l.productId, l.shortage]), [["b", 2]]);
  assert.equal(pendingProductCount(po, [], []), 2);
});

test("missing products move to a new order and the original counts as invoiced", () => {
  const miss = shortageAfterBill(po, [{ productId: "a", unit: "Pcs", qty: 10 }], [], []);
  const items = applyBackorderToOrder(po, miss);
  const split = { ...po, items };
  const bill = { id: "p1", purchaseOrderId: "po1", status: "confirmed", items: [{ productId: "a", unit: "Pcs", qty: 10 }] };
  assert.equal(orderProgress(split, [bill], []), "invoiced");
  assert.deepEqual(orderLines(split, [bill], []).map((l) => l.remaining), [0, 0]);
  assert.equal(pendingProductCount(split, [bill], []), 0);
});

test("a received note knows its bill; totals add VAT", () => {
  const pis = [{ id: "x", goodsReceiptId: "g1", status: "cancelled" }, { id: "y", goodsReceiptId: "g1", status: "confirmed", invoiceNo: "PI-9" }];
  assert.equal(billOfReceipt({ id: "g1" }, pis).invoiceNo, "PI-9");
  assert.equal(billOfReceipt({ id: "g2" }, pis), null);
  assert.deepEqual(docTotals([{ qty: 2, unitCost: 50, taxPerc: 5 }]), { sub: 100, tax: 5, grand: 105 });
});
