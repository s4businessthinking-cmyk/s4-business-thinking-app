import { bootOfflineSqlite, getOfflineStatus } from "./sqliteDb";

export async function startOfflineEngine() {
  try {
    const boot = await bootOfflineSqlite();
    const status = await getOfflineStatus();

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