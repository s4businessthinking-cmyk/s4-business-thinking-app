// Access rules for every collection (originally ported from Firestore rules). Each collection exposes
// read/create/update/delete(ctx, args) where `res` is the stored document
// (Firestore `resource.data`) and `req` the document after the write
// (`request.resource.data`). Unknown collections are denied, as in Firestore.
import { deepEqual } from "./util.js";

export async function makeRuleContext(uid, loadDoc) {
  const cache = new Map();
  const get = async (collection, id) => {
    if (id === undefined || id === null || id === "") return null;
    const key = `${collection}/${id}`;
    if (!cache.has(key)) cache.set(key, await loadDoc(collection, String(id)));
    return cache.get(key);
  };
  const user = uid ? await get("users", uid) : null;
  return { uid: uid || null, user, get };
}

const has = (v) => v !== undefined && v !== null;

// The offline sync stamps every write with its own bookkeeping keys; they never count as a field change.
const SYNC_META_KEY = /^_(offline|cloud)_/;

function changedKeys(before = {}, after = {}) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...keys].filter((k) => !SYNC_META_KEY.test(k) && !deepEqual(before?.[k], after?.[k]));
}
const onlyChanged = (before, after, allowed) => changedKeys(before, after).every((k) => allowed.includes(k));

const isAuthenticated = (c) => !!c.uid;
const userExists = (c) => !!c.user;
const shopIdOf = (c) => (c.user ? c.user.shopId ?? null : null);

const isShopMember = (c, shopId) => isAuthenticated(c) && userExists(c) && has(shopId) && shopIdOf(c) === shopId;

export async function isOwnerOfShop(c, shopId) {
  if (!isShopMember(c, shopId)) return false;
  if (c.user.role === "owner") return true;
  const shop = await c.get("shops", shopId);
  return !!shop && (shop.ownerUid === c.uid || shop.ownerId === c.uid);
}

const hasShopPermission = (c, shopId, perm) => isShopMember(c, shopId) && c.user.permissions?.[perm] === true;

// The app treats these as granted when a profile has no explicit value (DEFAULT_PERMISSIONS).
const DEFAULT_ON_PERMISSIONS = ["sendOrder", "viewProducts", "manageSales", "manageCustomers"];
const memberMay = async (c, shopId, perm) => {
  if (await isOwnerOfShop(c, shopId)) return true;
  if (!isShopMember(c, shopId)) return false;
  const v = c.user.permissions?.[perm];
  return v === true || (v === undefined && DEFAULT_ON_PERMISSIONS.includes(perm));
};
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const canManageProducts = async (c, shopId) => (await isOwnerOfShop(c, shopId)) || hasShopPermission(c, shopId, "manageProducts");
const canSendBranchTransfer = async (c, shopId) => (await isOwnerOfShop(c, shopId)) || hasShopPermission(c, shopId, "sendBranchTransfer");
const canReceiveBranchTransfer = async (c, shopId) => (await isOwnerOfShop(c, shopId)) || hasShopPermission(c, shopId, "receiveBranchTransfer");

async function productCatalogWriteAllowed(c, shopId, req) {
  const m = await c.get("productMaintenance", shopId);
  return !m || (m.active !== true && req?.productCatalogEpoch === m.catalogEpoch);
}

async function legacyOrMaintenanceDeleteAllowed(c, shopId) {
  const m = await c.get("productMaintenance", shopId);
  return !m || m.active === true;
}

function isBranchTransferReceiver(c, d) {
  if (!isAuthenticated(c) || !userExists(c) || !d) return false;
  const u = c.user;
  return d.receiverUserId === c.uid
    || d.receiverFirebaseUid === c.uid
    || (has(u.localUserId) && d.receiverLocalUserId === u.localUserId)
    || (has(u.username) && d.receiverUsername === u.username)
    || (has(u.email) && d.receiverEmail === u.email);
}

const sameShopByResource = (c, res) => isAuthenticated(c) && userExists(c) && has(res?.shopId) && res.shopId === shopIdOf(c);
const sameShopByRequest = (c, req) => isAuthenticated(c) && userExists(c) && has(req?.shopId) && req.shopId === shopIdOf(c);

const memberConversionUpdate = (c, res, req) =>
  isShopMember(c, res?.shopId)
  && req.shopId === res.shopId
  && onlyChanged(res, req, ["status", "convertedInvoiceId", "convertedInvoiceNo", "updatedAt", "updatedBy"])
  && ["open", "confirmed", "converted", "invoiced"].includes(req.status);

const orderLinkUpdate = (c, res, req) =>
  isShopMember(c, res?.shopId)
  && req.shopId === res.shopId
  && onlyChanged(res, req, ["status", "linkedDocs", "receivedQty", "deliveredQty", "convertedInvoiceId", "convertedInvoiceNo", "updatedAt", "updatedBy"])
  && ["open", "partial", "received", "invoiced", "delivered", "closed"].includes(req.status);

const VOUCHER_MEMBER_FIELDS = ["status", "chequeStatus", "cancelledAt", "cancelledBy", "cancelReason", "clearedAt", "clearedBy", "bouncedAt", "bouncedBy", "updatedAt", "updatedBy", "handover", "chequeReceivedBy", "chequePrintedAt", "chequePrintCount"];
const PAYMENT_FIELDS = ["amountPaid", "balanceDue", "status", "updatedAt", "updatedBy"];
const VOUCHER_METHODS = ["cash", "cheque", "bank_transfer", "card"];

const validVoucher = (req, noField, partyField) =>
  typeof req[noField] === "string"
  && typeof req[partyField] === "string"
  && VOUCHER_METHODS.includes(req.method)
  && typeof req.totalAmount === "number"
  && req.totalAmount > 0
  && Array.isArray(req.allocations)
  && req.allocations.length > 0
  && req.status === "active";

const PDC_FIELDS = ["chequeDate", "chequeDateBefore", "chequePostponedAt", "chequePostponedBy"];

// Cancelling a voucher or bouncing its cheque gives money back to the bills, so it needs `reversePerm`
// (or PDC management); postponing a cheque date needs PDC management.
const voucherMemberUpdate = async (c, res, req, reversePerm) => {
  if (!(isShopMember(c, res.shopId) && res.shopId === shopIdOf(c) && req.shopId === res.shopId)) return false;
  if (!onlyChanged(res, req, [...VOUCHER_MEMBER_FIELDS, ...PDC_FIELDS])) return false;
  const pdc = await memberMay(c, res.shopId, "managePdc");
  if (changedKeys(res, req).some((k) => PDC_FIELDS.includes(k)) && !pdc) return false;
  const reverses = (req.status === "cancelled" && res.status !== "cancelled")
    || (req.chequeStatus === "bounced" && res.chequeStatus !== "bounced");
  if (reverses && !pdc && !(reversePerm && (await memberMay(c, res.shopId, reversePerm)))) return false;
  return true;
};

// Receipts/payments move only the money fields, and never cancel the bill itself.
const memberPaymentUpdate = (c, res, req) =>
  isShopMember(c, res.shopId)
  && req.shopId === res.shopId
  && onlyChanged(res, req, PAYMENT_FIELDS)
  && ["confirmed", "partial", "paid"].includes(req.status)
  && (!has(req.grandTotal) || num(req.amountPaid) <= num(req.grandTotal) + 0.01);

async function salesCreatorUpdate(c, res, req) {
  if (!(isShopMember(c, res.shopId) && res.createdBy === c.uid && req.createdBy === res.createdBy && req.shopId === res.shopId)) return false;
  if (!(await memberMay(c, res.shopId, "manageSales"))) return false;
  if (res.status === "cancelled") return false;
  if (req.status === "cancelled") return memberMay(c, res.shopId, "cancelInvoices");
  return num(req.amountPaid) <= num(req.grandTotal) + 0.01;
}

async function purchaseCreatorUpdate(c, res, req) {
  if (!(isShopMember(c, res.shopId) && res.createdBy === c.uid && req.createdBy === res.createdBy && req.shopId === res.shopId)) return false;
  if (!(await memberMay(c, res.shopId, "managePurchase"))) return false;
  return ["draft", "confirmed"].includes(res.status) && ["draft", "confirmed"].includes(req.status);
}

const deny = async () => false;

// A salesman receives the goods of their own order and enters the supplier's bill.
async function orderCreatedByCaller(c, req) {
  const order = await c.get("orders", req.sourceOrderId);
  return !!order && order.shopId === req.shopId && order.createdBy === c.uid;
}

// Generic shop-scoped collection: members read/create/update, owner deletes.
const shopScoped = ({ create, update, del } = {}) => ({
  read: async (c, { res }) => sameShopByResource(c, res),
  create: async (c, { req }) => sameShopByRequest(c, req) && (create ? await create(c, req) : true),
  update: async (c, { res, req }) => sameShopByResource(c, res) && (update ? await update(c, res, req) : true),
  delete: async (c, { res }) => sameShopByResource(c, res) && (del ? await del(c, res) : isOwnerOfShop(c, res.shopId)),
});
const appendOnly = () => ({ ...shopScoped(), update: deny, delete: deny });
const ownerDelete = (c, res) => isOwnerOfShop(c, res.shopId);
const ownerOrCreator = async (c, res) => (await isOwnerOfShop(c, res.shopId)) || res.createdBy === c.uid;

// Permissions a salesman may hold right after joining with an invite code; the owner grants the rest.
const SIGNUP_PERMISSIONS = ["sendOrder", "viewProducts", "manageSales", "manageCustomers"];
const PROTECTED_PROFILE_FIELDS = ["role", "shopId", "permissions", "status", "isDeleted", "disabled"];

async function selfProfileCreateAllowed(c, req) {
  if (!req || typeof req !== "object") return false;
  if (req.role === "owner") {
    if (!has(req.shopId)) return false;
    const shop = await c.get("shops", req.shopId);
    return !shop || shop.ownerUid === c.uid || shop.ownerId === c.uid;
  }
  if (!["salesman", "staff"].includes(req.role)) return false;
  if (has(req.permissions)) {
    if (typeof req.permissions !== "object") return false;
    if (Object.entries(req.permissions).some(([k, v]) => v === true && !SIGNUP_PERMISSIONS.includes(k))) return false;
  }
  if (!has(req.shopId)) return true;
  if (typeof req.inviteCode !== "string" || !req.inviteCode) return false;
  const invite = await c.get("inviteCodes", req.inviteCode);
  return !!invite && invite.shopId === req.shopId && invite.used === true && invite.usedBy === c.uid;
}

const selfProfileUpdateAllowed = (res, req) =>
  PROTECTED_PROFILE_FIELDS.every((k) => deepEqual(res?.[k] ?? null, req?.[k] ?? null));

export const RULES = {
  users: {
    read: async (c, { id, res }) => isAuthenticated(c) && (c.uid === id || (has(res?.shopId) && shopIdOf(c) === res.shopId)),
    create: async (c, { id, req }) => isAuthenticated(c) && (
      (has(req?.shopId) && (await isOwnerOfShop(c, req.shopId)))
      || (c.uid === id && (await selfProfileCreateAllowed(c, req)))
    ),
    update: async (c, { id, res, req }) => isAuthenticated(c) && (
      (has(res?.shopId) && (await isOwnerOfShop(c, res.shopId)) && (!has(req?.shopId) || req.shopId === res.shopId))
      || (c.uid === id && selfProfileUpdateAllowed(res, req))
    ),
    delete: async (c, { id, res }) => isAuthenticated(c) && (c.uid === id || (has(res?.shopId) && (await isOwnerOfShop(c, res.shopId)))),
  },

  shops: {
    read: async (c, { id, list }) => !list || isShopMember(c, id),
    create: async (c, { req }) => isAuthenticated(c) && req.ownerUid === c.uid,
    update: async (c, { id, res, req }) => isAuthenticated(c) && (
      res.ownerUid === c.uid
      || res.ownerId === c.uid
      || (isShopMember(c, id) && onlyChanged(res, req, ["lastOrderSerial", "lastPISerial", "lastSISerial", "lastQTSerial", "lastDNSerial", "lastPOSerial", "lastPaymentSerial", "lastReceiptSerial", "lastSRSerial", "lastPRSerial", "lastSASerial", "lastJVSerial", "lastCVSerial", "lastSOSerial", "lastGRSerial", "lastJOSerial", "lastPLSerial", "lastPBSerial", "lastVendorCode", "lastCustomerCode"]))
    ),
    delete: async (c, { res }) => isAuthenticated(c) && (res.ownerUid === c.uid || res.ownerId === c.uid),
  },

  // Single codes / usernames are looked up before sign-in; listing them is owner-only.
  inviteCodes: {
    read: async (c, { list, res }) => !list || (await isOwnerOfShop(c, res?.shopId)),
    create: async (c, { req }) => isAuthenticated(c) && (await isOwnerOfShop(c, req.shopId)),
    update: async (c, { res, req }) => isAuthenticated(c)
      && res.used === false
      && req.shopId === res.shopId
      && req.used === true
      && req.usedBy === c.uid,
    delete: async (c, { res }) => isAuthenticated(c) && (await isOwnerOfShop(c, res.shopId)),
  },

  staffLoginIndex: {
    read: async (c, { list, res }) => !list || (await isOwnerOfShop(c, res?.shopId)),
    create: async (c, { req }) => isAuthenticated(c) && ((await isOwnerOfShop(c, req.shopId)) || c.uid === req.firebaseUid),
    update: async (c, { req, res }) =>
      isAuthenticated(c) &&
      (((await isOwnerOfShop(c, res.shopId)) && (await isOwnerOfShop(c, req.shopId))) ||
        (c.uid === res.firebaseUid && c.uid === req.firebaseUid)),
    delete: async (c, { res }) => isAuthenticated(c) && (await isOwnerOfShop(c, res.shopId)),
  },

  orders: shopScoped({ create: async (c, req) => req.createdBy === c.uid }),
  companies: shopScoped(),

  products: shopScoped({
    create: async (c, req) => (await canManageProducts(c, req.shopId)) && productCatalogWriteAllowed(c, req.shopId, req),
    update: async (c, res, req) => (await canManageProducts(c, res.shopId)) && productCatalogWriteAllowed(c, res.shopId, req),
    del: async (c, res) => (await isOwnerOfShop(c, res.shopId)) && (await legacyOrMaintenanceDeleteAllowed(c, res.shopId)),
  }),

  productMaintenance: {
    read: async (c, { id }) => isShopMember(c, id),
    create: async (c, { id, req }) => (await isOwnerOfShop(c, id)) && req.shopId === id,
    update: async (c, { id, req }) => (await isOwnerOfShop(c, id)) && req.shopId === id,
    delete: deny,
  },

  inventory: shopScoped(),
  stockMovements: appendOnly(),
  stockBalances: shopScoped(),
  inventory_movements: appendOnly(),
  stock_balances: shopScoped(),
  stock_ledger: appendOnly(),
  purchases: shopScoped(),
  sales: shopScoped(),
  customers: shopScoped({ del: async (c, res) => memberMay(c, res.shopId, "manageCustomers") }),
  suppliers: shopScoped({ del: async () => true }),
  vendors: shopScoped({
    create: async (c, req) => (await memberMay(c, req.shopId, "manageVendors")) || (await memberMay(c, req.shopId, "managePurchase")),
    update: async (c, res) => memberMay(c, res.shopId, "manageVendors"),
  }),

  // Returns and stock adjustments: created by staff with the permission; only the owner or the creator may cancel.
  salesReturns: shopScoped({
    create: async (c, req) => req.createdBy === c.uid && (await memberMay(c, req.shopId, "manageReturns")),
    update: async (c, res, req) => (await isOwnerOfShop(c, res.shopId))
      || (res.createdBy === c.uid && req.createdBy === res.createdBy && (await memberMay(c, res.shopId, "manageReturns"))),
  }),
  purchaseReturns: shopScoped({
    create: async (c, req) => req.createdBy === c.uid && (await memberMay(c, req.shopId, "manageReturns")),
    update: async (c, res, req) => (await isOwnerOfShop(c, res.shopId))
      || (res.createdBy === c.uid && req.createdBy === res.createdBy && (await memberMay(c, res.shopId, "manageReturns"))),
  }),
  // Journal and contra vouchers are a record only; they never touch bills or stock.
  accountVouchers: shopScoped({
    create: async (c, req) => req.createdBy === c.uid && (await memberMay(c, req.shopId, "accountVouchers")),
    update: async (c, res, req) => (await isOwnerOfShop(c, res.shopId))
      || (res.createdBy === c.uid && req.createdBy === res.createdBy && (await memberMay(c, res.shopId, "accountVouchers"))),
  }),
  stockAdjustments: shopScoped({
    create: async (c, req) => req.createdBy === c.uid && (await memberMay(c, req.shopId, "stockAdjust")),
    update: async (c, res, req) => (await isOwnerOfShop(c, res.shopId))
      || (res.createdBy === c.uid && req.createdBy === res.createdBy && (await memberMay(c, res.shopId, "stockAdjust"))),
  }),
  auditLogs: {
    read: async (c, { res }) => sameShopByResource(c, res) && (await isOwnerOfShop(c, res.shopId)),
    create: async (c, { req }) => sameShopByRequest(c, req) && req.byUid === c.uid,
    update: deny,
    delete: deny,
  },
  masterLists: shopScoped({
    create: async (c, req) => canManageProducts(c, req.shopId),
    update: async (c, res) => canManageProducts(c, res.shopId),
    del: deny,
  }),

  purchaseInvoices: shopScoped({
    create: async (c, req) => (await isOwnerOfShop(c, req.shopId))
      || (req.createdBy === c.uid && (
        (await memberMay(c, req.shopId, "managePurchase"))
        || (req.internalTransfer === true && (await memberMay(c, req.shopId, "receiveBranchTransfer")))
        || (req.source === "salesmanOrder" && ((await memberMay(c, req.shopId, "setStatus"))
          || (await memberMay(c, req.shopId, "markDelivery"))
          || (await orderCreatedByCaller(c, req))))
      )),
    update: async (c, res, req) => (await isOwnerOfShop(c, res.shopId))
      || (await purchaseCreatorUpdate(c, res, req))
      || memberPaymentUpdate(c, res, req),
  }),

  purchasePayments: shopScoped({
    create: async (c, req) => req.createdBy === c.uid && validVoucher(req, "paymentNo", "vendorName"),
    update: async (c, res, req) => (await isOwnerOfShop(c, res.shopId)) || voucherMemberUpdate(c, res, req, "vendorPayments"),
  }),

  salesReceipts: shopScoped({
    create: async (c, req) => req.createdBy === c.uid && validVoucher(req, "receiptNo", "customerName"),
    update: async (c, res, req) => (await isOwnerOfShop(c, res.shopId)) || voucherMemberUpdate(c, res, req, "cancelInvoices"),
  }),

  supplierPayments: shopScoped(),
  chequeHandovers: shopScoped({ del: ownerDelete }),

  salesInvoices: shopScoped({
    create: async (c, req) => req.createdBy === c.uid && (await memberMay(c, req.shopId, "manageSales")),
    update: async (c, res, req) => (await isOwnerOfShop(c, res.shopId))
      || (await salesCreatorUpdate(c, res, req))
      || memberPaymentUpdate(c, res, req),
    del: async (c, res) => (await isOwnerOfShop(c, res.shopId)) || (res.createdBy === c.uid && res.status === "draft"),
  }),

  quotations: shopScoped({
    create: async (c, req) => req.createdBy === c.uid,
    update: async (c, res, req) => (await ownerOrCreator(c, res)) || memberConversionUpdate(c, res, req),
    del: ownerOrCreator,
  }),

  deliveryNotes: shopScoped({
    create: async (c, req) => req.createdBy === c.uid || (await isOwnerOfShop(c, req.shopId)),
    update: async (c, res, req) => (await ownerOrCreator(c, res)) || memberConversionUpdate(c, res, req),
    del: ownerOrCreator,
  }),

  expenses: shopScoped(),
  settings: { ...shopScoped(), delete: deny },

  branchTransferSettings: shopScoped({
    create: async (c, req) => isOwnerOfShop(c, req.shopId),
    update: async (c, res) => isOwnerOfShop(c, res.shopId),
    del: deny,
  }),

  branches: shopScoped({
    create: async (c, req) => isOwnerOfShop(c, req.shopId),
    update: async (c, res) => isOwnerOfShop(c, res.shopId),
    del: ownerDelete,
  }),

  branchTransfers: shopScoped({
    create: async (c, req) => canSendBranchTransfer(c, req.shopId),
    update: async (c, res, req) => (await canSendBranchTransfer(c, res.shopId)) || (
      (await canReceiveBranchTransfer(c, res.shopId))
      && isBranchTransferReceiver(c, res)
      && req.shopId === res.shopId
      && req.branchId === res.branchId
      && onlyChanged(res, req, [
        "status", "receipts", "purchaseInvoiceIds", "invoiceStatus", "receiptSummary", "receivedAt", "receivedBy",
        "receivedByName", "updatedAt", "updatedBy", "updatedByName", "_offline_updated_at", "_cloud_collection",
        "_cloud_document_id", "_cloud_synced_at", "_cloud_sync_status",
      ])
    ),
    del: async (c, res) => (await isOwnerOfShop(c, res.shopId)) && ["draft", "cancelled"].includes(res.status),
  }),

  branchTransferReceipts: shopScoped({
    create: async (c, req) => (await isOwnerOfShop(c, req.shopId)) || req.createdBy === c.uid,
    update: ownerOrCreator,
    del: deny,
  }),

  branchStockBalances: shopScoped({
    create: async (c, req) => (await isOwnerOfShop(c, req.shopId)) || ((await canReceiveBranchTransfer(c, req.shopId)) && isBranchTransferReceiver(c, req)),
    update: async (c, res, req) => (await isOwnerOfShop(c, res.shopId)) || ((await canReceiveBranchTransfer(c, res.shopId)) && isBranchTransferReceiver(c, req)),
  }),

  branchStockMovements: shopScoped({
    create: async (c, req) => (await isOwnerOfShop(c, req.shopId)) || req.createdBy === c.uid,
    update: ownerOrCreator,
    del: deny,
  }),

  // Orders and goods received notes: whoever turns one into a bill only moves its status / link fields.
  purchaseOrders: shopScoped({
    create: async (c, req) => req.createdBy === c.uid && (await memberMay(c, req.shopId, "managePurchase")),
    update: async (c, res, req) => (await ownerOrCreator(c, res)) || ((await memberMay(c, res.shopId, "managePurchase")) && orderLinkUpdate(c, res, req)),
    del: ownerOrCreator,
  }),
  salesOrders: shopScoped({
    create: async (c, req) => req.createdBy === c.uid && (await memberMay(c, req.shopId, "manageSales")),
    update: async (c, res, req) => (await ownerOrCreator(c, res)) || ((await memberMay(c, res.shopId, "manageSales")) && orderLinkUpdate(c, res, req)),
    del: ownerOrCreator,
  }),
  goodsReceipts: shopScoped({
    create: async (c, req) => req.createdBy === c.uid && (await memberMay(c, req.shopId, "managePurchase")),
    update: async (c, res, req) => (await isOwnerOfShop(c, res.shopId))
      || ((await memberMay(c, res.shopId, "managePurchase")) && (
        (res.createdBy === c.uid && req.createdBy === res.createdBy && res.status !== "invoiced") || orderLinkUpdate(c, res, req))),
    del: ownerDelete,
  }),

  employees: shopScoped({
    create: async (c, req) => memberMay(c, req.shopId, "manageEmployees"),
    update: async (c, res) => memberMay(c, res.shopId, "manageEmployees"),
    del: ownerDelete,
  }),
  employeeDocs: shopScoped({
    create: async (c, req) => memberMay(c, req.shopId, "manageEmployees"),
    update: async (c, res) => memberMay(c, res.shopId, "manageEmployees"),
    del: async (c, res) => memberMay(c, res.shopId, "manageEmployees"),
  }),
  attendance: shopScoped({
    create: async (c, req) => memberMay(c, req.shopId, "manageEmployees"),
    update: async (c, res) => memberMay(c, res.shopId, "manageEmployees"),
    del: ownerDelete,
  }),
  bankReconciliations: shopScoped({
    create: async (c, req) => memberMay(c, req.shopId, "bankReconcile"),
    update: async (c, res) => memberMay(c, res.shopId, "bankReconcile"),
    del: async (c, res) => memberMay(c, res.shopId, "bankReconcile"),
  }),
  jobOrders: shopScoped({
    create: async (c, req) => req.createdBy === c.uid && (await memberMay(c, req.shopId, "manageJobs")),
    update: async (c, res) => memberMay(c, res.shopId, "manageJobs"),
    del: ownerDelete,
  }),
};

export async function allowed(ctx, op, collection, args) {
  const rule = RULES[collection]?.[op];
  if (!rule) return false;
  try {
    return (await rule(ctx, args)) === true;
  } catch {
    return false;
  }
}

// Collections whose read rule does not depend on shop membership; listing
// them without a shopId filter is allowed (results are still rule-filtered).
export const UNSCOPED_LIST_COLLECTIONS = new Set(["shops", "inviteCodes", "staffLoginIndex", "users", "productMaintenance"]);
