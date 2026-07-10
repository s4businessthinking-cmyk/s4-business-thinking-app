import React, { useMemo, useState } from "react";
import { authLogin, authMe } from "./erpApi";

function deviceFingerprint() {
  const key = "s4_erp_device_fp";
  let fp = localStorage.getItem(key);
  if (!fp) {
    fp = `web-${crypto.randomUUID()}`;
    localStorage.setItem(key, fp);
  }
  return fp;
}

export default function AuthTestPanel() {
  const [email, setEmail] = useState("admin@s4.local");
  const [password, setPassword] = useState("Admin@12345");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [me, setMe] = useState(null);

  const tokenPreview = useMemo(() => {
    const token = result?.data?.access_token;
    if (!token) return "";
    return `${token.slice(0, 24)}...${token.slice(-12)}`;
  }, [result]);

  const onLogin = async () => {
    setBusy(true);
    setError("");
    setMe(null);
    try {
      const loginRes = await authLogin({
        email,
        password,
        device_fingerprint: deviceFingerprint(),
        device_name: "ERP Build Dashboard",
        platform: "web",
      });
      setResult(loginRes);
      if (!loginRes.ok || !loginRes.data?.success) {
        throw new Error(loginRes.data?.error?.message || `Login failed (${loginRes.status})`);
      }
      const meRes = await authMe(loginRes.data.access_token);
      setMe(meRes.data);
      if (!meRes.ok) {
        throw new Error(meRes.data?.error?.message || `auth/me failed (${meRes.status})`);
      }
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 16, marginBottom: 12 }}>STAGE 2 — Auth Test (Live)</h2>
      <div style={{ border: "1px solid #27272a", borderRadius: 14, padding: 16, background: "#111113" }}>
        <div style={{ display: "grid", gap: 10, maxWidth: 420 }}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            style={inputStyle}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            style={inputStyle}
          />
          <button onClick={onLogin} disabled={busy} style={buttonStyle}>
            {busy ? "Testing..." : "Test Login + /auth/me"}
          </button>
        </div>

        {error && <div style={{ marginTop: 12, color: "#f87171", fontSize: 14 }}>{error}</div>}

        {result?.data?.success && (
          <div style={{ marginTop: 14, fontSize: 13, color: "#a1a1aa", lineHeight: 1.7 }}>
            <div>
              User: <strong style={{ color: "#e4e4e7" }}>{result.data.user?.email}</strong>
            </div>
            <div>JWT RS256 token: {tokenPreview}</div>
            <div>Permissions: {(result.data.permissions || []).join(", ")}</div>
          </div>
        )}

        {me?.success && (
          <div style={{ marginTop: 10, fontSize: 13, color: "#86efac" }}>
            /auth/me OK — {me.user?.full_name} ({me.user?.platform_role})
          </div>
        )}
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
