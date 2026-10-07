// Android WebView often blocks window.open, so the native app clicks a real anchor instead.
export function openLink(url) {
  if (!url || typeof window === "undefined") return;
  if (window.Capacitor?.isNativePlatform?.() === true) {
    const a = document.createElement("a");
    a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; a.style.display = "none";
    document.body.appendChild(a); a.click(); a.remove();
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export const normUrl = (u) => { const s = String(u || "").trim(); return !s || /^https?:\/\//i.test(s) ? s : `https://${s}`; };
