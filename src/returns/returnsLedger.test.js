import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { grnLabel, planPartyReturnSettlement, planSettleLeftoverReturnCredits, poGrnFieldsFromInvoice, returnsAsLedgerVouchers, returnedQtyByLine, validateReturnItems, vendorReturnCredit } from "./returnsDomain.js";

describe("returns ledger + qty", () => {
  it("shows refund-only credit notes without settling AR", () => {
    const rows = returnsAsLedgerVouchers([
      { id: "1", returnNo: "SR0001", returnDate: "2026-11-01", status: "confirmed", partyName: "A", invoiceId: "i1", invoiceNo: "SI1", appliedToInvoice: 0, refundAmount: 50, total: 50 },
    ], "sales");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].amount, 0);
    assert.equal(rows[0].allocations[0].amount, 0);
    assert.match(rows[0].typeLabel, /Refunded/);
  });

  it("caps returned qty by line index", () => {
    const map = returnedQtyByLine([
      { id: "r1", invoiceId: "i1", status: "confirmed", items: [{ lineIndex: 0, qty: 2 }, { lineIndex: 1, qty: 1 }] },
      { id: "r2", invoiceId: "i1", status: "cancelled", items: [{ lineIndex: 0, qty: 9 }] },
    ], "i1");
    assert.equal(map.get(0), 2);
    assert.equal(map.get(1), 1);
  });

  it("validateReturnItems blocks over-qty and copies PO/GRN fields", () => {
    const inv = { id: "i1", status: "confirmed", items: [{ qty: 5 }], purchaseOrderId: "po1", purchaseOrderNo: "PO-1", goodsReceiptId: "g1", goodsReceiptNo: "GRN-1" };
    assert.equal(validateReturnItems(inv, [{ lineIndex: 0, qty: 2 }], []), null);
    assert.equal(validateReturnItems(inv, [{ lineIndex: 0, qty: 6 }], []), "OVER_QTY");
    assert.equal(validateReturnItems(inv, [{ lineIndex: 0, qty: 2 }], [{ id: "r1", invoiceId: "i1", status: "confirmed", items: [{ lineIndex: 0, qty: 4 }] }]), "OVER_QTY");
    assert.deepEqual(poGrnFieldsFromInvoice(inv), {
      purchaseOrderId: "po1", purchaseOrderNo: "PO-1", goodsReceiptId: "g1", goodsReceiptNo: "GRN-1",
    });
    const multi = { ...inv, goodsReceiptIds: ["g1", "g2"], goodsReceiptNos: ["GRN-1", "GRN-2"] };
    assert.deepEqual(poGrnFieldsFromInvoice(multi).goodsReceiptNos, ["GRN-1", "GRN-2"]);
    assert.equal(grnLabel(multi), "GRN-1, GRN-2");
    assert.equal(grnLabel(inv), "GRN-1");
  });
});

describe("party return settlement → cheque/last balance", () => {
  it("applies leftover return credit to other open bills of the same vendor (oldest first)", () => {
    const source = { id: "paid1", vendorId: "v1", vendorName: "V", status: "paid", grandTotal: 100, amountPaid: 100, invoiceDate: "2026-01-01" };
    const openOld = { id: "open1", vendorId: "v1", vendorName: "V", status: "confirmed", grandTotal: 80, amountPaid: 0, invoiceDate: "2026-01-05" };
    const openNew = { id: "open2", vendorId: "v1", vendorName: "V", status: "confirmed", grandTotal: 50, amountPaid: 0, invoiceDate: "2026-02-01" };
    const other = { id: "x", vendorId: "v2", vendorName: "X", status: "confirmed", grandTotal: 99, amountPaid: 0, invoiceDate: "2026-01-01" };
    const plan = planPartyReturnSettlement({
      sourceInvoice: source,
      returnTotal: 100,
      invoices: [source, openOld, openNew, other],
      partyIdKey: "vendorId",
      partyNameKey: "vendorName",
    });
    assert.equal(plan.appliedToInvoice, 100);
    assert.equal(plan.refundAmount, 0);
    assert.deepEqual(plan.appliedAllocations.map((a) => [a.invoiceId, a.amount]), [["open1", 80], ["open2", 20]]);
  });

  it("leaves cash refund only after all same-party open dues are covered", () => {
    const source = { id: "s", vendorId: "v1", vendorName: "V", status: "partial", grandTotal: 40, amountPaid: 30, invoiceDate: "2026-01-01" };
    const open = { id: "o", vendorId: "v1", vendorName: "V", status: "confirmed", grandTotal: 20, amountPaid: 0, invoiceDate: "2026-01-02" };
    const plan = planPartyReturnSettlement({
      sourceInvoice: source,
      returnTotal: 50,
      invoices: [source, open],
      partyIdKey: "vendorId",
      partyNameKey: "vendorName",
    });
    assert.equal(plan.appliedToInvoice, 30); // 10 source due + 20 other
    assert.equal(plan.refundAmount, 20);
  });

  it("planSettleLeftoverReturnCredits moves old refundAmount onto open bills", () => {
    const invoices = [
      { id: "paid", vendorId: "v1", vendorName: "V", status: "paid", grandTotal: 100, amountPaid: 100, balanceDue: 0, invoiceDate: "2026-01-01" },
      { id: "due", vendorId: "v1", vendorName: "V", status: "confirmed", grandTotal: 60, amountPaid: 0, balanceDue: 60, invoiceDate: "2026-01-10" },
    ];
    const returns = [
      { id: "pr1", status: "confirmed", partyId: "v1", partyName: "V", invoiceId: "paid", invoiceNo: "PI1", appliedToInvoice: 0, refundAmount: 40, returnDate: "2026-01-15" },
    ];
    assert.equal(vendorReturnCredit(returns, "v1", "V"), 40);
    const plan = planSettleLeftoverReturnCredits({ returns, invoices, vendorId: "v1", vendorName: "V" });
    assert.equal(plan.invoicePatches.length, 1);
    assert.equal(plan.invoicePatches[0].id, "due");
    assert.equal(plan.invoicePatches[0].amountPaid, 40);
    assert.equal(plan.invoicePatches[0].balanceDue, 20);
    assert.equal(plan.returnPatches[0].refundAmount, 0);
    assert.equal(plan.returnPatches[0].appliedToInvoice, 40);
    assert.equal(plan.returnPatches[0].clearRefundVoucher, true);
  });
});
