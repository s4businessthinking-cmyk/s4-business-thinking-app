/** Mobile Chrome PWA: drop service worker + caches, then reload from server. */
export async function reloadWebsiteFresh() {
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
    console.warn("[S4] Website cache clear failed", error);
  }

  window.location.reload();
}
