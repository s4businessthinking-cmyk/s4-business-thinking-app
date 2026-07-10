import React, { useState } from "react";
import {
  authLogin,
  convertLead,
  createCrmActivity,
  createCrmLead,
  createCrmOpportunity,
  createEmployee,
  createLeaveRequest,
  fetchCrmActivities,
  fetchCrmLeads,
  fetchCrmOpportunities,
  fetchDepartments,
  fetchEmployees,
  fetchLeaveRequests,
  recordAttendance,
  submitLeaveRequest,
  updateOpportunityStage,
} from "./erpApi";

export default function HrmCrmTestPanel() {
  const [email, setEmail] = useState("admin@s4.local");
  const [password, setPassword] = useState("Admin@12345");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [leads, setLeads] = useState([]);
  const [opportunities, setOpportunities] = useState([]);
  const [activities, setActivities] = useState([]);
  const [flowResult, setFlowResult] = useState(null);

  const ensureSession = async () => {
    if (session?.token && session?.tenant?.id) return session;
    const loginRes = await authLogin({
      email,
      password,
      device_fingerprint: "hrm-crm-dashboard",
      device_name: "HRM CRM Dashboard",
      platform: "web",
      tenant_slug: "s4-demo",
    });
    if (!loginRes.ok || !loginRes.data?.success) throw new Error(loginRes.data?.error?.message || "Login failed");
    const nextSession = { token: loginRes.data.access_token, tenant: loginRes.data.tenant };
    setSession(nextSession);
    return nextSession;
  };

  const refreshData = async (token, tenantId) => {
    const [deptRes, empRes, leaveRes, leadRes, oppRes, actRes] = await Promise.all([
      fetchDepartments(token, tenantId),
      fetchEmployees(token, tenantId),
      fetchLeaveRequests(token, tenantId),
      fetchCrmLeads(token, tenantId),
      fetchCrmOpportunities(token, tenantId),
      fetchCrmActivities(token, tenantId),
    ]);
    if (deptRes.ok) setDepartments(deptRes.data?.departments || []);
    if (empRes.ok) setEmployees(empRes.data?.employees || []);
    if (leaveRes.ok) setLeaves(leaveRes.data?.leaves || []);
    if (leadRes.ok) setLeads(leadRes.data?.leads || []);
    if (oppRes.ok) setOpportunities(oppRes.data?.opportunities || []);
    if (actRes.ok) setActivities(actRes.data?.activities || []);
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

  const onRunFlow = async () => {
    setBusy(true);
    setError("");
    setFlowResult(null);
    try {
      const active = await ensureSession();
      const token = active.token;
      const tenantId = active.tenant.id;
      const dept = departments[0];

      const empRes = await createEmployee(token, tenantId, {
        employee_code: `EMP-${Date.now().toString().slice(-4)}`,
        first_name: "Dashboard",
        last_name: "Staff",
        email: "staff@example.com",
        designation: "Sales Associate",
        department_id: dept?.id,
      });
      if (!empRes.ok || !empRes.data?.success) throw new Error(empRes.data?.error?.message || "Create employee failed");
      const employee = empRes.data.employee;

      await recordAttendance(token, tenantId, { employee_id: employee.id, check_in: true });

      const leaveRes = await createLeaveRequest(token, tenantId, {
        employee_id: employee.id,
        leave_type: "SICK",
        from_date: new Date().toISOString().slice(0, 10),
        to_date: new Date().toISOString().slice(0, 10),
        reason: "Dashboard leave test",
      });
      if (!leaveRes.ok || !leaveRes.data?.success) throw new Error(leaveRes.data?.error?.message || "Create leave failed");
      await submitLeaveRequest(token, tenantId, leaveRes.data.leave.id);

      const leadRes = await createCrmLead(token, tenantId, {
        name: "Dashboard Prospect",
        company_name: "Prospect Co",
        email: "prospect@example.com",
        source: "DASHBOARD",
      });
      if (!leadRes.ok || !leadRes.data?.success) throw new Error(leadRes.data?.error?.message || "Create lead failed");
      const lead = leadRes.data.lead;

      const oppRes = await createCrmOpportunity(token, tenantId, {
        title: "Dashboard pipeline deal",
        lead_id: lead.id,
        expected_value: 12000,
        probability: 25,
      });
      if (!oppRes.ok || !oppRes.data?.success) throw new Error(oppRes.data?.error?.message || "Create opportunity failed");

      await createCrmActivity(token, tenantId, {
        activity_type: "CALL",
        subject: "Follow-up call",
        lead_id: lead.id,
        opportunity_id: oppRes.data.opportunity.id,
      });

      await updateOpportunityStage(token, tenantId, oppRes.data.opportunity.id, "PROPOSAL");
      const convertRes = await convertLead(token, tenantId, lead.id);
      if (!convertRes.ok || !convertRes.data?.success) throw new Error(convertRes.data?.error?.message || "Convert lead failed");

      setFlowResult({
        employee: employee.employee_code,
        lead: lead.lead_number,
        customer: convertRes.data.result?.customer_code,
        opportunity: oppRes.data.opportunity.opp_number,
      });
      await refreshData(token, tenantId);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = { background: "#09090b", border: "1px solid #3f3f46", borderRadius: 8, color: "#e4e4e7", padding: "10px 12px" };
  const buttonStyle = { background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, padding: "10px 12px", fontWeight: 700, cursor: "pointer" };

  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 16, marginBottom: 12 }}>STAGE 9 — HRM + CRM (Live)</h2>
      <div style={{ border: "1px solid #27272a", borderRadius: 14, padding: 16, background: "#111113" }}>
        <div style={{ display: "grid", gap: 10, maxWidth: 520 }}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" style={inputStyle} />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" style={inputStyle} />
          <button onClick={onLoad} disabled={busy} style={buttonStyle}>{busy ? "Loading..." : "Load HRM + CRM Data"}</button>
          <button onClick={onRunFlow} disabled={busy} style={{ ...buttonStyle, background: "#5b21b6" }}>
            {busy ? "Running..." : "Run Employee → Leave → Lead → Opportunity → Convert"}
          </button>
        </div>
        {departments.length > 0 && <div style={{ marginTop: 14, fontSize: 13, color: "#c4b5fd" }}>Departments: {departments.map((d) => d.code).join(", ")}</div>}
        {employees.length > 0 && <div style={{ marginTop: 8, fontSize: 13, color: "#86efac" }}>Employees: {employees.slice(0, 4).map((e) => e.employee_code).join(" · ")}</div>}
        {leaves.length > 0 && <div style={{ marginTop: 8, fontSize: 13, color: "#fde68a" }}>Leaves: {leaves.slice(0, 3).map((l) => `${l.employee_code}(${l.status})`).join(" · ")}</div>}
        {leads.length > 0 && <div style={{ marginTop: 8, fontSize: 13, color: "#93c5fd" }}>Leads: {leads.slice(0, 3).map((l) => `${l.lead_number}(${l.status})`).join(" · ")}</div>}
        {opportunities.length > 0 && <div style={{ marginTop: 8, fontSize: 13, color: "#fda4af" }}>Opportunities: {opportunities.slice(0, 3).map((o) => `${o.opp_number}(${o.stage})`).join(" · ")}</div>}
        {activities.length > 0 && <div style={{ marginTop: 8, fontSize: 13, color: "#a5b4fc" }}>Activities: {activities.length}</div>}
        {flowResult && (
          <div style={{ marginTop: 10, fontSize: 13, color: "#6ee7b7" }}>
            Flow OK — {flowResult.employee} · {flowResult.lead} → {flowResult.customer} · {flowResult.opportunity}
          </div>
        )}
        {error && <div style={{ marginTop: 12, color: "#f87171", fontSize: 14 }}>{error}</div>}
      </div>
    </section>
  );
}
