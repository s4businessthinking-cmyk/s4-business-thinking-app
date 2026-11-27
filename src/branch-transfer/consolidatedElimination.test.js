import assert from "node:assert/strict";
import test from "node:test";
import {
  applyEliminationToGroupTotals,
  applyEliminationToPlTotals,
  eliminateInterCompanyTrialBalance,
} from "./consolidatedElimination.js";
import { mergeConsolidatedTrialBalance } from "./consolidatedTrialBalance.js";

test("eliminateInterCompanyTrialBalance nets Due from and Due to HQ", () => {
  const merged = mergeConsolidatedTrialBalance([
    {
      file: { label: "HQ" },
      tb: {
        accounts: [
          { key: "d1", name: "Due from Branch 1", group: "asset", opening: 0, dr: 500, cr: 0, closing: 500 },
          { key: "c1", name: "Cash in Hand", group: "money", opening: 0, dr: 100, cr: 0, closing: 100 },
        ],
      },
    },
    {
      file: { label: "B1" },
      tb: {
        accounts: [
          { key: "d2", name: "Due to HQ", group: "liability", opening: 0, dr: 0, cr: 500, closing: -500 },
        ],
      },
    },
  ]);
  const out = eliminateInterCompanyTrialBalance(merged);
  const dueFrom = out.accounts.find((a) => /^due from /i.test(a.name));
  const dueTo = out.accounts.find((a) => a.name === "Due to HQ");
  assert.ok(!dueFrom || Math.abs(dueFrom.closing) < 0.01);
  assert.ok(!dueTo || Math.abs(dueTo.closing) < 0.01);
  assert.equal(out.elimination, 500);
});

test("applyEliminationToGroupTotals reduces assets and liabilities", () => {
  const next = applyEliminationToGroupTotals(
    { totalAssets: 10000, totalLiabilities: 6000, totalEquity: 4000 },
    500
  );
  assert.equal(next.totalAssets, 9500);
  assert.equal(next.totalLiabilities, 5500);
  assert.equal(next.elimination, 500);
});

test("applyEliminationToPlTotals adds back inter-company purchase double-count", () => {
  const next = applyEliminationToPlTotals({ grossProfit: 1000, netProfit: 400, expenseTotal: 600 }, 80);
  assert.equal(next.grossProfit, 1080);
  assert.equal(next.netProfit, 480);
  assert.equal(next.interCompanyPlElimination, 80);
});