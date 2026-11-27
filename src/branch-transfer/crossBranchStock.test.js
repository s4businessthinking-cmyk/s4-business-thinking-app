import assert from "node:assert/strict";
import test from "node:test";
import { buildCrossBranchRows, crossBranchQtyRows } from "./crossBranchStockQuery.js";

test("crossBranchQtyRows returns qty per branch for product", () => {
  const cross = [
    {
      branchId: "main",
      name: "HQ",
      ledgerShopId: "hq",
      qtyByProductId: new Map([["p1", 5]]),
    },
    {
      branchId: "b1",
      name: "Branch 1",
      ledgerShopId: "child-1",
      qtyByProductId: new Map([["p1", 12]]),
    },
  ];
  const rows = crossBranchQtyRows(cross, "p1");
  assert.equal(rows.length, 2);
  assert.equal(rows[1].qty, 12);
});

test("buildCrossBranchRows lists HQ and child ledger files", () => {
  const products = [{ id: "p1", unit: "Pcs" }];
  const stockMapForShopId = (list, shopId) => {
    void list;
    return shopId === "hq" ? new Map([["p1", 3]]) : new Map([["p1", 7]]);
  };
  const out = buildCrossBranchRows({
    homeShopId: "hq",
    branches: [{ id: "b1", shopId: "hq", name: "B1", ledgerShopId: "child-1", active: true }],
    productList: products,
    stockMapForShopId,
  });
  assert.equal(out.length, 2);
  assert.equal(out[0].qtyByProductId.get("p1"), 3);
  assert.equal(out[1].qtyByProductId.get("p1"), 7);
});