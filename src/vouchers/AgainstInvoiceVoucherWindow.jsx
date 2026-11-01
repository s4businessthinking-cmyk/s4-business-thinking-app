import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { C, inp, lbl, btn, th, td, Modal, GridTable, todayIso, fmtDate, fmtDateLong, textMatch } from "../sales-invoice/SalesInvoiceDesktopForm.jsx";
import { useEscapeKey, useWindowState, WindowButtons, MinimizedChip } from "../components/WindowChrome.jsx";
import { dropdownMouseDown, shouldPreserveTextSelection } from "../utils/dropdownSelectionGuard.js";

const METHODS = [["cash", "Cash"], ["cheque", "Cheque"], ["bank_transfer", "Bank Transfer"], ["card", "Card"]];
const METHOD_LABEL = Object.fromEntries(METHODS);
const CARD_TYPES = ["Visa", "Mastercard", "American Express", "Debit Card", "Other"];
const n2 = (v) => parseFloat(v) || 0;
const f2 = (n) => (Math.round((parseFloat(n) || 0) * 100) / 100).toFixed(2);

export function PartySelect({ parties, value, onPick, disabled, inputRef, placeholder, onEnter }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return parties.filter((p) => !s || `${p.name} ${p.sub || ""}`.toLowerCase().includes(s)).slice(0, 80);
  }, [parties, q]);
  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => {
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);
  const pick = (p) => { setOpen(false); setQ(""); onPick(p); };
  return (
    <div ref={wrapRef} style={{ position: "relative", flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex" }}>
        <input ref={inputRef} disabled={disabled} style={inp({ fontWeight: 700 })} placeholder={placeholder}
          value={open ? q : (value?.name || "")} autoComplete="off"
          onFocus={() => { setQ(""); setOpen(true); }}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, list.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); if (open && list[active]) pick(list[active]); else onEnter?.(); }
            else if (e.key === "Escape") setOpen(false);
          }} />
        <button type="button" disabled={disabled} tabIndex={-1} onClick={() => { setOpen((o) => !o); inputRef?.current?.focus(); }}
          style={btn("#e7eef9", C.label, { height: 26, padding: "0 6px", fontSize: 11 })}>▼</button>
      </div>
      {open && !disabled && (
        <div style={{ position: "absolute", top: "calc(100% + 1px)", left: 0, right: 0, zIndex: 30, background: "#fff", border: `1px solid ${C.border}`, boxShadow: "0 10px 24px rgba(0,0,0,0.25)", maxHeight: 240, overflowY: "auto" }}>
          {list.length === 0
            ? <div style={{ padding: "6px 10px", fontSize: 12, color: "#4b5f86" }}>—</div>
            : list.map((p, i) => (
              <div key={p.key}
                onMouseDown={(e) => dropdownMouseDown(e, inputRef, () => setActive(i))}
                onClick={() => { if (!shouldPreserveTextSelection(inputRef)) pick(p); }}
                onMouseEnter={() => { if (!shouldPreserveTextSelection(inputRef)) setActive(i); }}
                style={{ padding: "4px 10px", cursor: "pointer", background: i === active ? "#1f5fbf" : "#fff", color: i === active ? "#fff" : "#111", fontSize: 12.5, fontWeight: 700, display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                {p.pending > 0 && <span style={{ opacity: 0.75, fontWeight: 600, flexShrink: 0 }}>{f2(p.pending)}</span>}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// Type-to-search invoice picker: matches any part of the bill / vendor invoice number, the date or an amount,
// shows date and balance per bill; arrows + Enter pick, like PartySelect.
export function InvoiceSelect({ invoices, value, onPick, disabled, inputRef, onEnter, labelOf }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return invoices.filter((i) => !s || [labelOf(i), i.invoiceNo, i.supplierInvoiceNo, fmtDate(i.invoiceDate), i.invoiceDate, f2(i.grandTotal), f2(i.balanceDue)]
      .some((v) => String(v || "").toLowerCase().includes(s))).slice(0, 200);
  }, [invoices, q, labelOf]);
  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => {
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);
  const pick = (i) => { setOpen(false); setQ(""); onPick(i.id); };
  return (
    <div ref={wrapRef} style={{ position: "relative", minWidth: 0 }}>
      <div style={{ display: "flex" }}>
        <input ref={inputRef} disabled={disabled} style={inp({ fontWeight: 700 })} placeholder={disabled ? "" : "🔍"}
          value={open ? q : (value ? labelOf(value) : "")} autoComplete="off"
          onFocus={() => { setQ(""); setOpen(true); }}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, list.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); if (open && list[active]) pick(list[active]); else onEnter?.(); }
            else if (e.key === "Escape") setOpen(false);
          }} />
        <button type="button" disabled={disabled} tabIndex={-1} onClick={() => { setOpen((o) => !o); inputRef?.current?.focus(); }}
          style={btn("#e7eef9", C.label, { height: 26, padding: "0 6px", fontSize: 11 })}>▼</button>
      </div>
      {open && !disabled && (
        <div style={{ position: "absolute", top: "calc(100% + 1px)", left: 0, minWidth: 300, zIndex: 30, background: "#fff", border: `1px solid ${C.border}`, boxShadow: "0 10px 24px rgba(0,0,0,0.25)", maxHeight: 260, overflowY: "auto" }}>
          {list.length === 0
            ? <div style={{ padding: "6px 10px", fontSize: 12, color: "#4b5f86" }}>—</div>
            : list.map((inv, i) => (
              <div key={inv.id}
                onMouseDown={(e) => dropdownMouseDown(e, inputRef, () => setActive(i))}
                onClick={() => { if (!shouldPreserveTextSelection(inputRef)) pick(inv); }}
                onMouseEnter={() => { if (!shouldPreserveTextSelection(inputRef)) setActive(i); }}
                style={{ padding: "4px 10px", cursor: "pointer", background: i === active ? "#1f5fbf" : "#fff", color: i === active ? "#fff" : "#111", fontSize: 12.5, display: "grid", gridTemplateColumns: "1fr auto auto", gap: 12, alignItems: "center" }}>
                <span style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{labelOf(inv)}</span>
                <span style={{ opacity: 0.75 }}>{fmtDate(inv.invoiceDate)}</span>
                <span style={{ fontWeight: 700, minWidth: 70, textAlign: "right" }}>{f2(inv.balanceDue)}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// Old-ERP style "Payments against Invoices" (suppliers) / "Receipts against Bill" (customers) window.
export default function AgainstInvoiceVoucherWindow({
  lang = "en", mode = "payment", cur = "AED", voucherNo = "", title = null,
  parties = [], salesmen = [], banks = [], getOpenInvoices, vouchers = [], prefill = null,
  saving = false, onSave, onCancelVoucher, onDeleteVoucher, onSetChequeStatus, onPrint, onClose, initialViewId = null,
  onPrintCheque, onPrintChequeVoucher, onHandover,
}) {
  const bn = lang === "bn";
  const isReceipt = mode === "receipt";
  const partyLabel = isReceipt ? "Customer" : "Vendor";
  const docLabel = isReceipt ? "Bill" : "Invoice";

  const [date, setDate] = useState(todayIso);
  const [party, setParty] = useState(null);
  const [collector, setCollector] = useState("");
  const [rows, setRows] = useState([]);
  const [selInvId, setSelInvId] = useState("");
  const [curAmt, setCurAmt] = useState("");
  const [method, setMethod] = useState("cash");
  const [chequeNo, setChequeNo] = useState("");
  const [chequeDate, setChequeDate] = useState(todayIso);
  const [chequeBank, setChequeBank] = useState("");
  const [chequeReceivedBy, setChequeReceivedBy] = useState("");
  const [vendorReceiptNo, setVendorReceiptNo] = useState("");
  const [chequeMonth, setChequeMonth] = useState("");
  const [refNo, setRefNo] = useState("");
  const [refBank, setRefBank] = useState("");
  const [refDate, setRefDate] = useState(todayIso);
  const [note, setNote] = useState("");
  const [discount, setDiscount] = useState("");
  const [printDetails, setPrintDetails] = useState(false);
  const [summaryPrint, setSummaryPrint] = useState(false);
  const [viewingId, setViewingId] = useState(initialViewId);
  const [viewSnapshot, setViewSnapshot] = useState(null);
  const [showFind, setShowFind] = useState(false);
  const win = useWindowState({ maximized: true });
  useEscapeKey(() => onClose?.(), { enabled: !win.min && !showFind, level: 2 });
  const partyRef = useRef(null);
  const invRef = useRef(null);
  const amtRef = useRef(null);
  // On a phone, refocusing a text field after every row pops the keyboard and yanks the
  // viewport back to that field — exactly where the user doesn't want to be mid-review.
  // Keep the auto-refocus only on wide (desktop) screens, where it speeds up keyboard entry.
  const [narrow, setNarrow] = useState(() => (typeof window !== "undefined" ? window.innerWidth < 768 : false));
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const viewing = viewingId ? (vouchers.find((v) => v.id === viewingId) || viewSnapshot) : null;

  // Refills the new-entry form from a cancelled voucher's full data (party, method, cheque/ref
  // details, note and every allocation row) — used for both the initial `prefill` prop and the
  // "Cancel & Edit" action on a voucher already being viewed.
  const applyVoucherSnapshot = (snap) => {
    const partyId = snap.raw?.vendorId || snap.raw?.customerId || snap.partyId || null;
    const p = parties.find((x) => (partyId && x.id === partyId) || (!partyId && x.name === snap.partyName))
      || { key: `n:${snap.partyName}`, id: partyId, name: snap.partyName, mobile: snap.raw?.vendorMobile || snap.raw?.customerMobile || "" };
    setParty(p);
    setRows((snap.allocations || []).map((a) => ({ invoiceId: a.invoiceId, invoiceNo: a.invoiceNo, supplierInvoiceNo: a.supplierInvoiceNo || "", invoiceDate: a.invoiceDate || "", invoiceAmount: n2(a.invoiceAmount), amount: n2(a.amount) })));
    setDate(snap.date || todayIso());
    setMethod(snap.method || "cash");
    setChequeNo(snap.chequeNo || ""); setChequeDate(snap.chequeDate || todayIso()); setChequeBank(snap.chequeBank || "");
    setChequeReceivedBy(snap.chequeReceivedBy || ""); setVendorReceiptNo(snap.vendorReceiptNo || ""); setChequeMonth(snap.chequeMonth || "");
    setRefNo(snap.refNo || ""); setRefBank(snap.refBank || ""); setRefDate(snap.refDate || todayIso());
    setNote(snap.note || "");
    setDiscount(n2(snap.discountAmount) > 0 ? f2(snap.discountAmount) : "");
    setSelInvId(""); setCurAmt("");
  };

  useEffect(() => {
    if (initialViewId) return;
    if (!prefill) { setTimeout(() => partyRef.current?.focus(), 80); return; }
    if (prefill.allocations) { applyVoucherSnapshot(prefill); return; }
    const p = parties.find((x) => (prefill.partyId && x.id === prefill.partyId) || (!prefill.partyId && x.name === prefill.partyName))
      || (prefill.partyName ? { key: `n:${prefill.partyName}`, id: prefill.partyId || null, name: prefill.partyName } : null);
    if (p) setParty(p);
    if (prefill.invoiceId) {
      const inv = p ? (getOpenInvoices(p) || []).find((i) => i.id === prefill.invoiceId) : null;
      if (inv) { setSelInvId(inv.id); setCurAmt(f2(inv.balanceDue)); setTimeout(() => { amtRef.current?.focus(); amtRef.current?.select(); }, 120); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openInvoices = useMemo(() => (party ? getOpenInvoices(party) || [] : []), [party, getOpenInvoices]);
  const pendingTotal = openInvoices.reduce((a, i) => a + n2(i.balanceDue), 0);
  const choosable = openInvoices.filter((i) => !rows.some((r) => r.invoiceId === i.id));
  const selInv = openInvoices.find((i) => i.id === selInvId) || null;
  const invoiceLabel = useCallback((i) => (!isReceipt && i.supplierInvoiceNo ? `${i.supplierInvoiceNo}  (${i.invoiceNo})` : i.invoiceNo), [isReceipt]);
  const total = rows.reduce((a, r) => a + n2(r.amount), 0);

  const resetNew = () => {
    setViewingId(null); setViewSnapshot(null);
    setDate(todayIso()); setParty(null); setCollector(""); setRows([]); setSelInvId(""); setCurAmt("");
    setMethod("cash"); setChequeNo(""); setChequeDate(todayIso()); setChequeBank(""); setNote("");
    setChequeReceivedBy(""); setVendorReceiptNo(""); setChequeMonth("");
    setRefNo(""); setRefBank(""); setRefDate(todayIso());
    setDiscount(""); setSummaryPrint(false);
    setTimeout(() => partyRef.current?.focus(), 60);
  };

  const pickParty = (p) => {
    setParty(p); setRows([]); setSelInvId(""); setCurAmt("");
    setTimeout(() => invRef.current?.focus(), 60);
  };

  const pickInvoice = (id) => {
    setSelInvId(id);
    const inv = openInvoices.find((i) => i.id === id);
    setCurAmt(inv ? f2(inv.balanceDue) : "");
    if (inv) setTimeout(() => { amtRef.current?.focus(); amtRef.current?.select(); }, 30);
  };

  const addRow = () => {
    if (!selInv) { if (!narrow) invRef.current?.focus(); return; }
    const amt = n2(curAmt);
    if (amt <= 0) { alert(bn ? "টাকার পরিমাণ লিখুন" : "Enter an amount"); return; }
    if (amt > n2(selInv.balanceDue) + 0.01) { alert(bn ? `বাকি ${f2(selInv.balanceDue)}-এর বেশি দেওয়া যাবে না` : `Cannot exceed the balance ${f2(selInv.balanceDue)}`); return; }
    setRows((prev) => [...prev, { invoiceId: selInv.id, invoiceNo: selInv.invoiceNo, supplierInvoiceNo: selInv.supplierInvoiceNo || "", invoiceDate: selInv.invoiceDate || "", invoiceAmount: n2(selInv.grandTotal), amount: amt }]);
    setSelInvId(""); setCurAmt("");
    if (!narrow) setTimeout(() => invRef.current?.focus(), 30);
  };

  const hasRef = method === "bank_transfer" || method === "card";

  const save = async () => {
    if (!party) { alert(bn ? `${partyLabel} বাছাই করুন` : `Select a ${partyLabel.toLowerCase()}`); return; }
    if (!rows.length) { alert(bn ? `অন্তত একটা ${docLabel} যোগ করুন` : `Add at least one ${docLabel.toLowerCase()}`); return; }
    if (method === "cheque" && !chequeNo.trim()) { alert(bn ? "চেক নম্বর লিখুন" : "Enter the cheque number"); return; }
    if (n2(discount) > total + 0.001) { alert(bn ? "ছাড় মোট টাকার চেয়ে বেশি হতে পারবে না" : "Discount cannot exceed the total"); return; }
    const sm = salesmen.find((m) => m.id === collector);
    const created = await onSave({
      partyId: party.id || null, partyName: party.name, partyMobile: party.mobile || "",
      date, method, note: note.trim(),
      chequeNo: method === "cheque" ? chequeNo.trim() : "", chequeBank: method === "cheque" ? chequeBank : "", chequeDate: method === "cheque" ? chequeDate : "",
      refNo: hasRef ? refNo.trim() : "", refBank: hasRef ? refBank : "", refDate: hasRef ? refDate : "",
      ...(n2(discount) > 0 ? { discountAmount: n2(discount) } : {}),
      ...(isReceipt ? {} : { chequeReceivedBy: method === "cheque" ? chequeReceivedBy.trim() : "", vendorReceiptNo: vendorReceiptNo.trim(), chequeMonth }),
      collectedById: isReceipt ? (collector || "") : "", collectedByName: isReceipt ? (sm?.name || "") : "",
      allocations: rows.map((r) => ({ invoiceId: r.invoiceId, invoiceNo: r.invoiceNo, ...(isReceipt ? {} : { supplierInvoiceNo: r.supplierInvoiceNo || "" }), invoiceDate: r.invoiceDate, amount: parseFloat(f2(r.amount)) })),
    });
    if (!created) return;
    if (printDetails) onPrint?.(created, { summaryOnly: summaryPrint });
    resetNew();
  };

  const openVoucher = (v) => { setShowFind(false); setViewSnapshot(v); setViewingId(v.id); };

  const ro = !!viewing;
  const shownParty = ro ? { name: viewing.partyName } : party;
  const shownRows = ro ? (viewing.allocations || []).map((a) => ({ ...a, invoiceAmount: a.invoiceAmount })) : rows;
  const shownTotal = ro ? n2(viewing.totalAmount) : total;
  const shownMethod = ro ? viewing.method : method;
  const cancelled = ro && viewing.status === "cancelled";

  const box = (label, value, extra = {}) => (
    <div>
      <div style={{ ...lbl, fontSize: 10.5, color: "#64748b", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
      <input style={inp({ background: "#f4f7fc", fontWeight: 700, borderBottomWidth: 2, borderBottomColor: "#8aa3c7", textAlign: extra.right ? "right" : "left" })} readOnly value={value} />
    </div>
  );

  const winTitle = title || (isReceipt ? "RECEIPTS AGAINST BILL" : "PAYMENTS AGAINST INVOICES");
  return (
    <>
    {win.min && <MinimizedChip title={winTitle} onRestore={win.restore} onClose={onClose} lang={lang} slot={1} />}
    <div data-si-modal-open="" style={{ position: "fixed", inset: 0, zIndex: 1600, background: "rgba(10,25,55,0.35)", display: win.min ? "none" : "flex", alignItems: "center", justifyContent: "center", padding: win.max ? 0 : 8, boxSizing: "border-box" }}>
      <div style={{ width: "100%", maxWidth: win.max ? "none" : 720, height: win.max ? "100%" : undefined, maxHeight: "100%", overflow: "hidden", display: "flex", flexDirection: "column", background: C.bg, border: `1px solid ${C.bar}`, borderRadius: win.max ? 0 : 4, boxShadow: "0 18px 40px rgba(0,0,0,0.35)", fontFamily: "Segoe UI, Tahoma, sans-serif", color: C.label }}>
        <div onDoubleClick={win.toggleMax} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, background: C.bar, color: "#fff", padding: "5px 6px 5px 10px", fontWeight: 800, fontSize: 13, userSelect: "none" }}>
          <span>{winTitle}</span>
          <WindowButtons win={win} onClose={onClose} lang={lang} />
        </div>

        <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 6, flex: 1, minHeight: 0, overflowY: "auto" }}>
          {/* Header */}
          <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 140px", gap: 8, alignItems: "stretch" }}>
            <div style={{ border: `1px solid ${C.bar}`, borderRadius: 4, overflow: "hidden", background: "#fff", textAlign: "center" }}>
              <div style={{ background: C.head, color: "#fff", fontSize: 12, fontWeight: 800, padding: "1px 0" }}>Voucher No.</div>
              <div style={{ fontSize: 15, fontWeight: 900, padding: "3px 0", color: "#111" }}>{ro ? viewing.no : voucherNo}</div>
            </div>
            <div style={{ border: `1px solid ${C.bar}`, borderRadius: 4, background: "#dfe8f6", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <span style={{ fontSize: 20, fontWeight: 900, letterSpacing: 6, color: "#111" }}>{isReceipt ? "RECEIPTS" : "PAYMENTS"}</span>
              {cancelled && <span style={{ fontSize: 11, fontWeight: 800, padding: "1px 8px", borderRadius: 10, background: C.red, color: "#fff" }}>CANCELLED</span>}
              {ro && !cancelled && viewing.method === "cheque" && viewing.chequeStatus && (
                <span style={{ fontSize: 11, fontWeight: 800, padding: "1px 8px", borderRadius: 10, background: viewing.chequeStatus === "cleared" ? C.green : viewing.chequeStatus === "bounced" ? C.red : "#b45309", color: "#fff", textTransform: "uppercase" }}>{viewing.chequeStatus}</span>
              )}
            </div>
            <div style={{ border: `1px solid ${C.bar}`, borderRadius: 4, overflow: "hidden", background: "#fff" }}>
              <div style={{ background: C.head, color: "#fff", textAlign: "center", fontSize: 12, fontWeight: 800, padding: "1px 0" }}>Date</div>
              <input type="date" disabled={ro} style={inp({ borderStyle: "none", height: 26, fontWeight: 700 })} value={ro ? viewing.date : date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          {/* Party */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ ...lbl, width: 88 }}>{partyLabel}</span>
            <PartySelect parties={parties} value={shownParty} onPick={pickParty} disabled={ro} inputRef={partyRef}
              placeholder={bn ? `${partyLabel} খুঁজুন` : `Search ${partyLabel.toLowerCase()}`}
              onEnter={() => invRef.current?.focus()} />
          </div>
          {isReceipt && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ ...lbl, width: 88 }}>Collected by</span>
              {ro
                ? <input style={inp({ background: "#f4f7fc" })} readOnly value={viewing.collectedByName || "—"} />
                : (
                  <select style={inp()} value={collector} onChange={(e) => setCollector(e.target.value)}>
                    <option value="">—</option>
                    {salesmen.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                )}
            </div>
          )}
          {!ro && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div style={{ border: `1px solid ${C.border}`, background: "#eef3fb", color: "#8b1a1a", fontWeight: 800, fontSize: 12.5, textAlign: "center", padding: "3px 6px" }}>
                Balance :{f2(pendingTotal)} ({openInvoices.length} {docLabel}s Pending)
              </div>
              <div style={{ border: `1px solid ${C.border}`, background: "#eef3fb", color: "#8b1a1a", fontWeight: 800, fontSize: 12.5, textAlign: "center", padding: "3px 6px" }}>
                Current Ledger Balance:{f2(pendingTotal)} {isReceipt ? "Dr" : "Cr"}
              </div>
            </div>
          )}

          {/* Entry row — explicit widths sized to each field's real content on desktop; on a
              narrow phone that doesn't fit, wrap to a 2-column grid instead of overflowing sideways. */}
          {!ro && (
            <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr 1fr 1fr" : "minmax(160px,1.5fr) 96px 104px 104px 96px 120px", gap: 6, alignItems: "end" }}>
              <div style={narrow ? { gridColumn: "1 / -1" } : undefined}>
                <div style={lbl}>{isReceipt ? `${docLabel} No` : "Vendor Inv No"}</div>
                <InvoiceSelect invoices={choosable} value={selInv} disabled={!party} inputRef={invRef} onPick={pickInvoice}
                  labelOf={invoiceLabel}
                  onEnter={() => { if (selInvId) { amtRef.current?.focus(); amtRef.current?.select(); } }} />
              </div>
              {box(`${docLabel} Date`, selInv ? fmtDate(selInv.invoiceDate) : "")}
              {box(`${docLabel} Amt`, selInv ? f2(selInv.grandTotal) : "", { right: true })}
              {box(isReceipt ? "Prev Rcpts" : "Prev Paid", selInv ? f2(selInv.amountPaid) : "", { right: true })}
              {box("Balance", selInv ? f2(selInv.balanceDue) : "", { right: true })}
              <div>
                <div style={lbl}>{isReceipt ? "Current Receipt" : "Current Payment"}</div>
                <input ref={amtRef} style={inp({ textAlign: "right", fontWeight: 800 })} inputMode="decimal" value={curAmt} disabled={!selInv}
                  onChange={(e) => setCurAmt(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRow(); } }} />
              </div>
              {narrow && (
                <button type="button" onClick={addRow} disabled={!selInv} style={{ alignSelf: "stretch", minHeight: 34, border: `1px solid ${C.border}`, borderRadius: 6, background: selInv ? "#2563eb" : "#e2e8f0", color: selInv ? "#fff" : "#94a3b8", fontWeight: 800, fontSize: 13 }}>
                  + {bn ? "যোগ" : "Add"}
                </button>
              )}
            </div>
          )}

          {/* Grid */}
          <div style={{ border: `1px solid ${C.border}`, background: "#fff", flex: "1 1 210px", minHeight: 84, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: "center", width: 36 }}>#</th>
                  <th style={{ ...th, textAlign: "left" }}>{isReceipt ? `${docLabel} No` : "Vendor Inv No"}</th>
                  {!isReceipt && <th style={{ ...th, textAlign: "left" }}>Our Ref No</th>}
                  <th style={{ ...th, textAlign: "left" }}>{docLabel} Date</th>
                  <th style={th}>{isReceipt ? "Received Amt" : "Paid Amt"}</th>
                  {!ro && <th style={{ ...th, width: 30 }} />}
                </tr>
              </thead>
              <tbody>
                {shownRows.length === 0 && (
                  <tr><td colSpan={6} style={{ ...td, textAlign: "center", color: "#64748b", padding: 20 }}>
                    {party || ro ? (bn ? `${docLabel} No বেছে টাকা লিখে Enter দিন` : `Pick a ${docLabel.toLowerCase()} no, type the amount and press Enter`) : (bn ? `আগে ${partyLabel} বাছাই করুন` : `Select a ${partyLabel.toLowerCase()} first`)}
                  </td></tr>
                )}
                {shownRows.map((r, i) => (
                  <tr key={`${r.invoiceId}-${i}`} style={{ background: i % 2 ? C.rowAlt : "#fff" }}>
                    <td style={{ ...td, textAlign: "center" }}>{i + 1}</td>
                    <td style={{ ...td, textAlign: "left", fontWeight: 700 }}>{isReceipt ? r.invoiceNo : (r.supplierInvoiceNo || "—")}</td>
                    {!isReceipt && <td style={{ ...td, textAlign: "left", color: "#64748b" }}>{r.invoiceNo}</td>}
                    <td style={{ ...td, textAlign: "left" }}>{fmtDate(r.invoiceDate)}</td>
                    <td style={{ ...td, fontWeight: 800 }}>{f2(r.amount)}</td>
                    {!ro && (
                      <td style={{ ...td, textAlign: "center" }}>
                        <button type="button" onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                          style={{ background: "none", border: "none", color: C.red, fontWeight: 900, cursor: "pointer", fontSize: 14 }}>×</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(ro ? n2(viewing?.discountAmount) > 0 : true) && (
            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
              <span style={{ ...lbl, color: "#64748b", fontWeight: 600 }}>Discount</span>
              <input style={inp({ width: 110, flex: "0 0 110px", textAlign: "right", ...(ro ? { background: "#f4f7fc" } : {}) })} readOnly={ro} disabled={ro}
                inputMode="decimal" placeholder="0.00"
                value={ro ? f2(viewing.discountAmount || 0) : discount}
                onChange={(e) => setDiscount(e.target.value)} />
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#dbe6f5", border: `1px solid ${C.border}`, padding: "3px 10px" }}>
            <span style={{ fontWeight: 900, letterSpacing: 3, flex: 1, textAlign: "center" }}>
              {n2(ro ? viewing?.discountAmount : discount) > 0 ? (isReceipt ? "NET RECEIVABLE" : "NET PAYABLE") : "TOTAL"}
            </span>
            <span style={{ fontWeight: 900, fontSize: 15, minWidth: 120, textAlign: "right", color: cancelled ? "#9ca3af" : C.label, textDecoration: cancelled ? "line-through" : "none" }}>
              {cur} {f2(shownTotal - n2(ro ? viewing?.discountAmount : discount))}
            </span>
          </div>

          {/* Meta fields laid out as thin boxes side by side, left to right, wrapping only when the
              window is too narrow — instead of one stretched full-width row per field. */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-start", width: "100%" }}>
          {/* Mode + cheque */}
          <fieldset style={{ flex: narrow ? "1 1 100%" : "0 0 148px", border: `1px solid ${C.border}`, borderRadius: 3, margin: 0, padding: "2px 10px 6px" }}>
              <legend style={{ ...lbl, padding: "0 4px" }}>Mode of {isReceipt ? "Receipt" : "Payment"}</legend>
              <div style={narrow ? { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 10px" } : undefined}>
                {METHODS.map(([m, label]) => (
                  <label key={m} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, marginTop: 2, cursor: ro ? "default" : "pointer" }}>
                    <input type="radio" disabled={ro} checked={shownMethod === m} onChange={() => setMethod(m)} />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            {shownMethod === "bank_transfer" || shownMethod === "card" ? (
              <fieldset style={{ flex: "0 0 320px", border: `1px solid ${C.border}`, borderRadius: 3, margin: 0, padding: "4px 10px 8px" }}>
                <legend style={{ ...lbl, padding: "0 4px" }}>{shownMethod === "card" ? "Card Details" : "Transfer Details"}</legend>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 8 }}>
                  <div>
                    <div style={lbl}>{shownMethod === "card" ? "Approval / Ref No" : "Reference / Txn No"}</div>
                    <input style={inp(ro ? { background: "#f4f7fc" } : {})} readOnly={ro} value={ro ? (viewing.refNo || "") : refNo} onChange={(e) => setRefNo(e.target.value)} />
                  </div>
                  <div>
                    <div style={lbl}>{shownMethod === "card" ? "Swipe Date" : "Transfer Date"}</div>
                    <input type="date" style={inp()} disabled={ro} value={ro ? (viewing.refDate || "") : refDate} onChange={(e) => setRefDate(e.target.value)} />
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                  <span style={{ ...lbl, width: 100 }}>{shownMethod === "card" ? "Card Type" : (isReceipt ? "Received In" : "Paid From")}</span>
                  {ro
                    ? <input style={inp({ background: "#f4f7fc" })} readOnly value={viewing.refBank || ""} />
                    : (
                      <select style={inp()} value={refBank} onChange={(e) => setRefBank(e.target.value)}>
                        <option value="">—</option>
                        {(shownMethod === "card" ? CARD_TYPES : banks).map((b) => <option key={b} value={b}>{b}</option>)}
                      </select>
                    )}
                </div>
              </fieldset>
            ) : (
            <fieldset style={{ flex: "0 0 320px", border: `1px solid ${C.border}`, borderRadius: 3, margin: 0, padding: "4px 10px 8px", opacity: shownMethod === "cheque" ? 1 : 0.55 }}>
              <legend style={{ ...lbl, padding: "0 4px" }}>Cheque Details</legend>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 8 }}>
                <div>
                  <div style={lbl}>Cheque No</div>
                  <input style={inp()} disabled={ro || shownMethod !== "cheque"} value={ro ? (viewing.chequeNo || "") : chequeNo} onChange={(e) => setChequeNo(e.target.value)} />
                </div>
                <div>
                  <div style={lbl}>Dated</div>
                  <input type="date" style={inp()} disabled={ro || shownMethod !== "cheque"} value={ro ? (viewing.chequeDate || "") : chequeDate} onChange={(e) => setChequeDate(e.target.value)} />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <span style={{ ...lbl, width: 100 }}>{isReceipt ? "Collection Bank" : "Bank Name"}</span>
                {ro
                  ? <input style={inp({ background: "#f4f7fc" })} readOnly value={viewing.chequeBank || ""} />
                  : (
                    <select style={inp()} disabled={shownMethod !== "cheque"} value={chequeBank} onChange={(e) => setChequeBank(e.target.value)}>
                      <option value="">—</option>
                      {banks.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  )}
              </div>
              {!isReceipt && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                  <span style={{ ...lbl, width: 100 }}>Received By</span>
                  <input style={inp(ro ? { background: "#f4f7fc" } : {})} readOnly={ro} disabled={!ro && shownMethod !== "cheque"} placeholder={bn ? "চেক গ্রহণকারীর নাম (ঐচ্ছিক)" : "Who took the cheque (optional)"} value={ro ? (viewing.chequeReceivedBy || "") : chequeReceivedBy} onChange={(e) => setChequeReceivedBy(e.target.value)} />
                </div>
              )}
            </fieldset>
            )}

          {ro && !isReceipt && shownMethod === "cheque" && (viewing.raw?.chequePrintedAt || viewing.raw?.handover?.receiverName) && (
            <div style={{ fontSize: 11.5, color: "#4b5f86", display: "flex", flexDirection: "column", gap: 2 }}>
              {viewing.raw?.chequePrintedAt && <span>✅ Cheque printed: {String(viewing.raw.chequePrintedAt).slice(0, 10)}{viewing.raw.chequePrintCount > 1 ? ` (×${viewing.raw.chequePrintCount})` : ""}</span>}
              {viewing.raw?.handover?.receiverName && <span>🪪 Handed over to: {viewing.raw.handover.receiverName}{viewing.raw.handover.receivedAt ? ` · ${viewing.raw.handover.receivedAt}` : ""}</span>}
            </div>
          )}

          {!isReceipt && (
            <div style={{ flex: "0 0 180px" }}>
              <div style={{ ...lbl, fontSize: 10.5, color: "#64748b", fontWeight: 600 }}>Vendor Rcpt No</div>
              <input style={inp(ro ? { background: "#f4f7fc" } : {})} readOnly={ro} placeholder={bn ? "ভেন্ডরের রিসিট নম্বর" : "Receipt no (optional)"} value={ro ? (viewing.vendorReceiptNo || "") : vendorReceiptNo} onChange={(e) => setVendorReceiptNo(e.target.value)} />
            </div>
          )}
          {!isReceipt && (
            <div style={{ flex: "0 0 130px" }}>
              <div style={{ ...lbl, fontSize: 10.5, color: "#64748b", fontWeight: 600, whiteSpace: "nowrap" }}>{bn ? "কোন মাসের" : "For Month"}</div>
              <input type="month" style={inp(ro ? { background: "#f4f7fc" } : {})} readOnly={ro} value={ro ? (viewing.chequeMonth || "") : chequeMonth} onChange={(e) => setChequeMonth(e.target.value)} />
            </div>
          )}

          <div style={{ flex: "1 1 220px" }}>
            <div style={{ ...lbl, fontSize: 10.5, color: "#64748b", fontWeight: 600 }}>Narration</div>
            <input style={inp(ro ? { background: "#f4f7fc" } : {})} readOnly={ro} value={ro ? (viewing.note || "") : note} onChange={(e) => setNote(e.target.value)} />
          </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", flexDirection: narrow ? "column" : "row", alignItems: narrow ? "stretch" : "center", gap: 6, flexWrap: narrow ? "nowrap" : "wrap" }}>
            {!ro ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 2, marginRight: narrow ? 0 : "auto", order: narrow ? 2 : 0 }}>
                <label style={{ ...lbl, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input type="checkbox" checked={printDetails} onChange={(e) => setPrintDetails(e.target.checked)} />
                  Print {isReceipt ? "Receipt " : ""}Voucher After Saving
                </label>
                {printDetails && (
                  <label style={{ ...lbl, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                    <input type="checkbox" checked={summaryPrint} onChange={(e) => setSummaryPrint(e.target.checked)} />
                    Summary only (hide {docLabel.toLowerCase()} list — for many {docLabel.toLowerCase()}s)
                  </label>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", gap: 6, marginRight: narrow ? 0 : "auto", flexWrap: "wrap", order: narrow ? 2 : 0 }}>
                {onPrint && <button type="button" onClick={() => onPrint(viewing)} style={btn()}>🖨️ Print</button>}
                {onPrint && <button type="button" onClick={() => onPrint(viewing, { summaryOnly: true })} style={btn()}>🖨️ Print (Summary)</button>}
                {!cancelled && viewing.method === "cheque" && onPrintCheque && (
                  <button type="button" onClick={() => onPrintCheque(viewing)} style={btn()}>🖨️ Print Cheque</button>
                )}
                {!cancelled && viewing.method === "cheque" && onPrintChequeVoucher && (
                  <button type="button" onClick={() => onPrintChequeVoucher(viewing)} style={btn()}>📄 Cheque Payment Voucher</button>
                )}
                {!cancelled && viewing.method === "cheque" && onHandover && (
                  <button type="button" onClick={() => onHandover(viewing)} style={btn("#dcfce7", C.green)}>🪪 {viewing.raw?.handover ? "View Handover" : "Handover Document"}</button>
                )}
                {!cancelled && viewing.method === "cheque" && viewing.chequeStatus === "pending" && onSetChequeStatus && (
                  <>
                    <button type="button" onClick={async () => { const u = await onSetChequeStatus(viewing, "cleared"); if (u) setViewSnapshot(u); }} style={btn("#dcfce7", C.green)}>✅ Cleared</button>
                    <button type="button" onClick={async () => { const u = await onSetChequeStatus(viewing, "bounced"); if (u) setViewSnapshot(u); }} style={btn("#fee2e2", C.red)}>❌ Bounced</button>
                  </>
                )}
                {!cancelled && onCancelVoucher && (
                  <button type="button" onClick={async () => { const u = await onCancelVoucher(viewing); if (u) setViewSnapshot(u); }} style={btn("#fee2e2", C.red)}>⛔ {bn ? "ভাউচার বাতিল" : "Cancel Voucher"}</button>
                )}
                {!cancelled && onCancelVoucher && (
                  <button type="button" onClick={async () => {
                    const snap = viewing;
                    const u = await onCancelVoucher(snap);
                    if (!u) return;
                    // The old voucher is now cancelled (allocations reversed, audit logged); refill the
                    // new-entry form with its data so the user corrects and re-saves instead of retyping.
                    applyVoucherSnapshot(snap);
                    setViewingId(null); setViewSnapshot(null);
                  }} style={btn("#fef3c7", "#92400e")}>✏️ {bn ? "বাতিল করে এডিট করুন" : "Cancel & Edit"}</button>
                )}
                {cancelled && onDeleteVoucher && (
                  <button type="button" onClick={async () => { if (await onDeleteVoucher(viewing)) resetNew(); }} style={btn("#7f1d1d", "#fff")}>🗑️ {bn ? "ভাউচার মুছুন" : "Delete Voucher"}</button>
                )}
              </div>
            )}
            <div style={{ display: "flex", gap: 6, order: narrow ? 1 : 0 }}>
              <button type="button" onClick={resetNew} disabled={saving} style={btn("#e7eef9", C.label, { width: 80, flex: narrow ? 1 : undefined })}><u>N</u>ew</button>
              {!ro && <button type="button" onClick={save} disabled={saving} style={btn("#15803d", "#fff", { width: 80, flex: narrow ? 1 : undefined })}>{saving ? "…" : <><u>S</u>ave</>}</button>}
              <button type="button" onClick={() => setShowFind(true)} style={btn("#e7eef9", C.label, { width: 80, flex: narrow ? 1 : undefined })}><u>F</u>ind</button>
              <button type="button" onClick={onClose} style={btn("#e7eef9", C.label, { width: 80, flex: narrow ? 1 : undefined })}><u>C</u>lose</button>
            </div>
          </div>
        </div>
      </div>

      {showFind && <VoucherFindModal vouchers={vouchers} isReceipt={isReceipt} lang={lang} onClose={() => setShowFind(false)} onPick={openVoucher} />}
    </div>
    </>
  );
}

function VoucherFindModal({ vouchers, isReceipt, lang, onClose, onPick }) {
  const bn = lang === "bn";
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [crit, setCrit] = useState({ no: "", party: "", amount: "", cheque: "", rcpt: "" });
  const rows = useMemo(() => vouchers.filter((v) => {
    const d = String(v.date || "").slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return textMatch(v.no, crit.no, true) && textMatch(v.partyName, crit.party, true) && textMatch(f2(v.totalAmount), crit.amount, true)
      && textMatch(v.chequeNo, crit.cheque, true) && textMatch(v.vendorReceiptNo || v.refNo, crit.rcpt, true);
  }), [vouchers, from, to, crit]);
  const findStatus = (v) => {
    if (v.status === "cancelled") return { text: bn ? "বাতিল" : "Cancelled", color: "#b91c1c" };
    if (v.method === "cheque") {
      const map = { pending: bn ? "পেন্ডিং" : "Pending", cleared: bn ? "ক্লিয়ার্ড" : "Cleared", bounced: bn ? "বাউন্স" : "Bounced" };
      return { text: map[v.chequeStatus] || map.pending, color: v.chequeStatus === "cleared" ? "#166534" : v.chequeStatus === "bounced" ? "#b91c1c" : "#c2410c" };
    }
    return { text: METHOD_LABEL[v.method] || (bn ? "নগদ" : "Cash"), color: "#166534" };
  };
  const columns = [
    { key: "no", label: "Voucher No", width: 100, bold: true, render: (v) => v.no },
    { key: "date", label: "Date", width: 92, render: (v) => fmtDateLong(v.date) },
    { key: "party", label: isReceipt ? "Customer" : "Vendor", width: 200, render: (v) => v.partyName || "—" },
    { key: "mode", label: "Mode", width: 88, render: (v) => METHOD_LABEL[v.method] || "Cash" },
    { key: "cheque", label: "Cheque No", width: 90, render: (v) => v.chequeNo || "—" },
    { key: "rcpt", label: isReceipt ? "Ref No" : "Vendor Rcpt", width: 96, render: (v) => v.vendorReceiptNo || v.refNo || "—" },
    { key: "amt", label: "Amount", width: 100, align: "right", render: (v) => f2(v.totalAmount), color: (v) => (v.status === "cancelled" ? "#9ca3af" : undefined) },
    { key: "st", label: "Status", width: 110, render: (v) => { const s = findStatus(v); return <span style={{ color: s.color, fontWeight: 700 }}>{s.text}</span>; } },
  ];
  const box = (label, key) => (
    <label style={{ display: "grid", gap: 2 }}>
      <span style={lbl}>{label}</span>
      <input style={inp()} value={crit[key]} onChange={(e) => setCrit((p) => ({ ...p, [key]: e.target.value }))} />
    </label>
  );
  return (
    <Modal title={isReceipt ? "Find Receipt" : "Find Payment"} onClose={onClose} width={980}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={lbl}>From</span>
        <input type="date" style={inp({ width: 140 })} value={from} onChange={(e) => setFrom(e.target.value)} />
        <span style={{ ...lbl, marginLeft: 8 }}>To</span>
        <input type="date" style={inp({ width: 140 })} value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr 1fr 1fr", gap: 6, marginBottom: 8 }}>
        {box("Voucher No", "no")}
        {box(isReceipt ? "Customer" : "Vendor", "party")}
        {box("Amount", "amount")}
        {box("Cheque No", "cheque")}
        {box(isReceipt ? "Ref No" : "Vendor Rcpt", "rcpt")}
      </div>
      <div style={{ border: `1px solid ${C.border}`, height: "44vh", overflow: "auto" }}>
        <GridTable columns={columns} rows={rows} rowKey={(v) => v.id} onRowDoubleClick={onPick} minRows={14}
          emptyText={bn ? "কোনো ভাউচার নেই" : "No vouchers"} />
      </div>
      <div style={{ fontSize: 11.5, color: "#4b5f86", marginTop: 6 }}>
        {rows.length} {bn ? "টি ভাউচার · খুলতে double click করুন" : "voucher(s) · double click to open"}
      </div>
    </Modal>
  );
}
