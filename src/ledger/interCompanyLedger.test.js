import assert from "node:assert/strict";
import test from "node:test";
import { buildGlobalLedger } from "./globalLedger.js";

test("interCompanyIn purchase credits Due to HQ not vendor", () => {
  const inv = {
    id: "pi-ic-1",
    shopId: "child",
    status: "confirmed",
    invoiceNo: "PI-IC-1",
    invoiceDate: "2026-11-27",
    grandTotal: 120,
    totalTax: 0,
    amountPaid: 0,
    interCompanyIn: true,
    items: [{ qty: 3, unitCost: 40 }],
  };
  const ledger = buildGlobalLedger({ purchaseInvoices: [inv] }, { shopId: "child" });
  const due = [...ledger.accounts.values()].find((a) => a.name === "Due to HQ");
  assert.ok(due);
  const dueBal = ledger.postings.filter((p) => p.key === due.key).reduce((t, p) => t + p.dr - p.cr, 0);
  assert.equal(dueBal, -120);
});