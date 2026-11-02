import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clampFontScale, invoiceScaleCss } from "./printDesign.js";

describe("invoice text-size scale", () => {
  it("leaves 100% unzoomed so the sheet can fill one page", () => {
    assert.equal(clampFontScale(100), 100);
    assert.equal(invoiceScaleCss(100), "");
  });

  it("does not force a full-page sheet at 100% (thermal and short bills keep their own height)", () => {
    assert.doesNotMatch(invoiceScaleCss(100), /min-height/);
  });

  it("zooms type but stretches the sheet back to one full page", () => {
    const css90 = invoiceScaleCss(90);
    assert.match(css90, /zoom:0\.9/);
    assert.match(css90, /min-height:calc\(100% \/ 0\.9\)/);
    const css95 = invoiceScaleCss(95);
    assert.match(css95, /zoom:0\.95/);
    assert.match(css95, /min-height:calc\(100% \/ 0\.95\)/);
  });
});
