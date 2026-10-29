import React, { useEffect, useMemo, useRef, useState } from "react";
import { offlineCreate, offlineUpdate, offlinePatch, offlineRemove } from "../offline/offlineRepository";
import { subscribeShopCollection } from "../offline/realtimeSync";
import { logAudit } from "../utils/auditLog.js";
import { usePmMobile, usePmFitHeight, SI_CSS } from "../sales-invoice/siSkin.js";
import PartyPickerWindow, { VENDOR_PICKER_COLS, CUSTOMER_PICKER_COLS } from "../components/PartyPickerWindow.jsx";
import { readDocFile, openDocFile } from "../utils/docFiles.js";
import { printSecurityChequeReceipt } from "./securityChequeReceipt.js";
import { saveSecurityChequeDocs } from "./securityChequeDocs.js";
import {
  PARTY_TYPES, DIRECTIONS, STATUSES, ID_TYPES, SECURITY_CHEQUE_FIELDS, SECURITY_CHEQUE_DOC_FLAGS,
  emptySecurityCheque, validateSecurityCheque, liveSecurityCheques, isStale, r2,
  openInvoicesFor, outstandingBalanceFor,
} from "./securityCheque.js";

const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const money = (v, cur) => `${cur} ${r2(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const label = (list, key, bn) => (list.find((x) => x.key === key) || {})[bn ? "bn" : "en"] || key;

function PhotoField({ label: lbl, value, onChange, bn }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const isPdf = String(value || "").startsWith("data:application/pdf");
  const pick = async (e) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    setBusy(true);
    try { onChange(await readDocFile(file, (b, en) => (bn ? b : en))); } catch (err) { alert(err.message); } finally { setBusy(false); }
  };
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#334155", marginBottom: 4 }}>{lbl}</div>
      <div onClick={() => inputRef.current?.click()}
        style={{ height: 110, borderRadius: 10, border: value ? "1px solid #cbd5e1" : "1.5px dashed #94a3b8", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", cursor: "pointer" }}>
        {value
          ? (isPdf ? <span style={{ fontSize: 12, color: "#334155", fontWeight: 700 }}>📄 PDF</span> : <img src={value} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />)
          : <span style={{ fontSize: 12, color: "#64748b" }}>{busy ? "…" : (bn ? "📷 ছবি তুলুন / PDF" : "📷 Take photo / PDF")}</span>}
      </div>
      {value && (
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          {isPdf && <button type="button" onClick={() => openDocFile({ file: value, label: lbl })} style={{ border: "none", background: "none", color: "#2563eb", fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0 }}>{bn ? "দেখুন" : "View"}</button>}
          <button type="button" onClick={() => onChange("")} style={{ border: "none", background: "none", color: "#dc2626", fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0 }}>{bn ? "সরান" : "Remove"}</button>
        </div>
      )}
      <input ref={inputRef} type="file" accept="application/pdf,image/*" onChange={pick} style={{ display: "none" }} />
    </div>
  );
}

export default function SecurityChequeTab({ lang = "en", shopId, user, profile, isOwner = false, canManage = false, cur = "AED", toast, shopName = "", shop = null, alerts = [], leaveGuard, customers = [], vendors = [], focusParty = null, onFocusPartyHandled }) {
  const bn = lang === "bn";
  if (!canManage) {
    return <div className="pm-card" style={{ padding: 16 }}>{bn ? "সিকিউরিটি চেক মডিউল আপনার জন্য খোলা নেই।" : "Security Cheque module is not open for you."}</div>;
  }
  const mobile = usePmMobile();
  const rootRef = useRef(null);
  const fitH = usePmFitHeight(rootRef, mobile);
  const today = todayIso();

  const [records, setRecords] = useState([]);
  const [docRows, setDocRows] = useState([]);
  const [purchaseInvoices, setPurchaseInvoices] = useState([]);
  const [salesInvoices, setSalesInvoices] = useState([]);
  const [q, setQ] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPartyId, setFilterPartyId] = useState("");
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(null);
  const [docs, setDocs] = useState({});
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [receiptFileChanged, setReceiptFileChanged] = useState(false);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const receiptFileRef = useRef(null);
  const [signedCopyChanged, setSignedCopyChanged] = useState(false);
  const [signedCopyBusy, setSignedCopyBusy] = useState(false);
  const signedCopyFileRef = useRef(null);
  const [agreementChanged, setAgreementChanged] = useState(false);
  const [agreementBusy, setAgreementBusy] = useState(false);
  const agreementFileRef = useRef(null);
  const [evidenceChanged, setEvidenceChanged] = useState(false);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const evidenceFileRef = useRef(null);

  const pickReceiptFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setReceiptBusy(true);
    try {
      const data = await readDocFile(file, (b, en) => (bn ? b : en));
      setDocs((d) => ({ ...d, receiptFile: data }));
      set("receiptFileName", file.name);
      setReceiptFileChanged(true);
    } catch (err) {
      alert(err.message);
    } finally {
      setReceiptBusy(false);
    }
  };

  const pickSignedCopy = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSignedCopyBusy(true);
    try {
      const data = await readDocFile(file, (b, en) => (bn ? b : en));
      setDocs((d) => ({ ...d, signedReceiptCopy: data }));
      set("signedReceiptCopyFileName", file.name);
      setSignedCopyChanged(true);
    } catch (err) {
      alert(err.message);
    } finally {
      setSignedCopyBusy(false);
    }
  };

  const pickAgreementFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAgreementBusy(true);
    try {
      const data = await readDocFile(file, (b, en) => (bn ? b : en));
      setDocs((d) => ({ ...d, agreementFile: data }));
      set("agreementFileName", file.name);
      setAgreementChanged(true);
    } catch (err) {
      alert(err.message);
    } finally {
      setAgreementBusy(false);
    }
  };

  const pickEvidenceFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setEvidenceBusy(true);
    try {
      const data = await readDocFile(file, (b, en) => (bn ? b : en));
      setDocs((d) => ({ ...d, returnEvidence: data }));
      set("returnEvidenceFileName", file.name);
      setEvidenceChanged(true);
    } catch (err) {
      alert(err.message);
    } finally {
      setEvidenceBusy(false);
    }
  };

  useEffect(() => {
    if (!shopId) return undefined;
    const sub = subscribeShopCollection({ collectionName: "securityCheques", shopId, onRows: (rows) => setRecords(rows || []) });
    const subDocs = subscribeShopCollection({ collectionName: "securityChequeDocs", shopId, onRows: (rows) => setDocRows(rows || []) });
    // Read-only: this module never writes to purchaseInvoices/salesInvoices, only reads balanceDue/status
    // for the invoice-link picker and the AP/AR display below.
    const subPI = subscribeShopCollection({ collectionName: "purchaseInvoices", shopId, onRows: (rows) => setPurchaseInvoices(rows || []) });
    const subSI = subscribeShopCollection({ collectionName: "salesInvoices", shopId, onRows: (rows) => setSalesInvoices(rows || []) });
    return () => { try { sub?.(); subDocs?.(); subPI?.(); subSI?.(); } catch { /* ignore */ } };
  }, [shopId]);

  // One-shot "jump here from Vendor/Customer Master, filtered to this party" — same convention as
  // the app's existing globalFocusVendorId/globalFocusCustomerId cross-navigation.
  useEffect(() => {
    if (!focusParty?.id) return;
    setFilterPartyId(focusParty.id);
    setFilterType(focusParty.type || "");
    setQ("");
    onFocusPartyHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusParty]);

  // Kept in memory (not lazy-loaded) so Print never has to await anything after the click —
  // an await before window.open() can silently drop the browser's printer-choice dialog.
  const docsByRecordId = useMemo(() => Object.fromEntries(docRows.map((d) => [d.securityChequeId, d])), [docRows]);

  const all = useMemo(() => liveSecurityCheques(records, shopId), [records, shopId]);
  const filtered = useMemo(() => all.filter((r) => {
    if (filterPartyId && r.partyId !== filterPartyId) return false;
    if (filterType && r.partyType !== filterType) return false;
    if (filterStatus && r.status !== filterStatus) return false;
    const needle = q.trim().toLowerCase();
    if (needle && !([r.party, r.chequeNo, r.bank, r.id].join(" ").toLowerCase().includes(needle))) return false;
    return true;
  }).sort((a, b) => String(b.handoverDate || "").localeCompare(String(a.handoverDate || ""))), [all, filterPartyId, filterType, filterStatus, q]);
  const filterPartyName = filterPartyId ? (all.find((r) => r.partyId === filterPartyId)?.party || (filterType === "vendor" ? vendors : customers).find((p) => p.id === filterPartyId)?.vendorName || (filterType === "vendor" ? vendors : customers).find((p) => p.id === filterPartyId)?.customerName || "") : "";

  const metrics = [
    { k: bn ? "মোট রেকর্ড" : "Total records", v: all.length },
    { k: bn ? "জমা আছে" : "Held", v: all.filter((r) => r.status === "held").length },
    { k: bn ? "৩ মাসের রিমাইন্ডার" : "3-month reminders", v: all.filter((r) => r.status === "held" && isStale(r, today)).length },
    { k: bn ? "বন্ধের অনুরোধ" : "Closure requests", v: all.filter((r) => r.closureRequested && !r.closureApproved && r.status === "held").length },
  ];

  const openNew = () => { setEditId(null); setForm(emptySecurityCheque()); setDocs({}); setReceiptFileChanged(false); setSignedCopyChanged(false); setAgreementChanged(false); setEvidenceChanged(false); };
  const openEdit = (r) => {
    setEditId(r.id); setForm({ ...r });
    setDocs(docsByRecordId[r.id] || {});
    setReceiptFileChanged(false);
    setSignedCopyChanged(false);
    setAgreementChanged(false);
    setEvidenceChanged(false);
  };
  const closeForm = () => { setEditId(null); setForm(null); setDocs({}); setReceiptFileChanged(false); setSignedCopyChanged(false); setAgreementChanged(false); setEvidenceChanged(false); };

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    const missing = validateSecurityCheque(form, bn);
    if (missing) { alert(bn ? `"${missing}" পূরণ করুন` : `Please fill "${missing}"`); return; }
    setBusy(true);
    try {
      const amount = parseFloat(String(form.amount).replace(/,/g, "")) || 0;
      const hasDocs = ["idFront", "idBack", "chequePhoto", "receiptFile", "signedReceiptCopy", "agreementFile", "returnEvidence"].some((k) => docs[k]);
      const payload = { ...form, shopId, amount, hasDocs, updatedAt: new Date().toISOString(), updatedBy: user?.uid || "" };
      let id = editId;
      if (id) {
        await offlineUpdate("securityCheques", id, payload);
      } else {
        payload.createdAt = new Date().toISOString();
        payload.createdBy = user?.uid || "";
        const created = await offlineCreate("securityCheques", payload);
        id = created?.id || created;
      }
      if (hasDocs) await saveSecurityChequeDocs({ id, shopId }, docs, user?.uid || "");
      await logAudit({ shopId, user, profile, action: editId ? "update" : "create", collection: "securityCheques", docId: id, docNo: form.chequeNo, amount, note: form.party });
      if (receiptFileChanged && docs.receiptFile) {
        await logAudit({ shopId, user, profile, action: "receiptAttached", collection: "securityCheques", docId: id, docNo: form.receiptNo, note: `${form.party} — ${form.receiptFileName}` });
        setReceiptFileChanged(false);
      }
      if (signedCopyChanged && docs.signedReceiptCopy) {
        await logAudit({ shopId, user, profile, action: "signedCopyAttached", collection: "securityCheques", docId: id, docNo: form.chequeNo, note: `${form.party} — ${form.signedReceiptCopyFileName}` });
        setSignedCopyChanged(false);
      }
      if (agreementChanged && docs.agreementFile) {
        await logAudit({ shopId, user, profile, action: "agreementAttached", collection: "securityCheques", docId: id, docNo: form.chequeNo, note: `${form.party} — ${form.agreementFileName}` });
        setAgreementChanged(false);
      }
      if (evidenceChanged && docs.returnEvidence) {
        await logAudit({ shopId, user, profile, action: "returnEvidenceAttached", collection: "securityCheques", docId: id, docNo: form.chequeNo, note: `${form.party} — ${form.returnEvidenceFileName}` });
        setEvidenceChanged(false);
      }
      toast?.(bn ? "সেভ হয়েছে" : "Saved");
      closeForm();
    } catch (err) {
      console.warn("[S4 SecurityCheque] save failed", err);
      alert(bn ? "সেভ করা যায়নি" : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const requestClosure = async (r) => {
    await offlinePatch("securityCheques", r.id, { closureRequested: true, updatedAt: new Date().toISOString(), updatedBy: user?.uid || "" }, r);
    await logAudit({ shopId, user, profile, action: "closureRequested", collection: "securityCheques", docId: r.id, docNo: r.chequeNo, note: r.party });
  };
  const cancelClosureRequest = async (r) => {
    await offlinePatch("securityCheques", r.id, { closureRequested: false, updatedAt: new Date().toISOString(), updatedBy: user?.uid || "" }, r);
  };
  const approveClosure = async (r) => {
    if (!isOwner) return;
    if (!window.confirm(bn ? `${r.party}-এর বন্ধের অনুরোধ অনুমোদন করবেন?` : `Approve closure for ${r.party}?`)) return;
    await offlinePatch("securityCheques", r.id, { closureApproved: true, closureApprovedAt: new Date().toISOString(), closureApprovedBy: user?.uid || "", updatedAt: new Date().toISOString(), updatedBy: user?.uid || "" }, r);
    await logAudit({ shopId, user, profile, action: "closureApproved", collection: "securityCheques", docId: r.id, docNo: r.chequeNo, note: r.party });
  };
  const markReturned = async (r) => {
    if (!isOwner) return;
    if (!window.confirm(bn ? `চেক ${r.chequeNo} শারীরিকভাবে ফেরত দেওয়া হয়েছে কনফার্ম করছেন?` : `Confirm cheque ${r.chequeNo} has physically been returned?`)) return;
    await offlinePatch("securityCheques", r.id, { status: "returned", closureRequested: false, returnedAt: new Date().toISOString(), returnedBy: user?.uid || "", updatedAt: new Date().toISOString(), updatedBy: user?.uid || "" }, r);
    await logAudit({ shopId, user, profile, action: "returned", collection: "securityCheques", docId: r.id, docNo: r.chequeNo, note: r.party });
    toast?.(bn ? "ফেরত রেকর্ড হয়েছে" : "Return recorded");
  };
  const markPresented = async (r) => {
    if (!isOwner) return;
    if (!window.confirm(bn ? "চুক্তি ও প্রযোজ্য আইন যাচাই করার পরই অনুমোদিত উপস্থাপন নিশ্চিত করছেন?" : "Confirm authorised presentation only after reviewing the agreement and applicable law?")) return;
    await offlinePatch("securityCheques", r.id, { status: "presented", presentedAt: new Date().toISOString(), presentedBy: user?.uid || "", updatedAt: new Date().toISOString(), updatedBy: user?.uid || "" }, r);
    await logAudit({ shopId, user, profile, action: "presented", collection: "securityCheques", docId: r.id, docNo: r.chequeNo, amount: r.amount, note: r.party });
  };
  const deleteRecord = async (r) => {
    if (!isOwner) return;
    if (!window.confirm(bn ? "এই রেকর্ড মুছবেন? এটি ফেরানো যাবে না।" : "Delete this record? This cannot be undone.")) return;
    await offlineRemove("securityCheques", r.id);
    await logAudit({ shopId, user, profile, action: "delete", collection: "securityCheques", docId: r.id, docNo: r.chequeNo, note: r.party });
    if (editId === r.id) closeForm();
  };

  const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12, marginBottom: 10 };
  const fieldStyle = { width: "100%", padding: "9px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit", background: "#fff", color: "#0f172a" };
  const lblStyle = { fontSize: 11, fontWeight: 800, color: "#334155", marginBottom: 4, display: "block" };

  return (
    <div ref={rootRef} style={{ height: fitH, display: "flex", flexDirection: "column", gap: 10, color: "#0f172a", fontFamily: "inherit" }}>
      <style>{SI_CSS}</style>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 17 }}>🔒 {bn ? "সিকিউরিটি চেক" : "Security Cheques"}</h2>
        <button type="button" onClick={openNew} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#2563eb", color: "#fff", fontWeight: 800, cursor: "pointer" }}>
          + {bn ? "নতুন রেকর্ড" : "New Record"}
        </button>
      </div>

      {alerts.length > 0 && (
        <div style={card}>
          {alerts.slice(0, 5).map((a) => (
            <div key={a.key} style={{ padding: "6px 0", borderBottom: "1px solid #f1f5f9", fontSize: 12.5 }}>
              {a.tone === "bad" ? "⚠️" : "🔔"} <b>{a.party}</b> — {a.kind === "stale" ? (bn ? `${a.months} মাস লেনদেন নেই` : `no transaction for ${a.months} months`) : a.kind === "closure" ? (bn ? "বন্ধের অনুরোধ অপেক্ষমাণ" : "closure request pending") : (bn ? "ডকুমেন্ট অসম্পূর্ণ" : "documents incomplete")}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${mobile ? 2 : 4}, 1fr)`, gap: 8 }}>
        {metrics.map((m) => (
          <div key={m.k} style={card}>
            <div style={{ fontSize: 11, color: "#64748b" }}>{m.k}</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{m.v}</div>
          </div>
        ))}
      </div>

      {filterPartyId && (
        <div style={{ ...card, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, background: "#eff6ff", borderColor: "#bfdbfe" }}>
          <span style={{ fontSize: 12.5 }}>{bn ? "ফিল্টার করা হয়েছে" : "Filtered to"}: <b>{filterPartyName || filterPartyId}</b></span>
          <button type="button" onClick={() => setFilterPartyId("")} style={{ marginLeft: "auto", border: "none", background: "none", color: "#2563eb", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>✕ {bn ? "ফিল্টার সরান" : "Clear filter"}</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input placeholder={bn ? "পার্টি / চেক / ব্যাংক খুঁজুন" : "Search party / cheque / bank"} value={q} onChange={(e) => setQ(e.target.value)} style={{ ...fieldStyle, flex: 2, minWidth: 180 }} />
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ ...fieldStyle, flex: 1, minWidth: 140 }}>
          <option value="">{bn ? "সব ধরন" : "All types"}</option>
          {PARTY_TYPES.map((t) => <option key={t.key} value={t.key}>{bn ? t.bn : t.en}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ ...fieldStyle, flex: 1, minWidth: 140 }}>
          <option value="">{bn ? "সব স্ট্যাটাস" : "All statuses"}</option>
          {STATUSES.map((s) => <option key={s.key} value={s.key}>{bn ? s.bn : s.en}</option>)}
        </select>
      </div>

      <div style={{ flex: 1, overflow: "auto", border: "1px solid #e2e8f0", borderRadius: 10, background: "#fff" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: "#f1f5f9" }}>
              {[bn ? "পার্টি" : "Party", bn ? "ধরন / দিক" : "Type / direction", bn ? "চেক" : "Cheque", bn ? "পরিমাণ" : "Amount", bn ? "সর্বশেষ লেনদেন" : "Last txn", bn ? "স্ট্যাটাস" : "Status", ""].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "7px 8px", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 20, textAlign: "center", color: "#64748b" }}>{bn ? "কোনো রেকর্ড নেই" : "No records"}</td></tr>
            )}
            {filtered.map((r) => {
              const stale = r.status === "held" && isStale(r, today);
              return (
                <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9", background: editId === r.id ? "#eff6ff" : "#fff" }}>
                  <td style={{ padding: "7px 8px" }}><b>{r.party}</b><div style={{ color: "#64748b", fontSize: 11 }}>{r.id}</div></td>
                  <td style={{ padding: "7px 8px" }}>{label(PARTY_TYPES, r.partyType, bn)}<div style={{ color: "#64748b", fontSize: 11 }}>{label(DIRECTIONS, r.direction, bn)}</div></td>
                  <td style={{ padding: "7px 8px" }}>{r.chequeNo}<div style={{ color: "#64748b", fontSize: 11 }}>{r.bank}</div></td>
                  <td style={{ padding: "7px 8px" }}>{money(r.amount, cur)}</td>
                  <td style={{ padding: "7px 8px" }}>{fmtDay(r.lastTxn)}{stale && <div style={{ color: "#b45309", fontWeight: 700, fontSize: 11 }}>{bn ? "রিমাইন্ডার" : "Reminder due"}</div>}</td>
                  <td style={{ padding: "7px 8px" }}>
                    {r.status === "held" && r.closureRequested && !r.closureApproved ? (bn ? "বন্ধের অনুরোধ" : "Closure requested")
                      : r.status === "held" && r.closureApproved ? <span style={{ color: "#15803d", fontWeight: 700 }}>{bn ? "বন্ধের অনুমোদন হয়েছে — ফেরতের অপেক্ষায়" : "Closure approved — awaiting return"}</span>
                      : label(STATUSES, r.status, bn)}
                  </td>
                  <td style={{ padding: "7px 8px", display: "flex", gap: 4 }}>
                    <button type="button" onClick={() => openEdit(r)} style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontSize: 11.5 }}>{bn ? "খুলুন" : "Open"}</button>
                    <button type="button" onClick={() => printSecurityChequeReceipt(r, shop, lang, cur, docsByRecordId[r.id] || {})} style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontSize: 11.5 }}>{bn ? "A4 রসিদ" : "A4 receipt"}</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {form && (
        <div style={{ position: "fixed", inset: 0, zIndex: 10040, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: mobile ? "stretch" : "center", justifyContent: "center", padding: mobile ? 0 : 16 }}>
          <div style={{ width: "100%", maxWidth: mobile ? "none" : 720, maxHeight: mobile ? "100dvh" : "92vh", background: "#f1f5f9", borderRadius: mobile ? 0 : 14, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 12, background: "linear-gradient(135deg,#1e3a8a,#2563eb)", color: "#fff" }}>
              <div style={{ fontWeight: 900 }}>{editId ? (bn ? "রেকর্ড এডিট" : "Edit Record") : (bn ? "নতুন সিকিউরিটি চেক" : "New Security Cheque")}</div>
              <button type="button" onClick={closeForm} style={{ border: "none", background: "rgba(255,255,255,0.18)", color: "#fff", width: 32, height: 32, borderRadius: 8, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
              <div style={card}>
                <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                  <div>
                    <span style={lblStyle}>{bn ? "পার্টির ধরন *" : "Party type *"}</span>
                    <select style={fieldStyle} value={form.partyType} onChange={(e) => setForm((f) => ({ ...f, partyType: e.target.value, party: "", partyId: "" }))}>
                      {PARTY_TYPES.map((t) => <option key={t.key} value={t.key}>{bn ? t.bn : t.en}</option>)}
                    </select>
                  </div>
                  <div>
                    <span style={lblStyle}>{bn ? "চেকের দিক *" : "Direction *"}</span>
                    <select style={fieldStyle} value={form.direction} onChange={(e) => set("direction", e.target.value)}>
                      {DIRECTIONS.map((d) => <option key={d.key} value={d.key}>{bn ? d.bn : d.en}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ marginTop: 8 }}>
                  <span style={lblStyle}>{bn ? "পার্টি / কোম্পানির নাম *" : "Party / company name *"}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input readOnly onClick={() => setPickerOpen(true)} style={{ ...fieldStyle, cursor: "pointer", background: "#f8fafc" }}
                      placeholder={bn ? "ক্লিক করে তালিকা থেকে বেছে নিন" : "Click to pick from the list"} value={form.party} />
                    <button type="button" onClick={() => setPickerOpen(true)} style={{ padding: "0 12px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontSize: 13 }}>🔎</button>
                  </div>
                  <div style={{ fontSize: 10.5, color: "#64748b", marginTop: 3 }}>
                    {bn ? "Product/Vendor/Customer Master-এ যা আছে, তা থেকেই বাছতে হবে — নতুন করে টাইপ করার দরকার নেই।" : "Picked from the existing Vendor/Customer master — no need to type a new name."}
                  </div>
                </div>
              </div>

              <div style={card}>
                <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                  <div><span style={lblStyle}>{bn ? "প্রতিনিধির নাম" : "Representative name"}</span><input style={fieldStyle} value={form.rep} onChange={(e) => set("rep", e.target.value)} /></div>
                  <div><span style={lblStyle}>{bn ? "প্রতিনিধির পদ" : "Representative role"}</span><input style={fieldStyle} value={form.repRole} onChange={(e) => set("repRole", e.target.value)} /></div>
                  <div>
                    <span style={lblStyle}>{bn ? "আইডির ধরন" : "ID type"}</span>
                    <select style={fieldStyle} value={form.idType} onChange={(e) => set("idType", e.target.value)}>
                      {ID_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div><span style={lblStyle}>{bn ? "আইডি নম্বর (ঐচ্ছিক)" : "ID number (optional)"}</span><input style={fieldStyle} value={form.idNumber} onChange={(e) => set("idNumber", e.target.value)} /></div>
                </div>
              </div>

              <div style={card}>
                <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                  <div><span style={lblStyle}>{bn ? "চেক নম্বর *" : "Cheque number *"}</span><input style={fieldStyle} value={form.chequeNo} onChange={(e) => set("chequeNo", e.target.value)} /></div>
                  <div><span style={lblStyle}>{bn ? "ব্যাংক *" : "Bank *"}</span><input style={fieldStyle} value={form.bank} onChange={(e) => set("bank", e.target.value)} /></div>
                  <div><span style={lblStyle}>{bn ? "চেকের পরিমাণ *" : "Cheque amount *"}</span><input type="number" min="0.01" step="0.01" style={fieldStyle} value={form.amount} onChange={(e) => set("amount", e.target.value)} /></div>
                  <div>
                    <span style={lblStyle}>{bn ? "হস্তান্তর / গ্রহণের তারিখ *" : "Handover / received date *"}</span>
                    <input type="date" style={fieldStyle} value={form.handoverDate} onChange={(e) => set("handoverDate", e.target.value)} />
                    <div style={{ fontSize: 10.5, color: "#64748b", marginTop: 3 }}>
                      {bn ? "এটা শুধু রেকর্ডের তারিখ (কবে চেক হাতবদল হলো) — সিকিউরিটি চেকের নিজের কোনো তারিখ থাকে না, এটা আনডেটেড।" : "This is only the internal record date (when the cheque changed hands) — a security cheque itself is undated, it has no cheque date."}
                    </div>
                  </div>
                  <div><span style={lblStyle}>{bn ? "সর্বশেষ লেনদেনের তারিখ *" : "Last transaction date *"}</span><input type="date" style={fieldStyle} value={form.lastTxn} onChange={(e) => set("lastTxn", e.target.value)} /></div>
                  <div><span style={lblStyle}>{bn ? "দায়িত্বে থাকা কর্মী" : "Responsible staff"}</span><input style={fieldStyle} value={form.staff} onChange={(e) => set("staff", e.target.value)} /></div>
                  <div><span style={lblStyle}>{bn ? "রিমাইন্ডার (মাস)" : "Reminder (months)"}</span><input type="number" min="1" max="24" style={fieldStyle} value={form.reminderMonths} onChange={(e) => set("reminderMonths", e.target.value)} /></div>
                </div>
                <div style={{ marginTop: 8 }}>
                  <span style={lblStyle}>{bn ? "চুক্তি / ক্রেডিট শর্ত" : "Agreement / credit terms"}</span>
                  <input style={fieldStyle} value={form.terms} onChange={(e) => set("terms", e.target.value)} />
                </div>
                <div style={{ marginTop: 8 }}>
                  <span style={lblStyle}>{bn ? "চুক্তির কপি (ঐচ্ছিক, PDF/ছবি)" : "Agreement document (optional, PDF/image)"}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <input ref={agreementFileRef} type="file" accept="application/pdf,image/*" style={{ display: "none" }} onChange={pickAgreementFile} />
                    <button type="button" onClick={() => agreementFileRef.current?.click()} disabled={agreementBusy} style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontSize: 12 }}>
                      {agreementBusy ? "…" : (docs.agreementFile ? (bn ? "🔁 বদলান" : "🔁 Replace") : (bn ? "📎 আপলোড" : "📎 Upload"))}
                    </button>
                    {docs.agreementFile && (
                      <>
                        <span style={{ fontSize: 12, color: "#334155" }}>📄 {form.agreementFileName || (bn ? "ফাইল সংযুক্ত" : "File attached")}</span>
                        <button type="button" onClick={() => openDocFile({ file: docs.agreementFile, label: form.agreementFileName })} style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontSize: 11.5 }}>{bn ? "দেখুন" : "View"}</button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div style={card}>
                <div style={{ fontWeight: 800, fontSize: 12.5, marginBottom: 6 }}>{bn ? "সম্পর্কিত ইনভয়েস ও বর্তমান বাকি (শুধু দেখার জন্য)" : "Related invoices & current outstanding (read-only)"}</div>
                {form.partyId ? (
                  <>
                    <div style={{ fontSize: 12.5, marginBottom: 8 }}>
                      {bn ? "বর্তমান বাকি" : "Current outstanding"} ({form.partyType === "vendor" ? (bn ? "দেয়" : "payable") : (bn ? "পাওনা" : "receivable")}): <b>{money(outstandingBalanceFor(form.partyType === "vendor" ? purchaseInvoices : salesInvoices, form.partyType === "vendor" ? "vendorId" : "customerId", form.partyId), cur)}</b>
                    </div>
                    {(() => {
                      const open = openInvoicesFor(form.partyType === "vendor" ? purchaseInvoices : salesInvoices, form.partyType === "vendor" ? "vendorId" : "customerId", form.partyId);
                      if (!open.length) return <div style={{ fontSize: 12, color: "#64748b" }}>{bn ? "কোনো খোলা ইনভয়েস নেই" : "No open invoices"}</div>;
                      const linked = new Set((form.linkedInvoices || []).map((l) => l.invoiceId));
                      const toggle = (inv) => setForm((f) => {
                        const has = (f.linkedInvoices || []).some((l) => l.invoiceId === inv.id);
                        return { ...f, linkedInvoices: has ? f.linkedInvoices.filter((l) => l.invoiceId !== inv.id) : [...(f.linkedInvoices || []), { invoiceId: inv.id, invoiceNo: inv.invoiceNo, type: form.partyType === "vendor" ? "purchase" : "sales" }] };
                      });
                      return open.map((inv) => (
                        <label key={inv.id} style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0", fontSize: 12.5, cursor: "pointer" }}>
                          <input type="checkbox" checked={linked.has(inv.id)} onChange={() => toggle(inv)} />
                          {inv.invoiceNo} — {money(inv.balanceDue, cur)} {bn ? "বাকি" : "due"}
                        </label>
                      ));
                    })()}
                    <div style={{ fontSize: 10.5, color: "#64748b", marginTop: 4 }}>
                      {bn ? "এগুলো শুধু লিংক হিসেবে রাখা হয় — কোনো নতুন হিসাব/এন্ট্রি তৈরি হয় না, বিল/পেমেন্টের ডেটা এখান থেকে শুধু পড়া হয়।" : "These are kept only as links — no new accounting entry is created, this only reads existing invoice/payment data."}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: "#64748b" }}>{bn ? "প্রথমে উপরে পার্টি বাছাই করুন" : "Pick the party above first"}</div>
                )}
              </div>

              <div style={card}>
                <div style={{ fontWeight: 800, fontSize: 12.5, marginBottom: 6 }}>{bn ? "রসিদের কাগজপত্র (ভেন্ডর/কাস্টমারের রসিদ + সই করা A4 কপি, একই জায়গায়)" : "Receipt documents (vendor/customer receipt + signed A4 copy, kept together)"}</div>
                <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                  <div><span style={lblStyle}>{bn ? "রসিদ নম্বর" : "Receipt number"}</span><input style={fieldStyle} value={form.receiptNo} onChange={(e) => set("receiptNo", e.target.value)} /></div>
                  <div><span style={lblStyle}>{bn ? "রসিদের তারিখ" : "Receipt date"}</span><input type="date" style={fieldStyle} value={form.receiptDate} onChange={(e) => set("receiptDate", e.target.value)} /></div>
                </div>
                <div style={{ marginTop: 8 }}>
                  <span style={lblStyle}>{bn ? "শিরোনাম / বিবরণ (ঐচ্ছিক)" : "Title / description (optional)"}</span>
                  <input style={fieldStyle} value={form.receiptTitle} onChange={(e) => set("receiptTitle", e.target.value)} />
                </div>
                <div style={{ marginTop: 8 }}>
                  <span style={lblStyle}>{bn ? "রসিদের কপি (PDF, JPG, PNG)" : "Receipt document (PDF, JPG, PNG)"}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <input ref={receiptFileRef} type="file" accept="application/pdf,image/*" style={{ display: "none" }} onChange={pickReceiptFile} />
                    <button type="button" onClick={() => receiptFileRef.current?.click()} disabled={receiptBusy} style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontSize: 12 }}>
                      {receiptBusy ? "…" : (docs.receiptFile ? (bn ? "🔁 বদলান" : "🔁 Replace") : (bn ? "📎 আপলোড" : "📎 Upload"))}
                    </button>
                    {docs.receiptFile && (
                      <>
                        <span style={{ fontSize: 12, color: "#334155" }}>📄 {form.receiptFileName || (bn ? "ফাইল সংযুক্ত" : "File attached")}</span>
                        <button type="button" onClick={() => openDocFile({ file: docs.receiptFile, label: form.receiptFileName })} style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontSize: 11.5 }}>{bn ? "দেখুন" : "View"}</button>
                      </>
                    )}
                  </div>
                  <div style={{ fontSize: 10.5, color: "#64748b", marginTop: 4 }}>
                    {bn ? "এই ডকুমেন্ট শুধু সংযুক্তি হিসেবে থাকবে, A4 রসিদে এর ছবি/পেজ দেখানো হবে না — শুধু রসিদ নম্বর ও তারিখ প্রিন্টে যাবে।" : "This document stays attachment-only — its image/pages are never shown on the A4 receipt, only the receipt number and date print there."}
                  </div>
                </div>

                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed #cbd5e1" }}>
                  <span style={lblStyle}>{bn ? "সই করা A4 রসিদের কপি (প্রিন্ট করে সই নেওয়ার পর স্ক্যান/ছবি তুলে আপলোড করুন)" : "Signed A4 receipt copy (after printing and getting it signed, scan/photograph and upload it here)"}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <input ref={signedCopyFileRef} type="file" accept="application/pdf,image/*" style={{ display: "none" }} onChange={pickSignedCopy} />
                    <button type="button" onClick={() => signedCopyFileRef.current?.click()} disabled={signedCopyBusy} style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontSize: 12 }}>
                      {signedCopyBusy ? "…" : (docs.signedReceiptCopy ? (bn ? "🔁 বদলান" : "🔁 Replace") : (bn ? "📎 আপলোড" : "📎 Upload"))}
                    </button>
                    {docs.signedReceiptCopy && (
                      <>
                        <span style={{ fontSize: 12, color: "#334155" }}>📄 {form.signedReceiptCopyFileName || (bn ? "ফাইল সংযুক্ত" : "File attached")}</span>
                        <button type="button" onClick={() => openDocFile({ file: docs.signedReceiptCopy, label: form.signedReceiptCopyFileName })} style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontSize: 11.5 }}>{bn ? "দেখুন" : "View"}</button>
                      </>
                    )}
                  </div>
                  <div style={{ fontSize: 10.5, color: "#64748b", marginTop: 4 }}>
                    {bn ? "এটাও শুধু সংযুক্তি — A4 প্রিন্টে কখনো দেখানো হবে না।" : "This is also attachment-only — never shown on the A4 print."}
                  </div>
                </div>
              </div>

              <div style={card}>
                <div style={{ fontWeight: 800, fontSize: 12.5, marginBottom: 6 }}>{bn ? "ডকুমেন্ট চেকলিস্ট" : "Documents checklist"}</div>
                {SECURITY_CHEQUE_DOC_FLAGS.map((f) => (
                  <label key={f.k} style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0", fontSize: 12.5, cursor: "pointer" }}>
                    <input type="checkbox" checked={!!form[f.k]} onChange={(e) => set(f.k, e.target.checked)} /> {bn ? f.bn : f.en}
                  </label>
                ))}
              </div>

              <div style={card}>
                <PhotoField bn={bn} label={bn ? "চেকের ছবি / স্ক্যান" : "Cheque photo / scan"} value={docs.chequePhoto} onChange={(v) => setDocs((d) => ({ ...d, chequePhoto: v }))} />
                <div style={{ fontSize: 10.5, color: "#64748b", marginTop: 4 }}>
                  {bn ? "স্ক্যানার/প্রিন্টার দিয়ে স্ক্যান করা ছবিটা ফাইল হিসেবে এখানে বাছাই করুন — সফটওয়্যার নিজে থেকে স্ক্যানার চালু করে না, স্ক্যান করা কপিটা বেছে নিতে হবে।" : "Pick the scanned/photographed file here after scanning it on your scanner or printer — the app can't trigger the scanner itself, you pick the resulting file."}
                </div>
              </div>

              <div style={card}>
                <div style={{ display: "flex", gap: 10, flexDirection: mobile ? "column" : "row" }}>
                  <PhotoField bn={bn} label={bn ? "আইডি কার্ড — সামনে" : "ID card — front"} value={docs.idFront} onChange={(v) => setDocs((d) => ({ ...d, idFront: v }))} />
                  <PhotoField bn={bn} label={bn ? "আইডি কার্ড — পেছনে" : "ID card — back"} value={docs.idBack} onChange={(v) => setDocs((d) => ({ ...d, idBack: v }))} />
                </div>
              </div>
              <div style={card}>
                <span style={lblStyle}>{bn ? "নোট" : "Notes"}</span>
                <textarea rows={2} style={fieldStyle} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
              </div>

              {editId && (
                <div style={card}>
                  <div style={{ fontWeight: 800, fontSize: 12.5, marginBottom: 6 }}>{bn ? "রেকর্ড অ্যাকশন" : "Record actions"} — {bn ? "স্ট্যাটাস" : "Status"}: <b>{label(STATUSES, form.status, bn)}</b></div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    <button type="button" onClick={() => printSecurityChequeReceipt(form, shop, lang, cur, docs)} style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontSize: 12 }}>🖨️ {bn ? "A4 রসিদ প্রিন্ট" : "Print A4 receipt"}</button>
                    {form.status === "held" && !form.closureRequested && (
                      <button type="button" onClick={() => requestClosure(form).then(() => openEdit(form))} style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontSize: 12 }}>{bn ? "বন্ধের অনুরোধ" : "Request closure"}</button>
                    )}
                    {form.status === "held" && form.closureRequested && !form.closureApproved && (
                      <button type="button" onClick={() => cancelClosureRequest(form).then(() => openEdit(form))} style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontSize: 12 }}>{bn ? "অনুরোধ বাতিল" : "Cancel closure request"}</button>
                    )}
                    {isOwner && form.status === "held" && form.closureRequested && !form.closureApproved && (
                      <button type="button" onClick={() => approveClosure(form).then(() => openEdit(form))} style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #15803d", background: "#f0fdf4", color: "#15803d", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>✅ {bn ? "বন্ধের অনুমোদন (মালিক)" : "Approve closure (owner)"}</button>
                    )}
                    {isOwner && form.status === "held" && (
                      <button type="button" onClick={() => markReturned(form).then(() => openEdit(form))} style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontSize: 12 }}>{bn ? "চেক ফেরত মার্ক (মালিক)" : "Mark returned (owner)"}</button>
                    )}
                    {isOwner && form.status === "held" && (
                      <button type="button" onClick={() => markPresented(form).then(() => openEdit(form))} style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontSize: 12 }}>{bn ? "ব্যাংকে জমা মার্ক (মালিক)" : "Mark presented (owner)"}</button>
                    )}
                    {isOwner && (
                      <button type="button" onClick={() => deleteRecord(form)} style={{ padding: "7px 10px", borderRadius: 8, border: "none", background: "#b91c1c", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>🗑️ {bn ? "ডিলিট" : "Delete"}</button>
                    )}
                  </div>
                  {isOwner && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed #cbd5e1" }}>
                      <span style={lblStyle}>{bn ? "ফেরতের প্রমাণ (ঐচ্ছিক — চেক ফেরত দেওয়ার স্বীকৃতি/ছবি)" : "Return evidence (optional — the signed return acknowledgement/photo)"}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <input ref={evidenceFileRef} type="file" accept="application/pdf,image/*" style={{ display: "none" }} onChange={pickEvidenceFile} />
                        <button type="button" onClick={() => evidenceFileRef.current?.click()} disabled={evidenceBusy} style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontSize: 12 }}>
                          {evidenceBusy ? "…" : (docs.returnEvidence ? (bn ? "🔁 বদলান" : "🔁 Replace") : (bn ? "📎 আপলোড" : "📎 Upload"))}
                        </button>
                        {docs.returnEvidence && (
                          <>
                            <span style={{ fontSize: 12, color: "#334155" }}>📄 {form.returnEvidenceFileName || (bn ? "ফাইল সংযুক্ত" : "File attached")}</span>
                            <button type="button" onClick={() => openDocFile({ file: docs.returnEvidence, label: form.returnEvidenceFileName })} style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontSize: 11.5 }}>{bn ? "দেখুন" : "View"}</button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, padding: 12, background: "#fff", borderTop: "1px solid #e2e8f0" }}>
              <button type="button" onClick={closeForm} style={{ flex: 1, padding: 12, borderRadius: 10, border: "1px solid #cbd5e1", background: "#fff", color: "#334155", fontWeight: 800, cursor: "pointer" }}>{bn ? "বাতিল" : "Cancel"}</button>
              <button type="button" onClick={save} disabled={busy} style={{ flex: 2, padding: 12, borderRadius: 10, border: "none", background: busy ? "#94a3b8" : "linear-gradient(135deg,#15803d,#16a34a)", color: "#fff", fontWeight: 900, cursor: busy ? "default" : "pointer" }}>
                {busy ? "…" : `💾 ${bn ? "সেভ করুন" : "Save"}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {pickerOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 10060 }}>
          <PartyPickerWindow
            title={form.partyType === "vendor" ? (bn ? "ভেন্ডর বাছাই করুন" : "Select Vendor") : (bn ? "কাস্টমার বাছাই করুন" : "Select Customer")}
            columns={form.partyType === "vendor" ? VENDOR_PICKER_COLS : CUSTOMER_PICKER_COLS}
            items={form.partyType === "vendor" ? vendors : customers}
            partyWord={form.partyType === "vendor" ? "vendor" : "customer"}
            lang={lang}
            onPick={(p) => { setForm((f) => ({ ...f, party: p.vendorName || p.customerName || "", partyId: p.id || "" })); setPickerOpen(false); }}
            onClose={() => setPickerOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
