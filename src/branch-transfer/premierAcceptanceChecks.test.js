import assert from "node:assert/strict";
import test from "node:test";
import { buildHqInterCompanyJournal, interCompanyReceiptValue } from "./interCompanyGl.js";
import { buildChildCompanyReceiptInvoice } from "./interCompanyReceiptInvoice.js";
import {
  verifyBranchBillIsolation,
  verifyBranchBankLedger,
  verifyConsolidatedElimination,
  verifyDueFromToMatch,
  scopeShopDocs,
} from "./premierAcceptanceChecks.js";
import { shopBankAccountName } from "../ledger/ledgerShopOpts.js";

test("branch isolation: child lists exclude HQ shopId bills", () => {
  const home = "hq-1";
  const child = "child-1";
  const data = {
    salesInvoices: [
      { id: "s1", shopId: home, status: "paid", grandTotal: 10 },
      { id: "s2", shopId: child, status: "paid", grandTotal: 5 },
    ],
    purchaseInvoices: [],
  };
  const r = verifyBranchBillIsolation(home, [{ kind: "branch", shopId: child }], data);
  assert.equal(r.ok, true);
  assert.equal(r.crossShop, 0);
});

test("due from / due to match after inter-company receive", () => {
  const receipt = {
    id: "r1",
    sequence: 1,
    receivedAt: "2026-11-27T10:00:00.000Z",
    lines: [{ productId: "p1", acceptedQty: 1, unitCost: 100 }],
  };
  const transfer = { transferNo: "BT-9", branchName: "Branch 1", shopId: "hq-1" };
  const journal = buildHqInterCompanyJournal({ transfer, receipt, branchName: "Branch 1", actor: {} });
  const childPi = buildChildCompanyReceiptInvoice({ transfer, receipt, childShopId: "child-1", actor: {} });
  childPi.invoiceDate = "2026-11-27";
  childPi.status = "paid";
  const data = {
    salesInvoices: [],
    purchaseInvoices: [childPi],
    accountVouchers: [journal],
    receipts: [],
    payments: [],
    expenses: [],
    salesReturns: [],
    purchaseReturns: [],
    partnerEntries: [],
    bankEntries: [],
    stockAdjustments: [],
  };
  const shopById = {
    "hq-1": {},
    "child-1": { isBranchCompanyFile: true, branchCode: "B1" },
  };
  const due = verifyDueFromToMatch({
    homeShopId: "hq-1",
    branchFiles: [{ kind: "branch", shopId: "child-1", label: "Branch 1" }],
    data,
    customers: [],
    vendors: [],
    shopById,
    asOf: "2026-11-27",
  });
  assert.equal(due.ok, true);
  assert.equal(due.pairs[0].from, interCompanyReceiptValue(receipt));
});

test("branch bank bills need paymentBank or shop default", () => {
  const child = "child-1";
  const shop = { isBranchCompanyFile: true, branchCode: "S1" };
  const data = {
    salesInvoices: [{
      id: "x",
      shopId: child,
      status: "paid",
      paymentMethod: "bank_transfer",
      amountPaid: 50,
      paymentBank: shopBankAccountName(shop),
    }],
    purchaseInvoices: [],
  };
  const r = verifyBranchBankLedger([{ kind: "branch", shopId: child }], data, { [child]: shop });
  assert.equal(r.ok, true);
});

test("consolidated elimination when IC purchase exists", () => {
  const receipt = {
    id: "r1",
    sequence: 1,
    lines: [{ productId: "p", acceptedQty: 1, unitCost: 80 }],
  };
  const transfer = { transferNo: "BT-2", branchName: "Branch 1", shopId: "hq" };
  const journal = buildHqInterCompanyJournal({ transfer, receipt, branchName: "Branch 1", actor: {} });
  const childPi = buildChildCompanyReceiptInvoice({ transfer, receipt, childShopId: "c1", actor: {} });
  childPi.invoiceDate = "2026-11-20";
  childPi.status = "paid";
  const data = {
    salesInvoices: [],
    purchaseInvoices: [childPi],
    accountVouchers: [journal],
    receipts: [],
    payments: [],
    expenses: [],
    salesReturns: [],
    purchaseReturns: [],
    partnerEntries: [],
    bankEntries: [],
    stockAdjustments: [],
  };
  const files = [
    { shopId: "hq", kind: "hq" },
    { shopId: "c1", kind: "branch" },
  ];
  const scoped = scopeShopDocs(data, "c1");
  const r = verifyConsolidatedElimination({
    files,
    data,
    customers: [],
    vendors: [],
    shopById: { hq: {}, c1: { isBranchCompanyFile: true, branchCode: "B1" } },
    asOf: "2026-11-27",
  });
  assert.equal(r.skipped, false);
  assert.ok(r.elimination >= 79);
});