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
import {
  getOfflineStatus,
  getLocalRecords,
  getFailingSyncGroups,
  bulkEnqueueUpsert,
} from "./sqliteDb";

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
      // A local record with NO shopId tag at all is not "some other shop's
      // data" — a device's local SQLite only ever holds one shop's records —
      // it's almost always a record written before shopId was consistently
      // stamped (an older bulk import, a legacy migration, etc). Treat it as
      // this shop's own record instead of silently dropping it from every
      // upload forever. Only a record explicitly tagged for a DIFFERENT shop
      // is excluded.
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

  try {
    const localProducts = await getLocalRecords("products");
    const shopProductCount = localProducts.filter((row) => {
      const recordShopId = String(row.data?.shopId || "").trim();
      return recordShopId === String(shopId) && !row.data?.deleted;
    }).length;
    if (shopProductCount === 0) return true;
  } catch {
    // If local DB check fails, still try a first-time / stale pull below.
  }

  const pulledAt = getShopCloudPulledAt(shopId);
  if (!pulledAt) return true;

  const ageMs = Date.now() - new Date(pulledAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return true;
  // Refresh shop catalog periodically so salesman/PC keeps local SQLite warm.
  if (ageMs > 6 * 60 * 60 * 1000) return true;

  return false;
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

  const totalDocs = results.reduce((sum, row) => sum + Number(row.count || 0), 0);
  const failed = results.filter((row) => !row.ok).length;

  if (failed === 0) {
    markShopCloudPulled(shopId);
  }

  return {
    ok: failed === 0,
    partial: failed > 0 && failed < results.length,
    results,
    data,
    totalDocs,
    pulledAt: failed === 0 ? new Date().toISOString() : getShopCloudPulledAt(shopId),
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

/**
 * Repair/backfill pass: for every SHOP_PULL_COLLECTIONS collection, compares
 * this device's local SQLite records against what actually exists in
 * Firestore for this shop, and re-queues (with the correct shopId stamped on)
 * any local record that Firestore doesn't have — regardless of whether its
 * local `dirty` flag or the sync queue currently think it's already synced.
 *
 * This exists because a record can end up permanently un-uploadable without
 * ever showing up as "pending": e.g. a record whose stored data is missing
 * (or has a stale/mismatched) shopId used to be silently excluded from
 * uploadPendingShopChanges() by filterRecordsForShop() forever, or a queue
 * item that kept failing could fall out of the pending count after enough
 * retries. Re-queuing here uses bulkEnqueueUpsert() — the same local_records
 * + sync_queue writes every ordinary edit produces, just batched to a single
 * persist per collection instead of one per record, since this can touch
 * thousands of rows in one pass.
 */
export async function reconcileShopWithCloud(shopId) {
  if (!shopId) return { ok: false, reason: "SHOP_ID_REQUIRED" };
  if (!db) return { ok: false, reason: "FIREBASE_NOT_READY" };

  const blockReason = getCloudSyncBlockReason();
  if (blockReason) {
    return { ok: false, skipped: true, reason: blockReason };
  }

  const results = [];
  let totalMissing = 0;
  let totalRequeued = 0;

  for (const collectionName of SHOP_PULL_COLLECTIONS) {
    try {
      const [localRecords, cloudSnap] = await Promise.all([
        getLocalRecords(collectionName),
        getDocs(query(collection(db, collectionName), where("shopId", "==", shopId))),
      ]);

      const cloudIds = new Set(cloudSnap.docs.map((entry) => String(entry.id)));
      const shopLocalRows = filterRecordsForShop(collectionName, shopId, localRecords);
      const missingRows = shopLocalRows.filter(
        (row) => !cloudIds.has(String(row.document_id))
      );

      const { queued: requeued } = await bulkEnqueueUpsert(
        collectionName,
        missingRows.map((row) => ({
          documentId: row.document_id,
          data: { ...(row.data || {}), shopId },
        }))
      );

      totalMissing += missingRows.length;
      totalRequeued += requeued;
      results.push({
        collection: collectionName,
        localCount: shopLocalRows.length,
        cloudCount: cloudIds.size,
        missingCount: missingRows.length,
        requeued,
        ok: true,
      });
    } catch (error) {
      results.push({
        collection: collectionName,
        ok: false,
        error: error?.message || String(error),
      });
    }
  }

  let uploadResult = null;
  if (totalRequeued > 0) {
    uploadResult = await syncPendingQueueToFirebase();
  }

  return {
    ok: true,
    totalMissing,
    totalRequeued,
    results,
    uploadResult,
  };
}

export async function getSyncDashboardStatus() {
  const status = await getOfflineStatus();
  return {
    ...status,
    online: isOnline(),
  };
}

/**
 * The real diagnostic behind the "repeatedly failing" count: groups
 * permanently-retrying sync_queue rows by their actual last_error +
 * collection, with a sample document id per group, so the owner (or support)
 * can see e.g. "23 products failing with INVALID_DOCUMENT_ID: ..." instead
 * of a single opaque number.
 */
export async function getFailingSyncSamples(limit = 20) {
  return getFailingSyncGroups(limit);
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
    salesInvoices: [...(data.salesInvoices || [])].sort(byCreatedDesc),
    purchaseInvoices: [...(data.purchaseInvoices || [])].sort(byCreatedDesc),
    purchasePayments: [...(data.purchasePayments || [])].sort(byCreatedDesc),
    supplierPayments: [...(data.supplierPayments || [])].sort(byCreatedDesc),
    team: [...(data.users || [])].map((row) => ({ ...row, id: row.id })),
    shop: data.shop || null,
    inviteCodes: data.inviteCodes || [],
  };
}
