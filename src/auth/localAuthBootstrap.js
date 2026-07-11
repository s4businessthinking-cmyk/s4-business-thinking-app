import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { bootOfflineSqlite } from "../offline/sqliteDb";
import { auth, db, generateInviteCode } from "../firebase-config";
import {
  assertFirebaseReady,
  buildLocalAuthEmail,
  createFirebaseAccount,
  isRealAuthEmail,
  lookupStaffLoginIndex,
  resolveLocalUserAuthEmail,
  sendVerificationEmailIfNeeded,
  writeCloudInviteCode,
  writeCloudShop,
  writeCloudUserProfile,
  writeStaffLoginIndex,
} from "./firebaseAuthBridge";
import {
  countLocalUsers,
  createLocalUser,
  getLocalUserById,
  getLocalUserByEmail,
  getLocalUserByFirebaseUid,
  updateLocalUserProfile,
  updateLocalUserPassword,
  verifyLocalUserPassword,
} from "./localAuthService";
import {
  getActiveOfflineSession,
  clearOfflineSessions,
} from "./authSession";
import { saveShopRecord } from "../offline/shopService";
import { offlineGetById } from "../offline/offlineRepository";

function isDisabledMember(data = {}) {
  const status = String(data.status || "active").toLowerCase();
  return status === "disabled" || status === "closed" || data.isDeleted === true;
}

async function finalizeStaffLocalLogin(localUser) {
  if (!localUser || localUser.role === "owner") {
    return { ok: true, localUser, profileExtras: {} };
  }

  const uid = localUser.firebaseUid || localUser.id;
  let memberData = null;

  try {
    const row = await offlineGetById("users", uid);
    memberData = row?.data || null;
  } catch (error) {
    console.warn("[S4 Auth] offline member profile read failed", error);
  }

  if (isOnline() && db && auth?.currentUser?.uid === uid) {
    try {
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        memberData = { ...(memberData || {}), ...snap.data() };
      }
    } catch (error) {
      console.warn("[S4 Auth] cloud member profile refresh failed", error);
    }
  }

  if (memberData && isDisabledMember(memberData)) {
    return { ok: false, reason: "ACCOUNT_DISABLED" };
  }

  const profileExtras = {};
  const updates = {};
  let nextUser = localUser;

  if (memberData?.permissions !== undefined && memberData?.permissions !== null) {
    updates.permissions = memberData.permissions;
    profileExtras.permissions = memberData.permissions;
  }
  if (memberData?.position) {
    profileExtras.position = memberData.position;
  }

  if (Object.keys(updates).length) {
    await updateLocalUserProfile(localUser.id, updates);
    nextUser = await getLocalUserById(localUser.id);
  }

  return { ok: true, localUser: nextUser, profileExtras };
}

function createId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
    .slice(6, 8)
    .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export function buildAppUserFromLocal(localUser) {
  const uid = localUser.firebaseUid || localUser.id;

  return {
    uid,
    id: localUser.id,
    email: localUser.email || "",
    displayName: localUser.personName || localUser.username,
    emailVerified: true,
    isLocalAuth: true,
    localUserId: localUser.id,
    async getIdToken() {
      return "local-offline-token";
    },
  };
}

export function buildProfileFromLocal(localUser, extras = {}) {
  const uid = localUser.firebaseUid || localUser.id;

  return {
    uid,
    id: uid,
    role: localUser.role,
    shopId: localUser.shopId || "",
    personName: localUser.personName || localUser.username,
    username: localUser.username,
    email: localUser.email || extras.email || "",
    mobile: extras.mobile || "",
    country: extras.country || "BD",
    countryName: extras.countryName || "",
    area: extras.area || "",
    position: localUser.role === "owner" ? "মালিক" : "Salesman",
    permissions:
      localUser.role === "owner"
        ? null
        : localUser.permissions || extras.permissions || null,
    mustChangePassword: localUser.mustChangePassword,
    isEmergencyBootstrap: localUser.isEmergencyBootstrap,
    isLocalAuth: true,
    localUserId: localUser.id,
    ...extras,
  };
}

function buildDefaultShop(shopId, ownerUser) {
  return {
    id: shopId,
    companyName: "",
    ownerName: ownerUser.personName || "Admin",
    ownerUid: ownerUser.id,
    country: "BD",
    area: "",
    mobile: "",
    email: "",
    positions: [],
    inviteCode: generateInviteCode(),
    createdAt: new Date().toISOString(),
  };
}

function readLegacyCachedProfile() {
  if (typeof localStorage === "undefined") return null;

  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith("s4-auth-profile-cache-v1:")) continue;

      const raw = localStorage.getItem(key);
      if (!raw) continue;

      const profile = JSON.parse(raw);
      if (profile?.uid || profile?.shopId) return profile;
    }
  } catch {
    return null;
  }

  return null;
}

function readLegacyCachedShop(shopId) {
  if (!shopId || typeof localStorage === "undefined") return null;

  try {
    const raw = localStorage.getItem(`s4-auth-shop-cache-v1:${shopId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function ensureLocalAuthBootstrap() {
  await bootOfflineSqlite();

  const count = await countLocalUsers();
  if (count > 0) {
    return { bootstrapped: false, shop: null };
  }

  const legacyProfile = readLegacyCachedProfile();
  const shopId = legacyProfile?.shopId || createId();
  const legacyShop = readLegacyCachedShop(shopId);
  const role = legacyProfile?.role === "salesman" ? "salesman" : "owner";

  const admin = await createLocalUser({
    username: "admin",
    password: "admin",
    role,
    personName: legacyProfile?.personName || "Admin",
    email: legacyProfile?.email || "",
    firebaseUid: legacyProfile?.uid || "",
    shopId,
    permissions: legacyProfile?.permissions || null,
    mustChangePassword: true,
    isEmergencyBootstrap: true,
  });

  const shop =
    legacyShop ||
    buildDefaultShop(shopId, admin);

  if (legacyShop) {
    shop.ownerUid = admin.id;
  }

  createLocalInviteCodesForShop(shopId, 3);

  await saveShopRecord(shopId, shop, {
    ownerUid: admin.id,
    profile: buildProfileFromLocal(admin),
    user: buildAppUserFromLocal(admin),
  });

  return {
    bootstrapped: true,
    admin,
    shop,
  };
}

export async function restoreLocalAuthSession() {
  await ensureLocalAuthBootstrap();

  const session = await getActiveOfflineSession();
  if (!session) return null;

  const localUser = await getLocalUserById(session.userId);
  if (!localUser) {
    await clearOfflineSessions();
    return null;
  }

  const access = await finalizeStaffLocalLogin(localUser);
  if (!access.ok) {
    await clearOfflineSessions();
    return null;
  }

  const finalUser = access.localUser || localUser;

  return {
    session,
    localUser: finalUser,
    user: buildAppUserFromLocal(finalUser),
    profile: buildProfileFromLocal(finalUser, access.profileExtras || {}),
  };
}

function looksLikeEmail(value) {
  return String(value || "").includes("@");
}

function isOnline() {
  return typeof navigator !== "undefined" ? navigator.onLine : false;
}

async function ensureFirebaseSignedInAfterLocalLogin(localUser, password) {
  if (!isOnline() || !auth || !db) return localUser;

  let currentUser = localUser;
  const authEmail = resolveLocalUserAuthEmail(currentUser);
  if (!authEmail) return currentUser;

  if (auth.currentUser?.uid === currentUser.firebaseUid) {
    return currentUser;
  }

  try {
    await signInWithEmailAndPassword(auth, authEmail, password);
    return currentUser;
  } catch (error) {
    const code = error?.code || "";
    const canProvision =
      !currentUser.firebaseUid &&
      currentUser.shopId &&
      (code === "auth/user-not-found" ||
        code === "auth/invalid-credential" ||
        code === "auth/invalid-login-credentials");

    if (!canProvision) {
      console.warn(
        "[S4 Auth] Firebase session was not established after local login:",
        error?.message || error
      );
      return currentUser;
    }
  }

  try {
    const fbUser = await createFirebaseAccount(authEmail, password);
    await updateLocalUserProfile(currentUser.id, {
      firebaseUid: fbUser.uid,
      email: authEmail,
    });

    await writeCloudUserProfile(fbUser.uid, {
      role: currentUser.role,
      shopId: currentUser.shopId,
      personName: currentUser.personName,
      username: currentUser.username,
      email: authEmail,
      position: currentUser.role === "owner" ? "মালিক" : "Salesman",
      permissions: currentUser.permissions,
      localUserId: currentUser.id,
    });

    if (currentUser.role === "owner" && currentUser.shopId) {
      const cachedShop = readLegacyCachedShop(currentUser.shopId);
      if (cachedShop) {
        await writeCloudShop(currentUser.shopId, {
          ...cachedShop,
          ownerUid: fbUser.uid,
        });
      }
    }

    currentUser = await getLocalUserById(currentUser.id);
    return currentUser;
  } catch (provisionError) {
    console.warn(
      "[S4 Auth] Could not provision Firebase account for local user:",
      provisionError?.message || provisionError
    );
    return localUser;
  }
}

async function seedCloudInviteCodesForShop(shopId, codes = []) {
  if (!db || !shopId || !codes.length) return;

  for (const code of codes) {
    try {
      await writeCloudInviteCode(code, shopId);
    } catch (error) {
      console.warn("[S4 Auth] Could not write cloud invite code", code, error);
    }
  }
}

async function loginWithFirebaseEmail(email, password) {
  if (!auth || !db) {
    return { ok: false, reason: "FIREBASE_UNAVAILABLE" };
  }

  let cred;
  try {
    cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  } catch (error) {
    try { await signOut(auth); } catch {}
    throw error;
  }

  const fbUser = cred.user;

  if (!fbUser.emailVerified && isRealAuthEmail(fbUser.email)) {
    try { await signOut(auth); } catch {}
    return {
      ok: false,
      reason: "EMAIL_NOT_VERIFIED",
      rawFirebaseUser: fbUser,
    };
  }

  const profSnap = await getDoc(doc(db, "users", fbUser.uid));
  if (!profSnap.exists()) {
    try { await signOut(auth); } catch {}
    return { ok: false, reason: "PROFILE_NOT_FOUND" };
  }

  const profData = profSnap.data();

  if (profData.status === "disabled" || profData.status === "closed" || profData.isDeleted === true) {
    try { await signOut(auth); } catch {}
    return { ok: false, reason: "ACCOUNT_DISABLED" };
  }

  let shop = null;

  if (profData.shopId) {
    const shopSnap = await getDoc(doc(db, "shops", profData.shopId));
    if (shopSnap.exists()) {
      shop = { id: shopSnap.id, ...shopSnap.data() };
    }
  }

  const normalizedEmail = email.trim().toLowerCase();
  let localUser = await getLocalUserByFirebaseUid(fbUser.uid);

  if (!localUser) {
    localUser = await getLocalUserByEmail(normalizedEmail);
  }

  if (localUser) {
    await updateLocalUserPassword(localUser.id, password, {
      clearEmergencyBootstrap: true,
    });
    await updateLocalUserProfile(localUser.id, {
      email: fbUser.email || normalizedEmail,
      firebaseUid: fbUser.uid,
      shopId: profData.shopId || localUser.shopId || "",
      role: profData.role || localUser.role,
      personName: profData.personName || localUser.personName,
      permissions: profData.permissions ?? localUser.permissions,
    });
    localUser = await getLocalUserById(localUser.id);
  } else {
    localUser = await createLocalUser({
      username: profData.username || normalizedEmail.split("@")[0],
      password,
      role: profData.role === "salesman" ? "salesman" : "owner",
      personName: profData.personName || profData.username || normalizedEmail.split("@")[0],
      email: fbUser.email || normalizedEmail,
      firebaseUid: fbUser.uid,
      shopId: profData.shopId || "",
      permissions: profData.permissions ?? null,
      mustChangePassword: false,
      isEmergencyBootstrap: false,
    });
  }

  const login = await verifyLocalUserPassword(localUser.username, password, {
    createSession: true,
  });

  if (!login.ok) {
    return login;
  }

  const profileExtras = {
    mobile: profData.mobile || "",
    country: profData.country || "BD",
    countryName: profData.countryName || "",
    area: profData.area || "",
    companyName: profData.companyName || shop?.companyName || "",
    joinedShopName: profData.joinedShopName || "",
    permissions: profData.permissions ?? null,
  };

  const user = buildAppUserFromLocal(localUser);
  user.email = fbUser.email || user.email;
  user.emailVerified = true;

  return {
    ok: true,
    user,
    profile: buildProfileFromLocal(localUser, profileExtras),
    shop,
    migratedFromFirebase: true,
  };
}

export async function loginWithLocalCredentials(username, password) {
  return loginWithCredentials(username, password);
}

async function loginWithRemoteStaffUsername(username, password) {
  if (!isOnline() || !auth || !db) {
    return { ok: false, reason: "OFFLINE_STAFF_LOGIN" };
  }

  const index = await lookupStaffLoginIndex(username);
  if (!index?.authEmail) {
    return { ok: false, reason: "USER_NOT_FOUND" };
  }

  try {
    return await loginWithFirebaseEmail(index.authEmail, password);
  } catch (error) {
    const code = error?.code || "";
    if (
      code === "auth/wrong-password" ||
      code === "auth/invalid-credential" ||
      code === "auth/invalid-login-credentials"
    ) {
      return { ok: false, reason: "INVALID_PASSWORD" };
    }

    return {
      ok: false,
      reason: "FIREBASE_ERROR",
      code,
      message: error?.message || String(error),
    };
  }
}

export async function loginWithCredentials(identifier, password) {
  await ensureLocalAuthBootstrap();

  const trimmed = String(identifier || "").trim();
  if (!trimmed || !password) {
    return { ok: false, reason: "VALIDATION" };
  }

  let localResult = await verifyLocalUserPassword(trimmed, password, {
    createSession: true,
  });

  if (!localResult.ok && localResult.reason === "USER_NOT_FOUND" && looksLikeEmail(trimmed)) {
    const byEmail = await getLocalUserByEmail(trimmed);
    if (byEmail) {
      localResult = await verifyLocalUserPassword(byEmail.username, password, {
        createSession: true,
      });
    }
  }

  if (localResult.ok) {
    const linkedUser = await ensureFirebaseSignedInAfterLocalLogin(localResult.user, password);
    const access = await finalizeStaffLocalLogin(linkedUser || localResult.user);
    if (!access.ok) {
      await clearOfflineSessions();
      try { await signOut(auth); } catch {}
      return access;
    }

    const finalUser = access.localUser || linkedUser || localResult.user;
    const shopId = finalUser?.shopId || localResult.user?.shopId;
    return {
      ok: true,
      user: buildAppUserFromLocal(finalUser),
      profile: buildProfileFromLocal(finalUser, access.profileExtras || {}),
      shop: shopId ? readLegacyCachedShop(shopId) : null,
    };
  }

  if (localResult.reason === "LOCKED") {
    return localResult;
  }

  if (looksLikeEmail(trimmed)) {
    if (!isOnline()) {
      if (localResult.reason === "INVALID_PASSWORD") {
        return { ok: false, reason: "OFFLINE_EMAIL" };
      }
      return localResult.reason === "USER_NOT_FOUND"
        ? { ok: false, reason: "OFFLINE_EMAIL" }
        : localResult;
    }

    try {
      const firebaseResult = await loginWithFirebaseEmail(trimmed, password);
      if (firebaseResult.ok || firebaseResult.reason === "EMAIL_NOT_VERIFIED") {
        return firebaseResult;
      }
      if (localResult.reason === "INVALID_PASSWORD") {
        return localResult;
      }
      return firebaseResult;
    } catch (error) {
      if (localResult.reason === "INVALID_PASSWORD") {
        return localResult;
      }
      return {
        ok: false,
        reason: "FIREBASE_ERROR",
        code: error?.code || "",
        message: error?.message || String(error),
      };
    }
  }

  if (
    !localResult.ok &&
    localResult.reason === "USER_NOT_FOUND" &&
    !looksLikeEmail(trimmed)
  ) {
    if (!isOnline()) {
      return { ok: false, reason: "OFFLINE_STAFF_LOGIN" };
    }

    const remoteResult = await loginWithRemoteStaffUsername(trimmed, password);
    if (remoteResult.ok || remoteResult.reason === "EMAIL_NOT_VERIFIED") {
      return remoteResult;
    }
    if (remoteResult.reason === "INVALID_PASSWORD") {
      return remoteResult;
    }
  }

  return localResult;
}

export async function logoutLocalAuth() {
  await clearOfflineSessions();
}

const LOCAL_INVITE_CODES_KEY = "s4-local-invite-codes-v1";

function loadLocalInviteCodesMap() {
  if (typeof localStorage === "undefined") return {};

  try {
    const raw = localStorage.getItem(LOCAL_INVITE_CODES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalInviteCodesMap(map) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LOCAL_INVITE_CODES_KEY, JSON.stringify(map));
  } catch {}
}

export function createLocalInviteCodesForShop(shopId, count = 3) {
  const map = loadLocalInviteCodesMap();
  const codes = [];

  for (let i = 0; i < count; i += 1) {
    const code = generateInviteCode();
    map[code] = {
      shopId,
      used: false,
      createdAt: new Date().toISOString(),
    };
    codes.push(code);
  }

  saveLocalInviteCodesMap(map);
  return codes;
}

export function addLocalInviteCode(shopId, code) {
  if (!shopId || !code) return;

  const map = loadLocalInviteCodesMap();
  map[String(code).toUpperCase()] = {
    shopId,
    used: false,
    createdAt: new Date().toISOString(),
  };
  saveLocalInviteCodesMap(map);
}

async function resolveInviteCode(inviteCode) {
  const code = String(inviteCode || "").trim().toUpperCase();
  if (!code) throw { code: "invite/required" };

  const localMap = loadLocalInviteCodesMap();
  const localEntry = localMap[code];

  if (localEntry) {
    if (localEntry.used) throw { code: "invite/already-used" };

    const shopData = readLegacyCachedShop(localEntry.shopId);
    if (!shopData) throw { code: "invite/not-found" };

    return {
      code,
      shopId: localEntry.shopId,
      shopData,
      source: "local",
    };
  }

  const online = typeof navigator !== "undefined" ? navigator.onLine : false;
  if (!online || !db) throw { code: "invite/not-found" };

  const codeRef = doc(db, "inviteCodes", code);
  const codeSnap = await getDoc(codeRef);
  if (!codeSnap.exists()) throw { code: "invite/not-found" };
  if (codeSnap.data().used === true) throw { code: "invite/already-used" };

  const shopId = codeSnap.data().shopId;
  const shopSnap = await getDoc(doc(db, "shops", shopId));
  if (!shopSnap.exists()) throw { code: "invite/not-found" };

  return {
    code,
    shopId,
    shopData: shopSnap.data(),
    source: "cloud",
  };
}

async function markInviteCodeUsed(inviteInfo, usedBy, usedByName) {
  if (inviteInfo.source === "local") {
    const map = loadLocalInviteCodesMap();
    if (map[inviteInfo.code]) {
      map[inviteInfo.code] = {
        ...map[inviteInfo.code],
        used: true,
        usedBy,
        usedByName,
        usedAt: new Date().toISOString(),
      };
      saveLocalInviteCodesMap(map);
    }
    return;
  }

  if (!db) return;

  try {
    await updateDoc(doc(db, "inviteCodes", inviteInfo.code), {
      used: true,
      usedBy,
      usedByName,
      usedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.warn("[S4 Auth] Could not mark cloud invite code used", error);
    throw new Error("Invite code could not be marked used in cloud. Check internet and try again.");
  }
}

export async function registerLocalOwnerAccount({
  username,
  password,
  personName,
  companyName,
  country = "BD",
  countryName = "",
  area = "",
  mobile = "",
  email = "",
} = {}) {
  await bootOfflineSqlite();
  assertFirebaseReady(true);

  const shopId = createId();
  const authEmail = buildLocalAuthEmail(username, shopId, email);
  const fbUser = await createFirebaseAccount(authEmail.email, password);
  const verificationSent = await sendVerificationEmailIfNeeded(fbUser);

  const localUser = await createLocalUser({
    username,
    password,
    role: "owner",
    personName,
    email: authEmail.email,
    firebaseUid: fbUser.uid,
    shopId,
    mustChangePassword: false,
    isEmergencyBootstrap: false,
  });

  const shop = {
    id: shopId,
    companyName: String(companyName || "").trim(),
    ownerName: personName,
    ownerUid: fbUser.uid,
    country,
    countryName,
    area: String(area || "").trim(),
    mobile: String(mobile || "").trim(),
    email: String(email || "").trim(),
    positions: [],
    inviteCode: generateInviteCode(),
    createdAt: new Date().toISOString(),
  };

  const inviteCodes = createLocalInviteCodesForShop(shopId, 3);
  await seedCloudInviteCodesForShop(shopId, inviteCodes);

  const profileExtras = {
    mobile: shop.mobile,
    country,
    countryName,
    area: shop.area,
    companyName: shop.companyName,
  };

  await writeCloudShop(shopId, shop);
  await writeCloudUserProfile(fbUser.uid, {
    role: "owner",
    shopId,
    personName,
    username,
    email: authEmail.email,
    mobile: shop.mobile,
    country,
    countryName,
    area: shop.area,
    companyName: shop.companyName,
    position: "মালিক",
    localUserId: localUser.id,
  });

  await saveShopRecord(shopId, shop, {
    ownerUid: fbUser.uid,
    profile: buildProfileFromLocal(localUser, profileExtras),
    user: buildAppUserFromLocal(localUser),
  });

  const login = await verifyLocalUserPassword(username, password, {
    createSession: true,
  });

  if (!login.ok) {
    return login;
  }

  const appUser = buildAppUserFromLocal(localUser);
  appUser.email = authEmail.isRealEmail ? authEmail.email : email || "";
  appUser.emailVerified = !authEmail.isRealEmail || fbUser.emailVerified;

  if (authEmail.isRealEmail && !fbUser.emailVerified) {
    return {
      ok: true,
      needsEmailVerification: true,
      verificationSent,
      rawFirebaseUser: fbUser,
      user: appUser,
      profile: buildProfileFromLocal(localUser, profileExtras),
      shop,
    };
  }

  return {
    ok: true,
    user: appUser,
    profile: buildProfileFromLocal(localUser, profileExtras),
    shop,
  };
}

export async function registerLocalSalesmanAccount({
  username,
  password,
  personName,
  inviteCode,
  country = "BD",
  countryName = "",
  area = "",
  mobile = "",
  email = "",
  permissions = null,
} = {}) {
  await bootOfflineSqlite();
  assertFirebaseReady(true);

  const inviteInfo = await resolveInviteCode(inviteCode);
  const authEmail = buildLocalAuthEmail(username, inviteInfo.shopId, email);
  const fbUser = await createFirebaseAccount(authEmail.email, password);
  const verificationSent = await sendVerificationEmailIfNeeded(fbUser);

  const localUser = await createLocalUser({
    username,
    password,
    role: "salesman",
    personName,
    email: authEmail.email,
    firebaseUid: fbUser.uid,
    shopId: inviteInfo.shopId,
    permissions,
    mustChangePassword: false,
    isEmergencyBootstrap: false,
  });

  await markInviteCodeUsed(inviteInfo, fbUser.uid, personName);

  const shop = {
    id: inviteInfo.shopId,
    ...inviteInfo.shopData,
  };

  const profileExtras = {
    mobile: String(mobile || "").trim(),
    country,
    countryName,
    area: String(area || "").trim(),
    joinedShopName: shop.companyName || "",
    permissions,
  };

  await writeCloudUserProfile(fbUser.uid, {
    role: "salesman",
    shopId: inviteInfo.shopId,
    personName,
    username,
    email: authEmail.email,
    mobile: profileExtras.mobile,
    country,
    countryName,
    area: profileExtras.area,
    joinedShopName: profileExtras.joinedShopName,
    position: "Salesman",
    permissions,
    localUserId: localUser.id,
  });

  await writeStaffLoginIndex({
    username,
    shopId: inviteInfo.shopId,
    authEmail: authEmail.email,
    firebaseUid: fbUser.uid,
    personName,
  });

  await saveShopRecord(inviteInfo.shopId, shop);

  const login = await verifyLocalUserPassword(username, password, {
    createSession: true,
  });

  if (!login.ok) {
    return login;
  }

  const appUser = buildAppUserFromLocal(localUser);
  appUser.email = authEmail.isRealEmail ? authEmail.email : email || "";
  appUser.emailVerified = !authEmail.isRealEmail || fbUser.emailVerified;

  if (authEmail.isRealEmail && !fbUser.emailVerified) {
    return {
      ok: true,
      needsEmailVerification: true,
      verificationSent,
      rawFirebaseUser: fbUser,
      user: appUser,
      profile: buildProfileFromLocal(localUser, profileExtras),
      shop,
    };
  }

  return {
    ok: true,
    user: appUser,
    profile: buildProfileFromLocal(localUser, profileExtras),
    shop,
  };
}

export function friendlyLocalAuthError(result, lang = "bn") {
  const isBn = lang === "bn";
  const reason = result?.reason || "UNKNOWN";

  const map = {
    USER_NOT_FOUND: isBn ? "ইউজারনেম/ইমেইল পাওয়া যায়নি" : "Username/email not found",
    INVALID_PASSWORD: isBn ? "পাসওয়ার্ড ভুল" : "Incorrect password",
    LOCKED: isBn
      ? "অ্যাকাউন্ট লক — ১৫ মিনিট পর আবার চেষ্টা করুন"
      : "Account locked — try again in 15 minutes",
    OFFLINE_EMAIL: isBn
      ? "পুরনো ইমেইল অ্যাকাউন্ট offline-এ কাজ করবে না। একবার internet দিয়ে email login করুন।"
      : "Legacy email accounts need internet once. Please login with email while online.",
    PROFILE_NOT_FOUND: isBn
      ? "Firebase-এ প্রোফাইল পাওয়া যায়নি"
      : "Profile not found in cloud",
    FIREBASE_UNAVAILABLE: isBn
      ? "Firebase প্রস্তুত নয়"
      : "Firebase is not ready",
    OFFLINE_REQUIRED: isBn
      ? "অ্যাকাউন্ট তৈরি/যোগদানের জন্য ইন্টারনেট লাগবে"
      : "Internet is required to create or join an account",
    OFFLINE_STAFF_LOGIN: isBn
      ? "নতুন device-এ প্রথম login-এর জন্য একবার internet লাগবে"
      : "Internet is required once for first login on a new device",
    ACCOUNT_DISABLED: isBn
      ? "এই অ্যাকাউন্ট বন্ধ করা হয়েছে। মালিকের সাথে যোগাযোগ করুন"
      : "This account has been closed. Contact the owner",
    VALIDATION: isBn
      ? "ইউজারনেম/ইমেইল ও পাসওয়ার্ড দিন"
      : "Username/email and password required",
  };

  if (reason === "FIREBASE_ERROR") {
    const code = result?.code || "";
    if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
      return isBn ? "ইমেইল বা পাসওয়ার্ড ভুল" : "Incorrect email or password";
    }
    if (code === "auth/network-request-failed") {
      return isBn ? "ইন্টারনেট সংযোগ চেক করুন" : "Please check your internet connection";
    }
    return result?.message || (isBn ? "লগইন ব্যর্থ" : "Login failed");
  }

  return map[reason] || (isBn ? "লগইন ব্যর্থ" : "Login failed");
}
