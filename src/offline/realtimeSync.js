import { collection, onSnapshot, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { db, auth } from "../firebase-config";
import { offlineCacheCloudRecords, offlineList } from "./offlineRepository";

// Shared real-time (onSnapshot) subscription layer for shopId-scoped Firestore
// collections. Generalizes the pattern originally written for
// branch-transfer's `subscribeShopRecords` so both branch-transfer and the
// main shop screens use one implementation instead of two.
//
// Compared to a plain onSnapshot() call, this adds:
//  - genuine-auth gating: the Firestore listener is never attached unless
//    `auth.currentUser` is a real, signed-in Firebase user. A local-only
//    offline session (see src/auth/localAuthBootstrap.js) can produce a
//    usable `shopId` before Firebase's own auth session has restored (or
//    when it never will, e.g. a legacy local-only account) — attaching a
//    shopId-scoped listener in that state just produces a silent
//    permission-denied that gets swallowed by a console.warn.
//  - auto attach/detach as the genuine auth session comes and goes.
//  - local SQLite cache fallback, and write-through caching of cloud rows.
//  - merge of locally-dirty (not yet uploaded) rows over cloud rows, so an
//    unsynced local edit is never clobbered by a stale cloud snapshot.
//  - visible, non-spammy status reporting + capped exponential backoff
//    retry when the listener itself errors (permission-denied, network
//    drop, etc.) instead of failing once and going silent forever.

const RETRY_DELAYS_MS = [2000, 5000, 10000, 20000, 30000];

function isOnline() {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

export function hasFirebaseAuthSession() {
  return !!auth?.currentUser;
}

/**
 * Subscribes to genuine Firebase Auth session changes.
 * Calls `onChange(true|false)` immediately with the current state, then
 * again whenever auth.currentUser transitions between null and a user.
 * Returns an unsubscribe function.
 */
export function subscribeFirebaseAuthReady(onChange) {
  if (!auth) {
    onChange(false);
    return () => {};
  }

  onChange(hasFirebaseAuthSession());
  return onAuthStateChanged(auth, (fbUser) => onChange(!!fbUser));
}

function normalizeOfflineRows(result) {
  const rows = Array.isArray(result) ? result : result?.records || [];
  return rows.map((row) => ({
    ...(row?.data || row || {}),
    id: row?.data?.id || row?.document_id || row?.id,
  }));
}

function dirtyShopRows(result, shopId) {
  const rows = Array.isArray(result) ? result : result?.records || [];
  return rows
    .filter((row) => Number(row?.dirty || 0) === 1)
    .map((row) => ({ ...(row?.data || {}), id: row?.data?.id || row?.document_id || row?.id }))
    .filter((row) => String(row.shopId || "") === String(shopId));
}

function defaultNormalizeDoc(docSnap) {
  return { id: docSnap.id, ...docSnap.data() };
}

function defaultSort(rows = []) {
  return [...rows].sort(
    (left, right) =>
      new Date(right.updatedAt || right.createdAt || 0).getTime() -
      new Date(left.updatedAt || left.createdAt || 0).getTime()
  );
}

/**
 * Generalized shopId-scoped real-time subscription.
 *
 * @param {object} options
 * @param {string} options.collectionName - Firestore collection to watch.
 * @param {string} options.shopId
 * @param {() => Promise<Array>} [options.loadLocalRows] - loads the initial
 *   (already shop-filtered) rows from local SQLite. Defaults to reading
 *   `collectionName` via offlineList and filtering by shopId.
 * @param {(rows: Array) => Array} [options.sortRows] - sort applied to both
 *   local and cloud rows before they reach onRows.
 * @param {(docSnap) => object} [options.normalizeDoc] - maps a Firestore doc
 *   snapshot to a plain row object.
 * @param {boolean} [options.mergeDirtyLocal=true] - overlay locally-dirty
 *   (unsynced) rows on top of each cloud snapshot.
 * @param {string} [options.cacheCollectionName] - defaults to collectionName;
 *   pass a different name if the local cache uses another table.
 * @param {(rows: Array) => void} options.onRows - required.
 * @param {(status: {state: string, error?: Error}) => void} [options.onStatus]
 *   - state is one of "connected" | "reconnecting" | "auth_required" | "offline".
 * @returns {() => void} unsubscribe
 */
export function subscribeShopCollection({
  collectionName,
  shopId,
  loadLocalRows,
  sortRows = defaultSort,
  normalizeDoc = defaultNormalizeDoc,
  mergeDirtyLocal = true,
  cacheCollectionName = collectionName,
  onRows,
  onStatus = () => {},
}) {
  if (typeof onRows !== "function") {
    throw new Error("subscribeShopCollection: onRows is required");
  }

  let cancelled = false;
  let unsubscribeSnapshot = null;
  let unsubscribeAuth = null;
  let retryTimer = null;
  let retryIndex = 0;

  const emitStatus = (state, extra = {}) => {
    if (!cancelled) onStatus({ state, ...extra });
  };

  const defaultLoadLocalRows = async () => {
    const result = await offlineList(cacheCollectionName);
    return sortRows(
      normalizeOfflineRows(result).filter((row) => String(row.shopId || "") === String(shopId))
    );
  };

  const runLocalLoad = async () => {
    try {
      const rows = await (loadLocalRows ? loadLocalRows() : defaultLoadLocalRows());
      if (!cancelled) onRows(rows || []);
    } catch (error) {
      console.warn(`[S4 Realtime] ${collectionName} local load failed`, error);
    }
  };

  const clearRetry = () => {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const scheduleRetry = () => {
    clearRetry();
    const delay = RETRY_DELAYS_MS[Math.min(retryIndex, RETRY_DELAYS_MS.length - 1)];
    retryIndex += 1;
    retryTimer = setTimeout(() => {
      if (!cancelled) attach();
    }, delay);
  };

  function attach() {
    if (cancelled || !db || !shopId) return;

    if (!hasFirebaseAuthSession()) {
      emitStatus("auth_required");
      return;
    }
    if (!isOnline()) {
      emitStatus("offline");
      return;
    }

    try {
      const q = query(collection(db, collectionName), where("shopId", "==", shopId));
      unsubscribeSnapshot = onSnapshot(
        q,
        (snapshot) => {
          retryIndex = 0;
          const cloudRows = sortRows(snapshot.docs.map((entry) => normalizeDoc(entry)));

          const finish = (rows) => {
            if (cancelled) return;
            onRows(sortRows(rows));
            emitStatus("connected");
          };

          Promise.resolve()
            .then(() => offlineCacheCloudRecords(cacheCollectionName, cloudRows))
            .catch((error) =>
              console.warn(`[S4 Realtime] ${collectionName} cache failed`, error)
            )
            .then(async () => {
              if (!mergeDirtyLocal) {
                finish(cloudRows);
                return;
              }
              try {
                const localResult = await offlineList(cacheCollectionName);
                const merged = new Map(cloudRows.map((row) => [String(row.id), row]));
                for (const row of dirtyShopRows(localResult, shopId)) {
                  merged.set(String(row.id), row);
                }
                finish([...merged.values()]);
              } catch (error) {
                console.warn(`[S4 Realtime] ${collectionName} dirty-merge failed`, error);
                finish(cloudRows);
              }
            });
        },
        (error) => {
          console.warn(`[S4 Realtime] ${collectionName} listener error`, error?.code || error);
          unsubscribeSnapshot = null;
          runLocalLoad();
          emitStatus("reconnecting", { error });
          scheduleRetry();
        }
      );
    } catch (error) {
      console.warn(`[S4 Realtime] ${collectionName} attach failed`, error);
      emitStatus("reconnecting", { error });
      scheduleRetry();
    }
  }

  function detachSnapshot() {
    clearRetry();
    if (unsubscribeSnapshot) {
      unsubscribeSnapshot();
      unsubscribeSnapshot = null;
    }
  }

  runLocalLoad();

  unsubscribeAuth = subscribeFirebaseAuthReady((ready) => {
    retryIndex = 0;
    detachSnapshot();
    if (ready) attach();
    else emitStatus("auth_required");
  });

  const handleOnline = () => {
    if (hasFirebaseAuthSession() && !unsubscribeSnapshot) {
      retryIndex = 0;
      attach();
    }
  };
  const handleOffline = () => emitStatus("offline");

  if (typeof window !== "undefined") {
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
  }

  return () => {
    cancelled = true;
    detachSnapshot();
    unsubscribeAuth?.();
    if (typeof window !== "undefined") {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    }
  };
}
