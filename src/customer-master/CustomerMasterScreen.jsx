import React, { useEffect, useMemo, useRef, useState } from "react";
import { PM_CSS, PM_MOBILE_QUERY } from "../product-master/pmStyles";
import { VM_CSS } from "../vendor-master/VendorMasterScreen.jsx";
import { offlineCreate, offlineList, offlineRemove, offlineUpdate } from "../offline/offlineRepository";
import { syncOpeningBill } from "../utils/openingBill.js";
import { logAudit } from "../utils/auditLog.js";

export const EMPTY_CUSTOMER = {
  customerName:"", customerCode:"", customerType:"", status:"active",
  paymentType:"cash",
  contactPerson:"",
  mobileNumber:"", phoneNumber:"", whatsappNumber:"", fax:"", email:"",
  address:"", emirate:"", area:"", city:"", country:"", mapLink:"",
  trnNumber:"", tradeLicenseNumber:"", tinNumber:"", binNumber:"", vatNumber:"",
  bankName:"", bankBranch:"", accountName:"", accountNumber:"", ibanNumber:"", swiftCode:"",
  creditLimit:"", openingBalance:"", paymentTerms:"",
  discountPerc:"", assignedSalesman:"",
  notes:"",
};

const NUMBER_FIELDS = ["creditLimit", "openingBalance", "paymentTerms", "discountPerc"];

const STATUS = {
  active:   { bn:"সক্রিয়",    en:"Active",   color:"#166534" },
  inactive: { bn:"নিষ্ক্রিয়", en:"Inactive", color:"#92400e" },
  blocked:  { bn:"ব্লক",      en:"Blocked",  color:"#b91c1c" },
};

const PAY = {
  cash:   { bn:"নগদ",    en:"Cash" },
  credit: { bn:"ক্রেডিট", en:"Credit" },
};

const BASE_CUSTOMER_TYPES = ["Customer", "Wholesale", "Retail"];

const toForm = (c) => Object.fromEntries(Object.keys(EMPTY_CUSTOMER).map((k) => {
  const raw = c?.[k];
  if (NUMBER_FIELDS.includes(k)) return [k, Number(raw) ? String(raw) : ""];
  return [k, raw == null ? "" : String(raw)];
}).concat([["status", c?.status || "active"], ["paymentType", c?.paymentType || "cash"]]));

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

// Product selling rates are keyed by these names, so a customer's type should come from the same list.
function masterCustomerTypes(shopId) {
  try {
    const rows = JSON.parse(localStorage.getItem(`s4-product-master-customer-types-${shopId || "default"}`) || "[]");
    return Array.isArray(rows) ? rows.map((r) => String(r?.name || "").trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export default function CustomerMasterScreen({
  t, lang, shopId, user, customers, team = [], toast, cur = "AED",
  canEdit = false, canDelete = false, canSales = false, actorName = "", leaveGuard, onClose, onGoToSales, renderImport, nextCode,
  focusPartyId = null, onFocusPartyHandled, onPartySaved, onPartyRemoved,
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
  const [payFilter, setPayFilter] = useState("ALL");
  const [saving, setSaving] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const rootRef = useRef(null);
  const seenSelected = useRef(false);
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
    "কাস্টমারের পরিবর্তন সেভ করা হয়নি। পরিবর্তন বাদ দেবেন?",
    "Customer changes are not saved. Discard them?"
  ));

  useEffect(() => {
    if (!leaveGuard) return undefined;
    if (!dirty && !(isMobile && mobileTab !== "list")) return undefined;
    const guard = {
      leave: () => confirmDiscard(),
      back: () => {
        if (!(isMobile && mobileTab !== "list")) return !confirmDiscard();
        if (confirmDiscard()) { loadCustomer(null); setMobileTab("list"); }
        return true;
      },
    };
    leaveGuard.current = guard;
    return () => { if (leaveGuard.current === guard) leaveGuard.current = null; };
  });

  const loadCustomer = (c) => {
    const next = toForm(c);
    setForm(next);
    setBaseline(JSON.stringify(next));
    setSelectedId(c?.id || null);
    seenSelected.current = !!c;
  };

  useEffect(() => {
    if (!focusPartyId) return;
    const c = customers.find((x) => x.id === focusPartyId);
    if (c) {
      loadCustomer(c);
      if (isMobile) setMobileTab("details");
    }
    onFocusPartyHandled?.();
  }, [focusPartyId, customers, isMobile, onFocusPartyHandled]);

  // The list keeps the open customer in sync when another device edits or deletes it.
  const selectedCustomer = selectedId ? customers.find((c) => c.id === selectedId) : null;
  useEffect(() => {
    if (!selectedId || dirty) return;
    if (!selectedCustomer) { if (seenSelected.current) loadCustomer(null); return; }
    seenSelected.current = true;
    const next = toForm(selectedCustomer);
    if (JSON.stringify(next) !== baseline) { setForm(next); setBaseline(JSON.stringify(next)); }
  }, [selectedCustomer]); // eslint-disable-line react-hooks/exhaustive-deps

  const typeOptions = useMemo(() => {
    const master = masterCustomerTypes(shopId);
    return [...new Set([
      ...(master.length ? master : BASE_CUSTOMER_TYPES),
      ...customers.map((c) => String(c.customerType || "").trim()),
      form.customerType,
    ].filter(Boolean))];
  }, [shopId, customers, form.customerType]);

  const salesmen = useMemo(() => {
    const names = (team || []).map((m) => String(m.personName || m.name || m.email || "").trim()).filter(Boolean);
    return [...new Set([...names, form.assignedSalesman].filter(Boolean))];
  }, [team, form.assignedSalesman]);

  const filtered = useMemo(() => {
    const q = search.trim();
    const qk = searchKey(q);
    return customers
      .filter((c) => statusFilter === "ALL" || (c.status || "active") === statusFilter)
      .filter((c) => payFilter === "ALL" || (c.paymentType || "cash") === payFilter)
      .filter((c) => {
        if (!q) return true;
        const hay = [c.customerName, c.customerCode, c.mobileNumber, c.phoneNumber, c.whatsappNumber, c.trnNumber,
          c.city, c.area, c.contactPerson, c.email].filter(Boolean).join(" ");
        return searchKey(hay).includes(qk) || hay.toLowerCase().includes(q.toLowerCase());
      })
      .sort((a, b) => String(a.customerName || "").localeCompare(String(b.customerName || "")));
  }, [customers, search, statusFilter, payFilter]);

  const kpi = useMemo(() => ({
    total: customers.length,
    active: customers.filter((c) => (c.status || "active") === "active").length,
    credit: customers.filter((c) => c.paymentType === "credit").length,
  }), [customers]);

  const pick = (c) => {
    if (c.id === selectedId) { if (isMobile) setMobileTab("details"); return; }
    if (!confirmDiscard()) return;
    loadCustomer(c);
    if (isMobile) setMobileTab("details");
  };

  const startNew = () => {
    if (!canEdit || !confirmDiscard()) return;
    loadCustomer(null);
    if (isMobile) setMobileTab("details");
  };

  const close = () => {
    if (!leaveGuard && !confirmDiscard()) return;
    onClose?.();
  };

  // The opening balance lives as one credit sales bill per customer, so the ledger shows it and receipts can settle it.
  const syncOpening = async (customerId, saved) => {
    if (!canSales) {
      if (num(saved.openingBalance) > 0) toast(L("Opening balance লেজারে নিতে 'বিক্রয় ম্যানেজ' permission লাগবে", "Putting the opening balance in the ledger needs the Manage Sales permission"), "err");
      return;
    }
    await syncOpeningBill({ kind: "customers", partyId: customerId, party: saved, shopId, uid: user.uid, actorName, bn });
  };

  const save = async () => {
    if (!canEdit || saving) return;
    const name = form.customerName.trim();
    if (!name) { toast(t.cm_errName, "err"); if (isMobile) setMobileTab("details"); return; }
    if (!selectedId && !form.mobileNumber.trim()) { toast(t.cm_errMobile, "err"); if (isMobile) setMobileTab("details"); return; }
    const disc = num(form.discountPerc);
    if (disc < 0 || disc > 100) { toast(L("ছাড় ০ থেকে ১০০% এর মধ্যে দিন", "Discount must be between 0 and 100%"), "err"); return; }
    const sameName = customers.find((c) => c.id !== selectedId && String(c.customerName || "").trim().toLowerCase() === name.toLowerCase());
    if (sameName && !window.confirm(L(
      `"${sameName.customerName}" নামে আরেকজন কাস্টমার আছে। তবুও সেভ করবেন?`,
      `Another customer is already named "${sameName.customerName}". Save anyway?`
    ))) return;

    const now = new Date().toISOString();
    const payload = { shopId, updatedBy: user.uid, updatedAt: now };
    Object.keys(EMPTY_CUSTOMER).forEach((k) => {
      payload[k] = NUMBER_FIELDS.includes(k) ? num(form[k]) : String(form[k] || "").trim();
    });
    payload.customerName = name;
    payload.status = form.status || "active";
    payload.paymentType = form.paymentType || "cash";

    const openingChanged = num(form.openingBalance) !== num(JSON.parse(baseline).openingBalance);

    setSaving(true);
    try {
      let savedId = selectedId;
      if (selectedId) {
        await offlineUpdate("customers", selectedId, payload);
        toast(t.cm_updated);
      } else {
        if (nextCode) payload.customerCode = await nextCode();
        const result = await offlineCreate("customers", { ...payload, createdBy: user.uid, createdAt: now });
        savedId = result.documentId;
        toast(t.cm_saved);
      }
      const saved = toForm(payload);
      setForm(saved);
      setBaseline(JSON.stringify(saved));
      setSelectedId(savedId);
      onPartySaved?.({ id: savedId, ...payload });
      if (openingChanged || (selectedId === null && num(payload.openingBalance) > 0)) {
        try { await syncOpening(savedId, payload); }
        catch (err) { toast(err.message || String(err), "err"); }
      }
      if (navigator.onLine) {
        window.S4Offline?.syncNow?.().catch((err) => console.warn("[S4 Sync] customer sync failed", err));
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
      const [bills, receipts] = await Promise.all([offlineList("salesInvoices"), offlineList("salesReceipts")]);
      const used = [...(bills.records || []), ...(receipts.records || [])]
        .some((r) => r.data?.shopId === shopId && r.data?.customerId === selectedId && r.data?.status !== "cancelled");
      if (used) {
        window.alert(L(
          "এই কাস্টমারের বিক্রয় বিল বা রিসিট আছে, তাই মোছা যাবে না — লেজার ঠিক রাখতে Status 'নিষ্ক্রিয়' বা 'ব্লক' করে দিন।",
          "This customer has sales bills or receipts, so it cannot be deleted — set its Status to Inactive or Blocked to keep the ledger correct."
        ));
        return;
      }
    } catch (err) {
      console.warn("[S4 Customer] usage check failed", err);
    }
    if (!window.confirm(t.cm_confirmDelete)) return;
    try {
      await offlineRemove("customers", selectedId);
      toast(t.cm_deleted, "err");
      logAudit({ shopId, user, action: "delete", collection: "customers", docId: selectedId, docNo: form.customerName });
      onPartyRemoved?.(selectedId);
      loadCustomer(null);
      if (isMobile) setMobileTab("list");
      if (navigator.onLine) {
        window.S4Offline?.syncNow?.().catch((err) => console.warn("[S4 Sync] customer delete sync failed", err));
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

  const select = (label, key, options) => (
    <div className="pm-form-row">
      <label className="pm-label">{label}</label>
      <select className="pm-input" value={form[key]} onChange={(e) => upd(key, e.target.value)}>
        {options.map(([value, text]) => <option key={value || "-"} value={value}>{text}</option>)}
      </select>
    </div>
  );

  const panel = (title, children) => (
    <fieldset className="pm-panel">
      <legend className="pm-panel-legend">{title}</legend>
      <div className="vm-body">{children}</div>
    </fieldset>
  );

  const statusLabel = (st) => STATUS[st]?.[bn ? "bn" : "en"] || st;
  const payLabel = (p) => PAY[p]?.[bn ? "bn" : "en"] || p;
  const blockedForSale = !selectedCustomer || ["inactive", "blocked"].includes(selectedCustomer.status || "active");

  return (
    <div ref={rootRef} className="vm-root" style={fitHeight ? { height: fitHeight } : undefined}>
      <style>{PM_CSS}</style>
      <style>{VM_CSS}</style>

      <div className="pm-reference-title">
        <strong>CUSTOMER MASTER</strong>
        <span>
          {kpi.total} {L("কাস্টমার", "customers")} · {kpi.active} {L("সক্রিয়", "active")} · {kpi.credit} {L("ক্রেডিট", "credit")}
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
            {panel(L("কাস্টমার তথ্য", "Customer Details"), <>
              {row(L("কাস্টমারের নাম", "Customer Name"), "customerName", { required: true })}
              {row(L("কাস্টমার কোড", "Customer Code"), "customerCode", { placeholder: L("সেভ করলে নিজে বসবে", "Auto on save"), readOnly: true, mono: true })}
              {select(L("কাস্টমার ধরন", "Customer Type"), "customerType", [["", "—"], ...typeOptions.map((c) => [c, c])])}
              {select(L("স্ট্যাটাস", "Status"), "status", Object.keys(STATUS).map((st) => [st, statusLabel(st)]))}
              {row(L("যোগাযোগ ব্যক্তি", "Contact Person"), "contactPerson")}
              {row(L("মোবাইল", "Mobile No."), "mobileNumber", { required: !selectedId, inputMode: "tel" })}
              {row(L("ফোন", "Phone No."), "phoneNumber", { inputMode: "tel" })}
              {row("WhatsApp", "whatsappNumber", { inputMode: "tel" })}
              {row(L("ইমেইল", "Email"), "email", { inputMode: "email" })}
              {row(L("ফ্যাক্স", "Fax"), "fax", { inputMode: "tel" })}
            </>)}
            {panel(L("বিক্রয় ও ক্রেডিট", "Sales & Credit"), <>
              {select(L("পেমেন্ট ধরন", "Payment Type"), "paymentType", Object.keys(PAY).map((p) => [p, payLabel(p)]))}
              {row(`${L("ক্রেডিট লিমিট", "Credit Limit")} (${cur})`, "creditLimit", { inputMode: "decimal" })}
              {row(`${L("শুরুর ব্যালেন্স", "Opening Bal.")} (${cur})`, "openingBalance", { inputMode: "decimal" })}
              {row(L("পেমেন্ট শর্ত (দিন)", "Credit Days"), "paymentTerms", { inputMode: "numeric" })}
              {row(L("ডিফল্ট ছাড় (%)", "Discount %"), "discountPerc", { inputMode: "decimal" })}
              {select(L("সেলসম্যান", "Salesman"), "assignedSalesman", [["", "—"], ...salesmen.map((n) => [n, n])])}
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
            <input className="pm-input" style={{ marginBottom: 4 }} placeholder={t.cm_searchPh}
              value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="vm-pills">
              {["ALL", "active", "inactive", "blocked"].map((st) => (
                <button key={st} type="button" className={`pm-btn-secondary${statusFilter === st ? " is-active" : ""}`}
                  onClick={() => setStatusFilter(st)}>
                  {st === "ALL" ? L("সব", "All") : statusLabel(st)}
                </button>
              ))}
            </div>
            <div className="vm-pills">
              {["ALL", "cash", "credit"].map((p) => (
                <button key={p} type="button" className={`pm-btn-secondary${payFilter === p ? " is-active" : ""}`}
                  onClick={() => setPayFilter(p)}>
                  {p === "ALL" ? L("সব পেমেন্ট", "All pay") : payLabel(p)}
                </button>
              ))}
            </div>
            <div className="pm-list-scroll">
              <table className="pm-table">
                <thead>
                  <tr>
                    <th>{L("কাস্টমারের নাম", "Customer Name")}</th>
                    <th>{L("মোবাইল", "Mobile")}</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.length === 0 && <tr><td colSpan={2} className="pm-empty">{t.cm_noCustomers}</td></tr>}
                  {customers.length > 0 && filtered.length === 0 && <tr><td colSpan={2} className="pm-empty">{t.cm_noResults}</td></tr>}
                  {filtered.map((c) => {
                    const st = c.status || "active";
                    return (
                      <tr key={c.id} className={`pm-clickable${selectedId === c.id ? " pm-selected" : ""}`} onClick={() => pick(c)}>
                        <td title={c.customerName} style={st !== "active" ? { color: STATUS[st]?.color } : undefined}>
                          {c.customerName}{st !== "active" ? ` (${statusLabel(st)})` : ""}
                        </td>
                        <td>{c.mobileNumber || c.phoneNumber || "-"}</td>
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
        {onGoToSales && (
          <button type="button" className="pm-btn-secondary" disabled={blockedForSale || dirty}
            title={selectedCustomer && blockedForSale ? L("নিষ্ক্রিয়/ব্লক কাস্টমারকে বিক্রি করা যায় না", "Inactive/blocked customers cannot be billed") : ""}
            onClick={() => onGoToSales(selectedCustomer)}>
            {L("বিক্রয় ইনভয়েস", "Sales Invoice")}
          </button>
        )}
        <button type="button" className="pm-btn-secondary" onClick={close}>{L("বন্ধ", "Close")}</button>
        <span className="vm-info">
          {dirty && <span className="vm-dirty">{L("● সেভ হয়নি", "● Unsaved")} · </span>}
          {selectedId ? `${L("এডিট", "Editing")}: ${form.customerName || "-"}` : L("নতুন কাস্টমার", "New customer")}
        </span>
      </div>

      {showImport && renderImport?.(() => setShowImport(false))}
    </div>
  );
}
