import { offlineUpsert } from "../offline/offlineRepository";
import {
  assertFirebaseReady,
  buildLocalAuthEmail,
  createFirebaseAccount,
  deleteStaffLoginIndex,
  writeCloudUserProfile,
  writeStaffLoginIndex,
} from "./firebaseAuthBridge";
import {
  createLocalUser,
  deleteLocalUser,
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

export function isActiveTeamMember(member) {
  if (!member) return false;
  if (member.role === "owner") return true;

  const status = String(member.status || "active").toLowerCase();
  return status !== "disabled" && status !== "closed" && member.isDeleted !== true;
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
    status: "active",
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
        email: member.email || existing.email,
        localUserId: member.localUserId || existing.localUserId,
        status: member.status || existing.status || "active",
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

export function buildLegacyMembersFromInvites(usedInvites = [], existingIds = new Set()) {
  const members = [];

  for (const invite of usedInvites) {
    if (!invite?.used) continue;

    const uid = invite.usedBy || invite.usedByUid || "";
    if (!uid || existingIds.has(uid)) continue;

    members.push({
      id: uid,
      uid,
      role: "salesman",
      personName: invite.usedByName || invite.personName || "Staff",
      email: invite.usedByEmail || invite.email || "",
      username: invite.usedByUsername || invite.username || "",
      position: "Salesman",
      shopId: invite.shopId || "",
      status: "active",
      legacyInvite: true,
    });
    existingIds.add(uid);
  }

  return members;
}

export function assembleShopTeam({
  cloudUsers = [],
  localTeam = [],
  usedInvites = [],
} = {}) {
  const merged = mergeTeamMembers(cloudUsers, localTeam);
  const existingIds = new Set(merged.map((member) => member.uid || member.id).filter(Boolean));
  const legacy = buildLegacyMembersFromInvites(usedInvites, existingIds);

  return mergeTeamMembers(merged, legacy).filter(isActiveTeamMember);
}

export async function backfillLegacyTeamMembers({
  cloudUsers = [],
  usedInvites = [],
  shopId = "",
} = {}) {
  if (!shopId || !usedInvites.length) return;

  const cloudIds = new Set(
    cloudUsers.map((member) => member.uid || member.id).filter(Boolean)
  );

  for (const invite of usedInvites) {
    if (!invite?.used || !invite.usedBy || cloudIds.has(invite.usedBy)) continue;

    try {
      await writeCloudUserProfile(invite.usedBy, {
        role: "salesman",
        shopId,
        personName: invite.usedByName || "Staff",
        email: invite.usedByEmail || invite.email || "",
        username: invite.usedByUsername || invite.username || "",
        position: "Salesman",
        status: "active",
        legacyBackfill: true,
      });
      cloudIds.add(invite.usedBy);
    } catch (error) {
      console.warn("[S4 Team] legacy backfill failed", invite.usedBy, error);
    }
  }
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
    status: "active",
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
  assertFirebaseReady(true);

  const authEmail = buildLocalAuthEmail(username, shopId, email);
  const fbUser = await createFirebaseAccount(authEmail.email, password, {
    useProvisioner: true,
  });

  const localUser = await createLocalUser({
    username,
    password,
    role: "salesman",
    personName,
    email: authEmail.email,
    firebaseUid: fbUser.uid,
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

  await writeStaffLoginIndex({
    username,
    shopId,
    authEmail: authEmail.email,
    firebaseUid: fbUser.uid,
    personName,
  });

  const member = localUserToTeamMember(localUser, {
    position,
    mobile,
    area,
    country,
    countryName,
  });

  return {
    ...member,
    authEmail: authEmail.email,
  };
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

export async function removeShopTeamMember(member, { ownerUid = "" } = {}) {
  const memberId = member?.uid || member?.id;
  if (!memberId) throw new Error("Member id is required.");
  if (member?.role === "owner") throw new Error("Owner cannot be removed.");

  const localUser = await resolveLocalUserForMember(memberId, member?.localUserId);
  const docId = localUser?.firebaseUid || memberId;
  const shopId = member?.shopId || localUser?.shopId || "";

  await offlineUpsert("users", docId, {
    uid: docId,
    id: docId,
    shopId,
    role: member?.role || localUser?.role || "salesman",
    personName: member?.personName || localUser?.personName || "",
    username: member?.username || localUser?.username || "",
    email: member?.email || localUser?.email || "",
    status: "disabled",
    disabledAt: new Date().toISOString(),
    disabledBy: ownerUid || "",
    updatedAt: new Date().toISOString(),
  });

  const username = member?.username || localUser?.username;
  if (username) {
    await deleteStaffLoginIndex(username);
  }

  if (localUser?.id) {
    await deleteLocalUser(localUser.id);
  }

  triggerBackgroundSync();
  return { ok: true, memberId: docId };
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
