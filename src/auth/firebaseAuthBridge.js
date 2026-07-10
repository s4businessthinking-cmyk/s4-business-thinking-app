import { initializeApp, getApps } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  sendEmailVerification,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { deleteDoc, doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase-config";

const LOCAL_EMAIL_DOMAIN = "s4local.app";

const firebaseConfig = {
  apiKey: "AIzaSyDceMFkkUFUz8tnFvZIe-pt9v5mDd0Hn4o",
  authDomain: "s4-business-thinking-31213.firebaseapp.com",
  projectId: "s4-business-thinking-31213",
  storageBucket: "s4-business-thinking-31213.firebasestorage.app",
  messagingSenderId: "914122331076",
  appId: "1:914122331076:web:56c00d69c5d8f467038a91",
};

const PROVISIONER_APP_NAME = "s4-staff-provisioner";

export function sanitizeEmailPart(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "") || "user";
}

export function buildLocalAuthEmail(username, shopId, providedEmail = "") {
  const trimmed = String(providedEmail || "").trim().toLowerCase();
  if (trimmed && trimmed.includes("@") && !trimmed.endsWith(`@${LOCAL_EMAIL_DOMAIN}`)) {
    return { email: trimmed, isRealEmail: true };
  }

  const userPart = sanitizeEmailPart(username);
  const shopPart = sanitizeEmailPart(shopId);
  return {
    email: `${userPart}.${shopPart}@${LOCAL_EMAIL_DOMAIN}`,
    isRealEmail: false,
  };
}

export function resolveLocalUserAuthEmail(localUser) {
  const stored = String(localUser?.email || "").trim().toLowerCase();
  if (stored && stored.includes("@")) {
    return stored;
  }

  if (!localUser?.username || !localUser?.shopId) return "";
  return buildLocalAuthEmail(localUser.username, localUser.shopId).email;
}

export function isRealAuthEmail(email) {
  const value = String(email || "").trim().toLowerCase();
  return Boolean(value && value.includes("@") && !value.endsWith(`@${LOCAL_EMAIL_DOMAIN}`));
}

export function isOnline() {
  return typeof navigator !== "undefined" ? navigator.onLine : false;
}

function getProvisionerAuth() {
  const existing = getApps().find((app) => app.name === PROVISIONER_APP_NAME);
  const app = existing || initializeApp(firebaseConfig, PROVISIONER_APP_NAME);
  return getAuth(app);
}

export function assertFirebaseReady(requireNetwork = true) {
  if (!auth || !db) {
    const error = new Error("Firebase is not ready.");
    error.code = "FIREBASE_UNAVAILABLE";
    throw error;
  }

  if (requireNetwork && !isOnline()) {
    const error = new Error("Internet connection is required for this action.");
    error.code = "OFFLINE_REQUIRED";
    throw error;
  }
}

export async function createFirebaseAccount(email, password, { useProvisioner = false } = {}) {
  assertFirebaseReady(true);
  const authInstance = useProvisioner ? getProvisionerAuth() : auth;
  const cred = await createUserWithEmailAndPassword(authInstance, email, password);
  return cred.user;
}

export async function signInFirebaseAccount(email, password) {
  assertFirebaseReady(true);
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  return cred.user;
}

export async function sendVerificationEmailIfNeeded(firebaseUser) {
  if (!firebaseUser || firebaseUser.emailVerified) return false;
  if (!isRealAuthEmail(firebaseUser.email)) return false;
  await sendEmailVerification(firebaseUser);
  return true;
}

export async function writeCloudUserProfile(firebaseUid, data = {}) {
  assertFirebaseReady(false);
  await setDoc(
    doc(db, "users", firebaseUid),
    {
      ...data,
      uid: firebaseUid,
      id: firebaseUid,
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

export async function writeCloudShop(shopId, data = {}) {
  assertFirebaseReady(false);
  await setDoc(
    doc(db, "shops", shopId),
    {
      ...data,
      id: shopId,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

export async function writeCloudInviteCode(code, shopId) {
  assertFirebaseReady(false);
  await setDoc(doc(db, "inviteCodes", code), {
    shopId,
    used: false,
    createdAt: serverTimestamp(),
  });
}

export function normalizeStaffUsername(username) {
  return String(username || "").trim().toLowerCase();
}

export async function writeStaffLoginIndex({
  username,
  shopId,
  authEmail,
  firebaseUid,
  personName = "",
} = {}) {
  assertFirebaseReady(false);

  const id = normalizeStaffUsername(username);
  if (!id || !shopId || !authEmail || !firebaseUid) {
    throw new Error("Staff login index requires username, shopId, authEmail, and firebaseUid.");
  }

  await setDoc(
    doc(db, "staffLoginIndex", id),
    {
      username: id,
      shopId,
      authEmail,
      firebaseUid,
      personName,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

export async function lookupStaffLoginIndex(username) {
  if (!db) return null;

  const id = normalizeStaffUsername(username);
  if (!id) return null;

  const snap = await getDoc(doc(db, "staffLoginIndex", id));
  return snap.exists() ? snap.data() : null;
}

export async function deleteStaffLoginIndex(username) {
  if (!db) return;

  const id = normalizeStaffUsername(username);
  if (!id) return;

  try {
    await deleteDoc(doc(db, "staffLoginIndex", id));
  } catch (error) {
    console.warn("[S4 Auth] Could not delete staff login index", id, error);
  }
}
