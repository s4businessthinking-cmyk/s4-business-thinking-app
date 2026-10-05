import { hashPassword, verifyPassword } from "./passwordService";
import { getLocalUserById, getLocalUserByFirebaseUid, verifyLocalUserPassword } from "./localAuthService";
import { doc, getDoc, setDoc } from "../backend/firestore";
import { db, auth } from "../firebase-config";

const cacheKey = (uid) => `s4_owner_pin_${uid}`;

function readCached(uid) {
  try {
    const raw = localStorage.getItem(cacheKey(uid));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCached(uid, record) {
  try {
    localStorage.setItem(cacheKey(uid), JSON.stringify(record));
  } catch {}
}

const canReachCloud = (uid) => navigator.onLine && auth?.currentUser?.uid === uid;

/** The owner's PIN record ({ passwordHash, passwordSalt, ... , setAt }) or null when no PIN is set yet. */
export async function loadOwnerPin(uid) {
  if (!uid) return null;
  let record = readCached(uid);
  if (canReachCloud(uid)) {
    try {
      const snap = await getDoc(doc(db, "users", uid));
      const cloud = snap.exists() ? snap.data()?.ownerPin : null;
      if (cloud?.passwordHash && String(cloud.setAt || "") >= String(record?.setAt || "")) {
        record = cloud;
        writeCached(uid, cloud);
      } else if (record?.passwordHash) {
        await setDoc(doc(db, "users", uid), { ownerPin: record }, { merge: true });
      }
    } catch (error) {
      console.warn("[S4 PIN] cloud read failed", error);
    }
  }
  return record?.passwordHash ? record : null;
}

export async function verifyOwnerPin(uid, pin) {
  const record = await loadOwnerPin(uid);
  if (!record) return false;
  const result = await verifyPassword(String(pin || ""), record);
  return !!result.ok;
}

export async function verifyOwnerLoginPassword(localUserId, password, uid = "") {
  const localUser = (localUserId ? await getLocalUserById(localUserId) : null)
    || (uid ? await getLocalUserByFirebaseUid(uid) : null);
  if (!localUser?.username) return false;
  const result = await verifyLocalUserPassword(localUser.username, password, { createSession: false });
  return !!result.ok;
}

export const isValidPin = (pin) => /^\d{4,6}$/.test(String(pin || ""));

export async function saveOwnerPin(uid, pin) {
  if (!isValidPin(pin)) throw new Error("PIN must be 4-6 digits");
  const record = { ...(await hashPassword(String(pin))), setAt: new Date().toISOString() };
  writeCached(uid, record);
  if (canReachCloud(uid)) {
    try {
      await setDoc(doc(db, "users", uid), { ownerPin: record }, { merge: true });
    } catch (error) {
      console.warn("[S4 PIN] cloud save failed", error);
    }
  }
  return record;
}
