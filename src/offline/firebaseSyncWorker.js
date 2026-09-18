import { doc, setDoc, deleteDoc, writeBatch, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase-config";
import {
  getPendingSyncQueue,
  markSyncDone,
  markSyncFailed,
  getOfflineStatus,
  persistOfflineDb,
} from "./sqliteDb";

let syncRunning = false;
const pausedCollections = new Set();

// Firestore hard-caps a batch at 500 writes; stay well under it.
const BATCH_SIZE = 400;
// Pacing between successive batch commits so a large backlog (e.g. a
// multi-thousand-record backfill) doesn't ramp up write rate to a single
// collection too fast. Doubles (capped) after a batch that fails for a
// retryable reason, resets after a clean batch.
const BASE_BATCH_DELAY_MS = 300;
const MAX_BATCH_DELAY_MS = 5000;
const RETRYABLE_ERROR_HINTS = [
  "unavailable",
  "resource-exhausted",
  "deadline-exceeded",
  "network",
  "fetch",
  "aborted",
  "internal",
];

// Firestore document id rules: no "/", not exactly "." or "..", must not
// match __*__ (reserved), and at most 1500 bytes. A legacy record whose id
// violates one of these will otherwise throw a low-level SDK error deep
// inside doc() that's hard to tell apart from a transient network failure —
// this gives it its own clear, specific, greppable reason instead.
function invalidDocumentIdReason(documentId) {
  const value = String(documentId || "");
  if (!value) return "DOCUMENT_ID_MISSING";
  if (value.includes("/")) return `INVALID_DOCUMENT_ID: "${value}" contains "/"`;
  if (value === "." || value === "..") return `INVALID_DOCUMENT_ID: "${value}" is a reserved name`;
  if (/^__.*__$/.test(value)) return `INVALID_DOCUMENT_ID: "${value}" matches the reserved __*__ pattern`;
  if (new TextEncoder().encode(value).length > 1500) {
    return `INVALID_DOCUMENT_ID: "${value.slice(0, 40)}..." exceeds the 1500-byte limit`;
  }
  return null;
}

function isOnline() {
  return typeof navigator !== "undefined" ? navigator.onLine : false;
}

function isRetryableError(error) {
  const text = String(error?.code || error?.message || error || "").toLowerCase();
  return RETRYABLE_ERROR_HINTS.some((hint) => text.includes(hint));
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

  const invalidReason = invalidDocumentIdReason(documentId);
  if (invalidReason) {
    throw new Error(invalidReason);
  }

  return doc(db, collectionName, documentId);
}

function chunkList(list, size) {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) {
    chunks.push(list.slice(i, i + size));
  }
  return chunks;
}

function groupQueueByCollection(queue) {
  const groups = new Map();
  for (const item of queue) {
    const collectionName = item.payload?.collectionName || item.collection_name;
    if (!groups.has(collectionName)) groups.set(collectionName, []);
    groups.get(collectionName).push(item);
  }
  return groups;
}

function buildFirestorePayload(collectionName, documentId, data) {
  const cleaned = cleanForFirestore(data || {});
  return {
    ...cleaned,
    id: documentId,
    _cloud_collection: collectionName,
    _cloud_document_id: documentId,
    _cloud_synced_at: serverTimestamp(),
    _cloud_sync_status: "SYNCED",
  };
}

// Per-item fallback path — used directly for small ad-hoc syncs, and as the
// batch-failure fallback so one bad document doesn't take an entire batch of
// otherwise-fine documents down with it.
async function syncOneQueueItem(item) {
  const operation = String(item.operation || "").toUpperCase();
  const payload = item.payload || {};
  const collectionName = payload.collectionName || item.collection_name;
  const documentId = payload.documentId || item.document_id;

  if (pausedCollections.has(collectionName)) {
    return { ok: true, skipped: true, reason: "COLLECTION_SYNC_PAUSED", collectionName, documentId };
  }

  const ref = getFirebaseDocRef(collectionName, documentId);

  if (operation === "DELETE") {
    await deleteDoc(ref);
    return { ok: true, operation, collectionName, documentId };
  }

  await setDoc(ref, buildFirestorePayload(collectionName, documentId, payload.data), { merge: true });

  return { ok: true, operation, collectionName, documentId };
}

/**
 * Blanket per-collection re-upload of local rows (dirty or not), batched via
 * writeBatch. If a batch commit fails, falls back to committing each row in
 * that batch individually so a single malformed document's real error is
 * attributed to IT, not to every other row that would otherwise have gone
 * through fine. Paces itself between batches (with backoff after a
 * retryable-looking failure) instead of firing every batch back-to-back.
 */
export async function uploadLocalRecordsBatch(collectionName, records = []) {
  if (!db) {
    throw new Error("Firebase Firestore is not ready.");
  }

  if (pausedCollections.has(collectionName)) {
    return {
      uploaded: 0,
      failed: 0,
      skipped: true,
      reason: "COLLECTION_SYNC_PAUSED",
      collectionName,
      errors: [],
    };
  }

  let uploaded = 0;
  let failed = 0;
  const errors = [];
  let delayMs = BASE_BATCH_DELAY_MS;
  const chunks = chunkList(records, BATCH_SIZE);

  for (let i = 0; i < chunks.length; i += 1) {
    const rows = chunks[i]
      .map((row) => ({ row, documentId: row.document_id || row.data?.id }))
      .filter(({ documentId }) => {
        if (!documentId) failed += 1;
        return Boolean(documentId);
      });

    const buildRowPayload = ({ row, documentId }) => {
      const raw = { ...(row.data || {}), id: documentId };
      delete raw._cloud_cached_at;
      return buildFirestorePayload(collectionName, documentId, raw);
    };

    try {
      const batch = writeBatch(db);
      for (const entry of rows) {
        batch.set(getFirebaseDocRef(collectionName, entry.documentId), buildRowPayload(entry), { merge: true });
      }
      await batch.commit();
      uploaded += rows.length;
      delayMs = BASE_BATCH_DELAY_MS;
    } catch (error) {
      if (isRetryableError(error)) delayMs = Math.min(delayMs * 2, MAX_BATCH_DELAY_MS);

      for (const entry of rows) {
        try {
          await setDoc(getFirebaseDocRef(collectionName, entry.documentId), buildRowPayload(entry), { merge: true });
          uploaded += 1;
        } catch (itemError) {
          failed += 1;
          errors.push(itemError?.message || String(itemError));
        }
      }
    }

    if (i < chunks.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return { uploaded, failed, errors };
}

/**
 * Processes the whole sync_queue, grouped by collection and committed in
 * writeBatch chunks instead of one setDoc() per row. Thousands of queued
 * rows used to mean thousands of sequential round trips (and thousands of
 * full local-database re-serializations via markSyncDone/markSyncFailed) —
 * at that volume this was almost certainly hitting Firestore's write-rate
 * ramp-up limits and/or just taking long enough to look "stuck". A batch
 * that fails outright falls back to per-item processing so the real error
 * lands on the specific bad document instead of the whole chunk.
 */
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

    const runnable = queue.filter(
      (item) => !pausedCollections.has(item.payload?.collectionName || item.collection_name)
    );

    const batches = [];
    for (const [collectionName, items] of groupQueueByCollection(runnable)) {
      for (const part of chunkList(items, BATCH_SIZE)) {
        batches.push({ collectionName, items: part });
      }
    }

    let delayMs = BASE_BATCH_DELAY_MS;

    for (let b = 0; b < batches.length; b += 1) {
      const { collectionName, items } = batches[b];

      try {
        const batch = writeBatch(db);
        for (const item of items) {
          const operation = String(item.operation || "").toUpperCase();
          const payload = item.payload || {};
          const documentId = payload.documentId || item.document_id;
          const ref = getFirebaseDocRef(collectionName, documentId);
          if (operation === "DELETE") {
            batch.delete(ref);
          } else {
            batch.set(ref, buildFirestorePayload(collectionName, documentId, payload.data), { merge: true });
          }
        }
        await batch.commit();

        for (const item of items) {
          await markSyncDone(item.id, { skipPersist: true });
          result.done += 1;
        }
        delayMs = BASE_BATCH_DELAY_MS;
      } catch (batchError) {
        if (isRetryableError(batchError)) {
          delayMs = Math.min(delayMs * 2, MAX_BATCH_DELAY_MS);
        }

        for (const item of items) {
          try {
            const itemResult = await syncOneQueueItem(item);
            if (itemResult?.skipped) continue;
            await markSyncDone(item.id, { skipPersist: true });
            result.done += 1;
          } catch (itemError) {
            const message = itemError?.message || String(itemError);
            await markSyncFailed(item.id, message, { skipPersist: true });
            result.failed += 1;
            result.errors.push({
              queueId: item.id,
              collectionName: item.collection_name,
              documentId: item.document_id,
              error: message,
            });
          }
        }
      }

      // One persist per batch instead of one per row — for a multi-thousand
      // item backlog that's the difference between ~20 full-DB
      // serializations and thousands of them.
      await persistOfflineDb();

      if (b < batches.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    result.status = await getOfflineStatus();
    result.finishedAt = new Date().toISOString();

    return result;
  } finally {
    syncRunning = false;
  }
}

export function pauseCollectionSync(collectionName) {
  if (collectionName) pausedCollections.add(collectionName);
  return { ok: true, collectionName };
}

export function resumeCollectionSync(collectionName) {
  if (collectionName) pausedCollections.delete(collectionName);
  return { ok: true, collectionName };
}

export function isCollectionSyncPaused(collectionName) {
  return pausedCollections.has(collectionName);
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

  const onVisible = () => {
    if (typeof document !== "undefined" && document.visibilityState === "visible" && isOnline()) {
      run();
    }
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisible);
  }

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
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisible);
      }
      window.clearInterval(timer);
    },
  };
}