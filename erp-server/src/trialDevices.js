const DAY_MS = 24 * 60 * 60 * 1000;
export const TRIAL_ACTIVE = "TRIAL_ACTIVE";
export const TRIAL_EXPIRED = "TRIAL_EXPIRED";

function normalizeFingerprint(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeDeviceId(value) {
  return String(value || "").trim();
}

function trialStatusFromEndsAt(trialEndsAt, now = new Date()) {
  const endsMs = new Date(trialEndsAt).getTime();
  if (!Number.isFinite(endsMs)) return TRIAL_EXPIRED;
  return endsMs <= now.getTime() ? TRIAL_EXPIRED : TRIAL_ACTIVE;
}

export function createTrialDeviceService({ db, cfg }) {
  const defaultTrialDays = Math.max(1, Number(cfg.trialDays) || 15);

  return {
    /**
     * One row per device fingerprint. First call starts trial; later calls return the same window (no reset).
     */
    async resolveTrial({ deviceId, deviceFingerprint, trialDays = defaultTrialDays } = {}) {
      const fingerprint = normalizeFingerprint(deviceFingerprint);
      const devId = normalizeDeviceId(deviceId);
      if (!fingerprint || fingerprint.length < 16) {
        return { ok: false, reason: "FINGERPRINT_REQUIRED" };
      }
      if (!devId) {
        return { ok: false, reason: "DEVICE_ID_REQUIRED" };
      }

      const days = Math.max(1, Number.parseInt(String(trialDays), 10) || defaultTrialDays);
      const existing = await db.getTrialDevice(fingerprint);
      const now = new Date();
      const nowIso = now.toISOString();

      if (existing) {
        if (existing.deviceId && existing.deviceId !== devId) {
          return { ok: false, reason: "DEVICE_MISMATCH", serverRecord: true };
        }
        const status = trialStatusFromEndsAt(existing.trialEndsAt, now);
        return {
          ok: true,
          reused: true,
          status,
          firstInstalledAt: existing.firstInstalledAt,
          trialStartedAt: existing.trialStartedAt,
          trialEndsAt: existing.trialEndsAt,
          trialDays: existing.trialDays,
          deviceId: existing.deviceId,
          deviceFingerprint: fingerprint,
          resolvedAt: nowIso,
        };
      }

      const firstInstalledAt = nowIso;
      const trialStartedAt = nowIso;
      const trialEndsAt = new Date(now.getTime() + days * DAY_MS).toISOString();

      await db.insertTrialDevice({
        deviceFingerprint: fingerprint,
        deviceId: devId,
        firstInstalledAt,
        trialStartedAt,
        trialEndsAt,
        trialDays: days,
        status: TRIAL_ACTIVE,
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      return {
        ok: true,
        reused: false,
        status: TRIAL_ACTIVE,
        firstInstalledAt,
        trialStartedAt,
        trialEndsAt,
        trialDays: days,
        deviceId: devId,
        deviceFingerprint: fingerprint,
        resolvedAt: nowIso,
      };
    },

    /** Read-only: whether this device already used its one demo (no new row). */
    async lookupTrial({ deviceFingerprint } = {}) {
      const fingerprint = normalizeFingerprint(deviceFingerprint);
      if (!fingerprint || fingerprint.length < 16) {
        return { ok: false, reason: "FINGERPRINT_REQUIRED" };
      }
      const existing = await db.getTrialDevice(fingerprint);
      if (!existing) {
        return { ok: true, found: false, deviceFingerprint: fingerprint };
      }
      const status = trialStatusFromEndsAt(existing.trialEndsAt);
      return {
        ok: true,
        found: true,
        status,
        firstInstalledAt: existing.firstInstalledAt,
        trialStartedAt: existing.trialStartedAt,
        trialEndsAt: existing.trialEndsAt,
        trialDays: existing.trialDays,
        deviceId: existing.deviceId,
        deviceFingerprint: fingerprint,
      };
    },
  };
}