import { useState, useEffect } from "react";
import { auth } from "../firebase-config";
import { subscribeFirebaseAuthReady } from "../offline/realtimeSync";

// Tracks whether there is a genuine Firebase Auth session (auth.currentUser),
// as distinct from the local-only offline session that `restoreLocalAuthSession()`
// can produce before (or without ever) establishing one. Any component that
// attaches a Firestore onSnapshot listener should gate on this — a shopId-scoped
// query without a real auth session just produces a silent permission-denied.
export function useFirebaseAuthReady() {
  const [ready, setReady] = useState(() => !!auth?.currentUser);
  useEffect(() => subscribeFirebaseAuthReady(setReady), []);
  return ready;
}
