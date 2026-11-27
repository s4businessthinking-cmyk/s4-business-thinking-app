import assert from "node:assert/strict";
import test from "node:test";
import { branchDefaultsOf, branchForNewBill } from "./userBranchDefaults.js";

test("branchDefaultsOf returns null when no stockLocation", () => {
  assert.equal(branchDefaultsOf({}), null);
  assert.equal(branchDefaultsOf({ stockLocation: "" }), null);
});

test("branchDefaultsOf normalizes main branch", () => {
  assert.deepEqual(branchDefaultsOf({ stockLocation: "main" }), { stockLocation: "main", stockLocationName: "Main" });
  assert.deepEqual(branchDefaultsOf({ stockLocation: "main", stockLocationName: "HQ" }), { stockLocation: "main", stockLocationName: "HQ" });
});

test("branchForNewBill prefers override over login default", () => {
  const defaults = { stockLocation: "b1", stockLocationName: "Branch 1" };
  assert.deepEqual(branchForNewBill(defaults, { stockLocation: "b2", stockLocationName: "Branch 2" }), {
    stockLocation: "b2",
    stockLocationName: "Branch 2",
  });
  assert.deepEqual(branchForNewBill(defaults, null), { stockLocation: "b1", stockLocationName: "Branch 1" });
  assert.deepEqual(branchForNewBill({}, null), { stockLocation: "main", stockLocationName: "Main" });
});