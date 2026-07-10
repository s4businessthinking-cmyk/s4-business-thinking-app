import React, { useState } from "react";
import {
  authLogin,
  createJournalEntry,
  fetchAccountingAccounts,
  fetchFiscalPeriods,
  fetchGeneralLedger,
  fetchJournals,
  fetchTrialBalance,
  postJournalEntry,
} from "./erpApi";

export default function AccountingTestPanel() {
  const [email, setEmail] = useState("admin@s4.local");
  const [password, setPassword] = useState("Admin@12345");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [journals, setJournals] = useState([]);
  const [glEntries, setGlEntries] = useState([]);
  const [trialBalance, setTrialBalance] = useState(null);
  const [flowResult, setFlowResult] = useState(null);

  const ensureSession = async () => {
    if (session?.token && session?.tenant?.id) return session;
    const loginRes = await authLogin({
      email,
      password,
      device_fingerprint: "accounting-dashboard",
      device_name: "Accounting Dashboard",
      platform: "web",
      tenant_slug: "s4-demo",
    });
    if (!loginRes.ok || !loginRes.data?.success) throw new Error(loginRes.data?.error?.message || "Login failed");
    const nextSession = { token: loginRes.data.access_token, tenant: loginRes.data.tenant };
    setSession(nextSession);
    return nextSession;
  };

  const refreshData = async (token, tenantId) => {
    const [accRes, perRes, jeRes, glRes, tbRes] = await Promise.all([
      fetchAccountingAccounts(token, tenantId),
      fetchFiscalPeriods(token, tenantId),
      fetchJournals(token, tenantId),
      fetchGeneralLedger(token, tenantId),
      fetchTrialBalance(token, tenantId),
    ]);
    if (accRes.ok) setAccounts(accRes.data?.accounts || []);
    if (perRes.ok) setPeriods(perRes.data?.periods || []);
    if (jeRes.ok) setJournals(jeRes.data?.journals || []);
    if (glRes.ok) setGlEntries(glRes.data?.gl_entries || []);
    if (tbRes.ok) setTrialBalance(tbRes.data);
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

  const onCreateManualJe = async () => {
    setBusy(true);
    setError("");
    setFlowResult(null);
    try {
      const active = await ensureSession();
      const token = active.token;
      const tenantId = active.tenant.id;
      const cash = accounts.find((a) => a.subtype === "CASH");
      const revenue = accounts.find((a) => a.subtype === "REVENUE");
      if (!cash || !revenue) throw new Error("Need CASH and REVENUE accounts — load data first");
      const amount = 50;
      const createRes = await createJournalEntry(token, tenantId, {
        remarks: "Dashboard manual JE test",
        idempotency_key: `manual-je-${Date.now()}`,
        lines: [
          { account_id: cash.id, debit: amount, credit: 0, description: "Cash receipt" },
          { account_id: revenue.id, debit: 0, credit: amount, description: "Other income" },
        ],
      });
      if (!createRes.ok || !createRes.data?.success) throw new Error(createRes.data?.error?.message || "Create JE failed");
      const journal = createRes.data.journal;
      const postRes = await postJournalEntry(token, tenantId, journal.id);
      if (!postRes.ok || !postRes.data?.success) throw new Error(postRes.data?.error?.message || "Post JE failed");
      setFlowResult({ create: createRes.data, post: postRes.data });
      await refreshData(token, tenantId);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const panelStyle = {
    marginBottom: 24,
    padding: 16,
    borderRadius: 14,
    border: "1px solid #27272a",
    background: "#111113",
  };

  return (
    <section style={panelStyle}>
      <h2 style={{ fontSize: 16, marginBottom: 12 }}>STAGE 8 — Accounting Test Panel</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" style={{ padding: 8, borderRadius: 8, border: "1px solid #3f3f46", background: "#18181b", color: "#fff" }} />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" style={{ padding: 8, borderRadius: 8, border: "1px solid #3f3f46", background: "#18181b", color: "#fff" }} />
        <button onClick={onLoad} disabled={busy} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#2563eb", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
          {busy ? "Working..." : "Load Accounting Data"}
        </button>
        <button onClick={onCreateManualJe} disabled={busy} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#0d9488", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
          Create + Post Manual JE
        </button>
      </div>
      {error && <div style={{ color: "#f87171", marginBottom: 10 }}>{error}</div>}
      {flowResult && (
        <pre style={{ fontSize: 12, background: "#0c0c0e", padding: 10, borderRadius: 8, overflow: "auto", marginBottom: 10 }}>
          {JSON.stringify(flowResult, null, 2)}
        </pre>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, fontSize: 13 }}>
        <div>
          <strong>Accounts ({accounts.length})</strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "#a1a1aa", maxHeight: 160, overflow: "auto" }}>
            {accounts.slice(0, 12).map((a) => (
              <li key={a.id}>{a.code} — {a.name}</li>
            ))}
          </ul>
        </div>
        <div>
          <strong>Periods ({periods.length})</strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "#a1a1aa" }}>
            {periods.map((p) => (
              <li key={p.id}>{p.name} ({p.status})</li>
            ))}
          </ul>
        </div>
        <div>
          <strong>Journals ({journals.length})</strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "#a1a1aa", maxHeight: 160, overflow: "auto" }}>
            {journals.slice(0, 8).map((j) => (
              <li key={j.id}>{j.voucher_no} — {j.status} ({j.source_doc_type || "MANUAL"})</li>
            ))}
          </ul>
        </div>
        <div>
          <strong>GL lines ({glEntries.length})</strong>
          <div style={{ marginTop: 8, color: "#a1a1aa" }}>Trial balance balanced: {trialBalance?.totals?.balanced ? "yes" : "no"}</div>
          {trialBalance?.totals && (
            <div style={{ color: "#a1a1aa" }}>DR {trialBalance.totals.debit} / CR {trialBalance.totals.credit}</div>
          )}
        </div>
      </div>
    </section>
  );
}
