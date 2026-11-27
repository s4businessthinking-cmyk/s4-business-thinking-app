import assert from "node:assert/strict";
import test from "node:test";
import { buildHqInterCompanyJournal, interCompanyReceiptValue } from "./interCompanyGl.js";
import { buildChildCompanyReceiptInvoice } from "./interCompanyReceiptInvoice.js";
import { buildGlobalLedger } from "../ledger/globalLedger.js";
import {
  applyEliminationToPlTotals,
  measureInterCompanyPlElimination,
} from "./consolidatedElimination.js";
import { invoicePaymentBankField } from "../ledger/ledgerShopOpts.js";

test("Premier smoke: receive IC ledgers and group P&L elimination", () => {
  const receipt = {
    id: "rcp-1",
    sequence: 1,
    receivedAt: "2026-11-27T12:00:00.000Z",
    lines: [{ productId: "p1", acceptedQty: 2, unitCost: 40 }],
  };
  const amount = interCompanyReceiptValue(receipt);
  const transfer = { id: "bt-1", transferNo: "BT-1", branchName: "Branch 1", shopId: "hq" };
  const journal = buildHqInterCompanyJournal({ transfer, receipt, branchName: "Branch 1", actor: { personName: "HQ" } });
  const childPi = buildChildCompanyReceiptInvoice({ transfer, receipt, childShopId: "child", actor: { personName: "B" } });
  childPi.invoiceDate = "2026-11-27";
  childPi.status = "paid";
  const hqLedger = buildGlobalLedger({ accountVouchers: [journal] }, { shopId: "hq" });
  const childLedger = buildGlobalLedger({ purchaseInvoices: [childPi] }, { shopId: "child", defaultBankAccount: "Bank - Branch 1" });
  assert.ok(hqLedger.postings.length > 0);
  assert.ok(childLedger.postings.length > 0);

  const plElim = measureInterCompanyPlElimination(
    [{ scoped: { purchaseInvoices: [childPi], accountVouchers: [journal] }, shopId: "child" }],
    "2026-11-01",
    "2026-11-30"
  );
  assert.equal(plElim, amount);

  const totals = applyEliminationToPlTotals({ grossProfit: 100, netProfit: 40, expenseTotal: 60 }, plElim);
  assert.equal(totals.netProfit, 40 + amount);
});

test("Premier smoke: SI bank picker stamp", () => {
  const f = invoicePaymentBankField("bank", { defaultBankAccount: "FAB" }, 99, "ADCB");
  assert.equal(f.paymentBank, "ADCB");
});