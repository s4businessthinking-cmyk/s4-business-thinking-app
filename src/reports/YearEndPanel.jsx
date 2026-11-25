// Year-end close panel (inside the Trial Balance hub): pick the financial year, see what closes and the checks,
// print the year-end statements, then close the year - one closing journal moves every income / expense balance
// into Capital on the year-end day, the stock value of that day is kept on the close record, and the books can be
// locked up to the year end. Owner only; a close can be reopened while the year is not locked. Rules in yearEnd.js.
import React, { useMemo, useState } from "react";
import { offlineGetById, offlineUpdate, offlineUpsert } from "../offline/offlineRepository";
import { saveShopRecord } from "../offline/shopService";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { saveTextFile } from "../utils/saveTextFile.js";
import { periodLockOf } from "../accounts/periodLock.js";
import { logAudit } from "../utils/auditLog.js";
import { balances } from "../ledger/globalLedger.js";
import { computeAccounts } from "./accountsCalc.js";
import { buildBalanceSheet, openingStockValue } from "./balanceSheet.js";
import { r2 } from "./reportFilters.js";
import { fyRange, taxSettingsOf } from "./taxDomain.js";
import { buildTrialBalance } from "./trialBalance.js";
import { csvText } from "./vatExport.js";
import { combinePrintHtml, packChecks, packCsvRows, packSections, packStatus } from "./monthEndPack.js";
import { stockValueAt } from "./MonthEndPackPanel.jsx";
import { YEAR_END_TARGET, closedYearAt, closingBalances, yearEndChecks, yearEndDocIds, yearEndJournal, yearEndRecord } from "./yearEnd.js";

const money = (v) => r2(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const pad = (v) => String(v).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export default function YearEndPanel({ lang = "en", shopId, shop, user, profile, isOwner = false, canPrint = false, data, ledger, products = [], shopName = "", cur = "AED", toast, onShopUpdated, onSaved, onClose }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const settings = useMemo(() => taxSettingsOf(shop), [shop]);
  const [offset, setOffset] = useState(-1);
  const [lockToo, setLockToo] = useState(true);
  const [busy, setBusy] = useState(false);
  const fy = fyRange(settings, offset);
  const today = ymd(new Date());
  const lock = periodLockOf(shop);
  const yearEnds = Array.isArray(shop?.yearEnds) ? shop.yearEnds : [];
  const who = profile?.personName || profile?.username || user?.email || "";

  const view = useMemo(() => {
    if (!data || !ledger) return null;
    const vouchers = data.accountVouchers || [];
    const liveIds = yearEndDocIds(vouchers);
    const existing = yearEnds.find((y) => y.fyEnd === fy.to && liveIds.has(y.journalId)) || null;
    const rows = data.rows || { salesInvoices: data.salesInvoices, purchaseInvoices: data.purchaseInvoices, extras: { salesReturns: data.salesReturns, purchaseReturns: data.purchaseReturns } };
    const openingStock = openingStockValue(products);
    const prior = closedYearAt(yearEnds, prevDay(fy.from), vouchers);
    const stockBase = prior ? prior.stockValue : openingStock;
    const stockEnd = stockValueAt(rows, products, shopId, fy.to);
    // figures before this year's own closing journal
    const skip = existing ? new Set([existing.journalId]) : null;
    const postings = skip ? ledger.postings.filter((p) => !skip.has(p.docId)) : ledger.postings;
    const before = { ...ledger, postings };
    const closing = closingBalances(before, fy.to);
    const journal = existing ? null : yearEndJournal({ ledger: before, fyStart: fy.from, fyEnd: fy.to, shopId, uid: user?.uid || "", by: who });
    const yearProfit = r2(-closing.net + stockEnd - stockBase);
    const tb = buildTrialBalance(before, { from: fy.from, to: fy.to, chart: shop?.chartOfAccounts || [], coaGroups: shop?.coaGroups || [] });
    const sheet = buildBalanceSheet({ accounts: ledger.accounts, bal: balances(postings, fy.to), closingStock: stockEnd, openingStock, closedStock: prior ? prior.stockValue : null });
    const pl = computeAccounts({ ...rows, receipts: data.receipts, payments: data.payments, expenses: data.expenses, accountVouchers: vouchers }, { products, shopId, from: fy.from, to: fy.to, bn });
    const pack = packChecks({ tb, sheet, to: fy.to });
    // an earlier year with P&L that was never closed
    const prevEnd = prevDay(fy.from);
    const earlierOpen = prevEnd && closingBalances(before, prevEnd).lines.length > 0 && !yearEnds.some((y) => y.fyEnd === prevEnd && liveIds.has(y.journalId)) ? prevEnd : null;
    const checks = yearEndChecks({ fyEnd: fy.to, today, journal, existing, lockDate: lock.lockDate, earlierOpen, packStatus: packStatus(pack) });
    return { existing, closing, journal, stockBase, stockEnd, yearProfit, tb, sheet, pl, checks, pack };
  }, [data, ledger, fy.from, fy.to, products, shopId, shop, yearEnds, lock.lockDate, today, user?.uid, who, bn]); // eslint-disable-line react-hooks/exhaustive-deps

  const blocked = !view || view.checks.some((c) => !c.ok);

  const sectionsOf = () => {
    const meta = { shopName, trn: shop?.trnNumber || "", from: fy.from, to: fy.to, currency: cur, generatedAt: new Date().toISOString().slice(0, 16).replace("T", " ") };
    const base = packSections({ meta, checks: view.pack, tb: view.tb, pl: view.pl, sheet: view.sheet, stockValue: view.stockEnd }).filter((s) => s.id !== "stock");
    base[0] = { ...base[0], title: "YEAR-END STATEMENTS" };
    base.push({ id: "close", title: `YEAR-END CLOSE ${fy.from} TO ${fy.to}`, cols: ["Account", "Balance (Dr + / Cr -)"], rows: [
      ...view.closing.lines.map((l) => [l.name, money(l.balance)]),
      ["Ledger result (Dr + loss / Cr - profit)", money(view.closing.net)],
      ["Stock at the year end", money(view.stockEnd)], ["Stock the year started from", money(view.stockBase)],
      ["Profit / loss of the year (ledger result + stock change)", money(view.yearProfit)], [`Moved into ${YEAR_END_TARGET} by the closing journal`, money(-view.closing.net)],
    ] });
    return base;
  };
  const print = () => {
    if (!view) return;
    const pages = sectionsOf().map((s) => generateStatementHTML({ shopName, title: s.title, subtitle: `${fmtDay(fy.from)} - ${fmtDay(fy.to)}`, cols: s.cols.map((label, i) => ({ label, align: i > 0 ? "right" : undefined })), rows: s.rows.map((r) => r.map((v) => String(v ?? ""))) }));
    printWithSettings(combinePrintHtml(pages), { lang });
  };
  const exportCsv = async () => {
    if (!view) return;
    try { await saveTextFile(`year-end-${fy.from}-${fy.to}.csv`, csvText(packCsvRows(sectionsOf()))); } catch (e) { toast?.(e.message || String(e), "err"); }
  };

  const close = async () => {
    if (!isOwner || busy || blocked || !view?.journal) return;
    if (view.checks.some((c) => c.warn) && !window.confirm(L("কিছু চেক হলুদ। তবুও বছর বন্ধ করবেন?", "Some checks are amber. Close the year anyway?"))) return;
    if (!window.confirm(L(
      `${fmtDay(fy.to)} তারিখে একটা বন্ধের জার্নাল হবে: সব আয় / খরচের খাত শূন্য হয়ে ফল (${cur} ${money(-view.closing.net)}) "${YEAR_END_TARGET}"-এ যাবে। বছর শেষের স্টক ${cur} ${money(view.stockEnd)} মনে রাখা হবে।${lockToo ? ` তারপর ${fmtDay(fy.to)} পর্যন্ত হিসাব লক হবে।` : ""} চালাবেন?`,
      `A closing journal dated ${fmtDay(fy.to)} empties every income / expense account and moves the result (${cur} ${money(-view.closing.net)}) into "${YEAR_END_TARGET}". The year-end stock of ${cur} ${money(view.stockEnd)} is kept.${lockToo ? ` Then the books are locked up to ${fmtDay(fy.to)}.` : ""} Continue?`))) return;
    setBusy(true);
    try {
      const j = view.journal;
      const cur0 = await offlineGetById("accountVouchers", j.id).catch(() => null);
      if (cur0?.data) await offlineUpdate("accountVouchers", j.id, { ...j.doc, createdAt: cur0.data.createdAt || j.doc.createdAt, cancelledAt: null, cancelledBy: null, cancelReason: null });
      else await offlineUpsert("accountVouchers", j.id, j.doc);
      const record = yearEndRecord({ fyStart: fy.from, fyEnd: fy.to, journalId: j.id, profit: view.yearProfit, stockValue: view.stockEnd, uid: user?.uid || "", by: who });
      const patch = { yearEnds: [...yearEnds.filter((y) => y.fyEnd !== fy.to), record].sort((a, b) => a.fyEnd.localeCompare(b.fyEnd)) };
      if (lockToo && (!lock.lockDate || lock.lockDate < fy.to)) {
        const at = new Date().toISOString();
        const note = `Year-end close ${fy.from} to ${fy.to}`;
        patch.periodLock = { lockDate: fy.to, note, lockedAt: at, lockedBy: user?.uid || "", lockedByName: who, history: [...(Array.isArray(lock.history) ? lock.history.slice(-19) : []), { lockDate: fy.to, at, by: who, note }] };
      }
      const updated = await saveShopRecord(shopId, patch, { ownerUid: user?.uid, profile, user });
      onShopUpdated?.(updated || patch);
      logAudit({ shopId, user, profile, action: "yearEnd", collection: "accountVouchers", docId: j.id, docNo: j.doc.voucherNo, amount: view.yearProfit, note: `${fy.from} to ${fy.to} into ${YEAR_END_TARGET}` });
      toast?.(L("বছর বন্ধ হয়েছে", "Year closed"));
      onSaved?.();
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
    } catch (e) {
      toast?.(e?.message || String(e), "err");
    } finally { setBusy(false); }
  };

  const reopen = async () => {
    if (!isOwner || busy || !view?.existing) return;
    if (lock.lockDate && lock.lockDate >= fy.to) { toast?.(L(`${fmtDay(lock.lockDate)} পর্যন্ত লক - আগে সেটিংস > পিরিয়ড লক থেকে খুলুন`, `Locked up to ${fmtDay(lock.lockDate)} - lift it in Settings > Period lock first`), "err"); return; }
    if (!window.confirm(L("বছর বন্ধ বাতিল করবেন? বন্ধের জার্নাল বাতিল হবে আর আয় / খরচের খাতে আগের ব্যালেন্স ফিরবে।", "Reopen the year? The closing journal is cancelled and the income / expense balances come back."))) return;
    setBusy(true);
    try {
      await offlineUpdate("accountVouchers", view.existing.journalId, { status: "cancelled", cancelledAt: new Date().toISOString(), cancelledBy: user?.uid || "", cancelReason: "Year reopened" });
      const updated = await saveShopRecord(shopId, { yearEnds: yearEnds.filter((y) => y.fyEnd !== fy.to) }, { ownerUid: user?.uid, profile, user });
      onShopUpdated?.(updated || { yearEnds: yearEnds.filter((y) => y.fyEnd !== fy.to) });
      logAudit({ shopId, user, profile, action: "yearReopen", collection: "accountVouchers", docId: view.existing.journalId, docNo: fy.to, note: `${fy.from} to ${fy.to}` });
      toast?.(L("বছর আবার খোলা হয়েছে", "Year reopened"));
      onSaved?.();
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
    } catch (e) { toast?.(e?.message || String(e), "err"); } finally { setBusy(false); }
  };

  const colorOf = (c) => (!c.ok ? "#b91c1c" : c.warn ? "#b45309" : "#15803d");
  return (
    <fieldset className="pm-panel" style={{ margin: 0 }}>
      <legend className="pm-panel-legend">{L("বছর শেষ (Year-end close)", "Year-end close")}</legend>
      <div className="si-panel-body" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <div className="si-pills">
            <button type="button" className={`pm-btn-secondary${offset === -1 ? " is-active" : ""}`} onClick={() => setOffset(-1)}>{L("গত অর্থবছর", "Last financial year")} ({fyRange(settings, -1).label})</button>
            <button type="button" className={`pm-btn-secondary${offset === 0 ? " is-active" : ""}`} onClick={() => setOffset(0)}>{L("এই অর্থবছর", "This financial year")} ({fyRange(settings, 0).label})</button>
          </div>
          <span className="si-muted">{fmtDay(fy.from)} - {fmtDay(fy.to)}</span>
          <span className="si-toolbar-gap" />
          {canPrint && <button type="button" className="pm-btn-secondary" onClick={print} disabled={!view}> {L("বছর শেষের হিসাব প্রিন্ট / PDF", "Print / PDF year-end statements")}</button>}
          {canPrint && <button type="button" className="pm-btn-secondary" onClick={exportCsv} disabled={!view}> Excel</button>}
          {onClose && <button type="button" className="pm-btn-secondary" onClick={onClose}>{L("বন্ধ", "Close")}</button>}
        </div>
        {view && (
          <>
            <div className="si-kpis" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
              <div className="si-kpi"><span>{L("লেজারের ফল (আয় - খরচ)", "Ledger result (income - expenses)")}</span><b>{cur} {money(-view.closing.net)}</b></div>
              <div className="si-kpi"><span>{L("স্টক পরিবর্তন", "Stock change")}</span><b>{cur} {money(view.stockEnd - view.stockBase)}</b></div>
              <div className="si-kpi"><span>{view.yearProfit >= 0 ? L("বছরের লাভ", "Profit of the year") : L("বছরের ক্ষতি", "Loss of the year")}</span><b style={{ color: view.yearProfit >= 0 ? "#15803d" : "#b91c1c" }}>{cur} {money(Math.abs(view.yearProfit))}</b></div>
              <div className="si-kpi"><span>{L("P&L রিপোর্টের নিট লাভ", "P&L report net profit")}</span><b>{cur} {money(view.pl?.netProfit)}</b></div>
            </div>
            {view.checks.map((c) => <div key={c.id} style={{ color: colorOf(c), fontWeight: 700, fontSize: 12.5 }}>{!c.ok ? L("ঠিক নেই", "Not OK") : L("দেখে নিন", "Look")} - {bn ? c.bn : c.en}</div>)}
            {!view.checks.length && <div style={{ color: "#15803d", fontWeight: 700, fontSize: 12.5 }}>{L("বছর বন্ধ করা যায়", "The year can be closed")}</div>}
            {view.closing.lines.length > 0 && (
              <details>
                <summary className="si-muted" style={{ cursor: "pointer" }}>{L(`যে ${view.closing.lines.length}টি খাত শূন্য হবে`, `${view.closing.lines.length} account(s) that will be emptied`)}</summary>
                <table className="pm-table" style={{ maxWidth: 520 }}>
                  <tbody>{view.closing.lines.map((l) => <tr key={l.key}><td>{l.name}</td><td className="si-num">{l.balance > 0 ? `${money(l.balance)} Dr` : `${money(-l.balance)} Cr`}</td></tr>)}</tbody>
                </table>
              </details>
            )}
            {isOwner ? (
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                {view.existing ? (
                  <button type="button" className="pm-btn-secondary" onClick={reopen} disabled={busy}>{L("বছর আবার খুলুন", "Reopen the year")}</button>
                ) : (
                  <>
                    <label style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><input type="checkbox" checked={lockToo} onChange={(e) => setLockToo(e.target.checked)} /> {L(`${fmtDay(fy.to)} পর্যন্ত লকও করুন`, `Also lock up to ${fmtDay(fy.to)}`)}</label>
                    <button type="button" className="pm-btn pm-btn--danger" onClick={close} disabled={busy || blocked}>{L(`${fy.label} বছর বন্ধ করুন`, `Close the year ${fy.label}`)}</button>
                  </>
                )}
              </div>
            ) : <div className="si-muted">{L("বছর বন্ধ করা শুধু মালিক পারেন", "Only the owner can close the year")}</div>}
            <div className="si-note">
              {L(
                `বছর বন্ধ করলে বছর শেষের দিনে একটা জার্নাল হয় (ভাউচার তালিকায় YE-…): সব আয় ও খরচের খাত (আর Profit Distribution) শূন্য হয়ে ফল "${YEAR_END_TARGET}"-এ যায়, তাই নতুন বছর প্রতিটি আয় / খরচের খাত ০ থেকে শুরু হয়। স্টক লেজারের খাত নয়, তাই বছর শেষের স্টক মনে রাখা হয়: ব্যালেন্স শিটে বন্ধ বছরগুলোর স্টক বৃদ্ধি আলাদা লাইনে আসে আর পরের লাভ সেই স্টক থেকে ধরা হয় - মোট অঙ্ক বদলায় না। P&L রিপোর্ট বন্ধের জার্নাল ধরে না। ট্রায়াল ব্যালেন্সে "বন্ধের আগের হিসাব" টিক দিয়ে বছরের খাতগুলো দেখা যায়। পার্টনার থাকলে আগে পার্টনার পেজে লাভ ভাগ করুন। লক না থাকলে বছর আবার খোলা যায়।`,
                `Closing posts one journal on the year-end day (YE-… in the voucher list): every income and expense account (and Profit Distribution) is emptied and the result goes into "${YEAR_END_TARGET}", so the new year starts with each income / expense account at 0. Stock is not a ledger account, so the year-end stock is kept: the Balance Sheet shows the stock gain of the closed years on its own line and counts later profit from that stock - totals do not change. The P&L report leaves the closing journal out. In the trial balance, tick "before year-end closing" to see the year's accounts. With partners, share the profit on the Partners page first. While not locked, the year can be reopened.`
              )}
            </div>
          </>
        )}
      </div>
    </fieldset>
  );
}

function prevDay(day) {
  if (!day) return "";
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
