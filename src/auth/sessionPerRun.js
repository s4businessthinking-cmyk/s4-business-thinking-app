// A login lasts for one run of the software: closing the app / window / tab signs the user out, so the next
// start shows the login page. sessionStorage survives reloads (updates, F5) but not a close, so a run with no
// marker is a fresh start. Imported first in main.jsx, before the auth client reads its stored session.
const RUN_KEY = "s4-run-active";
const SERVER_SESSION_KEY = "s4-erp-session-v1"; // src/backend/auth.js

const freshRun = (() => {
  try {
    const fresh = !sessionStorage.getItem(RUN_KEY);
    sessionStorage.setItem(RUN_KEY, "1");
    if (fresh) localStorage.removeItem(SERVER_SESSION_KEY);
    return fresh;
  } catch {
    return false;
  }
})();

let offlineSignOutPending = freshRun;

// True once per fresh start: the caller then clears the offline (local) session before restoring it.
export function takeFreshRunSignOut() {
  const pending = offlineSignOutPending;
  offlineSignOutPending = false;
  return pending;
}
