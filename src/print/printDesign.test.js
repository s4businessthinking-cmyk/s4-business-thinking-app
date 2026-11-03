import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyDesign, generateStatementHTML } from "./printDesign.js";

const styleBase = {
  template: "pro",
  accent: "",
  fontScale: 100,
  logo: "",
  logoSize: 56,
  logoAlign: "left",
  logoX: 0,
  logoY: 0,
  headerNote: "",
  footerText: "TERMS & CONDITIONS\n1. Pay within 7 days",
  showSignatures: true,
};

const shell = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>t</title>
<style>.x{}</style></head><body>
<div class="invoice"><div class="hdr"><div class="shop-block"><div class="shop-name">Acme Shop</div></div></div>
<div class="footer">stamp</div></div></body></html>`;

describe("printDesign applyDesign footer + logo clearance", () => {
  it("applies footerText terms only on invoice kind", () => {
    const inv = applyDesign(shell, "invoice", styleBase);
    assert.match(inv, /class="footer s4-terms"/);
    assert.match(inv, /TERMS &amp; CONDITIONS/);

    const statement = applyDesign(shell, "statement", styleBase);
    assert.doesNotMatch(statement, /s4-terms/);
    assert.doesNotMatch(statement, /TERMS/);
    assert.match(statement, />stamp</);

    const voucher = applyDesign(shell, "voucher", styleBase);
    assert.doesNotMatch(voucher, /s4-terms/);
    assert.doesNotMatch(voucher, /TERMS/);
    assert.match(voucher, />stamp</);
  });

  it("reserves shop-name space for wide left logo and does not clip statement invoice", () => {
    const withLogo = { ...styleBase, logo: "data:image/png;base64,xx", logoSize: 56, logoAlign: "left" };
    const html = generateStatementHTML({
      shopName: "Acme Shop",
      title: "DEBIT NOTE",
      cols: [{ label: "Item" }],
      rows: [["A"]],
    }, withLogo);
    assert.match(html, /overflow:visible/);
    assert.match(html, /padding-left:171px/);
    assert.match(html, /s4-logo-wrap/);
    assert.doesNotMatch(html, /s4-terms/);
  });
});
