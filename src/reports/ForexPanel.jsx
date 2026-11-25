// Forex panel (inside the Trial Balance hub): supplier bills in a foreign currency with what is still owed in that
// currency, month-end revaluation at closing rates, and the exchange difference when a bill was paid at another rate.
// Postings are forex journals (accountVouchers, source "forex"); owner only. Rules in forex.js.
import React, { useMemo, useState } from "react";
import { offlineGetById, offlineUpdate, offlineUpsert } from "../offline/offlineRepository";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { saveTextFile } from "../utils/saveTextFile.js";
import { logAudit } from "../utils/auditLog.js";
import { activePeriodLock } from "../accounts/periodLock.js";
import { csvText } from "./vatExport.js";
import { FX_COLS, fxBlockers, fxCsvRows, fxPosition, liveFx, openCurrencies, realisedJournal, revalJournalId, revaluationJournal, revaluationLines } from "./forex.js";

const n = (v) => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
const money = (v) => (Math.round((n(v) + Number.EPSILON) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const lastMonthEnd = () => { const d = new Date(); d.setDate(0); return localDay(d); };
const SET_ERR = {
  fc: ["পরিমাণ দিন", "Enter the amount"], fcMax: ["যত টাকা পরিশোধ হয়েছে তার বেশি হতে পারে না", "More than the paid part of the bill"],
  rate: ["রেট দিন", "Enter the rate"], date: ["তারিখ দিন", "Pick the date"], same: ["বিলের রেটের সমান - কোনো পার্থক্য নেই", "Same as the bill rate - no difference"],
};

export default function ForexPanel({ lang = "en", shopId, shop, user, profile, isOwner = false, canPrint = false, data, vendors = [], shopName = "", toast, onSaved, onClose }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const base = String(shop?.currency || "AED").trim().toUpperCase();
  const today = localDay();
  const lockDate = activePeriodLock();
  const who = profile?.personName || profile?.username || user?.email || "";
  const vouchers = data?.accountVouchers || [];
  const [day, setDay] = useState(lastMonthEnd);
  const [rates, setRates] = useState({});
  const [settle, setSettle] = useState(null);
  const [busy, setBusy] = useState(false);

  const existing = vouchers.find((v) => v.id === revalJournalId(day) && liveFx(v, shopId)) || null;
  const position = useMemo(() => fxPosition({ purchaseInvoices: data?.purchaseInvoices, payments: data?.payments, purchaseReturns: data?.purchaseReturns, vouchers, vendors, shopId, baseCurrency: base, asOf: day, skipId: existing?.id || "" }),
    [data, vouchers, vendors, shopId, base, day, existing?.id]);
  const now = useMemo(() => fxPosition({ purchaseInvoices: data?.purchaseInvoices, payments: data?.payments, purchaseReturns: data?.purchaseReturns, vouchers, vendors, shopId, baseCurrency: base }),
    [data, vouchers, vendors, shopId, base]);
  const currencies = openCurrencies(position);
  // last closing rate used for each currency, as a starting point
  const lastRates = useMemo(() => {
    const out = {};
    vouchers.filter((v) => liveFx(v, shopId) && v.fxKind === "reval" && v.voucherDate <= day).sort((a, b) => a.voucherDate.localeCompare(b.voucherDate)).forEach((v) => Object.assign(out, v.rates || {}));
    return out;
  }, [vouchers, shopId, day]);
  const rateOf = (c) => (rates[c] != null ? rates[c] : lastRates[c] != null ? String(lastRates[c]) : "");
  const usedRates = Object.fromEntries(currencies.map((c) => [c, n(rateOf(c))]));
  const lines = revaluationLines(position, usedRates);
  const missingRate = currencies.filter((c) => !(usedRates[c] > 0));
  const journal = !existing && !missingRate.length ? revaluationJournal({ position, rates: usedRates, day, shopId, uid: user?.uid || "", by: who }) : null;
  const blockers = [
    ...fxBlockers({ day, today, lockDate, rows: lines.map((x) => x.bill), vendors }),
    ...(!existing && vouchers.some((v) => liveFx(v, shopId) && v.fxKind === "reval" && v.voucherDate > day) ? [{ id: "later", en: "A later revaluation exists - revalue in date order", bn: "এর পরের তারিখের পুনর্মূল্যায়ন আছে - তারিখের ক্রমে দিন" }] : []),
    ...(existing ? [{ id: "done", en: `Revaluation for ${day} is already posted (${existing.voucherNo})`, bn: `${day}-এর পুনর্মূল্যায়ন আগেই দেওয়া (${existing.voucherNo})` }] : []),
    ...(missingRate.length ? [{ id: "rate", en: `Enter the closing rate for ${missingRate.join(", ")}`, bn: `${missingRate.join(", ")}-এর মাস শেষের রেট দিন` }] : []),
    ...(!existing && !missingRate.length && !journal ? [{ id: "nothing", en: "Nothing to revalue", bn: "পুনর্মূল্যায়নের কিছু নেই" }] : []),
  ];
  const change = r2sum(lines.map((x) => x.change || 0));
  const run = async (fn) => { if (busy) return; setBusy(true); try { await fn(); } catch (e) { toast?.(e?.message || String(e), "err"); } finally { setBusy(false); } };
  const upsert = async (id, doc) => {
    const prev = await offlineGetById("accountVouchers", id).catch(() => null);
    if (prev?.data) await offlineUpdate("accountVouchers", id, { ...doc, createdAt: prev.data.createdAt || doc.createdAt, cancelledAt: null, cancelledBy: null, cancelReason: null });
    else await offlineUpsert("accountVouchers", id, doc);
  };
  const synced = (msg) => { toast?.(msg); onSaved?.(); if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {}); };

  const postReval = () => run(async () => {
    if (!journal || blockers.length) return;
    if (!window.confirm(L(`${fmtDay(day)} তারিখে পুনর্মূল্যায়ন জার্নাল: ${change >= 0 ? "ক্ষতি" : "লাভ"} ${base} ${money(Math.abs(change))}। চালাবেন?`,
      `Post the revaluation journal on ${fmtDay(day)}: ${change >= 0 ? "loss" : "gain"} ${base} ${money(Math.abs(change))}?`))) return;
    await upsert(journal.id, journal.doc);
    logAudit({ shopId, user, profile, action: "create", collection: "accountVouchers", docId: journal.id, docNo: journal.doc.voucherNo, amount: change, note: "Forex revaluation" });
    synced(L("পুনর্মূল্যায়ন দেওয়া হয়েছে", "Revaluation posted"));
  });
  const cancelReval = () => run(async () => {
    if (!existing) return;
    if (lockDate && existing.voucherDate <= lockDate) { toast?.(L(`${fmtDay(lockDate)} পর্যন্ত লক`, `Locked up to ${fmtDay(lockDate)}`), "err"); return; }
    const later = vouchers.some((v) => liveFx(v, shopId) && v.fxKind === "reval" && v.voucherDate > existing.voucherDate);
    if (later) { toast?.(L("এর পরের পুনর্মূল্যায়ন আছে - আগে সেটা বাতিল করুন", "A later revaluation exists - cancel that first"), "err"); return; }
    if (!window.confirm(L(`${existing.voucherNo} বাতিল করবেন?`, `Cancel ${existing.voucherNo}?`))) return;
    await offlineUpdate("accountVouchers", existing.id, { status: "cancelled", cancelledAt: new Date().toISOString(), cancelledBy: user?.uid || "", cancelReason: "Forex revaluation cancelled" });
    logAudit({ shopId, user, profile, action: "cancel", collection: "accountVouchers", docId: existing.id, docNo: existing.voucherNo, amount: existing.totalAmount, note: "Forex revaluation" });
    synced(L("বাতিল হয়েছে", "Cancelled"));
  });

  const settleBill = settle ? now.find((b) => b.id === settle.id) : null;
  const settleRes = settleBill ? realisedJournal({ bill: settleBill, fcAmount: settle.fc, rate: settle.rate, date: settle.date, shopId, uid: user?.uid || "", by: who,
    seq: vouchers.filter((v) => v.source === "forex" && v.fxKind === "realised" && v.billId === settleBill.id).length + 1 }) : null;
  const settleBlk = settleBill ? [...(settleRes?.error ? [{ id: settleRes.error, en: SET_ERR[settleRes.error][1], bn: SET_ERR[settleRes.error][0] }] : []), ...fxBlockers({ day: settle.date, today, lockDate, rows: [settleBill], vendors })] : [];
  const postSettle = () => run(async () => {
    if (!settleRes || settleRes.error || settleBlk.length) return;
    if (!window.confirm(L(`${settleBill.no}: ${settleRes.amount > 0 ? "ক্ষতি" : "লাভ"} ${base} ${money(Math.abs(settleRes.amount))} লেখা হবে। চালাবেন?`,
      `${settleBill.no}: record a ${settleRes.amount > 0 ? "loss" : "gain"} of ${base} ${money(Math.abs(settleRes.amount))}?`))) return;
    await upsert(settleRes.id, settleRes.doc);
    logAudit({ shopId, user, profile, action: "create", collection: "accountVouchers", docId: settleRes.id, docNo: settleRes.doc.voucherNo, amount: settleRes.amount, note: `Exchange difference ${settleBill.no}` });
    setSettle(null);
    synced(L("বিনিময় পার্থক্য লেখা হয়েছে", "Exchange difference recorded"));
  });

  const print = () => {
    const body = fxCsvRows(position, usedRates);
    printWithSettings(generateStatementHTML({
      shopName, title: "FOREIGN CURRENCY BILLS", subtitle: `As at ${fmtDay(day)} · ${Object.entries(usedRates).filter(([, r]) => r > 0).map(([c, r]) => `${c} ${r}`).join(", ")}`,
      cols: FX_COLS(base).map((label, i) => ({ label, align: i >= 5 ? "right" : undefined })), rows: body,
      foot: ["TOTAL", "", "", "", "", "", "", "", money(position.reduce((t, b) => t + b.bookOpen, 0)), money(position.reduce((t, b) => t + b.reval, 0)), "", money(change)],
    }), { lang });
  };
  const exportCsv = async () => { try { await saveTextFile(`forex-${day}.csv`, csvText([[`Foreign currency bills as at ${day}`], FX_COLS(base), ...fxCsvRows(position, usedRates)])); } catch (e) { toast?.(e?.message || String(e), "err"); } };

  const paidAtOtherRate = now.filter((b) => b.unrealisedFc > 0.004);
  const colorOf = (v) => (v > 0 ? "#b91c1c" : v < 0 ? "#15803d" : undefined);

  return (
    <fieldset className="pm-panel" style={{ margin: 0 }}>
      <legend className="pm-panel-legend">{L("বিদেশি মুদ্রা (Forex)", "Foreign currency (Forex)")}</legend>
      <div className="si-panel-body" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span className="si-muted">{L("পুনর্মূল্যায়নের তারিখ", "Revaluation date")}</span>
          <input type="date" className="pm-input" style={{ width: 140 }} max={today} value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
          {currencies.map((c) => (
            <label key={c} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>{c} → {base}
              <input className="pm-input" style={{ width: 90, textAlign: "right" }} inputMode="decimal" value={rateOf(c)} onChange={(e) => setRates((r) => ({ ...r, [c]: e.target.value }))} disabled={!!existing} />
            </label>
          ))}
          <span className="si-toolbar-gap" />
          {canPrint && <button type="button" className="pm-btn-secondary" onClick={print} disabled={!position.length}>{L("প্রিন্ট / PDF", "Print / PDF")}</button>}
          {canPrint && <button type="button" className="pm-btn-secondary" onClick={exportCsv} disabled={!position.length}>Excel</button>}
          {onClose && <button type="button" className="pm-btn-secondary" onClick={onClose}>{L("বন্ধ", "Close")}</button>}
        </div>

        {!position.length ? <div className="si-empty">{L("এই তারিখ পর্যন্ত বিদেশি মুদ্রার কোনো সাপ্লায়ার বিল নেই (পারচেজ ইনভয়েসে মুদ্রা আর রেট দিলে এখানে আসে)", "No supplier bills in a foreign currency up to this date (a purchase invoice with a currency and rate shows here)")}</div> : (
          <div style={{ overflow: "auto" }}>
            <table className="pm-table" style={{ minWidth: 980 }}>
              <thead><tr>
                <th>{L("বিল", "Bill")}</th><th>{L("সাপ্লায়ার", "Supplier")}</th><th>{L("মুদ্রা", "Currency")}</th><th className="si-num">{L("বিলের রেট", "Bill rate")}</th>
                <th className="si-num">{L("বিল (বিদেশি)", "Bill (FC)")}</th><th className="si-num">{L("বাকি (বিদেশি)", "Open (FC)")}</th><th className="si-num">{L(`বাকি (${base}, বিলের রেটে)`, `Open (${base}, bill rate)`)}</th>
                <th className="si-num">{L("আগের পুনর্মূল্যায়ন", "Revalued so far")}</th><th className="si-num">{L("এখন পরিবর্তন", "Change now")}</th>
              </tr></thead>
              <tbody>{position.map((b) => {
                const x = lines.find((l) => l.bill.id === b.id);
                return (
                  <tr key={b.id}>
                    <td>{b.no}{b.supplierNo ? <span style={{ color: "#64748b" }}> · {b.supplierNo}</span> : null}<div style={{ color: "#64748b", fontSize: 11.5 }}>{fmtDay(b.date)}</div></td>
                    <td>{b.vendorName}</td><td>{b.currency}</td><td className="si-num">{b.billRate}</td>
                    <td className="si-num">{money(b.fc)}</td><td className="si-num si-strong">{money(b.fcOpen)}</td><td className="si-num">{money(b.bookOpen)}</td>
                    <td className="si-num" style={{ color: colorOf(b.reval) }}>{b.reval ? money(b.reval) : ""}</td>
                    <td className="si-num si-strong" style={{ color: colorOf(x?.change) }}>{x && x.change != null ? money(x.change) : ""}</td>
                  </tr>
                );
              })}</tbody>
              <tfoot><tr className="si-strong"><td colSpan={6}>{L("মোট", "Total")}</td><td className="si-num">{money(position.reduce((t, b) => t + b.bookOpen, 0))}</td><td className="si-num">{money(position.reduce((t, b) => t + b.reval, 0))}</td><td className="si-num" style={{ color: colorOf(change) }}>{money(change)}</td></tr></tfoot>
            </table>
          </div>
        )}

        {position.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {isOwner && !existing && <button type="button" className="pm-btn pm-btn--primary" onClick={postReval} disabled={busy || blockers.length > 0}>{L("পুনর্মূল্যায়ন দিন", "Post revaluation")}</button>}
            {isOwner && existing && <button type="button" className="pm-btn-secondary" onClick={cancelReval} disabled={busy}>{L(`${existing.voucherNo} বাতিল`, `Cancel ${existing.voucherNo}`)}</button>}
            {blockers.map((b) => <span key={b.id} style={{ color: b.id === "done" ? "#15803d" : "#b45309", fontSize: 12.5 }}>{bn ? b.bn : b.en}</span>)}
          </div>
        )}

        {paidAtOtherRate.length > 0 && (
          <details>
            <summary style={{ cursor: "pointer", fontWeight: 700 }}>{L("অন্য রেটে পরিশোধ (বিনিময় পার্থক্য)", "Paid at another rate (exchange difference)")}</summary>
            <table className="pm-table" style={{ maxWidth: 820 }}>
              <thead><tr><th>{L("বিল", "Bill")}</th><th>{L("সাপ্লায়ার", "Supplier")}</th><th className="si-num">{L("পরিশোধ (বিদেশি)", "Paid (FC)")}</th><th className="si-num">{L("পার্থক্য লেখা বাকি", "Not yet matched")}</th><th className="si-num">{L("আগে লেখা", "Recorded")}</th><th /></tr></thead>
              <tbody>{paidAtOtherRate.map((b) => (
                <tr key={b.id}>
                  <td>{b.no} ({b.currency} @ {b.billRate})</td><td>{b.vendorName}</td><td className="si-num">{money(b.fcSettled)}</td><td className="si-num">{money(b.unrealisedFc)}</td>
                  <td className="si-num" style={{ color: colorOf(b.realised) }}>{b.realised ? money(b.realised) : ""}</td>
                  <td>{isOwner && <button type="button" className="pm-btn-secondary" onClick={() => setSettle({ id: b.id, fc: String(b.unrealisedFc), rate: "", date: today })}>{L("পার্থক্য লিখুন", "Record difference")}</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          </details>
        )}
        {settleBill && (
          <div className="pm-panel" style={{ padding: 8, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "end" }}>
            <strong style={{ alignSelf: "center" }}>{settleBill.no} · {settleBill.vendorName}</strong>
            <label>{L(`পরিশোধ (${settleBill.currency})`, `Paid (${settleBill.currency})`)}<input className="pm-input" inputMode="decimal" value={settle.fc} onChange={(e) => setSettle((s) => ({ ...s, fc: e.target.value }))} /></label>
            <label>{L(`আসল রেট (${settleBill.currency} → ${base})`, `Actual rate (${settleBill.currency} to ${base})`)}<input className="pm-input" inputMode="decimal" value={settle.rate} onChange={(e) => setSettle((s) => ({ ...s, rate: e.target.value }))} /></label>
            <label>{L("তারিখ (পরিশোধের দিন)", "Date (day paid)")}<input type="date" className="pm-input" max={today} value={settle.date} onChange={(e) => setSettle((s) => ({ ...s, date: e.target.value }))} /></label>
            {settleRes && !settleRes.error && <span style={{ alignSelf: "center", color: colorOf(settleRes.amount), fontWeight: 700 }}>{settleRes.amount > 0 ? L("ক্ষতি", "Loss") : L("লাভ", "Gain")} {base} {money(Math.abs(settleRes.amount))}</span>}
            <button type="button" className="pm-btn pm-btn--primary" onClick={postSettle} disabled={busy || settleBlk.length > 0}>{L("লিখুন", "Record")}</button>
            <button type="button" className="pm-btn-secondary" onClick={() => setSettle(null)}>{L("বাতিল", "Cancel")}</button>
            {settleBlk.map((b) => <div key={b.id} style={{ color: "#b91c1c", width: "100%", fontSize: 12.5 }}>{bn ? b.bn : b.en}</div>)}
          </div>
        )}
        {!isOwner && <div className="si-muted">{L("পুনর্মূল্যায়ন আর বিনিময় পার্থক্য শুধু মালিক লিখতে পারেন", "Only the owner can post a revaluation or an exchange difference")}</div>}
        <div className="si-note">
          {L(
            `বিদেশি মুদ্রার বিল (পারচেজ ইনভয়েসে মুদ্রা আর রেট) বিলের রেটে ${base}-এ বুক হয়। মাস শেষে মাস শেষের রেট দিয়ে "পুনর্মূল্যায়ন দিন" চাপলে বাকি অংশের পার্থক্য (বাকি বিদেশি × (মাস শেষের রেট - বিলের রেট)) একটা জার্নালে (FX-তারিখ) Exchange Loss / Exchange Gain আর সাপ্লায়ারের খাতে যায়; পরের মাসে শুধু পরিবর্তনটুকু যায়, বিল শোধ হলে পার্থক্য নিজে থেকে শূন্যে ফেরে। বিল অন্য রেটে শোধ করলে (যেমন ব্যাংক ${base} বেশি কাটল) পেমেন্টে আসল ${base} লিখুন, বিলে বিলের রেটের টাকা allocate করুন, তারপর এখানে "পার্থক্য লিখুন" দিয়ে আসল রেট দিন - সাপ্লায়ারের বাড়তি / কম টাকা মিলে যায়।`,
            `A bill in a foreign currency (a purchase invoice with a currency and rate) is booked in ${base} at the bill's rate. At month end, enter the closing rate and "Post revaluation": the difference on the open part (open FC x (closing rate - bill rate)) goes in one journal (FX-date) to Exchange Loss / Exchange Gain and the supplier; the next month posts only the change, and once the bill is paid the difference winds back to zero by itself. When a bill is paid at another rate (the bank took more or less ${base}), record the payment for the real ${base}, allocate the bill-rate amount to the bill, then "Record difference" here with the actual rate - the extra or short amount on the supplier is cleared.`,
          )}
        </div>
      </div>
    </fieldset>
  );
}

function r2sum(list) { return Math.round(list.reduce((t, v) => t + (Number(v) || 0), 0) * 100) / 100; }
