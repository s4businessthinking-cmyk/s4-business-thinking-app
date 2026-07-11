import React, { useEffect, useRef, useState } from "react";
import {
  authLogin,
  fetchRealtimeStatus,
  getErpWsUrl,
  publishRealtimeTest,
  relayOutbox,
  requestWsTicket,
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

export default function RealtimeTestPanel() {
  const [email, setEmail] = useState("admin@s4.local");
  const [password, setPassword] = useState("Admin@12345");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [wsState, setWsState] = useState("disconnected");
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState(null);

  const sessionRef = useRef(null);
  const wsRef = useRef(null);
  const deviceId = deviceFingerprint();

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  const pushEvent = (label, data) => {
    setEvents((prev) => [
      { at: new Date().toLocaleTimeString(), label, data },
      ...prev.slice(0, 40),
    ]);
  };

  const ensureSession = async () => {
    if (sessionRef.current?.token && sessionRef.current?.tenant?.id) return sessionRef.current;
    const loginRes = await authLogin({
      email,
      password,
      device_fingerprint: deviceId,
      device_name: "ERP Realtime Dashboard",
      platform: "web",
      tenant_slug: "s4-demo",
    });
    if (!loginRes.ok || !loginRes.data?.success) {
      throw new Error(loginRes.data?.error?.message || "Login failed");
    }
    const next = { token: loginRes.data.access_token, tenant: loginRes.data.tenant };
    sessionRef.current = next;
    return next;
  };

  const onConnect = async () => {
    setBusy(true);
    setError("");
    try {
      const active = await ensureSession();
      const ticketRes = await requestWsTicket(active.token, active.tenant.id, deviceId);
      if (!ticketRes.ok || !ticketRes.data?.success) {
        throw new Error(ticketRes.data?.error?.message || "Ticket request failed");
      }
      const ticket = ticketRes.data.ticket;

      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          /* ignore */
        }
      }

      const url = `${getErpWsUrl("/ws/realtime/")}?ticket=${encodeURIComponent(ticket)}`;
      setWsState("connecting");
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => setWsState("connected");
      ws.onclose = (evt) => {
        setWsState("disconnected");
        pushEvent("ws.close", { code: evt.code });
      };
      ws.onerror = () => setError("WebSocket error — backend চালু আছে কিনা দেখুন (npm run erp:up)");
      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          pushEvent(data.type || "message", data);
        } catch {
          pushEvent("raw", { raw: evt.data });
        }
      };

      await refreshStatus(active);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const refreshStatus = async (active = sessionRef.current) => {
    if (!active?.token) return;
    const res = await fetchRealtimeStatus(active.token, active.tenant.id);
    if (res.ok && res.data?.success) setStatus(res.data);
  };

  const onPublish = async () => {
    setBusy(true);
    setError("");
    try {
      const active = await ensureSession();
      const res = await publishRealtimeTest(active.token, active.tenant.id, "Hello from dashboard");
      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.error?.message || "Publish failed");
      }
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const onRelay = async () => {
    setBusy(true);
    setError("");
    try {
      const active = await ensureSession();
      const res = await relayOutbox(active.token, active.tenant.id, 200);
      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.error?.message || "Relay failed");
      }
      pushEvent("relay.result", { relayed: res.data.relayed });
      await refreshStatus(active);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const onPing = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: "ping" }));
    }
  };

  const stateColor =
    wsState === "connected" ? "#86efac" : wsState === "connecting" ? "#fde68a" : "#f87171";

  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 16, marginBottom: 12 }}>STAGE 11 — Realtime WebSocket (Live)</h2>
      <div style={{ border: "1px solid #27272a", borderRadius: 14, padding: 16, background: "#111113" }}>
        <div style={{ fontSize: 13, color: "#a1a1aa", marginBottom: 12, lineHeight: 1.6 }}>
          WS ticket → WebSocket connect → publish/relay → live event arrives (no refresh). Device: <code>{deviceId}</code>
        </div>
        <div style={{ display: "grid", gap: 10, maxWidth: 520 }}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" style={inputStyle} />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" style={inputStyle} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={onConnect} disabled={busy} style={buttonStyle}>
              {busy ? "Working..." : "Connect WebSocket"}
            </button>
            <button onClick={onPublish} disabled={busy || wsState !== "connected"} style={altButtonStyle}>
              Publish test event
            </button>
            <button onClick={onRelay} disabled={busy || wsState !== "connected"} style={altButtonStyle}>
              Relay sync outbox
            </button>
            <button onClick={onPing} disabled={wsState !== "connected"} style={ghostButtonStyle}>
              Ping
            </button>
          </div>
        </div>

        <div style={{ marginTop: 14, fontSize: 13, color: stateColor, fontWeight: 700 }}>
          WebSocket: {wsState}
        </div>
        {status && (
          <div style={{ marginTop: 6, fontSize: 13, color: "#c4b5fd", lineHeight: 1.6 }}>
            Presence online={status.presence_online} · outbox_pending={status.outbox_pending} · can_publish={String(status.can_publish)}
          </div>
        )}

        {events.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: "#a1a1aa", marginBottom: 6 }}>Live event log (newest first)</div>
            <div style={{ maxHeight: 220, overflow: "auto", display: "grid", gap: 6 }}>
              {events.map((e, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 12,
                    fontFamily: "monospace",
                    color: "#93c5fd",
                    background: "#09090b",
                    border: "1px solid #27272a",
                    borderRadius: 8,
                    padding: "6px 10px",
                    lineHeight: 1.5,
                  }}
                >
                  <span style={{ color: "#71717a" }}>{e.at}</span> · <strong style={{ color: "#e4e4e7" }}>{e.label}</strong>
                  {e.data?.seq != null && <span style={{ color: "#fde68a" }}> · seq {e.data.seq}</span>}
                  {e.data?.payload?.message && <span style={{ color: "#86efac" }}> · {e.data.payload.message}</span>}
                  {e.data?.entity?.type && (
                    <span style={{ color: "#c4b5fd" }}> · {e.data.entity.type}:{e.data.entity.id}</span>
                  )}
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

const altButtonStyle = {
  ...buttonStyle,
  background: "#7c3aed",
};

const ghostButtonStyle = {
  ...buttonStyle,
  background: "transparent",
  border: "1px solid #3f3f46",
  color: "#a1a1aa",
};
