import test from "node:test";
import assert from "node:assert/strict";
import { convertCurrency, evaluate, tryEvaluate } from "./calc.js";

test("arithmetic, precedence and brackets", () => {
  assert.equal(evaluate("2+3*4"), 14);
  assert.equal(evaluate("(2+3)×4"), 20);
  assert.equal(evaluate("10÷4"), 2.5);
  assert.equal(evaluate("-5+2"), -3);
  assert.equal(evaluate("1,250.50 + 0.1 + 0.2"), 1250.8);
  assert.equal(evaluate(""), 0);
});

test("desk-calculator percent", () => {
  assert.equal(evaluate("200+10%"), 220);
  assert.equal(evaluate("200-5%"), 190);
  assert.equal(evaluate("200*10%"), 20);
  assert.equal(evaluate("50%"), 0.5);
});

test("bad input never throws out of tryEvaluate", () => {
  assert.equal(tryEvaluate("2+").ok, false);
  assert.equal(tryEvaluate("alert(1)").ok, false);
  assert.equal(tryEvaluate("5/0").ok, false);
  assert.equal(tryEvaluate("1..2").ok, false);
});

test("currency conversion through a base rate", () => {
  assert.equal(convertCurrency(100, 1, 33.2), 3.012048);
  assert.equal(convertCurrency(10, 3.67, 1), 36.7);
  assert.equal(convertCurrency(10, 0, 1), null);
});
