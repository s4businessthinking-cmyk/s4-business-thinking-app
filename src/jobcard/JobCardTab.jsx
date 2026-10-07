import React, { useEffect, useMemo, useRef, useState } from "react";
import { offlineCreate, offlineRemove, offlineUpdate } from "../offline/offlineRepository";
import { PM_CSS } from "../product-master/pmStyles";
import { SI_CSS, usePmFitHeight, usePmMobile } from "../sales-invoice/siSkin";
import { subscribeShopCollection } from "../offline/realtimeSync";
import { saveShopRecord } from "../offline/shopService";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { logAudit } from "../utils/auditLog.js";
import { taxSettingsOf } from "../reports/taxDomain.js";
import ProductPicker from "../components/ProductPicker.jsx";
import { jobSettingsOf, statusOf, isClosed, jobTotals, warrantyUntil, jobToInvoiceSource, r2, DEFAULT_STATUSES, DEFAULT_WARRANTIES } from "./jobCard.js";

const n = (v) => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
const money = (v) => r2(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const monthStart = () => { const d = new Date(); return localDay(new Date(d.getFullYear(), d.getMonth(), 1)); };
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const ACCENT = "#c2410c";

const emptyForm = (settings) => {
  const w = settings.warranties.find((x) => x.id === settings.defaultWarrantyId) || settings.warranties[0] || { id: "", name: "", days: 0 };
  return {
    jobDate: localDay(), customerId: "", customerName: "", customerMobile: "", customerAddress: "", customerTrn: "",
    vehicleNo: "", vehicleModel: "", odometer: "", itemDesc: "", serialNo: "", complaint: "", diagnosis: "",
    technicianId: "", expectedDate: "", warrantyId: w.id, note: "", services: [], parts: [],
  };
};

export default function JobCardTab({ lang = "en", shopId, user, profile, isOwner, canManage, cur = "AED", toast, shop = null, onShopUpdated, customers = [], products = [], makeNo, leaveGuard = null, onMakeInvoice }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const settings = useMemo(() => jobSettingsOf(shop), [shop]);
  const taxCfg = useMemo(() => taxSettingsOf(shop), [shop]);
  const taxRegistered = taxCfg.taxApplicable !== "none";
  const defaultVat = settings.defaultVat !== "" ? String(settings.defaultVat) : taxRegistered ? String(taxCfg.rate ?? 5) : "0";
  const stLabel = (key) => { const s = statusOf(settings, key); return bn ? s.bn || s.en : s.en || s.bn; };

  const [section, setSection] = useState("jobs");
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [view, setView] = useState("list");
  const [selId, setSelId] = useState(null);
  const [form, setForm] = useState(null);
  const [editId, setEditId] = useState(null);
  const [baseline, setBaseline] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");
  const mobile = usePmMobile();
  const rootRef = useRef(null);
  const fitH = usePmFitHeight(rootRef, mobile);

  useEffect(() => {
    if (!shopId) return undefined;
    const u1 = subscribeShopCollection({ collectionName: "jobOrders", shopId, onRows: (list) => setRows(list || []) });
    const u2 = subscribeShopCollection({ collectionName: "employees", shopId, onRows: (list) => setEmployees((list || []).filter((e) => e && !e.isDeleted && e.shopId === shopId)) });
    return () => { try { u1?.(); u2?.(); } catch { /* ignore */ } };
  }, [shopId]);

  const jobs = useMemo(() => rows.filter((r) => r && !r.isDeleted && r.shopId === shopId && r.jobNo), [rows, shopId]);
  const techs = useMemo(() => employees.filter((e) => e.status !== "inactive").sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))), [employees]);
  const techName = (id, fb = "") => employees.find((e) => e.id === id)?.name || fb;
  const sel = selId ? jobs.find((j) => j.id === selId) : null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs
      .filter((j) => statusFilter === "all" || (statusFilter === "open" ? !isClosed(j) && !statusOf(settings, j.status).done : j.status === statusFilter))
      .filter((j) => !q || [j.jobNo, j.customerName, j.customerMobile, j.vehicleNo, j.itemDesc, j.serialNo, j.technicianName].some((v) => String(v || "").toLowerCase().includes(q)))
      .sort((a, b) => String(b.jobDate || "").localeCompare(String(a.jobDate || "")) || String(b.jobNo || "").localeCompare(String(a.jobNo || "")));
  }, [jobs, search, statusFilter, settings]);

  const counts = useMemo(() => {
    const m = new Map();
    jobs.forEach((j) => m.set(j.status, (m.get(j.status) || 0) + 1));
    return m;
  }, [jobs]);
  const openCount = jobs.filter((j) => !isClosed(j) && !statusOf(settings, j.status).done).length;
  const readyCount = jobs.filter((j) => !isClosed(j) && statusOf(settings, j.status).done).length;
  const overdue = jobs.filter((j) => !isClosed(j) && !statusOf(settings, j.status).done && j.expectedDate && j.expectedDate < localDay()).length;

  // ── form ──
  const openNew = () => { const f = emptyForm(settings); setEditId(null); setForm(f); setBaseline(JSON.stringify(f)); setView("form"); };
  const openEdit = (j) => {
    const f = {
      ...emptyForm(settings),
      ...Object.fromEntries(Object.keys(emptyForm(settings)).filter((k) => !["services", "parts"].includes(k)).map((k) => [k, j[k] == null ? "" : String(j[k])])),
      services: (j.services || []).map((s) => ({ ...s, key: uid(), qty: String(s.qty ?? 1), charge: String(s.charge ?? ""), vatPerc: String(s.vatPerc ?? defaultVat) })),
      parts: (j.parts || []).map((p) => ({ ...p, key: uid(), qty: String(p.qty ?? ""), unitPrice: String(p.unitPrice ?? ""), vatPerc: String(p.vatPerc ?? defaultVat) })),
    };
    setEditId(j.id); setForm(f); setBaseline(JSON.stringify(f)); setView("form");
  };
  const formDirty = !!form && JSON.stringify(form) !== baseline;
  const closeForm = () => {
    if (saving) return;
    if (formDirty && !window.confirm(L("সেভ না করা পরিবর্তন আছে। বন্ধ করবেন?", "You have unsaved changes. Close anyway?"))) return;
    setForm(null); setView(editId ? "detail" : "list"); if (editId) setSelId(editId); setEditId(null);
  };
  useEffect(() => {
    if (!leaveGuard || !form) return undefined;
    const guard = { leave: () => !formDirty || window.confirm(L("সেভ না করা পরিবর্তন আছে। বন্ধ করবেন?", "You have unsaved changes. Close anyway?")), back: () => { closeForm(); return true; } };
    leaveGuard.current = guard;
    return () => { if (leaveGuard.current === guard) leaveGuard.current = null; };
  });

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const pickCustomer = (name) => {
    const c = customers.find((x) => !x.isDeleted && String(x.customerName || "").trim().toLowerCase() === name.trim().toLowerCase());
    setForm((f) => ({
      ...f, customerName: name,
      ...(c ? { customerId: c.id, customerMobile: c.mobileNumber || f.customerMobile, customerAddress: [c.address, c.area, c.city].filter(Boolean).join(", "), customerTrn: c.trnNumber || "" } : { customerId: "" }),
    }));
  };
  const addService = (svc) => setForm((f) => ({ ...f, services: [...f.services, { key: uid(), serviceId: svc?.id || "", name: svc?.name || "", qty: "1", charge: svc ? String(svc.charge ?? "") : "", vatPerc: svc && svc.vatPerc !== undefined && svc.vatPerc !== "" ? String(svc.vatPerc) : defaultVat }] }));
  const setService = (key, patch) => setForm((f) => ({ ...f, services: f.services.map((s) => (s.key === key ? { ...s, ...patch } : s)) }));
  const addPart = (p) => setForm((f) => {
    const ex = f.parts.find((x) => x.productId === p.id);
    if (ex) return { ...f, parts: f.parts.map((x) => (x.productId === p.id ? { ...x, qty: String(n(x.qty) + 1) } : x)) };
    return { ...f, parts: [...f.parts, { key: uid(), productId: p.id, name: p.name || "", code: p.code || p.barcode || "", brand: p.brand || "", unit: p.unit || "Pcs", qty: "1", unitPrice: String(p.vatExclusive || p.mrp || ""), vatPerc: taxRegistered ? String(p.salesVat ?? defaultVat) : "0" }] };
  });
  const setPart = (key, patch) => setForm((f) => ({ ...f, parts: f.parts.map((p) => (p.key === key ? { ...p, ...patch } : p)) }));

  const save = async () => {
    if (saving || !form || !canManage) return;
    if (!form.customerName.trim()) { toast?.(L("❌ কাস্টমারের নাম লিখুন", "❌ Enter the customer name"), "err"); return; }
    if (!form.complaint.trim() && !form.services.length && !form.parts.length) { toast?.(L("❌ সমস্যা / কাজের বিবরণ লিখুন", "❌ Describe the complaint or the work"), "err"); return; }
    if (form.services.some((s) => !s.name.trim())) { toast?.(L("❌ প্রতিটি সার্ভিসের নাম দিন", "❌ Every service needs a name"), "err"); return; }
    setSaving(true);
    const nowIso = new Date().toISOString();
    const w = settings.warranties.find((x) => x.id === form.warrantyId);
    const prev = editId ? jobs.find((j) => j.id === editId) || {} : {};
    const body = {
      jobDate: form.jobDate || localDay(), customerId: form.customerId || "", customerName: form.customerName.trim(), customerMobile: form.customerMobile.trim(),
      customerAddress: form.customerAddress.trim(), customerTrn: form.customerTrn.trim(),
      vehicleNo: form.vehicleNo.trim(), vehicleModel: form.vehicleModel.trim(), odometer: form.odometer.trim(), itemDesc: form.itemDesc.trim(), serialNo: form.serialNo.trim(),
      complaint: form.complaint.trim(), diagnosis: form.diagnosis.trim(), technicianId: form.technicianId || "", technicianName: form.technicianId ? techName(form.technicianId, prev.technicianName || "") : "",
      expectedDate: form.expectedDate || "", warrantyId: w?.id || "", warrantyName: w?.name || "", warrantyDays: n(w?.days), note: form.note.trim(),
      services: form.services.map((s) => ({ serviceId: s.serviceId || "", name: s.name.trim(), qty: n(s.qty) || 1, charge: r2(s.charge), vatPerc: n(s.vatPerc) })),
      parts: form.parts.filter((p) => n(p.qty) > 0).map((p) => ({ productId: p.productId || null, name: p.name, code: p.code || "", brand: p.brand || "", unit: p.unit || "Pcs", qty: n(p.qty), unitPrice: r2(p.unitPrice), vatPerc: n(p.vatPerc) })),
      updatedAt: nowIso, updatedBy: user?.uid || "",
    };
    body.grandTotal = jobTotals(body).total;
    try {
      if (editId) {
        await offlineUpdate("jobOrders", editId, { ...prev, ...body });
        setRows((l) => l.map((r) => (r.id === editId ? { ...r, ...body } : r)));
        toast?.(L("✅ জব কার্ড আপডেট হয়েছে", "✅ Job card updated"));
        setSelId(editId);
      } else {
        const jobNo = await makeNo("lastJOSerial", "JO", jobs.map((j) => j.jobNo));
        const first = settings.statuses[0]?.key || "received";
        const payload = { ...body, shopId, jobNo, status: first, statusHistory: [{ status: first, at: nowIso, by: profile?.personName || "" }], createdBy: user?.uid || "", createdByName: profile?.personName || "", createdAt: nowIso };
        const res = await offlineCreate("jobOrders", payload);
        setRows((l) => [{ ...payload, id: res.documentId }, ...l]);
        toast?.(L(`✅ জব কার্ড ${jobNo} সেভ হয়েছে`, `✅ Job card ${jobNo} saved`));
        setSelId(res.documentId);
      }
      setForm(null); setEditId(null); setView("detail");
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
    } catch (e) {
      toast?.(`❌ ${e?.message || e}`, "err");
    } finally {
      setSaving(false);
    }
  };

  const patchJob = async (j, patch, msg) => {
    const nowIso = new Date().toISOString();
    const next = { ...j, ...patch, updatedAt: nowIso, updatedBy: user?.uid || "" };
    try {
      await offlineUpdate("jobOrders", j.id, next);
      setRows((l) => l.map((r) => (r.id === j.id ? next : r)));
      if (msg) toast?.(msg);
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
      return true;
    } catch (e) {
      toast?.(`❌ ${e?.message || e}`, "err");
      return false;
    }
  };

  const setStatus = (j, key) => {
    if (!canManage || isClosed(j) || j.status === key) return;
    const nowIso = new Date().toISOString();
    const info = statusOf(settings, key);
    const patch = { status: key, statusHistory: [...(j.statusHistory || []), { status: key, at: nowIso, by: profile?.personName || "" }] };
    if (info.done && !j.completedAt) patch.completedAt = nowIso;
    if (key === "delivered") patch.deliveredAt = nowIso;
    patchJob(j, patch, `✅ ${j.jobNo}: ${stLabel(key)}`);
  };

  const cancelJob = async (j) => {
    if (!canManage || isClosed(j)) return;
    if (!window.confirm(L(`${j.jobNo} বাতিল করবেন?`, `Cancel ${j.jobNo}?`))) return;
    const nowIso = new Date().toISOString();
    const ok = await patchJob(j, { status: "cancelled", prevStatus: j.status, cancelledAt: nowIso, statusHistory: [...(j.statusHistory || []), { status: "cancelled", at: nowIso, by: profile?.personName || "" }] }, L("জব কার্ড বাতিল হয়েছে", "Job card cancelled"));
    if (ok) logAudit({ shopId, user, profile, action: "cancel", collection: "jobOrders", docId: j.id, docNo: j.jobNo, amount: j.grandTotal, note: j.customerName || "" });
  };
  const reopenJob = (j) => {
    if (!canManage || j.status !== "cancelled") return;
    const back = j.prevStatus && j.prevStatus !== "invoiced" ? j.prevStatus : settings.statuses[0]?.key || "received";
    patchJob(j, { status: back, statusHistory: [...(j.statusHistory || []), { status: back, at: new Date().toISOString(), by: profile?.personName || "" }] }, L("আবার খোলা হয়েছে", "Reopened"));
  };
  const deleteJob = async (j) => {
    if (!isOwner || j.status !== "cancelled") return;
    if (!window.confirm(L(`${j.jobNo} একেবারে মুছে ফেলবেন?`, `Delete ${j.jobNo} permanently?`))) return;
    try {
      await offlineRemove("jobOrders", j.id);
      setRows((l) => l.filter((r) => r.id !== j.id));
      setSelId(null); setView("list");
      logAudit({ shopId, user, profile, action: "delete", collection: "jobOrders", docId: j.id, docNo: j.jobNo, amount: j.grandTotal, note: j.customerName || "" });
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
    } catch (e) {
      toast?.(`❌ ${e?.message || e}`, "err");
    }
  };

  const makeInvoice = (j) => {
    if (!onMakeInvoice) return;
    if (!(j.services || []).length && !(j.parts || []).length) { toast?.(L("❌ বিল বানানোর আগে সার্ভিস বা পার্টস যোগ করুন", "❌ Add services or parts before billing"), "err"); return; }
    onMakeInvoice(jobToInvoiceSource(j, { taxRegistered }));
  };

  const printJob = (j) => {
    const t = jobTotals(j);
    const cols = [{ label: "#" }, { label: "Description" }, { label: "Qty", align: "right" }, { label: `Rate (${cur})`, align: "right" }, { label: "VAT %", align: "right" }, { label: `Amount (${cur})`, align: "right" }];
    const lines = [
      ...(j.services || []).map((s) => [s.name, s.qty || 1, s.charge, s.vatPerc]),
      ...(j.parts || []).map((p) => [`${p.name}${p.code ? ` (${p.code})` : ""}`, `${p.qty} ${p.unit || ""}`.trim(), p.unitPrice, p.vatPerc]),
    ].map(([d, q, rate, v], i) => [String(i + 1), d, String(q), money(rate), String(n(v)), money(n(String(q).split(" ")[0]) * n(rate))]);
    if (!lines.length) lines.push(["", L("কাজের বিবরণ পরে যোগ হবে", "Work details to be added"), "", "", "", ""]);
    const wu = warrantyUntil(j);
    const party = [
      `Customer: ${j.customerName}${j.customerMobile ? ` · ${j.customerMobile}` : ""}`,
      settings.showVehicle && (j.vehicleNo || j.vehicleModel) ? `Vehicle: ${[j.vehicleNo, j.vehicleModel, j.odometer ? `${j.odometer} km` : ""].filter(Boolean).join(" · ")}` : "",
      settings.showItem && (j.itemDesc || j.serialNo) ? `Item: ${[j.itemDesc, j.serialNo ? `S/N ${j.serialNo}` : ""].filter(Boolean).join(" · ")}` : "",
      j.complaint ? `Complaint: ${j.complaint}` : "", j.diagnosis ? `Diagnosis: ${j.diagnosis}` : "",
      j.technicianName ? `Technician: ${j.technicianName}` : "", j.expectedDate ? `Expected: ${fmtDay(j.expectedDate)}` : "",
      j.warrantyName && n(j.warrantyDays) > 0 ? `Warranty: ${j.warrantyName}${wu ? ` (until ${fmtDay(wu)})` : ""}` : "",
      `Status: ${statusOf(settings, j.status).en}`, settings.terms ? `Terms: ${settings.terms}` : "",
    ].filter(Boolean).join("  |  ");
    printWithSettings(generateStatementHTML({
      shopName: shop?.companyName || "", title: `JOB CARD ${j.jobNo}`, subtitle: fmtDay(j.jobDate), partyLine: party, cols, rows: lines,
      foot: ["", `Services ${money(t.services)} · Parts ${money(t.parts)} · VAT ${money(t.vat)}`, "", "", "TOTAL", money(t.total)],
    }), { lang });
  };

  // ── report ──
  const [rFrom, setRFrom] = useState(monthStart);
  const [rTo, setRTo] = useState(() => localDay());
  const [rStatus, setRStatus] = useState("");
  const [rTech, setRTech] = useState("");
  const reportRows = useMemo(() => jobs
    .filter((j) => (!rFrom || String(j.jobDate) >= rFrom) && (!rTo || String(j.jobDate) <= rTo))
    .filter((j) => !rStatus || j.status === rStatus)
    .filter((j) => !rTech || j.technicianId === rTech)
    .sort((a, b) => String(a.jobDate).localeCompare(String(b.jobDate)) || String(a.jobNo).localeCompare(String(b.jobNo)))
    .map((j) => ({ j, t: jobTotals(j) })), [jobs, rFrom, rTo, rStatus, rTech]);
  const live = reportRows.filter((r) => r.j.status !== "cancelled");
  const rSum = live.reduce((a, r) => ({ services: a.services + r.t.services, parts: a.parts + r.t.parts, total: a.total + r.t.total }), { services: 0, parts: 0, total: 0 });
  const byTech = useMemo(() => {
    const m = new Map();
    live.forEach(({ j, t }) => { const k = j.technicianName || L("কেউ না", "Unassigned"); const c = m.get(k) || { jobs: 0, services: 0, total: 0 }; c.jobs += 1; c.services += t.services; c.total += t.total; m.set(k, c); });
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [live]); // eslint-disable-line react-hooks/exhaustive-deps
  const printReport = () => {
    const cols = [{ label: "Date" }, { label: "Job No" }, { label: "Customer" }, { label: settings.showVehicle ? "Vehicle / Item" : "Item" }, { label: "Technician" }, { label: "Status" }, { label: `Services`, align: "right" }, { label: `Parts`, align: "right" }, { label: `Total (${cur})`, align: "right" }, { label: "Invoice" }];
    const body = reportRows.map(({ j, t }) => [fmtDay(j.jobDate), j.jobNo, j.customerName || "", [j.vehicleNo, j.itemDesc].filter(Boolean).join(" · "), j.technicianName || "", statusOf(settings, j.status).en, money(t.services), money(t.parts), money(t.total), j.convertedInvoiceNo || ""]);
    printWithSettings(generateStatementHTML({ shopName: shop?.companyName || "", title: "JOB ORDER REPORT", subtitle: `${fmtDay(rFrom) || "Start"} — ${fmtDay(rTo) || "Today"}`, cols, rows: body, foot: ["", "", "", "", "", "TOTAL", money(rSum.services), money(rSum.parts), money(rSum.total), ""] }), { lang });
  };

  // ── settings (owner) ──
  const [sDraft, setSDraft] = useState(null);
  const [sSaving, setSSaving] = useState(false);
  const openSettings = () => {
    setSDraft({
      services: settings.services.map((s) => ({ ...s, charge: String(s.charge ?? ""), vatPerc: s.vatPerc === undefined ? "" : String(s.vatPerc), hours: s.hours === undefined ? "" : String(s.hours) })),
      warranties: settings.warranties.map((w) => ({ ...w, days: String(w.days ?? 0) })),
      statuses: settings.statuses.map((s) => ({ ...s })),
      defaultWarrantyId: settings.defaultWarrantyId, showVehicle: settings.showVehicle, showItem: settings.showItem, terms: settings.terms, defaultVat: settings.defaultVat === "" ? "" : String(settings.defaultVat),
    });
    setSection("settings");
  };
  const sSet = (k, v) => setSDraft((d) => ({ ...d, [k]: v }));
  const sRow = (list, id, patch) => setSDraft((d) => ({ ...d, [list]: d[list].map((x) => ((x.id || x.key) === id ? { ...x, ...patch } : x)) }));
  const sDel = (list, id) => setSDraft((d) => ({ ...d, [list]: d[list].filter((x) => (x.id || x.key) !== id) }));
  const saveSettings = async () => {
    if (!isOwner || !sDraft) return;
    if (sDraft.services.some((s) => !s.name.trim())) { toast?.(L("❌ প্রতিটি সার্ভিসের নাম দিন", "❌ Every service needs a name"), "err"); return; }
    if (!sDraft.statuses.length) { toast?.(L("❌ অন্তত একটা স্ট্যাটাস লাগবে", "❌ Keep at least one status"), "err"); return; }
    if (sDraft.statuses.some((s) => !String(s.en || s.bn || "").trim())) { toast?.(L("❌ প্রতিটি স্ট্যাটাসের নাম দিন", "❌ Every status needs a name"), "err"); return; }
    setSSaving(true);
    try {
      const jobCardSettings = {
        services: sDraft.services.map((s) => ({ id: s.id, name: s.name.trim(), code: String(s.code || "").trim(), charge: r2(s.charge), ...(s.vatPerc !== "" ? { vatPerc: n(s.vatPerc) } : {}), ...(s.hours !== "" ? { hours: n(s.hours) } : {}) })),
        warranties: sDraft.warranties.filter((w) => String(w.name || "").trim()).map((w) => ({ id: w.id, name: w.name.trim(), days: Math.max(0, Math.round(n(w.days))) })),
        statuses: sDraft.statuses.map((s) => ({ key: s.key, en: String(s.en || s.bn).trim(), bn: String(s.bn || s.en).trim(), color: s.color || "#64748b", ...(s.done ? { done: true } : {}) })),
        defaultWarrantyId: sDraft.defaultWarrantyId, showVehicle: !!sDraft.showVehicle, showItem: !!sDraft.showItem, terms: sDraft.terms.trim(), defaultVat: sDraft.defaultVat === "" ? "" : n(sDraft.defaultVat),
      };
      const updated = await saveShopRecord(shopId, { jobCardSettings });
      onShopUpdated?.(updated);
      toast?.(L("✅ জব কার্ড সেটিংস সেভ হয়েছে", "✅ Job card settings saved"));
    } catch (e) {
      toast?.(`❌ ${e?.message || e}`, "err");
    } finally {
      setSSaving(false);
    }
  };

  // ── UI pieces ──
  const fField = (label, control, style) => <div className="si-field" style={style}><span className="pm-label">{label}</span>{control}</div>;
  const badge = (key) => { const s = statusOf(settings, key); return <span className="si-badge" style={{ color: s.color, borderColor: s.color }}>{stLabel(key)}</span>; };

  const sectionPills = (
    <div className="si-pills" style={{ margin: "4px 0" }}>
      <button type="button" className={`pm-btn-secondary${section === "jobs" ? " is-active" : ""}`} onClick={() => setSection("jobs")}>🔧 {L("জব অর্ডার", "Job Orders")}</button>
      <button type="button" className={`pm-btn-secondary${section === "report" ? " is-active" : ""}`} onClick={() => setSection("report")}>📊 {L("জব রিপোর্ট", "Job Order Report")}</button>
      {isOwner && <button type="button" className={`pm-btn-secondary${section === "settings" ? " is-active" : ""}`} onClick={openSettings}>⚙️ {L("সার্ভিস চার্জ / ওয়ারেন্টি / স্ট্যাটাস", "Service charges / Warranty / Status")}</button>}
    </div>
  );

  const listView = (
    <>
      <div className="si-toolbar">
        {canManage && <button type="button" className="pm-btn pm-btn--primary" onClick={openNew}>+ {L("নতুন জব কার্ড", "New Job Card")}</button>}
        <span className="si-toolbar-gap" />
        <div className="si-pills">
          <button type="button" className={`pm-btn-secondary${statusFilter === "open" ? " is-active" : ""}`} onClick={() => setStatusFilter("open")}>{L("চলমান", "Open")} ({openCount})</button>
          {settings.allStatuses.map((s) => (counts.get(s.key) ? <button key={s.key} type="button" className={`pm-btn-secondary${statusFilter === s.key ? " is-active" : ""}`} onClick={() => setStatusFilter(s.key)}>{stLabel(s.key)} ({counts.get(s.key)})</button> : null))}
          <button type="button" className={`pm-btn-secondary${statusFilter === "all" ? " is-active" : ""}`} onClick={() => setStatusFilter("all")}>{L("সব", "All")}</button>
        </div>
      </div>
      <div className="si-kpis">
        <div className="si-kpi"><span>{L("চলমান কাজ", "Open jobs")}</span><b style={{ color: ACCENT }}>{openCount}</b></div>
        <div className="si-kpi"><span>{L("কাজ শেষ, বিল বাকি", "Done, not billed")}</span><b style={{ color: readyCount ? "#15803d" : undefined }}>{readyCount}</b></div>
        <div className="si-kpi"><span>{L("সময় পেরিয়ে গেছে", "Overdue")}</span><b style={{ color: overdue ? "#b91c1c" : undefined }}>{overdue}</b></div>
        <div className="si-kpi"><span>{L("মোট জব", "Total jobs")}</span><b>{jobs.length}</b></div>
      </div>
      <div className="si-filters">
        <div className="si-search">
          <input className="pm-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={L("খুঁজুন: জব নং, কাস্টমার, মোবাইল, গাড়ি নং, সিরিয়াল…", "Search: job no, customer, mobile, vehicle, serial…")} />
          {search && <button type="button" onClick={() => setSearch("")}>✕</button>}
        </div>
      </div>
      <div className="si-main is-all">
        <div className="si-box">
          {!filtered.length ? <div className="si-empty">{jobs.length ? L("এই ফিল্টারে কোনো জব নেই", "No jobs in this filter") : L("এখনো কোনো জব কার্ড নেই", "No job cards yet")}</div> : mobile ? filtered.map((j) => (
            <button key={j.id} type="button" className="si-mrow" onClick={() => { setSelId(j.id); setView("detail"); }}>
              <div className="si-mrow-top"><span>{j.jobNo} · {j.customerName}</span><span>{money(j.grandTotal)}</span></div>
              <div className="si-mrow-sub"><span>{fmtDay(j.jobDate)}{j.vehicleNo ? ` · ${j.vehicleNo}` : ""}{j.itemDesc ? ` · ${j.itemDesc}` : ""}</span><span>{badge(j.status)}</span></div>
            </button>
          )) : (
            <table className="pm-table">
              <thead><tr>
                <th style={{ width: 80 }}>{L("তারিখ", "Date")}</th><th style={{ width: 84 }}>{L("জব নং", "Job No")}</th><th>{L("কাস্টমার", "Customer")}</th>
                {settings.showVehicle && <th style={{ width: 120 }}>{L("গাড়ি", "Vehicle")}</th>}
                {settings.showItem && <th style={{ width: 140 }}>{L("জিনিস", "Item")}</th>}
                <th style={{ width: 110 }}>{L("টেকনিশিয়ান", "Technician")}</th><th style={{ width: 84 }}>{L("ডেলিভারি", "Expected")}</th>
                <th style={{ width: 120 }}>{L("অবস্থা", "Status")}</th><th style={{ width: 90 }} className="si-num">{L("মোট", "Total")}</th>
              </tr></thead>
              <tbody>
                {filtered.map((j) => {
                  const late = !isClosed(j) && !statusOf(settings, j.status).done && j.expectedDate && j.expectedDate < localDay();
                  return (
                    <tr key={j.id} className="pm-clickable" onClick={() => { setSelId(j.id); setView("detail"); }} style={j.status === "cancelled" ? { color: "#6b7280" } : undefined}>
                      <td>{fmtDay(j.jobDate)}</td><td className="si-strong">{j.jobNo}</td><td>{j.customerName}{j.customerMobile ? <span className="si-muted"> · {j.customerMobile}</span> : null}</td>
                      {settings.showVehicle && <td>{[j.vehicleNo, j.vehicleModel].filter(Boolean).join(" · ")}</td>}
                      {settings.showItem && <td>{j.itemDesc}</td>}
                      <td>{j.technicianName}</td><td style={late ? { color: "#b91c1c", fontWeight: 700 } : undefined}>{fmtDay(j.expectedDate)}</td>
                      <td>{badge(j.status)}{j.convertedInvoiceNo ? <span className="si-muted"> {j.convertedInvoiceNo}</span> : null}</td>
                      <td className="si-num si-strong">{money(j.grandTotal)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );

  const detailView = sel && (() => {
    const t = jobTotals(sel);
    const wu = warrantyUntil(sel);
    const closed = isClosed(sel);
    const row = (label, value, color) => (value ? <div style={{ display: "flex", gap: 8, padding: "2px 0" }}><span className="pm-label" style={{ minWidth: 120, margin: 0 }}>{label}</span><span style={{ fontWeight: 600, color }}>{value}</span></div> : null);
    return (
      <>
        <div className="si-toolbar">
          <button type="button" className="pm-btn-secondary" onClick={() => { setView("list"); setSelId(null); }}>← {L("তালিকা", "List")}</button>
          <span className="si-toolbar-gap" />
          <button type="button" className="pm-btn-secondary" onClick={() => printJob(sel)}>🖨️ {L("জব কার্ড প্রিন্ট", "Print job card")}</button>
          {canManage && !closed && <button type="button" className="pm-btn-secondary" onClick={() => openEdit(sel)}>✏️ {L("এডিট", "Edit")}</button>}
          {canManage && !closed && onMakeInvoice && <button type="button" className="pm-btn pm-btn--primary" onClick={() => makeInvoice(sel)}>🧾 {L("সেলস বিল বানান", "Make Sales Invoice")}</button>}
          {canManage && !closed && <button type="button" className="pm-btn-secondary pm-btn--danger" onClick={() => cancelJob(sel)}>✖ {L("বাতিল", "Cancel")}</button>}
          {canManage && sel.status === "cancelled" && <button type="button" className="pm-btn-secondary" onClick={() => reopenJob(sel)}>↺ {L("আবার খুলুন", "Reopen")}</button>}
          {isOwner && sel.status === "cancelled" && <button type="button" className="pm-btn-secondary pm-btn--danger" onClick={() => deleteJob(sel)}>🗑️ {L("মুছুন", "Delete")}</button>}
        </div>
        <div className="si-main is-all" style={{ overflow: "auto" }}>
          <div className="si-box" style={{ padding: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
              <strong style={{ fontSize: 16, color: ACCENT }}>🔧 {sel.jobNo}</strong>
              <span>{badge(sel.status)} {sel.convertedInvoiceNo ? <span className="si-muted">→ {sel.convertedInvoiceNo}</span> : null}</span>
            </div>
            {!closed && canManage && (
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                <span className="pm-label" style={{ margin: "auto 4px auto 0" }}>{L("অবস্থা বদলান", "Move to")}:</span>
                {settings.statuses.map((s) => (
                  <button key={s.key} type="button" onClick={() => setStatus(sel, s.key)} disabled={sel.status === s.key}
                    style={{ padding: "3px 8px", borderRadius: 6, border: `1px solid ${s.color}`, background: sel.status === s.key ? s.color : "#fff", color: sel.status === s.key ? "#fff" : s.color, fontWeight: 700, cursor: "pointer" }}>{stLabel(s.key)}</button>
                ))}
              </div>
            )}
            <div className={mobile ? "" : "si-grid2"}>
              <div>
                {row(L("তারিখ", "Date"), fmtDay(sel.jobDate))}
                {row(L("কাস্টমার", "Customer"), [sel.customerName, sel.customerMobile].filter(Boolean).join(" · "))}
                {settings.showVehicle && row(L("গাড়ি", "Vehicle"), [sel.vehicleNo, sel.vehicleModel, sel.odometer ? `${sel.odometer} km` : ""].filter(Boolean).join(" · "))}
                {settings.showItem && row(L("জিনিস", "Item"), [sel.itemDesc, sel.serialNo ? `S/N ${sel.serialNo}` : ""].filter(Boolean).join(" · "))}
                {row(L("টেকনিশিয়ান", "Technician"), sel.technicianName)}
              </div>
              <div>
                {row(L("ডেলিভারির তারিখ", "Expected by"), fmtDay(sel.expectedDate))}
                {row(L("ওয়ারেন্টি", "Warranty"), n(sel.warrantyDays) > 0 ? `${sel.warrantyName}${wu ? ` — ${L("শেষ", "until")} ${fmtDay(wu)}` : ` (${L("ডেলিভারির দিন থেকে শুরু", "starts on delivery")})`}` : "", wu && wu < localDay() ? "#b91c1c" : "#15803d")}
                {row(L("সমস্যা", "Complaint"), sel.complaint)}
                {row(L("পরীক্ষার ফল", "Diagnosis"), sel.diagnosis)}
                {row(L("নোট", "Note"), sel.note)}
              </div>
            </div>
            <table className="pm-table" style={{ marginTop: 8 }}>
              <thead><tr><th>{L("বিবরণ", "Description")}</th><th style={{ width: 70 }} className="si-num">{L("পরিমাণ", "Qty")}</th><th style={{ width: 90 }} className="si-num">{L("রেট", "Rate")}</th><th style={{ width: 60 }} className="si-num">VAT%</th><th style={{ width: 100 }} className="si-num">{L("টাকা", "Amount")}</th></tr></thead>
              <tbody>
                {(sel.services || []).map((s, i) => <tr key={`s${i}`}><td>🛠️ {s.name}</td><td className="si-num">{s.qty || 1}</td><td className="si-num">{money(s.charge)}</td><td className="si-num">{n(s.vatPerc)}</td><td className="si-num">{money(n(s.qty || 1) * n(s.charge))}</td></tr>)}
                {(sel.parts || []).map((p, i) => <tr key={`p${i}`}><td>📦 {p.name}{p.code ? <span className="si-muted"> · {p.code}</span> : null}</td><td className="si-num">{p.qty} {p.unit}</td><td className="si-num">{money(p.unitPrice)}</td><td className="si-num">{n(p.vatPerc)}</td><td className="si-num">{money(n(p.qty) * n(p.unitPrice))}</td></tr>)}
                {!(sel.services || []).length && !(sel.parts || []).length && <tr><td colSpan={5} className="si-muted">{L("এখনো কোনো সার্ভিস বা পার্টস যোগ হয়নি", "No services or parts added yet")}</td></tr>}
              </tbody>
            </table>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 14, marginTop: 6, flexWrap: "wrap" }}>
              <span>{L("সার্ভিস", "Services")}: <b>{money(t.services)}</b></span>
              <span>{L("পার্টস", "Parts")}: <b>{money(t.parts)}</b></span>
              <span>VAT: <b>{money(t.vat)}</b></span>
              <span style={{ color: ACCENT }}>{L("মোট", "Total")}: <b>{cur} {money(t.total)}</b></span>
            </div>
            {(sel.statusHistory || []).length > 0 && (
              <div className="si-hint" style={{ marginLeft: 0, marginTop: 8 }}>
                {(sel.statusHistory || []).map((h, i) => <span key={i} style={{ marginRight: 10 }}>{stLabel(h.status)} · {fmtDay(h.at)} {String(h.at || "").slice(11, 16)}{h.by ? ` · ${h.by}` : ""}</span>)}
              </div>
            )}
          </div>
        </div>
      </>
    );
  })();

  const formView = form && (() => {
    const t = jobTotals({ services: form.services, parts: form.parts });
    const editing = editId ? jobs.find((j) => j.id === editId) : null;
    return (
      <>
        <div className="si-toolbar">
          <strong style={{ color: ACCENT }}>{editing ? `✏️ ${editing.jobNo}` : L("🔧 নতুন জব কার্ড", "🔧 New Job Card")}</strong>
          <span className="si-toolbar-gap" />
          <button type="button" className="pm-btn-secondary" disabled={saving} onClick={closeForm}>{L("বন্ধ", "Close")}</button>
          <button type="button" className="pm-btn pm-btn--primary" disabled={saving} onClick={save}>{saving ? L("সেভ হচ্ছে…", "Saving…") : `💾 ${L("সেভ", "Save")}`}</button>
        </div>
        <div className="si-main is-all" style={{ overflow: "auto" }}>
          <div className={mobile ? "" : "si-cols"} style={mobile ? { display: "flex", flexDirection: "column", gap: 8 } : { alignItems: "flex-start" }}>
            <fieldset className="pm-panel" style={{ margin: 0 }}>
              <legend className="pm-panel-legend">{L("কাস্টমার ও জিনিস", "Customer & item")}</legend>
              <div className="si-panel-body" style={{ gap: 6 }}>
                <div className="si-grid2">
                  {fField(`${L("কাস্টমার", "Customer")} *`, <><input className="pm-input" list="jc-customers" autoFocus={!mobile} value={form.customerName} onChange={(e) => pickCustomer(e.target.value)} /><datalist id="jc-customers">{customers.filter((c) => !c.isDeleted && c.customerName).slice(0, 500).map((c) => <option key={c.id} value={c.customerName}>{c.mobileNumber || ""}</option>)}</datalist></>)}
                  {fField(L("মোবাইল", "Mobile"), <input className="pm-input" inputMode="tel" value={form.customerMobile} onChange={(e) => setF("customerMobile", e.target.value)} />)}
                </div>
                <div className="si-grid2">
                  {fField(L("তারিখ", "Date"), <input type="date" className="pm-input" value={form.jobDate} onChange={(e) => setF("jobDate", e.target.value)} />)}
                  {fField(L("ডেলিভারির তারিখ", "Expected by"), <input type="date" className="pm-input" value={form.expectedDate} onChange={(e) => setF("expectedDate", e.target.value)} />)}
                </div>
                {settings.showVehicle && (
                  <div className="si-grid2">
                    {fField(L("গাড়ি নং", "Vehicle no"), <input className="pm-input" value={form.vehicleNo} onChange={(e) => setF("vehicleNo", e.target.value)} />)}
                    {fField(L("মডেল / কিমি", "Model / KM"), <div style={{ display: "flex", gap: 4 }}><input className="pm-input" value={form.vehicleModel} onChange={(e) => setF("vehicleModel", e.target.value)} /><input className="pm-input" inputMode="numeric" placeholder="KM" style={{ width: 90 }} value={form.odometer} onChange={(e) => setF("odometer", e.target.value)} /></div>)}
                  </div>
                )}
                {settings.showItem && (
                  <div className="si-grid2">
                    {fField(L("জিনিস / যন্ত্র", "Item / device"), <input className="pm-input" value={form.itemDesc} onChange={(e) => setF("itemDesc", e.target.value)} placeholder={L("যেমন: Starter Motor", "e.g. Starter Motor")} />)}
                    {fField(L("সিরিয়াল নং", "Serial no"), <input className="pm-input" value={form.serialNo} onChange={(e) => setF("serialNo", e.target.value)} />)}
                  </div>
                )}
                {fField(L("সমস্যা (কাস্টমার যা বলেছেন)", "Complaint"), <textarea className="pm-input" rows={2} style={{ height: 48 }} value={form.complaint} onChange={(e) => setF("complaint", e.target.value)} />)}
                {fField(L("পরীক্ষার ফল", "Diagnosis"), <textarea className="pm-input" rows={2} style={{ height: 48 }} value={form.diagnosis} onChange={(e) => setF("diagnosis", e.target.value)} />)}
                <div className="si-grid2">
                  {fField(L("টেকনিশিয়ান", "Technician"), (
                    <select className="pm-input" value={form.technicianId} onChange={(e) => setF("technicianId", e.target.value)}>
                      <option value="">{L("— বাছুন —", "— Pick —")}</option>
                      {techs.map((e) => <option key={e.id} value={e.id}>{e.name}{e.designation ? ` · ${e.designation}` : ""}</option>)}
                    </select>
                  ))}
                  {fField(L("ওয়ারেন্টি", "Warranty"), (
                    <select className="pm-input" value={form.warrantyId} onChange={(e) => setF("warrantyId", e.target.value)}>
                      {settings.warranties.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  ))}
                </div>
                {!techs.length && <div className="si-hint" style={{ marginLeft: 0 }}>{L("টেকনিশিয়ান বাছতে আগে Employees মাস্টারে কর্মচারী যোগ করুন", "Add employees in the Employees master to pick a technician")}</div>}
                {fField(L("নোট", "Note"), <input className="pm-input" value={form.note} onChange={(e) => setF("note", e.target.value)} />)}
              </div>
            </fieldset>
            <fieldset className="pm-panel" style={{ margin: 0 }}>
              <legend className="pm-panel-legend">{L("সার্ভিস ও পার্টস", "Services & parts")}</legend>
              <div className="si-panel-body" style={{ gap: 6 }}>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                  <span className="pm-label" style={{ margin: 0 }}>🛠️ {L("সার্ভিস", "Services")}</span>
                  <select className="pm-input" style={{ width: mobile ? "100%" : 220 }} value="" onChange={(e) => { const s = settings.services.find((x) => x.id === e.target.value); if (s) addService(s); }}>
                    <option value="">{settings.services.length ? L("+ সার্ভিস চার্জ মাস্টার থেকে", "+ From service charge master") : L("(সার্ভিস মাস্টার খালি)", "(Service master is empty)")}</option>
                    {settings.services.map((s) => <option key={s.id} value={s.id}>{s.name} — {money(s.charge)}</option>)}
                  </select>
                  <button type="button" className="pm-btn-secondary" onClick={() => addService(null)}>+ {L("নিজে লিখুন", "Custom")}</button>
                </div>
                {form.services.length > 0 && (
                  <table className="pm-table">
                    <thead><tr><th>{L("সার্ভিস", "Service")}</th><th style={{ width: 56 }}>{L("পরিমাণ", "Qty")}</th><th style={{ width: 84 }}>{L("চার্জ", "Charge")}</th><th style={{ width: 52 }}>VAT%</th><th style={{ width: 28 }} /></tr></thead>
                    <tbody>
                      {form.services.map((s) => (
                        <tr key={s.key}>
                          <td><input className="pm-input" value={s.name} onChange={(e) => setService(s.key, { name: e.target.value })} /></td>
                          <td><input className="pm-input" inputMode="decimal" value={s.qty} onChange={(e) => setService(s.key, { qty: e.target.value })} /></td>
                          <td><input className="pm-input" inputMode="decimal" value={s.charge} onChange={(e) => setService(s.key, { charge: e.target.value })} style={{ textAlign: "right" }} /></td>
                          <td><input className="pm-input" inputMode="decimal" value={s.vatPerc} onChange={(e) => setService(s.key, { vatPerc: e.target.value })} /></td>
                          <td><button type="button" style={{ border: 0, background: "none", cursor: "pointer", color: "#b91c1c" }} onClick={() => setForm((f) => ({ ...f, services: f.services.filter((x) => x.key !== s.key) }))}>✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <span className="pm-label" style={{ margin: "6px 0 0" }}>📦 {L("পার্টস (প্রোডাক্ট মাস্টার থেকে — বিল হলে স্টক কমবে)", "Parts (from Product Master — stock goes down when billed)")}</span>
                <ProductPicker products={products} exclude={[]} onPick={addPart} placeholder={L("পার্টস খুঁজুন: নাম, কোড, বারকোড…", "Search parts: name, code, barcode…")} mobile={mobile} lang={lang} />
                {form.parts.length > 0 && (
                  <table className="pm-table">
                    <thead><tr><th>{L("পার্টস", "Part")}</th><th style={{ width: 60 }}>{L("পরিমাণ", "Qty")}</th><th style={{ width: 84 }}>{L("দাম", "Price")}</th><th style={{ width: 52 }}>VAT%</th><th style={{ width: 28 }} /></tr></thead>
                    <tbody>
                      {form.parts.map((p) => (
                        <tr key={p.key}>
                          <td>{p.name}{p.code ? <span className="si-muted"> · {p.code}</span> : null} <span className="si-muted">({p.unit})</span></td>
                          <td><input className="pm-input" inputMode="decimal" value={p.qty} onChange={(e) => setPart(p.key, { qty: e.target.value })} /></td>
                          <td><input className="pm-input" inputMode="decimal" value={p.unitPrice} onChange={(e) => setPart(p.key, { unitPrice: e.target.value })} style={{ textAlign: "right" }} /></td>
                          <td><input className="pm-input" inputMode="decimal" value={p.vatPerc} onChange={(e) => setPart(p.key, { vatPerc: e.target.value })} /></td>
                          <td><button type="button" style={{ border: 0, background: "none", cursor: "pointer", color: "#b91c1c" }} onClick={() => setForm((f) => ({ ...f, parts: f.parts.filter((x) => x.key !== p.key) }))}>✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
                  <span>{L("সার্ভিস", "Services")}: <b>{money(t.services)}</b></span>
                  <span>{L("পার্টস", "Parts")}: <b>{money(t.parts)}</b></span>
                  <span>VAT: <b>{money(t.vat)}</b></span>
                  <span style={{ color: ACCENT }}>{L("মোট", "Total")}: <b>{cur} {money(t.total)}</b></span>
                </div>
              </div>
            </fieldset>
          </div>
        </div>
      </>
    );
  })();

  const reportView = (
    <>
      <div className="si-toolbar">
        <input type="date" className="pm-input" style={{ width: 130 }} value={rFrom} onChange={(e) => setRFrom(e.target.value)} />
        <input type="date" className="pm-input" style={{ width: 130 }} value={rTo} onChange={(e) => setRTo(e.target.value)} />
        <select className="pm-input" style={{ width: 160 }} value={rStatus} onChange={(e) => setRStatus(e.target.value)}>
          <option value="">{L("সব অবস্থা", "All statuses")}</option>
          {settings.allStatuses.map((s) => <option key={s.key} value={s.key}>{stLabel(s.key)}</option>)}
        </select>
        <select className="pm-input" style={{ width: 160 }} value={rTech} onChange={(e) => setRTech(e.target.value)}>
          <option value="">{L("সব টেকনিশিয়ান", "All technicians")}</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <span className="si-toolbar-gap" />
        <button type="button" className="pm-btn-secondary" onClick={printReport} disabled={!reportRows.length}>🖨️ {L("প্রিন্ট", "Print")}</button>
      </div>
      <div className="si-kpis">
        <div className="si-kpi"><span>{L("জব", "Jobs")}</span><b>{live.length}</b></div>
        <div className="si-kpi"><span>{L("সার্ভিস চার্জ", "Service charges")}</span><b>{money(rSum.services)}</b></div>
        <div className="si-kpi"><span>{L("পার্টস", "Parts")}</span><b>{money(rSum.parts)}</b></div>
        <div className="si-kpi"><span>{L("মোট (VAT সহ)", "Total (with VAT)")}</span><b style={{ color: ACCENT }}>{cur} {money(rSum.total)}</b></div>
        <div className="si-kpi"><span>{L("বিল হয়েছে", "Invoiced")}</span><b style={{ color: "#15803d" }}>{live.filter((r) => r.j.status === "invoiced").length}</b></div>
      </div>
      <div className={mobile ? "si-main is-all" : "si-main"}>
        {!mobile && (
          <div className="si-box">
            <table className="pm-table">
              <thead><tr><th>{L("টেকনিশিয়ান", "Technician")}</th><th className="si-num">{L("জব", "Jobs")}</th><th className="si-num">{L("সার্ভিস", "Service")}</th></tr></thead>
              <tbody>{byTech.map(([name, v]) => <tr key={name}><td>{name}</td><td className="si-num">{v.jobs}</td><td className="si-num">{money(v.services)}</td></tr>)}</tbody>
            </table>
            {!byTech.length && <div className="si-empty">{L("কিছু নেই", "Nothing")}</div>}
          </div>
        )}
        <div className="si-box">
          {!reportRows.length ? <div className="si-empty">{L("এই সময়ে কোনো জব নেই", "No jobs in this period")}</div> : (
            <table className="pm-table">
              <thead><tr><th style={{ width: 78 }}>{L("তারিখ", "Date")}</th><th style={{ width: 80 }}>{L("জব নং", "Job No")}</th><th>{L("কাস্টমার", "Customer")}</th><th>{L("গাড়ি / জিনিস", "Vehicle / Item")}</th><th>{L("টেকনিশিয়ান", "Technician")}</th><th>{L("অবস্থা", "Status")}</th><th className="si-num">{L("সার্ভিস", "Service")}</th><th className="si-num">{L("পার্টস", "Parts")}</th><th className="si-num">{L("মোট", "Total")}</th><th>{L("বিল", "Invoice")}</th></tr></thead>
              <tbody>
                {reportRows.map(({ j, t }) => (
                  <tr key={j.id} className="pm-clickable" onClick={() => { setSection("jobs"); setSelId(j.id); setView("detail"); }} style={j.status === "cancelled" ? { color: "#6b7280", textDecoration: "line-through" } : undefined}>
                    <td>{fmtDay(j.jobDate)}</td><td className="si-strong">{j.jobNo}</td><td>{j.customerName}</td><td>{[j.vehicleNo, j.itemDesc].filter(Boolean).join(" · ")}</td><td>{j.technicianName}</td>
                    <td>{badge(j.status)}</td><td className="si-num">{money(t.services)}</td><td className="si-num">{money(t.parts)}</td><td className="si-num si-strong">{money(t.total)}</td><td>{j.convertedInvoiceNo || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );

  const settingsView = sDraft && (
    <>
      <div className="si-toolbar">
        <strong>⚙️ {L("জব কার্ড সেটিংস", "Job Card Settings")}</strong>
        <span className="si-toolbar-gap" />
        <button type="button" className="pm-btn pm-btn--primary" disabled={sSaving} onClick={saveSettings}>{sSaving ? L("সেভ হচ্ছে…", "Saving…") : `💾 ${L("সেটিংস সেভ", "Save settings")}`}</button>
      </div>
      <div className="si-main is-all" style={{ overflow: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(2, minmax(0,1fr))", gap: 8, alignItems: "start" }}>
          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">🛠️ {L("সার্ভিস চার্জ মাস্টার", "Service Charge Master")}</legend>
            <table className="pm-table">
              <thead><tr><th>{L("সার্ভিসের নাম", "Service name")}</th><th style={{ width: 84 }}>{L("চার্জ", "Charge")}</th><th style={{ width: 56 }}>VAT%</th><th style={{ width: 56 }}>{L("ঘণ্টা", "Hours")}</th><th style={{ width: 28 }} /></tr></thead>
              <tbody>
                {sDraft.services.map((s) => (
                  <tr key={s.id}>
                    <td><input className="pm-input" value={s.name} onChange={(e) => sRow("services", s.id, { name: e.target.value })} /></td>
                    <td><input className="pm-input" inputMode="decimal" value={s.charge} onChange={(e) => sRow("services", s.id, { charge: e.target.value })} style={{ textAlign: "right" }} /></td>
                    <td><input className="pm-input" inputMode="decimal" placeholder={defaultVat} value={s.vatPerc} onChange={(e) => sRow("services", s.id, { vatPerc: e.target.value })} /></td>
                    <td><input className="pm-input" inputMode="decimal" value={s.hours} onChange={(e) => sRow("services", s.id, { hours: e.target.value })} /></td>
                    <td><button type="button" style={{ border: 0, background: "none", cursor: "pointer", color: "#b91c1c" }} onClick={() => sDel("services", s.id)}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" className="pm-btn-secondary" style={{ marginTop: 4 }} onClick={() => sSet("services", [...sDraft.services, { id: uid(), name: "", charge: "", vatPerc: "", hours: "" }])}>+ {L("সার্ভিস যোগ", "Add service")}</button>
          </fieldset>

          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">🛡️ {L("ওয়ারেন্টি", "Warranty")}</legend>
            <table className="pm-table">
              <thead><tr><th>{L("নাম", "Name")}</th><th style={{ width: 80 }}>{L("দিন", "Days")}</th><th style={{ width: 70 }}>{L("ডিফল্ট", "Default")}</th><th style={{ width: 28 }} /></tr></thead>
              <tbody>
                {sDraft.warranties.map((w) => (
                  <tr key={w.id}>
                    <td><input className="pm-input" value={w.name} onChange={(e) => sRow("warranties", w.id, { name: e.target.value })} /></td>
                    <td><input className="pm-input" inputMode="numeric" value={w.days} onChange={(e) => sRow("warranties", w.id, { days: e.target.value })} /></td>
                    <td style={{ textAlign: "center" }}><input type="radio" name="jc-defw" checked={sDraft.defaultWarrantyId === w.id} onChange={() => sSet("defaultWarrantyId", w.id)} /></td>
                    <td><button type="button" style={{ border: 0, background: "none", cursor: "pointer", color: "#b91c1c" }} onClick={() => sDel("warranties", w.id)}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
              <button type="button" className="pm-btn-secondary" onClick={() => sSet("warranties", [...sDraft.warranties, { id: uid(), name: "", days: "0" }])}>+ {L("ওয়ারেন্টি যোগ", "Add warranty")}</button>
              <button type="button" className="pm-btn-secondary" onClick={() => sSet("warranties", DEFAULT_WARRANTIES.map((w) => ({ ...w, days: String(w.days) })))}>↺ {L("ডিফল্ট", "Defaults")}</button>
            </div>
          </fieldset>

          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">🚦 {L("স্ট্যাটাস (কাজের ধাপ)", "Status (work stages)")}</legend>
            <table className="pm-table">
              <thead><tr><th>English</th><th>বাংলা</th><th style={{ width: 48 }}>{L("রং", "Color")}</th><th style={{ width: 70 }} title={L("এই ধাপে কাজ শেষ ধরা হবে", "Counts as work finished")}>{L("শেষ?", "Done?")}</th><th style={{ width: 28 }} /></tr></thead>
              <tbody>
                {sDraft.statuses.map((s) => (
                  <tr key={s.key}>
                    <td><input className="pm-input" value={s.en || ""} onChange={(e) => sRow("statuses", s.key, { en: e.target.value })} /></td>
                    <td><input className="pm-input" value={s.bn || ""} onChange={(e) => sRow("statuses", s.key, { bn: e.target.value })} /></td>
                    <td><input type="color" value={s.color || "#64748b"} onChange={(e) => sRow("statuses", s.key, { color: e.target.value })} style={{ width: 40, height: 26, border: 0, padding: 0 }} /></td>
                    <td style={{ textAlign: "center" }}><input type="checkbox" checked={!!s.done} onChange={(e) => sRow("statuses", s.key, { done: e.target.checked })} /></td>
                    <td><button type="button" disabled={jobs.some((j) => j.status === s.key && !isClosed(j))} title={jobs.some((j) => j.status === s.key && !isClosed(j)) ? L("এই ধাপে চলমান জব আছে", "Open jobs are in this stage") : ""} style={{ border: 0, background: "none", cursor: "pointer", color: "#b91c1c" }} onClick={() => sDel("statuses", s.key)}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
              <button type="button" className="pm-btn-secondary" onClick={() => sSet("statuses", [...sDraft.statuses, { key: `s${uid()}`, en: "", bn: "", color: "#64748b" }])}>+ {L("ধাপ যোগ", "Add stage")}</button>
              <button type="button" className="pm-btn-secondary" onClick={() => sSet("statuses", DEFAULT_STATUSES.map((s) => ({ ...s })))}>↺ {L("ডিফল্ট", "Defaults")}</button>
            </div>
            <div className="si-hint" style={{ marginLeft: 0 }}>{L("\"বিল হয়েছে\" আর \"বাতিল\" সফটওয়্যার নিজে দেয়। প্রথম ধাপটা নতুন জবে বসবে।", "\"Invoiced\" and \"Cancelled\" are set automatically. New jobs start at the first stage.")}</div>
          </fieldset>

          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">🔧 {L("সার্ভিস সেটিংস", "Service Settings")}</legend>
            <div className="si-panel-body" style={{ gap: 6 }}>
              <label className="pm-check"><input type="checkbox" checked={!!sDraft.showVehicle} onChange={(e) => sSet("showVehicle", e.target.checked)} /> {L("গাড়ির তথ্য (নং, মডেল, কিমি)", "Vehicle details (no, model, KM)")}</label>
              <label className="pm-check"><input type="checkbox" checked={!!sDraft.showItem} onChange={(e) => sSet("showItem", e.target.checked)} /> {L("জিনিস / যন্ত্র ও সিরিয়াল নং", "Item / device and serial no")}</label>
              {fField(L("সার্ভিসের ডিফল্ট VAT %", "Default VAT % for services"), <input className="pm-input" inputMode="decimal" style={{ width: 100 }} placeholder={taxRegistered ? String(taxCfg.rate ?? 5) : "0"} value={sDraft.defaultVat} onChange={(e) => sSet("defaultVat", e.target.value)} />)}
              {fField(L("জব কার্ডে শর্তাবলী (প্রিন্টে আসবে)", "Terms on the job card (printed)"), <textarea className="pm-input" rows={3} style={{ height: 70 }} value={sDraft.terms} onChange={(e) => sSet("terms", e.target.value)} placeholder={L("যেমন: ৩০ দিনের মধ্যে না নিলে দোকান দায়ী নয়", "e.g. Items not collected within 30 days are at owner's risk")} />)}
            </div>
          </fieldset>
        </div>
      </div>
    </>
  );

  return (
    <div ref={rootRef} className="si-root" style={fitH ? { height: fitH } : undefined}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>
      <div className="pm-reference-title">
        <strong style={{ color: ACCENT }}>🔧 {L("জব কার্ড", "Job Card")}</strong>
        <span>{L("সার্ভিস / মেরামত", "Service / repair")}</span>
      </div>
      {sectionPills}
      {section === "settings" && isOwner ? settingsView
        : section === "report" ? reportView
          : view === "form" && form ? formView
            : view === "detail" && sel ? detailView
              : listView}
    </div>
  );
}
