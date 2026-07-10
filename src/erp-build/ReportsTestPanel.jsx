import React, { useState } from "react";
import {
  authLogin,
  fetchReportCatalog,
  fetchReportDashboardKpis,
  fetchReportFinanceTb,
  fetchReportRuns,
  fetchReportStockSummary,
  runReport,
} from "./erpApi";

export default function ReportsTestPanel() {
  const [email, setEmail] = useState("admin@s4.local");
  const [password, setPassword] = useState("Admin@12345");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [kpis, setKpis] = useState(null);
  const [stockRows, setStockRows] = useState([]);
  const [runs, setRuns] = useState([]);
  const [flowResult, setFlowResult] = useState(null);

  const ensureSession = async () => {
    if (session?.token && session?.tenant?.id) return session;
    const loginRes = await authLogin({
      email,
      password,
      device_fingerprint: "reports-dashboard",
      device_name: "Reports Dashboard",
      platform: "web",
      tenant_slug: "s4-demo",
    });
    if (!loginRes.ok || !loginRes.data?.success) throw new Error(loginRes.data?.error?.message || "Login failed");
    const nextSession = { token: loginRes.data.access_token, tenant: loginRes.data.tenant };
    setSession(nextSession);
    return nextSession;
  };

  const refreshData = async (token, tenantId) => {
    const [catRes, kpiRes, stockRes, runRes] = await Promise.all([
      fetchReportCatalog(token, tenantId),
      fetchReportDashboardKpis(token, tenantId),
      fetchReportStockSummary(token, tenantId),
      fetchReportRuns(token, tenantId),
    ]);
    if (catRes.ok) setCatalog(catRes.data?.reports || []);
    if (kpiRes.ok) setKpis(kpiRes.data?.kpis || null);
    if (stockRes.ok) setStockRows(stockRes.data?.rows || []);
    if (runRes.ok) setRuns(runRes.data?.runs || []);
  };

  const onLoad = async () => {
    setBusy(true);
    setError("");
    try {
      const active = await ensureSession();
      await refreshData(active.token, active.tenant.id);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const onRunReports = async () => {
    setBusy(true);
    setError("");
    setFlowResult(null);
    try {
      const active = await ensureSession();
      const token = active.token;
      const tenantId = active.tenant.id;
      const tbRes = await fetchReportFinanceTb(token, tenantId);
      if (!tbRes.ok || !tbRes.data?.success) throw new Error(tbRes.data?.error?.message || "Trial balance report failed");
      const runRes = await runReport(token, tenantId, "sales.summary");
      if (!runRes.ok || !runRes.data?.success) throw new Error(runRes.data?.error?.message || "Run report failed");
      setFlowResult({
        trial_balance_balanced: tbRes.data?.totals?.balanced,
        sales_pos_count: runRes.data?.run?.data?.pos_sales?.count,
        sales_pos_total: runRes.data?.run?.data?.pos_sales?.total_amount,
      });
      await refreshData(token, tenantId);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = { background: "#09090b", border: "1px solid #3f3f46", borderRadius: 8, color: "#e4e4e7", padding: "10px 12px" };
  const buttonStyle = { background: "#b45309", color: "#fff", border: "none", borderRadius: 8, padding: "10px 12px", fontWeight: 700, cursor: "pointer" };

  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 16, marginBottom: 12 }}>STAGE 10 — Reports + Analytics (Live)</h2>
      <div style={{ border: "1px solid #27272a", borderRadius: 14, padding: 16, background: "#111113" }}>
        <div style={{ display: "grid", gap: 10, maxWidth: 520 }}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" style={inputStyle} />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" style={inputStyle} />
          <button onClick={onLoad} disabled={busy} style={buttonStyle}>{busy ? "Loading..." : "Load Reports Catalog + KPIs"}</button>
          <button onClick={onRunReports} disabled={busy} style={{ ...buttonStyle, background: "#92400e" }}>
            {busy ? "Running..." : "Run Trial Balance + Sales Summary"}
          </button>
        </div>
        {catalog.length > 0 && (
          <div style={{ marginTop: 14, fontSize: 13, color: "#fcd34d" }}>
            Catalog: {catalog.map((r) => r.code).join(" · ")}
          </div>
        )}
        {kpis && (
          <div style={{ marginTop: 10, fontSize: 13, color: "#86efac", lineHeight: 1.7 }}>
            Stock value: {kpis.inventory?.total_stock_value} · POS revenue: {kpis.sales?.pos_revenue} · Pipeline: {kpis.crm?.pipeline_value} · Employees: {kpis.hrm?.active_employees}
          </div>
        )}
        {stockRows.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 13, color: "#93c5fd" }}>
            Stock rows: {stockRows.length} · {stockRows.slice(0, 2).map((r) => `${r.item_sku}=${r.on_hand_qty}`).join(" · ")}
          </div>
        )}
        {runs.length > 0 && <div style={{ marginTop: 8, fontSize: 13, color: "#c4b5fd" }}>Report runs: {runs.length}</div>}
        {flowResult && (
          <div style={{ marginTop: 10, fontSize: 13, color: "#6ee7b7" }}>
            TB balanced: {String(flowResult.trial_balance_balanced)} · POS sales: {flowResult.sales_pos_count} ({flowResult.sales_pos_total})
          </div>
        )}
        {error && <div style={{ marginTop: 12, color: "#f87171", fontSize: 14 }}>{error}</div>}
      </div>
    </section>
  );
}
