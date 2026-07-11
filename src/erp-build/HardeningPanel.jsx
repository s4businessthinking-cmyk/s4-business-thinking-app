import React, { useRef, useState } from "react";
import {
  authLogin,
  fetchHardeningStatus,
  hardeningIdempotencyDemo,
  hardeningRateLimitPing,
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

export default function HardeningPanel() {
  const [email, setEmail] = useState("admin@s4.local");
  const [password, setPassword] = useState("Admin@12345");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [status, setStatus] = useState(null);
  const [rateResult, setRateResult] = useState(null);
  const [idemResult, setIdemResult] = useState(null);

  const sessionRef = useRef(null);
  const deviceId = deviceFingerprint();

  const ensureSession = async () => {
    if (sessionRef.current?.token && sessionRef.current?.tenant?.id) return sessionRef.current;
    const res = await authLogin({
      email,
      password,
      device_fingerprint: deviceId,
      device_name: "ERP Hardening Dashboard",
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
      const res = await fetchHardeningStatus(active.token, active.tenant.id);
      if (!res.ok || !res.data?.success) throw new Error(res.data?.error?.message || "Status failed");
      setStatus(res.data);
    });

  const onHammer = () =>
    withBusy(async () => {
      const active = await ensureSession();
      let ok = 0;
      let throttled = 0;
      let firstThrottleAt = null;
      for (let i = 0; i < 12; i += 1) {
        const res = await hardeningRateLimitPing(active.token, active.tenant.id);
        if (res.status === 429) {
          throttled += 1;
          if (firstThrottleAt === null) firstThrottleAt = i + 1;
        } else if (res.ok) {
          ok += 1;
        }
      }
      setRateResult({ ok, throttled, firstThrottleAt, sent: 12 });
    });

  const onIdempotency = () =>
    withBusy(async () => {
      const active = await ensureSession();
      const key = `demo-${crypto.randomUUID()}`;
      const first = await hardeningIdempotencyDemo(active.token, active.tenant.id, key);
      const second = await hardeningIdempotencyDemo(active.token, active.tenant.id, key);
      const withoutKey = await hardeningIdempotencyDemo(active.token, active.tenant.id, null);
      setIdemResult({
        first: first.data?.value,
        second: second.data?.value,
        replayMatched: !!first.data?.value && first.data?.value === second.data?.value,
        control: withoutKey.data?.value,
        controlDiffers: withoutKey.data?.value !== first.data?.value,
      });
    });

  const okColor = (ok) => (ok ? "#86efac" : "#f87171");

  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 16, marginBottom: 12 }}>STAGE 16 — Final Hardening (Rate limit · Idempotency · Upload safety · Uniform errors)</h2>
      <div style={{ border: "1px solid #27272a", borderRadius: 14, padding: 16, background: "#111113" }}>
        <div style={{ display: "grid", gap: 10, maxWidth: 560, marginBottom: 12 }}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" style={inputStyle} />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" style={inputStyle} />
          <button onClick={onRefresh} disabled={busy} style={ghostButtonStyle}>{busy ? "Working..." : "Login & Refresh status"}</button>
        </div>

        <div style={cardStyle}>
          <div style={cardTitle}>16.1 Configuration</div>
          {status && (
            <div style={metaStyle}>
              throttle: user={status.throttle_rates?.user} · login={status.throttle_rates?.login} · test={status.throttle_rates?.hardening_test}
              <br />
              idempotency_ttl={status.idempotency_ttl_seconds}s · upload_max={status.upload_max_bytes}B · blocked_ext={status.upload_blocked_extensions?.length} · uniform_errors={String(status.uniform_errors)}
            </div>
          )}
        </div>

        <div style={cardStyle}>
          <div style={cardTitle}>16.2 Rate-limit self-test (§17.2)</div>
          <button onClick={onHammer} disabled={busy} style={buttonStyle}>Send 12 rapid requests (expect 429s)</button>
          {rateResult && (
            <div style={metaStyle}>
              sent={rateResult.sent} · ok={rateResult.ok} ·{" "}
              <strong style={{ color: okColor(rateResult.throttled > 0) }}>throttled(429)={rateResult.throttled}</strong>
              {rateResult.firstThrottleAt && <span style={{ color: "#71717a" }}> · first block at #{rateResult.firstThrottleAt}</span>}
            </div>
          )}
        </div>

        <div style={cardStyle}>
          <div style={cardTitle}>16.3 Idempotent write replay (§28.3)</div>
          <button onClick={onIdempotency} disabled={busy} style={buttonStyle}>Run idempotency demo</button>
          {idemResult && (
            <div style={metaStyle}>
              <strong style={{ color: okColor(idemResult.replayMatched) }}>
                {idemResult.replayMatched ? "REPLAY MATCHED (same key → same result)" : "REPLAY MISMATCH"}
              </strong>
              <br />
              <span style={{ color: "#71717a" }}>
                key1a={String(idemResult.first).slice(0, 8)} · key1b={String(idemResult.second).slice(0, 8)} · no-key={String(idemResult.control).slice(0, 8)}{" "}
                {idemResult.controlDiffers ? "(control differs ✓)" : ""}
              </span>
            </div>
          )}
        </div>

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
