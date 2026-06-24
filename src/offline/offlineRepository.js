import { v4 as uuidv4 } from "uuid";
import {
  saveLocalRecord,
  deleteLocalRecord,
  getLocalRecords,
  enqueueSync,
  getOfflineStatus,
} from "./sqliteDb";

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

  await saveLocalRecord(collectionName, documentId, record);

  await enqueueSync(collectionName, documentId, "CREATE", {
    collectionName,
    documentId,
    data: record,
  });

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

  const record = safeData({
    ...(existing?.data || {}),
    ...patch,
    id: documentId,
  });

  await saveLocalRecord(collectionName, documentId, record);

  await enqueueSync(collectionName, documentId, "UPDATE", {
    collectionName,
    documentId,
    data: record,
  });

  return {
    ok: true,
    mode: "offline-first",
    operation: "UPDATE",
    collectionName,
    documentId,
    data: record,
  };
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

  await saveLocalRecord(collectionName, documentId, record);

  await enqueueSync(collectionName, documentId, "UPSERT", {
    collectionName,
    documentId,
    data: record,
  });

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
  await deleteLocalRecord(collectionName, documentId);

  await enqueueSync(collectionName, documentId, "DELETE", {
    collectionName,
    documentId,
  });

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

export async function offlineGetById(collectionName, documentId) {
  const result = await offlineList(collectionName);
  const found = result.records.find((item) => item.document_id === documentId);

  return found || null;
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