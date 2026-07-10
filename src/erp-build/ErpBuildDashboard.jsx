import React, { useCallback, useEffect, useMemo, useState } from "react";
import AccountingTestPanel from "./AccountingTestPanel.jsx";
import HrmCrmTestPanel from "./HrmCrmTestPanel.jsx";
import ReportsTestPanel from "./ReportsTestPanel.jsx";
import AuthTestPanel from "./AuthTestPanel.jsx";
import InventoryTestPanel from "./InventoryTestPanel.jsx";
import PurchaseTestPanel from "./PurchaseTestPanel.jsx";
import SalesPosTestPanel from "./SalesPosTestPanel.jsx";
import SyncTestPanel from "./SyncTestPanel.jsx";
import TenantLicensePanel from "./TenantLicensePanel.jsx";
import { ARCHITECTURE_LOCKED, LOCAL_BUILD_STATE } from "./buildStages";
import { fetchBuildStatus, fetchHealth, getErpApiBase } from "./erpApi";

const POLL_MS = 5000;

const STATUS_COLORS = {
  up: "#22c55e",
  down: "#ef4444",
  healthy: "#22c55e",
  degraded: "#f59e0b",
  alive: "#22c55e",
  completed: "#22c55e",
  in_progress: "#3b82f6",
  pending: "#71717a",
};

function StatusPill({ label, tone = "pending" }) {
  const color = STATUS_COLORS[tone] || "#71717a";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: `${color}22`,
        color,
        border: `1px solid ${color}55`,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
      {label}
    </span>
  );
}

function ServiceCard({ service }) {
  const tone = service?.status === "up" ? "up" : "down";
  return (
    <div
      style={{
        background: "linear-gradient(180deg, #18181b 0%, #111113 100%)",
        border: "1px solid #27272a",
        borderRadius: 14,
        padding: 16,
        minHeight: 120,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <strong style={{ fontSize: 15, textTransform: "capitalize" }}>{service?.name || "unknown"}</strong>
        <StatusPill label={service?.status || "unknown"} tone={tone} />
      </div>
      <div style={{ fontSize: 13, color: "#a1a1aa", lineHeight: 1.6 }}>
        <div>Latency: {service?.latency_ms ?? "-"} ms</div>
        {service?.worker_count != null && <div>Workers: {service.worker_count}</div>}
        {service?.detail && <div>Detail: {service.detail}</div>}
        {service?.error && <div style={{ color: "#f87171" }}>Error: {service.error}</div>}
      </div>
    </div>
  );
}

function StageRow({ stage }) {
  const tone = stage.status === "completed" ? "completed" : stage.status === "in_progress" ? "in_progress" : "pending";
  return (
    <div
      style={{
        border: "1px solid #27272a",
        borderRadius: 12,
        padding: 14,
        background: stage.status === "in_progress" ? "#0c1a33" : "#111113",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 700 }}>{stage.code || `STAGE_${stage.id}`}</div>
          <div style={{ color: "#a1a1aa", fontSize: 13 }}>{stage.name_bn || stage.name}</div>
        </div>
        <StatusPill label={stage.status} tone={tone} />
      </div>
      <div style={{ marginTop: 10, height: 8, background: "#27272a", borderRadius: 999, overflow: "hidden" }}>
        <div
          style={{
            width: `${stage.progress_pct || 0}%`,
            height: "100%",
            background: "linear-gradient(90deg, #2563eb, #22d3ee)",
            transition: "width 0.4s ease",
          }}
        />
      </div>
      {Array.isArray(stage.items) && stage.items.length > 0 && (
        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          {stage.items.map((item) => (
            <div key={item.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span>{item.label_bn || item.label}</span>
              <StatusPill label={item.status} tone={item.status === "completed" ? "completed" : "pending"} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ErpBuildDashboard() {
  const [remote, setRemote] = useState(null);
  const [healthOnly, setHealthOnly] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [lastPoll, setLastPoll] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [buildRes, healthRes] = await Promise.all([fetchBuildStatus(), fetchHealth()]);
      if (!buildRes.ok && !healthRes.ok) {
        throw new Error(`Backend unreachable (${buildRes.status || healthRes.status})`);
      }
      setRemote(buildRes.data);
      setHealthOnly(healthRes.data);
      setLastPoll(new Date());
    } catch (err) {
      setError(err?.message || String(err));
      setRemote(null);
      setHealthOnly(null);
      setLastPoll(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const build = remote?.build || LOCAL_BUILD_STATE;
  const backend = remote?.backend || healthOnly;
  const services = backend?.services || [];
  const allServicesUp = services.length > 0 && services.every((s) => s.status === "up");
  const apiBase = getErpApiBase();

  const headline = useMemo(() => {
    if (error) return "Backend offline — Docker চালু করুন";
    if (allServicesUp) return "সব সার্ভিস চালু আছে";
    if (services.length) return "কিছু সার্ভিস ডাউন — নিচে দেখুন";
    return "স্ট্যাটাস লোড হচ্ছে...";
  }, [error, allServicesUp, services.length]);

  return (
    <div style={{ minHeight: "100vh", background: "#09090b", color: "#e4e4e7" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px 48px" }}>
        <header style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 8 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>S4 ERP Build Dashboard</h1>
            {ARCHITECTURE_LOCKED && <StatusPill label="ARCHITECTURE LOCKED" tone="completed" />}
            <StatusPill
              label={`STAGE ${build?.current_stage ?? "?"} — ${build?.current_stage_name || ""}`}
              tone="in_progress"
            />
          </div>
          <p style={{ color: "#a1a1aa", margin: "8px 0 0", lineHeight: 1.6 }}>
            Architecture অনুযায়ী step-by-step build progress। এখানে live backend health + stage checklist দেখা যাবে।
          </p>
          <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 10, fontSize: 13, color: "#a1a1aa" }}>
            <span>API: {apiBase}</span>
            <span>Poll: {POLL_MS / 1000}s</span>
            <span>Last check: {lastPoll ? lastPoll.toLocaleTimeString() : "-"}</span>
            <a href="/" style={{ color: "#60a5fa" }}>← Main App</a>
            <button
              onClick={refresh}
              style={{
                background: "#1d4ed8",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "6px 12px",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Refresh
            </button>
          </div>
        </header>

        <section
          style={{
            marginBottom: 20,
            padding: 16,
            borderRadius: 14,
            border: `1px solid ${error ? "#7f1d1d" : allServicesUp ? "#14532d" : "#3f3f46"}`,
            background: error ? "#1c0f0f" : allServicesUp ? "#0b1f14" : "#111113",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700 }}>{headline}</div>
          {error && (
            <div style={{ marginTop: 8, color: "#fca5a5", fontSize: 14, lineHeight: 1.5 }}>
              {error}
              <div style={{ marginTop: 8, color: "#d4d4d8" }}>
                Run: <code>npm run erp:up</code> তারপর browser refresh করুন।
              </div>
            </div>
          )}
          {!error && backend && (
            <div style={{ marginTop: 8, color: "#a1a1aa", fontSize: 14 }}>
              Backend status: <strong style={{ color: "#e4e4e7" }}>{backend.status}</strong>
              {backend.app_version ? ` · v${backend.app_version}` : ""}
            </div>
          )}
        </section>

        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>Live Services</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            {(services.length ? services : [
              { name: "postgresql", status: "down", error: "waiting for backend" },
              { name: "redis", status: "down", error: "waiting for backend" },
              { name: "celery", status: "down", error: "waiting for backend" },
            ]).map((service) => (
              <ServiceCard key={service.name} service={service} />
            ))}
          </div>
        </section>

        <AuthTestPanel />
        <TenantLicensePanel />
        <SyncTestPanel />
        <InventoryTestPanel />
        <PurchaseTestPanel />
        <SalesPosTestPanel />
        <AccountingTestPanel />
        <HrmCrmTestPanel />
        <ReportsTestPanel />

        <section>
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>Build Stages (Locked Order)</h2>
          <div style={{ display: "grid", gap: 12 }}>
            {(build?.stages || LOCAL_BUILD_STATE.stages || []).map((stage) => (
              <StageRow key={stage.id} stage={stage} />
            ))}
          </div>
        </section>

        <details style={{ marginTop: 24 }}>
          <summary style={{ cursor: "pointer", color: "#a1a1aa" }}>Raw API response</summary>
          <pre
            style={{
              marginTop: 10,
              padding: 12,
              background: "#111113",
              border: "1px solid #27272a",
              borderRadius: 10,
              overflow: "auto",
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            {JSON.stringify({ remote, healthOnly, error, loading }, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}
