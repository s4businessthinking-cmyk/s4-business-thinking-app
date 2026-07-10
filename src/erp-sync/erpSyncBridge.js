/**
 * Enterprise sync bridge — connects existing offline-first client to ERP sync APIs.
 * Does not replace Firebase/sql.js yet; parallel path for gradual migration (STAGE 4+).
 */
import { clientHlcNow, syncHandshake, syncPull, syncPush, syncStatus } from "../erp-build/erpApi";

const DEVICE_FP_KEY = "s4_erp_device_fp";

export function getErpDeviceId() {
  if (typeof localStorage === "undefined") return "node-anon";
  let fp = localStorage.getItem(DEVICE_FP_KEY);
  if (!fp) {
    fp = `web-${crypto.randomUUID()}`;
    localStorage.setItem(DEVICE_FP_KEY, fp);
  }
  return fp;
}

export async function erpSyncHandshake(accessToken, tenantId, schemaVersion = 1) {
  const deviceId = getErpDeviceId();
  const clientHlc = clientHlcNow(deviceId);
  const res = await syncHandshake(accessToken, tenantId, {
    device_id: deviceId,
    schema_version: schemaVersion,
    client_hlc: clientHlc,
  });
  if (!res.ok || !res.data?.success) {
    throw new Error(res.data?.error?.message || "ERP sync handshake failed");
  }
  return { deviceId, clientHlc, ...res.data };
}

export async function erpSyncPullReference(accessToken, tenantId, entityTypes, cursors = {}) {
  const deviceId = getErpDeviceId();
  const clientHlc = clientHlcNow(deviceId);
  const res = await syncPull(accessToken, tenantId, {
    device_id: deviceId,
    entity_types: entityTypes,
    cursors,
    client_hlc: clientHlc,
  });
  if (!res.ok || !res.data?.success) {
    throw new Error(res.data?.error?.message || "ERP sync pull failed");
  }
  return res.data;
}

export async function erpSyncPushOps(accessToken, tenantId, ops) {
  const deviceId = getErpDeviceId();
  const clientHlc = clientHlcNow(deviceId);
  const res = await syncPush(accessToken, tenantId, {
    device_id: deviceId,
    ops,
    client_hlc: clientHlc,
  });
  if (!res.ok || !res.data?.success) {
    throw new Error(res.data?.error?.message || "ERP sync push failed");
  }
  return res.data;
}

export async function erpSyncGetStatus(accessToken, tenantId) {
  const deviceId = getErpDeviceId();
  const res = await syncStatus(accessToken, tenantId, deviceId);
  if (!res.ok || !res.data?.success) {
    throw new Error(res.data?.error?.message || "ERP sync status failed");
  }
  return res.data;
}
