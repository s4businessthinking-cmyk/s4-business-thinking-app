import React from "react";
import ReactDOM from "react-dom/client";
import App from "./spare-parts-app.jsx";
import { startOfflineEngine } from "./offline/offlineBoot";

async function clearStaleNativeWebCache() {
  const isNative =
    typeof window !== "undefined" &&
    window.Capacitor?.isNativePlatform?.() === true;
  if (!isNative) return;

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
    console.warn("[S4] Native cache cleanup failed", error);
  }
}

clearStaleNativeWebCache().finally(() => {
  startOfflineEngine();
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);