import assert from "node:assert/strict";
import test from "node:test";
import { buildHqInterCompanyJournal, interCompanyReceiptValue } from "./interCompanyGl.js";
import { buildGlobalLedger } from "../ledger/globalLedger.js";

test("interCompanyReceiptValue sums accepted lines", () => {
  const v = interCompanyReceiptValue({
    lines: [
      { acceptedQty: 2, unitCost: 15 },
      { acceptedQty: 1, unitCost: 10 },
    ],
  });
  assert.equal(v, 40);
});

test("buildHqInterCompanyJournal balances Dr Due from / Cr Purchase", () => {
  const receipt = {
    id: "rcp-x",
    sequence: 1,
    receivedAt: "2026-11-27T12:00:00.000Z",
    lines: [{ acceptedQty: 4, unitCost: 25 }],
  };
  const journal = buildHqInterCompanyJournal({
    transfer: { shopId: "hq", transferNo: "BT-77", branchName: "Branch 1" },
    receipt,
    branchName: "Branch 1",
    actor: { personName: "Owner" },
  });
  assert.ok(journal);
  const ledger = buildGlobalLedger(
    { accountVouchers: [journal] },
    { shopId: "hq" }
  );
  const purchase = [...ledger.accounts.values()].find((a) => a.name === "Purchase");
  const due = [...ledger.accounts.values()].find((a) => a.name === "Due from Branch 1");
  assert.ok(purchase);
  assert.ok(due);
  const bal = (key) => ledger.postings.filter((p) => p.key === key).reduce((t, p) => t + p.dr - p.cr, 0);
  assert.equal(bal(purchase.key), -100);
  assert.equal(bal(due.key), 100);
});