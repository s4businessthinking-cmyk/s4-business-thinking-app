/** Unsaved search / draft inputs clear after the user leaves (default ~2.5 min). */

export const STALE_DRAFT_MS = 150_000;

const timers = new Map();

export function scheduleStaleClear(key, clearFn, ms = STALE_DRAFT_MS) {
  cancelStaleClear(key);
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      try {
        clearFn();
      } catch (err) {
        console.warn("[S4] stale draft clear failed", key, err);
      }
    }, ms),
  );
}

export function cancelStaleClear(key) {
  const t = timers.get(key);
  if (t) {
    clearTimeout(t);
    timers.delete(key);
  }
}
