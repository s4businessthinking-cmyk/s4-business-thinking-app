// Books hub: Day Book + Cash Book + Bank Book from the Global Ledger (same postings as Balance Sheet).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { PM_CSS } from "../product-master/pmStyles";
import { SI_CSS, usePmFitHeight, usePmMobile } from "../sales-invoice/siSkin";
import { offlineList } from "../offline/offlineRepository";
import { loadInvoiceRows, rowsOf } from "../inventory/stockFromInvoices";
import { expenseCategoryLabel } from "../expenses/ExpensesTab.jsx";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { saveTextFile } from "../utils/saveTextFile.js";
import { buildGlobalLedger } from "../ledger/globalLedger.js";
import { shopAccountNature } from "../ledger/accountNature.js";
import { valuationMethodOf } from "./stockValuation.js";
import { CASH_ACCOUNT } from "../vouchers/accountVoucherDomain.js";
import { r2 } from "./reportFilters.js";
import {
  BANK_ACCOUNT, buildBankBook, buildCashBook, buildDayBook, moneyAccounts,
} from "./booksHub.js";
import DateField from "../components/DateField.jsx";

const money = (v) => r2(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const monthStart = () => { const d = new Date(); return localDay(new Date(d.getFullYear(), d.getMonth(), 1)); };
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const csvCell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

const TABS = [
  { id: "day", bn: "ডে বুক", en: "Day Book" },
  { id: "cash", bn: "ক্যাশ বুক", en: "Cash Book" },
  { id: "bank", bn: "ব্যাংক বুক", en: "Bank Book" },
];

export default function BooksHubReport({ lang = "en", shopId, shop = null, customers = [], vendors = [], products = [], shopName = "", cur = "AED", toast, canPrint = false }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const [mode, setMode] = useState("day");
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(() => localDay());
  const [bankName, setBankName] = useState(BANK_ACCOUNT);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const mobile = usePmMobile();
  const rootRef = useRef(null);
  const fitH = usePmFitHeight(rootRef, mobile);

  useEffect(() => {
    let cancelled = false;
    setError("");
    Promise.all([
      loadInvoiceRows(), offlineList("salesReceipts"), offlineList("purchasePayments"), offlineList("expenses"),
      offlineList("accountVouchers").catch(() => []), offlineList("partnerEntries").catch(() => []), offlineList("bankReconciliations").catch(() => []),
    ]).then(([rows, rc, pm, ex, av, pe, br]) => {
      if (cancelled) return;
      setData({
        salesInvoices: rows.salesInvoices, purchaseInvoices: rows.purchaseInvoices,
        salesReturns: rows.extras?.salesReturns || [], purchaseReturns: rows.extras?.purchaseReturns || [], stockAdjustments: rows.extras?.stockAdjustments || [], warrantyClaims: rows.extras?.warrantyClaims || [],
        receipts: rowsOf(rc), payments: rowsOf(pm), expenses: rowsOf(ex), accountVouchers: rowsOf(av),
        partnerEntries: rowsOf(pe), bankEntries: rowsOf(br).filter((d) => d?.kind === "entry"),
      });
    }).catch((err) => { console.warn("[S4 Books] load failed", err); if (!cancelled) setError(String(err?.message || err)); });
    return () => { cancelled = true; };
  }, [shopId, tick]);

  useEffect(() => {
    const refresh = () => { if (document.visibilityState !== "hidden") setTick((v) => v + 1); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);

  // chart-of-accounts nature of custom accounts (ledger/accountNature.js)
  const natureOf = useMemo(() => shopAccountNature(shop), [shop?.chartOfAccounts, shop?.coaGroups]); // eslint-disable-line react-hooks/exhaustive-deps
  const ledger = useMemo(
    () => (data ? buildGlobalLedger(data, { shopId, customers, vendors, products, natureOf, valuation: valuationMethodOf(shop), expenseLabel: (e) => expenseCategoryLabel(e, false) }) : null),
    [data, shopId, customers, vendors, products, natureOf],
  );
  const range = useMemo(() => ({ from: from || "", to: to || "" }), [from, to]);
  const moneyList = useMemo(() => (ledger ? moneyAccounts(ledger.accounts) : []), [ledger]);
  const dayBook = useMemo(
    () => (ledger ? buildDayBook(ledger.postings, ledger.accounts, range) : null),
    [ledger, range],
  );
  const cashBook = useMemo(
    () => (ledger ? buildCashBook(ledger.postings, ledger.accounts, range) : null),
    [ledger, range],
  );
  const bankBook = useMemo(
    () => (ledger ? buildBankBook(ledger.postings, ledger.accounts, range, bankName || BANK_ACCOUNT) : null),
    [ledger, range, bankName],
  );

  useEffect(() => {
    if (!moneyList.length) return;
    if (!moneyList.some((a) => a.name === bankName)) {
      const prefer = moneyList.find((a) => a.name === BANK_ACCOUNT) || moneyList.find((a) => a.name !== CASH_ACCOUNT) || moneyList[0];
      if (prefer) setBankName(prefer.name);
    }
  }, [moneyList, bankName]);

  const today = localDay();
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const quick = [
    ["today", L("আজ", "Today"), today, today],
    ["month", L("এই মাস", "This month"), monthStart(), today],
    ["year", L("এই বছর", "This year"), yearStart, today],
    ["all", L("সব সময়", "All time"), "", ""],
  ];
  const activeQuick = quick.find(([, , f, t]) => f === from && t === to)?.[0];
  const badRange = !!(from && to && from > to);
  const periodLabel = `${from ? fmtDay(from) : L("শুরু", "Start")} — ${to ? fmtDay(to) : L("আজ", "Today")}`;

  const moneyBook = mode === "cash" ? cashBook : mode === "bank" ? bankBook : null;
  const title = TABS.find((t) => t.id === mode);
  const hubTitle = title ? L(title.bn, title.en) : L("বুকস", "Books");

  const dayRows = () => {
    if (!dayBook) return [];
    const rows = [];
    dayBook.entries.forEach((e) => {
      rows.push([`${fmtDay(e.date)}  ${e.type || ""}  ${e.no || ""}`.trim(), "", ""]);
      e.lines.forEach((l) => rows.push([`   ${l.name}`, l.dr ? money(l.dr) : "", l.cr ? money(l.cr) : ""]));
      if (e.narration) rows.push([`   ${e.narration}`, "", ""]);
    });
    rows.push([L("মোট", "Total"), money(dayBook.totalDr), money(dayBook.totalCr)]);
    return rows;
  };

  const moneyRows = (book) => {
    if (!book) return [];
    const rows = [[L("ওপেনিং ব্যালেন্স", "Opening balance"), book.opening >= 0 ? money(book.opening) : "", book.opening < 0 ? money(-book.opening) : ""]];
    book.lines.forEach((l) => {
      const note = [l.no, l.against, l.narration].filter(Boolean).join(" · ");
      rows.push([`${fmtDay(l.date)}${note ? `  ${note}` : ""}`, l.dr ? money(l.dr) : "", l.cr ? money(l.cr) : ""]);
    });
    rows.push([L("মোট", "Total"), money(book.dr), money(book.cr)]);
    rows.push([L("ক্লোজিং ব্যালেন্স", "Closing balance"), book.closing >= 0 ? money(book.closing) : "", book.closing < 0 ? money(-book.closing) : ""]);
    return rows;
  };

  const print = () => {
    if (badRange) return;
    if (mode === "day" && dayBook) {
      printWithSettings(generateStatementHTML({
        shopName, title: L("ডে বুক", "DAY BOOK"), subtitle: periodLabel,
        cols: [{ label: L("বিবরণ", "Particulars") }, { label: L("ডেবিট", "Debit"), align: "right" }, { label: L("ক্রেডিট", "Credit"), align: "right" }],
        rows: dayRows(),
      }), { lang });
      return;
    }
    if (moneyBook) {
      printWithSettings(generateStatementHTML({
        shopName, title: `${hubTitle.toUpperCase()} — ${moneyBook.accountName}`, subtitle: periodLabel,
        cols: [{ label: L("বিবরণ", "Particulars") }, { label: L("ডেবিট", "Debit"), align: "right" }, { label: L("ক্রেডিট", "Credit"), align: "right" }],
        rows: moneyRows(moneyBook),
      }), { lang });
    }
  };

  const exportCsv = async () => {
    if (badRange) return;
    const head = [L("বিবরণ", "Particulars"), L("ডেবিট", "Debit"), L("ক্রেডিট", "Credit")];
    const body = mode === "day" ? dayRows() : moneyRows(moneyBook);
    if (!body.length) return;
    const text = "\uFEFF" + [head, ...body].map((r) => r.map((c) => csvCell(String(c).trim())).join(",")).join("\r\n");
    const file = mode === "day" ? `day-book-${from || "start"}-${to || "all"}.csv`
      : `${mode}-book-${(moneyBook?.accountName || mode).replace(/\s+/g, "-")}-${from || "start"}-${to || "all"}.csv`;
    try { await saveTextFile(file, text); } catch (e) { toast?.(e.message || String(e), "err"); }
  };

  const balColor = (v) => (v < 0 ? "#b91c1c" : undefined);

  return (
    <div ref={rootRef} className="si-root" style={fitH ? { height: fitH } : undefined}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>
      <div className="pm-reference-title">
        <strong>{L("বুকস", "Books")}</strong>
        <span>{periodLabel}</span>
      </div>
      <div className="si-toolbar">
        <div className="si-pills">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={`pm-btn-secondary${mode === t.id ? " is-active" : ""}`} onClick={() => setMode(t.id)}>
              {L(t.bn, t.en)}
            </button>
          ))}
        </div>
        {mode === "bank" && moneyList.filter((a) => a.name !== CASH_ACCOUNT).length > 0 && (
          <select className="pm-input" style={{ width: mobile ? "100%" : 180, height: 26 }} value={bankName} onChange={(e) => setBankName(e.target.value)} title={L("ব্যাংক হিসাব", "Bank account")}>
            {moneyList.filter((a) => a.name !== CASH_ACCOUNT).map((a) => (
              <option key={a.key} value={a.name}>{a.name}</option>
            ))}
          </select>
        )}
        {canPrint && <button type="button" className="pm-btn pm-btn--primary" onClick={print} disabled={!ledger || badRange}> {L("প্রিন্ট", "Print")}</button>}
        {canPrint && <button type="button" className="pm-btn-secondary" onClick={exportCsv} disabled={!ledger || badRange}> Excel</button>}
        <button type="button" className="pm-btn-secondary" onClick={() => setTick((v) => v + 1)}> {L("রিফ্রেশ", "Refresh")}</button>
        <span className="si-toolbar-gap" />
        <div className="si-pills">
          {quick.map(([key, label, f, t]) => (
            <button key={key} type="button" className={`pm-btn-secondary${activeQuick === key ? " is-active" : ""}`} onClick={() => { setFrom(f); setTo(t); }}>{label}</button>
          ))}
        </div>
        <DateField className="pm-input" style={{ width: mobile ? "48%" : 130 }} value={from} onChange={(e) => setFrom(e.target.value)} title={L("থেকে", "From")} />
        <DateField className="pm-input" style={{ width: mobile ? "48%" : 130 }} value={to} onChange={(e) => setTo(e.target.value)} title={L("পর্যন্ত", "To")} />
      </div>

      {mode === "day" && dayBook && (
        <div className="si-kpis">
          <div className="si-kpi"><span>{L("এন্ট্রি", "Entries")}</span><b>{dayBook.entries.length}</b></div>
          <div className="si-kpi"><span>{L("মোট ডেবিট", "Total debit")}</span><b>{cur} {money(dayBook.totalDr)}</b></div>
          <div className="si-kpi"><span>{L("মোট ক্রেডিট", "Total credit")}</span><b>{cur} {money(dayBook.totalCr)}</b></div>
          <div className="si-kpi"><span>{L("মিল", "Check")}</span><b style={{ color: Math.abs(dayBook.totalDr - dayBook.totalCr) < 0.01 ? "#15803d" : "#b91c1c" }}>{Math.abs(dayBook.totalDr - dayBook.totalCr) < 0.01 ? L("মিলেছে", "Balanced") : money(dayBook.totalDr - dayBook.totalCr)}</b></div>
        </div>
      )}
      {moneyBook && mode !== "day" && (
        <div className="si-kpis">
          <div className="si-kpi"><span>{L("হিসাব", "Account")}</span><b style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{moneyBook.accountName}</b></div>
          <div className="si-kpi"><span>{L("ওপেনিং", "Opening")}</span><b style={{ color: balColor(moneyBook.opening) }}>{cur} {money(moneyBook.opening)}</b></div>
          <div className="si-kpi"><span>{L("ইন / আউট", "In / Out")}</span><b>{money(moneyBook.dr)} / {money(moneyBook.cr)}</b></div>
          <div className="si-kpi"><span>{L("ক্লোজিং", "Closing")}</span><b style={{ color: balColor(moneyBook.closing) }}>{cur} {money(moneyBook.closing)}</b></div>
        </div>
      )}

      <div className="si-body">
        {error && <div className="si-paid-box is-due">{L("ডেটা পড়া যায়নি: ", "Could not load: ")}{error}</div>}
        {badRange && <div className="si-paid-box is-due">{L("তারিখ সীমা ভুল — From To-এর পরে হতে পারে না।", "Bad date range — From cannot be after To.")}</div>}
        {!ledger && !error ? (
          <div className="si-empty">{L("লোড হচ্ছে…", "Loading…")}</div>
        ) : mode === "day" && dayBook && !badRange ? (
          dayBook.entries.length === 0 ? (
            <div className="si-empty">{L("এই সময়ে কোনো এন্ট্রি নেই।", "No entries in this period.")}</div>
          ) : (
            <div className="pm-table-wrap">
              <table className="pm-table">
                <thead>
                  <tr>
                    <th>{L("তারিখ", "Date")}</th>
                    <th>{L("ধরন / নং", "Type / No")}</th>
                    <th>{L("হিসাব / বিবরণ", "Account / Particulars")}</th>
                    <th className="si-num">{L("ডেবিট", "Debit")}</th>
                    <th className="si-num">{L("ক্রেডিট", "Credit")}</th>
                  </tr>
                </thead>
                <tbody>
                  {dayBook.entries.map((e) => (
                    <React.Fragment key={e.id}>
                      <tr style={{ background: "#f8fafc" }}>
                        <td>{fmtDay(e.date)}</td>
                        <td><b>{e.type || "—"}</b>{e.no ? ` ${e.no}` : ""}</td>
                        <td colSpan={3} style={{ color: "#64748b" }}>{e.narration || ""}</td>
                      </tr>
                      {e.lines.map((l, i) => (
                        <tr key={`${e.id}:${l.key}:${i}`}>
                          <td />
                          <td />
                          <td style={{ paddingLeft: 12 }}>{l.name}</td>
                          <td className="si-num">{l.dr ? money(l.dr) : ""}</td>
                          <td className="si-num">{l.cr ? money(l.cr) : ""}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}><b>{L("মোট", "Total")}</b></td>
                    <td className="si-num"><b>{money(dayBook.totalDr)}</b></td>
                    <td className="si-num"><b>{money(dayBook.totalCr)}</b></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )
        ) : moneyBook && !badRange ? (
          moneyBook.lines.length === 0 && Math.abs(moneyBook.opening) < 0.005 ? (
            <div className="si-empty">{L("এই হিসাবে এই সময়ে কোনো এন্ট্রি নেই।", "No entries on this account in this period.")}</div>
          ) : (
            <div className="pm-table-wrap">
              <table className="pm-table">
                <thead>
                  <tr>
                    <th>{L("তারিখ", "Date")}</th>
                    <th>{L("নং", "No")}</th>
                    <th>{L("বিপরীত / নোট", "Against / Note")}</th>
                    <th className="si-num">{L("ডেবিট", "Debit")}</th>
                    <th className="si-num">{L("ক্রেডিট", "Credit")}</th>
                    <th className="si-num">{L("ব্যালেন্স", "Balance")}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ background: "#f8fafc" }}>
                    <td colSpan={3}><b>{L("ওপেনিং ব্যালেন্স", "Opening balance")}</b></td>
                    <td className="si-num">{moneyBook.opening > 0 ? money(moneyBook.opening) : ""}</td>
                    <td className="si-num">{moneyBook.opening < 0 ? money(-moneyBook.opening) : ""}</td>
                    <td className="si-num" style={{ color: balColor(moneyBook.opening) }}><b>{money(moneyBook.opening)}</b></td>
                  </tr>
                  {moneyBook.lines.map((l, i) => (
                    <tr key={`${l.col}:${l.docId}:${i}`}>
                      <td>{fmtDay(l.date)}</td>
                      <td>{l.no || ""}</td>
                      <td style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{[l.against, l.narration].filter(Boolean).join(" · ")}</td>
                      <td className="si-num">{l.dr ? money(l.dr) : ""}</td>
                      <td className="si-num">{l.cr ? money(l.cr) : ""}</td>
                      <td className="si-num" style={{ color: balColor(l.balance) }}>{money(l.balance)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}><b>{L("মোট / ক্লোজিং", "Total / Closing")}</b></td>
                    <td className="si-num"><b>{money(moneyBook.dr)}</b></td>
                    <td className="si-num"><b>{money(moneyBook.cr)}</b></td>
                    <td className="si-num" style={{ color: balColor(moneyBook.closing) }}><b>{money(moneyBook.closing)}</b></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )
        ) : null}

        {ledger && (
          <div className="si-note">
            {L(
              "গ্লোবাল লেজারের একই ডাবল-এন্ট্রি থেকে তৈরি। ডে বুক = তারিখ অনুযায়ী সব জার্নাল এন্ট্রি। ক্যাশ বুক = Cash in Hand। ব্যাংক বুক = Bank বা অন্য ব্যাংক হিসাব (ড্রপডাউন)। Draft ও বাতিল ডকুমেন্ট ধরা হয় না।",
              "Built from the same Global Ledger double-entry postings. Day Book = every journal entry by date. Cash Book = Cash in Hand. Bank Book = Bank or another bank account (dropdown). Draft and cancelled documents are not counted."
            )}
          </div>
        )}
      </div>
      <div className="si-statusbar">
        <span><b>{hubTitle}</b></span>
        {moneyBook && mode !== "day" && <span>{moneyBook.accountName}</span>}
        <span>{L("উইন্ডোতে ফিরলে নিজে থেকে রিফ্রেশ হয়", "Refreshes automatically when you come back to the window")}</span>
      </div>
    </div>
  );
}
