import { useEffect, useRef, useState } from "react";
import { peekOwnerPin, loadOwnerPin, verifyOwnerPin, verifyOwnerLoginPassword, saveOwnerPin, isValidPin, requestPinResetCode, verifyPinResetCode } from "./ownerPin";
import { useEscapeKey } from "../components/WindowChrome.jsx";

const MAX_TRIES = 5;
const LOCK_MS = 5 * 60 * 1000;
const RESEND_SEC = 60;
const attemptsKey = (uid) => `s4_owner_pin_tries_${uid}`;
const readAttempts = (uid) => {
  try { return { count: 0, until: 0, ...JSON.parse(localStorage.getItem(attemptsKey(uid)) || "{}") }; } catch { return { count: 0, until: 0 }; }
};
const writeAttempts = (uid, v) => { try { localStorage.setItem(attemptsKey(uid), JSON.stringify(v)); } catch {} };

/**
 * mode "unlock": asks for the PIN.
 * mode "setup":  first PIN — login password + new PIN.
 * mode "change": current PIN + new PIN. The login password alone can no longer replace an existing PIN.
 * mode "forgot": a code mailed to the owner's login email + new PIN.
 */
export default function OwnerPinModal({ lang = "bn", uid, localUserId, initialMode = "unlock", onUnlocked, onClose }) {
  const bn = lang === "bn";
  const modeFor = (hasPin) => (!hasPin ? "setup" : initialMode === "reset" ? "change" : "unlock");
  const [hasPin, setHasPin] = useState(() => !!peekOwnerPin(uid));
  const [mode, setMode] = useState(() => (peekOwnerPin(uid) || !navigator.onLine ? modeFor(!!peekOwnerPin(uid)) : null));
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [newPin, setNewPin] = useState("");
  const [newPin2, setNewPin2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const firstRef = useRef(null);

  useEffect(() => {
    let alive = true;
    loadOwnerPin(uid).then((rec) => {
      if (!alive) return;
      setHasPin(!!rec);
      setMode((m) => (m === null || (m === "setup" && rec) ? modeFor(!!rec) : m));
    });
    return () => { alive = false; };
  }, [uid, initialMode]);

  useEffect(() => { setError(""); setTimeout(() => firstRef.current?.focus(), 50); }, [mode, sentTo]);
  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);
  useEscapeKey(() => onClose?.(), { level: 7 });

  const digits = (v) => String(v || "").replace(/\D/g, "").slice(0, 6);

  const lockedMessage = () => {
    const lock = readAttempts(uid);
    if (lock.until <= Date.now()) return "";
    const mins = Math.ceil((lock.until - Date.now()) / 60000);
    return bn ? `অনেকবার ভুল হয়েছে — ${mins} মিনিট পর আবার চেষ্টা করুন` : `Too many wrong tries — try again in ${mins} min`;
  };

  // Shared by unlock and change so wrong PINs count toward the same lockout.
  const checkPin = async (value) => {
    if (await verifyOwnerPin(uid, value)) {
      writeAttempts(uid, { count: 0, until: 0 });
      return true;
    }
    const lock = readAttempts(uid);
    const count = lock.count + 1;
    const locked = count >= MAX_TRIES;
    writeAttempts(uid, { count: locked ? 0 : count, until: locked ? Date.now() + LOCK_MS : 0 });
    setError(locked
      ? (bn ? "৫ বার ভুল — ৫ মিনিটের জন্য বন্ধ" : "5 wrong tries — locked for 5 minutes")
      : (bn ? `ভুল পিন (${MAX_TRIES - count} বার বাকি)` : `Wrong PIN (${MAX_TRIES - count} tries left)`));
    return false;
  };

  const newPinError = () => {
    if (!isValidPin(newPin)) return bn ? "নতুন পিন ৪-৬ সংখ্যার হতে হবে" : "New PIN must be 4-6 digits";
    if (newPin !== newPin2) return bn ? "দুইবার একই পিন দিন" : "PINs do not match";
    return "";
  };

  const serverError = (err) => {
    const code = err?.code || "";
    const msg = String(err?.message || "");
    if (code === "unavailable" && /email/i.test(msg)) return bn ? "সার্ভারে ইমেইল এখনো চালু করা হয়নি" : "Email is not set up on the server yet";
    if (code === "unavailable") return bn ? "ইন্টারনেট নেই — অনলাইনে এসে চেষ্টা করুন" : "No internet — try again when online";
    if (code === "not-found" && /endpoint/i.test(msg)) return bn ? "সার্ভার এখনো আপডেট হয়নি" : "The server has not been updated yet";
    if (code === "not-found") return bn ? "কোডের মেয়াদ শেষ — নতুন কোড নিন" : "The code has expired — ask for a new one";
    if (code === "resource-exhausted") return bn ? "একটু পরে আবার কোড চান" : msg;
    if (code === "permission-denied") return bn ? "শুধু দোকানের মালিক পিন রিসেট করতে পারবেন" : msg;
    if (code === "invalid-argument") return /many/i.test(msg) ? (bn ? "অনেকবার ভুল কোড — নতুন কোড নিন" : msg) : (bn ? "কোড ভুল" : "Wrong code");
    return msg || (bn ? "সমস্যা হয়েছে" : "Something went wrong");
  };

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); } catch (err) { setError(serverError(err)); } finally { setBusy(false); }
  };

  const submitUnlock = (e) => {
    e?.preventDefault();
    const locked = lockedMessage();
    if (locked) return setError(locked);
    if (!isValidPin(pin)) return setError(bn ? "৪-৬ সংখ্যার পিন দিন" : "Enter your 4-6 digit PIN");
    run(async () => {
      if (await checkPin(pin)) onUnlocked?.();
      else setPin("");
    });
  };

  const submitSetup = (e) => {
    e?.preventDefault();
    if (!password) return setError(bn ? "লগইন পাসওয়ার্ড দিন" : "Enter your login password");
    const bad = newPinError();
    if (bad) return setError(bad);
    run(async () => {
      if (!(await verifyOwnerLoginPassword(localUserId, password, uid))) return setError(bn ? "পাসওয়ার্ড ভুল" : "Wrong password");
      await saveOwnerPin(uid, newPin);
      onUnlocked?.();
    });
  };

  const submitChange = (e) => {
    e?.preventDefault();
    const locked = lockedMessage();
    if (locked) return setError(locked);
    if (!isValidPin(currentPin)) return setError(bn ? "বর্তমান পিন দিন" : "Enter your current PIN");
    const bad = newPinError();
    if (bad) return setError(bad);
    run(async () => {
      if (!(await checkPin(currentPin))) return setCurrentPin("");
      await saveOwnerPin(uid, newPin);
      onUnlocked?.();
    });
  };

  const sendCode = () => run(async () => {
    const res = await requestPinResetCode();
    setSentTo(res.email || "");
    setResendIn(RESEND_SEC);
  });

  const submitForgot = (e) => {
    e?.preventDefault();
    if (!/^\d{6}$/.test(code)) return setError(bn ? "ইমেইলে আসা ৬ সংখ্যার কোড দিন" : "Enter the 6-digit code from the email");
    const bad = newPinError();
    if (bad) return setError(bad);
    run(async () => {
      await verifyPinResetCode(code);
      await saveOwnerPin(uid, newPin);
      writeAttempts(uid, { count: 0, until: 0 });
      onUnlocked?.();
    });
  };

  const inp = { width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 16, fontFamily: "inherit", outline: "none", background: "#fff", color: "#0f172a" };
  const pinInp = { ...inp, fontSize: 24, letterSpacing: 10, textAlign: "center", fontWeight: 800 };
  const lbl = { fontSize: 12, fontWeight: 700, color: "#475569", margin: "10px 0 4px", display: "block" };
  const hint = { fontSize: 12, color: "#64748b", marginBottom: 6 };
  const primary = { width: "100%", padding: 13, borderRadius: 10, border: "none", background: busy ? "#94a3b8" : "linear-gradient(135deg,#2563eb,#1d4ed8)", color: "#fff", fontSize: 15, fontWeight: 800, cursor: busy ? "wait" : "pointer", marginTop: 14, fontFamily: "inherit" };
  const link = { background: "none", border: "none", color: "#2563eb", fontSize: 13, fontWeight: 700, cursor: "pointer", marginTop: 12, fontFamily: "inherit" };
  const errorBox = error && <div style={{ color: "#dc2626", fontSize: 13, fontWeight: 700, marginTop: 8 }}>{error}</div>;
  const pinField = (value, set, ref, auto = "off") => (
    <input ref={ref} type="password" inputMode="numeric" autoComplete={auto} value={value} onChange={(e) => set(digits(e.target.value))} style={pinInp} placeholder="••••" />
  );
  const newPinFields = (
    <>
      <span style={lbl}>{bn ? "নতুন পিন (৪-৬ সংখ্যা)" : "New PIN (4-6 digits)"}</span>
      {pinField(newPin, setNewPin, null, "new-password")}
      <span style={lbl}>{bn ? "আবার পিন দিন" : "Confirm PIN"}</span>
      {pinField(newPin2, setNewPin2, null, "new-password")}
    </>
  );
  const forgotLink = <button type="button" style={link} onClick={() => setMode("forgot")}>{bn ? "পিন ভুলে গেছেন? ইমেইলে কোড নিন" : "Forgot PIN? Get a code by email"}</button>;

  const title = {
    unlock: bn ? "মালিকের পিন দিন" : "Enter owner PIN",
    setup: bn ? "মালিকের পিন তৈরি করুন" : "Create owner PIN",
    change: bn ? "পিন পরিবর্তন করুন" : "Change PIN",
    forgot: bn ? "ইমেইল দিয়ে নতুন পিন" : "Reset PIN by email",
  }[mode] || (bn ? "মালিকের পিন" : "Owner PIN");

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{ position: "fixed", inset: 0, zIndex: 10100, background: "rgba(15,23,42,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 380, background: "#fff", borderRadius: 16, padding: 22, boxShadow: "0 24px 60px rgba(2,6,23,0.4)", color: "#0f172a" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ fontSize: 17, fontWeight: 900 }}>🔒 {title}</div>
          <button type="button" onClick={onClose} style={{ border: "none", background: "transparent", fontSize: 20, cursor: "pointer", color: "#64748b" }}>✕</button>
        </div>
        {mode === null && <div style={{ padding: 20, textAlign: "center", color: "#64748b" }}>⏳</div>}

        {mode === "unlock" && (
          <form onSubmit={submitUnlock}>
            <div style={hint}>{bn ? "গোপন হিসাব দেখতে আপনার ব্যক্তিগত পিন দিন।" : "Enter your personal PIN to view private figures."}</div>
            {pinField(pin, setPin, firstRef)}
            {errorBox}
            <button type="submit" disabled={busy} style={primary}>{busy ? "…" : (bn ? "খুলুন" : "Unlock")}</button>
            <div style={{ textAlign: "center" }}>{forgotLink}</div>
          </form>
        )}

        {mode === "setup" && (
          <form onSubmit={submitSetup}>
            <div style={hint}>{bn ? "ড্যাশবোর্ডের টাকার হিসাব, Accounts আর চেক ফোল্ডার এই পিন ছাড়া দেখা যাবে না।" : "Dashboard money, Accounts and cheque folders will need this PIN."}</div>
            <span style={lbl}>{bn ? "লগইন পাসওয়ার্ড" : "Login password"}</span>
            <input ref={firstRef} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} style={inp} />
            {newPinFields}
            {errorBox}
            <button type="submit" disabled={busy} style={primary}>{busy ? "…" : (bn ? "পিন সেভ করে খুলুন" : "Save PIN & unlock")}</button>
          </form>
        )}

        {mode === "change" && (
          <form onSubmit={submitChange}>
            <div style={hint}>{bn ? "আগে বর্তমান পিন দিন, তারপর নতুন পিন।" : "Enter your current PIN, then the new PIN."}</div>
            <span style={lbl}>{bn ? "বর্তমান পিন" : "Current PIN"}</span>
            {pinField(currentPin, setCurrentPin, firstRef)}
            {newPinFields}
            {errorBox}
            <button type="submit" disabled={busy} style={primary}>{busy ? "…" : (bn ? "পিন পরিবর্তন করুন" : "Change PIN")}</button>
            <div style={{ textAlign: "center" }}>{forgotLink}</div>
          </form>
        )}

        {mode === "forgot" && !sentTo && (
          <div>
            <div style={hint}>{bn ? "আপনার লগইন ইমেইলে একটা ৬ সংখ্যার কোড পাঠানো হবে। কোড দিয়ে নতুন পিন সেট করবেন।" : "A 6-digit code will be sent to your login email. Use it to set a new PIN."}</div>
            {errorBox}
            <button type="button" disabled={busy} style={primary} onClick={sendCode}>{busy ? "…" : (bn ? "📧 ইমেইলে কোড পাঠান" : "📧 Send code to email")}</button>
            <div style={{ textAlign: "center" }}>
              <button type="button" style={link} onClick={() => setMode(modeFor(hasPin))}>{bn ? "← ফিরে যান" : "← Back"}</button>
            </div>
          </div>
        )}

        {mode === "forgot" && sentTo && (
          <form onSubmit={submitForgot}>
            <div style={hint}>{bn ? `কোড পাঠানো হয়েছে: ${sentTo} (১০ মিনিট চলবে)। Spam ফোল্ডারও দেখুন।` : `Code sent to ${sentTo} (valid 10 minutes). Check spam too.`}</div>
            <span style={lbl}>{bn ? "ইমেইলের কোড" : "Email code"}</span>
            <input ref={firstRef} type="text" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(digits(e.target.value))} style={pinInp} placeholder="000000" />
            {newPinFields}
            {errorBox}
            <button type="submit" disabled={busy} style={primary}>{busy ? "…" : (bn ? "পিন সেভ করে খুলুন" : "Save PIN & unlock")}</button>
            <div style={{ textAlign: "center" }}>
              <button type="button" style={{ ...link, opacity: resendIn > 0 ? 0.5 : 1 }} disabled={busy || resendIn > 0} onClick={sendCode}>
                {resendIn > 0 ? (bn ? `আবার কোড পাঠান (${resendIn}s)` : `Resend code (${resendIn}s)`) : (bn ? "আবার কোড পাঠান" : "Resend code")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
