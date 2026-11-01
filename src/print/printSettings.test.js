import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { invoiceBlankRows, paperHeightMm } from "./printSettings.js";

describe("invoiceBlankRows", () => {
  it("pads a short A4 bill to 16 item lines", () => {
    const html = invoiceBlankRows(2, paperHeightMm("A4"), 6);
    assert.equal((html.match(/<tr class="blank">/g) || []).length, 14);
    assert.ok(html.includes("<td>&nbsp;</td>".repeat(6)));
  });

  it("adds no blanks when the table is already full", () => {
    assert.equal(invoiceBlankRows(20, paperHeightMm("A4"), 6), "");
  });

  it("skips thermal / unknown page height", () => {
    assert.equal(invoiceBlankRows(1, null, 6), "");
  });
});
