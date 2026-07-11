import React, { useRef, useState } from "react";
import {
  authLogin,
  createApiKey,
  fetchApiKeys,
  fetchBackupJobs,
  fetchBackupStatus,
  fetchSecurityPolicy,
  fetchSecurityStatus,
  revokeApiKey,
  runBackup,
  updateSecurityPolicy,
  verifyAuditChain,
  verifyBackup,
} from "./erpApi";

function deviceFingerprint() {
  const key = "s4_erp_device_fp";
  let fp = localStorage.getItem(key);
  if (!fp) {
    fp = `web-${crypto.randomUUID()}`;
    localStorage.setItem(key, fp);
  }
  return fp;
}

export default function SecurityBackupPanel() {
  const [email, setEmail] = useState("admin@s4.local");
  const [password, setPassword] = useState("Admin@12345");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [log, setLog] = useState([]);

  const [backupStatus, setBackupStatus] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [secStatus, setSecStatus] = useState(null);
  const [policy, setPolicy] = useState(null);
  const [apiKeys, setApiKeys] = useState([]);
  const [auditResult, setAuditResult] = useState(null);
  const [lastSecret, setLastSecret] = useState("");

  const sessionRef = useRef(null);
  const deviceId = deviceFingerprint();

  const pushLog = (label, data) =>
    setLog((prev) => [{ at: new Date().toLocaleTimeString(), label, data }, ...prev.slice(0, 40)]);

  const ensureSession = async () => {
    if (sessionRef.current?.token && sessionRef.current?.tenant?.id) return sessionRef.current;
    const res = await authLogin({
      email,
      password,
      device_fingerprint: deviceId,
      device_name: "ERP Security Dashboard",
      platform: "web",
      tenant_slug: "s4-demo",
    });
    if (!res.ok || !res.data?.success) throw new Error(res.data?.error?.message || "Login failed");
    const next = { token: res.data.access_token, tenant: res.data.tenant };
    sessionRef.current = next;
    return next;
  };

  const refresh = async (active = sessionRef.current) => {
    if (!active?.token) {
      active = await ensureSession();
    }
    const t = active.tenant.id;
    const [bs, bj, ss, sp, ak] = await Promise.all([
      fetchBackupStatus(active.token, t),
      fetchBackupJobs(active.token, t),
      fetchSecurityStatus(active.token, t),
      fetchSecurityPolicy(active.token, t),
      fetchApiKeys(active.token, t),
    ]);
    if (bs.ok && bs.data?.success) setBackupStatus(bs.data);
    if (bj.ok && bj.data?.success) setJobs(bj.data.jobs || []);
    if (ss.ok && ss.data?.success) setSecStatus(ss.data);
    if (sp.ok && sp.data?.success) setPolicy(sp.data.policy);
    if (ak.ok && ak.data?.success) setApiKeys(ak.data.keys || []);
  };

  const withBusy = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const onRunBackup = () =>
    withBusy(async () => {
      const active = await ensureSession();
      const res = await runBackup(active.token, active.tenant.id, { backup_type: "FULL" });
      const job = res.data?.job;
      if (!job) throw new Error(res.data?.error?.message || "Backup failed");
      pushLog("backup.run", { status: job.status, method: job.method, size: job.size_bytes, error: job.error });
      await refresh(active);
    });

  const onVerifyBackup = (job) =>
    withBusy(async () => {
      const active = await ensureSession();
      const res = await verifyBackup(active.token, active.tenant.id, job.id);
      if (!res.ok || !res.data?.success) throw new Error(res.data?.error?.message || "Verify failed");
      pushLog("backup.verify", res.data.verify);
      await refresh(active);
    });

  const onVerifyAudit = () =>
    withBusy(async () => {
      const active = await ensureSession();
      const res = await verifyAuditChain(active.token, active.tenant.id);
      if (!res.ok || !res.data?.success) throw new Error(res.data?.error?.message || "Audit verify failed");
      setAuditResult(res.data.verify);
      pushLog("audit.verify", res.data.verify);
    });

  const onCreateKey = () =>
    withBusy(async () => {
      const active = await ensureSession();
      const res = await createApiKey(active.token, active.tenant.id, {
        name: `dashboard-key-${Date.now().toString(36)}`,
        scopes: ["backup.read"],
      });
      if (!res.ok || !res.data?.success) throw new Error(res.data?.error?.message || "Key create failed");
      setLastSecret(res.data.secret || "");
      pushLog("apikey.created", { id: res.data.api_key.id, prefix: res.data.api_key.prefix });
      await refresh(active);
    });

  const onRevokeKey = (key) =>
    withBusy(async () => {
      const active = await ensureSession();
      const res = await revokeApiKey(active.token, active.tenant.id, key.id);
      if (!res.ok || !res.data?.success) throw new Error(res.data?.error?.message || "Revoke failed");
      pushLog("apikey.revoked", { id: key.id });
      await refresh(active);
    });

  const onTightenPolicy = () =>
    withBusy(async () => {
      const active = await ensureSession();
      const res = await updateSecurityPolicy(active.token, active.tenant.id, {
        password_min_length: 12,
        require_mfa: true,
        session_ttl_minutes: 480,
      });
      if (!res.ok || !res.data?.success) throw new Error(res.data?.error?.message || "Policy update failed");
      pushLog("policy.updated", res.data.policy);
      await refresh(active);
    });

  const okColor = (ok) => (ok ? "#86efac" : "#f87171");

  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 16, marginBottom: 12 }}>STAGE 14 — Security &amp; Backup (Backup/DR · Audit integrity · API keys · Policy)</h2>
      <div style={{ border: "1px solid #27272a", borderRadius: 14, padding: 16, background: "#111113" }}>
        <div style={{ display: "grid", gap: 10, maxWidth: 560, marginBottom: 12 }}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" style={inputStyle} />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" style={inputStyle} />
          <button onClick={() => withBusy(() => refresh())} disabled={busy} style={ghostButtonStyle}>
            {busy ? "Working..." : "Login & Refresh"}
          </button>
        </div>

        {/* Backup & DR */}
        <div style={cardStyle}>
          <div style={cardTitle}>14.1 Backup &amp; DR (§22)</div>
          <button onClick={onRunBackup} disabled={busy} style={buttonStyle}>Run full backup now</button>
          {backupStatus && (
            <div style={metaStyle}>
              total={backupStatus.total_jobs} · success={backupStatus.success_count} · failed={backupStatus.failed_count} · last_size={backupStatus.last_success_size}B
            </div>
          )}
          <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
            {jobs.slice(0, 6).map((j) => (
              <div key={j.id} style={rowStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ color: "#e4e4e7" }}>
                    <strong style={{ color: okColor(j.status === "SUCCESS") }}>{j.status}</strong>{" "}
                    <span style={{ color: "#71717a" }}>· {j.method} · {j.size_bytes}B · {j.filename || "-"}</span>
                  </span>
                  {j.status === "SUCCESS" && (
                    <button onClick={() => onVerifyBackup(j)} disabled={busy} style={smallButtonStyle}>Verify checksum</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Audit integrity */}
        <div style={cardStyle}>
          <div style={cardTitle}>14.2 Audit hash-chain integrity (§8.5)</div>
          <button onClick={onVerifyAudit} disabled={busy} style={buttonStyle}>Verify audit chain</button>
          {auditResult && (
            <div style={metaStyle}>
              <strong style={{ color: okColor(auditResult.ok) }}>{auditResult.ok ? "INTACT" : "TAMPER DETECTED"}</strong>{" "}
              · checked={auditResult.checked}
              {auditResult.first_break && <span style={{ color: "#f87171" }}> · break at {auditResult.first_break.action}</span>}
            </div>
          )}
        </div>

        {/* API keys + policy */}
        <div style={cardStyle}>
          <div style={cardTitle}>14.3 Security — API keys &amp; policy (§17)</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={onCreateKey} disabled={busy} style={buttonStyle}>Create API key</button>
            <button onClick={onTightenPolicy} disabled={busy} style={buttonStyle}>Tighten policy (MFA + 12-char)</button>
          </div>
          {secStatus && (
            <div style={metaStyle}>
              api_keys_active={secStatus.api_keys_active} · total={secStatus.api_keys_total} · require_mfa={String(secStatus.require_mfa)}
            </div>
          )}
          {policy && (
            <div style={metaStyle}>
              password_min={policy.password_min_length} · session_ttl={policy.session_ttl_minutes}m · mfa={String(policy.require_mfa)} · max_login={policy.max_login_attempts}
            </div>
          )}
          {lastSecret && (
            <div style={{ ...rowStyle, marginTop: 8, wordBreak: "break-all" }}>
              <span style={{ color: "#fde68a" }}>New secret (shown once): </span>
              <code style={{ color: "#93c5fd" }}>{lastSecret}</code>
            </div>
          )}
          <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
            {apiKeys.slice(0, 6).map((k) => (
              <div key={k.id} style={rowStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ color: "#e4e4e7" }}>
                    {k.name} <code style={{ color: "#93c5fd" }}>{k.prefix}</code>{" "}
                    <strong style={{ color: okColor(k.enabled) }}>{k.enabled ? "ACTIVE" : "REVOKED"}</strong>
                  </span>
                  {k.enabled && (
                    <button onClick={() => onRevokeKey(k)} disabled={busy} style={smallButtonStyle}>Revoke</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {log.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, color: "#a1a1aa", marginBottom: 6 }}>Activity log</div>
            <div style={{ maxHeight: 150, overflow: "auto", display: "grid", gap: 6 }}>
              {log.map((e, i) => (
                <div key={i} style={{ ...rowStyle, fontFamily: "monospace", fontSize: 12, color: "#93c5fd" }}>
                  <span style={{ color: "#71717a" }}>{e.at}</span> · <strong style={{ color: "#e4e4e7" }}>{e.label}</strong>{" "}
                  <span style={{ color: "#a1a1aa" }}>{JSON.stringify(e.data)}</span>
                </div>
              ))}
            </div>
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
  background: "#1d4ed8",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "10px 12px",
  fontWeight: 700,
  cursor: "pointer",
};

const ghostButtonStyle = {
  ...buttonStyle,
  background: "transparent",
  border: "1px solid #3f3f46",
  color: "#a1a1aa",
};

const smallButtonStyle = {
  ...buttonStyle,
  padding: "4px 10px",
  fontSize: 12,
  background: "#27272a",
};

const cardStyle = {
  border: "1px solid #27272a",
  borderRadius: 10,
  padding: 12,
  marginTop: 12,
  background: "#0c0c0e",
};

const cardTitle = { fontSize: 14, fontWeight: 700, color: "#e4e4e7", marginBottom: 8 };

const metaStyle = { marginTop: 8, fontSize: 13, color: "#c4b5fd", lineHeight: 1.6 };

const rowStyle = {
  background: "#09090b",
  border: "1px solid #27272a",
  borderRadius: 8,
  padding: "8px 10px",
  lineHeight: 1.5,
};
