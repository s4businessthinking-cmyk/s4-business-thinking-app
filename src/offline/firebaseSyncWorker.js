import { doc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase-config";
import {
  getPendingSyncQueue,
  markSyncDone,
  markSyncFailed,
  getOfflineStatus,
} from "./sqliteDb";

let syncRunning = false;

function isOnline() {
  return typeof navigator !== "undefined" ? navigator.onLine : false;
}

function cleanForFirestore(value) {
  if (value === undefined) return null;
  if (value === null) return null;

  if (Array.isArray(value)) {
    return value.map((item) => cleanForFirestore(item));
  }

  if (typeof value === "object") {
    const cleaned = {};
    for (const [key, val] of Object.entries(value)) {
      cleaned[key] = cleanForFirestore(val);
    }
    return cleaned;
  }

  return value;
}

function getFirebaseDocRef(collectionName, documentId) {
  if (!db) {
    throw new Error("Firebase Firestore is not ready.");
  }

  if (!collectionName || !documentId) {
    throw new Error("Missing collectionName or documentId for sync.");
  }

  return doc(db, collectionName, documentId);
}

async function syncOneQueueItem(item) {
  const operation = String(item.operation || "").toUpperCase();
  const payload = item.payload || {};
  const collectionName = payload.collectionName || item.collection_name;
  const documentId = payload.documentId || item.document_id;

  const ref = getFirebaseDocRef(collectionName, documentId);

  if (operation === "DELETE") {
    await deleteDoc(ref);
    return { ok: true, operation, collectionName, documentId };
  }

  const data = cleanForFirestore(payload.data || {});

  await setDoc(
    ref,
    {
      ...data,
      id: documentId,
      _cloud_collection: collectionName,
      _cloud_document_id: documentId,
      _cloud_synced_at: serverTimestamp(),
      _cloud_sync_status: "SYNCED",
    },
    { merge: true }
  );

  return { ok: true, operation, collectionName, documentId };
}

export async function syncPendingQueueToFirebase() {
  if (syncRunning) {
    return {
      ok: false,
      skipped: true,
      reason: "Sync already running",
    };
  }

  if (!isOnline()) {
    return {
      ok: false,
      skipped: true,
      reason: "Offline",
    };
  }

  syncRunning = true;

  const result = {
    ok: true,
    startedAt: new Date().toISOString(),
    total: 0,
    done: 0,
    failed: 0,
    errors: [],
  };

  try {
    const queue = await getPendingSyncQueue();
    result.total = queue.length;

    for (const item of queue) {
      try {
        await syncOneQueueItem(item);
        await markSyncDone(item.id);
        result.done += 1;
      } catch (error) {
        const message = error?.message || String(error);
        await markSyncFailed(item.id, message);
        result.failed += 1;
        result.errors.push({
          queueId: item.id,
          collectionName: item.collection_name,
          documentId: item.document_id,
          error: message,
        });
      }
    }

    result.status = await getOfflineStatus();
    result.finishedAt = new Date().toISOString();

    return result;
  } finally {
    syncRunning = false;
  }
}

export function startAutoFirebaseSync(options = {}) {
  const intervalMs = Number(options.intervalMs || 30000);

  const run = () => {
    syncPendingQueueToFirebase()
      .then((result) => {
        if (result?.total || result?.done || result?.failed) {
          console.log("[S4 Sync] Firebase sync result", result);
        }
      })
      .catch((error) => {
        console.warn("[S4 Sync] Firebase sync failed", error);
      });
  };

  window.addEventListener("online", run);

  const timer = window.setInterval(() => {
    if (isOnline()) run();
  }, intervalMs);

  if (isOnline()) {
    window.setTimeout(run, 3000);
  }

  return {
    ok: true,
    intervalMs,
    stop: () => {
      window.removeEventListener("online", run);
      window.clearInterval(timer);
    },
  };
}