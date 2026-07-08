import React from "react";
import ReactDOM from "react-dom/client";
import App from "./spare-parts-app.jsx";
import { startOfflineEngine } from "./offline/offlineBoot";
import { notifyMobileAppReady, runMobileAutoUpdate } from "./update/mobileOtaService.js";
import { APP_VERSION, checkGitHubUpdate } from "./update/githubUpdateService.js";

async function clearStaleShellWebCache() {
  const isNative =
    typeof window !== "undefined" &&
    window.Capacitor?.isNativePlatform?.() === true;
  const isElectron =
    typeof window !== "undefined" &&
    typeof window.process?.versions?.electron === "string";

  if (!isNative && !isElectron) return;

  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch (error) {
    console.warn("[S4] Shell cache cleanup failed", error);
  }
}

async function setupWebPwaAutoReload() {
  const isNative = window.Capacitor?.isNativePlatform?.() === true;
  const isElectron = typeof window.process?.versions?.electron === "string";
  if (isNative || isElectron) return;

  try {
    const { registerSW } = await import("virtual:pwa-register");
    registerSW({
      immediate: true,
      onRegisteredSW(_swUrl, registration) {
        if (registration) {
          setInterval(() => {
            registration.update().catch(() => {});
          }, 60 * 60 * 1000);
        }
      },
      onNeedRefresh() {
        window.location.reload();
      },
    });
  } catch {
    // PWA disabled in this build.
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    });
  }
}

clearStaleShellWebCache()
  .then(() => setupWebPwaAutoReload())
  .finally(async () => {
    startOfflineEngine();
    await notifyMobileAppReady();
    runMobileAutoUpdate({
      checkGitHubUpdate,
      APP_VERSION,
      silent: true,
    }).catch(() => {});
  });

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
