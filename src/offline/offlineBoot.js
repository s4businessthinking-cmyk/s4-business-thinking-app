import { bootOfflineSqlite, getOfflineStatus } from "./sqliteDb";
import {
  offlineCreate,
  offlineUpdate,
  offlineUpsert,
  offlineRemove,
  offlineList,
  offlineSearch,
  offlineEngineStatus,
} from "./offlineRepository";
import {
  syncPendingQueueToFirebase,
  startAutoFirebaseSync,
} from "./firebaseSyncWorker";
import {
  activateLicenseOffline,
  createLicenseFingerprint,
  getLocalAccessStatus,
  getLocalLicenseStatus,
  getOrCreateTrialStatus,
  parseLicenseKey,
  verifyOfflineLicensePayload,
} from "../auth/licenseService";

function exposeLicenseHelpers() {
  try {
    window.S4License = {
      getStatus: getLocalLicenseStatus,
      fingerprint: createLicenseFingerprint,
      parse: parseLicenseKey,
      verifyOffline: verifyOfflineLicensePayload,
      activateOffline: activateLicenseOffline,
      trialStatus: getOrCreateTrialStatus,
      accessStatus: getLocalAccessStatus,
    };

  } catch (error) {
    console.warn("[S4 License] Developer helpers unavailable", error);
  }
}

function exposeDevLicenseHelpers() {
  if (!import.meta.env.DEV) return;

  import("../auth/licenseService")
    .then((mod) => {
      if (!window.S4License) return;

      window.S4License.dev = {
        getDebugStatus: mod.getDebugStatus,
        clearLocalLicenseForTest: mod.clearLocalLicenseForTest,
        expireTrialForTest: mod.expireTrialForTest,
        resetTrialForTest: mod.resetTrialForTest,
      };
    })
    .catch((error) => {
      console.warn("[S4 License] Dev helpers unavailable", error);
    });
}

export async function startOfflineEngine() {
  try {
    const boot = await bootOfflineSqlite();
    const status = await getOfflineStatus();

    const autoSync = startAutoFirebaseSync({
      intervalMs: 30000,
    });

    window.S4Offline = {
      ready: true,
      boot,
      autoSync,
      status: offlineEngineStatus,
      create: offlineCreate,
      update: offlineUpdate,
      upsert: offlineUpsert,
      remove: offlineRemove,
      list: offlineList,
      search: offlineSearch,
      syncNow: syncPendingQueueToFirebase,
      test: async () => {
        const created = await offlineCreate("offline_test", {
          name: "S4 Offline Test",
          note: "SQLite + Sync Queue working",
          createdFrom: "window.S4Offline.test",
        });

        const latestStatus = await getOfflineStatus();

        return {
          ok: true,
          created,
          status: latestStatus,
        };
      },
      testSync: async () => {
        const created = await offlineCreate("offline_test", {
          name: "S4 Firebase Sync Test",
          note: "SQLite → Sync Queue → Firebase test",
          createdFrom: "window.S4Offline.testSync",
        });

        const sync = await syncPendingQueueToFirebase();

        return {
          ok: true,
          created,
          sync,
        };
      },
    };

    exposeLicenseHelpers();
    exposeDevLicenseHelpers();

    window.__S4_OFFLINE_ENGINE__ = {
      ready: true,
      boot,
      status,
      startedAt: new Date().toISOString(),
    };

    console.log("[S4 Offline] SQLite engine ready", status);

    return { ok: true, boot, status };
  } catch (error) {
    window.__S4_OFFLINE_ENGINE__ = {
      ready: false,
      error: error?.message || String(error),
      startedAt: new Date().toISOString(),
    };

    console.warn("[S4 Offline] SQLite engine failed", error);

    return {
      ok: false,
      error: error?.message || String(error),
    };
  }
}