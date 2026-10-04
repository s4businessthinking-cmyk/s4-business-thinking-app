// ============================================================
// ☁️ CLOUD CONFIG — S4 Business Thinking (own ERP server on the VPS)
// ============================================================
import { getAuth } from "./backend/auth";
import { getFirestore } from "./backend/firestore";

export const FIREBASE_READY = true;

export const auth = getAuth();
export const db = getFirestore();

// ============================================================
// COUNTRIES — for sign up form
// ============================================================
export const COUNTRIES = [
  { code: "BD", name: "Bangladesh", dial: "+880" },
  { code: "IN", name: "India",      dial: "+91" },
  { code: "PK", name: "Pakistan",   dial: "+92" },
  { code: "MY", name: "Malaysia",   dial: "+60" },
  { code: "SG", name: "Singapore",  dial: "+65" },
  { code: "AE", name: "UAE",        dial: "+971" },
  { code: "SA", name: "Saudi Arabia", dial: "+966" },
  { code: "GB", name: "UK",         dial: "+44" },
  { code: "US", name: "USA",        dial: "+1" },
];

// ============================================================
// HELPERS
// ============================================================
export const generateInviteCode = () =>
  Math.random().toString(36).slice(2, 8).toUpperCase();

export const friendlyAuthError = (e) => {
  const map = {
    "auth/invalid-email": "ইমেইল ফরম্যাট ভুল",
    "auth/user-not-found": "এই ইমেইলে কোন অ্যাকাউন্ট নেই",
    "auth/wrong-password": "পাসওয়ার্ড ভুল",
    "auth/invalid-credential": "ইমেইল বা পাসওয়ার্ড ভুল",
    "auth/email-already-in-use": "এই ইমেইল ইতিমধ্যে ব্যবহৃত হয়েছে",
    "auth/weak-password": "পাসওয়ার্ড দুর্বল (৬ অক্ষরের বেশি দিন)",
    "auth/too-many-requests": "অনেকবার চেষ্টা করেছেন, কিছুক্ষণ পর আবার চেষ্টা করুন",
    "auth/network-request-failed": "ইন্টারনেট সংযোগ চেক করুন",
    "auth/session-expired": "লগইন সেশন শেষ হয়েছে, আবার লগইন করুন",
    "auth/user-disabled": "এই অ্যাকাউন্ট বন্ধ করা আছে",
    "auth/password-reset-unavailable": "ইমেইলে পাসওয়ার্ড রিসেট এখন নেই — দোকান মালিক বা S4 সাপোর্টের সাথে যোগাযোগ করুন",
  };
  return map[e.code] || e.message || String(e);
};