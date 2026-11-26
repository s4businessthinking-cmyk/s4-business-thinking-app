/** True when running inside Capacitor native shell (Android/iOS app). */
export function isNativeApp() {
  try {
    return typeof window !== "undefined" && !!window.Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
}

/** True for native app or coarse-pointer / narrow phone UI. */
export function isMobileUi() {
  if (typeof window === "undefined") return false;
  if (isNativeApp()) return true;
  try {
    if (window.matchMedia?.("(pointer: coarse)").matches) return true;
    if (window.matchMedia?.("(max-width: 900px)").matches) return true;
  } catch { /* ignore */ }
  return false;
}
