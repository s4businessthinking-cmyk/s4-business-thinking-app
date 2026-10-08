import { v4 as uuidv4 } from "uuid";
import {
  saveLocalRecord,
  deleteLocalRecord,
  getLocalRecord,
  getLocalRecords,
  enqueueSync,
  getOfflineStatus,

  cacheCloudRecord,
  cacheCloudRecords,
  clearLocalCollection,
  clearLocalCollectionForShop,
  purgeLocalRecord,
  bulkEnqueueUpsert,
  getDirtyLocalRecords,
  purgeCleanLocalRecords,
} from "./sqliteDb";
import { LOCKED_COLLECTIONS, activePeriodLock, assertPeriodOpen } from "../accounts/periodLock.js";

function nowIso() {
  return new Date().toISOString();
}

function safeData(data) {
  return {
    ...(data || {}),
    _offline_updated_at: nowIso(),
  };
}

export async function offlineCreate(collectionName, data = {}) {
  const documentId = data.id || data.uid || data.docId || uuidv4();

  const record = safeData({
    ...data,
    id: documentId,
    _offline_created_at: data._offline_created_at || nowIso(),
  });

  if (activePeriodLock() && LOCKED_COLLECTIONS[collectionName]) {
    const existing = await offlineGetById(collectionName, documentId);
    assertPeriodOpen(collectionName, existing?.data ? "update" : "create", existing?.data || null, record);
  }

  await saveLocalRecord(collectionName, documentId, record, { skipPersist: true });

  const syncResult = await enqueueSync(collectionName, documentId, "CREATE", {
    collectionName,
    documentId,
    data: record,
  });

  if (!syncResult?.ok) {
    console.error(
      `[S4 Offline] Failed to enqueue sync for CREATE: ${collectionName}/${documentId}`,
      syncResult
    );
    throw new Error(
      `Failed to queue ${collectionName} for sync: ${syncResult?.error || "unknown error"}`
    );
  }

  return {
    ok: true,
    mode: "offline-first",
    operation: "CREATE",
    collectionName,
    documentId,
    data: record,
  };
}

export async function offlineUpdate(collectionName, documentId, patch = {}) {
  const existing = await offlineGetById(collectionName, documentId);
  const stamp = nowIso();

  const record = safeData({
    ...(existing?.data || {}),
    ...patch,
    id: documentId,
    _offline_updated_at: stamp,
  });

  assertPeriodOpen(collectionName, "update", existing?.data || null, record);

  await saveLocalRecord(collectionName, documentId, record, { skipPersist: true });

  const syncResult = await enqueueSync(collectionName, documentId, "UPDATE", {
    collectionName,
    documentId,
    data: { ...patch, id: documentId, _offline_updated_at: stamp },
  });

  if (!syncResult?.ok) {
    console.error(
      `[S4 Offline] Failed to enqueue sync for UPDATE: ${collectionName}/${documentId}`,
      syncResult
    );
    throw new Error(
      `Failed to queue ${collectionName} for sync: ${syncResult?.error || "unknown error"}`
    );
  }

  return {
    ok: true,
    mode: "offline-first",
    operation: "UPDATE",
    collectionName,
    documentId,
    data: record,
  };
}

// Like offlineUpdate, but only the patched fields are uploaded (merged on the server), so a stale
// local copy can never overwrite fields that another device changed meanwhile.
// `base` is the caller's copy of the document, used locally when it is not cached on this device.
export async function offlinePatch(collectionName, documentId, patch = {}, base = null) {
  const existing = await offlineGetById(collectionName, documentId);
  const stamp = nowIso();
  const record = { ...(existing?.data || base || {}), ...patch, id: documentId, _offline_updated_at: stamp };
  assertPeriodOpen(collectionName, "update", existing?.data || base || null, record);

  await saveLocalRecord(collectionName, documentId, record, { skipPersist: true });

  const syncResult = await enqueueSync(collectionName, documentId, "UPDATE", {
    collectionName,
    documentId,
    data: { ...patch, id: documentId, _offline_updated_at: stamp },
  });

  if (!syncResult?.ok) {
    throw new Error(
      `Failed to queue ${collectionName} for sync: ${syncResult?.error || "unknown error"}`
    );
  }

  return { ok: true, mode: "offline-first", operation: "UPDATE", collectionName, documentId, data: record };
}

export async function offlineUpsert(collectionName, documentId, data = {}) {
  const existing = await offlineGetById(collectionName, documentId);

  const record = safeData({
    ...(existing?.data || {}),
    ...data,
    id: documentId,
    _offline_created_at:
      existing?.data?._offline_created_at || data._offline_created_at || nowIso(),
  });

  assertPeriodOpen(collectionName, existing?.data ? "update" : "create", existing?.data || null, record);

  await saveLocalRecord(collectionName, documentId, record, { skipPersist: true });

  const syncResult = await enqueueSync(collectionName, documentId, "UPSERT", {
    collectionName,
    documentId,
    data: record,
  });

  if (!syncResult?.ok) {
    console.error(
      `[S4 Offline] Failed to enqueue sync for UPSERT: ${collectionName}/${documentId}`,
      syncResult
    );
    throw new Error(
      `Failed to queue ${collectionName} for sync: ${syncResult?.error || "unknown error"}`
    );
  }

  return {
    ok: true,
    mode: "offline-first",
    operation: "UPSERT",
    collectionName,
    documentId,
    data: record,
  };
}

export async function offlineRemove(collectionName, documentId) {
  if (activePeriodLock() && LOCKED_COLLECTIONS[collectionName]) {
    const existing = await offlineGetById(collectionName, documentId);
    assertPeriodOpen(collectionName, "delete", existing?.data || null, null);
  }

  await deleteLocalRecord(collectionName, documentId, { skipPersist: true });

  const syncResult = await enqueueSync(collectionName, documentId, "DELETE", {
    collectionName,
    documentId,
  });

  if (!syncResult?.ok) {
    console.error(
      `[S4 Offline] Failed to enqueue sync for DELETE: ${collectionName}/${documentId}`,
      syncResult
    );
    throw new Error(
      `Failed to queue ${collectionName} for sync: ${syncResult?.error || "unknown error"}`
    );
  }

  return {
    ok: true,
    mode: "offline-first",
    operation: "DELETE",
    collectionName,
    documentId,
  };
}

export async function offlineList(collectionName) {
  const records = await getLocalRecords(collectionName);

  return {
    ok: true,
    mode: "offline-first",
    collectionName,
    count: records.length,
    records,
  };
}

// Many records in one local transaction + one database write (imports).
export async function offlineBulkUpsert(collectionName, records = []) {
  return bulkEnqueueUpsert(
    collectionName,
    records.map((data) => ({ documentId: data.id, data: safeData(data) }))
  );
}

export async function offlineGetById(collectionName, documentId) {
  return getLocalRecord(collectionName, documentId);
}

export async function offlineSearch(collectionName, keyword = "") {
  const result = await offlineList(collectionName);
  const q = String(keyword || "").toLowerCase().trim();

  if (!q) return result;

  const records = result.records.filter((item) => {
    const text = JSON.stringify(item.data || {}).toLowerCase();
    return text.includes(q);
  });

  return {
    ok: true,
    mode: "offline-first",
    collectionName,
    keyword,
    count: records.length,
    records,
  };
}

export async function offlineEngineStatus() {
  return getOfflineStatus();
}

export async function offlineCacheCloudRecord(collectionName, documentId, data = {}) {
  return cacheCloudRecord(collectionName, documentId, data);
}

export async function offlineCacheCloudRecords(collectionName, records = []) {
  return cacheCloudRecords(collectionName, records);
}

export async function offlineClearCollection(collectionName) {
  return clearLocalCollection(collectionName);
}

export async function offlineClearShopCollection(collectionName, shopId) {
  return clearLocalCollectionForShop(collectionName, shopId);
}

export async function offlineDirtyRecords(collectionName) {
  return getDirtyLocalRecords(collectionName);
}

export async function offlinePurgeCleanLocal(collectionName, documentIds = []) {
  return purgeCleanLocalRecords(collectionName, documentIds);
}

export async function offlinePurgeLocal(collectionName, documentId) {
  return purgeLocalRecord(collectionName, documentId);
}
