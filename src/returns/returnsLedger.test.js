import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { grnLabel, poGrnFieldsFromInvoice, returnsAsLedgerVouchers, returnedQtyByLine, validateReturnItems } from "./returnsDomain.js";

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
