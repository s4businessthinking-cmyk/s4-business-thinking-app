// Global Ledger (Ctrl+L): every account of the shop in one window - customers, suppliers, cash & bank, sales,
// purchases, VAT, expenses, partners, journal accounts. Left: accounts with balances; right: the chosen account's
// statement, or the trial balance when none is chosen. Read-only, worked out from the saved documents.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { C, inp, lbl, btn, fmtDate } from "../sales-invoice/SalesInvoiceDesktopForm.jsx";
import { useEscapeKey, useWindowState, WindowButtons, MinimizedChip } from "../components/WindowChrome.jsx";
import { offlineList } from "../offline/offlineRepository";
import { loadInvoiceRows, rowsOf } from "../inventory/stockFromInvoices";
import { expenseCategoryLabel } from "../expenses/ExpensesTab.jsx";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { buildGlobalLedger, balances, accountStatement, GROUPS } from "./globalLedger.js";

const money = (v) => (Math.round((Number(v) || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const drCr = (v) => (Math.abs(v) < 0.005 ? "0.00" : `${money(Math.abs(v))} ${v > 0 ? "Dr" : "Cr"}`);
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const TYPE_LABEL = {
  sale: ["বিক্রয়", "Sales"], saleReceipt: ["বিলে জমা", "Paid on bill"], purchase: ["ক্রয়", "Purchase"], purchasePayment: ["বিলে পেমেন্ট", "Paid on bill"],
  opening: ["ওপেনিং", "Opening"], receipt: ["রসিদ", "Receipt"], payment: ["পেমেন্ট", "Payment"], salesReturn: ["সেলস রিটার্ন", "Sales return"],
  purchaseReturn: ["পারচেজ রিটার্ন", "Purchase return"], refundPaid: ["রিফান্ড দেওয়া", "Refund paid"], refundReceived: ["রিফান্ড পাওয়া", "Refund received"],
  expense: ["খরচ", "Expense"], journal: ["জার্নাল", "Journal"], contra: ["কন্ট্রা", "Contra"], capitalIn: ["মূলধন জমা", "Capital in"],
  capitalOut: ["মূলধন ফেরত", "Capital out"], drawing: ["ড্রয়িং", "Drawing"], payout: ["পার্টনারকে দেওয়া", "Paid to partner"],
  distribution: ["লাভ বণ্টন", "Profit share"], bank: ["ব্যাংক এন্ট্রি", "Bank entry"],
};

export default function GlobalLedgerWindow({ lang = "en", shopId = "", shopName = "", cur = "AED", customers = [], vendors = [], onClose }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const win = useWindowState({ maximized: true });
  useEscapeKey(() => onClose?.(), { enabled: !win.min, level: 2 });
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(() => localDay());
  const [search, setSearch] = useState("");
  const [hideZero, setHideZero] = useState(true);
  const [selKey, setSelKey] = useState("");
  const searchRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadInvoiceRows(), offlineList("salesReceipts"), offlineList("purchasePayments"), offlineList("expenses"),
      offlineList("accountVouchers").catch(() => []), offlineList("partnerEntries").catch(() => []), offlineList("bankReconciliations").catch(() => []),
    ]).then(([rows, rc, pm, ex, av, pe, br]) => {
      if (cancelled) return;
      setData({
        salesInvoices: rows.salesInvoices, purchaseInvoices: rows.purchaseInvoices, salesReturns: rows.extras?.salesReturns || [], purchaseReturns: rows.extras?.purchaseReturns || [],
        receipts: rowsOf(rc), payments: rowsOf(pm), expenses: rowsOf(ex), accountVouchers: rowsOf(av), partnerEntries: rowsOf(pe),
        bankEntries: rowsOf(br).filter((d) => d?.kind === "entry"),
      });
    }).catch((err) => { console.warn("[S4 Global Ledger] load failed", err); if (!cancelled) setError(String(err?.message || err)); });
    return () => { cancelled = true; };
  }, [shopId]);

  const ledger = useMemo(() => (data ? buildGlobalLedger(data, { shopId, customers, vendors, expenseLabel: (e) => expenseCategoryLabel(e, false) }) : null), [data, shopId, customers, vendors]);
  const bal = useMemo(() => (ledger ? balances(ledger.postings, to) : new Map()), [ledger, to]);

  // accounts by group, filtered by the search, zero balances hidden unless asked
  const groups = useMemo(() => {
    if (!ledger) return [];
    const q = search.trim().toLowerCase();
    return GROUPS.map((g) => ({
      ...g,
      accounts: [...ledger.accounts.values()]
        .filter((a) => a.group === g.id && (!q || a.name.toLowerCase().includes(q)) && (!hideZero || Math.abs(bal.get(a.key) || 0) >= 0.005 || a.key === selKey))
        .sort((a, b) => a.name.localeCompare(b.name)),
    })).filter((g) => g.accounts.length);
  }, [ledger, search, hideZero, bal, selKey]);
  const flat = useMemo(() => groups.flatMap((g) => g.accounts), [groups]);
  const selected = ledger?.accounts.get(selKey) || null;
  const st = useMemo(() => (ledger && selKey ? accountStatement(ledger.postings, selKey, { from, to }) : null), [ledger, selKey, from, to]);

  const trial = useMemo(() => {
    if (!ledger) return null;
    const rows = [...ledger.accounts.values()].map((a) => ({ a, v: bal.get(a.key) || 0 })).filter((r) => Math.abs(r.v) >= 0.005)
      .sort((x, y) => GROUPS.findIndex((g) => g.id === x.a.group) - GROUPS.findIndex((g) => g.id === y.a.group) || x.a.name.localeCompare(y.a.name));
    const dr = rows.reduce((t, r) => t + Math.max(0, r.v), 0), cr = rows.reduce((t, r) => t + Math.max(0, -r.v), 0);
    return { rows, dr, cr };
  }, [ledger, bal]);

  useEffect(() => { if (!win.min) setTimeout(() => searchRef.current?.focus(), 0); }, [win.min]);
  useEffect(() => { listRef.current?.querySelector("[data-sel='1']")?.scrollIntoView({ block: "nearest" }); }, [selKey]);

  const onSearchKey = (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    if (!flat.length) return;
    const i = flat.findIndex((a) => a.key === selKey);
    const next = e.key === "ArrowDown" ? (i < 0 ? 0 : Math.min(flat.length - 1, i + 1)) : (i <= 0 ? -1 : i - 1);
    setSelKey(next < 0 ? "" : flat[next].key);
  };

  const groupName = (id) => { const g = GROUPS.find((x) => x.id === id); return g ? (bn ? g.bn : g.en) : id; };
  const typeName = (t) => { const x = TYPE_LABEL[t]; return x ? (bn ? x[0] : x[1]) : t; };
  const period = `${from ? fmtDate(from) : L("শুরু", "Start")} — ${to ? fmtDate(to) : L("আজ", "Today")}`;

  const print = () => {
    if (selected && st) {
      const rows = [
        ["", "", "", L("ওপেনিং ব্যালেন্স", "Opening balance"), "", "", "", drCr(st.opening)],
        ...st.lines.map((p) => [fmtDate(p.date), typeName(p.type), p.no, p.against, p.narration, p.dr ? money(p.dr) : "", p.cr ? money(p.cr) : "", drCr(p.balance)]),
      ];
      printWithSettings(generateStatementHTML({
        shopName, title: L("লেজার", "LEDGER"), subtitle: period, partyLine: `${selected.name} (${groupName(selected.group)})`,
        cols: [{ label: "Date" }, { label: "Type" }, { label: "No" }, { label: "Particulars" }, { label: "Narration" }, { label: `Debit (${cur})`, align: "right" }, { label: `Credit (${cur})`, align: "right" }, { label: "Balance", align: "right" }],
        rows, foot: ["", "", "", L("মোট", "Total"), "", money(st.dr), money(st.cr), drCr(st.closing)],
      }), { lang });
    } else if (trial) {
      printWithSettings(generateStatementHTML({
        shopName, title: L("ট্রায়াল ব্যালেন্স", "TRIAL BALANCE"), subtitle: `${L("পর্যন্ত", "As at")} ${to ? fmtDate(to) : L("আজ", "today")}`,
        cols: [{ label: "Account" }, { label: "Group" }, { label: `Debit (${cur})`, align: "right" }, { label: `Credit (${cur})`, align: "right" }],
        rows: trial.rows.map((r) => [r.a.name, groupName(r.a.group), r.v > 0 ? money(r.v) : "", r.v < 0 ? money(-r.v) : ""]),
        foot: [L("মোট", "Total"), "", money(trial.dr), money(trial.cr)],
      }), { lang });
    }
  };

  const th = { padding: "5px 6px", background: C.head, color: "#fff", fontSize: 12, fontWeight: 700, position: "sticky", top: 0, textAlign: "left", whiteSpace: "nowrap" };
  const td = { padding: "4px 6px", borderBottom: `1px solid ${C.border}`, fontSize: 12.5, verticalAlign: "top" };
  const num = { ...td, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };
  const winTitle = `📒 ${L("গ্লোবাল লেজার", "Global Ledger")} (Ctrl+L)${selected ? ` — ${selected.name}` : ""}`;

  return (
    <>
      {win.min && <MinimizedChip title={winTitle} onRestore={win.restore} onClose={onClose} lang={lang} />}
      <div data-si-modal-open="" style={{ position: "fixed", inset: 0, zIndex: 1650, background: "rgba(10,25,55,0.35)", display: win.min ? "none" : "flex", alignItems: "center", justifyContent: "center", padding: win.max ? 0 : 8, boxSizing: "border-box" }}>
        <div style={{ width: "100%", maxWidth: win.max ? "none" : 1180, height: win.max ? "100%" : "92%", display: "flex", flexDirection: "column", background: C.bg, border: `1px solid ${C.bar}`, borderRadius: win.max ? 0 : 4, boxShadow: "0 18px 40px rgba(0,0,0,0.35)", fontFamily: "Segoe UI, Tahoma, sans-serif", color: C.label }}>
          <div onDoubleClick={win.toggleMax} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, background: C.bar, color: "#fff", padding: "5px 6px 5px 10px", fontWeight: 800, fontSize: 13, userSelect: "none" }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{winTitle}</span>
            <WindowButtons win={win} onClose={onClose} lang={lang} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>
            <span style={lbl}>From</span>
            <input type="date" style={inp({ width: 140 })} value={from} onChange={(e) => setFrom(e.target.value)} />
            <span style={lbl}>To</span>
            <input type="date" style={inp({ width: 140 })} value={to} onChange={(e) => setTo(e.target.value)} />
            {(from || to !== localDay()) && <button type="button" onClick={() => { setFrom(""); setTo(localDay()); }} style={btn()}>{L("আজ পর্যন্ত সব", "All till today")}</button>}
            <label style={{ ...lbl, fontWeight: 600, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
              <input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} /> {L("শূন্য ব্যালেন্স লুকান", "Hide zero balances")}
            </label>
            <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              {selected && <button type="button" onClick={() => setSelKey("")} style={btn()}>⚖️ {L("ট্রায়াল ব্যালেন্স", "Trial balance")}</button>}
              <button type="button" onClick={print} disabled={!ledger} style={btn("#dbeafe", "#1e40af")}>🖨️ {L("প্রিন্ট", "Print")}</button>
            </span>
          </div>

          {error && <div style={{ padding: 12, color: C.red, fontWeight: 700 }}>{L("ডেটা পড়া যায়নি: ", "Could not load: ")}{error}</div>}
          {!ledger && !error && <div style={{ padding: 24, textAlign: "center", fontWeight: 700 }}>{L("লোড হচ্ছে…", "Loading…")}</div>}
          {ledger && (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 320px) 1fr", gap: 10, padding: 10, flex: 1, minHeight: 0 }}>
              <div style={{ display: "flex", flexDirection: "column", minHeight: 0, background: "#fff", border: `1px solid ${C.border}` }}>
                <div style={{ padding: 6, borderBottom: `1px solid ${C.border}` }}>
                  <input ref={searchRef} style={inp()} value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={onSearchKey}
                    placeholder={L("🔍 খাত / পার্টির নাম (↑ ↓ দিয়ে বাছুন)", "🔍 Account / party name (↑ ↓ to pick)")} />
                </div>
                <div ref={listRef} style={{ overflow: "auto", flex: 1 }}>
                  {groups.map((g) => (
                    <div key={g.id}>
                      <div style={{ padding: "4px 8px", background: C.panel, fontSize: 11.5, fontWeight: 800, position: "sticky", top: 0 }}>{bn ? g.bn : g.en} ({g.accounts.length})</div>
                      {g.accounts.map((a) => {
                        const v = bal.get(a.key) || 0;
                        const on = a.key === selKey;
                        return (
                          <div key={a.key} data-sel={on ? "1" : "0"} onClick={() => setSelKey(a.key)}
                            style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "4px 8px 4px 14px", cursor: "pointer", fontSize: 12.5, background: on ? C.sel : "transparent", fontWeight: on ? 800 : 500, borderBottom: "1px solid #eef2f7" }}>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                            <span style={{ whiteSpace: "nowrap", color: v > 0 ? C.label : v < 0 ? C.green : "#64748b", fontVariantNumeric: "tabular-nums" }}>{drCr(v)}</span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  {!groups.length && <div style={{ padding: 16, textAlign: "center", color: "#64748b" }}>{L("কিছু পাওয়া যায়নি", "Nothing found")}</div>}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", minHeight: 0, gap: 6 }}>
                {selected && st ? (
                  <>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "baseline", padding: "6px 10px", background: "#fff7e6", border: `1px solid ${C.border}` }}>
                      <span style={{ fontSize: 15, fontWeight: 900 }}>{selected.name}</span>
                      <span style={{ fontSize: 12 }}>{groupName(selected.group)} · {period}</span>
                      <span style={{ marginLeft: "auto", fontSize: 13 }}>{L("ওপেনিং", "Opening")}: <b>{drCr(st.opening)}</b> · {L("শেষ ব্যালেন্স", "Closing")}: <b>{drCr(st.closing)}</b></span>
                    </div>
                    <div style={{ overflow: "auto", flex: 1, background: "#fff", border: `1px solid ${C.border}` }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead><tr>
                          {["Date", "Type", "No", L("বিপরীত খাত", "Particulars"), L("বিবরণ", "Narration"), "Debit", "Credit", "Balance"].map((h, i) => <th key={h} style={{ ...th, textAlign: i >= 5 ? "right" : "left" }}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                          <tr style={{ background: C.rowAlt }}>
                            <td style={td} colSpan={3} /><td style={{ ...td, fontWeight: 700 }}>{L("ওপেনিং ব্যালেন্স", "Opening balance")}</td><td style={td} /><td style={num} /><td style={num} />
                            <td style={{ ...num, fontWeight: 700 }}>{drCr(st.opening)}</td>
                          </tr>
                          {st.lines.map((p, i) => (
                            <tr key={`${p.col}:${p.docId}:${p.type}:${i}`} style={{ background: i % 2 ? C.rowAlt : "#fff" }}>
                              <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtDate(p.date)}</td>
                              <td style={{ ...td, whiteSpace: "nowrap" }}>{typeName(p.type)}</td>
                              <td style={{ ...td, whiteSpace: "nowrap", fontWeight: 700 }}>{p.no}</td>
                              <td style={td}>{p.against}</td>
                              <td style={{ ...td, color: "#475569" }}>{p.narration}</td>
                              <td style={num}>{p.dr ? money(p.dr) : ""}</td>
                              <td style={num}>{p.cr ? money(p.cr) : ""}</td>
                              <td style={{ ...num, fontWeight: 700 }}>{drCr(p.balance)}</td>
                            </tr>
                          ))}
                          {!st.lines.length && <tr><td colSpan={8} style={{ ...td, textAlign: "center", color: "#64748b", padding: 16 }}>{L("এই সময়ে কোনো লেনদেন নেই", "No transactions in this period")}</td></tr>}
                        </tbody>
                        <tfoot><tr style={{ background: C.panel, fontWeight: 800 }}>
                          <td style={td} colSpan={5}>{L("মোট", "Total")} ({st.lines.length})</td>
                          <td style={num}>{money(st.dr)}</td><td style={num}>{money(st.cr)}</td><td style={num}>{drCr(st.closing)}</td>
                        </tr></tfoot>
                      </table>
                    </div>
                  </>
                ) : trial && (
                  <>
                    <div style={{ padding: "6px 10px", background: "#fff7e6", border: `1px solid ${C.border}`, fontSize: 13 }}>
                      <b style={{ fontSize: 15 }}>⚖️ {L("ট্রায়াল ব্যালেন্স", "Trial balance")}</b> · {L("পর্যন্ত", "as at")} {to ? fmtDate(to) : L("আজ", "today")} · {L("বাঁ দিক থেকে যেকোনো খাত বাছুন", "pick any account on the left")}
                    </div>
                    <div style={{ overflow: "auto", flex: 1, background: "#fff", border: `1px solid ${C.border}` }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead><tr>{[L("খাত", "Account"), L("গ্রুপ", "Group"), "Debit", "Credit"].map((h, i) => <th key={h} style={{ ...th, textAlign: i >= 2 ? "right" : "left" }}>{h}</th>)}</tr></thead>
                        <tbody>
                          {trial.rows.map((r, i) => (
                            <tr key={r.a.key} onClick={() => setSelKey(r.a.key)} style={{ cursor: "pointer", background: i % 2 ? C.rowAlt : "#fff" }}>
                              <td style={{ ...td, fontWeight: 600 }}>{r.a.name}</td><td style={td}>{groupName(r.a.group)}</td>
                              <td style={num}>{r.v > 0 ? money(r.v) : ""}</td><td style={num}>{r.v < 0 ? money(-r.v) : ""}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot><tr style={{ background: C.panel, fontWeight: 800 }}>
                          <td style={td} colSpan={2}>{L("মোট", "Total")}{Math.abs(trial.dr - trial.cr) < 0.01 ? " ✅" : ` ⚠️ ${money(trial.dr - trial.cr)}`}</td>
                          <td style={num}>{money(trial.dr)}</td><td style={num}>{money(trial.cr)}</td>
                        </tr></tfoot>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
