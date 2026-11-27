import test from "node:test";
import assert from "node:assert/strict";
import { branchCompanyShopId } from "./branchCompanyFileIds.js";

test("branchCompanyShopId is stable and unique per branch", () => {
  const parent = "shop-golden";
  const a = branchCompanyShopId(parent, "branch-abc");
  const b = branchCompanyShopId(parent, "branch-abc");
  const c = branchCompanyShopId(parent, "branch-xyz");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.ok(a.startsWith(`${parent}-bf-`));
  assert.equal(branchCompanyShopId("", "x"), "");
});