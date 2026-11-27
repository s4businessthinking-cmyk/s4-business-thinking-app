import assert from "node:assert/strict";
import test from "node:test";
import { buildHqDispatchStockAdjustDoc } from "./branchDispatchStockDoc.js";

test("buildHqDispatchStockAdjustDoc builds confirmed stock-out adjustment", () => {
  const doc = buildHqDispatchStockAdjustDoc({
    transfer: {
      id: "bt-1",
      shopId: "hq-shop",
      transferNo: "BT-100",
      branchName: "Branch 1",
      dispatchedAt: "2026-03-10T10:00:00.000Z",
      items: [
        { productId: "p1", name: "Oil filter", quantity: 2 },
        { productId: "p2", name: "Pad", quantity: 0 },
      ],
    },
    actor: { uid: "u1", personName: "Admin" },
  });
  assert.equal(doc.id, "sa-bt-dispatch-bt-1");
  assert.equal(doc.shopId, "hq-shop");
  assert.equal(doc.reason, "branch_transfer_out");
  assert.equal(doc.status, "confirmed");
  assert.equal(doc.items.length, 1);
  assert.equal(doc.items[0].direction, "out");
  assert.equal(doc.items[0].qty, 2);
});

test("buildHqDispatchStockAdjustDoc returns null without qty", () => {
  assert.equal(
    buildHqDispatchStockAdjustDoc({
      transfer: { id: "x", shopId: "h", items: [{ quantity: 0 }] },
      actor: {},
    }),
    null
  );
});