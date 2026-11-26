// Merge / Masters hub: merge two customers or suppliers into one, split chosen bills to another party (owner only,
// preview first), and the small masters for employee allowance types and bill adjustment reasons.
// Rules in partyMerge.js and simpleMasters.js. Documents only change which party they point to; nothing is posted.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { PM_CSS } from "../product-master/pmStyles";
import { SI_CSS, usePmFitHeight, usePmMobile } from "../sales-invoice/siSkin";
import { offlineList, offlineUpdate } from "../offline/offlineRepository";
import { rowsOf } from "../inventory/stockFromInvoices";
import { saveShopRecord } from "../offline/shopService";
import { periodLockOf } from "../accounts/periodLock.js";
import { logAudit } from "../utils/auditLog.js";
import { MERGE_COLLECTIONS, PARTY_KINDS, mergePlan, splitCandidates, splitPlan } from "./partyMerge.js";
import { ADJUSTMENT_SIDES, normalizeAdjustments, normalizeAllowances, rowName, saveMasterRow, savedAdjustments, savedAllowances } from "./simpleMasters.js";
import { useFormSaveShortcut } from "../utils/useDesktopFormShortcuts.js";
import { hintSave } from "../utils/desktopFormShortcuts.js";

const money = (v) => (Math.round((Number(v) || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const MH_CSS = `
.mh-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.mh-table th { text-align: left; background: #e8eef7; padding: 3px 5px; border-bottom: 1px solid #8797a9; white-space: nowrap; position: sticky; top: 0; }
.mh-table td { padding: 3px 5px; border-bottom: 1px solid #e2e8f0; }
.mh-table .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.mh-form { display: flex; flex-wrap: wrap; gap: 6px; align-items: flex-end; }
.mh-form label { display: flex; flex-direction: column; gap: 2px; font-size: 11.5px; font-weight: 700; }
`;
const COL_LABEL = {
  salesInvoices: ["সেলস বিল", "Sales bills"], quotations: ["কোটেশন", "Quotations"], deliveryNotes: ["ডেলিভারি নোট", "Delivery notes"], salesOrders: ["সেলস অর্ডার", "Sales orders"],
  salesReceipts: ["রিসিপ্ট", "Receipts"], salesReturns: ["সেলস রিটার্ন", "Sales returns"], jobOrders: ["জব কার্ড", "Job cards"], warrantyClaims: ["ওয়ারেন্টি ক্লেইম", "Warranty claims"],
  securityCheques: ["সিকিউরিটি চেক", "Security cheques"], accountVouchers: ["জার্নাল / কন্ট্রা", "Journal / contra"],
  purchaseInvoices: ["পারচেজ বিল", "Purchase bills"], purchaseOrders: ["পারচেজ অর্ডার", "Purchase orders"], goodsReceipts: ["GRN", "Goods receipts"],
  purchasePayments: ["পেমেন্ট", "Payments"], supplierPayments: ["সাপ্লায়ার পেমেন্ট (পুরনো)", "Supplier payments (old)"], purchaseReturns: ["পারচেজ রিটার্ন", "Purchase returns"],
};

export default function MastersHub({ lang = "en", shopId, shop, user, profile, isOwner = false, customers = [], vendors = [], cur = "AED", toast, onShopUpdated, onPartiesChanged }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const [section, setSection] = useState(isOwner ? "merge" : "allowance");
  const [kind, setKind] = useState("customer");
  const [data, setData] = useState(null);
  const [tick, setTick] = useState(0);
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [picked, setPicked] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [draft, setDraft] = useState(null); // { master: "allowance" | "adjustment", row }
  const mobile = usePmMobile();
  const rootRef = useRef(null);
  const fitH = usePmFitHeight(rootRef, mobile);

  const needsDocs = isOwner && (section === "merge" || section === "split");
  useEffect(() => {
    if (!needsDocs) return undefined;
    let cancelled = false;
    Promise.all(MERGE_COLLECTIONS.map((c) => offlineList(c).catch(() => []))).then((lists) => {
      if (cancelled) return;
      setData(Object.fromEntries(MERGE_COLLECTIONS.map((c, i) => [c, rowsOf(lists[i]).filter((d) => !d.shopId || d.shopId === shopId)])));
    }).catch((err) => { console.warn("[S4 Merge] load failed", err); toast?.(String(err?.message || err), "err"); });
    return () => { cancelled = true; };
  }, [needsDocs, shopId, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const k = PARTY_KINDS[kind];
  const parties = useMemo(() => (kind === "customer" ? customers : vendors).filter((p) => p && p.id && !p.isDeleted)
    .sort((a, b) => String(a[k.nameKey] || "").localeCompare(String(b[k.nameKey] || ""))), [kind, customers, vendors, k.nameKey]);
  const open = parties.filter((p) => !p.mergedInto);
  const source = parties.find((p) => p.id === sourceId) || null;
  const target = parties.find((p) => p.id === targetId) || null;
  const lockDate = periodLockOf(shop).lockDate || "";
  const who = profile?.personName || profile?.username || user?.email || "";
  const partyLabel = (p) => `${p[k.nameKey] || "-"}${p[k.codeKey] ? ` (${p[k.codeKey]})` : ""}${p.status === "inactive" ? ` - ${L("নিষ্ক্রিয়", "inactive")}` : ""}`;

  const merge = useMemo(() => (data && source && target ? mergePlan(kind, source, target, data, { lockDate, by: who }) : null), [data, kind, source, target, lockDate, who]);
  const cands = useMemo(() => (data && source ? splitCandidates(kind, source, data) : { bills: [], money: [] }), [data, kind, source]);
  const split = useMemo(() => (data && source && target ? splitPlan(kind, source, target, data, [...picked], { lockDate }) : null), [data, kind, source, target, picked, lockDate]);

  const resetPick = () => { setSourceId(""); setTargetId(""); setPicked(new Set()); setUnderstood(false); };
  const blockerText = (b) => ({
    missing: L("দুটো পার্টি বাছুন", "Pick both parties"),
    same: L("একই পার্টি দুবার বাছা হয়েছে", "The same party is picked twice"),
    merged: L("একটা পার্টি আগেই মার্জ হয়ে গেছে", "One of the parties was already merged"),
    linked: L("একটা পার্টি 'দুই দিকে' (কাস্টমার + ভেন্ডর) যুক্ত - আগে মাস্টারে টিক তুলে দিন", "One party is linked both sides (customer + vendor) - untick it on the master first"),
    bothOpening: L("দুজনেরই শুরুর ব্যালেন্স বিল আছে - আগে একজনের শুরুর ব্যালেন্স ০ করুন", "Both have an opening-balance bill - set one opening balance to 0 first"),
    locked: L(`হিসাব ${fmtDay(lockDate)} পর্যন্ত বন্ধ - তার আগের ডকুমেন্ট সরানো যায় না। আগে পিরিয়ড লক তুলুন।`, `The books are closed up to ${fmtDay(lockDate)} - older documents cannot move. Lift the period lock first.`),
    none: L("সরানোর মতো বিল বাছুন", "Pick the bills to move"),
    opening: L("শুরুর ব্যালেন্স বিল ভাগ করা যায় না", "An opening-balance bill cannot be split"),
    sharedMoney: L("কিছু রিসিপ্ট / পেমেন্ট এমন বিলও মেটায় যেগুলো থেকে যাচ্ছে - সেই বিলগুলোও বাছুন", "Some receipts / payments also settle bills that stay - pick those bills too"),
  }[b] || b);

  // Runs the moves one by one; a stop part way leaves a plan that a second run finishes (it is worked out again).
  const run = async (plan, label, masterPatches) => {
    setBusy(true);
    let done = 0;
    try {
      for (const c of plan.changes) {
        await offlineUpdate(c.col, c.id, c.patch);
        done += 1;
        if (done % 20 === 0) setProgress({ done, total: plan.changes.length });
      }
      for (const [id, patch] of masterPatches) if (patch && Object.keys(patch).length) await offlineUpdate(k.master, id, patch);
      await logAudit({ shopId, user, profile, action: label, collection: k.master, docId: source.id, docNo: source[k.nameKey] || "", note: `${label} -> ${target[k.nameKey] || ""} · ${plan.changes.length} document(s)` });
      toast?.(L(`সম্পন্ন - ${plan.changes.length}টি ডকুমেন্ট সরানো হয়েছে`, `Done - ${plan.changes.length} document(s) moved`));
      onPartiesChanged?.(kind);
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
      resetPick();
      setTick((v) => v + 1);
    } catch (e) {
      toast?.(L(`${done} / ${plan.changes.length} সরানোর পর থেমেছে: `, `Stopped after ${done} of ${plan.changes.length}: `) + (e?.message || e) + L(" - আবার চালালে বাকিগুলো সরবে", " - run it again to move the rest"), "err");
      setTick((v) => v + 1);
    } finally { setBusy(false); setProgress(null); }
  };
  const doMerge = () => {
    if (!isOwner || !merge || merge.blockers.length || !understood || busy) return;
    if (!window.confirm(L(`"${source[k.nameKey]}"-এর সব ডকুমেন্ট "${target[k.nameKey]}"-এ যাবে, আর "${source[k.nameKey]}" নিষ্ক্রিয় হবে। এটা ফেরানো যায় না। চালাবেন?`,
      `All documents of "${source[k.nameKey]}" move to "${target[k.nameKey]}" and "${source[k.nameKey]}" is closed. This cannot be undone. Continue?`))) return;
    run(merge, "merge", [[target.id, merge.targetPatch], [source.id, merge.sourcePatch]]);
  };
  const doSplit = () => {
    if (!isOwner || !split || split.blockers.length || busy) return;
    if (!window.confirm(L(`${picked.size}টি বিল (সাথে তাদের রিসিপ্ট / রিটার্ন) "${target[k.nameKey]}"-এ সরবে। চালাবেন?`, `${picked.size} bill(s) (with their receipts / returns) move to "${target[k.nameKey]}". Continue?`))) return;
    run(split, "split", []);
  };

  // ── small masters ──
  const allowances = useMemo(() => normalizeAllowances(shop?.allowanceTypes), [shop?.allowanceTypes]);
  const adjustments = useMemo(() => normalizeAdjustments(shop?.adjustmentReasons), [shop?.adjustmentReasons]);
  const saveDraft = async () => {
    if (!isOwner || !draft || busy) return;
    const list = draft.master === "allowance" ? allowances : adjustments;
    const res = saveMasterRow(list, draft.row, { prefix: draft.master === "allowance" ? "al_" : "adj_" });
    if (res.error) {
      toast?.({ name: L("নাম দিন", "Enter a name"), duplicate: L("এই নামে আগেই আছে", "This name already exists"), duplicateCode: L("এই কোড আগেই আছে", "This code is already used"),
        system: L("বেতনের ঘরের সাথে যুক্ত ভাতা বন্ধ করা যায় না", "An allowance tied to a salary field cannot be switched off") }[res.error], "err");
      return;
    }
    setBusy(true);
    try {
      const patch = draft.master === "allowance" ? { allowanceTypes: savedAllowances(res.list) } : { adjustmentReasons: savedAdjustments(res.list) };
      onShopUpdated?.(await saveShopRecord(shopId, patch));
      setDraft(null);
      toast?.(L("সেভ হয়েছে", "Saved"));
    } catch (e) { toast?.(e.message || String(e), "err"); } finally { setBusy(false); }
  };
  useFormSaveShortcut({ active: !!draft, saving: busy, disabled: busy || !draft || !isOwner, onSave: saveDraft });
  const editor = (master) => draft && draft.master === master && (
    <div className="mh-form" style={{ border: "1px solid #8797a9", padding: 6, background: "#fffdf6", marginBottom: 6 }}>
      <label>{L("কোড", "Code")}<input className="pm-input" style={{ width: 90 }} value={draft.row.code || ""} onChange={(e) => setDraft((d) => ({ ...d, row: { ...d.row, code: e.target.value } }))} /></label>
      <label>English<input className="pm-input" style={{ width: 170 }} value={draft.row.nameEn || ""} onChange={(e) => setDraft((d) => ({ ...d, row: { ...d.row, nameEn: e.target.value } }))} /></label>
      <label>বাংলা<input className="pm-input" style={{ width: 170 }} value={draft.row.nameBn || ""} onChange={(e) => setDraft((d) => ({ ...d, row: { ...d.row, nameBn: e.target.value } }))} /></label>
      {master === "adjustment" && (
        <label>{L("কোথায়", "Used on")}
          <select className="pm-input" value={draft.row.side || "both"} onChange={(e) => setDraft((d) => ({ ...d, row: { ...d.row, side: e.target.value } }))}>
            {ADJUSTMENT_SIDES.map((s) => <option key={s} value={s}>{{ sales: L("বিক্রয়", "Sales"), purchase: L("ক্রয়", "Purchase"), both: L("দুটোই", "Both") }[s]}</option>)}
          </select>
        </label>
      )}
      {!draft.row.system && <label style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><input type="checkbox" checked={draft.row.active !== false} onChange={(e) => setDraft((d) => ({ ...d, row: { ...d.row, active: e.target.checked } }))} /> {L("চালু", "Active")}</label>}
      <button type="button" title="Ctrl+S" className="pm-btn pm-btn--primary" onClick={saveDraft} disabled={busy}>{L("সেভ", "Save")}{hintSave(busy)}</button>
      <button type="button" className="pm-btn-secondary" onClick={() => setDraft(null)}>{L("বাতিল", "Cancel")}</button>
    </div>
  );

  const partyPickers = (fromLabel, toLabel) => (
    <div className="mh-form">
      <label>{L("ধরন", "Type")}
        <select className="pm-input" value={kind} onChange={(e) => { setKind(e.target.value); resetPick(); }}>
          <option value="customer">{L("কাস্টমার", "Customers")}</option>
          <option value="vendor">{L("সাপ্লায়ার", "Suppliers")}</option>
        </select>
      </label>
      <label>{fromLabel}
        <select className="pm-input" style={{ width: mobile ? "100%" : 260 }} value={sourceId} onChange={(e) => { setSourceId(e.target.value); setPicked(new Set()); setUnderstood(false); }}>
          <option value="">-</option>
          {open.map((p) => <option key={p.id} value={p.id}>{partyLabel(p)}</option>)}
        </select>
      </label>
      <label>{toLabel}
        <select className="pm-input" style={{ width: mobile ? "100%" : 260 }} value={targetId} onChange={(e) => { setTargetId(e.target.value); setUnderstood(false); }}>
          <option value="">-</option>
          {open.filter((p) => p.id !== sourceId).map((p) => <option key={p.id} value={p.id}>{partyLabel(p)}</option>)}
        </select>
      </label>
      <button type="button" className="pm-btn-secondary" onClick={() => setTick((v) => v + 1)}>{L("রিফ্রেশ", "Refresh")}</button>
    </div>
  );
  const countsTable = (plan) => (
    <table className="mh-table" style={{ maxWidth: 420 }}>
      <thead><tr><th>{L("কী সরবে", "What moves")}</th><th className="num">{L("সংখ্যা", "Count")}</th></tr></thead>
      <tbody>
        {Object.entries(plan.counts).map(([col, n]) => <tr key={col}><td>{(COL_LABEL[col] || [col, col])[bn ? 0 : 1]}</td><td className="num">{n}</td></tr>)}
        {!Object.keys(plan.counts).length && <tr><td colSpan={2} className="si-muted">{L("কোনো ডকুমেন্ট নেই", "No documents")}</td></tr>}
      </tbody>
    </table>
  );
  const blockersBox = (plan) => plan?.blockers.length > 0 && (
    <div className="si-paid-box is-due">{plan.blockers.map((b) => <div key={b}>{blockerText(b)}</div>)}</div>
  );

  const tabs = [
    ...(isOwner ? [["merge", L("মার্জ", "Merge")], ["split", L("ভাগ (স্প্লিট)", "Split")]] : []),
    ["allowance", L("ভাতার ধরন", "Allowance types")], ["adjustment", L("সমন্বয়ের কারণ", "Adjustment reasons")],
  ];

  return (
    <div ref={rootRef} className="si-root" style={fitH ? { height: fitH } : undefined}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>
      <style>{MH_CSS}</style>
      <div className="pm-reference-title">
        <strong> {L("মার্জ / মাস্টার", "Merge / Masters")}</strong>
        <span>{L("পার্টি মার্জ ও ভাগ, ভাতা, সমন্বয়", "Party merge and split, allowances, adjustments")}</span>
      </div>
      <div className="si-toolbar">
        <div className="si-pills">
          {tabs.map(([key, label]) => <button key={key} type="button" className={`pm-btn-secondary${section === key ? " is-active" : ""}`} onClick={() => setSection(key)}>{label}</button>)}
        </div>
      </div>
      <div className="si-body">
        {progress && <div className="si-paid-box">{L(`সরানো হচ্ছে... ${progress.done} / ${progress.total}`, `Moving... ${progress.done} of ${progress.total}`)}</div>}

        {section === "merge" && isOwner && (
          <>
            <fieldset className="pm-panel" style={{ margin: 0 }}>
              <legend className="pm-panel-legend">{L("দুটো পার্টি এক করুন", "Merge two parties into one")}</legend>
              <div className="si-panel-body" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {partyPickers(L("যেটা বন্ধ হবে (থেকে)", "Close this one (from)"), L("যেটা থাকবে (তে)", "Keep this one (into)"))}
                {!data && <div className="si-empty">{L("লোড হচ্ছে…", "Loading…")}</div>}
                {merge && (
                  <>
                    {blockersBox(merge)}
                    {countsTable(merge)}
                    {Object.keys(merge.targetPatch).length > 0 && (
                      <div className="si-muted">{L("যেটা থাকবে তাতে খালি ঘর পূরণ হবে: ", "Empty fields filled on the kept party: ")}{Object.keys(merge.targetPatch).join(", ")}</div>
                    )}
                    <div className="si-paid-box is-due">
                      {L(`ফেরানো যায় না: "${source[k.nameKey]}"-এর সব ডকুমেন্টে পার্টি বদলে "${target[k.nameKey]}" হবে; "${source[k.nameKey]}" মাস্টারে নিষ্ক্রিয় থাকবে (মুছবে না)। লেজার নতুন করে হিসাব হয় - কিছু পোস্ট হয় না।`,
                        `Cannot be undone: every document of "${source[k.nameKey]}" is changed to "${target[k.nameKey]}"; "${source[k.nameKey]}" stays in the master as inactive (not deleted). The ledger is simply worked out again - nothing is posted.`)}
                    </div>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} disabled={!!merge.blockers.length} />
                      {L("বুঝেছি, এটা ফেরানো যাবে না", "I understand this cannot be undone")}
                    </label>
                    <div><button type="button" className="pm-btn pm-btn--danger" onClick={doMerge} disabled={busy || !understood || !!merge.blockers.length}>{L("মার্জ করুন", "Merge")}</button></div>
                  </>
                )}
              </div>
            </fieldset>
            <div className="si-note">
              {L(
                "যেটা বন্ধ হবে তার বিল, কোটেশন, ডেলিভারি নোট, অর্ডার, রিসিপ্ট / পেমেন্ট, রিটার্ন, জব কার্ড, ওয়ারেন্টি, সিকিউরিটি চেক আর জার্নালে তার নাম - সব যেটা থাকবে তাতে যায়। নাম আর কোড থাকা পার্টির। খালি মোবাইল / ইমেইল / ঠিকানা / TRN পূরণ হয়; লয়্যালটি সদস্যপদ সরে যায় যদি থাকা পার্টির না থাকে। থামবে যদি: হিসাবের পিরিয়ড লকের আগের ডকুমেন্ট থাকে, দুজনেরই শুরুর ব্যালেন্স থাকে, বা কোনো পার্টি 'দুই দিকে' যুক্ত থাকে। শুধু মালিক পারেন; অডিট লগে লেখা থাকে।",
                "Bills, quotations, delivery notes, orders, receipts / payments, returns, job cards, warranty claims, security cheques and journal lines with its name - all move from the closed party to the kept one. The kept party's name and code stay. Its empty mobile / email / address / TRN are filled; a loyalty membership moves over if the kept party has none. It stops when: a document is before the period lock, both have an opening balance, or a party is linked both sides. Owner only; written to the audit log."
              )}
            </div>
          </>
        )}

        {section === "split" && isOwner && (
          <>
            <fieldset className="pm-panel" style={{ margin: 0 }}>
              <legend className="pm-panel-legend">{L("বাছাই করা বিল অন্য পার্টিতে সরান", "Move chosen bills to another party")}</legend>
              <div className="si-panel-body" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {partyPickers(L("যার বিল", "Bills of"), L("যার কাছে যাবে", "Move to"))}
                {source && (
                  <div style={{ overflow: "auto", maxHeight: mobile ? undefined : 300 }}>
                    <table className="mh-table">
                      <thead><tr><th /><th>{L("তারিখ", "Date")}</th><th>{L("নং", "No")}</th><th className="num">{L("মোট", "Total")}</th><th className="num">{L("বাকি", "Due")}</th><th>{L("অবস্থা", "Status")}</th></tr></thead>
                      <tbody>
                        {cands.bills.map((b) => (
                          <tr key={b.id} onClick={() => setPicked((s) => { const n = new Set(s); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); return n; })} style={{ cursor: "pointer", background: picked.has(b.id) ? "#eaf2ff" : undefined }}>
                            <td><input type="checkbox" readOnly checked={picked.has(b.id)} /></td>
                            <td>{fmtDay(b.invoiceDate)}</td><td>{b.invoiceNo}{b.supplierInvoiceNo ? ` (${b.supplierInvoiceNo})` : ""}</td>
                            <td className="num">{money(b.grandTotal)}</td><td className="num">{money(b.balanceDue)}</td><td>{b.status}</td>
                          </tr>
                        ))}
                        {!cands.bills.length && <tr><td colSpan={6} className="si-muted">{L("কোনো বিল নেই", "No bills")}</td></tr>}
                      </tbody>
                    </table>
                  </div>
                )}
                {split && target && (
                  <>
                    {blockersBox(split)}
                    {split.shared.length > 0 && <div className="si-muted">{L("যে রিসিপ্ট / পেমেন্টের জন্য আটকেছে: ", "Held up by: ")}{split.shared.map((m) => m.receiptNo || m.paymentNo).join(", ")}</div>}
                    {countsTable(split)}
                    <div><button type="button" className="pm-btn pm-btn--danger" onClick={doSplit} disabled={busy || !!split.blockers.length}>{L("সরান", "Move")}</button></div>
                  </>
                )}
              </div>
            </fieldset>
            <div className="si-note">
              {L(
                "শতাংশ দিয়ে ভাগ নয় - যে বিলগুলো বাছবেন শুধু সেগুলো সরবে, সাথে সেই বিলগুলোরই রিসিপ্ট / পেমেন্ট আর রিটার্ন। কোনো রিসিপ্ট থেকে-যাওয়া বিলও মেটালে আটকাবে। হিসাবে জমা (বিলহীন) রিসিপ্ট আর শুরুর ব্যালেন্স সরে না। নতুন পার্টিতে সরাতে আগে মাস্টারে পার্টিটা বানান।",
                "No split by percent - only the bills you pick move, with the receipts / payments and returns of those bills only. A receipt that also settles a bill staying behind stops it. On-account receipts and the opening balance stay. To move to a new party, create it on the master first."
              )}
            </div>
          </>
        )}

        {section === "allowance" && (
          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{L(`ভাতার ধরন (${allowances.length})`, `Allowance types (${allowances.length})`)}</legend>
            <div className="si-panel-body">
              {isOwner && !draft && <div style={{ marginBottom: 6 }}><button type="button" className="pm-btn-secondary" onClick={() => setDraft({ master: "allowance", row: { code: "", nameEn: "", nameBn: "", active: true } })}>{L("নতুন ভাতা", "New allowance")}</button></div>}
              {editor("allowance")}
              <table className="mh-table">
                <thead><tr><th>{L("কোড", "Code")}</th><th>{L("নাম", "Name")}</th><th>{L("কোথায় ব্যবহার", "Used for")}</th><th>{L("অবস্থা", "Status")}</th></tr></thead>
                <tbody>
                  {allowances.map((a) => (
                    <tr key={a.id} onClick={() => isOwner && setDraft({ master: "allowance", row: { ...a } })} style={{ cursor: isOwner ? "pointer" : "default" }}>
                      <td>{a.code}</td><td>{a.nameEn}{a.nameBn ? <span className="si-muted"> · {a.nameBn}</span> : null}</td>
                      <td>{a.system ? L("কর্মচারীর বেতনের ঘর", "Employee salary field") : L("কর্মচারী খরচ: ভাতা", "Employee expense: Allowance")}</td>
                      <td style={{ color: a.active ? "#15803d" : "#92400e" }}>{a.active ? L("চালু", "Active") : L("বন্ধ", "Off")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="si-note" style={{ marginTop: 6 }}>
                {L("প্রথম চারটা কর্মচারী প্রোফাইলের বেতনের ঘর (বাসা, যাতায়াত, খাবার, অন্যান্য) - নাম/কোড বদলানো যায়, বন্ধ বা মোছা যায় না, বেতনের হিসাব বদলায় না। বাকিগুলো কর্মচারী খরচে 'ভাতা' দিলে বাছা যায়। শুধু মালিক বদলাতে পারেন।",
                  "The first four are the salary fields on the employee profile (housing, transport, food, other) - their name / code can change, they cannot be switched off or removed, and pay is worked out as before. The others are picked on an employee expense of type 'Allowance'. Only the owner can change them.")}
              </div>
            </div>
          </fieldset>
        )}

        {section === "adjustment" && (
          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{L(`সমন্বয়ের কারণ (${adjustments.length})`, `Adjustment reasons (${adjustments.length})`)}</legend>
            <div className="si-panel-body">
              {isOwner && !draft && <div style={{ marginBottom: 6 }}><button type="button" className="pm-btn-secondary" onClick={() => setDraft({ master: "adjustment", row: { code: "", nameEn: "", nameBn: "", side: "both", active: true } })}>{L("নতুন কারণ", "New reason")}</button></div>}
              {editor("adjustment")}
              <table className="mh-table">
                <thead><tr><th>{L("কোড", "Code")}</th><th>{L("নাম", "Name")}</th><th>{L("কোথায়", "Used on")}</th><th>{L("অবস্থা", "Status")}</th></tr></thead>
                <tbody>
                  {adjustments.map((a) => (
                    <tr key={a.id} onClick={() => isOwner && setDraft({ master: "adjustment", row: { ...a } })} style={{ cursor: isOwner ? "pointer" : "default" }}>
                      <td>{a.code}</td><td>{rowName(a, false)}{a.nameBn ? <span className="si-muted"> · {a.nameBn}</span> : null}</td>
                      <td>{{ sales: L("বিক্রয়", "Sales"), purchase: L("ক্রয়", "Purchase"), both: L("দুটোই", "Both") }[a.side]}</td>
                      <td style={{ color: a.active ? "#15803d" : "#92400e" }}>{a.active ? L("চালু", "Active") : L("বন্ধ", "Off")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="si-note" style={{ marginTop: 6 }}>
                {L("সেলস ইনভয়েসের 'Adjustments' ঘরে টাকা দিলে কারণ বাছা যায়, বিলে সেভ হয় আর বিলের বিস্তারিতে দেখায়। পারচেজ বিলে এখন সমন্বয়ের ঘর নেই - 'ক্রয়' কারণগুলো সেই ঘর এলে ব্যবহার হবে। স্টক সমন্বয় আলাদা (Stock Adjust)। শুধু মালিক বদলাতে পারেন।",
                  "When an amount is put in the sales invoice 'Adjustments' box, a reason can be picked; it is saved on the bill and shown in the bill detail. Purchase bills have no adjustment box yet - the 'Purchase' reasons are for when they do. Stock adjustment is separate (Stock Adjust). Only the owner can change them.")}
              </div>
            </div>
          </fieldset>
        )}
      </div>
      <div className="si-statusbar">
        <span>{isOwner ? L("মার্জ ও ভাগ শুধু মালিক", "Merge and split: owner only") : L("দেখা যাবে, বদলাবেন মালিক", "View only - the owner makes changes")}</span>
        {lockDate && <span>{L("পিরিয়ড লক", "Period lock")} {fmtDay(lockDate)}</span>}
        <span>{cur}</span>
      </div>
    </div>
  );
}
