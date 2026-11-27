import assert from "node:assert/strict";
import test from "node:test";
import { mergeSharedParties, resolvePartyParentShopId } from "./companyPartyScope.js";

test("resolvePartyParentShopId returns parent for child company file", () => {
  const parent = resolvePartyParentShopId(
    { shopId: "child-1", parentShopId: "hq-1", isBranchCompanyFile: true },
    { sharePartiesFromHq: true }
  );
  assert.equal(parent, "hq-1");
});

test("mergeSharedParties overlays child on HQ by id", () => {
  const merged = mergeSharedParties(
    [{ id: "c1", customerName: "Child Only", shopId: "child" }],
    [{ id: "c1", customerName: "HQ Name", shopId: "hq" }, { id: "c2", customerName: "HQ Two", shopId: "hq" }],
    "customerName"
  );
  assert.equal(merged.length, 2);
  assert.equal(merged.find((r) => r.id === "c1").customerName, "Child Only");
  assert.equal(merged.find((r) => r.id === "c2").sharedFromHq, true);
});