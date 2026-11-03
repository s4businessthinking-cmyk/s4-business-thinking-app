import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PRINT_SETTINGS } from "./printSettings.js";

describe("print settings", () => {
  it("keeps customer-balance global and discount/round-off on each bill type", () => {
    assert.equal(DEFAULT_PRINT_SETTINGS.printCustomerBalance, false);
    assert.equal(DEFAULT_PRINT_SETTINGS.tax.printDiscount, true);
    assert.equal(DEFAULT_PRINT_SETTINGS.tax.printRoundOff, true);
    assert.equal(DEFAULT_PRINT_SETTINGS.retail.printDiscount, true);
    assert.equal(DEFAULT_PRINT_SETTINGS.retail.printRoundOff, true);
  });
});
