// Stock Hub tab: batches in stock that are expired or expire within the shop's window, with print / Excel, and the
// owner's expiry settings (window in days, block selling expired batches). Shown only when a batch has an expiry date.
// Rules in batchExpiry.js.
import React, { useMemo, useState } from "react";
import { saveShopRecord } from "../offline/shopService";
import { logAudit } from "../utils/auditLog.js";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { saveTextFile } from "../utils/saveTextFile.js";
import { csvText } from "../reports/vatExport.js";
import { batchExpirySettingsOf, expiringBatches, expiryRows } from "./batchExpiry.js";

const money = (v) => (Math.round((Number(v) || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");

export default function BatchExpiryPanel({ lang = "en", shopId, shop = null, user = null, profile = null, isOwner = false, canPrint = false, canSeeCost = false, products = [], batchMap, day, cur = "AED", toast, shopName = "", onShopUpdated, filterIds = null }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const settings = batchExpirySettingsOf(shop);
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => expiringBatches(batchMap, products, day, settings.soonDays).filter((r) => !filterIds || filterIds.has(r.productId)), [batchMap, products, day, settings.soonDays, filterIds]);
  const expired = rows.filter((r) => r.state === "expired");
  const soon = rows.filter((r) => r.state === "soon");

  const print = () => {
    const t = expiryRows(rows);
    printWithSettings(generateStatementHTML({
      shopName, title: L("মেয়াদ শেষ / শেষ হতে চলা ব্যাচ", "EXPIRED / EXPIRING BATCHES"), subtitle: `${fmtDay(day)} · ${settings.soonDays} ${L("দিনের মধ্যে", "day window")}`,
      cols: t[0].filter((_, i) => canSeeCost || i !== 7).map((label, i) => ({ label, align: i >= 4 && i !== 5 ? "right" : undefined })),
      rows: t.slice(1).map((r) => r.filter((_, i) => canSeeCost || i !== 7)),
    }), { lang });
  };
  const exportCsv = async () => {
    const t = expiryRows(rows).map((r) => r.filter((_, i) => canSeeCost || i !== 7));
    try { await saveTextFile(`batch-expiry-${day}.csv`, csvText(t)); } catch (e) { toast?.(e.message || String(e), "err"); }
  };
  const save = async () => {
    if (!isOwner || !edit || busy) return;
    const next = batchExpirySettingsOf({ batchExpiry: { soonDays: edit.soonDays, blockExpired: edit.blockExpired } });
    setBusy(true);
    try {
      const updated = await saveShopRecord(shopId, { batchExpiry: next }, { ownerUid: user?.uid || shop?.ownerUid });
      onShopUpdated?.(updated);
      logAudit({ shopId, user, profile, action: "edit", collection: "shops", docId: shopId, docNo: "Batch expiry", note: `Window ${next.soonDays} day(s) · expired batches ${next.blockExpired ? "blocked" : "warned"} on sale` });
      toast?.(L("মেয়াদের সেটিং সেভ হয়েছে", "Expiry settings saved"));
      setEdit(null);
    } catch (e) { toast?.(e?.message || String(e), "err"); } finally { setBusy(false); }
  };

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", margin: "2px 0 4px" }}>
        {expired.length > 0 && <span className="si-paid-box is-due" style={{ margin: 0 }}>{L(`${expired.length}টি ব্যাচের মেয়াদ শেষ - বিক্রির আগে দেখুন`, `${expired.length} batch(es) past expiry - check before selling`)}</span>}
        {soon.length > 0 && <span className="si-paid-box" style={{ margin: 0 }}>{L(`${soon.length}টি ব্যাচ ${settings.soonDays} দিনের মধ্যে শেষ হবে`, `${soon.length} batch(es) expire within ${settings.soonDays} days`)}</span>}
        <span className="si-toolbar-gap" />
        {canPrint && <button type="button" className="pm-btn pm-btn--primary" onClick={print} disabled={!rows.length}> {L("প্রিন্ট", "Print")}</button>}
        {canPrint && <button type="button" className="pm-btn-secondary" onClick={exportCsv} disabled={!rows.length}> Excel</button>}
        {isOwner && <button type="button" className="pm-btn-secondary" onClick={() => setEdit(edit ? null : { ...settings })} disabled={busy}>{L("মেয়াদের সেটিং", "Expiry settings")}</button>}
      </div>
      {edit && isOwner && (
        <fieldset className="pm-panel" style={{ margin: "0 0 4px" }}>
          <legend className="pm-panel-legend">{L("মেয়াদের সেটিং", "Expiry settings")}</legend>
          <div className="si-panel-body" style={{ gap: 6 }}>
            <label className="si-field"><span className="pm-label">{L("কত দিনের মধ্যে শেষ হলে দেখাবে", "Show batches expiring within (days)")}</span>
              <input className="pm-input" style={{ width: 110, textAlign: "right" }} inputMode="numeric" value={edit.soonDays} disabled={busy} onChange={(e) => setEdit((s) => ({ ...s, soonDays: e.target.value }))} /></label>
            <label className="pm-check"><input type="checkbox" checked={edit.blockExpired} disabled={busy} onChange={(e) => setEdit((s) => ({ ...s, blockExpired: e.target.checked }))} />
              {L(" মেয়াদ শেষ হওয়া ব্যাচ বিক্রি বন্ধ (না দিলে বিক্রির সময় শুধু সতর্ক করে)", " Block selling expired batches (otherwise the bill only warns)")}</label>
            <div className="si-actions" style={{ background: "transparent", padding: 0 }}>
              <span className="si-toolbar-gap" />
              <button type="button" className="pm-btn-secondary" onClick={() => setEdit(null)} disabled={busy}>{L("বন্ধ", "Close")}</button>
              <button type="button" className="pm-btn pm-btn--primary" onClick={save} disabled={busy}>{busy ? L("সেভ হচ্ছে…", "Saving…") : L("সেভ", "Save")}</button>
            </div>
          </div>
        </fieldset>
      )}
      {!rows.length ? <div className="si-empty">{L(`${fmtDay(day)} তারিখে মেয়াদ শেষ বা ${settings.soonDays} দিনের মধ্যে শেষ হবে এমন কোনো ব্যাচ স্টকে নেই`, `No batch in stock is expired or expires within ${settings.soonDays} days of ${fmtDay(day)}`)}</div> : (
        <div style={{ overflow: "auto" }}>
          <table className="pm-table">
            <thead><tr>
              <th>{L("কোড", "Code")}</th><th>{L("প্রোডাক্ট", "Product")}</th><th>{L("ব্যাচ", "Batch")}</th><th>{L("মেয়াদ", "Expiry")}</th>
              <th style={{ textAlign: "right" }}>{L("বাকি দিন", "Days left")}</th><th style={{ textAlign: "right" }}>{L("স্টক", "In stock")}</th>
              {canSeeCost && <th style={{ textAlign: "right" }}>{L("খরচে মূল্য", "Cost value")} ({cur})</th>}
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.productId}-${r.batchNo}`} style={{ color: r.state === "expired" ? "#b91c1c" : "#b45309" }}>
                  <td>{r.code}</td><td className="si-strong">{r.name}</td><td>{r.batchNo}</td><td>{fmtDay(r.expiry)}</td>
                  <td style={{ textAlign: "right" }}>{r.state === "expired" ? L(`শেষ (${-r.daysLeft} দিন আগে)`, `Expired ${-r.daysLeft} day(s) ago`) : r.daysLeft}</td>
                  <td style={{ textAlign: "right" }}>{r.stock}</td>
                  {canSeeCost && <td style={{ textAlign: "right" }}>{money(r.value)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="si-note">
        {L(
          "মেয়াদ শুধু সেই ক্রয় লাইনে দেওয়া যায় যার নিজের ব্যাচ আছে (ক্রয় বিলের লাইনে \"মেয়াদ\")। বিক্রির সময় ব্যাচ বাছার তালিকায় আগে শেষ হওয়া ব্যাচ আগে আসে; মেয়াদ শেষ ব্যাচ বিক্রি করলে বিল সতর্ক করে, মালিক চাইলে বন্ধ করতে পারেন। মেয়াদ = শেষ যেদিন বিক্রি করা যাবে।",
          "Expiry can be set only on a purchase line that has its own batch (\"Expiry\" on the purchase bill line). When selling, the batch list shows the earliest expiry first; selling an expired batch warns on the bill, and the owner can block it. Expiry = the last day it may be sold."
        )}
      </div>
    </>
  );
}
