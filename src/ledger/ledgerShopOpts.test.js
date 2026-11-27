import assert from "node:assert/strict";
import test from "node:test";
import { bankChoicesForShop, invoicePaymentBankField, ledgerOptsFromShop, shopBankAccountName } from "./ledgerShopOpts.js";

test("shopBankAccountName prefers shop.defaultBankAccount", () => {
  assert.equal(shopBankAccountName({ defaultBankAccount: "Emirates NBD" }), "Emirates NBD");
});

test("shopBankAccountName uses branch ledger bank for child company file", () => {
  const name = shopBankAccountName({ isBranchCompanyFile: true, branchCode: "B1", companyName: "Golden Branch" });
  assert.equal(name, "Bank - B1");
});

test("bankChoicesForShop prepends custom bank", () => {
  const list = bankChoicesForShop(["ADCB", "FAB"], { defaultBankAccount: "Bank - Branch 2" });
  assert.equal(list[0], "Bank - Branch 2");
  assert.ok(list.includes("ADCB"));
});

test("invoicePaymentBankField stamps branch bank on paid bank bills", () => {
  const f = invoicePaymentBankField("bank_transfer", { isBranchCompanyFile: true, branchCode: "S1" }, 100);
  assert.equal(f.paymentBank, "Bank - S1");
  assert.deepEqual(invoicePaymentBankField("cash", {}, 100), {});
});

test("invoicePaymentBankField respects user-selected bank", () => {
  const f = invoicePaymentBankField("card", { defaultBankAccount: "Bank - B1" }, 50, "Emirates NBD");
  assert.equal(f.paymentBank, "Emirates NBD");
});

test("ledgerOptsFromShop passes defaultBankAccount into ledger opts", () => {
  const opts = ledgerOptsFromShop(
    { branchTransferSettings: { enabled: true }, defaultBankAccount: "FAB" },
    [{ id: "b1", name: "Branch 1" }]
  );
  assert.equal(opts.defaultBankAccount, "FAB");
  assert.equal(opts.branchCashSplit, true);
  assert.equal(opts.branches.length, 1);
});