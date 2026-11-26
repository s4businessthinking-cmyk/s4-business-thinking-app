export function createLicenseService({ cfg }) {
  const revoked = new Set(
    String(cfg.revokedLicenseIds || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );

  return {
    checkLicense(_uid, { licenseId } = {}) {
      const id = String(licenseId || "").trim();
      if (!id) return { ok: false, reason: "LICENSE_ID_REQUIRED" };
      return {
        ok: true,
        licenseId: id,
        revoked: revoked.has(id),
        checkedAt: new Date().toISOString(),
      };
    },
  };
}