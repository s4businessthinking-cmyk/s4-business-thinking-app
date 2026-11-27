import assert from "node:assert/strict";
import test from "node:test";
import { mergeConsolidatedTrialBalance } from "./consolidatedTrialBalance.js";

test("mergeConsolidatedTrialBalance sums accounts by name", () => {
  const merged = mergeConsolidatedTrialBalance([
    {
      file: { label: "HQ" },
      tb: { accounts: [{ name: "Cash in Hand", group: "money", opening: 0, dr: 100, cr: 0, closing: 100 }] },
    },
    {
      file: { label: "B1" },
      tb: { accounts: [{ name: "Cash in Hand", group: "money", opening: 0, dr: 50, cr: 0, closing: 50 }] },
    },
  ]);
  const cash = merged.accounts.find((a) => a.name === "Cash in Hand");
  assert.equal(cash.closing, 150);
  assert.equal(cash.dr, 150);
});