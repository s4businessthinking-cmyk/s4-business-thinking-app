// Access rules for every collection (originally ported from Firestore rules). Each collection exposes
// read/create/update/delete(ctx, args) where `res` is the stored document
// (Firestore `resource.data`) and `req` the document after the write
// (`request.resource.data`). Unknown collections are denied, as in Firestore.
import { deepEqual } from "./util.js";
import { LOCKED_COLLECTIONS, dayOf, periodLockBlocks } from "./periodLock.js";

export async function makeRuleContext(uid, loadDoc, listDocs) {
  const cache = new Map();
  const get = async (collection, id) => {
    if (id === undefined || id === null || id === "") return null;
    const key = `${collection}/${id}`;
    if (!cache.has(key)) cache.set(key, await loadDoc(collection, String(id)));
    return cache.get(key);
  };
  const list = async (collection, shopId) => {
    if (typeof listDocs !== "function" || shopId === undefined || shopId === null || shopId === "") return [];
    const key = `list:${collection}/${shopId}`;
    if (!cache.has(key)) cache.set(key, (await listDocs(collection, String(shopId))) || []);
    return cache.get(key);
  };
  const user = uid ? await get("users", uid) : null;
  return { uid: uid || null, user, get, list };
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

export async function canBackupShop(c, shopId) {
  return (await isOwnerOfShop(c, shopId)) || (await memberMay(c, shopId, "manageBackup"));
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const canManageProducts = async (c, shopId) => (await isOwnerOfShop(c, shopId)) || hasShopPermission(c, shopId, "manageProducts");
const canSendBranchTransfer = async (c, shopId) => (await isOwnerOfShop(c, shopId)) || hasShopPermission(c, shopId, "sendBranchTransfer");
const canReceiveBranchTransfer = async (c, shopId) => (await isOwnerOfShop(c, shopId)) || hasShopPermission(c, shopId, "receiveBranchTransfer");

async function productCatalogWriteAllowed(c, shopId, req) {
  const m = await c.get("productMaintenance", shopId);
  if (!m) return true;
  if (m.active === true) return false;
  const epoch = Number(m.catalogEpoch) || 0;
  const reqEpoch = Number(req?.productCatalogEpoch);
  const effectiveReqEpoch = Number.isFinite(reqEpoch) ? reqEpoch : 0;
  return effectiveReqEpoch === epoch;
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
  // Normal vouchers need invoice allocs; return refunds link via returnId with empty allocs.
  && (req.allocations.length > 0 || (req.isRefund === true && typeof req.returnId === "string" && !!req.returnId))
  && req.status === "active";

const RETURNABLE_INV = new Set(["confirmed", "partial", "paid"]);

async function validReturnDoc(c, req, invCol, retCol, exceptId = null) {
  if (!req || req.shopId !== shopIdOf(c)) return false;
  if (!(typeof req.returnNo === "string" && req.returnNo) || !(typeof req.invoiceId === "string" && req.invoiceId)) return false;
  if (!["confirmed", "cancelled"].includes(req.status)) return false;
  if (req.status === "cancelled") return true;
  if (!(typeof req.total === "number" && req.total > 0)) return false;
  if (!Array.isArray(req.items) || !req.items.length) return false;
  const inv = await c.get(invCol, req.invoiceId);
  if (!inv || inv.shopId !== req.shopId || inv.isDeleted || inv.deleted) return false;
  if (!RETURNABLE_INV.has(inv.status)) return false;
  const lines = Array.isArray(inv.items) ? inv.items : [];
  const already = new Map();
  const prior = typeof c.list === "function" ? await c.list(retCol, req.shopId) : [];
  for (const r of prior || []) {
    if (!r || r.status === "cancelled" || (exceptId && (r.id === exceptId))) continue;
    if (r.invoiceId !== req.invoiceId) continue;
    for (const it of r.items || []) {
      const i = Number(it?.lineIndex);
      if (!Number.isInteger(i)) continue;
      already.set(i, (already.get(i) || 0) + num(it?.qty));
    }
  }
  for (const it of req.items) {
    const idx = Number(it?.lineIndex);
    const qty = num(it?.qty);
    if (!Number.isInteger(idx) || idx < 0 || idx >= lines.length || !(qty > 0)) return false;
    const left = Math.max(0, num(lines[idx].qty) - (already.get(idx) || 0));
    if (qty > left + 0.01) return false;
  }
  return true;
}

const REMINDER_DONE_FIELDS = ["status", "dueDate", "doneAt", "doneBy", "doneByName", "lastDoneAt", "snoozedUntil", "updatedAt", "updatedBy", "history"];
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

const REPORT_READ = ["viewAccounts", "viewTax", "viewGlobalLedger"];
const withReportRead = (view) => {
  const base = !view ? [] : Array.isArray(view) ? view : [view];
  return [...base, ...REPORT_READ];
};

async function memberCanViewShopDoc(c, res, viewPerm) {
  if (!sameShopByResource(c, res)) return false;
  if (await isOwnerOfShop(c, res.shopId)) return true;
  if (!viewPerm) return true;
  const perms = Array.isArray(viewPerm) ? viewPerm : [viewPerm];
  for (const p of perms) {
    if (await memberMay(c, res.shopId, p)) return true;
  }
  return false;
}

// Generic shop-scoped collection: optional view permission on read; owner deletes by default.
const shopScoped = ({ view, create, update, del } = {}) => ({
  read: async (c, args) => memberCanViewShopDoc(c, args.res, view),
  create: async (c, { req }) => sameShopByRequest(c, req) && (create ? await create(c, req) : true),
  update: async (c, { id, res, req }) => sameShopByResource(c, res) && req.shopId === res.shopId && (update ? await update(c, res, req, id) : true),
  delete: async (c, { res }) => sameShopByResource(c, res) && (del ? await del(c, res) : isOwnerOfShop(c, res.shopId)),
});
const appendOnly = (view = "viewProducts") => ({
  read: async (c, args) => memberCanViewShopDoc(c, args.res, view),
  create: async (c, { req }) => sameShopByRequest(c, req),
  update: deny,
  delete: deny,
});
// Partner money is private to the owner: staff can neither read nor write it.
const ownerOnly = () => ({
  read: async (c, { res }) => sameShopByResource(c, res) && isOwnerOfShop(c, res.shopId),
  create: async (c, { req }) => sameShopByRequest(c, req) && isOwnerOfShop(c, req.shopId),
  update: async (c, { res, req }) => sameShopByResource(c, res) && req.shopId === res.shopId && isOwnerOfShop(c, res.shopId),
  delete: async (c, { res }) => sameShopByResource(c, res) && isOwnerOfShop(c, res.shopId),
});
const ownerDelete = (c, res) => isOwnerOfShop(c, res.shopId);
const ownerOrCreator = async (c, res) => (await isOwnerOfShop(c, res.shopId)) || res.createdBy === c.uid;
const memberDelete = (perm) => async (c, res) => (await isOwnerOfShop(c, res.shopId)) || memberMay(c, res.shopId, perm);

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
    read: async (c, { id, list, res }) => {
      if (list) return isShopMember(c, id);
      const shopId = res?.shopId ?? id;
      return isShopMember(c, shopId);
    },
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

  orders: shopScoped({
    view: "sendOrder",
    create: async (c, req) => req.createdBy === c.uid,
    update: async (c, res, req) => {
      if (req.createdBy !== undefined && req.createdBy !== res.createdBy) return false;
      if (await isOwnerOfShop(c, res.shopId)) return true;
      return res.createdBy === c.uid;
    },
  }),
  companies: shopScoped({
    view: ["sendOrder", "manageCompanies"],
    create: async (c, req) => await memberMay(c, req.shopId, "manageCompanies"),
    update: async (c, res) => await memberMay(c, res.shopId, "manageCompanies"),
    del: async (c, res) => (await isOwnerOfShop(c, res.shopId)) || memberMay(c, res.shopId, "deleteCompanies"),
  }),

  products: {
    read: async (c, { res }) => memberCanViewShopDoc(c, res, "viewProducts"),
    create: async (c, { req }) => (await canManageProducts(c, req.shopId)) && productCatalogWriteAllowed(c, req.shopId, req),
    update: async (c, { res, req }) => (await canManageProducts(c, res.shopId)) && productCatalogWriteAllowed(c, res.shopId, req),
    delete: async (c, { res }) => ((await isOwnerOfShop(c, res.shopId)) || (await memberMay(c, res.shopId, "deleteProducts"))) && (await legacyOrMaintenanceDeleteAllowed(c, res.shopId)),
  },

  productMaintenance: {
    read: async (c, { id }) => isShopMember(c, id),
    create: async (c, { id, req }) => (await isOwnerOfShop(c, id)) && req.shopId === id,
    update: async (c, { id, req }) => (await isOwnerOfShop(c, id)) && req.shopId === id,
    delete: deny,
  },

  inventory: shopScoped({ view: "viewProducts" }),
  stockMovements: appendOnly(),
  stockBalances: shopScoped({ view: "viewProducts" }),
  inventory_movements: appendOnly(),
  stock_balances: shopScoped({ view: "viewProducts" }),
  stock_ledger: appendOnly(),
  purchases: shopScoped({ view: withReportRead("managePurchase") }),
  sales: shopScoped({ view: withReportRead("manageSales") }),
  customers: shopScoped({
    view: withReportRead("manageCustomers"),
    create: async (c, req) => await memberMay(c, req.shopId, "manageCustomers"),
    update: async (c, res) => await memberMay(c, res.shopId, "manageCustomers"),
    del: memberDelete("deleteCustomers"),
  }),
  suppliers: shopScoped({ view: withReportRead(["viewVendors", "managePurchase"]), del: ownerDelete }),
  vendors: shopScoped({
    view: withReportRead(["viewVendors", "managePurchase"]),
    create: async (c, req) => (await memberMay(c, req.shopId, "manageVendors")) || (await memberMay(c, req.shopId, "managePurchase")),
    update: async (c, res) => memberMay(c, res.shopId, "manageVendors"),
    del: async (c, res) => (await isOwnerOfShop(c, res.shopId)) || memberMay(c, res.shopId, "deleteVendors"),
  }),

  // Returns and stock adjustments: created by staff with the permission; only the owner or the creator may cancel.
  // Create/update check invoice link + per-line qty ≤ remaining (billed minus other live returns).
  salesReturns: shopScoped({
    view: withReportRead("manageReturns"),
    create: async (c, req) => req.createdBy === c.uid && (await memberMay(c, req.shopId, "manageReturns"))
      && (await validReturnDoc(c, req, "salesInvoices", "salesReturns")),
    update: async (c, res, req, id) => ((await isOwnerOfShop(c, res.shopId))
      || (res.createdBy === c.uid && req.createdBy === res.createdBy && (await memberMay(c, res.shopId, "manageReturns"))))
      && (req.status === "cancelled" || (await validReturnDoc(c, req, "salesInvoices", "salesReturns", id))),
    del: memberDelete("deleteReturns"),
  }),
  purchaseReturns: shopScoped({
    view: withReportRead("manageReturns"),
    create: async (c, req) => req.createdBy === c.uid && (await memberMay(c, req.shopId, "manageReturns"))
      && (await validReturnDoc(c, req, "purchaseInvoices", "purchaseReturns")),
    update: async (c, res, req, id) => ((await isOwnerOfShop(c, res.shopId))
      || (res.createdBy === c.uid && req.createdBy === res.createdBy && (await memberMay(c, res.shopId, "manageReturns"))))
      && (req.status === "cancelled" || (await validReturnDoc(c, req, "purchaseInvoices", "purchaseReturns", id))),
    del: memberDelete("deleteReturns"),
  }),
  // Journal and contra vouchers are a record only; they never touch bills or stock.
  accountVouchers: shopScoped({
    view: withReportRead("accountVouchers"),
    create: async (c, req) => req.createdBy === c.uid && (await memberMay(c, req.shopId, "accountVouchers")),
    update: async (c, res, req) => (await isOwnerOfShop(c, res.shopId))
      || (res.createdBy === c.uid && req.createdBy === res.createdBy && (await memberMay(c, res.shopId, "accountVouchers"))),
    del: memberDelete("deleteVouchers"),
  }),
  stockAdjustments: shopScoped({
    view: "stockAdjust",
    create: async (c, req) => req.createdBy === c.uid && (await memberMay(c, req.shopId, "stockAdjust")),
    update: async (c, res, req) => (await isOwnerOfShop(c, res.shopId))
      || (res.createdBy === c.uid && req.createdBy === res.createdBy && (await memberMay(c, res.shopId, "stockAdjust"))),
    del: memberDelete("deleteStock"),
  }),
  auditLogs: {
    read: async (c, { res }) => sameShopByResource(c, res) && ((await isOwnerOfShop(c, res.shopId)) || (await memberMay(c, res.shopId, "viewAuditLog"))),
    create: async (c, { req }) => sameShopByRequest(c, req) && req.byUid === c.uid,
    update: deny,
    delete: deny,
  },
  masterLists: shopScoped({
    view: "viewProducts",
    create: async (c, req) => canManageProducts(c, req.shopId),
    update: async (c, res) => canManageProducts(c, res.shopId),
    del: deny,
  }),

  purchaseInvoices: shopScoped({
    // Security Cheque's read-only invoice-link/AP picker also needs this, without granting it managePurchase.
    view: withReportRead(["managePurchase", "manageSecurityCheques"]),
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
      || memberPaymentUpdate(c, res, req)
      || ((await memberMay(c, res.shopId, "deletePurchase")) && req.shopId === res.shopId && req.status === "cancelled"),
    del: async (c, res) => (await isOwnerOfShop(c, res.shopId))
      || ((await memberMay(c, res.shopId, "deletePurchase")) && ["draft", "cancelled"].includes(res.status)),
  }),

  purchasePayments: shopScoped({
    view: withReportRead("vendorPayments"),
    create: async (c, req) => req.createdBy === c.uid && validVoucher(req, "paymentNo", "vendorName"),
    update: async (c, res, req) => (await isOwnerOfShop(c, res.shopId)) || voucherMemberUpdate(c, res, req, "vendorPayments"),
    del: async (c, res) => (await memberDelete("deletePayments")(c, res))
      || (res.method === "cheque" && (res.status === "cancelled" || res.chequeStatus === "bounced") && (await memberMay(c, res.shopId, "deletePdc"))),
  }),

  salesReceipts: shopScoped({
    view: withReportRead("manageSales"),
    create: async (c, req) => req.createdBy === c.uid && validVoucher(req, "receiptNo", "customerName"),
    update: async (c, res, req) => (await isOwnerOfShop(c, res.shopId)) || voucherMemberUpdate(c, res, req, "cancelInvoices"),
    del: async (c, res) => (await memberDelete("cancelInvoices")(c, res))
      || (res.method === "cheque" && (res.status === "cancelled" || res.chequeStatus === "bounced") && (await memberMay(c, res.shopId, "deletePdc"))),
  }),

  supplierPayments: shopScoped({
    view: withReportRead("vendorPayments"),
    create: async (c, req) => req.createdBy === c.uid && validVoucher(req, "paymentNo", "supplierName"),
    update: async (c, res, req) => (await isOwnerOfShop(c, res.shopId)) || voucherMemberUpdate(c, res, req, "vendorPayments"),
    del: memberDelete("deletePayments"),
  }),
  chequeHandovers: shopScoped({ view: "vendorPayments", del: ownerDelete }),

  // Cheques held as collateral (vendor or customer, either direction) — separate register from
  // PDC/accountVouchers, never references a payment/sales voucher. Returning/presenting the cheque
  // or approving a closure request is owner-only; staff with the permission may create/edit/request.
  securityCheques: shopScoped({
    view: "manageSecurityCheques",
    create: async (c, req) => memberMay(c, req.shopId, "manageSecurityCheques"),
    update: async (c, res, req) => {
      if (!(await memberMay(c, res.shopId, "manageSecurityCheques"))) return false;
      const ownerFields = ["status", "closureApproved", "closureApprovedAt", "closureApprovedBy", "returnedAt", "returnedBy", "presentedAt", "presentedBy"];
      const touchesOwnerFields = changedKeys(res, req).some((k) => ownerFields.includes(k));
      return !touchesOwnerFields || (await isOwnerOfShop(c, res.shopId));
    },
    del: memberDelete("deleteSecurityCheques"),
  }),
  securityChequeDocs: shopScoped({ view: "manageSecurityCheques", del: ownerDelete }),

  salesInvoices: shopScoped({
    // Security Cheque's read-only invoice-link/AR picker also needs this, without granting it manageSales.
    view: withReportRead(["manageSales", "manageSecurityCheques"]),
    create: async (c, req) => req.createdBy === c.uid && (await memberMay(c, req.shopId, "manageSales")),
    update: async (c, res, req) => (await isOwnerOfShop(c, res.shopId))
      || (await salesCreatorUpdate(c, res, req))
      || memberPaymentUpdate(c, res, req),
    del: async (c, res) => (await isOwnerOfShop(c, res.shopId)) || (res.createdBy === c.uid && res.status === "draft"),
  }),

  quotations: shopScoped({
    view: withReportRead("manageSales"),
    create: async (c, req) => req.createdBy === c.uid && (await memberMay(c, req.shopId, "manageSales")),
    update: async (c, res, req) => (await ownerOrCreator(c, res)) || memberConversionUpdate(c, res, req),
    del: ownerOrCreator,
  }),

  deliveryNotes: shopScoped({
    view: withReportRead("manageSales"),
    create: async (c, req) => (req.createdBy === c.uid || (await isOwnerOfShop(c, req.shopId))) && (await memberMay(c, req.shopId, "manageSales")),
    update: async (c, res, req) => (await ownerOrCreator(c, res)) || memberConversionUpdate(c, res, req),
    del: ownerOrCreator,
  }),

  expenses: shopScoped({
    view: withReportRead("manageExpenses"),
    create: async (c, req) => await memberMay(c, req.shopId, "manageExpenses"),
    update: async (c, res) => await memberMay(c, res.shopId, "manageExpenses"),
    del: memberDelete("deleteExpenses"),
  }),
  settings: { ...ownerOnly(), delete: deny },

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
    update: async (c, res, req) => {
      const receiverUpdate = (await canReceiveBranchTransfer(c, res.shopId))
        && isBranchTransferReceiver(c, res)
        && req.shopId === res.shopId
        && req.branchId === res.branchId
        && onlyChanged(res, req, [
          "status", "receipts", "purchaseInvoiceIds", "invoiceStatus", "receiptSummary", "receivedAt", "receivedBy",
          "receivedByName", "updatedAt", "updatedBy", "updatedByName", "_offline_updated_at", "_cloud_collection",
          "_cloud_document_id", "_cloud_synced_at", "_cloud_sync_status",
        ]);
      if (receiverUpdate) return true;
      if (await isOwnerOfShop(c, res.shopId)) return req.shopId === res.shopId;
      if (!(await canSendBranchTransfer(c, res.shopId))) return false;
      if (["partially_received", "discrepancy", "received"].includes(res.status)) return false;
      return req.shopId === res.shopId;
    },
    del: async (c, res) => ((await isOwnerOfShop(c, res.shopId)) || (await memberMay(c, res.shopId, "deleteBranch"))) && ["draft", "cancelled"].includes(res.status),
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
    view: withReportRead("managePurchase"),
    create: async (c, req) => req.createdBy === c.uid && (await memberMay(c, req.shopId, "managePurchase")),
    update: async (c, res, req) => (await ownerOrCreator(c, res)) || ((await memberMay(c, res.shopId, "managePurchase")) && orderLinkUpdate(c, res, req)),
    del: memberDelete("deletePurchase"),
  }),
  salesOrders: shopScoped({
    view: withReportRead("manageSales"),
    create: async (c, req) => req.createdBy === c.uid && (await memberMay(c, req.shopId, "manageSales")),
    update: async (c, res, req) => (await ownerOrCreator(c, res)) || ((await memberMay(c, res.shopId, "manageSales")) && orderLinkUpdate(c, res, req)),
    del: ownerOrCreator,
  }),
  goodsReceipts: shopScoped({
    view: withReportRead("managePurchase"),
    create: async (c, req) => req.createdBy === c.uid && (await memberMay(c, req.shopId, "managePurchase")),
    update: async (c, res, req) => (await isOwnerOfShop(c, res.shopId))
      || ((await memberMay(c, res.shopId, "managePurchase")) && (
        (res.createdBy === c.uid && req.createdBy === res.createdBy && res.status !== "invoiced") || orderLinkUpdate(c, res, req))),
    del: memberDelete("deletePurchase"),
  }),

  employees: shopScoped({
    view: "manageEmployees",
    create: async (c, req) => memberMay(c, req.shopId, "manageEmployees"),
    update: async (c, res) => memberMay(c, res.shopId, "manageEmployees"),
    del: memberDelete("deleteEmployees"),
  }),
  employeeDocs: shopScoped({
    view: "manageEmployees",
    create: async (c, req) => memberMay(c, req.shopId, "manageEmployees"),
    update: async (c, res) => memberMay(c, res.shopId, "manageEmployees"),
    del: async (c, res) => memberMay(c, res.shopId, "manageEmployees"),
  }),
  attendance: shopScoped({
    view: "manageEmployees",
    create: async (c, req) => memberMay(c, req.shopId, "manageEmployees"),
    update: async (c, res) => memberMay(c, res.shopId, "manageEmployees"),
    del: memberDelete("deleteEmployees"),
  }),
  bankReconciliations: shopScoped({
    view: withReportRead("bankReconcile"),
    create: async (c, req) => memberMay(c, req.shopId, "bankReconcile"),
    update: async (c, res) => memberMay(c, res.shopId, "bankReconcile"),
    del: memberDelete("deleteBankRec"),
  }),
  jobOrders: shopScoped({
    view: "manageJobs",
    create: async (c, req) => req.createdBy === c.uid && (await memberMay(c, req.shopId, "manageJobs")),
    update: async (c, res) => memberMay(c, res.shopId, "manageJobs"),
    del: memberDelete("deleteJobs"),
  }),
  partners: shopScoped({
    view: ["viewPartners", "managePartners"],
    create: async (c, req) => memberMay(c, req.shopId, "managePartners"),
    update: async (c, res) => memberMay(c, res.shopId, "managePartners"),
    del: async (c, res) => (await isOwnerOfShop(c, res.shopId)) || memberMay(c, res.shopId, "deletePartners"),
  }),
  partnerEntries: shopScoped({
    view: ["viewPartners", "managePartners"],
    create: async (c, req) => memberMay(c, req.shopId, "managePartners"),
    update: async (c, res) => memberMay(c, res.shopId, "managePartners"),
    del: ownerDelete,
  }),
  partnerDocs: shopScoped({
    view: ["viewPartners", "managePartners"],
    create: async (c, req) => memberMay(c, req.shopId, "managePartners"),
    update: async (c, res) => memberMay(c, res.shopId, "managePartners"),
    del: async (c, res) => memberMay(c, res.shopId, "managePartners"),
  }),
  taxPayments: shopScoped({
    view: "viewTax",
    create: async (c, req) => memberMay(c, req.shopId, "viewTax"),
    update: async (c, res) => memberMay(c, res.shopId, "viewTax"),
    del: async (c, res) => memberMay(c, res.shopId, "viewTax"),
  }),
  // Private reminders are seen by their writer only; anyone they are meant for may tick them off.
  reminders: {
    read: async (c, { res }) => sameShopByResource(c, res) && (!res.private || res.createdBy === c.uid),
    create: async (c, { req }) => sameShopByRequest(c, req) && req.createdBy === c.uid,
    update: async (c, { res, req }) => sameShopByResource(c, res) && req.shopId === res.shopId && req.createdBy === res.createdBy
      && (!res.private || res.createdBy === c.uid)
      && (res.createdBy === c.uid || (await isOwnerOfShop(c, res.shopId))
        || ((!res.assignedTo || res.assignedTo === c.uid) && onlyChanged(res, req, REMINDER_DONE_FIELDS))),
    delete: async (c, { res }) => sameShopByResource(c, res) && (res.createdBy === c.uid || (!res.private && (await isOwnerOfShop(c, res.shopId)))),
  },
};

async function periodOpen(ctx, op, collection, { res, req } = {}) {
  if (op === "read" || !LOCKED_COLLECTIONS[collection]) return true;
  const shopId = res?.shopId ?? req?.shopId;
  if (!has(shopId)) return true;
  const shop = await ctx.get("shops", shopId);
  const lockDate = dayOf(shop?.periodLock?.lockDate);
  return !periodLockBlocks({ collection, op, before: res || null, after: op === "delete" ? null : req || null, lockDate });
}

export async function allowed(ctx, op, collection, args) {
  const rule = RULES[collection]?.[op];
  if (!rule) return false;
  try {
    if (!(await periodOpen(ctx, op, collection, args))) return false;
    return (await rule(ctx, args)) === true;
  } catch {
    return false;
  }
}

// Collections whose read rule does not depend on shop membership; listing
// them without a shopId filter is allowed (results are still rule-filtered).
export const UNSCOPED_LIST_COLLECTIONS = new Set(["shops", "inviteCodes", "staffLoginIndex", "users", "productMaintenance"]);
