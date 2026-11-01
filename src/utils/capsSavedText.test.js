import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { capsSavedText, repairSystemEnums } from "./capsSavedText.js";

describe("capsSavedText", () => {
  it("uppercases typed names, codes, addresses and notes", () => {
    const out = capsSavedText({
      customerName: "rahim stores",
      customerCode: "c-12",
      city: "dubai",
      note: "call after 5",
      items: [{ name: "oil filter", code: "of-22", brand: "bosch" }],
    });
    assert.equal(out.customerName, "RAHIM STORES");
    assert.equal(out.customerCode, "C-12");
    assert.equal(out.city, "DUBAI");
    assert.equal(out.note, "CALL AFTER 5");
    assert.equal(out.items[0].name, "OIL FILTER");
    assert.equal(out.items[0].code, "OF-22");
    assert.equal(out.items[0].brand, "BOSCH");
  });

  it("leaves bangla as-is and only flips latin letters", () => {
    assert.equal(capsSavedText("রহিম store"), "রহিম STORE");
  });

  it("does not touch status, payment, ids, login or emails", () => {
    const out = capsSavedText({
      status: "confirmed",
      method: "cheque",
      paymentMethod: "cash",
      invoiceType: "tax",
      role: "owner",
      theme: "light",
      lang: "en",
      email: "Owner@Shop.com",
      username: "rahim",
      password: "Abcd1234",
      shopId: "shop1",
      customerId: "cust-ab",
      createdBy: "uidLower",
      createdByName: "abdul karim",
    });
    assert.equal(out.status, "confirmed");
    assert.equal(out.method, "cheque");
    assert.equal(out.paymentMethod, "cash");
    assert.equal(out.invoiceType, "tax");
    assert.equal(out.role, "owner");
    assert.equal(out.theme, "light");
    assert.equal(out.lang, "en");
    assert.equal(out.email, "Owner@Shop.com");
    assert.equal(out.username, "rahim");
    assert.equal(out.password, "Abcd1234");
    assert.equal(out.shopId, "shop1");
    assert.equal(out.customerId, "cust-ab");
    assert.equal(out.createdBy, "uidLower");
    assert.equal(out.createdByName, "ABDUL KARIM");
  });

  it("keeps system choice fields lowercase and repairs ones saved in capitals", () => {
    const out = capsSavedText({
      expenseDate: "2026-11-01", category: "salary", method: "cheque", repeat: "daily",
      partyType: "vendor", payMethod: "cash", stockLocation: "main", note: "paid",
    });
    assert.equal(out.category, "salary");
    assert.equal(out.method, "cheque");
    assert.equal(out.repeat, "daily");
    assert.equal(out.partyType, "vendor");
    assert.equal(out.payMethod, "cash");
    assert.equal(out.stockLocation, "main");
    assert.equal(out.note, "PAID");
    assert.equal(capsSavedText({ category: "phone", name: "case" }).category, "PHONE");
    const fixed = repairSystemEnums({
      expenseDate: "2026-11-01", category: "SALARY", method: "CASH", vendorName: "AL NOOR",
      items: [{ mode: "COUNT", name: "OIL" }],
    });
    assert.equal(fixed.category, "salary");
    assert.equal(fixed.method, "cash");
    assert.equal(fixed.vendorName, "AL NOOR");
    assert.equal(fixed.items[0].mode, "count");
    assert.equal(fixed.items[0].name, "OIL");
    assert.equal(repairSystemEnums({ category: "PHONE" }).category, "PHONE");
    const same = { method: "cash" };
    assert.equal(repairSystemEnums(same), same);
  });

  it("does not rewrite photos, urls, dates or permission objects", () => {
    const photo = "data:image/png;base64,aaaBBB";
    const perms = { manageSales: true };
    const design = { style: { invoice: { footerText: "thanks" } } };
    const out = capsSavedText({
      photo,
      website: "https://Shop.example",
      invoiceDate: "2026-11-01",
      createdAt: "2026-11-01T10:00:00.000Z",
      permissions: perms,
      printDesign: design,
    });
    assert.equal(out.photo, photo);
    assert.equal(out.website, "https://Shop.example");
    assert.equal(out.invoiceDate, "2026-11-01");
    assert.equal(out.createdAt, "2026-11-01T10:00:00.000Z");
    assert.equal(out.permissions, perms);
    assert.equal(out.printDesign, design);
  });
});
