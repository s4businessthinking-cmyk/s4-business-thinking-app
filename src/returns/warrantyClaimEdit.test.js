import assert from "node:assert/strict";
import test from "node:test";
import {
  buildClaimEditPatch, canEditOpenClaim, editableKeysFor,
} from "./warrantyClaimEdit.js";

test("only received/sent claims are editable", () => {
  assert.equal(canEditOpenClaim({ status: "received" }), true);
  assert.equal(canEditOpenClaim({ status: "sent" }), true);
  assert.equal(canEditOpenClaim({ status: "replaced" }), false);
  assert.equal(canEditOpenClaim({ status: "delivered" }), false);
  assert.equal(canEditOpenClaim({ status: "cancelled" }), false);
});

test("received allows product/qty; sent does not", () => {
  assert.ok(editableKeysFor({ status: "received" }).includes("productId"));
  assert.ok(editableKeysFor({ status: "received" }).includes("qty"));
  assert.equal(editableKeysFor({ status: "sent" }).includes("productId"), false);
  assert.ok(editableKeysFor({ status: "sent" }).includes("serialNo"));
});

test("buildClaimEditPatch only writes changed allowed fields", () => {
  const claim = {
    status: "received", productId: "p1", productName: "Bat", qty: 1,
    serialNo: "A", note: "old", customerName: "Ali",
  };
  const patch = buildClaimEditPatch(claim, {
    productId: "p2", productName: "Bat 2", qty: "2", serialNo: "A", note: "new", customerName: "Ali",
  });
  assert.deepEqual(patch, { productId: "p2", productName: "Bat 2", qty: 2, note: "new" });
});

test("sent claim rejects product change in patch", () => {
  const claim = { status: "sent", productId: "p1", note: "x", serialNo: "S1" };
  const patch = buildClaimEditPatch(claim, { productId: "p9", note: "y", serialNo: "S2" });
  assert.equal(patch.productId, undefined);
  assert.equal(patch.note, "y");
  assert.equal(patch.serialNo, "S2");
});
