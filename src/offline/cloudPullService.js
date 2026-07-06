import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db, auth } from "../firebase-config";
import { offlineCacheCloudRecords } from "./offlineRepository";
import { saveCachedShop } from "./shopService";
import { addLocalInviteCode } from "../auth/localAuthBootstrap";
import {
  syncPendingQueueToFirebase,
  uploadLocalRecordsBatch,
} from "./firebaseSyncWorker";
import { getOfflineStatus, getLocalRecords } from "./sqliteDb";

const CLOUD_PULL_META_PREFIX = "s4-cloud-pull-v1";

export const SHOP_PULL_COLLECTIONS = [
  "products",
  "companies",
  "customers",
  "vendors",
  "orders",
  "purchaseInvoices",
  "purchasePayments",
  "supplierPayments",
  "salesInvoices",
  "users",
];

function isOnline() {
  return typeof navigator !== "undefined" ? navigator.onLine : false;
}

export function getCloudSyncBlockReason() {
  if (!db) return "FIREBASE_NOT_READY";
  if (!isOnline()) return "OFFLINE";
  if (!auth?.currentUser) return "FIREBASE_AUTH_REQUIRED";
  return null;
}

function assertCloudSyncReady() {
  const reason = getCloudSyncBlockReason();
  if (!reason) return;

  const error = new Error(reason);
  error.code = reason;
  throw error;
}

function filterRecordsForShop(collectionName, shopId, rows = []) {
  if (!shopId) return [];
  if (collectionName === "shops") {
    return rows.filter((row) => String(row.document_id) === String(shopId));
  }

  return rows
    .filter((row) => {
      const recordShopId = String(row.data?.shopId || "").trim();
      return !recordShopId || recordShopId === String(shopId);
    })
    .map((row) => ({
      ...row,
      data: {
        ...(row.data || {}),
        shopId: row.data?.shopId || shopId,
      },
    }));
}

function cloudPullMetaKey(shopId) {
  return `${CLOUD_PULL_META_PREFIX}:${shopId}`;
}

export function markShopCloudPulled(shopId) {
  if (!shopId || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(cloudPullMetaKey(shopId), new Date().toISOString());
  } catch {}
}

export function getShopCloudPulledAt(shopId) {
  if (!shopId || typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(cloudPullMetaKey(shopId));
  } catch {
    return null;
  }
}

export async function shouldAutoPullShop(shopId) {
  if (!shopId || !isOnline()) return false;
  if (getShopCloudPulledAt(shopId)) return false;

  try {
    const status = await getOfflineStatus();
    if (Number(status?.localRecords || 0) > 12) return false;
  } catch {
    return true;
  }

  return true;
}

function normalizeFirestoreDoc(docSnap) {
  const data = docSnap.data() || {};
  return {
    id: docSnap.id,
    ...data,
    createdAt: data.createdAt?.toDate?.() || data.createdAt || null,
    updatedAt: data.updatedAt?.toDate?.() || data.updatedAt || null,
  };
}

async function pullCollectionByShopId(collectionName, shopId) {
  const snap = await getDocs(
    query(collection(db, collectionName), where("shopId", "==", shopId))
  );

  const docs = snap.docs.map((item) => normalizeFirestoreDoc(item));
  await offlineCacheCloudRecords(collectionName, docs);

  return docs;
}

async function pullShopDocument(shopId) {
  const shopSnap = await getDoc(doc(db, "shops", shopId));
  if (!shopSnap.exists()) return null;

  const shop = { id: shopSnap.id, ...shopSnap.data() };
  await offlineCacheCloudRecords("shops", [shop]);
  saveCachedShop(shopId, shop);
  return shop;
}

async function pullInviteCodes(shopId) {
  const snap = await getDocs(
    query(collection(db, "inviteCodes"), where("shopId", "==", shopId))
  );

  const docs = snap.docs.map((item) => ({
    id: item.id,
    code: item.id,
    ...item.data(),
  }));

  for (const entry of docs) {
    if (!entry.used) {
      addLocalInviteCode(shopId, entry.code || entry.id);
    }
  }

  return docs;
}

export async function pullShopFromCloud(shopId, options = {}) {
  if (!shopId) throw new Error("shopId is required.");
  if (!db) throw new Error("Firebase is not ready.");
  assertCloudSyncReady();
  if (!isOnline()) {
    return { ok: false, reason: "OFFLINE" };
  }

  const results = [];
  const data = {
    shop: null,
    inviteCodes: [],
    products: [],
    companies: [],
    customers: [],
    vendors: [],
    orders: [],
    users: [],
    purchaseInvoices: [],
    purchasePayments: [],
    supplierPayments: [],
    salesInvoices: [],
  };

  try {
    data.shop = await pullShopDocument(shopId);
    results.push({
      collection: "shops",
      count: data.shop ? 1 : 0,
      ok: true,
    });
  } catch (error) {
    results.push({
      collection: "shops",
      count: 0,
      ok: false,
      error: error?.message || String(error),
    });
  }

  try {
    data.inviteCodes = await pullInviteCodes(shopId);
    results.push({
      collection: "inviteCodes",
      count: data.inviteCodes.length,
      ok: true,
    });
  } catch (error) {
    results.push({
      collection: "inviteCodes",
      count: 0,
      ok: false,
      error: error?.message || String(error),
    });
  }

  for (const collectionName of SHOP_PULL_COLLECTIONS) {
    try {
      let docs = await pullCollectionByShopId(collectionName, shopId);

      if (
        collectionName === "orders" &&
        options.filterOrdersForUserId &&
        !options.includeAllOrders
      ) {
        docs = docs.filter(
          (row) => row.createdBy === options.filterOrdersForUserId
        );
      }

      data[collectionName] = docs;
      results.push({
        collection: collectionName,
        count: docs.length,
        ok: true,
      });
    } catch (error) {
      results.push({
        collection: collectionName,
        count: 0,
        ok: false,
        error: error?.message || String(error),
      });
    }
  }

  markShopCloudPulled(shopId);

  const totalDocs = results.reduce((sum, row) => sum + Number(row.count || 0), 0);
  const failed = results.filter((row) => !row.ok).length;

  return {
    ok: failed === 0,
    partial: failed > 0 && failed < results.length,
    results,
    data,
    totalDocs,
    pulledAt: new Date().toISOString(),
  };
}

export async function uploadPendingShopChanges(shopId) {
  if (!shopId) {
    return { ok: false, reason: "SHOP_ID_REQUIRED" };
  }

  const blockReason = getCloudSyncBlockReason();
  if (blockReason) {
    return { ok: false, skipped: true, reason: blockReason };
  }

  const queueResult = await syncPendingQueueToFirebase();
  const collections = ["shops", ...SHOP_PULL_COLLECTIONS];
  const collectionResults = [];
  let totalUploaded = 0;
  let totalFailed = 0;

  for (const collectionName of collections) {
    const rows = filterRecordsForShop(collectionName, shopId, await getLocalRecords(collectionName));
    if (!rows.length) {
      collectionResults.push({
        collection: collectionName,
        uploaded: 0,
        failed: 0,
        skipped: true,
      });
      continue;
    }

    const batchResult = await uploadLocalRecordsBatch(collectionName, rows);
    totalUploaded += batchResult.uploaded;
    totalFailed += batchResult.failed;
    collectionResults.push({
      collection: collectionName,
      ...batchResult,
    });
  }

  const productsUploaded =
    collectionResults.find((row) => row.collection === "products")?.uploaded || 0;

  return {
    ok: totalFailed === 0,
    partial: totalFailed > 0 && totalUploaded > 0,
    skipped: false,
    queue: queueResult,
    collections: collectionResults,
    productsUploaded,
    totalUploaded,
    totalFailed,
    done: totalUploaded,
    total: totalUploaded + totalFailed,
  };
}

export async function getSyncDashboardStatus() {
  const status = await getOfflineStatus();
  return {
    ...status,
    online: isOnline(),
  };
}

export function sortPulledRecords(data) {
  const byName = (field) => (a, b) =>
    String(a?.[field] || "").localeCompare(String(b?.[field] || ""));

  const byCreatedDesc = (a, b) => {
    const av = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt || 0);
    const bv = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt || 0);
    return bv.getTime() - av.getTime();
  };

  return {
    products: [...(data.products || [])].sort(byName("name")),
    companies: [...(data.companies || [])].sort(byName("name")),
    customers: [...(data.customers || [])].sort(byName("customerName")),
    vendors: [...(data.vendors || [])].sort(byName("vendorName")),
    orders: [...(data.orders || [])].sort(byCreatedDesc),
    team: [...(data.users || [])].map((row) => ({ ...row, id: row.id })),
    shop: data.shop || null,
    inviteCodes: data.inviteCodes || [],
  };
}
