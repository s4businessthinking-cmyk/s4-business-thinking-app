import React, { useState } from "react";
import { activateLicense, authLogin, fetchLicenseStatus, fetchTenants } from "./erpApi";

function deviceFingerprint() {
  const key = "s4_erp_device_fp";
  let fp = localStorage.getItem(key);
  if (!fp) {
    fp = `web-${crypto.randomUUID()}`;
    localStorage.setItem(key, fp);
  }
  return fp;
}

export default function TenantLicensePanel() {
  const [email, setEmail] = useState("admin@s4.local");
  const [password, setPassword] = useState("Admin@12345");
  const [licenseKey, setLicenseKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [license, setLicense] = useState(null);

  const loadTenantData = async (token, tenant) => {
    const tenantListRes = await fetchTenants(token);
    if (tenantListRes.ok && tenantListRes.data?.tenants) {
      setTenants(tenantListRes.data.tenants);
    }
    if (tenant?.id) {
      const licRes = await fetchLicenseStatus(token, tenant.id);
      if (licRes.ok) setLicense(licRes.data?.license || null);
    }
  };

  const onLogin = async () => {
    setBusy(true);
    setError("");
    try {
      const loginRes = await authLogin({
        email,
        password,
        device_fingerprint: deviceFingerprint(),
        device_name: "ERP Dashboard",
        platform: "web",
        tenant_slug: "s4-demo",
      });
      if (!loginRes.ok || !loginRes.data?.success) {
        throw new Error(loginRes.data?.error?.message || "Login failed");
      }
      const nextSession = {
        token: loginRes.data.access_token,
        tenant: loginRes.data.tenant,
        user: loginRes.data.user,
      };
      setSession(nextSession);
      await loadTenantData(nextSession.token, nextSession.tenant);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const onActivate = async () => {
    if (!session?.token || !session?.tenant?.id) {
      setError("Login first to get tenant context.");
      return;
    }
    if (!licenseKey.trim()) {
      setError("Enter a valid S4-LIC-v1 license key.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await activateLicense(session.token, session.tenant.id, {
        license_key: licenseKey.trim(),
        device_fingerprint: deviceFingerprint(),
        device_name: "ERP Dashboard",
        platform: "web",
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.error?.message || "License activation failed");
      }
      setLicense(res.data.license);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 16, marginBottom: 12 }}>STAGE 3 — Tenant + License (Live)</h2>
      <div style={{ border: "1px solid #27272a", borderRadius: 14, padding: 16, background: "#111113" }}>
        <div style={{ display: "grid", gap: 10, maxWidth: 520 }}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" style={inputStyle} />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" style={inputStyle} />
          <button onClick={onLogin} disabled={busy} style={buttonStyle}>{busy ? "Working..." : "Login with tenant s4-demo"}</button>
        </div>

        {session?.tenant && (
          <div style={{ marginTop: 14, fontSize: 13, color: "#a1a1aa", lineHeight: 1.7 }}>
            <div>Tenant: <strong style={{ color: "#e4e4e7" }}>{session.tenant.slug}</strong> ({session.tenant.status})</div>
            <div>Company: {session.tenant.company?.legal_name || "-"}</div>
            <div>Branch: {session.tenant.branch?.name || "-"}</div>
            <div>Plan: {session.tenant.plan || "-"}</div>
            <div>Trial ends: {session.tenant.trial_ends_at || "-"}</div>
          </div>
        )}

        {tenants.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 13, color: "#93c5fd" }}>
            Your tenants: {tenants.map((t) => t.slug).join(", ")}
          </div>
        )}

        <div style={{ marginTop: 14, display: "grid", gap: 10, maxWidth: 520 }}>
          <input
            value={licenseKey}
            onChange={(e) => setLicenseKey(e.target.value)}
            placeholder="S4-LIC-v1 license key (optional test)"
            style={inputStyle}
          />
          <button onClick={onActivate} disabled={busy || !session} style={buttonStyle}>
            Activate License For Tenant
          </button>
        </div>

        {license && (
          <div style={{ marginTop: 12, fontSize: 13, color: "#86efac", lineHeight: 1.6 }}>
            License status: {license.status} | active={String(license.license_active)} | plan={license.plan}
          </div>
        )}

        {error && <div style={{ marginTop: 12, color: "#f87171", fontSize: 14 }}>{error}</div>}
      </div>
    </section>
  );
}

const inputStyle = {
  background: "#09090b",
  border: "1px solid #3f3f46",
  borderRadius: 8,
  color: "#e4e4e7",
  padding: "10px 12px",
};

const buttonStyle = {
  background: "#0f766e",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "10px 12px",
  fontWeight: 700,
  cursor: "pointer",
};
