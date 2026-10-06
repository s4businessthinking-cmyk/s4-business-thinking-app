import React, { useEffect, useMemo, useRef, useState } from "react";
import { C, inp, lbl, btn, th, td, Modal, GridTable, todayIso, fmtDate, fmtDateLong, textMatch } from "../sales-invoice/SalesInvoiceDesktopForm.jsx";
import { useEscapeKey, useWindowState, WindowButtons, MinimizedChip } from "../components/WindowChrome.jsx";

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
              <div key={p.key} onMouseDown={(e) => { e.preventDefault(); pick(p); }} onMouseEnter={() => setActive(i)}
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

// Old-ERP style "Payments against Invoices" (suppliers) / "Receipts against Bill" (customers) window.
export default function AgainstInvoiceVoucherWindow({
  lang = "en", mode = "payment", cur = "AED", voucherNo = "",
  parties = [], salesmen = [], banks = [], getOpenInvoices, vouchers = [], prefill = null,
  saving = false, onSave, onCancelVoucher, onDeleteVoucher, onSetChequeStatus, onPrint, onClose, initialViewId = null,
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
  const [refNo, setRefNo] = useState("");
  const [refBank, setRefBank] = useState("");
  const [refDate, setRefDate] = useState(todayIso);
  const [note, setNote] = useState("");
  const [printDetails, setPrintDetails] = useState(false);
  const [viewingId, setViewingId] = useState(initialViewId);
  const [viewSnapshot, setViewSnapshot] = useState(null);
  const [showFind, setShowFind] = useState(false);
  const win = useWindowState({ maximized: true });
  useEscapeKey(() => onClose?.(), { enabled: !win.min && !showFind, level: 2 });
  const partyRef = useRef(null);
  const invRef = useRef(null);
  const amtRef = useRef(null);

  const viewing = viewingId ? (vouchers.find((v) => v.id === viewingId) || viewSnapshot) : null;

  useEffect(() => {
    if (initialViewId) return;
    if (!prefill) { setTimeout(() => partyRef.current?.focus(), 80); return; }
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
  const total = rows.reduce((a, r) => a + n2(r.amount), 0);

  const resetNew = () => {
    setViewingId(null); setViewSnapshot(null);
    setDate(todayIso()); setParty(null); setCollector(""); setRows([]); setSelInvId(""); setCurAmt("");
    setMethod("cash"); setChequeNo(""); setChequeDate(todayIso()); setChequeBank(""); setNote("");
    setChequeReceivedBy(""); setVendorReceiptNo("");
    setRefNo(""); setRefBank(""); setRefDate(todayIso());
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
    if (!selInv) { invRef.current?.focus(); return; }
    const amt = n2(curAmt);
    if (amt <= 0) { alert(bn ? "টাকার পরিমাণ লিখুন" : "Enter an amount"); return; }
    if (amt > n2(selInv.balanceDue) + 0.01) { alert(bn ? `বাকি ${f2(selInv.balanceDue)}-এর বেশি দেওয়া যাবে না` : `Cannot exceed the balance ${f2(selInv.balanceDue)}`); return; }
    setRows((prev) => [...prev, { invoiceId: selInv.id, invoiceNo: selInv.invoiceNo, supplierInvoiceNo: selInv.supplierInvoiceNo || "", invoiceDate: selInv.invoiceDate || "", invoiceAmount: n2(selInv.grandTotal), amount: amt }]);
    setSelInvId(""); setCurAmt("");
    setTimeout(() => invRef.current?.focus(), 30);
  };

  const hasRef = method === "bank_transfer" || method === "card";

  const save = async () => {
    if (!party) { alert(bn ? `${partyLabel} বাছাই করুন` : `Select a ${partyLabel.toLowerCase()}`); return; }
    if (!rows.length) { alert(bn ? `অন্তত একটা ${docLabel} যোগ করুন` : `Add at least one ${docLabel.toLowerCase()}`); return; }
    if (method === "cheque" && !chequeNo.trim()) { alert(bn ? "চেক নম্বর লিখুন" : "Enter the cheque number"); return; }
    const sm = salesmen.find((m) => m.id === collector);
    const created = await onSave({
      partyId: party.id || null, partyName: party.name, partyMobile: party.mobile || "",
      date, method, note: note.trim(),
      chequeNo: method === "cheque" ? chequeNo.trim() : "", chequeBank: method === "cheque" ? chequeBank : "", chequeDate: method === "cheque" ? chequeDate : "",
      refNo: hasRef ? refNo.trim() : "", refBank: hasRef ? refBank : "", refDate: hasRef ? refDate : "",
      ...(isReceipt ? {} : { chequeReceivedBy: method === "cheque" ? chequeReceivedBy.trim() : "", vendorReceiptNo: vendorReceiptNo.trim() }),
      collectedById: isReceipt ? (collector || "") : "", collectedByName: isReceipt ? (sm?.name || "") : "",
      allocations: rows.map((r) => ({ invoiceId: r.invoiceId, invoiceNo: r.invoiceNo, ...(isReceipt ? {} : { supplierInvoiceNo: r.supplierInvoiceNo || "" }), invoiceDate: r.invoiceDate, amount: parseFloat(f2(r.amount)) })),
    });
    if (!created) return;
    if (printDetails) onPrint?.(created);
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
      <div style={{ ...lbl, color: "#64748b", fontWeight: 600 }}>{label}</div>
      <input style={inp({ background: "#f4f7fc", textAlign: extra.right ? "right" : "left" })} readOnly value={value} />
    </div>
  );

  const winTitle = isReceipt ? "RECEIPTS AGAINST BILL" : "PAYMENTS AGAINST INVOICES";
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
              <input type="date" disabled={ro} style={inp({ border: "none", height: 26, fontWeight: 700 })} value={ro ? viewing.date : date} onChange={(e) => setDate(e.target.value)} />
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

          {/* Entry row */}
          {!ro && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 6, alignItems: "end" }}>
              <div>
                <div style={lbl}>{isReceipt ? `${docLabel} No` : "Vendor Inv No"}</div>
                <select ref={invRef} style={inp()} value={selInvId} disabled={!party}
                  onChange={(e) => pickInvoice(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && selInvId) { e.preventDefault(); amtRef.current?.focus(); amtRef.current?.select(); } }}>
                  <option value="">{party ? (choosable.length ? "" : "—") : ""}</option>
                  {choosable.map((i) => <option key={i.id} value={i.id}>{!isReceipt && i.supplierInvoiceNo ? `${i.supplierInvoiceNo}  (${i.invoiceNo})` : i.invoiceNo}</option>)}
                </select>
              </div>
              {box(`${docLabel} Date`, selInv ? fmtDate(selInv.invoiceDate) : "")}
              {box(`${docLabel} Amount`, selInv ? f2(selInv.grandTotal) : "", { right: true })}
              {box(isReceipt ? "Previous Receipts" : "Previous Payments", selInv ? f2(selInv.amountPaid) : "", { right: true })}
              {box("Balance", selInv ? f2(selInv.balanceDue) : "", { right: true })}
              <div>
                <div style={lbl}>{isReceipt ? "Current Receipt" : "Current Payment"}</div>
                <input ref={amtRef} style={inp({ textAlign: "right", fontWeight: 800 })} inputMode="decimal" value={curAmt} disabled={!selInv}
                  onChange={(e) => setCurAmt(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRow(); } }} />
              </div>
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#dbe6f5", border: `1px solid ${C.border}`, padding: "3px 10px" }}>
            <span style={{ fontWeight: 900, letterSpacing: 3, flex: 1, textAlign: "center" }}>TOTAL</span>
            <span style={{ fontWeight: 900, fontSize: 15, minWidth: 120, textAlign: "right", color: cancelled ? "#9ca3af" : C.label, textDecoration: cancelled ? "line-through" : "none" }}>{cur} {f2(shownTotal)}</span>
          </div>

          {/* Mode + cheque */}
          <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 10 }}>
            <fieldset style={{ border: `1px solid ${C.border}`, borderRadius: 3, margin: 0, padding: "2px 10px 6px" }}>
              <legend style={{ ...lbl, padding: "0 4px" }}>Mode of {isReceipt ? "Receipt" : "Payment"}</legend>
              {METHODS.map(([m, label]) => (
                <label key={m} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, marginTop: 2, cursor: ro ? "default" : "pointer" }}>
                  <input type="radio" disabled={ro} checked={shownMethod === m} onChange={() => setMethod(m)} />
                  {label}
                </label>
              ))}
            </fieldset>
            {shownMethod === "bank_transfer" || shownMethod === "card" ? (
              <fieldset style={{ border: `1px solid ${C.border}`, borderRadius: 3, margin: 0, padding: "4px 10px 8px" }}>
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
            <fieldset style={{ border: `1px solid ${C.border}`, borderRadius: 3, margin: 0, padding: "4px 10px 8px", opacity: shownMethod === "cheque" ? 1 : 0.55 }}>
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
          </div>

          {!isReceipt && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ ...lbl, width: 88 }}>Vendor Rcpt No</span>
              <input style={inp(ro ? { background: "#f4f7fc" } : {})} readOnly={ro} placeholder={bn ? "ভেন্ডরের রিসিট নম্বর (ঐচ্ছিক)" : "Receipt number given by the vendor (optional)"} value={ro ? (viewing.vendorReceiptNo || "") : vendorReceiptNo} onChange={(e) => setVendorReceiptNo(e.target.value)} />
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ ...lbl, width: 88 }}>Narration</span>
            <input style={inp(ro ? { background: "#f4f7fc" } : {})} readOnly={ro} value={ro ? (viewing.note || "") : note} onChange={(e) => setNote(e.target.value)} />
          </div>

          {/* Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {!ro ? (
              <label style={{ ...lbl, display: "flex", alignItems: "center", gap: 6, cursor: "pointer", marginRight: "auto" }}>
                <input type="checkbox" checked={printDetails} onChange={(e) => setPrintDetails(e.target.checked)} />
                Print {docLabel} Details in {isReceipt ? "Receipt " : ""}Voucher
              </label>
            ) : (
              <div style={{ display: "flex", gap: 6, marginRight: "auto", flexWrap: "wrap" }}>
                <button type="button" onClick={() => onPrint?.(viewing)} style={btn()}>🖨️ Print</button>
                {!cancelled && viewing.method === "cheque" && viewing.chequeStatus === "pending" && onSetChequeStatus && (
                  <>
                    <button type="button" onClick={async () => { const u = await onSetChequeStatus(viewing, "cleared"); if (u) setViewSnapshot(u); }} style={btn("#dcfce7", C.green)}>✅ Cleared</button>
                    <button type="button" onClick={async () => { const u = await onSetChequeStatus(viewing, "bounced"); if (u) setViewSnapshot(u); }} style={btn("#fee2e2", C.red)}>❌ Bounced</button>
                  </>
                )}
                {!cancelled && onCancelVoucher && (
                  <button type="button" onClick={async () => { const u = await onCancelVoucher(viewing); if (u) setViewSnapshot(u); }} style={btn("#fee2e2", C.red)}>⛔ {bn ? "ভাউচার বাতিল" : "Cancel Voucher"}</button>
                )}
                {cancelled && onDeleteVoucher && (
                  <button type="button" onClick={async () => { if (await onDeleteVoucher(viewing)) resetNew(); }} style={btn("#7f1d1d", "#fff")}>🗑️ {bn ? "ভাউচার মুছুন" : "Delete Voucher"}</button>
                )}
              </div>
            )}
            <button type="button" onClick={resetNew} disabled={saving} style={btn("#e7eef9", C.label, { width: 80 })}><u>N</u>ew</button>
            {!ro && <button type="button" onClick={save} disabled={saving} style={btn("#15803d", "#fff", { width: 80 })}>{saving ? "…" : <><u>S</u>ave</>}</button>}
            <button type="button" onClick={() => setShowFind(true)} style={btn("#e7eef9", C.label, { width: 80 })}><u>F</u>ind</button>
            <button type="button" onClick={onClose} style={btn("#e7eef9", C.label, { width: 80 })}><u>C</u>lose</button>
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
  const [crit, setCrit] = useState({ no: "", party: "", amount: "" });
  const rows = useMemo(() => vouchers.filter((v) => {
    const d = String(v.date || "").slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return textMatch(v.no, crit.no, true) && textMatch(v.partyName, crit.party, true) && textMatch(f2(v.totalAmount), crit.amount, true);
  }), [vouchers, from, to, crit]);
  const columns = [
    { key: "no", label: "Voucher No", width: 100, bold: true, render: (v) => v.no },
    { key: "date", label: "Date", width: 100, render: (v) => fmtDateLong(v.date) },
    { key: "party", label: isReceipt ? "Customer" : "Vendor", width: 260, render: (v) => v.partyName || "—" },
    { key: "mode", label: "Mode", width: 100, render: (v) => METHOD_LABEL[v.method] || "Cash" },
    { key: "amt", label: "Amount", width: 110, align: "right", render: (v) => f2(v.totalAmount), color: (v) => (v.status === "cancelled" ? "#9ca3af" : undefined) },
  ];
  const box = (label, key) => (
    <label style={{ display: "grid", gap: 2 }}>
      <span style={lbl}>{label}</span>
      <input style={inp()} value={crit[key]} onChange={(e) => setCrit((p) => ({ ...p, [key]: e.target.value }))} />
    </label>
  );
  return (
    <Modal title={isReceipt ? "Find Receipt" : "Find Payment"} onClose={onClose} width={760}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={lbl}>From</span>
        <input type="date" style={inp({ width: 140 })} value={from} onChange={(e) => setFrom(e.target.value)} />
        <span style={{ ...lbl, marginLeft: 8 }}>To</span>
        <input type="date" style={inp({ width: 140 })} value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 6, marginBottom: 8 }}>
        {box("Voucher No", "no")}
        {box(isReceipt ? "Customer" : "Vendor", "party")}
        {box("Amount", "amount")}
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
