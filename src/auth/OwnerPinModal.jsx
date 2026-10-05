import { useEffect, useRef, useState } from "react";
import { loadOwnerPin, verifyOwnerPin, verifyOwnerLoginPassword, saveOwnerPin, isValidPin } from "./ownerPin";
import { useEscapeKey } from "../components/WindowChrome.jsx";

const MAX_TRIES = 5;
const LOCK_MS = 5 * 60 * 1000;
const attemptsKey = (uid) => `s4_owner_pin_tries_${uid}`;
const readAttempts = (uid) => {
  try { return { count: 0, until: 0, ...JSON.parse(localStorage.getItem(attemptsKey(uid)) || "{}") }; } catch { return { count: 0, until: 0 }; }
};
const writeAttempts = (uid, v) => { try { localStorage.setItem(attemptsKey(uid), JSON.stringify(v)); } catch {} };

/**
 * mode "unlock": asks for the PIN (falls back to setup when no PIN exists yet).
 * mode "reset": login password + new PIN — used for first setup, change and forgot-PIN.
 */
export default function OwnerPinModal({ lang = "bn", uid, localUserId, initialMode = "unlock", onUnlocked, onClose }) {
  const bn = lang === "bn";
  const [mode, setMode] = useState(null);
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [newPin, setNewPin] = useState("");
  const [newPin2, setNewPin2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hasPin, setHasPin] = useState(false);
  const firstRef = useRef(null);

  useEffect(() => {
    let alive = true;
    loadOwnerPin(uid).then((rec) => {
      if (!alive) return;
      setHasPin(!!rec);
      setMode(initialMode === "reset" || !rec ? "reset" : "unlock");
    });
    return () => { alive = false; };
  }, [uid, initialMode]);

  useEffect(() => { setError(""); setTimeout(() => firstRef.current?.focus(), 50); }, [mode]);
  useEscapeKey(() => onClose?.(), { level: 7 });

  const digits = (v) => String(v || "").replace(/\D/g, "").slice(0, 6);

  const submitUnlock = async (e) => {
    e?.preventDefault();
    const lock = readAttempts(uid);
    if (lock.until > Date.now()) {
      const mins = Math.ceil((lock.until - Date.now()) / 60000);
      return setError(bn ? `অনেকবার ভুল হয়েছে — ${mins} মিনিট পর আবার চেষ্টা করুন` : `Too many wrong tries — try again in ${mins} min`);
    }
    if (!isValidPin(pin)) return setError(bn ? "৪-৬ সংখ্যার পিন দিন" : "Enter your 4-6 digit PIN");
    setBusy(true);
    try {
      if (await verifyOwnerPin(uid, pin)) {
        writeAttempts(uid, { count: 0, until: 0 });
        onUnlocked?.();
      } else {
        const count = lock.count + 1;
        const locked = count >= MAX_TRIES;
        writeAttempts(uid, { count: locked ? 0 : count, until: locked ? Date.now() + LOCK_MS : 0 });
        setError(locked
          ? (bn ? "৫ বার ভুল — ৫ মিনিটের জন্য বন্ধ" : "5 wrong tries — locked for 5 minutes")
          : (bn ? `ভুল পিন (${MAX_TRIES - count} বার বাকি)` : `Wrong PIN (${MAX_TRIES - count} tries left)`));
        setPin("");
      }
    } finally { setBusy(false); }
  };

  const submitReset = async (e) => {
    e?.preventDefault();
    if (!password) return setError(bn ? "লগইন পাসওয়ার্ড দিন" : "Enter your login password");
    if (!isValidPin(newPin)) return setError(bn ? "নতুন পিন ৪-৬ সংখ্যার হতে হবে" : "New PIN must be 4-6 digits");
    if (newPin !== newPin2) return setError(bn ? "দুইবার একই পিন দিন" : "PINs do not match");
    setBusy(true);
    try {
      if (!(await verifyOwnerLoginPassword(localUserId, password, uid))) {
        setError(bn ? "পাসওয়ার্ড ভুল" : "Wrong password");
        return;
      }
      await saveOwnerPin(uid, newPin);
      onUnlocked?.();
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  };

  const inp = { width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 16, fontFamily: "inherit", outline: "none", background: "#fff", color: "#0f172a" };
  const pinInp = { ...inp, fontSize: 24, letterSpacing: 10, textAlign: "center", fontWeight: 800 };
  const lbl = { fontSize: 12, fontWeight: 700, color: "#475569", margin: "10px 0 4px", display: "block" };
  const primary = { width: "100%", padding: 13, borderRadius: 10, border: "none", background: busy ? "#94a3b8" : "linear-gradient(135deg,#2563eb,#1d4ed8)", color: "#fff", fontSize: 15, fontWeight: 800, cursor: busy ? "wait" : "pointer", marginTop: 14, fontFamily: "inherit" };
  const link = { background: "none", border: "none", color: "#2563eb", fontSize: 13, fontWeight: 700, cursor: "pointer", marginTop: 12, fontFamily: "inherit" };

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{ position: "fixed", inset: 0, zIndex: 10100, background: "rgba(15,23,42,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 380, background: "#fff", borderRadius: 16, padding: 22, boxShadow: "0 24px 60px rgba(2,6,23,0.4)", color: "#0f172a" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ fontSize: 17, fontWeight: 900 }}>🔒 {mode === "reset" ? (hasPin ? (bn ? "নতুন পিন সেট করুন" : "Set a new PIN") : (bn ? "মালিকের পিন তৈরি করুন" : "Create owner PIN")) : (bn ? "মালিকের পিন দিন" : "Enter owner PIN")}</div>
          <button type="button" onClick={onClose} style={{ border: "none", background: "transparent", fontSize: 20, cursor: "pointer", color: "#64748b" }}>✕</button>
        </div>
        {mode === null && <div style={{ padding: 20, textAlign: "center", color: "#64748b" }}>⏳</div>}

        {mode === "unlock" && (
          <form onSubmit={submitUnlock}>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>{bn ? "গোপন হিসাব দেখতে আপনার ব্যক্তিগত পিন দিন।" : "Enter your personal PIN to view private figures."}</div>
            <input ref={firstRef} type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(digits(e.target.value))} style={pinInp} placeholder="••••" />
            {error && <div style={{ color: "#dc2626", fontSize: 13, fontWeight: 700, marginTop: 8 }}>{error}</div>}
            <button type="submit" disabled={busy} style={primary}>{busy ? "…" : (bn ? "খুলুন" : "Unlock")}</button>
            <div style={{ textAlign: "center" }}>
              <button type="button" style={link} onClick={() => setMode("reset")}>{bn ? "পিন ভুলে গেছেন? পাসওয়ার্ড দিয়ে নতুন পিন" : "Forgot PIN? Reset with password"}</button>
            </div>
          </form>
        )}

        {mode === "reset" && (
          <form onSubmit={submitReset}>
            <div style={{ fontSize: 12, color: "#64748b" }}>
              {hasPin
                ? (bn ? "নিরাপত্তার জন্য আপনার লগইন পাসওয়ার্ড দিন, তারপর নতুন পিন।" : "For security, enter your login password, then the new PIN.")
                : (bn ? "ড্যাশবোর্ডের টাকার হিসাব, Accounts আর চেক ফোল্ডার এই পিন ছাড়া দেখা যাবে না।" : "Dashboard money, Accounts and cheque folders will need this PIN.")}
            </div>
            <span style={lbl}>{bn ? "লগইন পাসওয়ার্ড" : "Login password"}</span>
            <input ref={firstRef} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} style={inp} />
            <span style={lbl}>{bn ? "নতুন পিন (৪-৬ সংখ্যা)" : "New PIN (4-6 digits)"}</span>
            <input type="password" inputMode="numeric" autoComplete="new-password" value={newPin} onChange={(e) => setNewPin(digits(e.target.value))} style={pinInp} placeholder="••••" />
            <span style={lbl}>{bn ? "আবার পিন দিন" : "Confirm PIN"}</span>
            <input type="password" inputMode="numeric" autoComplete="new-password" value={newPin2} onChange={(e) => setNewPin2(digits(e.target.value))} style={pinInp} placeholder="••••" />
            {error && <div style={{ color: "#dc2626", fontSize: 13, fontWeight: 700, marginTop: 8 }}>{error}</div>}
            <button type="submit" disabled={busy} style={primary}>{busy ? "…" : (bn ? "পিন সেভ করে খুলুন" : "Save PIN & unlock")}</button>
            {hasPin && initialMode !== "reset" && (
              <div style={{ textAlign: "center" }}>
                <button type="button" style={link} onClick={() => setMode("unlock")}>{bn ? "← পিন দিয়ে খুলুন" : "← Unlock with PIN"}</button>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
