import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SI_PAY, siIsSettledPay, siSettledPayLabel } from "./siPay.js";

describe("siIsSettledPay", () => {
  it("treats cash, bank transfer and card as paid, credit as due", () => {
    assert.equal(siIsSettledPay("cash"), true);
    assert.equal(siIsSettledPay("bank"), true);
    assert.equal(siIsSettledPay("card"), true);
    assert.equal(siIsSettledPay("credit"), false);
    assert.equal(siIsSettledPay("cheque"), false);
  });

  it("keeps partial cash on the credit side", () => {
    assert.equal(siIsSettledPay("cash", true), false);
    assert.equal(siIsSettledPay("bank", true), true);
    assert.equal(siIsSettledPay("card", true), true);
  });

  it("exposes a card option and labels settled methods", () => {
    assert.ok(SI_PAY.card);
    assert.equal(SI_PAY.card.en, "Card");
    assert.match(siSettledPayLabel("bank", "en"), /Bank Transfer/);
    assert.match(siSettledPayLabel("card", "bn"), /কার্ড/);
  });
});
