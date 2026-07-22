import test from "node:test";
import assert from "node:assert/strict";
import {
  BRANCH_TRANSFER_STATUSES,
  buildInternalPurchaseInvoice,
  buildReceiptLines,
  deriveTransferStatus,
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
