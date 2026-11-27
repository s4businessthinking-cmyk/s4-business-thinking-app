import assert from "node:assert/strict";
import test from "node:test";
import { buildHqInterCompanyJournal, interCompanyReceiptValue } from "./interCompanyGl.js";
import { buildChildCompanyReceiptInvoice } from "./interCompanyReceiptInvoice.js";
import { buildGlobalLedger } from "../ledger/globalLedger.js";
import { DUE_TO_HQ } from "./interCompanyAccounts.js";

const bal = (ledger, name) => {
  const acct = [...ledger.accounts.values()].find((a) => a.name === name);
  assert.ok(acct, `missing account ${name}`);
  return ledger.postings.filter((p) => p.key === acct.key).reduce((t, p) => t + p.dr - p.cr, 0);
};

test("inter-company receive: HQ Due from and child Due to HQ match receipt value", () => {
  const transfer = {
    id: "bt-1",
    shopId: "hq-shop",
    transferNo: "BT-900",
    branchName: "Branch 1",
    items: [{ productId: "p1", name: "Filter", quantity: 2, unitCost: 50 }],
  };
  const receipt = {
    id: "rcp-1",
    sequence: 1,
    receivedAt: "2026-11-27T15:00:00.000Z",
    lines: [{ productId: "p1", name: "Filter", acceptedQty: 2, unitCost: 50 }],
  };
  const amount = interCompanyReceiptValue(receipt);
  assert.equal(amount, 100);

  const journal = buildHqInterCompanyJournal({
    transfer,
    receipt,
    branchName: transfer.branchName,
    actor: { personName: "HQ" },
  });
  assert.ok(journal);

  const childPi = buildChildCompanyReceiptInvoice({
    transfer,
    receipt,
    childShopId: "child-shop",
    actor: { personName: "Branch" },
  });
  assert.equal(childPi.shopId, "child-shop");
  assert.equal(childPi.interCompanyIn, true);
  assert.equal(childPi.grandTotal, amount);

  const hqLedger = buildGlobalLedger({ accountVouchers: [journal] }, { shopId: transfer.shopId });
  const childLedger = buildGlobalLedger({ purchaseInvoices: [childPi] }, { shopId: "child-shop" });

  assert.equal(bal(hqLedger, "Due from Branch 1"), amount);
  assert.equal(bal(hqLedger, "Purchase"), -amount);
  assert.equal(bal(childLedger, DUE_TO_HQ), -amount);
});