// Bulk message (WhatsApp): choose customers, choose a template, then open each chat one by one with the message filled
// in - the user presses Send in WhatsApp for each. Text only (a PDF per customer stays on each document's WhatsApp
// button). Rules in bulkMessage.js; templates on the shop record (owner edits); the log is this device's attempts.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { PM_CSS } from "../product-master/pmStyles";
import { SI_CSS, usePmFitHeight, usePmMobile } from "../sales-invoice/siSkin";
import { offlineList } from "../offline/offlineRepository";
import { loadInvoiceRows, rowsOf } from "../inventory/stockFromInvoices";
import { saveShopRecord } from "../offline/shopService";
import { expenseCategoryLabel } from "../expenses/ExpensesTab.jsx";
import { buildGlobalLedger, balances } from "../ledger/globalLedger.js";
import { r2 } from "../reports/reportFilters.js";
import { openWhatsAppText } from "./whatsappDocShare.js";
import { TEMPLATE_VARS, appendLog, clearLog, fillTemplate, logEntry, normalizeTemplates, readLog, recipientsOf, saveTemplate } from "./bulkMessage.js";

const money = (v) => r2(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtTime = (iso) => {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const BM_CSS = `
.bm-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.bm-table th { text-align: left; background: #e8eef7; padding: 3px 5px; border-bottom: 1px solid #8797a9; white-space: nowrap; position: sticky; top: 0; }
.bm-table td { padding: 3px 5px; border-bottom: 1px solid #e2e8f0; }
.bm-table .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.bm-preview { white-space: pre-wrap; background: #fff; border: 1px solid #8797a9; padding: 6px 8px; font-size: 12.5px; min-height: 60px; }
.bm-vars { display: flex; gap: 3px; flex-wrap: wrap; }
`;

export default function BulkMessageScreen({ lang = "en", shopId, shop, isOwner = false, canSeeDue = false, customers = [], shopName = "", cur = "AED", toast, onShopUpdated }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const [dues, setDues] = useState(() => new Map());
  const [tick, setTick] = useState(0);
  const [query, setQuery] = useState("");
  const [onlyMembers, setOnlyMembers] = useState(false);
  const [onlyDue, setOnlyDue] = useState(false);
  const [picked, setPicked] = useState(() => new Set());
  const [templateId, setTemplateId] = useState("");
  const [draft, setDraft] = useState(null); // template being added / edited (owner)
  const [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState(null); // { rows, at, template }
  const [log, setLog] = useState(() => readLog(shopId));
  const bodyRef = useRef(null);
  const mobile = usePmMobile();
  const rootRef = useRef(null);
  const fitH = usePmFitHeight(rootRef, mobile);

  // What each customer owes = their Global Ledger balance (only loaded for users who may see balances).
  useEffect(() => {
    if (!canSeeDue) return undefined;
    let cancelled = false;
    Promise.all([
      loadInvoiceRows(), offlineList("salesReceipts"), offlineList("purchasePayments"), offlineList("expenses"),
      offlineList("accountVouchers").catch(() => []), offlineList("partnerEntries").catch(() => []), offlineList("bankReconciliations").catch(() => []),
    ]).then(([rows, rc, pm, ex, av, pe, br]) => {
      if (cancelled) return;
      const ledger = buildGlobalLedger({
        salesInvoices: rows.salesInvoices, purchaseInvoices: rows.purchaseInvoices, salesReturns: rows.extras?.salesReturns || [], purchaseReturns: rows.extras?.purchaseReturns || [],
        receipts: rowsOf(rc), payments: rowsOf(pm), expenses: rowsOf(ex), accountVouchers: rowsOf(av), partnerEntries: rowsOf(pe), bankEntries: rowsOf(br).filter((d) => d?.kind === "entry"),
      }, { shopId, customers, expenseLabel: (e) => expenseCategoryLabel(e, false) });
      const bal = balances(ledger.postings, "");
      setDues(new Map(customers.filter((c) => c?.id).map((c) => [c.id, r2(bal.get(`c:${c.id}`) || 0)])));
    }).catch((err) => { console.warn("[S4 Bulk message] balances failed", err); });
    return () => { cancelled = true; };
  }, [shopId, customers, canSeeDue, tick]);
  useEffect(() => { setLog(readLog(shopId)); }, [shopId]);

  const templates = useMemo(() => normalizeTemplates(shop?.messageTemplates, bn), [shop?.messageTemplates, bn]);
  const activeTemplates = templates.filter((t) => t.active);
  const template = activeTemplates.find((t) => t.id === templateId) || activeTemplates[0] || null;
  const { list, noNumber } = useMemo(() => recipientsOf(customers, dues, { query, onlyMembers, onlyDue: canSeeDue && onlyDue }), [customers, dues, query, onlyMembers, onlyDue, canSeeDue]);
  const chosen = list.filter((r) => picked.has(r.id));
  const valuesOf = (r) => ({ name: r.name, shop: shopName, due: canSeeDue ? `${cur} ${money(r.due)}` : "", loyaltyNo: r.loyaltyNo });
  const sample = chosen[0] || list[0] || null;
  const usesDue = !!template && /\{due\}/.test(template.body);

  const togglePick = (id) => setPicked((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const pickAllShown = () => setPicked((prev) => new Set([...prev, ...list.map((r) => r.id)]));
  const clearPicks = () => setPicked(new Set());

  const errText = (res) => ({
    name: L("টেমপ্লেটের নাম দিন", "Enter a template name"), body: L("মেসেজ লিখুন", "Write the message"),
    duplicate: L("এই নামে আরেকটা টেমপ্লেট আছে", "Another template has this name"),
    vars: L(`অজানা ঘর: ${(res.vars || []).map((v) => `{${v}}`).join(", ")}`, `Unknown field: ${(res.vars || []).map((v) => `{${v}}`).join(", ")}`),
  }[res.error] || res.error);
  const persistTemplates = async (next) => {
    setBusy(true);
    try {
      const updated = await saveShopRecord(shopId, { messageTemplates: next });
      onShopUpdated?.(updated);
      return true;
    } catch (e) { toast?.(e.message || String(e), "err"); return false; } finally { setBusy(false); }
  };
  const saveDraft = async () => {
    if (!isOwner || !draft) return;
    const res = saveTemplate(templates, draft);
    if (res.error) { toast?.(errText(res), "err"); return; }
    if (await persistTemplates(res.list)) {
      toast?.(L("টেমপ্লেট সেভ হয়েছে", "Template saved"));
      const saved = res.list.find((t) => t.name.toLowerCase() === draft.name.trim().toLowerCase());
      if (saved?.active) setTemplateId(saved.id);
      setDraft(null);
    }
  };
  const insertVar = (v) => {
    const el = bodyRef.current;
    const at = el ? el.selectionStart : (draft?.body || "").length;
    setDraft((d) => ({ ...d, body: `${(d.body || "").slice(0, at)}{${v}}${(d.body || "").slice(at)}` }));
  };

  const start = () => {
    if (!template || !chosen.length) return;
    const ok = window.confirm(L(
      `${chosen.length} জনের WhatsApp একে একে খুলবে - প্রতিটিতে আপনাকে Send চাপতে হবে। শুরু করবেন?`,
      `Open WhatsApp for ${chosen.length} customer(s), one by one? You press Send in each chat.`,
    ));
    if (ok) setQueue({ rows: chosen, at: 0, template });
  };
  const current = queue ? queue.rows[queue.at] : null;
  const advance = (status) => {
    if (!queue || !current) return;
    setLog(appendLog(shopId, logEntry(current, status, queue.template.name)));
    if (queue.at + 1 >= queue.rows.length) {
      const opened = queue.rows.length;
      setQueue(null);
      toast?.(L(`শেষ - ${opened} জনের তালিকা শেষ হয়েছে`, `Done - went through ${opened} customer(s)`));
    } else setQueue((q) => ({ ...q, at: q.at + 1 }));
  };
  const openCurrent = async () => {
    if (!current) return;
    try {
      const res = await openWhatsAppText(current.phone, fillTemplate(queue.template.body, valuesOf(current)));
      if (res.mode === "desktop" && !res.desktop) toast?.(L("WhatsApp Desktop পাওয়া যায়নি - ব্রাউজারে খুলেছে", "WhatsApp Desktop not found - opened in the browser"), "info");
      advance("opened");
    } catch (e) { toast?.(e.message || String(e), "err"); }
  };

  return (
    <div ref={rootRef} className="si-root" style={fitH ? { height: fitH } : undefined}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>
      <style>{BM_CSS}</style>
      <div className="pm-reference-title">
        <strong> {L("বাল্ক মেসেজ", "Bulk Message")}</strong>
        <span>WhatsApp</span>
      </div>
      <div className="si-toolbar">
        <input className="pm-input" style={{ width: mobile ? "100%" : 220 }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={L("নাম / মোবাইল / কোড খুঁজুন", "Search name / mobile / code")} />
        <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><input type="checkbox" checked={onlyMembers} onChange={(e) => setOnlyMembers(e.target.checked)} /> {L("শুধু লয়্যালটি সদস্য", "Loyalty members only")}</label>
        {canSeeDue && <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><input type="checkbox" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} /> {L("শুধু বকেয়া আছে", "With a due only")}</label>}
        <span className="si-toolbar-gap" />
        {canSeeDue && <button type="button" className="pm-btn-secondary" onClick={() => setTick((v) => v + 1)}> {L("রিফ্রেশ", "Refresh")}</button>}
      </div>
      <div className="si-body">
        {queue && current && (
          <fieldset className="pm-panel" style={{ margin: 0, borderColor: "#15803d" }}>
            <legend className="pm-panel-legend">{L(`পাঠানো চলছে: ${queue.at + 1} / ${queue.rows.length}`, `Sending: ${queue.at + 1} of ${queue.rows.length}`)}</legend>
            <div className="si-panel-body" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div><b>{current.name}</b> · +{current.phone}</div>
              <div className="bm-preview">{fillTemplate(queue.template.body, valuesOf(current))}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button type="button" className="pm-btn pm-btn--primary" autoFocus onClick={openCurrent}>{L("WhatsApp খুলুন", "Open WhatsApp")}</button>
                <button type="button" className="pm-btn-secondary" onClick={() => advance("skipped")}>{L("বাদ দিন", "Skip")}</button>
                <button type="button" className="pm-btn pm-btn--danger" onClick={() => setQueue(null)}>{L("থামুন", "Stop")}</button>
              </div>
              <div className="si-muted">{L("WhatsApp-এ Send চাপার পর এখানে ফিরে পরের জনকে খুলুন।", "After pressing Send in WhatsApp, come back here and open the next one.")}</div>
            </div>
          </fieldset>
        )}
        <div className={mobile ? "" : "si-cols"} style={mobile ? { display: "flex", flexDirection: "column", gap: 4 } : { alignItems: "start" }}>
          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{L(`প্রাপক (${chosen.length} বাছাই / ${list.length})`, `Recipients (${chosen.length} picked of ${list.length})`)}</legend>
            <div className="si-panel-body" style={{ overflow: "auto", maxHeight: mobile ? undefined : 440 }}>
              <div style={{ display: "flex", gap: 4, marginBottom: 4, flexWrap: "wrap", alignItems: "center" }}>
                <button type="button" className="pm-btn-secondary" onClick={pickAllShown} disabled={!list.length}>{L("দেখানো সবাই", "Pick all shown")}</button>
                <button type="button" className="pm-btn-secondary" onClick={clearPicks} disabled={!picked.size}>{L("বাছাই মুছুন", "Clear picks")}</button>
                {noNumber > 0 && <span className="si-muted">{L(`${noNumber} জনের নম্বর নেই - বাদ`, `${noNumber} without a number - left out`)}</span>}
              </div>
              {!list.length ? <div className="si-empty">{L("কোনো কাস্টমার মেলেনি", "No customer matches")}</div> : (
                <table className="bm-table">
                  <thead><tr><th /><th>{L("কাস্টমার", "Customer")}</th><th>{L("নম্বর", "Number")}</th>{canSeeDue && <th className="num">{L("বকেয়া", "Due")}</th>}<th>{L("সদস্য নং", "Member")}</th></tr></thead>
                  <tbody>
                    {list.map((r) => (
                      <tr key={r.id} onClick={() => togglePick(r.id)} style={{ cursor: "pointer", background: picked.has(r.id) ? "#eaf2ff" : undefined }}>
                        <td><input type="checkbox" checked={picked.has(r.id)} onChange={() => togglePick(r.id)} onClick={(e) => e.stopPropagation()} /></td>
                        <td>{r.name}</td><td>+{r.phone}</td>{canSeeDue && <td className="num">{r.due ? money(r.due) : ""}</td>}<td>{r.loyaltyNo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </fieldset>
          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{L("মেসেজ", "Message")}</legend>
            <div className="si-panel-body" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                <select className="pm-input" style={{ width: mobile ? "100%" : 220 }} value={template?.id || ""} onChange={(e) => setTemplateId(e.target.value)}>
                  {activeTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                {isOwner && template && <button type="button" className="pm-btn-secondary" onClick={() => setDraft({ ...template })}>{L("এডিট", "Edit")}</button>}
                {isOwner && <button type="button" className="pm-btn-secondary" onClick={() => setDraft({ id: "", name: "", body: "", active: true })}>{L("নতুন টেমপ্লেট", "New template")}</button>}
              </div>
              {isOwner && templates.some((t) => !t.active) && (
                <div className="si-muted">{L("বন্ধ টেমপ্লেট: ", "Switched off: ")}{templates.filter((t) => !t.active).map((t) => (
                  <button key={t.id} type="button" className="pm-btn-secondary" style={{ marginLeft: 4 }} onClick={() => setDraft({ ...t })}>{t.name}</button>
                ))}</div>
              )}
              {draft && isOwner && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, border: "1px solid #8797a9", padding: 6, background: "#fffdf6" }}>
                  <input className="pm-input" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder={L("টেমপ্লেটের নাম", "Template name")} />
                  <textarea ref={bodyRef} className="pm-input" rows={5} value={draft.body} onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} />
                  <div className="bm-vars">
                    {TEMPLATE_VARS.filter((v) => canSeeDue || v !== "due").map((v) => <button key={v} type="button" className="pm-btn-secondary" onClick={() => insertVar(v)}>{`{${v}}`}</button>)}
                  </div>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><input type="checkbox" checked={draft.active !== false} onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))} /> {L("চালু", "Active")}</label>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button type="button" className="pm-btn pm-btn--primary" onClick={saveDraft} disabled={busy}>{L("সেভ", "Save")}</button>
                    <button type="button" className="pm-btn-secondary" onClick={() => setDraft(null)}>{L("বাতিল", "Cancel")}</button>
                  </div>
                </div>
              )}
              <div>
                <div className="si-muted" style={{ marginBottom: 2 }}>{L("নমুনা", "Preview")}{sample ? ` - ${sample.name}` : ""}</div>
                <div className="bm-preview">{template && sample ? fillTemplate(template.body, valuesOf(sample)) : template ? template.body : L("কোনো চালু টেমপ্লেট নেই", "No active template")}</div>
                {usesDue && !canSeeDue && <div className="si-paid-box is-due" style={{ marginTop: 4 }}>{L("বকেয়া দেখার অনুমতি নেই - {due} খালি যাবে", "No permission to see balances - {due} will be empty")}</div>}
              </div>
              <button type="button" className="pm-btn pm-btn--primary" onClick={start} disabled={!template || !chosen.length || !!queue}>
                {L(`${chosen.length} জনকে WhatsApp`, `WhatsApp ${chosen.length} customer(s)`)}
              </button>
            </div>
          </fieldset>
        </div>
        <fieldset className="pm-panel" style={{ margin: 0 }}>
          <legend className="pm-panel-legend">{L(`এই ডিভাইসের চেষ্টা (${log.length})`, `Attempts on this device (${log.length})`)}</legend>
          <div className="si-panel-body" style={{ overflow: "auto", maxHeight: mobile ? undefined : 220 }}>
            {log.length > 0 && <div style={{ marginBottom: 4 }}><button type="button" className="pm-btn-secondary" onClick={() => { if (window.confirm(L("লগ মুছবেন?", "Clear the log?"))) setLog(clearLog(shopId)); }}>{L("লগ মুছুন", "Clear log")}</button></div>}
            {!log.length ? <div className="si-empty">{L("এখনো কিছু নেই", "Nothing yet")}</div> : (
              <table className="bm-table">
                <thead><tr><th>{L("সময়", "Time")}</th><th>{L("কাস্টমার", "Customer")}</th><th>{L("নম্বর", "Number")}</th><th>{L("টেমপ্লেট", "Template")}</th><th>{L("ফল", "Result")}</th></tr></thead>
                <tbody>
                  {log.slice(0, 100).map((e, i) => (
                    <tr key={`${e.at}-${i}`}><td>{fmtTime(e.at)}</td><td>{e.name}</td><td>+{e.phone}</td><td>{e.template}</td>
                      <td style={{ color: e.status === "opened" ? "#15803d" : "#92400e" }}>{e.status === "opened" ? L("WhatsApp খোলা হয়েছে", "WhatsApp opened") : L("বাদ", "Skipped")}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </fieldset>
        <div className="si-note">
          {L(
            "কোনো SMS গেটওয়ে বা নিজে নিজে পাঠানো নেই: প্রতিটি কাস্টমারের WhatsApp চ্যাট মেসেজসহ খোলে, Send আপনি চাপেন। তাই লগে শুধু 'খোলা হয়েছে' / 'বাদ' থাকে - পৌঁছেছে কিনা S4 জানে না। লগ শুধু এই ডিভাইসে থাকে। বাল্ক মেসেজ শুধু টেক্সট; বিল বা স্টেটমেন্টের PDF পাঠাতে সেই ডকুমেন্টের WhatsApp বাটন ব্যবহার করুন। {due} = গ্লোবাল লেজারে কাস্টমারের বকেয়া। টেমপ্লেট শুধু মালিক বদলাতে পারেন।",
            "No SMS gateway and no automatic sending: each customer's WhatsApp chat opens with the message and you press Send. So the log only says 'opened' or 'skipped' - S4 does not know if it was delivered. The log stays on this device. Bulk messages are text only; to send a bill or statement PDF use that document's WhatsApp button. {due} = the customer's balance in the Global Ledger. Only the owner can change templates."
          )}
        </div>
      </div>
      <div className="si-statusbar">
        <span>{L("বাছাই", "Picked")} <b>{chosen.length}</b></span>
        <span>{L("নম্বর নেই", "No number")} <b>{noNumber}</b></span>
      </div>
    </div>
  );
}
