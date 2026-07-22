import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase-config";
import { restoreLocalAuthSession } from "../auth/localAuthBootstrap";
import {
  offlineCacheCloudRecords,
  offlineCreate,
  offlineGetById,
  offlineList,
  offlineUpdate,
  offlineUpsert,
} from "../offline/offlineRepository";
import {
  BRANCH_TRANSFER_STATUSES,
  DEFAULT_BRANCH_TRANSFER_SETTINGS,
  buildInternalPurchaseInvoice,
  buildReceiptLines,
  createDocumentId,
  deriveTransferStatus,
  numberValue,
  remainingQuantityForLine,
  roundMoney,
  sanitizeDocumentId,
  validateTransferItems,
} from "./branchTransferDomain";

export const BRANCH_TRANSFER_COLLECTIONS = Object.freeze({
  SETTINGS: "branchTransferSettings",
  BRANCHES: "branches",
  TRANSFERS: "branchTransfers",
  RECEIPTS: "branchTransferReceipts",
  STOCK_BALANCES: "branchStockBalances",
  STOCK_MOVEMENTS: "branchStockMovements",
  PURCHASE_INVOICES: "purchaseInvoices",
  PRODUCTS: "products",
  USERS: "users",
});

const RECEIVABLE_STATUSES = new Set([
  BRANCH_TRANSFER_STATUSES.DISPATCHED,
  BRANCH_TRANSFER_STATUSES.IN_TRANSIT,
  BRANCH_TRANSFER_STATUSES.PARTIALLY_RECEIVED,
  BRANCH_TRANSFER_STATUSES.DISCREPANCY,
]);

function nowIso() {
  return new Date().toISOString();
}

function normalizeOfflineRows(result) {
  const rows = Array.isArray(result) ? result : result?.records || [];
  return rows.map((row) => ({
    ...(row?.data || row || {}),
    id: row?.data?.id || row?.document_id || row?.id,
  }));
}

function sortNewest(rows = []) {
  return [...rows].sort(
    (left, right) =>
      new Date(right.updatedAt || right.createdAt || 0).getTime() -
      new Date(left.updatedAt || left.createdAt || 0).getTime()
  );
}

function isOwnerActor(actor) {
  return String(actor?.role || "").trim().toLowerCase() === "owner";
}

function canSendBranchTransferActor(actor) {
  return isOwnerActor(actor) || actor?.permissions?.sendBranchTransfer === true;
}

function canReceiveBranchTransferActor(actor) {
  return isOwnerActor(actor) || actor?.permissions?.receiveBranchTransfer === true;
}

function identitySet(source = {}) {
  return new Set(
    [source?.uid, source?.firebaseUid, source?.id, source?.localUserId, source?.username, source?.email]
      .filter(Boolean)
      .map((value) => String(value).trim())
      .filter(Boolean)
  );
}

function receiverIdentityValues(transfer = {}) {
  return [
    transfer.receiverUserId,
    transfer.receiverFirebaseUid,
    transfer.receiverMemberId,
    transfer.receiverLocalUserId,
    transfer.receiverUsername,
    transfer.receiverEmail,
  ]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function dirtyShopRows(result, shopId) {
  const rows = Array.isArray(result) ? result : result?.records || [];
  return rows
    .filter((row) => Number(row?.dirty || 0) === 1)
    .map((row) => ({ ...(row?.data || {}), id: row?.data?.id || row?.document_id || row?.id }))
    .filter((row) => String(row.shopId || "") === String(shopId));
}

function actorFromSession(session) {
  const profile = session?.profile || {};
  const user = session?.user || {};
  return {
    uid: user.uid || profile.firebaseUid || profile.uid || session?.localUser?.firebaseUid || session?.localUser?.id || "",
    firebaseUid: user.uid || profile.firebaseUid || profile.uid || session?.localUser?.firebaseUid || "",
    id: profile.id || session?.localUser?.id || "",
    localUserId: profile.localUserId || session?.localUser?.id || "",
    personName:
      profile.personName ||
      session?.localUser?.personName ||
      user.displayName ||
      profile.username ||
      "",
    username: profile.username || session?.localUser?.username || "",
    email: profile.email || user.email || session?.localUser?.email || "",
    role: profile.role || session?.localUser?.role || "",
    permissions: profile.permissions || session?.localUser?.permissions || null,
  };
}

function settingsId(shopId) {
  return `branch-transfer-settings-${sanitizeDocumentId(shopId)}`;
}

function stockBalanceId(shopId, branchId, productId) {
  return [
    "branch-stock",
    sanitizeDocumentId(shopId),
    sanitizeDocumentId(branchId),
    sanitizeDocumentId(productId),
  ].join("-");
}

function purchaseInvoiceId(receiptId) {
  return `branch-transfer-pi-${sanitizeDocumentId(receiptId)}`;
}

function transferReceiptId(transfer, sequence) {
  return `${sanitizeDocumentId(transfer.id)}-R${String(sequence).padStart(3, "0")}`;
}

function dispatchMovementId(transferId, lineId) {
  return `${sanitizeDocumentId(transferId)}-${sanitizeDocumentId(lineId)}-OUT`;
}

function receiveMovementId(receiptId, lineId) {
  return `${sanitizeDocumentId(receiptId)}-${sanitizeDocumentId(lineId)}-IN`;
}

export async function getBranchTransferSession() {
  const restored = await restoreLocalAuthSession();
  if (!restored?.profile?.shopId) return null;

  return {
    ...restored,
    actor: actorFromSession(restored),
    shopId: restored.profile.shopId,
    isOwner: restored.profile.role === "owner",
  };
}

export async function listShopRecords(collectionName, shopId) {
  if (!shopId) return [];
  const result = await offlineList(collectionName);
  return sortNewest(
    normalizeOfflineRows(result).filter((row) => String(row.shopId || "") === String(shopId))
  );
}

export function subscribeShopRecords(collectionName, shopId, onRows, onError = () => {}) {
  let cancelled = false;
  let unsubscribe = () => {};

  listShopRecords(collectionName, shopId)
    .then((rows) => {
      if (!cancelled) onRows(rows);
    })
    .catch(onError);

  if (db && shopId) {
    try {
      const q = query(collection(db, collectionName), where("shopId", "==", shopId));
      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const cloudRows = sortNewest(
            snapshot.docs.map((entry) => ({
              id: entry.id,
              ...entry.data(),
            }))
          );

          Promise.resolve()
            .then(() => offlineCacheCloudRecords(collectionName, cloudRows))
            .catch((error) =>
              console.warn(`[S4 Branch Transfer] ${collectionName} cache failed`, error)
            )
            .then(() => offlineList(collectionName))
            .then((localResult) => {
              const merged = new Map(cloudRows.map((row) => [String(row.id), row]));
              for (const row of dirtyShopRows(localResult, shopId)) {
                merged.set(String(row.id), row);
              }
              if (!cancelled) onRows(sortNewest([...merged.values()]));
            })
            .catch((error) => {
              console.warn(`[S4 Branch Transfer] ${collectionName} local merge failed`, error);
              if (!cancelled) onRows(cloudRows);
            });
        },
        (error) => {
          console.warn(`[S4 Branch Transfer] ${collectionName} listener failed`, error);
          onError(error);
        }
      );
    } catch (error) {
      onError(error);
    }
  }

  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}

export async function loadBranchTransferSettings(shopId) {
  if (!shopId) return { ...DEFAULT_BRANCH_TRANSFER_SETTINGS };
  const existing = await offlineGetById(BRANCH_TRANSFER_COLLECTIONS.SETTINGS, settingsId(shopId));
  return {
    ...DEFAULT_BRANCH_TRANSFER_SETTINGS,
    ...(existing?.data || {}),
    shopId,
    id: settingsId(shopId),
  };
}

export async function saveBranchTransferSettings({ shopId, settings, actor }) {
  if (!shopId) throw new Error("SHOP_REQUIRED");
  if (!isOwnerActor(actor)) throw new Error("OWNER_REQUIRED");

  const timestamp = nowIso();
  const payload = {
    ...DEFAULT_BRANCH_TRANSFER_SETTINGS,
    ...(settings || {}),
    id: settingsId(shopId),
    shopId,
    updatedAt: timestamp,
    updatedBy: actor.uid || actor.localUserId || "",
    updatedByName: actor.personName || "",
  };

  const existing = await offlineGetById(BRANCH_TRANSFER_COLLECTIONS.SETTINGS, payload.id);
  if (!existing) {
    payload.createdAt = timestamp;
    payload.createdBy = actor.uid || actor.localUserId || "";
  }

  const result = await offlineUpsert(
    BRANCH_TRANSFER_COLLECTIONS.SETTINGS,
    payload.id,
    payload
  );
  await syncIfOnline();
  return { ...result.data, id: payload.id };
}

export async function saveBranch({ shopId, branch, actor }) {
  if (!shopId) throw new Error("SHOP_REQUIRED");
  if (!isOwnerActor(actor)) throw new Error("OWNER_REQUIRED");

  const name = String(branch?.name || "").trim();
  if (!name) throw new Error("BRANCH_NAME_REQUIRED");

  const timestamp = nowIso();
  const id = branch?.id || createDocumentId("branch");
  const payload = {
    id,
    shopId,
    name,
    code: String(branch?.code || "").trim(),
    location: String(branch?.location || "").trim(),
    phone: String(branch?.phone || "").trim(),
    receiverUserId: String(branch?.receiverUserId || "").trim(),
    receiverLocalUserId: String(branch?.receiverLocalUserId || "").trim(),
    receiverName: String(branch?.receiverName || "").trim(),
    active: branch?.active !== false,
    updatedAt: timestamp,
    updatedBy: actor.uid || actor.localUserId || "",
    updatedByName: actor.personName || "",
  };

  const existing = await offlineGetById(BRANCH_TRANSFER_COLLECTIONS.BRANCHES, id);
  if (!existing) {
    payload.createdAt = timestamp;
    payload.createdBy = actor.uid || actor.localUserId || "";
  }

  const result = await offlineUpsert(BRANCH_TRANSFER_COLLECTIONS.BRANCHES, id, payload);
  await syncIfOnline();
  return { ...result.data, id };
}

export async function disableBranch({ branch, actor }) {
  if (!branch?.id) throw new Error("BRANCH_REQUIRED");
  if (!isOwnerActor(actor)) throw new Error("OWNER_REQUIRED");

  const result = await offlineUpdate(BRANCH_TRANSFER_COLLECTIONS.BRANCHES, branch.id, {
    active: false,
    updatedAt: nowIso(),
    updatedBy: actor.uid || actor.localUserId || "",
    updatedByName: actor.personName || "",
  });
  await syncIfOnline();
  return { ...result.data, id: branch.id };
}

function buildTransferNo() {
  const date = new Date();
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("");
  const suffix = createDocumentId("").replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase();
  return `BT-${stamp}-${suffix}`;
}

async function ensureDispatchMovements(transfer, actor) {
  const timestamp = nowIso();

  for (const item of transfer.items || []) {
    const movementId = dispatchMovementId(transfer.id, item.lineId);
    await offlineUpsert(BRANCH_TRANSFER_COLLECTIONS.STOCK_MOVEMENTS, movementId, {
      id: movementId,
      shopId: transfer.shopId,
      branchId: transfer.branchId,
      branchName: transfer.branchName || "",
      transferId: transfer.id,
      transferNo: transfer.transferNo,
      lineId: item.lineId,
      productId: item.productId,
      productName: item.name,
      direction: "OUT",
      movementType: "BRANCH_TRANSFER_DISPATCH",
      quantity: numberValue(item.quantity),
      unit: item.unit || "Pcs",
      unitCost: roundMoney(item.unitCost),
      createdAt: transfer.dispatchedAt || timestamp,
      createdBy: actor.uid || actor.localUserId || "",
      createdByName: actor.personName || "",
    });
  }
}

export async function createBranchTransfer({
  shopId,
  shop,
  branch,
  receiver,
  vendor = {},
  items,
  purchaseInvoicePaymentMethod = "cash",
  note = "",
  expectedDeliveryDate = "",
  initialStatus = BRANCH_TRANSFER_STATUSES.DRAFT,
  actor,
}) {
  if (!shopId) throw new Error("SHOP_REQUIRED");
  if (!canSendBranchTransferActor(actor)) throw new Error("OWNER_REQUIRED");
  if (!branch?.id || branch.active === false) throw new Error("ACTIVE_BRANCH_REQUIRED");

  const receiverUserId = String(receiver?.receiverUserId || "").trim();
  const receiverFirebaseUid = String(receiver?.receiverFirebaseUid || "").trim();
  const receiverMemberId = String(receiver?.receiverMemberId || "").trim();
  const receiverLocalUserId = String(receiver?.receiverLocalUserId || "").trim();
  const receiverUsername = String(receiver?.receiverUsername || "").trim();
  const receiverEmail = String(receiver?.receiverEmail || "").trim();
  const receiverName = String(receiver?.receiverName || "").trim();
  if (!receiverUserId && !receiverFirebaseUid && !receiverMemberId && !receiverLocalUserId) {
    throw new Error("SALESMAN_REQUIRED");
  }

  const normalizedItems = validateTransferItems(items);
  const normalizedPurchaseInvoicePaymentMethod = purchaseInvoicePaymentMethod === "credit" ? "credit" : "cash";
  const timestamp = nowIso();
  const id = createDocumentId("branch-transfer");
  const dispatched =
    initialStatus === BRANCH_TRANSFER_STATUSES.DISPATCHED ||
    initialStatus === BRANCH_TRANSFER_STATUSES.IN_TRANSIT;

  const payload = {
    id,
    shopId,
    transferNo: buildTransferNo(),
    sourceShopName: shop?.companyName || "Main Shop",
    branchId: branch.id,
    branchName: branch.name,
    receiverUserId,
    receiverFirebaseUid,
    receiverMemberId,
    receiverLocalUserId,
    receiverUsername,
    receiverEmail,
    receiverName,
    vendorId: vendor?.vendorId || null,
    vendorName: String(vendor?.vendorName || "").trim(),
    vendorMobile: String(vendor?.vendorMobile || "").trim(),
    supplierInvoiceNo: String(vendor?.supplierInvoiceNo || "").trim(),
    purchaseInvoicePaymentMethod: normalizedPurchaseInvoicePaymentMethod,
    items: normalizedItems,
    note: String(note || "").trim(),
    expectedDeliveryDate: String(expectedDeliveryDate || ""),
    status: initialStatus,
    receipts: [],
    purchaseInvoiceIds: [],
    invoiceStatus: "not_received",
    createdAt: timestamp,
    createdBy: actor.uid || actor.localUserId || "",
    createdByName: actor.personName || "",
    updatedAt: timestamp,
    updatedBy: actor.uid || actor.localUserId || "",
    ...(dispatched
      ? {
          dispatchedAt: timestamp,
          dispatchedBy: actor.uid || actor.localUserId || "",
          dispatchedByName: actor.personName || "",
        }
      : {}),
  };

  const result = await offlineCreate(BRANCH_TRANSFER_COLLECTIONS.TRANSFERS, payload);
  const savedId = result.documentId || id;
  const verified = await offlineGetById(BRANCH_TRANSFER_COLLECTIONS.TRANSFERS, savedId);
  if (!verified?.data) throw new Error("TRANSFER_SAVE_FAILED");
  const transfer = { ...verified.data, id: savedId };

  if (dispatched) {
    await ensureDispatchMovements(transfer, actor);
  }

  await syncIfOnline();
  return transfer;
}

export async function updateTransferStatus({ transfer, status, actor }) {
  if (!transfer?.id) throw new Error("TRANSFER_REQUIRED");
  if (!canSendBranchTransferActor(actor)) throw new Error("OWNER_REQUIRED");

  const allowed = new Set([
    BRANCH_TRANSFER_STATUSES.PACKED,
    BRANCH_TRANSFER_STATUSES.DISPATCHED,
    BRANCH_TRANSFER_STATUSES.IN_TRANSIT,
    BRANCH_TRANSFER_STATUSES.RECEIVED,
    BRANCH_TRANSFER_STATUSES.CANCELLED,
  ]);
  if (!allowed.has(status)) throw new Error("TRANSFER_STATUS_INVALID");
  if (
    status === BRANCH_TRANSFER_STATUSES.RECEIVED &&
    (transfer.items || []).some((item) => remainingQuantityForLine(transfer, item) > 0)
  ) {
    throw new Error("TRANSFER_REMAINING_ITEMS");
  }
  if (
    [BRANCH_TRANSFER_STATUSES.RECEIVED, BRANCH_TRANSFER_STATUSES.CANCELLED].includes(
      transfer.status
    )
  ) {
    throw new Error("TRANSFER_ALREADY_CLOSED");
  }

  const timestamp = nowIso();
  const patch = {
    status,
    updatedAt: timestamp,
    updatedBy: actor.uid || actor.localUserId || "",
    updatedByName: actor.personName || "",
  };

  if (status === BRANCH_TRANSFER_STATUSES.PACKED) {
    patch.packedAt = timestamp;
  }
  if (status === BRANCH_TRANSFER_STATUSES.DISPATCHED) {
    patch.dispatchedAt = transfer.dispatchedAt || timestamp;
    patch.dispatchedBy = actor.uid || actor.localUserId || "";
    patch.dispatchedByName = actor.personName || "";
  }
  if (status === BRANCH_TRANSFER_STATUSES.IN_TRANSIT) {
    patch.inTransitAt = timestamp;
  }
  if (status === BRANCH_TRANSFER_STATUSES.RECEIVED) {
    patch.receivedAt = transfer.receivedAt || timestamp;
    patch.receivedBy = transfer.receivedBy || actor.uid || actor.localUserId || "";
    patch.receivedByName = transfer.receivedByName || actor.personName || "";
    patch.discrepancyResolvedAt = timestamp;
    patch.discrepancyResolvedBy = actor.uid || actor.localUserId || "";
  }
  if (status === BRANCH_TRANSFER_STATUSES.CANCELLED) {
    patch.cancelledAt = timestamp;
    patch.cancelledBy = actor.uid || actor.localUserId || "";
  }

  const result = await offlineUpdate(
    BRANCH_TRANSFER_COLLECTIONS.TRANSFERS,
    transfer.id,
    patch
  );
  const updated = { ...result.data, id: transfer.id };

  if (
    status === BRANCH_TRANSFER_STATUSES.DISPATCHED &&
    !transfer.dispatchedAt
  ) {
    await ensureDispatchMovements(updated, actor);
  }

  await syncIfOnline();
  return updated;
}

function matchesAssignedReceiver(transfer, actor) {
  if (isOwnerActor(actor)) return true;
  const actorIds = identitySet(actor);
  return receiverIdentityValues(transfer).some((value) => actorIds.has(value));
}

async function applyAcceptedStock({ transfer, receipt, line, actor }) {
  if (numberValue(line.acceptedQty) <= 0) return null;

  const id = stockBalanceId(transfer.shopId, transfer.branchId, line.productId);
  const existing = await offlineGetById(BRANCH_TRANSFER_COLLECTIONS.STOCK_BALANCES, id);
  const existingData = existing?.data || {};
  const appliedReceiptIds = Array.isArray(existingData.appliedReceiptIds)
    ? existingData.appliedReceiptIds
    : [];

  if (!appliedReceiptIds.includes(receipt.id)) {
    await offlineUpsert(BRANCH_TRANSFER_COLLECTIONS.STOCK_BALANCES, id, {
      ...existingData,
      id,
      shopId: transfer.shopId,
      branchId: transfer.branchId,
      branchName: transfer.branchName || "",
      lastTransferId: transfer.id,
      lastReceiptId: receipt.id,
      receiverUserId: transfer.receiverUserId || "",
      receiverLocalUserId: transfer.receiverLocalUserId || "",
      productId: line.productId,
      productName: line.name,
      productCode: line.code || "",
      unit: line.unit || "Pcs",
      quantity: numberValue(existingData.quantity) + numberValue(line.acceptedQty),
      lastUnitCost: roundMoney(line.unitCost),
      appliedReceiptIds: [...appliedReceiptIds, receipt.id].slice(-250),
      updatedAt: receipt.receivedAt,
      updatedBy: actor.uid || actor.localUserId || "",
      updatedByName: actor.personName || "",
      createdAt: existingData.createdAt || receipt.receivedAt,
    });
  }

  const movementId = receiveMovementId(receipt.id, line.lineId);
  await offlineUpsert(BRANCH_TRANSFER_COLLECTIONS.STOCK_MOVEMENTS, movementId, {
    id: movementId,
    shopId: transfer.shopId,
    branchId: transfer.branchId,
    branchName: transfer.branchName || "",
    transferId: transfer.id,
    transferNo: transfer.transferNo,
    receiptId: receipt.id,
    lineId: line.lineId,
    productId: line.productId,
    productName: line.name,
    direction: "IN",
    movementType: "BRANCH_TRANSFER_RECEIPT",
    quantity: numberValue(line.acceptedQty),
    damagedQuantity: numberValue(line.damagedQty),
    unit: line.unit || "Pcs",
    unitCost: roundMoney(line.unitCost),
    createdAt: receipt.receivedAt,
    createdBy: actor.uid || actor.localUserId || "",
    createdByName: actor.personName || "",
  });

  return id;
}

async function upsertReceiptRecord({ transfer, receipt, actor }) {
  await offlineUpsert(BRANCH_TRANSFER_COLLECTIONS.RECEIPTS, receipt.id, {
    ...receipt,
    shopId: transfer.shopId,
    transferId: transfer.id,
    transferNo: transfer.transferNo,
    branchId: transfer.branchId,
    branchName: transfer.branchName || "",
    createdBy: actor.uid || actor.localUserId || "",
    createdByName: actor.personName || "",
  });
}

async function createInvoiceForReceipt({ transfer, receipt, shop, actor }) {
  const acceptedTotal = (receipt.lines || []).reduce(
    (sum, line) => sum + numberValue(line.acceptedQty),
    0
  );
  if (acceptedTotal <= 0) return null;

  const id = purchaseInvoiceId(receipt.id);
  const existing = await offlineGetById(BRANCH_TRANSFER_COLLECTIONS.PURCHASE_INVOICES, id);
  if (existing?.data) return { ...existing.data, id };

  const invoice = buildInternalPurchaseInvoice({
    transfer,
    receipt,
    shop,
    actor,
    invoiceId: id,
    paymentMethod: transfer.purchaseInvoicePaymentMethod,
    createdAt: receipt.receivedAt,
  });
  const result = await offlineUpsert(
    BRANCH_TRANSFER_COLLECTIONS.PURCHASE_INVOICES,
    id,
    invoice
  );
  return { ...result.data, id };
}

function nextReceiptSequence(transfer) {
  return (transfer?.receipts || []).reduce(
    (max, receipt) => Math.max(max, Number(receipt.sequence || 0)),
    0
  ) + 1;
}

export async function receiveBranchTransfer({
  transfer,
  inputLines,
  settings,
  shop,
  actor,
}) {
  if (!transfer?.id) throw new Error("TRANSFER_REQUIRED");
  if (!canReceiveBranchTransferActor(actor)) throw new Error("RECEIVE_PERMISSION_REQUIRED");
  if (!matchesAssignedReceiver(transfer, actor)) throw new Error("RECEIVER_NOT_ASSIGNED");
  if (!RECEIVABLE_STATUSES.has(transfer.status)) throw new Error("TRANSFER_NOT_RECEIVABLE");

  const receiptLines = buildReceiptLines(transfer, inputLines);
  const acceptedTotal = receiptLines.reduce(
    (sum, line) => sum + numberValue(line.acceptedQty),
    0
  );
  const handledTotal = receiptLines.reduce(
    (sum, line) => sum + numberValue(line.receivedQty),
    0
  );

  if (handledTotal <= 0) throw new Error("RECEIPT_QUANTITY_REQUIRED");

  const remainingBefore = (transfer.items || []).reduce(
    (sum, item) => sum + remainingQuantityForLine(transfer, item),
    0
  );
  if (
    settings?.allowPartialReceive === false &&
    acceptedTotal < remainingBefore
  ) {
    throw new Error("PARTIAL_RECEIVE_DISABLED");
  }

  const sequence = nextReceiptSequence(transfer);
  const receiptId = transferReceiptId(transfer, sequence);
  const timestamp = nowIso();
  const receipt = {
    id: receiptId,
    sequence,
    receivedAt: timestamp,
    receivedBy: actor.uid || actor.localUserId || "",
    receivedByLocalUserId: actor.localUserId || "",
    receivedByName: actor.personName || "",
    lines: receiptLines,
    acceptedTotal,
    damagedTotal: receiptLines.reduce(
      (sum, line) => sum + numberValue(line.damagedQty),
      0
    ),
    invoiceStatus: "pending",
    purchaseInvoiceId: null,
  };

  for (const line of receiptLines) {
    await applyAcceptedStock({ transfer, receipt, line, actor });
  }
  await upsertReceiptRecord({ transfer, receipt, actor });

  let invoice = null;
  if (settings?.autoCreatePurchaseInvoiceOnReceive === true && acceptedTotal > 0) {
    invoice = await createInvoiceForReceipt({ transfer, receipt, shop, actor });
    receipt.purchaseInvoiceId = invoice?.id || null;
    receipt.invoiceStatus = invoice ? "created" : "not_required";
    await upsertReceiptRecord({ transfer, receipt, actor });
  } else {
    receipt.invoiceStatus = "not_required";
    await upsertReceiptRecord({ transfer, receipt, actor });
  }

  const status = deriveTransferStatus(transfer, receiptLines);
  const receipts = [...(transfer.receipts || []), receipt];
  const purchaseInvoiceIds = [
    ...new Set(
      [
        ...(transfer.purchaseInvoiceIds || []),
        receipt.purchaseInvoiceId,
      ].filter(Boolean)
    ),
  ];
  const result = await offlineUpdate(
    BRANCH_TRANSFER_COLLECTIONS.TRANSFERS,
    transfer.id,
    {
      receipts,
      status,
      purchaseInvoiceIds,
      invoiceStatus: purchaseInvoiceIds.length ? "created" : "not_required",
      receiptSummary: {
        totalReceipts: receipts.length,
        totalAccepted: receipts.reduce(
          (sum, current) => sum + numberValue(current.acceptedTotal),
          0
        ),
        totalDamaged: receipts.reduce(
          (sum, current) => sum + numberValue(current.damagedTotal),
          0
        ),
      },
      receivedAt:
        status === BRANCH_TRANSFER_STATUSES.RECEIVED ? timestamp : transfer.receivedAt || null,
      receivedBy:
        status === BRANCH_TRANSFER_STATUSES.RECEIVED
          ? actor.uid || actor.localUserId || ""
          : transfer.receivedBy || null,
      receivedByName:
        status === BRANCH_TRANSFER_STATUSES.RECEIVED
          ? actor.personName || ""
          : transfer.receivedByName || null,
      updatedAt: timestamp,
      updatedBy: actor.uid || actor.localUserId || "",
      updatedByName: actor.personName || "",
    }
  );

  await syncIfOnline();
  return {
    transfer: { ...result.data, id: transfer.id },
    receipt,
    invoice,
  };
}

export async function createPurchaseInvoiceFromReceipt({
  transfer,
  receiptId,
  shop,
  actor,
}) {
  if (!transfer?.id || !receiptId) throw new Error("RECEIPT_REQUIRED");
  if (!canReceiveBranchTransferActor(actor)) throw new Error("RECEIVE_PERMISSION_REQUIRED");
  if (!matchesAssignedReceiver(transfer, actor)) throw new Error("RECEIVER_NOT_ASSIGNED");

  const receipt = (transfer.receipts || []).find((entry) => entry.id === receiptId);
  if (!receipt) throw new Error("RECEIPT_NOT_FOUND");
  if (receipt.purchaseInvoiceId) {
    const existing = await offlineGetById(
      BRANCH_TRANSFER_COLLECTIONS.PURCHASE_INVOICES,
      receipt.purchaseInvoiceId
    );
    return {
      transfer,
      receipt,
      invoice: existing?.data ? { ...existing.data, id: receipt.purchaseInvoiceId } : null,
      alreadyCreated: true,
    };
  }

  const invoice = await createInvoiceForReceipt({ transfer, receipt, shop, actor });
  if (!invoice) throw new Error("PURCHASE_INVOICE_ITEMS_REQUIRED");

  const receipts = (transfer.receipts || []).map((entry) =>
    entry.id === receipt.id
      ? {
          ...entry,
          purchaseInvoiceId: invoice.id,
          invoiceStatus: "created",
        }
      : entry
  );
  const purchaseInvoiceIds = [
    ...new Set([...(transfer.purchaseInvoiceIds || []), invoice.id]),
  ];

  await upsertReceiptRecord({
    transfer,
    receipt: {
      ...receipt,
      purchaseInvoiceId: invoice.id,
      invoiceStatus: "created",
    },
    actor,
  });

  const result = await offlineUpdate(
    BRANCH_TRANSFER_COLLECTIONS.TRANSFERS,
    transfer.id,
    {
      receipts,
      purchaseInvoiceIds,
      invoiceStatus: "created",
      updatedAt: nowIso(),
      updatedBy: actor.uid || actor.localUserId || "",
      updatedByName: actor.personName || "",
    }
  );

  await syncIfOnline();
  return {
    transfer: { ...result.data, id: transfer.id },
    receipt: receipts.find((entry) => entry.id === receipt.id),
    invoice,
    alreadyCreated: false,
  };
}

export async function syncIfOnline() {
  if (typeof navigator !== "undefined" && navigator.onLine) {
    try {
      return await window.S4Offline?.syncNow?.();
    } catch (error) {
      console.warn("[S4 Branch Transfer] sync failed", error);
    }
  }
  return null;
}
