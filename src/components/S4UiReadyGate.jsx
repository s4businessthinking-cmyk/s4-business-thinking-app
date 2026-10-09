import { useEffect } from "react";
import { notifyMobileAppReady, runMobileAutoUpdate } from "../update/mobileOtaService.js";
import { APP_VERSION, checkGitHubUpdate } from "../update/githubUpdateService.js";

/**
 * Capgo marks an OTA bundle "good" only after notifyAppReady().
 * Call that after React paints so a broken bundle can roll back on next cold start.
 */
export default function S4UiReadyGate({ children }) {
  useEffect(() => {
    let otaTimer = null;

    (async () => {
      try {
        await notifyMobileAppReady();
      } catch (error) {
        console.warn("[S4 OTA] notifyAppReady deferred failed", error);
      }

      otaTimer = window.setTimeout(() => {
        runMobileAutoUpdate({
          checkGitHubUpdate,
          APP_VERSION,
          silent: true,
        }).catch(() => {});
      }, 8000);
    })();

    const periodic = window.setInterval(() => {
      runMobileAutoUpdate({
        checkGitHubUpdate,
        APP_VERSION,
        silent: true,
      }).catch(() => {});
    }, 30 * 60 * 1000);

    return () => {
      if (otaTimer) clearTimeout(otaTimer);
      clearInterval(periodic);
    };
  }, []);

  return children;
}
