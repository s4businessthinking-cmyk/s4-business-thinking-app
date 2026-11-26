// Forex panel, customer side: sales bills in a foreign currency, the exchange difference when the customer paid at
// another rate (reports/salesForex.js), and the owner's optional rate service for the sales form (fxRates.js).
import React, { useMemo, useState } from "react";
import { offlineGetById, offlineUpdate, offlineUpsert } from "../offline/offlineRepository";
import { saveShopRecord } from "../offline/shopService";
import { logAudit } from "../utils/auditLog.js";
import { cancelSalesFxPatch, salesFxPosition, salesRealisedJournal } from "./salesForex.js";
import { rateApiOf } from "./fxRates.js";
import DateField from "../components/DateField.jsx";

const money = (v) => (Math.round((Number(v) || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const ERR = {
  fc: ["বিদেশি মুদ্রায় কত পাওয়া গেছে দিন", "Enter the amount received in the bill's currency"], fcMax: ["বিলের যতটুকু বাকি তার বেশি", "More than the part of the bill not yet settled"],
  rate: ["রেট বা পাওয়া টাকা দিন", "Enter the rate or the shop-currency amount received"], date: ["তারিখ দিন", "Pick the date"],
  same: ["বিলের রেটের সমান - কোনো পার্থক্য নেই", "Same as the bill rate - no difference"], short: ["ক্ষতি বিলের বাকি টাকার চেয়ে বেশি - আগে রসিদ দিন", "The loss is more than the bill's open balance - enter the receipt first"],
};

export default function SalesForexSection({ lang = "en", shopId, shop, user, profile, isOwner = false, data, customers = [], base = "AED", today, lockDate = "", toast, onSaved, onShopUpdated }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const who = profile?.personName || profile?.username || user?.email || "";
  const vouchers = data?.accountVouchers || [];
  const position = useMemo(() => salesFxPosition({ salesInvoices: data?.salesInvoices || [], vouchers, customers, shopId, baseCurrency: base }), [data, vouchers, customers, shopId, base]);
  const [settle, setSettle] = useState(null);
  const [busy, setBusy] = useState(false);
  const [api, setApi] = useState(null);

  const bill = settle ? position.find((b) => b.id === settle.id) : null;
  const inv = bill ? (data?.salesInvoices || []).find((x) => x.id === bill.id) : null;
  const seq = bill ? vouchers.filter((v) => v.source === "forex" && String(v.fxKind || "").toLowerCase() === "realisedsale" && v.billId === bill.id).length + 1 : 1;
  const res = bill ? salesRealisedJournal({ bill, inv, fcAmount: settle.fc, rate: settle.mode === "rate" ? settle.value : "", aedReceived: settle.mode === "aed" ? settle.value : "", date: settle.date, shopId, uid: user?.uid || "", by: who, seq }) : null;
  const known = new Set((customers || []).filter((c) => c && !c.isDeleted && c.customerName).map((c) => c.customerName.trim().toLowerCase()));
  const blockers = bill ? [
    ...(res?.error ? [{ id: res.error, text: L(ERR[res.error][0], ERR[res.error][1]) }] : []),
    ...(settle.date && today && settle.date > today ? [{ id: "future", text: L("তারিখ ভবিষ্যতে", "The date is in the future") }] : []),
    ...(lockDate && settle.date && settle.date <= lockDate ? [{ id: "locked", text: L(`${fmtDay(lockDate)} পর্যন্ত হিসাব লক`, `The books are locked up to ${fmtDay(lockDate)}`) }] : []),
    ...(!known.has(String(bill.customerName || "").trim().toLowerCase()) ? [{ id: "party", text: L("কাস্টমার মাস্টারে নেই", "The customer is not on the customer master") }] : []),
  ] : [];

  const post = async () => {
    if (!isOwner || busy || !res || res.error || blockers.length) return;
    if (!window.confirm(L(`${bill.no}: ${res.kind === "gain" ? "লাভ" : "ক্ষতি"} ${base} ${money(Math.abs(res.amount))} লেখা হবে। চালাবেন?`,
      `${bill.no}: record an exchange ${res.kind} of ${base} ${money(Math.abs(res.amount))}?`))) return;
    setBusy(true);
    try {
      const prev = await offlineGetById("accountVouchers", res.id).catch(() => null);
      if (prev?.data) await offlineUpdate("accountVouchers", res.id, { ...res.doc, createdAt: prev.data.createdAt || res.doc.createdAt });
      else await offlineUpsert("accountVouchers", res.id, res.doc);
      if (res.invoicePatch) await offlineUpdate("salesInvoices", bill.id, { ...res.invoicePatch, updatedAt: new Date().toISOString(), updatedBy: user?.uid || "" });
      logAudit({ shopId, user, profile, action: "create", collection: "accountVouchers", docId: res.id, docNo: res.doc.voucherNo, amount: res.amount, note: `Exchange ${res.kind} ${bill.no}` });
      toast?.(L("বিনিময় পার্থক্য লেখা হয়েছে", "Exchange difference recorded"));
      setSettle(null);
      onSaved?.();
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
    } catch (e) { toast?.(e?.message || String(e), "err"); } finally { setBusy(false); }
  };
  const cancel = async (v) => {
    if (!isOwner || busy) return;
    if (lockDate && v.voucherDate <= lockDate) { toast?.(L(`${fmtDay(lockDate)} পর্যন্ত লক`, `Locked up to ${fmtDay(lockDate)}`), "err"); return; }
    if (!window.confirm(L(`${v.voucherNo} বাতিল করবেন?`, `Cancel ${v.voucherNo}?`))) return;
    setBusy(true);
    try {
      await offlineUpdate("accountVouchers", v.id, { status: "cancelled", cancelledAt: new Date().toISOString(), cancelledBy: user?.uid || "", cancelReason: "Exchange difference cancelled" });
      const target = (data?.salesInvoices || []).find((x) => x.id === v.billId);
      const patch = cancelSalesFxPatch(target, v);
      if (patch) await offlineUpdate("salesInvoices", target.id, { ...patch, updatedAt: new Date().toISOString(), updatedBy: user?.uid || "" });
      logAudit({ shopId, user, profile, action: "cancel", collection: "accountVouchers", docId: v.id, docNo: v.voucherNo, amount: v.totalAmount, note: "Exchange difference on a sales bill" });
      toast?.(L("বাতিল হয়েছে", "Cancelled"));
      onSaved?.();
    } catch (e) { toast?.(e?.message || String(e), "err"); } finally { setBusy(false); }
  };
  const saveApi = async () => {
    if (!isOwner || !api || busy) return;
    const url = String(api.url || "").trim();
    if (url && !/^https:\/\//i.test(url)) { toast?.(L("শুধু https:// ঠিকানা", "Only an https:// address"), "err"); return; }
    setBusy(true);
    try {
      const updated = await saveShopRecord(shopId, { fxRateApi: { url, token: String(api.token || "").trim() } }, { ownerUid: user?.uid || shop?.ownerUid });
      onShopUpdated?.(updated);
      logAudit({ shopId, user, profile, action: "edit", collection: "shops", docId: shopId, docNo: "Exchange rate service", note: url ? "Rate service set" : "Rate service removed" });
      toast?.(L("সেভ হয়েছে", "Saved"));
      setApi(null);
    } catch (e) { toast?.(e?.message || String(e), "err"); } finally { setBusy(false); }
  };
  const posted = vouchers.filter((v) => v && !v.isDeleted && v.status !== "cancelled" && v.source === "forex" && String(v.fxKind || "").toLowerCase() === "realisedsale");
  const colorOf = (v) => (v > 0 ? "#15803d" : v < 0 ? "#b91c1c" : undefined);
  const saved = rateApiOf(shop);

  return (
    <details open={position.length > 0}>
      <summary style={{ cursor: "pointer", fontWeight: 700 }}>{L(`কাস্টমারের বিদেশি মুদ্রার বিল (${position.length})`, `Customer bills in a foreign currency (${position.length})`)}</summary>
      {!position.length ? <div className="si-empty">{L("বিদেশি মুদ্রার কোনো বিক্রির বিল নেই", "No sales bill in a foreign currency")}</div> : (
        <div style={{ overflow: "auto" }}>
          <table className="pm-table" style={{ minWidth: 860 }}>
            <thead><tr>
              <th>{L("বিল", "Bill")}</th><th>{L("কাস্টমার", "Customer")}</th><th className="si-num">{L("বিলের রেট", "Bill rate")}</th><th className="si-num">{L("বিল (বিদেশি)", "Bill (FC)")}</th>
              <th className="si-num">{L(`বিল (${base})`, `Bill (${base})`)}</th><th className="si-num">{L(`বাকি (${base})`, `Open (${base})`)}</th><th className="si-num">{L("লাভ / ক্ষতি", "Gain / loss")}</th><th />
            </tr></thead>
            <tbody>{position.map((b) => (
              <tr key={b.id}>
                <td>{b.no} <span className="si-muted">({b.currency}) {fmtDay(b.date)}</span></td><td>{b.customerName}</td><td className="si-num">{b.billRate}</td>
                <td className="si-num">{money(b.fc)}</td><td className="si-num">{money(b.grandTotal)}</td><td className="si-num">{money(b.bookOpen)}</td>
                <td className="si-num" style={{ color: colorOf(b.realised) }}>{b.realised ? money(b.realised) : ""}</td>
                <td>{isOwner && b.fcToSettle > 0.004 && <button type="button" className="pm-btn-secondary" onClick={() => setSettle({ id: b.id, fc: String(b.fcToSettle), mode: "rate", value: "", date: today })}>{L("পার্থক্য লিখুন", "Record difference")}</button>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {bill && (
        <div className="pm-panel" style={{ padding: 8, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "end" }}>
          <strong style={{ alignSelf: "center" }}>{bill.no} · {bill.customerName} · {bill.currency} @ {bill.billRate}</strong>
          <label>{L(`পাওয়া গেছে (${bill.currency})`, `Received (${bill.currency})`)}<input className="pm-input" inputMode="decimal" value={settle.fc} onChange={(e) => setSettle((s) => ({ ...s, fc: e.target.value }))} /></label>
          <label>
            <select className="pm-input" value={settle.mode} onChange={(e) => setSettle((s) => ({ ...s, mode: e.target.value, value: "" }))}>
              <option value="rate">{L(`আসল রেট (${bill.currency} → ${base})`, `Actual rate (${bill.currency} to ${base})`)}</option>
              <option value="aed">{L(`পাওয়া টাকা (${base})`, `Amount received (${base})`)}</option>
            </select>
            <input className="pm-input" inputMode="decimal" value={settle.value} onChange={(e) => setSettle((s) => ({ ...s, value: e.target.value }))} />
          </label>
          <label>{L("তারিখ (টাকা পাওয়ার দিন)", "Date (day received)")}<DateField className="pm-input" max={today} value={settle.date} onChange={(e) => setSettle((s) => ({ ...s, date: e.target.value }))} /></label>
          {res && !res.error && <span style={{ alignSelf: "center", color: colorOf(res.amount), fontWeight: 700 }}>{res.kind === "gain" ? L("লাভ", "Gain") : L("ক্ষতি", "Loss")} {base} {money(Math.abs(res.amount))}</span>}
          <button type="button" className="pm-btn pm-btn--primary" onClick={post} disabled={busy || blockers.length > 0}>{L("লিখুন", "Record")}</button>
          <button type="button" className="pm-btn-secondary" onClick={() => setSettle(null)}>{L("বাতিল", "Cancel")}</button>
          {blockers.map((b) => <div key={b.id} style={{ color: "#b91c1c", width: "100%", fontSize: 12.5 }}>{b.text}</div>)}
        </div>
      )}
      {posted.length > 0 && (
        <div className="si-muted" style={{ fontSize: 12, marginTop: 4 }}>
          {posted.map((v) => (
            <div key={v.id}>{v.voucherNo} · {fmtDay(v.voucherDate)} · {base} {money(v.totalAmount)}{isOwner && <> {" "}<button type="button" className="pm-btn-secondary" style={{ height: 20, padding: "0 6px" }} onClick={() => cancel(v)} disabled={busy}>{L("বাতিল", "Cancel")}</button></>}</div>
          ))}
        </div>
      )}
      {isOwner && (
        <div style={{ marginTop: 6 }}>
          {!api ? (
            <button type="button" className="pm-btn-secondary" onClick={() => setApi({ ...saved })}>{saved.url ? L("রেট সার্ভিস বদলান", "Change rate service") : L("রেট সার্ভিস যোগ করুন (ঐচ্ছিক)", "Add a rate service (optional)")}</button>
          ) : (
            <div className="pm-panel" style={{ padding: 8, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "end" }}>
              <label style={{ flex: "1 1 320px" }}>{L("রেট সার্ভিসের ঠিকানা (https, {from} {to} {token} বসানো যায়)", "Rate service address (https; may use {from} {to} {token})")}
                <input className="pm-input" value={api.url} onChange={(e) => setApi((a) => ({ ...a, url: e.target.value }))} placeholder="https://v6.exchangerate-api.com/v6/{token}/pair/{from}/{to}" /></label>
              <label>{L("টোকেন / কী", "Token / key")}<input className="pm-input" type="password" value={api.token} onChange={(e) => setApi((a) => ({ ...a, token: e.target.value }))} /></label>
              <button type="button" className="pm-btn pm-btn--primary" onClick={saveApi} disabled={busy}>{L("সেভ", "Save")}</button>
              <button type="button" className="pm-btn-secondary" onClick={() => setApi(null)}>{L("বাতিল", "Cancel")}</button>
              <div className="si-muted" style={{ width: "100%", fontSize: 12 }}>{L("দোকানের সব সদস্য এই টোকেন দেখতে পারে। ফাঁকা রাখলে বিক্রির বিলে রেট হাতে দিতে হবে।", "Every member of the shop can read this token. Leave it empty to type rates by hand on sales bills.")}</div>
            </div>
          )}
        </div>
      )}
      <div className="si-note">
        {L(
          `বিদেশি মুদ্রার বিক্রির বিল বিলের রেটে ${base}-এ বুক হয়। কাস্টমার অন্য রেটে দিলে রসিদে যত ${base} পাওয়া গেছে তা লিখুন, তারপর এখানে "পার্থক্য লিখুন": বেশি পেলে লাভ (কাস্টমারের অতিরিক্ত টাকা মেলে), কম পেলে ক্ষতি (বিলের বাকি বন্ধ হয়, টাকা হিসেবে ধরা হয় না)। পার্থক্য = বিদেশি পরিমাণ × (আসল রেট − বিলের রেট)।`,
          `A sales bill in a foreign currency is booked in ${base} at the bill's rate. When the customer pays at another rate, enter the ${base} actually received on the receipt, then "Record difference" here: more received is a gain (it clears the extra left on the customer), less received is a loss (it closes the bill's open balance and is not counted as money). Difference = foreign amount x (actual rate - bill rate).`
        )}
      </div>
    </details>
  );
}
