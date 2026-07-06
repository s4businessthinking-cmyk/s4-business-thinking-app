import { offlineUpsert } from "../offline/offlineRepository";
import {
  createLocalUser,
  getLocalUserById,
  getLocalUserByFirebaseUid,
  listLocalUsers,
  updateLocalUserPassword,
  updateLocalUserProfile,
  verifyLocalUserPassword,
} from "./localAuthService";

function triggerBackgroundSync() {
  if (typeof window !== "undefined" && window.S4Offline?.syncNow && navigator.onLine) {
    window.S4Offline.syncNow().catch((error) => {
      console.warn("[S4 Users] background sync failed", error);
    });
  }
}

export function localUserToTeamMember(localUser, extras = {}) {
  const uid = localUser.firebaseUid || localUser.id;

  return {
    id: uid,
    uid,
    localUserId: localUser.id,
    username: localUser.username,
    role: localUser.role,
    personName: localUser.personName || localUser.username,
    email: localUser.email || "",
    permissions: localUser.permissions,
    position: extras.position || "Salesman",
    mobile: extras.mobile || "",
    area: extras.area || "",
    country: extras.country || "BD",
    countryName: extras.countryName || "",
    shopId: localUser.shopId,
    isLocalAuth: true,
  };
}

export async function listShopTeamMembers(shopId) {
  if (!shopId) return [];

  const users = await listLocalUsers();
  return users
    .filter((row) => row.shopId === shopId)
    .map((row) => localUserToTeamMember(row));
}

export function mergeTeamMembers(cloudTeam = [], localTeam = []) {
  const map = new Map();

  for (const member of cloudTeam) {
    const uid = member.uid || member.id;
    if (!uid) continue;
    map.set(uid, { ...member, uid, id: uid });
  }

  for (const member of localTeam) {
    const uid = member.uid || member.id;
    const existing = map.get(uid);

    if (existing) {
      map.set(uid, {
        ...existing,
        ...member,
        permissions: member.permissions ?? existing.permissions,
        personName: member.personName || existing.personName,
        username: member.username || existing.username,
        localUserId: member.localUserId || existing.localUserId,
      });
    } else {
      map.set(uid, member);
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.role === "owner") return -1;
    if (b.role === "owner") return 1;
    return String(a.personName || "").localeCompare(String(b.personName || ""));
  });
}

async function syncTeamMemberToCloud(localUser, extras = {}) {
  const docId = localUser.firebaseUid || localUser.id;

  await offlineUpsert("users", docId, {
    uid: docId,
    id: docId,
    role: localUser.role,
    shopId: localUser.shopId,
    personName: localUser.personName,
    username: localUser.username,
    email: localUser.email || "",
    mobile: extras.mobile || "",
    area: extras.area || "",
    country: extras.country || "BD",
    countryName: extras.countryName || "",
    position: extras.position || (localUser.role === "owner" ? "মালিক" : "Salesman"),
    permissions: localUser.permissions,
    localUserId: localUser.id,
    updatedAt: new Date().toISOString(),
  });

  triggerBackgroundSync();
}

export async function createShopStaffUser({
  username,
  password,
  personName,
  shopId,
  position = "Salesman",
  permissions = null,
  mobile = "",
  area = "",
  email = "",
  country = "BD",
  countryName = "",
} = {}) {
  const localUser = await createLocalUser({
    username,
    password,
    role: "salesman",
    personName,
    email,
    shopId,
    permissions,
    mustChangePassword: false,
    isEmergencyBootstrap: false,
  });

  await syncTeamMemberToCloud(localUser, {
    position,
    mobile,
    area,
    country,
    countryName,
  });

  return localUserToTeamMember(localUser, {
    position,
    mobile,
    area,
    country,
    countryName,
  });
}

async function resolveLocalUserForMember(memberId, localUserId = "") {
  if (localUserId) {
    const byId = await getLocalUserById(localUserId);
    if (byId) return byId;
  }

  const byFirebase = await getLocalUserByFirebaseUid(memberId);
  if (byFirebase) return byFirebase;

  return getLocalUserById(memberId);
}

export async function updateShopMemberPermissions(
  memberId,
  { permissions, position, localUserId } = {}
) {
  const localUser = await resolveLocalUserForMember(memberId, localUserId);
  const docId = localUser?.firebaseUid || memberId;

  if (localUser && permissions !== undefined && permissions !== null) {
    await updateLocalUserProfile(localUser.id, { permissions });
  }

  await offlineUpsert("users", docId, {
    uid: docId,
    id: docId,
    shopId: localUser?.shopId || "",
    permissions,
    ...(position ? { position } : {}),
    updatedAt: new Date().toISOString(),
  });

  triggerBackgroundSync();
  return { ok: true, docId };
}

export async function updateShopMemberPosition(memberId, position, localUserId = "") {
  return updateShopMemberPermissions(memberId, { position, localUserId });
}

export async function resetShopMemberPassword(localUserId, newPassword) {
  if (!localUserId) throw new Error("localUserId is required.");
  if (!newPassword || newPassword.length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }

  return updateLocalUserPassword(localUserId, newPassword, {
    clearEmergencyBootstrap: true,
  });
}

export async function updateOwnPassword(localUserId, currentPassword, newPassword) {
  if (!localUserId) throw new Error("localUserId is required.");

  const localUser = await getLocalUserById(localUserId);
  if (!localUser) throw new Error("User not found.");

  const verified = await verifyLocalUserPassword(localUser.username, currentPassword, {
    createSession: false,
  });

  if (!verified.ok) {
    throw new Error("Current password is incorrect.");
  }

  if (!newPassword || newPassword.length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }

  return updateLocalUserPassword(localUserId, newPassword, {
    clearEmergencyBootstrap: true,
  });
}
