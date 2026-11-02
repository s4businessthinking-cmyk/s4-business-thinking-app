import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stockBadgeParts } from "./stockBadgeParts.js";

describe("stock badge", () => {
  it("is green when remaining stock is above reorder", () => {
    assert.deepEqual(stockBadgeParts(10, 2, 3), { left: 8, color: "#22c55e", over: false });
  });

  it("is amber at or below reorder, red when the bill qty exceeds stock", () => {
    assert.deepEqual(stockBadgeParts(5, 0, 5), { left: 5, color: "#f59e0b", over: false });
    assert.deepEqual(stockBadgeParts(4, 6, 2), { left: -2, color: "#ef4444", over: true });
  });
});
