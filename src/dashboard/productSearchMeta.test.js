import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { lastPurchaseFromInvoices, productSearchSub } from "./productSearchMeta.js";

describe("global search last purchase", () => {
  it("shows last purchase date and vendor on a product hit", () => {
    const sub = productSearchSub({
      code: "P1",
      lastPurchaseDate: "2026-10-15",
      lastPurchaseVendorName: "Al Noor",
      mrp: "10",
    }, { bn: false, cur: "AED" });
    assert.match(sub, /Last purchase: 2026-10-15/);
    assert.match(sub, /Vendor: Al Noor/);
  });

  it("picks the newest purchase invoice per product and skips cancelled", () => {
    const map = lastPurchaseFromInvoices([
      { id: "inv-x", status: "cancelled", invoiceDate: "2026-11-01", vendorName: "Old", items: [{ productId: "p1" }] },
      { id: "inv-d", status: "draft", invoiceDate: "2026-10-30", vendorName: "Draft Co", items: [{ productId: "p1" }] },
      { id: "inv-old", status: "confirmed", invoiceDate: "2026-09-01", vendorName: "First", items: [{ productId: "p1" }] },
      { id: "inv-paid", status: "paid", invoiceDate: "2026-10-20", vendorName: "Latest Co", createdAt: "2026-10-20T12:00:00Z", items: [{ productId: "p1" }] },
    ]);
    assert.equal(map.p1.date, "2026-10-20");
    assert.equal(map.p1.vendor, "Latest Co");
    assert.equal(map.p1.invoiceId, "inv-paid");
  });

  it("skips branch transfer and opening-balance bills", () => {
    const map = lastPurchaseFromInvoices([
      { id: "bt", status: "confirmed", invoiceDate: "2026-11-01", vendorName: "Branch", internalTransfer: true, items: [{ productId: "p1" }] },
      { id: "ob", status: "paid", invoiceDate: "2026-11-01", vendorName: "Open", source: "openingBalance", items: [{ productId: "p1" }] },
      { id: "real", status: "confirmed", invoiceDate: "2026-09-01", vendorName: "Vendor A", items: [{ productId: "p1" }] },
    ]);
    assert.equal(map.p1.invoiceId, "real");
    assert.equal(map.p1.vendor, "Vendor A");
  });

  it("matches by product code when the line has no productId", () => {
    const map = lastPurchaseFromInvoices([
      { id: "inv-code", status: "paid", invoiceDate: "2026-08-12", vendorName: "Code Co", items: [{ code: "ABC-9" }] },
    ]);
    assert.equal(map["code:abc-9"].invoiceId, "inv-code");
    assert.equal(map["code:abc-9"].date, "2026-08-12");
  });
});
