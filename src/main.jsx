import React from "react";
import ReactDOM from "react-dom/client";
import App from "./spare-parts-app.jsx";
import ErpBuildDashboard from "./erp-build/ErpBuildDashboard.jsx";
import { isErpDashboardRoute } from "./erp-build/buildStages.js";
import { startOfflineEngine } from "./offline/offlineBoot";
import S4BootErrorBoundary from "./components/S4BootErrorBoundary.jsx";
import S4UiReadyGate from "./components/S4UiReadyGate.jsx";

function isElectronRuntime() {
  return Boolean(
    window.S4Desktop ||
      typeof window.process?.versions?.electron === "string" ||
      /\bElectron\//.test(window.navigator?.userAgent || "")
  );
}

async function clearStaleShellWebCache() {
  const isNative =
    typeof window !== "undefined" &&
    window.Capacitor?.isNativePlatform?.() === true;
  const isElectron = typeof window !== "undefined" && isElectronRuntime();

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

function currentModuleScriptName() {
  const el = document.querySelector('script[type="module"][src*="assets/index-"]');
  const src = el?.getAttribute("src") || "";
  const match = src.match(/assets\/(index-[^"?]+\.js)/);
  return match?.[1] || "";
}

/** Mobile PWA often keeps an old precached bundle; compare live index.html to this tab. */
async function reloadIfDeployedShellChanged() {
  try {
    const running = currentModuleScriptName();
    if (!running) return;
    const base = new URL(".", window.location.href).href;
    const res = await fetch(`${base}index.html?_=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return;
    const html = await res.text();
    const live = html.match(/assets\/(index-[^"]+\.js)/)?.[1];
    if (live && live !== running) {
      window.location.reload();
    }
  } catch {
    // offline or blocked — keep running cached shell
  }
}

function wirePwaUpdateChecks(registration) {
  const checkSw = () => registration.update().catch(() => {});
  checkSw();
  setInterval(checkSw, 15 * 60 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      checkSw();
      reloadIfDeployedShellChanged();
    }
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      checkSw();
      reloadIfDeployedShellChanged();
    }
  });
  reloadIfDeployedShellChanged();
}

async function setupWebPwaAutoReload() {
  const isNative = window.Capacitor?.isNativePlatform?.() === true;
  if (isNative || isElectronRuntime()) return;

  try {
    const { registerSW } = await import("virtual:pwa-register");
    registerSW({
      immediate: true,
      onRegisteredSW(_swUrl, registration) {
        if (registration) wirePwaUpdateChecks(registration);
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
  .finally(() => {
    startOfflineEngine().catch((error) => {
      console.error("[S4 Offline] engine start failed (app will still open)", error);
    });
  });

if (typeof window !== "undefined" && window.S4Desktop?.dialog) {
  window.alert = (message) => { window.S4Desktop.dialog.alert(message); };
  window.confirm = (message) => window.S4Desktop.dialog.confirm(message);
}

// Ctrl+A outside a text field would highlight the whole UI (menus, buttons, grids).
if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || String(e.key).toLowerCase() !== "a") return;
    const el = e.target;
    const tag = String(el?.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || el?.isContentEditable) return;
    e.preventDefault();
  });
}

const RootApp = isErpDashboardRoute() ? ErpBuildDashboard : App;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <S4BootErrorBoundary>
      <S4UiReadyGate>
        <RootApp />
      </S4UiReadyGate>
    </S4BootErrorBoundary>
  </React.StrictMode>
);
