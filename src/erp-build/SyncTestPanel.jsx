import React, { useState } from "react";
import {
  authLogin,
  clientHlcNow,
  syncHandshake,
  syncPull,
  syncPush,
  syncStatus,
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

export default function SyncTestPanel() {
  const [email, setEmail] = useState("admin@s4.local");
  const [password, setPassword] = useState("Admin@12345");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState(null);
  const [handshake, setHandshake] = useState(null);
  const [pullResult, setPullResult] = useState(null);
  const [pushResult, setPushResult] = useState(null);
  const [status, setStatus] = useState(null);

  const deviceId = deviceFingerprint();

  const ensureSession = async () => {
    if (session?.token && session?.tenant?.id) return session;
    const loginRes = await authLogin({
      email,
      password,
      device_fingerprint: deviceId,
      device_name: "ERP Sync Dashboard",
      platform: "web",
      tenant_slug: "s4-demo",
    });
    if (!loginRes.ok || !loginRes.data?.success) {
      throw new Error(loginRes.data?.error?.message || "Login failed");
    }
    const nextSession = {
      token: loginRes.data.access_token,
      tenant: loginRes.data.tenant,
    };
    setSession(nextSession);
    return nextSession;
  };

  const onRunSyncFlow = async () => {
    setBusy(true);
    setError("");
    setHandshake(null);
    setPullResult(null);
    setPushResult(null);
    setStatus(null);
    try {
      const active = await ensureSession();
      const token = active.token;
      const tenantId = active.tenant.id;
      const hlc = clientHlcNow(deviceId);

      const hsRes = await syncHandshake(token, tenantId, {
        device_id: deviceId,
        schema_version: 1,
        client_hlc: hlc,
      });
      if (!hsRes.ok || !hsRes.data?.success) {
        throw new Error(hsRes.data?.error?.message || "Handshake failed");
      }
      setHandshake(hsRes.data);

      const pullRes = await syncPull(token, tenantId, {
        device_id: deviceId,
        entity_types: ["item"],
        cursors: {},
        client_hlc: hlc,
      });
      if (!pullRes.ok || !pullRes.data?.success) {
        throw new Error(pullRes.data?.error?.message || "Pull failed");
      }
      setPullResult(pullRes.data);

      const opId = crypto.randomUUID();
      const pushRes = await syncPush(token, tenantId, {
        device_id: deviceId,
        client_hlc: hlc,
        ops: [
          {
            id: opId,
            entity_type: "user_settings",
            entity_id: "dashboard-prefs",
            op: "UPDATE",
            prev_row_version: 0,
            payload: { theme: "dark", language: "en", updated_by: email },
            hlc,
          },
        ],
      });
      if (!pushRes.ok || !pushRes.data?.success) {
        throw new Error(pushRes.data?.error?.message || "Push failed");
      }
      setPushResult(pushRes.data);

      const statusRes = await syncStatus(token, tenantId, deviceId);
      if (statusRes.ok) setStatus(statusRes.data);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const itemCount = pullResult?.results?.[0]?.batch?.length ?? 0;

  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 16, marginBottom: 12 }}>STAGE 4 — Offline Sync Engine (Live)</h2>
      <div style={{ border: "1px solid #27272a", borderRadius: 14, padding: 16, background: "#111113" }}>
        <div style={{ fontSize: 13, color: "#a1a1aa", marginBottom: 12, lineHeight: 1.6 }}>
          HLC + cursor-based pull + idempotent push + conflict classes (R/D/T/A/S). Device: <code>{deviceId}</code>
        </div>
        <div style={{ display: "grid", gap: 10, maxWidth: 520 }}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" style={inputStyle} />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" style={inputStyle} />
          <button onClick={onRunSyncFlow} disabled={busy} style={buttonStyle}>
            {busy ? "Running sync flow..." : "Run Handshake → Pull Items → Push Settings"}
          </button>
        </div>

        {handshake && (
          <div style={{ marginTop: 14, fontSize: 13, color: "#86efac", lineHeight: 1.7 }}>
            Handshake OK — schema v{handshake.schema_version} · {handshake.entity_classes?.length || 0} entity classes
          </div>
        )}
        {pullResult && (
          <div style={{ marginTop: 8, fontSize: 13, color: "#93c5fd" }}>
            Pull: {itemCount} item(s) from server replica
          </div>
        )}
        {pushResult && (
          <div style={{ marginTop: 8, fontSize: 13, color: "#fde68a" }}>
            Push: {pushResult.results?.[0]?.status || "unknown"} — row_version {pushResult.results?.[0]?.row_version ?? "-"}
          </div>
        )}
        {status && (
          <div style={{ marginTop: 8, fontSize: 13, color: "#c4b5fd", lineHeight: 1.6 }}>
            Status: replicas={status.replica_count} · conflicts={status.pending_conflicts} · outbox={status.outbox_pending}
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
