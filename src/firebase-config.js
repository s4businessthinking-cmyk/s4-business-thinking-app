// ============================================================
// 🔥 FIREBASE CONFIG — S4 Business Thinking
// ============================================================
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDceMFkkUFUz8tnFvZIe-pt9v5mDd0Hn4o",
  authDomain: "s4-business-thinking-31213.firebaseapp.com",
  projectId: "s4-business-thinking-31213",
  storageBucket: "s4-business-thinking-31213.firebasestorage.app",
  messagingSenderId: "914122331076",
  appId: "1:914122331076:web:56c00d69c5d8f467038a91",
  measurementId: "G-5NFNKEZWQX"
};

export const FIREBASE_READY = true;

let _auth = null, _db = null;
try {
  const app = initializeApp(firebaseConfig);
  _auth = getAuth(app);
  _db = getFirestore(app);
} catch (e) {
  console.error("Firebase init failed:", e);
}

export const auth = _auth;
export const db = _db;

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
    "auth/email-already-in-use": "এই ইমেইল ইতিমধ্যে ব্যবহৃত হয়েছে। লগইন করুন অথবা অন্য ইমেইল ব্যবহার করুন।",
    "auth/weak-password": "পাসওয়ার্ড দুর্বল (৬ অক্ষরের বেশি দিন)",
    "auth/too-many-requests": "অনেকবার চেষ্টা করেছেন, কিছুক্ষণ পর আবার চেষ্টা করুন",
    "auth/network-request-failed": "ইন্টারনেট সংযোগ চেক করুন",
    "validation/required": "সব ঘর পূরণ করুন",
    "validation/short-password": "পাসওয়ার্ড ৬ অক্ষরের বেশি হতে হবে",
    "validation/password-mismatch": "পাসওয়ার্ড দুইবার একই হতে হবে",
    "invite/required": "ইনভাইট কোড লাগবে (মালিকের কাছ থেকে নিন)",
    "invite/not-found": "ইনভাইট কোড ভুল বা মেয়াদ শেষ। মালিকের কাছ থেকে নতুন কোড নিন।",
    "profile/create-failed": "প্রোফাইল তৈরি করতে সমস্যা। আবার চেষ্টা করুন।",
    "shop/create-failed": "দোকান তৈরি করতে সমস্যা। আবার চেষ্টা করুন।",
  };
  return map[e.code] || e.message || String(e);
};
