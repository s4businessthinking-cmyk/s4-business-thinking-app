import test from "node:test";
import assert from "node:assert/strict";
import { averageCosts } from "./averageCost.js";

const line = (qty, lineTotal, taxAmt) => ({ productId: "p1", qty, unit: "Pcs", unitFactor: 1, lineTotal, taxAmt });

test("average cost follows the purchases after discount and without VAT", () => {
  const product = { id: "p1", landingCost: "40", averageCost: "40" };
  // 10 x 40 = 400, Dis Amt 30, VAT 5% = 18.50 -> 388.50 per bill; net of VAT 370 -> 37 per piece
  const bills = [{ invoiceDate: "2026-10-14", items: [line(10, 388.5, 18.5)] }, { invoiceDate: "2026-10-14", items: [line(10, 388.5, 18.5)] }];
  assert.equal(averageCosts([product], bills).get("p1"), 37);
});

test("opening stock counts at its rate and different costs are weighted", () => {
  const product = { id: "p1", openingStock: "10", openingRate: "30", landingCost: "40" };
  const bills = [{ invoiceDate: "2026-10-14", items: [line(10, 500, 0)] }];
  assert.equal(averageCosts([product], bills).get("p1"), 40); // (10 x 30 + 500) / 20
});

test("without purchases the landing cost is kept", () => {
  assert.equal(averageCosts([{ id: "p1", landingCost: "40" }], []).get("p1"), 40);
});
