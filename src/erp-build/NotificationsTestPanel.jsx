import React, { useRef, useState } from "react";
import {
  authLogin,
  createNotificationRule,
  fetchNotificationRules,
  fetchNotifications,
  fetchNotificationStatus,
  markAllNotificationsRead,
  markNotificationRead,
  notificationRuleAction,
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

export default function NotificationsTestPanel() {
  const [email, setEmail] = useState("admin@s4.local");
  const [password, setPassword] = useState("Admin@12345");
  const [threshold, setThreshold] = useState("5");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [ruleList, setRuleList] = useState([]);
  const [log, setLog] = useState([]);

  const sessionRef = useRef(null);
  const deviceId = deviceFingerprint();

  const pushLog = (label, data) => {
    setLog((prev) => [{ at: new Date().toLocaleTimeString(), label, data }, ...prev.slice(0, 30)]);
  };

  const ensureSession = async () => {
    if (sessionRef.current?.token && sessionRef.current?.tenant?.id) return sessionRef.current;
    const loginRes = await authLogin({
      email,
      password,
      device_fingerprint: deviceId,
      device_name: "ERP Notifications Dashboard",
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

  const refresh = async (active = sessionRef.current) => {
    if (!active?.token) return;
    const [st, nl, rl] = await Promise.all([
      fetchNotificationStatus(active.token, active.tenant.id),
      fetchNotifications(active.token, active.tenant.id, false),
      fetchNotificationRules(active.token, active.tenant.id),
    ]);
    if (st.ok && st.data?.success) setStatus(st.data);
    if (nl.ok && nl.data?.success) setNotifications(nl.data.notifications || []);
    if (rl.ok && rl.data?.success) setRuleList(rl.data.rules || []);
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

  const onCreateRule = () =>
    withBusy(async () => {
      const active = await ensureSession();
      const code = `low-stock-${Date.now().toString(36)}`;
      const res = await createNotificationRule(active.token, active.tenant.id, {
        code,
        name: `Low stock ≤ ${threshold}`,
        trigger_type: "LOW_STOCK",
        category: "INVENTORY",
        severity: "WARNING",
        realtime: true,
        config: { threshold_qty: String(threshold) },
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.error?.message || "Create rule failed");
      }
      pushLog("rule.created", { code });
      await refresh(active);
    });

  const onRunRule = (rule) =>
    withBusy(async () => {
      const active = await ensureSession();
      const res = await notificationRuleAction(active.token, active.tenant.id, {
        rule_id: rule.id,
        action: "run",
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.error?.message || "Run rule failed");
      }
      pushLog("rule.run", res.data.run);
      await refresh(active);
    });

  const onToggleRule = (rule) =>
    withBusy(async () => {
      const active = await ensureSession();
      const res = await notificationRuleAction(active.token, active.tenant.id, {
        rule_id: rule.id,
        action: "toggle",
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.error?.message || "Toggle failed");
      }
      await refresh(active);
    });

  const onMarkRead = (n) =>
    withBusy(async () => {
      const active = await ensureSession();
      const res = await markNotificationRead(active.token, active.tenant.id, n.id);
      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.error?.message || "Mark read failed");
      }
      await refresh(active);
    });

  const onMarkAll = () =>
    withBusy(async () => {
      const active = await ensureSession();
      const res = await markAllNotificationsRead(active.token, active.tenant.id);
      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.error?.message || "Mark all failed");
      }
      pushLog("mark.all", { updated: res.data.updated });
      await refresh(active);
    });

  const sevColor = (s) => (s === "CRITICAL" ? "#f87171" : s === "WARNING" ? "#fde68a" : "#93c5fd");

  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 16, marginBottom: 12 }}>STAGE 13 — Notifications &amp; Alerts (Live)</h2>
      <div style={{ border: "1px solid #27272a", borderRadius: 14, padding: 16, background: "#111113" }}>
        <div style={{ fontSize: 13, color: "#a1a1aa", marginBottom: 12, lineHeight: 1.6 }}>
          Create alert rule → run against real warehouse balances → notifications generated + pushed via STAGE 11 realtime. Threshold-based low-stock (no fake data).
        </div>

        <div style={{ display: "grid", gap: 10, maxWidth: 560 }}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" style={inputStyle} />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" style={inputStyle} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ fontSize: 13, color: "#a1a1aa" }}>Low-stock threshold qty</label>
            <input value={threshold} onChange={(e) => setThreshold(e.target.value)} style={{ ...inputStyle, width: 90 }} />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={onCreateRule} disabled={busy} style={buttonStyle}>
              {busy ? "Working..." : "Create low-stock rule"}
            </button>
            <button onClick={() => withBusy(() => refresh())} disabled={busy} style={ghostButtonStyle}>
              Refresh
            </button>
            <button onClick={onMarkAll} disabled={busy} style={ghostButtonStyle}>
              Mark all read
            </button>
          </div>
        </div>

        {status && (
          <div style={{ marginTop: 12, fontSize: 13, color: "#c4b5fd", lineHeight: 1.6 }}>
            unread={status.unread_count} · total={status.total_count} · rules={status.rules_count} · can_manage={String(status.can_manage)}
          </div>
        )}

        {ruleList.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, color: "#a1a1aa", marginBottom: 6 }}>Alert rules</div>
            <div style={{ display: "grid", gap: 6 }}>
              {ruleList.map((r) => (
                <div key={r.id} style={rowStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ color: "#e4e4e7" }}>
                      <strong>{r.name}</strong>
                      <span style={{ color: "#71717a" }}> · {r.trigger_type} · thr {r.config?.threshold_qty ?? "-"}</span>
                      <span style={{ color: r.enabled ? "#86efac" : "#f87171" }}> · {r.enabled ? "enabled" : "disabled"}</span>
                      {r.last_match_count != null && <span style={{ color: "#fde68a" }}> · last {r.last_match_count}</span>}
                    </span>
                    <span style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => onRunRule(r)} disabled={busy} style={smallButtonStyle}>Run</button>
                      <button onClick={() => onToggleRule(r)} disabled={busy} style={smallButtonStyle}>
                        {r.enabled ? "Disable" : "Enable"}
                      </button>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {notifications.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, color: "#a1a1aa", marginBottom: 6 }}>Notifications (newest first)</div>
            <div style={{ maxHeight: 240, overflow: "auto", display: "grid", gap: 6 }}>
              {notifications.map((n) => (
                <div key={n.id} style={{ ...rowStyle, opacity: n.is_read ? 0.55 : 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <span>
                      <strong style={{ color: sevColor(n.severity) }}>[{n.severity}]</strong>{" "}
                      <span style={{ color: "#e4e4e7" }}>{n.title}</span>
                      <div style={{ color: "#a1a1aa", fontSize: 12 }}>{n.body}</div>
                    </span>
                    {!n.is_read && (
                      <button onClick={() => onMarkRead(n)} disabled={busy} style={smallButtonStyle}>Read</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {log.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, color: "#a1a1aa", marginBottom: 6 }}>Activity log</div>
            <div style={{ maxHeight: 140, overflow: "auto", display: "grid", gap: 6 }}>
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

const rowStyle = {
  background: "#09090b",
  border: "1px solid #27272a",
  borderRadius: 8,
  padding: "8px 10px",
  lineHeight: 1.5,
};
