import React, { useRef, useState } from "react";
import {
  actApprovalRequest,
  authLogin,
  createApprovalWorkflow,
  createCustomField,
  createNumberSequence,
  downloadAttachment,
  fetchApprovalRequests,
  fetchApprovalStatus,
  fetchAttachments,
  fetchCustomFields,
  fetchCustomizationStatus,
  fetchDocumentsStatus,
  fetchNumberSequences,
  generateNextNumber,
  submitApprovalRequest,
  uploadAttachment,
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

function b64EncodeUtf8(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

export default function EnterpriseExtrasPanel() {
  const [email, setEmail] = useState("admin@s4.local");
  const [password, setPassword] = useState("Admin@12345");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [log, setLog] = useState([]);

  const [apprStatus, setApprStatus] = useState(null);
  const [requests, setRequests] = useState([]);
  const [docStatus, setDocStatus] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [custStatus, setCustStatus] = useState(null);
  const [sequences, setSequences] = useState([]);
  const [fieldDefs, setFieldDefs] = useState([]);

  const sessionRef = useRef(null);
  const deviceId = deviceFingerprint();

  const pushLog = (label, data) =>
    setLog((prev) => [{ at: new Date().toLocaleTimeString(), label, data }, ...prev.slice(0, 40)]);

  const ensureSession = async () => {
    if (sessionRef.current?.token && sessionRef.current?.tenant?.id) return sessionRef.current;
    const res = await authLogin({
      email,
      password,
      device_fingerprint: deviceId,
      device_name: "ERP Enterprise Dashboard",
      platform: "web",
      tenant_slug: "s4-demo",
    });
    if (!res.ok || !res.data?.success) throw new Error(res.data?.error?.message || "Login failed");
    const next = { token: res.data.access_token, tenant: res.data.tenant };
    sessionRef.current = next;
    return next;
  };

  const refresh = async (active = sessionRef.current) => {
    if (!active?.token) return;
    const t = active.tenant.id;
    const [as, ar, ds, al, cs, sq, fd] = await Promise.all([
      fetchApprovalStatus(active.token, t),
      fetchApprovalRequests(active.token, t),
      fetchDocumentsStatus(active.token, t),
      fetchAttachments(active.token, t),
      fetchCustomizationStatus(active.token, t),
      fetchNumberSequences(active.token, t),
      fetchCustomFields(active.token, t),
    ]);
    if (as.ok && as.data?.success) setApprStatus(as.data);
    if (ar.ok && ar.data?.success) setRequests(ar.data.requests || []);
    if (ds.ok && ds.data?.success) setDocStatus(ds.data);
    if (al.ok && al.data?.success) setAttachments(al.data.attachments || []);
    if (cs.ok && cs.data?.success) setCustStatus(cs.data);
    if (sq.ok && sq.data?.success) setSequences(sq.data.sequences || []);
    if (fd.ok && fd.data?.success) setFieldDefs(fd.data.fields || []);
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

  // --- Approvals ---
  const onApprovalDemo = () =>
    withBusy(async () => {
      const active = await ensureSession();
      const code = `wf-${Date.now().toString(36)}`;
      const wf = await createApprovalWorkflow(active.token, active.tenant.id, {
        code,
        name: "Generic 1-step approval",
        document_type: "GENERIC",
        min_amount: 0,
        steps: [{ sequence: 1, name: "Manager review" }],
      });
      if (!wf.ok || !wf.data?.success) throw new Error(wf.data?.error?.message || "Workflow create failed");
      const docId = `DOC-${Date.now().toString(36)}`;
      const sub = await submitApprovalRequest(active.token, active.tenant.id, {
        document_type: "GENERIC",
        document_id: docId,
        amount: 100,
      });
      if (!sub.ok || !sub.data?.success) throw new Error(sub.data?.error?.message || "Submit failed");
      pushLog("approval.submitted", { docId, status: sub.data.request.status });
      await refresh(active);
    });

  const onAct = (req, decision) =>
    withBusy(async () => {
      const active = await ensureSession();
      const res = await actApprovalRequest(active.token, active.tenant.id, {
        request_id: req.id,
        decision,
        comment: `${decision} via dashboard`,
      });
      if (!res.ok || !res.data?.success) throw new Error(res.data?.error?.message || "Action failed");
      pushLog("approval.acted", { id: req.id, status: res.data.request.status });
      await refresh(active);
    });

  // --- Documents ---
  const onUploadDemo = () =>
    withBusy(async () => {
      const active = await ensureSession();
      const content = `S4 ERP test attachment generated at ${new Date().toISOString()}`;
      const res = await uploadAttachment(active.token, active.tenant.id, {
        entity_type: "demo.note",
        entity_id: `note-${Date.now().toString(36)}`,
        filename: `note-${Date.now().toString(36)}.txt`,
        content_type: "text/plain",
        content_base64: b64EncodeUtf8(content),
      });
      if (!res.ok || !res.data?.success) throw new Error(res.data?.error?.message || "Upload failed");
      pushLog("attachment.uploaded", { id: res.data.attachment.id, size: res.data.attachment.size_bytes });
      await refresh(active);
    });

  const onDownload = (att) =>
    withBusy(async () => {
      const active = await ensureSession();
      const res = await downloadAttachment(active.token, active.tenant.id, att.id);
      if (!res.ok || !res.data?.success) throw new Error(res.data?.error?.message || "Download failed");
      let text = "";
      try {
        text = decodeURIComponent(escape(atob(res.data.content_base64 || "")));
      } catch {
        text = "(binary)";
      }
      pushLog("attachment.downloaded", { id: att.id, preview: text.slice(0, 60) });
    });

  // --- Customization ---
  const onSequenceDemo = () =>
    withBusy(async () => {
      const active = await ensureSession();
      const code = `INV-${Date.now().toString(36)}`;
      const seq = await createNumberSequence(active.token, active.tenant.id, {
        code,
        name: "Invoice number",
        prefix: "INV",
        padding: 4,
        reset_period: "YEARLY",
      });
      if (!seq.ok || !seq.data?.success) throw new Error(seq.data?.error?.message || "Sequence create failed");
      const gen1 = await generateNextNumber(active.token, active.tenant.id, code);
      const gen2 = await generateNextNumber(active.token, active.tenant.id, code);
      pushLog("sequence.generated", {
        first: gen1.data?.generated?.formatted,
        second: gen2.data?.generated?.formatted,
      });
      await refresh(active);
    });

  const onFieldDemo = () =>
    withBusy(async () => {
      const active = await ensureSession();
      const res = await createCustomField(active.token, active.tenant.id, {
        entity_type: "inventory.item",
        code: `warranty_${Date.now().toString(36)}`,
        label: "Warranty months",
        field_type: "NUMBER",
        required: false,
      });
      if (!res.ok || !res.data?.success) throw new Error(res.data?.error?.message || "Field create failed");
      pushLog("field.created", { code: res.data.field.code });
      await refresh(active);
    });

  const stColor = (s) =>
    s === "APPROVED" ? "#86efac" : s === "REJECTED" ? "#f87171" : s === "PENDING" ? "#fde68a" : "#a1a1aa";

  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 16, marginBottom: 12 }}>STAGE 13 — Enterprise Extras (Approvals · Documents · Customization)</h2>
      <div style={{ border: "1px solid #27272a", borderRadius: 14, padding: 16, background: "#111113" }}>
        <div style={{ display: "grid", gap: 10, maxWidth: 560, marginBottom: 12 }}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" style={inputStyle} />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" style={inputStyle} />
          <button onClick={() => withBusy(() => refresh())} disabled={busy} style={ghostButtonStyle}>
            {busy ? "Working..." : "Login & Refresh"}
          </button>
        </div>

        {/* Approvals */}
        <div style={cardStyle}>
          <div style={cardTitle}>13.6 Approvals</div>
          <button onClick={onApprovalDemo} disabled={busy} style={buttonStyle}>Create workflow + submit request</button>
          {apprStatus && (
            <div style={metaStyle}>
              workflows={apprStatus.workflows} · pending={apprStatus.pending} · approved={apprStatus.approved} · rejected={apprStatus.rejected}
            </div>
          )}
          <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
            {requests.slice(0, 6).map((r) => (
              <div key={r.id} style={rowStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ color: "#e4e4e7" }}>
                    {r.document_type} <code>{r.document_id}</code>{" "}
                    <strong style={{ color: stColor(r.status) }}>{r.status}</strong>
                    <span style={{ color: "#71717a" }}> · step {r.current_sequence}</span>
                  </span>
                  {r.status === "PENDING" && (
                    <span style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => onAct(r, "APPROVE")} disabled={busy} style={smallButtonStyle}>Approve</button>
                      <button onClick={() => onAct(r, "REJECT")} disabled={busy} style={smallButtonStyle}>Reject</button>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Documents */}
        <div style={cardStyle}>
          <div style={cardTitle}>13.7 Documents / Attachments</div>
          <button onClick={onUploadDemo} disabled={busy} style={buttonStyle}>Upload test attachment</button>
          {docStatus && (
            <div style={metaStyle}>count={docStatus.attachment_count} · total_bytes={docStatus.total_bytes}</div>
          )}
          <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
            {attachments.slice(0, 6).map((a) => (
              <div key={a.id} style={rowStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ color: "#e4e4e7" }}>
                    {a.filename} <span style={{ color: "#71717a" }}>· {a.size_bytes}B · {a.entity_type}</span>
                  </span>
                  <button onClick={() => onDownload(a)} disabled={busy} style={smallButtonStyle}>Download</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Customization */}
        <div style={cardStyle}>
          <div style={cardTitle}>13.8 Custom Fields + Number Sequences</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={onSequenceDemo} disabled={busy} style={buttonStyle}>Create sequence + generate</button>
            <button onClick={onFieldDemo} disabled={busy} style={buttonStyle}>Add custom field</button>
          </div>
          {custStatus && (
            <div style={metaStyle}>field_defs={custStatus.field_defs} · sequences={custStatus.sequences}</div>
          )}
          <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
            {sequences.slice(0, 5).map((s) => (
              <div key={s.id} style={rowStyle}>
                <code style={{ color: "#93c5fd" }}>{s.code}</code>
                <span style={{ color: "#71717a" }}> · prefix {s.prefix || "-"} · next {s.next_number} · {s.reset_period}</span>
              </div>
            ))}
            {fieldDefs.slice(0, 5).map((f) => (
              <div key={f.id} style={rowStyle}>
                <span style={{ color: "#e4e4e7" }}>{f.label}</span>
                <span style={{ color: "#71717a" }}> · {f.entity_type}.{f.code} · {f.field_type}</span>
              </div>
            ))}
          </div>
        </div>

        {log.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, color: "#a1a1aa", marginBottom: 6 }}>Activity log</div>
            <div style={{ maxHeight: 150, overflow: "auto", display: "grid", gap: 6 }}>
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
