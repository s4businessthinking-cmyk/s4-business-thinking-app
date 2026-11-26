import test from "node:test";
import assert from "node:assert/strict";
import {
  BRANCH_TRANSFER_STATUSES,
  buildInternalPurchaseInvoice,
  buildReceiptLines,
  deriveTransferStatus,
  isBranchTransferBill,
  remainingQuantityForLine,
  validateTransferItems,
} from "./branchTransferDomain.js";

const transfer = {
  id: "transfer-1",
  shopId: "shop-1",
  transferNo: "BT-20260720-ABC123",
  branchId: "branch-1",
  branchName: "Dubai Branch",
  status: BRANCH_TRANSFER_STATUSES.DISPATCHED,
  items: [
    {
      lineId: "line-1",
      productId: "product-1",
      name: "Brake Pad",
      code: "BP-1",
      unit: "Pcs",
      quantity: 10,
      unitCost: 12.5,
    },
  ],
  receipts: [],
};

test("validates transfer items", () => {
  const items = validateTransferItems(transfer.items);
  assert.equal(items.length, 1);
  assert.equal(items[0].lineTotal, 125);
});

test("builds full receipt and received status", () => {
  const lines = buildReceiptLines(transfer, [
    { lineId: "line-1", receivedQty: 10, damagedQty: 0, issueNote: "" },
  ]);
  assert.equal(lines[0].acceptedQty, 10);
  assert.equal(lines[0].remainingQtyAfter, 0);
  assert.equal(deriveTransferStatus(transfer, lines), BRANCH_TRANSFER_STATUSES.RECEIVED);
});

test("builds partial receipt status", () => {
  const lines = buildReceiptLines(transfer, [
    { lineId: "line-1", receivedQty: 4, damagedQty: 0, issueNote: "" },
  ]);
  assert.equal(lines[0].acceptedQty, 4);
  assert.equal(deriveTransferStatus(transfer, lines), BRANCH_TRANSFER_STATUSES.PARTIALLY_RECEIVED);
});

test("damaged receipt creates discrepancy", () => {
  const lines = buildReceiptLines(transfer, [
    { lineId: "line-1", receivedQty: 10, damagedQty: 2, issueNote: "Two damaged" },
  ]);
  assert.equal(lines[0].acceptedQty, 8);
  assert.equal(deriveTransferStatus(transfer, lines), BRANCH_TRANSFER_STATUSES.DISCREPANCY);
});

test("prevents receiving more than remaining", () => {
  const partiallyReceived = {
    ...transfer,
    receipts: [
      {
        id: "r1",
        lines: [{ lineId: "line-1", acceptedQty: 8 }],
      },
    ],
  };
  assert.equal(remainingQuantityForLine(partiallyReceived, transfer.items[0]), 2);
  assert.throws(
    () =>
      buildReceiptLines(partiallyReceived, [
        { lineId: "line-1", receivedQty: 3, damagedQty: 0, issueNote: "" },
      ]),
    /RECEIPT_EXCEEDS_REMAINING/
  );
});

test("creates zero-due internal purchase invoice from accepted quantity", () => {
  const receipt = {
    id: "transfer-1-R001",
    sequence: 1,
    receivedAt: "2026-07-20T12:00:00.000Z",
    lines: [
      {
        ...transfer.items[0],
        acceptedQty: 8,
        damagedQty: 2,
      },
    ],
  };
  const invoice = buildInternalPurchaseInvoice({
    transfer,
    receipt,
    shop: { companyName: "S4 Main Shop" },
    actor: { uid: "user-1", personName: "Receiver" },
    invoiceId: "branch-transfer-pi-transfer-1-R001",
    createdAt: receipt.receivedAt,
  });

  assert.equal(invoice.grandTotal, 100);
  assert.equal(invoice.paymentMethod, "cash");
  assert.equal(invoice.amountPaid, 100);
  assert.equal(invoice.balanceDue, 0);
  assert.equal(invoice.status, "paid");
  assert.equal(invoice.internalTransfer, true);
  assert.equal(invoice.branchTransferId, "transfer-1");
});

test("creates credit internal purchase invoice when selected", () => {
  const receipt = {
    id: "transfer-1-R001",
    sequence: 1,
    receivedAt: "2026-07-20T12:00:00.000Z",
    lines: [
      {
        ...transfer.items[0],
        acceptedQty: 8,
        damagedQty: 2,
      },
    ],
  };
  const invoice = buildInternalPurchaseInvoice({
    transfer,
    receipt,
    shop: { companyName: "S4 Main Shop" },
    actor: { uid: "user-1", personName: "Receiver" },
    invoiceId: "branch-transfer-pi-transfer-1-R001",
    paymentMethod: "credit",
    createdAt: receipt.receivedAt,
  });

  assert.equal(invoice.grandTotal, 100);
  assert.equal(invoice.paymentMethod, "credit");
  assert.equal(invoice.amountPaid, 0);
  assert.equal(invoice.balanceDue, 100);
  assert.equal(invoice.status, "confirmed");
});

test("receipt bill is recognised as a branch transfer bill, a direct purchase is not", () => {
  const receipt = buildReceiptLines(transfer, [{ lineId: transfer.items[0].lineId, receivedQty: 1 }]);
  const bill = buildInternalPurchaseInvoice({ transfer, receipt: { id: "r1", sequence: 1, lines: receipt }, invoiceId: "pi-1" });
  assert.equal(isBranchTransferBill(bill), true);
  assert.equal(isBranchTransferBill({ id: "pi-2", invoiceNo: "PI-0002", grandTotal: 100 }), false);
  assert.equal(isBranchTransferBill(null), false);
});

test("cancel after a partial receipt returns only what never arrived; a closed transfer has nothing left to return", () => {
  const firstReceipt = buildReceiptLines(transfer, [{ lineId: "line-1", receivedQty: 7, damagedQty: 1, issueNote: "One cracked" }]);
  const partial = { ...transfer, status: BRANCH_TRANSFER_STATUSES.PARTIALLY_RECEIVED, receipts: [{ id: "rc-1", lines: firstReceipt }] };
  assert.equal(deriveTransferStatus(transfer, firstReceipt), BRANCH_TRANSFER_STATUSES.DISCREPANCY);
  // the dispatch cancel movement (branchTransferService reverseDispatchMovements) puts back remainingQuantityForLine
  assert.equal(remainingQuantityForLine(partial, partial.items[0]), 3);
  const all = buildReceiptLines(partial, [{ lineId: "line-1", receivedQty: 3, damagedQty: 0 }]);
  const full = { ...partial, receipts: [...partial.receipts, { id: "rc-2", lines: all }] };
  assert.equal(remainingQuantityForLine(full, full.items[0]), 0);
  assert.equal(deriveTransferStatus(partial, all), BRANCH_TRANSFER_STATUSES.RECEIVED, "every unit handled (6 accepted + 1 damaged + 3)");
  // the receipt bill is a stock movement record, never a sale or a supplier due
  const bill = buildInternalPurchaseInvoice({ transfer, receipt: { id: "rc-1", sequence: 1, lines: firstReceipt }, shop: { id: "shop-1" }, actor: { uid: "u1" }, invoiceId: "pi-bt-1", paymentMethod: "credit" });
  assert.equal(isBranchTransferBill(bill), true);
  assert.equal(bill.excludeFromSupplierPayable, true);
  assert.deepEqual([bill.totalTax, bill.items.every((it) => it.taxAmt === 0)], [0, true], "no VAT on an internal move");
  assert.equal(bill.items.reduce((t, it) => t + it.qty, 0), 6, "only accepted units go on the bill; damaged stay out");
});
