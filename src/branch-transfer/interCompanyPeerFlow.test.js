import assert from "node:assert/strict";
import test from "node:test";
import { buildSenderInterCompanyJournal, interCompanyReceiptValue } from "./interCompanyGl.js";
import { buildChildCompanyReceiptInvoice } from "./interCompanyReceiptInvoice.js";
import { buildGlobalLedger } from "../ledger/globalLedger.js";

const bal = (ledger, name) => {
  const acct = [...ledger.accounts.values()].find((a) => a.name === name);
  assert.ok(acct, `missing account ${name}`);
  return ledger.postings.filter((p) => p.key === acct.key).reduce((t, p) => t + p.dr - p.cr, 0);
};

test("peer inter-company: sender Due from dest, receiver Due to source branch", () => {
  const transfer = {
    id: "bt-peer",
    shopId: "hq-shop",
    transferKind: "peer",
    sourceBranchId: "b-src",
    sourceBranchName: "Branch B",
    sourceLedgerShopId: "shop-b",
    branchName: "Branch A",
    transferNo: "BT-PEER-1",
    items: [{ productId: "p1", name: "Item", quantity: 3, unitCost: 10 }],
  };
  const receipt = {
    id: "rcp-peer",
    sequence: 1,
    receivedAt: "2026-11-27T16:00:00.000Z",
    lines: [{ productId: "p1", name: "Item", acceptedQty: 3, unitCost: 10 }],
  };
  const amount = interCompanyReceiptValue(receipt);
  assert.equal(amount, 30);

  const senderJv = buildSenderInterCompanyJournal({
    transfer,
    receipt,
    destinationBranchName: "Branch A",
    actor: {},
  });
  assert.equal(senderJv.shopId, "shop-b");

  const childPi = buildChildCompanyReceiptInvoice({
    transfer,
    receipt,
    childShopId: "shop-a",
    actor: {},
  });
  assert.equal(childPi.interCompanyDueAccount, "Due to Branch B");
  assert.equal(childPi.vendorName, "Branch B");

  const senderLedger = buildGlobalLedger({ accountVouchers: [senderJv] }, { shopId: "shop-b" });
  const childLedger = buildGlobalLedger({ purchaseInvoices: [childPi] }, { shopId: "shop-a" });

  assert.equal(bal(senderLedger, "Due from Branch A"), amount);
  assert.equal(bal(childLedger, "Due to Branch B"), -amount);
});