import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildCustomerFromVendor, buildVendorFromCustomer, findLinkedOther, resolveOtherParty, samePartyHint } from "./bothSidesParty.js";

describe("bothSidesParty", () => {
  it("copies shared profile fields both ways and keeps side-only names", () => {
    const vendor = buildVendorFromCustomer({
      customerName: "RAHIM STORES", customerType: "Wholesale", assignedSalesman: "Ali",
      mobileNumber: "050111", city: "Dubai", paymentType: "credit", openingBalance: 90,
    });
    assert.equal(vendor.vendorName, "RAHIM STORES");
    assert.equal(vendor.mobileNumber, "050111");
    assert.equal(vendor.city, "Dubai");
    assert.equal(vendor.paymentType, "credit");
    assert.equal(vendor.openingBalance, undefined);
    assert.equal(vendor.assignedSalesman, undefined);

    const customer = buildCustomerFromVendor({ vendorName: "RAHIM STORES", category: "Parts", mobileNumber: "050111" });
    assert.equal(customer.customerName, "RAHIM STORES");
    assert.equal(customer.customerType, undefined);
    assert.equal(customer.mobileNumber, "050111");
    assert.equal(customer.category, undefined);
  });

  it("matches the same person by name and mobile, and skips a party already linked elsewhere", () => {
    assert.equal(samePartyHint("Rahim Stores", "050-111", "RAHIM STORES", "050111"), true);
    assert.equal(samePartyHint("Rahim", "050111", "Karim", "050111"), false);
    const list = [
      { id: "v1", vendorName: "RAHIM STORES", mobileNumber: "050111", linkedCustomerId: "other" },
      { id: "v2", vendorName: "RAHIM STORES", mobileNumber: "050111" },
    ];
    assert.equal(findLinkedOther(list, { sourceId: "c1", name: "Rahim Stores", mobile: "050111", nameKey: "vendorName", linkKey: "linkedCustomerId" })?.id, "v2");
    assert.equal(findLinkedOther(list, { sourceId: "c1", linkedId: "v1", name: "x", mobile: "1", nameKey: "vendorName", linkKey: "linkedCustomerId" })?.id, "v1");
    assert.equal(resolveOtherParty({ wantBoth: false, sourceId: "c1", name: "Rahim Stores", mobile: "050111", list, nameKey: "vendorName", linkKey: "linkedCustomerId" }), null);
    assert.equal(resolveOtherParty({ wantBoth: true, sourceId: "c1", name: "Rahim Stores", mobile: "050111", list, nameKey: "vendorName", linkKey: "linkedCustomerId" })?.id, "v2");
  });
});
