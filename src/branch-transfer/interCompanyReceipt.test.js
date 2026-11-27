import assert from "node:assert/strict";
import test from "node:test";
import { buildChildCompanyReceiptInvoice } from "./interCompanyReceiptInvoice.js";

test("buildChildCompanyReceiptInvoice targets child shop and flags interCompanyIn", () => {
  const transfer = {
    shopId: "hq",
    branchName: "Branch 1",
    transferNo: "BT-9",
    vendorName: "Internal",
    purchaseInvoicePaymentMethod: "cash",
  };
  const receipt = {
    id: "rcp-1",
    sequence: 2,
    receivedAt: "2026-11-27T10:00:00.000Z",
    lines: [{ acceptedQty: 3, productId: "p1", name: "Filter", unitCost: 10, unit: "Pcs" }],
  };
  const inv = buildChildCompanyReceiptInvoice({
    transfer,
    receipt,
    childShopId: "child-shop",
    actor: { uid: "u1", personName: "Owner" },
  });
  assert.equal(inv.shopId, "child-shop");
  assert.equal(inv.interCompanyIn, true);
  assert.equal(inv.internalTransfer, false);
  assert.equal(inv.sourceShopId, "hq");
  assert.match(inv.invoiceNo, /^PI-IC-BT-9-2$/);
  assert.equal(inv.grandTotal, 30);
});