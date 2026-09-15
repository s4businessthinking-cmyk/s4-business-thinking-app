import { offlineUpsert, offlineRemove } from "../offline/offlineRepository";
import {
  assertFirebaseReady,
  buildLocalAuthEmail,
  createFirebaseAccount,
  deleteStaffLoginIndex,
  isOnline,
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

/**
 * Triggers background sync with proper error handling and fallback.
 * If offline engine sync fails, attempts direct cloud write as fallback.
 */
async function triggerBackgroundSync(fallbackCloudWrite = null) {
  if (typeof window === "undefined") return;
  
  // Check if offline engine is ready
  if (!window.S4Offline?.syncNow) {
    console.warn(
      "[S4 Users] Offline sync engine not ready. " +
      (fallbackCloudWrite ? "Using fallback cloud write." : "Sync skipped.")
    );
    if (fallbackCloudWrite) {
      try {
        await fallbackCloudWrite();
      } catch (err) {
        console.error("[S4 Users] Fallback cloud write failed", err);
        throw err;
      }
    }
    return;
  }
  
  if (!navigator.onLine) {
    console.info("[S4 Users] Offline mode - data queued for sync");
    return;
  }
  
  try {
    const result = await window.S4Offline.syncNow();
    if (!result?.ok) {
      console.warn(
        "[S4 Users] Background sync returned non-ok status",
        result
      );
      if (fallbackCloudWrite) {
        console.info("[S4 Users] Attempting fallback cloud write");
        await fallbackCloudWrite();
      }
    }
  } catch (error) {
    console.warn("[S4 Users] Background sync failed", error);
    if (fallbackCloudWrite) {
      console.info("[S4 Users] Attempting fallback cloud write after sync error");
      try {
        await fallbackCloudWrite();
      } catch (fallbackErr) {
        console.error(
          "[S4 Users] Fallback cloud write also failed",
          fallbackErr
        );
        throw fallbackErr;
      }
    }
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
        permissions: {
          ...(existing.permissions || {}),
          ...(member.permissions || {}),
        },
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
      inviteCode: invite.code || "",
      inviteId: invite.id || uid,
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

function resolveStaffAuthEmail(member, shopId, localUser = null) {
  const stored = String(localUser?.email || member?.email || "").trim().toLowerCase();
  if (stored && stored.includes("@")) return stored;
  if (member?.username && shopId) {
    return buildLocalAuthEmail(member.username, shopId).email;
  }
  return "";
}

export async function ensureStaffCloudLoginRecords(member, shopId) {
  if (!member || member.role === "owner" || !shopId) return { ok: false };

  const uid = member.uid || member.id;
  const username = String(member.username || "").trim();
  if (!uid || !username) return { ok: false };

  const localUser = member.localUserId
    ? await getLocalUserById(member.localUserId)
    : await getLocalUserByFirebaseUid(uid);
  const authEmail = resolveStaffAuthEmail(member, shopId, localUser);
  if (!authEmail) return { ok: false };

  assertFirebaseReady(isOnline());

  try {
    await writeCloudUserProfile(uid, {
      role: "salesman",
      shopId,
      personName: member.personName || localUser?.personName || username,
      username: localUser?.username || username,
      email: authEmail,
      position: member.position || "Salesman",
      permissions: member.permissions ?? localUser?.permissions ?? null,
      mobile: member.mobile || "",
      area: member.area || "",
      country: member.country || "BD",
      countryName: member.countryName || "",
      localUserId: member.localUserId || localUser?.id || "",
      status: member.status || "active",
    });
  } catch (err) {
    console.error(
      "[S4 Team] writeCloudUserProfile failed for",
      uid,
      err
    );
    throw err;
  }

  await writeStaffLoginIndex({
    username: localUser?.username || username,
    shopId,
    authEmail,
    firebaseUid: uid,
    personName: member.personName || localUser?.personName || username,
  });

  return { ok: true, uid, authEmail };
}

export async function backfillShopStaffCloudRecords(shopId, members = []) {
  if (!shopId || !isOnline()) return { ok: false, updated: 0 };

  let updated = 0;
  for (const member of members) {
    if (!member || member.role === "owner") continue;
    try {
      const result = await ensureStaffCloudLoginRecords(member, shopId);
      if (result.ok) updated += 1;
    } catch (error) {
      console.warn("[S4 Team] staff cloud backfill failed", member.uid || member.id, error);
    }
  }

  return { ok: true, updated };
}

/**
 * Syncs a team member to cloud via offline-first pattern.
 * Data is queued locally and synced when online.
 * Includes validation to prevent silent failures.
 */
async function syncTeamMemberToCloud(localUser, extras = {}) {
  const docId = localUser.firebaseUid || localUser.id;
  
  if (!docId) {
    throw new Error("[S4 Team] Cannot sync: missing user id or firebase uid");
  }

  const payload = {
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
  };

  try {
    const result = await offlineUpsert("users", docId, payload);
    if (!result?.ok) {
      throw new Error(
        `[S4 Team] offlineUpsert returned non-ok status: ${JSON.stringify(result)}`
      );
    }
  } catch (err) {
    console.error(
      "[S4 Team] Failed to queue salesman for sync",
      docId,
      err
    );
    throw err;
  }

  // Attempt sync with fallback
  await triggerBackgroundSync(async () => {
    // Fallback: direct cloud write
    if (isOnline()) {
      try {
        await writeCloudUserProfile(docId, payload);
      } catch (fallbackErr) {
        console.error(
          "[S4 Team] Fallback cloud write failed for salesman",
          docId,
          fallbackErr
        );
        throw fallbackErr;
      }
    }
  });
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

  // Sync via offline-first pattern
  await syncTeamMemberToCloud(localUser, {
    position,
    mobile,
    area,
    country,
    countryName,
  });

  // Also write staff login index
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
  { permissions, position, localUserId, memberRecord = null } = {}
) {
  const localUser = await resolveLocalUserForMember(memberId, localUserId);
  const docId = localUser?.firebaseUid || memberId;
  const shopId = localUser?.shopId || memberRecord?.shopId || "";

  if (localUser && permissions !== undefined && permissions !== null) {
    await updateLocalUserProfile(localUser.id, { permissions });
  }

  // Queue for sync
  try {
    await offlineUpsert("users", docId, {
      uid: docId,
      id: docId,
      shopId,
      role: localUser?.role || memberRecord?.role || "salesman",
      personName: localUser?.personName || memberRecord?.personName || "",
      username: localUser?.username || memberRecord?.username || "",
      email: localUser?.email || memberRecord?.email || "",
      permissions,
      ...(position ? { position } : {}),
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(
      "[S4 Team] Failed to queue permission update for sync",
      docId,
      err
    );
    throw err;
  }

  if (isOnline() && shopId && docId) {
    const mergedMember = {
      ...(memberRecord || {}),
      uid: docId,
      id: docId,
      shopId,
      permissions,
      position: position || memberRecord?.position || "Salesman",
      username: localUser?.username || memberRecord?.username || "",
      personName: localUser?.personName || memberRecord?.personName || "",
      email: localUser?.email || memberRecord?.email || "",
      mobile: memberRecord?.mobile || "",
      localUserId: localUser?.id || memberRecord?.localUserId || "",
      status: memberRecord?.status || "active",
    };
    await ensureStaffCloudLoginRecords(mergedMember, shopId);
  }

  // Trigger sync
  await triggerBackgroundSync();
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

  // Mark as disabled in offline storage
  try {
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
  } catch (err) {
    console.error(
      "[S4 Team] Failed to queue member removal for sync",
      docId,
      err
    );
    throw err;
  }

  const username = member?.username || localUser?.username;
  if (username) {
    await deleteStaffLoginIndex(username);
  }

  if (localUser?.id) {
    await deleteLocalUser(localUser.id);
  }

  // Trigger sync
  await triggerBackgroundSync();
  return { ok: true, memberId: docId };
}

/**
 * Removes a legacy invite-based salesman from the team.
 * Used when salesmen were created via invite codes but need to be deleted.
 * This is particularly useful for removing fake/invalid salesmen from the invite list.
 */
export async function removeLegacyInviteSalesman(inviteSalesman, { ownerUid = "" } = {}) {
  if (!inviteSalesman?.legacyInvite) {
    throw new Error("Only legacy invite-based salesmen can be removed via this function.");
  }

  const memberId = inviteSalesman?.uid || inviteSalesman?.id;
  if (!memberId) throw new Error("Salesman uid is required.");

  const shopId = inviteSalesman?.shopId || "";
  if (!shopId) throw new Error("Shop id is required.");

  // Mark as disabled in cloud storage
  try {
    await offlineUpsert("users", memberId, {
      uid: memberId,
      id: memberId,
      shopId,
      role: "salesman",
      personName: inviteSalesman?.personName || "Staff",
      username: inviteSalesman?.username || "",
      email: inviteSalesman?.email || "",
      status: "disabled",
      disabledAt: new Date().toISOString(),
      disabledBy: ownerUid || "",
      isDeleted: true,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(
      "[S4 Team] Failed to queue legacy salesman removal for sync",
      memberId,
      err
    );
    throw err;
  }

  // If this legacy salesman has a username, remove from staff login index
  if (inviteSalesman?.username) {
    try {
      await deleteStaffLoginIndex(inviteSalesman.username);
    } catch (err) {
      console.warn(
        "[S4 Team] Could not delete staff login index for legacy salesman",
        inviteSalesman.username,
        err
      );
    }
  }

  // Trigger sync to propagate deletion to cloud
  await triggerBackgroundSync();

  return {
    ok: true,
    memberId,
    message: "Legacy invite-based salesman has been removed.",
  };
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
