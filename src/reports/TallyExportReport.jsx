// Accounting export: journal, contra, receipt and payment vouchers for a date range as an XML voucher import file and
// a CSV sheet, with a preview (count and amount by type, the first vouchers, the ledgers the receiving books must have).
// Read-only: built from the Global Ledger postings, nothing in S4 changes. Rules are in tallyExport.js. The screen never
// names the target software; the XML keeps its import format.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { PM_CSS } from "../product-master/pmStyles";
import { SI_CSS, usePmFitHeight, usePmMobile } from "../sales-invoice/siSkin";
import { offlineList } from "../offline/offlineRepository";
import { loadInvoiceRows, rowsOf } from "../inventory/stockFromInvoices";
import { expenseCategoryLabel } from "../expenses/ExpensesTab.jsx";
import { saveTextFile } from "../utils/saveTextFile.js";
import { buildGlobalLedger } from "../ledger/globalLedger.js";
import { shopAccountNature } from "../ledger/accountNature.js";
import { valuationMethodOf } from "./stockValuation.js";
import { fyStartDate } from "./balanceSheet.js";
import { r2 } from "./reportFilters.js";
import { csvText } from "./vatExport.js";
import { TALLY_KINDS, TALLY_VCH, buildTallyVouchers, exportCheck, ledgerList, tallyCsvExport, tallyFileName, tallyXml } from "./tallyExport.js";

const money = (v) => r2(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const SAMPLE = 50;
const KIND_BN = { journal: "জার্নাল", contra: "কন্ট্রা", receipt: "রিসিপ্ট", payment: "পেমেন্ট" };
const TX_CSS = `
.tx-kpis { grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); }
.tx-kpis .si-kpi b { white-space: normal; overflow: visible; text-overflow: clip; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.tx-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.tx-table th { text-align: left; background: #e8eef7; padding: 3px 5px; border-bottom: 1px solid #8797a9; white-space: nowrap; position: sticky; top: 0; }
.tx-table td { padding: 3px 5px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
.tx-table .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.tx-lines { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; column-gap: 8px; }
.tx-lines .num { text-align: right; font-variant-numeric: tabular-nums; }
`;

export default function TallyExportReport({ lang = "en", shopId, shop = null, customers = [], vendors = [], products = [], shopName = "", cur = "AED", toast, canExport = false, chartOfAccounts = null, fyStartMonth = 1 }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const today = localDay();
  const monthStart = `${today.slice(0, 8)}01`;
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [kind, setKind] = useState("");
  const [dayBook, setDayBook] = useState(false);
  const [company, setCompany] = useState(shopName);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const mobile = usePmMobile();
  const rootRef = useRef(null);
  const fitH = usePmFitHeight(rootRef, mobile);

  useEffect(() => { setCompany((c) => c || shopName); }, [shopName]);
  // Same documents and loading as the Global Ledger.
  useEffect(() => {
    let cancelled = false;
    setError("");
    Promise.all([
      loadInvoiceRows(), offlineList("salesReceipts"), offlineList("purchasePayments"), offlineList("expenses"),
      offlineList("accountVouchers").catch(() => []), offlineList("partnerEntries").catch(() => []), offlineList("bankReconciliations").catch(() => []),
    ]).then(([rows, rc, pm, ex, av, pe, br]) => {
      if (cancelled) return;
      setData({
        salesInvoices: rows.salesInvoices, purchaseInvoices: rows.purchaseInvoices, salesReturns: rows.extras?.salesReturns || [], purchaseReturns: rows.extras?.purchaseReturns || [], stockAdjustments: rows.extras?.stockAdjustments || [], warrantyClaims: rows.extras?.warrantyClaims || [],
        receipts: rowsOf(rc), payments: rowsOf(pm), expenses: rowsOf(ex), accountVouchers: rowsOf(av), partnerEntries: rowsOf(pe),
        bankEntries: rowsOf(br).filter((d) => d?.kind === "entry"),
      });
    }).catch((err) => { console.warn("[S4 Accounting export] load failed", err); if (!cancelled) setError(String(err?.message || err)); });
    return () => { cancelled = true; };
  }, [shopId, tick]);

  const badRange = !!(from && to && from > to);
  // chart-of-accounts nature of custom accounts (ledger/accountNature.js)
  const natureOf = useMemo(() => shopAccountNature(shop), [shop?.chartOfAccounts, shop?.coaGroups]); // eslint-disable-line react-hooks/exhaustive-deps
  const ledger = useMemo(() => (data ? buildGlobalLedger(data, { shopId, customers, vendors, products, natureOf, valuation: valuationMethodOf(shop), expenseLabel: (e) => expenseCategoryLabel(e, false) }) : null), [data, shopId, customers, vendors, products, natureOf, shop?.stockValuationMethod]);
  const res = useMemo(() => (ledger && !badRange ? buildTallyVouchers(ledger, { from, to, kind, dayBook }) : null), [ledger, from, to, kind, dayBook, badRange]);
  const ledgers = useMemo(() => (res ? ledgerList(res, ledger, chartOfAccounts) : []), [res, ledger, chartOfAccounts]);
  const empty = !!res && !res.vouchers.length;
  const toDay = to || today;

  const quick = [
    ["month", L("এই মাস", "This month"), monthStart, today],
    ["year", L("এই বছর", "This year"), `${today.slice(0, 4)}-01-01`, today],
    ...(Number(fyStartMonth) > 1 ? [["fy", L("এই অর্থবছর", "This FY"), fyStartDate(today, fyStartMonth), today]] : []),
  ];
  const activeQuick = quick.find(([, , f, t]) => f === from && t === to)?.[0];
  const kindLabel = (k) => (bn ? KIND_BN[k] : TALLY_VCH[k]);

  // does the file agree with the books for this period? (exportCheck) - a file that does not is never written
  const check = useMemo(() => (res ? exportCheck(res, { from, to: toDay, ledger }) : null), [res, from, toDay, ledger]);
  const download = async (ext) => {
    if (!res || empty) return;
    if (!check?.ok) { toast?.(`${L("ফাইল বানানো হয়নি", "The file was not made")}: ${(check?.problems || []).map((x) => (bn ? x.bn : x.en)).join(" · ")}`, "err"); return; }
    try {
      if (ext === "xml") await saveTextFile(tallyFileName(from, toDay, "xml"), tallyXml(res, { company, currency: cur, from, to: toDay, shopName }), "application/xml;charset=utf-8");
      else await saveTextFile(tallyFileName(from, toDay, "csv"), csvText(tallyCsvExport(res, { shopName, currency: cur, from, to: toDay })));
    } catch (e) { toast?.(e.message || String(e), "err"); }
  };

  const kpi = (labelText, k) => (
    <div className="si-kpi" title={`${labelText}: ${k.count} · ${cur} ${money(k.amount)}`}><span>{labelText} ({k.count})</span><b>{cur} {money(k.amount)}</b></div>
  );

  return (
    <div ref={rootRef} className="si-root" style={fitH ? { height: fitH } : undefined}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>
      <style>{TX_CSS}</style>
      <div className="pm-reference-title">
        <strong> {L("হিসাব এক্সপোর্ট", "Accounting Export")}</strong>
        <span>{shopName ? `${shopName} · ` : ""}{fmtDay(from) || L("শুরু থেকে", "From start")} - {fmtDay(toDay)} · {cur}</span>
      </div>
      <div className="si-toolbar">
        {canExport && <button type="button" className="pm-btn pm-btn--primary" onClick={() => download("xml")} disabled={!res || empty || !check?.ok}> {L("XML ডাউনলোড", "Download XML")}</button>}
        {canExport && <button type="button" className="pm-btn-secondary" onClick={() => download("csv")} disabled={!res || empty || !check?.ok}> CSV</button>}
        <button type="button" className="pm-btn-secondary" onClick={() => setTick((v) => v + 1)}> {L("রিফ্রেশ", "Refresh")}</button>
        <span className="si-toolbar-gap" />
        <div className="si-pills">
          {quick.map(([key, label, f, t]) => (
            <button key={key} type="button" className={`pm-btn-secondary${activeQuick === key ? " is-active" : ""}`} onClick={() => { setFrom(f); setTo(t); }}>{label}</button>
          ))}
        </div>
        <input type="date" className="pm-input" style={{ width: mobile ? "calc(50% - 2px)" : 120, borderColor: badRange ? "#b91c1c" : undefined }} value={from} onChange={(e) => setFrom(e.target.value)} title={L("শুরুর তারিখ", "From")} />
        <input type="date" className="pm-input" style={{ width: mobile ? "calc(50% - 2px)" : 120, borderColor: badRange ? "#b91c1c" : undefined }} value={to} onChange={(e) => setTo(e.target.value)} title={L("শেষ তারিখ", "To")} />
      </div>
      <div className="si-toolbar">
        <div className="si-pills">
          {["", ...TALLY_KINDS].map((k) => (
            <button key={k || "all"} type="button" className={`pm-btn-secondary${kind === k ? " is-active" : ""}`} onClick={() => setKind(k)}>{k ? kindLabel(k) : L("সব", "All")}</button>
          ))}
        </div>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }} title={L("বিল, রিটার্ন, খরচ, বিলে জমা/পেমেন্ট, পার্টনার ও ব্যাংক এন্ট্রিও ভাউচার হিসেবে যাবে", "Bills, returns, expenses, bill-time payments, partner and bank entries go out as vouchers too")}>
          <input type="checkbox" checked={dayBook} onChange={(e) => setDayBook(e.target.checked)} /> {L("ডে বুকের বাকি এন্ট্রিও", "Include other day book entries")}
        </label>
        <span className="si-toolbar-gap" />
        <label style={{ display: "inline-flex", alignItems: "center", gap: 4, width: mobile ? "100%" : undefined }}>
          {L("কোম্পানির নাম", "Company name")}
          <input className="pm-input" style={{ width: mobile ? "100%" : 200 }} value={company} onChange={(e) => setCompany(e.target.value)} placeholder={L("খালি থাকলে সফটওয়্যারে খোলা কোম্পানি", "Empty: the company open in the software")} />
        </label>
      </div>
      {res && (
        <div className="si-kpis tx-kpis">
          {TALLY_KINDS.filter((k) => !kind || k === kind).map((k) => <React.Fragment key={k}>{kpi(kindLabel(k), res.kpi[k])}</React.Fragment>)}
          {!kind && kpi(L("মোট", "Total"), res.total)}
        </div>
      )}
      <div className="si-body">
        {error && <div className="si-paid-box is-due">{L("ডেটা পড়া যায়নি: ", "Could not load: ")}{error}</div>}
        {!res && !error && !badRange && <div className="si-empty">{L("লোড হচ্ছে…", "Loading…")}</div>}
        {badRange && <div className="si-paid-box is-due">{L("শুরুর তারিখ শেষ তারিখের পরে", "The start date is after the end date")}</div>}
        {empty && <div className="si-paid-box is-due">{L("এই সময়ে এক্সপোর্ট করার মতো কোনো ভাউচার নেই", "No vouchers to export in this period")}</div>}
        {check && !empty && (
          <div className={`si-paid-box${check.ok ? "" : " is-due"}`} style={{ display: "block" }}>
            <b>{check.ok ? L("ফাইল বইয়ের সাথে মেলে", "The file agrees with the books") : L("ফাইল বানানো যাবে না", "The file cannot be made")}</b>
            {" · "}{TALLY_KINDS.filter((k) => check.counts[k]).map((k) => `${kindLabel(k)} ${check.counts[k]}`).join(", ")}
            {" · "}{L("লাইন", "Lines")} {check.lines} · {L("ডেবিট", "Debit")} {cur} {money(check.dr)} · {L("ক্রেডিট", "Credit")} {cur} {money(check.cr)}
            {check.tbDifference != null && ` · ${L(`${fmtDay(toDay)} পর্যন্ত ট্রায়াল ব্যালেন্সের পার্থক্য`, `Trial balance difference to ${fmtDay(toDay)}`)} ${money(check.tbDifference)}`}
            {check.problems.filter((x) => x.id !== "empty").map((x) => <div key={x.id}>{bn ? x.bn : x.en}</div>)}
          </div>
        )}
        {res && res.unbalanced.length > 0 && (
          <div className="si-paid-box is-due">
            {L(`${res.unbalanced.length}টি এন্ট্রির ডেবিট-ক্রেডিট মেলেনি, তাই বাদ রাখা হয়েছে: `, `${res.unbalanced.length} entr${res.unbalanced.length === 1 ? "y does" : "ies do"} not balance and ${res.unbalanced.length === 1 ? "is" : "are"} left out: `)}
            {res.unbalanced.slice(0, 10).map((v) => v.no || v.date).join(", ")}
          </div>
        )}
        {res && res.cashInJournal > 0 && (
          <div className="si-paid-box">
            {L(`${res.cashInJournal}টি জার্নালে ক্যাশ/ব্যাংক লেজার আছে। কিছু হিসাব সফটওয়্যার জার্নালে ক্যাশ/ব্যাংক নেয় শুধু তার সেটিংসে "cash accounts in journals" চালু থাকলে।`,
              `${res.cashInJournal} journal${res.cashInJournal === 1 ? " uses" : "s use"} a cash / bank ledger. Some accounting software takes cash / bank lines in a journal only when "cash accounts in journals" is allowed in its settings.`)}
          </div>
        )}
        {res && !empty && (
          <div className={mobile ? "" : "si-cols"} style={mobile ? { display: "flex", flexDirection: "column", gap: 4 } : { alignItems: "start", gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)" }}>
            <fieldset className="pm-panel" style={{ margin: 0 }}>
              <legend className="pm-panel-legend">{L(`ভাউচার (প্রথম ${Math.min(SAMPLE, res.vouchers.length)} / ${res.vouchers.length})`, `Vouchers (first ${Math.min(SAMPLE, res.vouchers.length)} of ${res.vouchers.length})`)}</legend>
              <div className="si-panel-body" style={{ overflow: "auto", maxHeight: mobile ? undefined : 420 }}>
                <table className="tx-table">
                  <thead><tr><th>{L("তারিখ", "Date")}</th><th>{L("ধরন", "Type")}</th><th>{L("নং", "No")}</th><th>{L("লেজার (ডেবিট / ক্রেডিট)", "Ledgers (Dr / Cr)")}</th></tr></thead>
                  <tbody>
                    {res.vouchers.slice(0, SAMPLE).map((v) => (
                      <tr key={v.id}>
                        <td style={{ whiteSpace: "nowrap" }}>{fmtDay(v.date)}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{kindLabel(v.kind)}{v.source === "daybook" ? <span className="si-muted"> ({L("ডে বুক", "day book")})</span> : null}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{v.no}</td>
                        <td>
                          <div className="tx-lines">
                            {v.lines.map((l, i) => (
                              <React.Fragment key={i}>
                                <span style={{ overflowWrap: "anywhere" }}>{l.ledger}</span>
                                <span className="num">{l.dr > 0 ? money(l.dr) : ""}</span>
                                <span className="num">{l.cr > 0 ? money(l.cr) : ""}</span>
                              </React.Fragment>
                            ))}
                          </div>
                          {v.narration && <div className="si-muted">{v.narration}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </fieldset>
            <fieldset className="pm-panel" style={{ margin: 0 }}>
              <legend className="pm-panel-legend">{L(`যে খাত থাকতে হবে (${ledgers.length})`, `Ledgers required (${ledgers.length})`)}</legend>
              <div className="si-panel-body" style={{ overflow: "auto", maxHeight: mobile ? undefined : 420 }}>
                <table className="tx-table">
                  <thead><tr><th>{L("লেজারের নাম", "Ledger name")}</th><th>{L("কোড", "Code")}</th><th>{L("প্রস্তাবিত গ্রুপ", "Suggested group")}</th></tr></thead>
                  <tbody>
                    {ledgers.map((l) => <tr key={l.name}><td style={{ overflowWrap: "anywhere" }}>{l.name}</td><td>{l.code}</td><td>{l.tallyGroup}</td></tr>)}
                  </tbody>
                </table>
              </div>
            </fieldset>
          </div>
        )}
        <div className="si-note" style={{ fontWeight: 700 }}>
          {L("এটা একমুখী ভাউচার ইমপোর্ট ফাইল - অন্য হিসাবের সফটওয়্যারে ইমপোর্ট করার জন্য। S4 দুই দিকে সিঙ্ক করে না, আর এই পাতা কোনো সার্ভারে কিছু পাঠায় না: ফাইলটা শুধু এই ডিভাইসে সেভ হয়।",
            "This is a one-way voucher import file for other accounting software. S4 does not sync both ways, and this page sends nothing to any server: the file is only saved on this device.")}
        </div>
        <div className="si-note">
          {L(
            "শুধু এক্সপোর্ট: S4-এর কিছু বদলায় না, অন্য সফটওয়্যার থেকে কিছু ফেরত আসে না। ভাউচারগুলো গ্লোবাল লেজারের পোস্টিং থেকে - draft ও বাতিল বাদ, প্রতিটি ভাউচারের ডেবিট = ক্রেডিট। জার্নাল ও কন্ট্রা একই ধরনে যায়; কাস্টমারের রিসিপ্ট ও সাপ্লায়ারের রিফান্ড Receipt, সাপ্লায়ার পেমেন্ট ও কাস্টমারকে রিফান্ড Payment। ডে বুক চালু করলে বাকি এন্ট্রি (বিল, রিটার্ন, খরচ ইত্যাদি) টাকার দিক দেখে Receipt / Payment / Contra / Journal হয় - শুধু হিসাবের লাইন, কোনো স্টক আইটেম বা গোডাউন নয়।\nলেজারের নাম: S4-এ যে নাম ঠিক সেটাই (যেমন \"Cash in Hand\", \"Bank\", \"Sales\", কাস্টমার ও সাপ্লায়ারের নাম)। যে সফটওয়্যারে নেবেন সেখানে আগে থেকে ঠিক এই নামে লেজার থাকতে হবে - ডান দিকের তালিকা আর প্রস্তাবিত গ্রুপ দেখে তৈরি করুন (সেখানের \"Cash\" লেজারের নাম \"Cash in Hand\" করে নিতে পারেন)। টাকা দোকানের মুদ্রায় (" + cur + "), সেই কোম্পানির মূল মুদ্রাও এটাই হতে হবে।\nফাইল: XML হলো প্রচলিত হিসাব সফটওয়্যারে import-যোগ্য ভাউচার ফরম্যাট (সফটওয়্যারের Import > Vouchers / Transactions দিয়ে নিন); CSV সাধারণ শিট - Excel বা হাতে import-এর জন্য। আগে একটা কপি কোম্পানিতে চেষ্টা করুন, আর একই ফাইল দুবার নিলে ভাউচার দুবার হবে।",
            "Export only: nothing in S4 changes and nothing comes back from the other software. Vouchers come from the Global Ledger postings - drafts and cancelled documents are left out and every voucher's debits equal its credits. Journal and contra go as the same type; customer receipts and refunds from suppliers as Receipt; supplier payments and refunds to customers as Payment. With the day book option the other entries (bills, returns, expenses and so on) go by where the money moves - Receipt / Payment / Contra / Journal - as accounting lines only, with no stock items or godowns.\nLedger names: exactly the S4 names (\"Cash in Hand\", \"Bank\", \"Sales\", customer and supplier names). The software you import into must already have a ledger of that exact name - create them from the list on the right with the suggested group (you can rename its \"Cash\" ledger to \"Cash in Hand\"). Amounts are in the shop currency (" + cur + "), which must be that company's base currency.\nFiles: the XML is a voucher import format compatible with common accounting imports (use the software's Import > Vouchers / Transactions); the CSV is a plain sheet for Excel or manual import. Try a copy of the company first, and importing the same file twice makes every voucher twice."
          )}
        </div>
      </div>
      <div className="si-statusbar">
        {res && <span>{L("ভাউচার", "Vouchers")} <b>{res.total.count}</b></span>}
        {res && <span>{L("মোট", "Total")} <b>{cur} {money(res.total.amount)}</b></span>}
        {!canExport && <span>{L("ফাইল ডাউনলোডের অনুমতি নেই", "No permission to download the file")}</span>}
      </div>
    </div>
  );
}
