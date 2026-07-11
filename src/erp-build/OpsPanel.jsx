import React, { useRef, useState } from "react";
import { authLogin, fetchMetricsText, fetchOpsStatus } from "./erpApi";

function deviceFingerprint() {
  const key = "s4_erp_device_fp";
  let fp = localStorage.getItem(key);
  if (!fp) {
    fp = `web-${crypto.randomUUID()}`;
    localStorage.setItem(key, fp);
  }
  return fp;
}

export default function OpsPanel() {
  const [email, setEmail] = useState("admin@s4.local");
  const [password, setPassword] = useState("Admin@12345");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [status, setStatus] = useState(null);
  const [metricsText, setMetricsText] = useState("");

  const sessionRef = useRef(null);
  const deviceId = deviceFingerprint();

  const ensureSession = async () => {
    if (sessionRef.current?.token && sessionRef.current?.tenant?.id) return sessionRef.current;
    const res = await authLogin({
      email,
      password,
      device_fingerprint: deviceId,
      device_name: "ERP Ops Dashboard",
      platform: "web",
      tenant_slug: "s4-demo",
    });
    if (!res.ok || !res.data?.success) throw new Error(res.data?.error?.message || "Login failed");
    const next = { token: res.data.access_token, tenant: res.data.tenant };
    sessionRef.current = next;
    return next;
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

  const onRefresh = () =>
    withBusy(async () => {
      const active = await ensureSession();
      const res = await fetchOpsStatus(active.token, active.tenant.id);
      if (!res.ok || !res.data?.success) throw new Error(res.data?.error?.message || "Ops status failed");
      setStatus(res.data);
    });

  const onScrape = () =>
    withBusy(async () => {
      const res = await fetchMetricsText();
      if (!res.ok) throw new Error(`metrics HTTP ${res.status}`);
      setMetricsText(res.text || "(empty)");
    });

  const okColor = (ok) => (ok ? "#86efac" : "#f87171");

  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 16, marginBottom: 12 }}>STAGE 15 — Deployment &amp; Scaling (Ops · Readiness · Prometheus metrics)</h2>
      <div style={{ border: "1px solid #27272a", borderRadius: 14, padding: 16, background: "#111113" }}>
        <div style={{ display: "grid", gap: 10, maxWidth: 560, marginBottom: 12 }}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" style={inputStyle} />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" style={inputStyle} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={onRefresh} disabled={busy} style={buttonStyle}>{busy ? "Working..." : "Login & Ops status"}</button>
            <button onClick={onScrape} disabled={busy} style={ghostButtonStyle}>Scrape /metrics</button>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={cardTitle}>15.1 Readiness &amp; services (§16.2)</div>
          {status && (
            <>
              <div style={metaStyle}>
                version={status.app_version} · <strong style={{ color: okColor(status.ready) }}>{status.status}</strong>
              </div>
              <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                {(status.services || []).map((s) => (
                  <div key={s.name} style={rowStyle}>
                    <strong style={{ color: okColor(s.status === "up") }}>{s.status.toUpperCase()}</strong>{" "}
                    <span style={{ color: "#e4e4e7" }}>{s.name}</span>
                    <span style={{ color: "#71717a" }}> · {s.latency_ms}ms{typeof s.worker_count === "number" ? ` · workers ${s.worker_count}` : ""}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {status?.metrics && (
          <div style={cardStyle}>
            <div style={cardTitle}>15.2 Request metrics (in-process)</div>
            <div style={metaStyle}>
              requests={status.metrics.requests_total} · in_flight={status.metrics.in_flight} · avg={status.metrics.avg_latency_ms}ms · uptime={status.metrics.uptime_seconds}s
            </div>
            <div style={metaStyle}>
              scrape endpoint: <code style={{ color: "#93c5fd" }}>{status.metrics_endpoint}</code>{" "}
              {status.metrics_protected ? "(token-protected)" : "(open)"}
            </div>
          </div>
        )}

        {metricsText && (
          <div style={cardStyle}>
            <div style={cardTitle}>Prometheus exposition (/metrics)</div>
            <pre style={{ maxHeight: 220, overflow: "auto", margin: 0, fontSize: 12, color: "#a1a1aa", whiteSpace: "pre-wrap" }}>{metricsText}</pre>
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
