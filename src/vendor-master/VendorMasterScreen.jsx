import React, { useEffect, useMemo, useRef, useState } from "react";
import { PM_CSS, PM_MOBILE_QUERY } from "../product-master/pmStyles";
import { offlineCreate, offlineList, offlineRemove, offlineUpdate } from "../offline/offlineRepository";
import { syncOpeningBill as syncPartyOpeningBill } from "../utils/openingBill.js";
import { logAudit } from "../utils/auditLog.js";

export const EMPTY_VENDOR = {
  vendorName:"", vendorCode:"", category:"", status:"active",
  contactPerson:"",
  mobileNumber:"", phoneNumber:"", whatsappNumber:"", fax:"", email:"",
  address:"", emirate:"", area:"", city:"", country:"", mapLink:"",
  trnNumber:"", tradeLicenseNumber:"", tinNumber:"", binNumber:"", vatNumber:"",
  bankName:"", bankBranch:"", accountName:"", accountNumber:"", ibanNumber:"", swiftCode:"",
  creditLimit:"", openingBalance:"", paymentTerms:"",
  notes:"",
};

const NUMBER_FIELDS = ["creditLimit", "openingBalance", "paymentTerms"];

const STATUS = {
  active:   { bn:"সক্রিয়",    en:"Active",   color:"#166534" },
  inactive: { bn:"নিষ্ক্রিয়", en:"Inactive", color:"#92400e" },
  blocked:  { bn:"ব্লক",      en:"Blocked",  color:"#b91c1c" },
};

export const VM_CSS = `
.vm-root {
  background: #f3e6c8; color: #07101c;
  font-family: Tahoma, "MS Sans Serif", Arial, sans-serif; font-size: 11px;
  border: 1px solid #7790b2;
  display: flex; flex-direction: column;
  height: calc(100dvh - 34px); min-height: 470px;
}
.vm-root * { box-sizing: border-box; }
.vm-grid {
  flex: 1; min-height: 0;
  display: grid; grid-template-columns: minmax(250px, 1fr) minmax(250px, 1fr) minmax(230px, .85fr);
  gap: 4px; padding: 4px; overflow: hidden;
}
.vm-col { min-width: 0; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 4px; }
.vm-col-list { overflow: hidden; }
.vm-body { display: flex; flex-direction: column; gap: 3px; padding-top: 3px; }
.vm-root .pm-form-row { grid-template-columns: 92px minmax(0, 1fr); gap: 4px; }
.vm-root textarea.pm-input { height: 42px; resize: vertical; }
.vm-req { color: #b91c1c; }
.vm-pills { display: flex; gap: 2px; margin-bottom: 4px; }
.vm-pills > button { flex: 1; }
.vm-pills > button.is-active { background: #315eb8; color: #fff; border-color: #213f80; }
.vm-root .pm-list { flex: 1; min-height: 0; padding: 4px; }
.vm-root .pm-list .pm-table th:nth-child(1) { width: 62%; }
.vm-root .pm-list .pm-table th:nth-child(2) { width: 38%; }
.vm-root .pm-list .pm-table td { height: 17px; font-size: 10px; }
.vm-actions {
  display: flex; flex-wrap: wrap; align-items: center; gap: 3px;
  padding: 4px; border-top: 1px solid #7d94b7;
}
.vm-actions .pm-btn, .vm-actions .pm-btn-secondary { min-width: 78px; height: 28px; }
.vm-info { margin-left: auto; font-size: 10px; color: #334155; }
.vm-dirty { color: #b45309; font-weight: 700; }
@media ${PM_MOBILE_QUERY} {
  .vm-root { height: auto; min-height: 0; border: 0; }
  .vm-mtabs { display: flex; gap: 3px; padding: 0 5px 4px; }
  .vm-mtabs > button {
    flex: 1; height: 32px; border: 1px solid #41658e; border-radius: 3px;
    background: #e4effa; color: #07101c; font: 700 12px Tahoma, sans-serif;
  }
  .vm-mtabs > button.is-active { background: #315eb8; color: #fff; border-color: #213f80; }
  .vm-grid { display: block; overflow: visible; padding: 4px 5px 6px; }
  .vm-grid .vm-col { display: none; }
  .vm-tab-list .vm-col-list, .vm-tab-details .vm-col-details, .vm-tab-more .vm-col-more { display: flex; }
  .vm-root .pm-list { height: calc(100dvh - 230px); min-height: 320px; flex: none; }
  .vm-root .pm-list .pm-table td { height: 34px; font-size: 13px; }
  .vm-root .pm-list .pm-table th { height: 22px; font-size: 12px; }
  .vm-root .pm-form-row { grid-template-columns: 100px minmax(0, 1fr); min-height: 34px; }
  .vm-root .pm-label { font-size: 12px; line-height: 14px; }
  .vm-root .pm-input { height: 34px; padding: 4px 7px; font-size: 14px; }
  .vm-root textarea.pm-input { height: 64px; }
  .vm-pills > button { min-height: 32px; font-size: 12px; }
  .vm-actions .pm-btn, .vm-actions .pm-btn-secondary { flex: 1 1 30%; height: 38px; font-size: 13px; }
  .vm-info { width: 100%; margin-left: 0; text-align: center; font-size: 11px; }
}
`;

const toForm = (v) => Object.fromEntries(Object.keys(EMPTY_VENDOR).map((k) => {
  const raw = v?.[k];
  if (NUMBER_FIELDS.includes(k)) return [k, Number(raw) ? String(raw) : ""];
  return [k, raw == null ? "" : String(raw)];
}).concat([["status", v?.status || "active"]]));

const num = (v) => {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const searchKey = (s) => String(s || "").replace(/[.\-/\\\s_,]+/g, "").toLowerCase();

const mobileQuery = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(PM_MOBILE_QUERY) : null);

function useMobileLayout() {
  const [mobile, setMobile] = useState(() => !!mobileQuery()?.matches);
  useEffect(() => {
    const query = mobileQuery();
    if (!query) return undefined;
    const onChange = () => setMobile(query.matches);
    onChange();
    query.addEventListener?.("change", onChange);
    return () => query.removeEventListener?.("change", onChange);
  }, []);
  return mobile;
}

export default function VendorMasterScreen({
  t, lang, shopId, user, vendors, toast, cur = "AED",
  canEdit = false, canDelete = false, canPurchase = false, actorName = "", leaveGuard, onClose, onGoToPurchase, renderImport, nextCode,
}) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const isMobile = useMobileLayout();
  const [mobileTab, setMobileTab] = useState("list");
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(() => toForm(null));
  const [baseline, setBaseline] = useState(() => JSON.stringify(toForm(null)));
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [saving, setSaving] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const rootRef = useRef(null);
  const [fitHeight, setFitHeight] = useState(null);

  // On PC the screen fills exactly the space below the window title, so the page never scrolls.
  useEffect(() => {
    if (isMobile) { setFitHeight(null); return undefined; }
    const fit = () => {
      const el = rootRef.current; if (!el) return;
      const scroller = el.parentElement;
      const top = el.getBoundingClientRect().top + (scroller?.scrollTop || 0);
      setFitHeight(Math.max(420, Math.floor(window.innerHeight - top)));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [isMobile]);

  const dirty = canEdit && JSON.stringify(form) !== baseline;
  const upd = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const confirmDiscard = () => !dirty || window.confirm(L(
    "ভেন্ডরের পরিবর্তন সেভ করা হয়নি। পরিবর্তন বাদ দেবেন?",
    "Vendor changes are not saved. Discard them?"
  ));

  useEffect(() => {
    if (!leaveGuard) return undefined;
    if (!dirty && !(isMobile && mobileTab !== "list")) return undefined;
    const guard = {
      leave: () => confirmDiscard(),
      back: () => {
        if (!(isMobile && mobileTab !== "list")) return !confirmDiscard();
        if (confirmDiscard()) { loadVendor(null); setMobileTab("list"); }
        return true;
      },
    };
    leaveGuard.current = guard;
    return () => { if (leaveGuard.current === guard) leaveGuard.current = null; };
  });

  const loadVendor = (v) => {
    const next = toForm(v);
    setForm(next);
    setBaseline(JSON.stringify(next));
    setSelectedId(v?.id || null);
    seenSelected.current = !!v;
  };

  // The list keeps the open vendor in sync when another device edits or deletes it.
  // A just-created vendor is not in the list yet, so only a vendor that was listed can go missing.
  const seenSelected = useRef(false);
  const selectedVendor = selectedId ? vendors.find((v) => v.id === selectedId) : null;
  useEffect(() => {
    if (!selectedId || dirty) return;
    if (!selectedVendor) { if (seenSelected.current) loadVendor(null); return; }
    seenSelected.current = true;
    const next = toForm(selectedVendor);
    if (JSON.stringify(next) !== baseline) { setForm(next); setBaseline(JSON.stringify(next)); }
  }, [selectedVendor]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = search.trim();
    const qk = searchKey(q);
    return vendors
      .filter((v) => statusFilter === "ALL" || (v.status || "active") === statusFilter)
      .filter((v) => {
        if (!q) return true;
        const hay = [v.vendorName, v.vendorCode, v.mobileNumber, v.phoneNumber, v.whatsappNumber, v.trnNumber,
          v.city, v.contactPerson, v.tradeLicenseNumber, v.vatNumber].filter(Boolean).join(" ");
        return searchKey(hay).includes(qk) || hay.toLowerCase().includes(q.toLowerCase());
      })
      .sort((a, b) => String(a.vendorName || "").localeCompare(String(b.vendorName || "")));
  }, [vendors, search, statusFilter]);

  const kpi = useMemo(() => ({
    total: vendors.length,
    active: vendors.filter((v) => (v.status || "active") === "active").length,
    credit: vendors.reduce((s, v) => s + num(v.creditLimit), 0),
  }), [vendors]);

  const pick = (v) => {
    if (v.id === selectedId) { if (isMobile) setMobileTab("details"); return; }
    if (!confirmDiscard()) return;
    loadVendor(v);
    if (isMobile) setMobileTab("details");
  };

  const startNew = () => {
    if (!canEdit || !confirmDiscard()) return;
    loadVendor(null);
    if (isMobile) setMobileTab("details");
  };

  // The app's leave guard asks about unsaved changes when the tab changes.
  const close = () => {
    if (!leaveGuard && !confirmDiscard()) return;
    onClose?.();
  };

  // The opening balance lives as one credit purchase bill per vendor, so the ledger shows it and payments can settle it.
  const syncOpeningBill = async (vendorId, saved) => {
    if (!canPurchase) {
      if (num(saved.openingBalance) > 0) toast(L("Opening balance লেজারে নিতে 'ক্রয় ইনভয়েস ম্যানেজ' permission লাগবে", "Putting the opening balance in the ledger needs the Manage Purchase permission"), "err");
      return;
    }
    await syncPartyOpeningBill({ kind: "vendors", partyId: vendorId, party: saved, shopId, uid: user.uid, actorName, bn });
  };

  const save = async () => {
    if (!canEdit || saving) return;
    const name = form.vendorName.trim();
    if (!name) { toast(t.vm_errName, "err"); if (isMobile) setMobileTab("details"); return; }
    if (!selectedId && !form.mobileNumber.trim()) { toast(t.vm_errMobile, "err"); if (isMobile) setMobileTab("details"); return; }
    const sameName = vendors.find((v) => v.id !== selectedId && String(v.vendorName || "").trim().toLowerCase() === name.toLowerCase());
    if (sameName && !window.confirm(L(
      `"${sameName.vendorName}" নামে আরেকটা ভেন্ডর আছে। তবুও সেভ করবেন?`,
      `Another vendor is already named "${sameName.vendorName}". Save anyway?`
    ))) return;

    const now = new Date().toISOString();
    const payload = { shopId, updatedBy: user.uid, updatedAt: now };
    Object.keys(EMPTY_VENDOR).forEach((k) => {
      payload[k] = NUMBER_FIELDS.includes(k) ? num(form[k]) : String(form[k] || "").trim();
    });
    payload.vendorName = name;
    payload.status = form.status || "active";

    const openingChanged = num(form.openingBalance) !== num(JSON.parse(baseline).openingBalance);

    setSaving(true);
    try {
      let savedId = selectedId;
      if (selectedId) {
        await offlineUpdate("vendors", selectedId, payload);
        toast(t.vm_updated);
      } else {
        if (nextCode) payload.vendorCode = await nextCode();
        const result = await offlineCreate("vendors", { ...payload, createdBy: user.uid, createdAt: now });
        savedId = result.documentId;
        toast(t.vm_saved);
      }
      const saved = toForm(payload);
      setForm(saved);
      setBaseline(JSON.stringify(saved));
      setSelectedId(savedId);
      if (openingChanged || (selectedId === null && num(payload.openingBalance) > 0)) {
        try { await syncOpeningBill(savedId, payload); }
        catch (err) { toast(err.message || String(err), "err"); }
      }
      if (navigator.onLine) {
        window.S4Offline?.syncNow?.().catch((err) => console.warn("[S4 Sync] vendor sync failed", err));
      }
    } catch (e) {
      toast(e.message || String(e), "err");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!canDelete || !selectedId) return;
    try {
      const [bills, payments] = await Promise.all([offlineList("purchaseInvoices"), offlineList("purchasePayments")]);
      const used = [...(bills.records || []), ...(payments.records || [])]
        .some((r) => r.data?.shopId === shopId && r.data?.vendorId === selectedId && r.data?.status !== "cancelled");
      if (used) {
        window.alert(L(
          "এই ভেন্ডরের ক্রয় বিল বা পেমেন্ট আছে, তাই মোছা যাবে না — লেজার ঠিক রাখতে Status 'নিষ্ক্রিয়' বা 'ব্লক' করে দিন।",
          "This vendor has purchase bills or payments, so it cannot be deleted — set its Status to Inactive or Blocked to keep the ledger correct."
        ));
        return;
      }
    } catch (err) {
      console.warn("[S4 Vendor] usage check failed", err);
    }
    if (!window.confirm(t.vm_confirmDelete)) return;
    try {
      await offlineRemove("vendors", selectedId);
      toast(t.vm_deleted, "err");
      logAudit({ shopId, user, action: "delete", collection: "vendors", docId: selectedId, docNo: form.vendorName });
      loadVendor(null);
      if (isMobile) setMobileTab("list");
      if (navigator.onLine) {
        window.S4Offline?.syncNow?.().catch((err) => console.warn("[S4 Sync] vendor delete sync failed", err));
      }
    } catch (e) {
      toast(e.message || String(e), "err");
    }
  };

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && dirty) { e.preventDefault(); save(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const row = (label, key, opts = {}) => (
    <div className="pm-form-row">
      <label className="pm-label">{label}{opts.required && <span className="vm-req"> *</span>}</label>
      {opts.multiline
        ? <textarea className="pm-input" value={form[key]} onChange={(e) => upd(key, e.target.value)} />
        : <input className="pm-input" value={form[key]} inputMode={opts.inputMode} placeholder={opts.placeholder || ""}
            readOnly={opts.readOnly} tabIndex={opts.readOnly ? -1 : undefined}
            style={{ ...(opts.mono ? { fontFamily: "Consolas, monospace" } : {}), ...(opts.readOnly ? { background: "#eef1f6", cursor: "not-allowed" } : {}) }}
            onChange={opts.readOnly ? undefined : (e) => upd(key, e.target.value)} />}
    </div>
  );

  const panel = (title, children) => (
    <fieldset className="pm-panel">
      <legend className="pm-panel-legend">{title}</legend>
      <div className="vm-body">{children}</div>
    </fieldset>
  );

  const statusLabel = (st) => STATUS[st]?.[bn ? "bn" : "en"] || st;

  return (
    <div ref={rootRef} className="vm-root" style={fitHeight ? { height: fitHeight } : undefined}>
      <style>{PM_CSS}</style>
      <style>{VM_CSS}</style>

      <div className="pm-reference-title">
        <strong>VENDOR MASTER</strong>
        <span>
          {kpi.total} {L("ভেন্ডর", "vendors")} · {kpi.active} {L("সক্রিয়", "active")}
          {kpi.credit > 0 ? ` · ${L("মোট ক্রেডিট", "Credit")} ${cur} ${kpi.credit.toLocaleString()}` : ""}
          {!canEdit ? ` · ${L("শুধু দেখা", "View only")}` : ""}
        </span>
      </div>

      <div className="pm-quick-bar">
        <button type="button" className="pm-btn" onClick={startNew} disabled={!canEdit}>{L("নতুন", "New")}</button>
        <button type="button" className="pm-btn" onClick={save} disabled={!canEdit || saving}>{saving ? "..." : L("সেভ", "Save")}</button>
        <button type="button" className="pm-btn-secondary" onClick={close}>{L("বন্ধ", "Close")}</button>
      </div>

      {isMobile && (
        <div className="vm-mtabs" role="tablist">
          {[["list", L("তালিকা", "List")], ["details", L("বিস্তারিত", "Details")], ["more", L("ঠিকানা ও ব্যাংক", "Address & Bank")]].map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={mobileTab === key}
              className={mobileTab === key ? "is-active" : ""} onClick={() => setMobileTab(key)}>
              {label}
            </button>
          ))}
        </div>
      )}

      <div className={`vm-grid${isMobile ? ` vm-tab-${mobileTab}` : ""}`}>
        <fieldset className="pm-readonly-wrap" disabled={!canEdit}>
          <div className="vm-col vm-col-details">
            {panel(L("ভেন্ডর তথ্য", "Vendor Details"), <>
              {row(L("ভেন্ডরের নাম", "Vendor Name"), "vendorName", { required: true })}
              {row(L("ভেন্ডর কোড", "Vendor Code"), "vendorCode", { placeholder: L("সেভ করলে নিজে বসবে", "Auto on save"), readOnly: true, mono: true })}
              <div className="pm-form-row">
                <label className="pm-label">{L("ক্যাটাগরি", "Category")}</label>
                <select className="pm-input" value={form.category} onChange={(e) => upd("category", e.target.value)}>
                  <option value="">—</option>
                  {[...new Set([...(t.vm_categories || []), form.category].filter(Boolean))].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="pm-form-row">
                <label className="pm-label">{L("স্ট্যাটাস", "Status")}</label>
                <select className="pm-input" value={form.status} onChange={(e) => upd("status", e.target.value)}>
                  {Object.keys(STATUS).map((st) => <option key={st} value={st}>{statusLabel(st)}</option>)}
                </select>
              </div>
              {row(L("যোগাযোগ ব্যক্তি", "Contact Person"), "contactPerson")}
              {row(L("মোবাইল", "Mobile No."), "mobileNumber", { required: !selectedId, inputMode: "tel" })}
              {row(L("ফোন", "Phone No."), "phoneNumber", { inputMode: "tel" })}
              {row("WhatsApp", "whatsappNumber", { inputMode: "tel" })}
              {row(L("ইমেইল", "Email"), "email", { inputMode: "email" })}
              {row(L("ফ্যাক্স", "Fax"), "fax", { inputMode: "tel" })}
            </>)}
            {panel(L("ক্রেডিট ও নোট", "Credit & Notes"), <>
              {row(`${L("ক্রেডিট লিমিট", "Credit Limit")} (${cur})`, "creditLimit", { inputMode: "decimal" })}
              {row(`${L("শুরুর ব্যালেন্স", "Opening Bal.")} (${cur})`, "openingBalance", { inputMode: "decimal" })}
              {row(L("পেমেন্ট শর্ত (দিন)", "Credit Days"), "paymentTerms", { inputMode: "numeric" })}
              {row(L("নোট", "Notes"), "notes", { multiline: true })}
            </>)}
          </div>

          <div className="vm-col vm-col-more">
            {panel(L("ঠিকানা", "Address"), <>
              {row(L("ঠিকানা", "Address"), "address", { multiline: true })}
              {row(L("এমিরেট", "Emirate"), "emirate")}
              {row(L("এলাকা", "Area"), "area")}
              {row(L("শহর", "City"), "city")}
              {row(L("দেশ", "Country"), "country")}
              {row(L("ম্যাপ লিংক", "Map Link"), "mapLink", { placeholder: "https://maps.google.com/..." })}
            </>)}
            {panel(L("ট্যাক্স ও লাইসেন্স", "Tax & License"), <>
              {row("TRN", "trnNumber", { mono: true })}
              {row(L("ট্রেড লাইসেন্স", "Trade License"), "tradeLicenseNumber", { mono: true })}
              {row("TIN", "tinNumber", { mono: true })}
              {row("BIN", "binNumber", { mono: true })}
              {row("VAT No.", "vatNumber", { mono: true })}
            </>)}
            {panel(L("ব্যাংক তথ্য", "Bank Details"), <>
              {row(L("ব্যাংক", "Bank Name"), "bankName")}
              {row(L("শাখা", "Branch"), "bankBranch")}
              {row(L("অ্যাকাউন্টের নাম", "Account Name"), "accountName")}
              {row(L("অ্যাকাউন্ট নং", "Account No."), "accountNumber", { mono: true })}
              {row("IBAN", "ibanNumber", { mono: true })}
              {row("SWIFT", "swiftCode", { mono: true })}
            </>)}
          </div>
        </fieldset>

        <div className="vm-col vm-col-list">
          <div className="pm-list">
            <input className="pm-input" style={{ marginBottom: 4 }} placeholder={t.vm_searchPh}
              value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="vm-pills">
              {["ALL", "active", "inactive", "blocked"].map((st) => (
                <button key={st} type="button" className={`pm-btn-secondary${statusFilter === st ? " is-active" : ""}`}
                  onClick={() => setStatusFilter(st)}>
                  {st === "ALL" ? L("সব", "All") : statusLabel(st)}
                </button>
              ))}
            </div>
            <div className="pm-list-scroll">
              <table className="pm-table">
                <thead>
                  <tr>
                    <th>{L("ভেন্ডরের নাম", "Vendor Name")}</th>
                    <th>{L("মোবাইল", "Mobile")}</th>
                  </tr>
                </thead>
                <tbody>
                  {vendors.length === 0 && <tr><td colSpan={2} className="pm-empty">{t.vm_noVendors}</td></tr>}
                  {vendors.length > 0 && filtered.length === 0 && <tr><td colSpan={2} className="pm-empty">{t.vm_noResults}</td></tr>}
                  {filtered.map((v) => {
                    const st = v.status || "active";
                    return (
                      <tr key={v.id} className={`pm-clickable${selectedId === v.id ? " pm-selected" : ""}`} onClick={() => pick(v)}>
                        <td title={v.vendorName} style={st !== "active" ? { color: STATUS[st]?.color } : undefined}>
                          {v.vendorName}{st !== "active" ? ` (${statusLabel(st)})` : ""}
                        </td>
                        <td>{v.mobileNumber || v.phoneNumber || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="vm-actions">
        <button type="button" className="pm-btn" onClick={startNew} disabled={!canEdit}>{L("নতুন", "New")}</button>
        <button type="button" className="pm-btn pm-btn--primary" onClick={save} disabled={!canEdit || saving}>
          {saving ? "..." : L("সেভ", "Save")}{!isMobile && !saving ? " (Ctrl+S)" : ""}
        </button>
        {canDelete && (
          <button type="button" className="pm-btn pm-btn--danger" onClick={remove} disabled={!selectedId}>{L("মুছুন", "Delete")}</button>
        )}
        {canDelete && renderImport && (
          <button type="button" className="pm-btn-secondary" onClick={() => setShowImport(true)}>{L("ইমপোর্ট", "Import")}</button>
        )}
        {onGoToPurchase && (
          <button type="button" className="pm-btn-secondary"
            disabled={!selectedVendor || ["inactive", "blocked"].includes(selectedVendor.status || "active")}
            title={selectedVendor && selectedVendor.status && selectedVendor.status !== "active" ? L("নিষ্ক্রিয়/ব্লক ভেন্ডরের বিল করা যায় না", "Inactive/blocked vendors cannot be billed") : ""}
            onClick={() => onGoToPurchase(selectedVendor)}>
            {L("ক্রয় ইনভয়েস", "Purchase Invoice")}
          </button>
        )}
        <button type="button" className="pm-btn-secondary" onClick={close}>{L("বন্ধ", "Close")}</button>
        <span className="vm-info">
          {dirty && <span className="vm-dirty">{L("● সেভ হয়নি", "● Unsaved")} · </span>}
          {selectedId ? `${L("এডিট", "Editing")}: ${form.vendorName || "-"}` : L("নতুন ভেন্ডর", "New vendor")}        </span>
      </div>

      {showImport && renderImport?.(() => setShowImport(false))}
    </div>
  );
}
