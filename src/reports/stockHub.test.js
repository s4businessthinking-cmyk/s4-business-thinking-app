import test from "node:test";
import assert from "node:assert/strict";
import { branchStock, itemLedger, movementByProduct, onHandAt, productMatches, stockMovements, valuation } from "./stockHub.js";

const S = "s1";
const products = [
  { id: "p1", code: "F-100", name: "Oil Filter", brand: "Bosch", category: "Filters", openingStock: 10, unit: "Pcs", unitPrices: [{ unit: "Box", factor: 12 }], rackLocation: "A/2/5" },
  { id: "p2", code: "B-200", name: "Brake Pad", brand: "TRW", category: "Brakes", openingStock: 0, unit: "Pcs" },
  { id: "p3", code: "S-300", name: "Spark Plug", brand: "NGK", category: "Ignition", openingStock: 2, unit: "Pcs" },
];
const line = (productId, qty, extra = {}) => ({ productId, qty, ...extra });
const rows = {
  purchaseInvoices: [
    { id: "pi1", shopId: S, status: "confirmed", invoiceNo: "PI-1", invoiceDate: "2026-10-01", vendorName: "Gulf", items: [line("p1", 2, { unit: "Box" }), line("p2", 5)] },
    { id: "pi2", shopId: S, status: "draft", invoiceNo: "PI-D", invoiceDate: "2026-10-01", items: [line("p1", 99)] },
    { id: "pi3", shopId: S, status: "confirmed", invoiceNo: "BT-1", invoiceDate: "2026-10-02", internalTransfer: true, items: [line("p1", 50)] },
    // billed 8 against a goods receipt of 6: only the extra 2 moves on the bill
    { id: "pi4", shopId: S, status: "confirmed", invoiceNo: "PI-4", invoiceDate: "2026-10-12", goodsReceiptId: "g1", items: [line("p2", 8)] },
  ],
  salesInvoices: [
    { id: "si1", shopId: S, status: "paid", invoiceNo: "SI-1", invoiceDate: "2026-10-05", customerName: "Al Noor", items: [line("p1", 7), line("p3", 3)] },
    { id: "si2", shopId: S, status: "cancelled", invoiceNo: "SI-X", invoiceDate: "2026-10-05", items: [line("p1", 99)] },
    // delivered 4 on a note, billed 4: the bill moves nothing
    { id: "si3", shopId: S, status: "confirmed", invoiceNo: "SI-3", invoiceDate: "2026-10-20", deliveryNoteId: "dn1", items: [line("p2", 4)] },
  ],
  deliveryNotes: [{ id: "dn1", shopId: S, status: "invoiced", invoiceNo: "DN-1", invoiceDate: "2026-10-15", items: [line("p2", 4)] }],
  extras: {
    goodsReceipts: [{ id: "g1", shopId: S, status: "invoiced", docNo: "GRN-1", receiveDate: "2026-10-10", items: [line("p2", 6)] }],
    salesReturns: [{ id: "sr1", shopId: S, status: "confirmed", returnNo: "SR-1", returnDate: "2026-10-06", items: [line("p1", 1)] }],
    purchaseReturns: [{ id: "pr1", shopId: S, status: "confirmed", returnNo: "PR-1", returnDate: "2026-10-07", items: [line("p2", 1)] }],
    stockAdjustments: [{ id: "a1", shopId: S, status: "confirmed", adjustNo: "ADJ-1", adjustDate: "2026-10-08", items: [line("p1", 2, { direction: "out" }), line("p3", 1, { direction: "in" })] }],
    warrantyClaims: [{ id: "w1", shopId: S, status: "replaced", claimNo: "WC-1", claimDate: "2026-09-01", replacedDate: "2026-10-25", productId: "p3", qty: 1 }],
  },
};
const mv = stockMovements(products, rows, S);

test("on hand follows the stock rules: units, notes, transfers, drafts, cancelled", () => {
  const qty = onHandAt(products, mv);
  // p1: 10 + 24 (2 Box) - 7 + 1 - 2 = 26
  assert.equal(qty.get("p1"), 26);
  // p2: 5 + 6 (GRN) + 2 (bill over GRN) - 1 (return) - 4 (DN) = 8
  assert.equal(qty.get("p2"), 8);
  // p3: 2 - 3 + 1 + 1 (warranty replaced) = 1
  assert.equal(qty.get("p3"), 1);
  assert.equal(mv.some((m) => ["pi2", "pi3", "si2", "si3"].includes(m.docId)), false);
  assert.deepEqual(mv.filter((m) => m.docId === "pi4").map((m) => [m.productId, m.qtyIn]), [["p2", 2]]);
});

test("as-at cut and moving-item totals", () => {
  const early = onHandAt(products, mv, "2026-10-05");
  assert.equal(early.get("p1"), 27);
  assert.equal(early.get("p3"), -1);
  const by = movementByProduct(mv, { from: "2026-10-01", to: "2026-10-31" });
  assert.deepEqual([by.get("p1").in, by.get("p1").out, by.get("p1").net, by.get("p1").docs], [25, 9, 16, 4]);
  assert.equal(by.get("p3").last, "2026-10-25");
});

test("item ledger: opening + in - out = closing = on hand", () => {
  const led = itemLedger(products, mv, "p1", { from: "2026-10-05", to: "2026-10-31" });
  assert.equal(led.opening, 34);
  assert.deepEqual(led.lines.map((l) => [l.no, l.qtyIn, l.qtyOut, l.balance]), [["SI-1", 0, 7, 27], ["SR-1", 1, 0, 28], ["ADJ-1", 0, 2, 26]]);
  assert.equal(led.closing, onHandAt(products, mv, "2026-10-31").get("p1"));
  assert.equal(led.opening + led.qtyIn - led.qtyOut, led.closing);
  const all = itemLedger(products, mv, "p2");
  assert.equal(all.closing, 8);
  assert.equal(all.lines[0].kind, "purchase");
});

test("valuation: qty x average cost, negative not valued, unpriced flagged", () => {
  const qty = new Map([["p1", 26], ["p2", 8], ["p3", -1]]);
  const v = valuation(products, qty, new Map([["p1", 4.5], ["p2", 0]]));
  assert.equal(v.total, 117);
  assert.equal(v.unpriced, 1);
  assert.equal(v.negative, 1);
  assert.equal(v.rows.find((r) => r.id === "p3").value, 0);
  assert.deepEqual(v.byCategory[0], { name: "Filters", qty: 26, value: 117 });
});

test("branch stock: received less branch sales; main is the rest", () => {
  const b = branchStock(
    [{ branchId: "b1", productId: "p1", quantity: 10 }, { branchId: "b2", productId: "p1", quantity: 3 }, { branchId: "b1", productId: "p2", quantity: 0 }],
    new Map([["b1|p1", 4]]),
    new Map([["p1", 26], ["p2", 8]]),
    [{ id: "b1", name: "Deira" }],
  );
  assert.deepEqual(b.rows.map((r) => [r.branchName, r.productId, r.current]), [["Deira", "p1", 6], ["b2", "p1", 3]]);
  assert.equal(b.atBranches.get("p1"), 9);
  assert.equal(b.main.get("p1"), 17);
  assert.equal(b.main.get("p2"), 8);
});

test("product search covers code, name, brand, category and rack", () => {
  assert.equal(productMatches(products[0], "bosch"), true);
  assert.equal(productMatches(products[0], "a/2"), true);
  assert.equal(productMatches(products[0], "f-1"), true);
  assert.equal(productMatches(products[1], "filter"), false);
});
