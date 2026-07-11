import React, { useRef, useState } from "react";
import {
  authLogin,
  createDeviceActivation,
  deviceAction,
  deviceHeartbeat,
  fetchDeviceActivations,
  fetchDevices,
  fetchDeviceStatus,
  redeemDeviceActivation,
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

export default function DevicesTestPanel() {
  const [email, setEmail] = useState("admin@s4.local");
  const [password, setPassword] = useState("Admin@12345");
  const [stationType, setStationType] = useState("POS");
  const [channel, setChannel] = useState("stable");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [log, setLog] = useState([]);
  const [status, setStatus] = useState(null);
  const [devices, setDevices] = useState([]);
  const [activations, setActivations] = useState([]);

  const sessionRef = useRef(null);
  const deviceKeyRef = useRef({});
  const webDeviceUid = deviceFingerprint();

  const pushLog = (label, data) => {
    setLog((prev) => [
      { at: new Date().toLocaleTimeString(), label, data },
      ...prev.slice(0, 40),
    ]);
  };

  const ensureSession = async () => {
    if (sessionRef.current?.token && sessionRef.current?.tenant?.id) return sessionRef.current;
    const loginRes = await authLogin({
      email,
      password,
      device_fingerprint: webDeviceUid,
      device_name: "ERP Devices Dashboard",
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
    const [st, dl, al] = await Promise.all([
      fetchDeviceStatus(active.token, active.tenant.id),
      fetchDevices(active.token, active.tenant.id),
      fetchDeviceActivations(active.token, active.tenant.id),
    ]);
    if (st.ok && st.data?.success) setStatus(st.data);
    if (dl.ok && dl.data?.success) setDevices(dl.data.devices || []);
    if (al.ok && al.data?.success) setActivations(al.data.activations || []);
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

  const onCreateCode = () =>
    withBusy(async () => {
      const active = await ensureSession();
      const res = await createDeviceActivation(active.token, active.tenant.id, {
        station_type: stationType,
        update_channel: channel,
        ttl_minutes: 60,
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.error?.message || "Create activation failed");
      }
      pushLog("activation.created", { code: res.data.activation.code });
      await refresh(active);
    });

  const onProvisionThisMachine = () =>
    withBusy(async () => {
      const active = await ensureSession();
      const created = await createDeviceActivation(active.token, active.tenant.id, {
        station_type: stationType,
        update_channel: channel,
        ttl_minutes: 60,
      });
      if (!created.ok || !created.data?.success) {
        throw new Error(created.data?.error?.message || "Create activation failed");
      }
      const code = created.data.activation.code;

      const deviceUid = `desktop-${webDeviceUid}`;
      const redeemed = await redeemDeviceActivation(active.tenant.id, {
        code,
        device_uid: deviceUid,
        name: `Dashboard station (${stationType})`,
        platform: navigator.platform || "web",
      });
      if (!redeemed.ok || !redeemed.data?.success) {
        throw new Error(redeemed.data?.error?.message || "Redeem failed");
      }
      deviceKeyRef.current[deviceUid] = redeemed.data.device_key;
      pushLog("device.registered", {
        device_uid: deviceUid,
        update_target: redeemed.data.update_target,
      });
      await refresh(active);
    });

  const onHeartbeat = () =>
    withBusy(async () => {
      const active = await ensureSession();
      const deviceUid = `desktop-${webDeviceUid}`;
      const key = deviceKeyRef.current[deviceUid];
      if (!key) {
        throw new Error("এই machine provision করা হয়নি — আগে 'Provision this machine' চাপুন");
      }
      const res = await deviceHeartbeat(active.tenant.id, {
        device_uid: deviceUid,
        device_key: key,
        app_version: "1.0.21",
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.error?.message || "Heartbeat failed");
      }
      pushLog("device.heartbeat", { update_target: res.data.update_target });
      await refresh(active);
    });

  const onPin = (device) =>
    withBusy(async () => {
      const active = await ensureSession();
      const version = window.prompt("Pin version (blank = auto latest)", device.pinned_version || "1.0.21");
      if (version === null) return;
      const res = await deviceAction(active.token, active.tenant.id, {
        device_id: device.id,
        action: "pin_version",
        version,
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.error?.message || "Pin failed");
      }
      pushLog("device.pinned", { id: device.id, version });
      await refresh(active);
    });

  const onToggleDisabled = (device) =>
    withBusy(async () => {
      const active = await ensureSession();
      const disable = device.status !== "DISABLED";
      const res = await deviceAction(active.token, active.tenant.id, {
        device_id: device.id,
        action: disable ? "disable" : "enable",
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.error?.message || "Action failed");
      }
      pushLog(disable ? "device.disabled" : "device.enabled", { id: device.id });
      await refresh(active);
    });

  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 16, marginBottom: 12 }}>STAGE 12 — Desktop Devices (Provisioning + Registry)</h2>
      <div style={{ border: "1px solid #27272a", borderRadius: 14, padding: 16, background: "#111113" }}>
        <div style={{ fontSize: 13, color: "#a1a1aa", marginBottom: 12, lineHeight: 1.6 }}>
          Activation code → device redeem (device key once) → heartbeat + update target → version pin / disable. This machine uid: <code>desktop-{webDeviceUid}</code>
        </div>

        <div style={{ display: "grid", gap: 10, maxWidth: 560 }}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" style={inputStyle} />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" style={inputStyle} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select value={stationType} onChange={(e) => setStationType(e.target.value)} style={inputStyle}>
              <option value="GENERAL">General</option>
              <option value="POS">POS counter</option>
              <option value="WAREHOUSE">Warehouse</option>
              <option value="ACCOUNTING">Accounting</option>
            </select>
            <select value={channel} onChange={(e) => setChannel(e.target.value)} style={inputStyle}>
              <option value="stable">stable</option>
              <option value="beta">beta</option>
              <option value="canary">canary</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={onCreateCode} disabled={busy} style={buttonStyle}>
              {busy ? "Working..." : "Create activation code"}
            </button>
            <button onClick={onProvisionThisMachine} disabled={busy} style={altButtonStyle}>
              Provision this machine
            </button>
            <button onClick={onHeartbeat} disabled={busy} style={altButtonStyle}>
              Send heartbeat
            </button>
            <button onClick={() => withBusy(() => refresh())} disabled={busy} style={ghostButtonStyle}>
              Refresh
            </button>
          </div>
        </div>

        {status && (
          <div style={{ marginTop: 12, fontSize: 13, color: "#c4b5fd", lineHeight: 1.6 }}>
            total={status.total_devices} · active={status.active_devices} · online={status.online_devices} · disabled={status.disabled_devices} · pending_codes={status.pending_activations}
          </div>
        )}

        {devices.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, color: "#a1a1aa", marginBottom: 6 }}>Registered devices</div>
            <div style={{ display: "grid", gap: 6 }}>
              {devices.map((d) => (
                <div key={d.id} style={rowStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ color: "#e4e4e7" }}>
                      <strong>{d.name || d.device_uid}</strong>
                      <span style={{ color: "#71717a" }}> · {d.station_type} · {d.update_channel}</span>
                      {d.pinned_version && <span style={{ color: "#fde68a" }}> · pin {d.pinned_version}</span>}
                      {d.app_version && <span style={{ color: "#86efac" }}> · v{d.app_version}</span>}
                      <span style={{ color: d.status === "DISABLED" ? "#f87171" : "#86efac" }}> · {d.status}</span>
                    </span>
                    <span style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => onPin(d)} disabled={busy} style={smallButtonStyle}>Pin</button>
                      <button onClick={() => onToggleDisabled(d)} disabled={busy} style={smallButtonStyle}>
                        {d.status === "DISABLED" ? "Enable" : "Disable"}
                      </button>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activations.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, color: "#a1a1aa", marginBottom: 6 }}>Recent activation codes</div>
            <div style={{ display: "grid", gap: 6 }}>
              {activations.slice(0, 6).map((a) => (
                <div key={a.id} style={rowStyle}>
                  <code style={{ color: "#93c5fd" }}>{a.code}</code>
                  <span style={{ color: "#71717a" }}> · {a.station_type} · {a.update_channel} · </span>
                  <span style={{ color: a.is_consumed ? "#86efac" : "#fde68a" }}>
                    {a.is_consumed ? "used" : "unused"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {log.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, color: "#a1a1aa", marginBottom: 6 }}>Activity log (newest first)</div>
            <div style={{ maxHeight: 180, overflow: "auto", display: "grid", gap: 6 }}>
              {log.map((e, i) => (
                <div key={i} style={{ ...rowStyle, fontFamily: "monospace", fontSize: 12, color: "#93c5fd" }}>
                  <span style={{ color: "#71717a" }}>{e.at}</span> · <strong style={{ color: "#e4e4e7" }}>{e.label}</strong>
                  {" "}<span style={{ color: "#a1a1aa" }}>{JSON.stringify(e.data)}</span>
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

const altButtonStyle = { ...buttonStyle, background: "#7c3aed" };

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
