// Fixed asset register panel (Balance Sheet > Fixed assets): book assets, run monthly depreciation, sell / write off,
// print and Excel. The register sits on the shop record (shop.fixedAssets); every money effect is a register journal
// (accountVouchers, source "fixedAsset") so the ledger, trial balance, P&L, VAT and year-end read it. Owner edits;
// staff who can see accounts get the register read-only. Rules in fixedAssets.js.
import React, { useMemo, useState } from "react";
import { offlineGetById, offlineUpdate, offlineUpsert } from "../offline/offlineRepository";
import { saveShopRecord } from "../offline/shopService";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { saveTextFile } from "../utils/saveTextFile.js";
import { logAudit } from "../utils/auditLog.js";
import { activePeriodLock } from "./periodLock.js";
import { CASH_ACCOUNT } from "../vouchers/accountVoucherDomain.js";
import { csvText } from "../reports/vatExport.js";
import {
  ASSET_CATEGORIES, OPENING, PAID_FROM, REGISTER_COLS, buyJournalId, chargeFor, depreciationBlockers, depreciationJournal, depreciationPosted,
  disposalBlockers, disposalJournal, disposalJournalId, monthOf, normalizeAssets, purchaseJournal, registerCsvRows, registerRows, unpostedMonths, validateAsset,
} from "./fixedAssets.js";
import DateField from "../components/DateField.jsx";

const n = (v) => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
const money = (v) => (Math.round((n(v) + Number.EPSILON) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const prevMonth = (day) => { const d = new Date(`${day}T12:00:00`); d.setDate(1); d.setMonth(d.getMonth() - 1); return localDay(d).slice(0, 7); };
const EMPTY = { name: "", category: ASSET_CATEGORIES[0].key, purchaseDate: "", cost: "", vatAmount: "", supplierTrn: "", supplierBillNo: "", paidFrom: CASH_ACCOUNT, lifeMonths: "60", residual: "", openingAccum: "", note: "" };
const ERR = {
  name: ["সম্পদের নাম দিন", "Type the asset name"], category: ["ধরন বাছুন", "Pick the category"], date: ["তারিখ দিন", "Pick the date"],
  future: ["তারিখ ভবিষ্যতে হতে পারবে না", "The date cannot be in the future"], locked: ["এই তারিখ লক করা", "That date is locked"],
  cost: ["দাম (VAT ছাড়া) দিন", "Enter the cost (without VAT)"], vat: ["VAT ঠিক করুন (ওপেনিং সম্পদে VAT হয় না)", "Fix the VAT (an opening asset has none)"],
  life: ["আয়ু ১ থেকে ৬০০ মাস", "Useful life must be 1 to 600 months"], residual: ["অবশিষ্ট মূল্য দামের কম হতে হবে", "Residual value must be below the cost"],
  openingAccum: ["আগের অবচয় দাম - অবশিষ্টের বেশি হতে পারে না", "Earlier depreciation cannot exceed cost less residual"], paidFrom: ["টাকা কোথা থেকে, বাছুন", "Pick where the money came from"],
};

export default function FixedAssetsPanel({ lang = "en", shopId, shop, user, profile, isOwner = false, canPrint = false, data, moneyAccounts = [], vendors = [], asOf, shopName = "", cur = "AED", toast, onShopUpdated, onSaved, onClose }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const assets = useMemo(() => normalizeAssets(shop?.fixedAssets), [shop?.fixedAssets]);
  const vouchers = data?.accountVouchers || [];
  const today = localDay();
  const lockDate = activePeriodLock();
  const who = profile?.personName || profile?.username || user?.email || "";
  const [form, setForm] = useState(null);
  const [dispose, setDispose] = useState(null);
  const [depMonth, setDepMonth] = useState(() => prevMonth(today));
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => registerRows(assets, vouchers, asOf), [assets, vouchers, asOf]);
  const posted = useMemo(() => depreciationPosted(assets, vouchers), [assets, vouchers]);
  const due = useMemo(() => unpostedMonths(assets, vouchers, depMonth).filter((ym) => assets.some((a) => chargeFor(a, ym, 0) > 0)), [assets, vouchers, depMonth]);
  const depDocs = useMemo(() => vouchers.filter((v) => v && !v.isDeleted && v.status !== "cancelled" && v.source === "fixedAsset" && v.faKind === "dep").sort((a, b) => String(a.faMonth).localeCompare(String(b.faMonth))), [vouchers]);
  const lastDep = depDocs[depDocs.length - 1] || null;
  const hasDep = (a) => (posted.get(a.id)?.months.size || 0) > 0;
  const paidFromOptions = [...new Set([...PAID_FROM.filter((p) => p !== OPENING), ...moneyAccounts, ...vendors.filter((v) => v && !v.isDeleted && v.vendorName).map((v) => v.vendorName), OPENING])];

  const saveAssets = async (list) => {
    const updated = await saveShopRecord(shopId, { fixedAssets: list }, { ownerUid: user?.uid, profile, user });
    onShopUpdated?.(updated || { fixedAssets: list });
  };
  const upsertJournal = async (id, doc) => {
    const prev = await offlineGetById("accountVouchers", id).catch(() => null);
    if (prev?.data) await offlineUpdate("accountVouchers", id, { ...doc, createdAt: prev.data.createdAt || doc.createdAt, cancelledAt: null, cancelledBy: null, cancelReason: null });
    else await offlineUpsert("accountVouchers", id, doc);
  };
  const cancelJournal = (id, reason) => offlineUpdate("accountVouchers", id, { status: "cancelled", cancelledAt: new Date().toISOString(), cancelledBy: user?.uid || "", cancelReason: reason });
  const done = (msg) => { toast?.(msg); onSaved?.(); if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {}); };
  const run = async (fn) => { if (busy) return; setBusy(true); try { await fn(); } catch (e) { toast?.(e?.message || String(e), "err"); } finally { setBusy(false); } };

  const saveForm = () => run(async () => {
    const prev = form.id ? assets.find((a) => a.id === form.id) : null;
    const locked = !!prev && (hasDep(prev) || !!prev.disposal);
    const res = validateAsset(form, assets, { locked, today, lockDate: locked ? "" : lockDate });
    if (res.error) { toast?.(L(...ERR[res.error]), "err"); return; }
    const asset = res.asset;
    if (!locked) {
      const j = purchaseJournal(asset, { shopId, uid: user?.uid || "", by: who });
      await upsertJournal(j.id, j.doc);
    }
    try { await saveAssets([...assets.filter((a) => a.id !== asset.id), asset]); } catch (e) {
      if (!prev && !locked) await cancelJournal(buyJournalId(asset.id), "Register save failed").catch(() => {});
      throw e;
    }
    logAudit({ shopId, user, profile, action: prev ? "edit" : "create", collection: "accountVouchers", docId: buyJournalId(asset.id), docNo: asset.code, amount: asset.cost, note: `Fixed asset ${asset.name}` });
    setForm(null);
    done(L(`${asset.code} সেভ হয়েছে`, `${asset.code} saved`));
  });

  const remove = (a) => run(async () => {
    if (hasDep(a) || a.disposal) { toast?.(L("অবচয় / বিক্রি আছে - মোছা যাবে না", "It has depreciation or a disposal - it cannot be deleted"), "err"); return; }
    if (lockDate && a.purchaseDate <= lockDate) { toast?.(L(`${fmtDay(lockDate)} পর্যন্ত লক`, `Locked up to ${fmtDay(lockDate)}`), "err"); return; }
    if (!window.confirm(L(`${a.code} ${a.name} মুছবেন? এর বুকিং জার্নাল বাতিল হবে।`, `Delete ${a.code} ${a.name}? Its booking journal is cancelled.`))) return;
    await cancelJournal(buyJournalId(a.id), "Fixed asset deleted");
    await saveAssets(assets.filter((x) => x.id !== a.id));
    logAudit({ shopId, user, profile, action: "delete", collection: "accountVouchers", docId: buyJournalId(a.id), docNo: a.code, amount: a.cost, note: `Fixed asset ${a.name}` });
    done(L("মুছে ফেলা হয়েছে", "Deleted"));
  });

  const postDepreciation = () => run(async () => {
    if (!due.length) return;
    if (!window.confirm(L(`${due.join(", ")} মাসের অবচয় জার্নাল দেওয়া হবে। চালাবেন?`, `Post the depreciation journal for ${due.join(", ")}?`))) return;
    let list = vouchers, count = 0;
    for (const ym of due) {
      const j = depreciationJournal({ assets, vouchers: list, ym, shopId, uid: user?.uid || "", by: who });
      const blk = depreciationBlockers(ym, { today, lockDate, journal: j });
      if (blk.length) { toast?.(`${ym}: ${bn ? blk[0].bn : blk[0].en}`, "err"); break; }
      await upsertJournal(j.id, j.doc);
      list = [...list.filter((v) => v.id !== j.id), { id: j.id, ...j.doc }];
      logAudit({ shopId, user, profile, action: "create", collection: "accountVouchers", docId: j.id, docNo: j.doc.voucherNo, amount: j.total, note: `Depreciation ${ym}` });
      count += 1;
    }
    if (count) done(L(`${count} মাসের অবচয় দেওয়া হয়েছে`, `Depreciation posted for ${count} month(s)`));
  });

  const cancelLastDep = () => run(async () => {
    if (!lastDep) return;
    if (lockDate && lastDep.voucherDate <= lockDate) { toast?.(L(`${fmtDay(lockDate)} পর্যন্ত লক`, `Locked up to ${fmtDay(lockDate)}`), "err"); return; }
    if (assets.some((a) => a.disposal && monthOf(a.disposal.date) > lastDep.faMonth && (lastDep.lines || []).some((l) => l.assetId === a.id))) { toast?.(L("এই মাসের পরে বিক্রি হওয়া সম্পদ আছে - আগে বিক্রি বাতিল করুন", "An asset was disposed after this month - undo that disposal first"), "err"); return; }
    if (!window.confirm(L(`${lastDep.faMonth} মাসের অবচয় বাতিল করবেন?`, `Cancel the depreciation for ${lastDep.faMonth}?`))) return;
    await cancelJournal(lastDep.id, "Depreciation cancelled");
    logAudit({ shopId, user, profile, action: "cancel", collection: "accountVouchers", docId: lastDep.id, docNo: lastDep.voucherNo, amount: lastDep.totalAmount, note: `Depreciation ${lastDep.faMonth}` });
    done(L("অবচয় বাতিল হয়েছে", "Depreciation cancelled"));
  });

  const disposeBlk = dispose ? disposalBlockers(assets.find((a) => a.id === dispose.id), { date: dispose.date, today, lockDate, vouchers }) : [];
  const saveDisposal = () => run(async () => {
    const a = assets.find((x) => x.id === dispose.id);
    if (!a || disposeBlk.length) return;
    const acc = depreciationPosted([a], vouchers, dispose.date).get(a.id)?.total || 0;
    const j = disposalJournal(a, { date: dispose.date, proceeds: n(dispose.proceeds), receivedIn: dispose.receivedIn, posted: acc, shopId, uid: user?.uid || "", by: who });
    if (!window.confirm(L(
      `${a.name} ${n(dispose.proceeds) > 0 ? "বিক্রি" : "বাদ"}: বই মূল্য ${cur} ${money(a.cost - acc)}, ${j.result >= 0 ? "লাভ" : "ক্ষতি"} ${cur} ${money(Math.abs(j.result))}। চালাবেন?`,
      `${a.name} ${n(dispose.proceeds) > 0 ? "sold" : "written off"}: book value ${cur} ${money(a.cost - acc)}, ${j.result >= 0 ? "gain" : "loss"} ${cur} ${money(Math.abs(j.result))}. Continue?`))) return;
    await upsertJournal(j.id, j.doc);
    const disposal = { date: dispose.date, proceeds: n(dispose.proceeds), receivedIn: dispose.receivedIn, result: j.result, by: who, at: new Date().toISOString() };
    try { await saveAssets(assets.map((x) => (x.id === a.id ? { ...x, disposal } : x))); } catch (e) { await cancelJournal(j.id, "Register save failed").catch(() => {}); throw e; }
    logAudit({ shopId, user, profile, action: "create", collection: "accountVouchers", docId: j.id, docNo: j.doc.voucherNo, amount: n(dispose.proceeds), note: `Fixed asset disposed ${a.name}` });
    setDispose(null);
    done(L("বিক্রি / বাদ লেখা হয়েছে", "Disposal recorded"));
  });
  const undoDisposal = (a) => run(async () => {
    if (lockDate && a.disposal.date <= lockDate) { toast?.(L(`${fmtDay(lockDate)} পর্যন্ত লক`, `Locked up to ${fmtDay(lockDate)}`), "err"); return; }
    if (!window.confirm(L(`${a.name}-এর বিক্রি / বাদ বাতিল করবেন?`, `Undo the disposal of ${a.name}?`))) return;
    await cancelJournal(disposalJournalId(a.id), "Disposal undone");
    await saveAssets(assets.map((x) => (x.id === a.id ? { ...x, disposal: null } : x)));
    logAudit({ shopId, user, profile, action: "cancel", collection: "accountVouchers", docId: disposalJournalId(a.id), docNo: a.code, amount: a.disposal.proceeds, note: `Disposal undone ${a.name}` });
    done(L("বাতিল হয়েছে", "Undone"));
  });

  const csvRows = () => [[`Fixed asset register as at ${asOf}`], REGISTER_COLS(cur), ...registerCsvRows(rows)];
  const print = () => {
    const body = registerCsvRows(rows);
    printWithSettings(generateStatementHTML({
      shopName, title: "FIXED ASSET REGISTER", subtitle: `As at ${fmtDay(asOf)}`,
      cols: REGISTER_COLS(cur).map((label, i) => ({ label, align: i >= 4 && i <= 9 ? "right" : undefined })), rows: body.slice(0, -1), foot: body.at(-1),
    }), { lang });
  };
  const exportCsv = async () => { try { await saveTextFile(`fixed-asset-register-${asOf}.csv`, csvText(csvRows())); } catch (e) { toast?.(e?.message || String(e), "err"); } };

  const live = rows.filter((r) => !r.gone);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const formLocked = !!form?.id && (() => { const a = assets.find((x) => x.id === form.id); return !!a && (hasDep(a) || !!a.disposal); })();
  const depPreview = due.length ? depreciationJournal({ assets, vouchers, ym: due[0], shopId }) : null;
  const depBlk = due.length ? depreciationBlockers(due[0], { today, lockDate, journal: depPreview }) : [];

  return (
    <fieldset className="pm-panel" style={{ margin: 0 }}>
      <legend className="pm-panel-legend">{L("স্থায়ী সম্পদ রেজিস্টার", "Fixed asset register")}</legend>
      <div className="si-panel-body" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {isOwner && <button type="button" className="pm-btn pm-btn--primary" onClick={() => setForm({ ...EMPTY, purchaseDate: today })} disabled={busy}>{L("নতুন সম্পদ", "New asset")}</button>}
          <span className="si-muted">{L(`${fmtDay(asOf)} পর্যন্ত`, `As at ${fmtDay(asOf)}`)}</span>
          <span className="si-toolbar-gap" />
          {canPrint && <button type="button" className="pm-btn-secondary" onClick={print} disabled={!rows.length}>{L("প্রিন্ট / PDF", "Print / PDF")}</button>}
          {canPrint && <button type="button" className="pm-btn-secondary" onClick={exportCsv} disabled={!rows.length}>Excel</button>}
          {onClose && <button type="button" className="pm-btn-secondary" onClick={onClose}>{L("বন্ধ", "Close")}</button>}
        </div>

        <div className="si-kpis" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          <div className="si-kpi"><span>{L("মোট দাম", "Cost")}</span><b>{cur} {money(live.reduce((t, r) => t + r.cost, 0))}</b></div>
          <div className="si-kpi"><span>{L("জমা অবচয়", "Accumulated depreciation")}</span><b>{cur} {money(live.reduce((t, r) => t + r.accumulated, 0))}</b></div>
          <div className="si-kpi"><span>{L("বই মূল্য", "Book value")}</span><b>{cur} {money(live.reduce((t, r) => t + r.bookValue, 0))}</b></div>
          <div className="si-kpi"><span>{L("মাসিক অবচয়", "Monthly depreciation")}</span><b>{cur} {money(live.reduce((t, r) => t + (r.bookValue - r.residual > 0 ? r.monthly : 0), 0))}</b></div>
        </div>

        {form && (
          <div className="pm-panel" style={{ padding: 8, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 6 }}>
            <label>{L("সম্পদের নাম", "Asset name")}<input className="pm-input" value={form.name} onChange={set("name")} /></label>
            <label>{L("ধরন", "Category")}<select className="pm-input" value={form.category} disabled={formLocked} onChange={set("category")}>{ASSET_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{bn ? c.bn : c.key}</option>)}</select></label>
            <label>{L("বুকিং তারিখ (ব্যবহার শুরু)", "Booked on (in use from)")}<DateField className="pm-input" max={today} value={form.purchaseDate} disabled={formLocked} onChange={set("purchaseDate")}  /></label>
            <label>{L("টাকা কোথা থেকে", "Paid from")}<select className="pm-input" value={form.paidFrom} disabled={formLocked} onChange={set("paidFrom")}>
              {paidFromOptions.map((p) => <option key={p} value={p}>{p === OPENING ? L("আগে থেকেই আছে (Opening Balance)", "Already owned (Opening Balance)") : p}</option>)}
            </select></label>
            <label>{L("দাম (VAT ছাড়া)", "Cost (without VAT)")}<input className="pm-input" inputMode="decimal" value={form.cost} disabled={formLocked} onChange={set("cost")} /></label>
            {form.paidFrom !== OPENING && <label>VAT<input className="pm-input" inputMode="decimal" value={form.vatAmount} disabled={formLocked} onChange={set("vatAmount")} /></label>}
            {form.paidFrom !== OPENING && n(form.vatAmount) > 0 && <label>{L("সাপ্লায়ারের TRN", "Supplier TRN")}<input className="pm-input" value={form.supplierTrn} disabled={formLocked} onChange={set("supplierTrn")} /></label>}
            {form.paidFrom !== OPENING && <label>{L("বিল নং", "Bill no")}<input className="pm-input" value={form.supplierBillNo} disabled={formLocked} onChange={set("supplierBillNo")} /></label>}
            <label>{L("আয়ু (মাস)", "Useful life (months)")}<input className="pm-input" inputMode="numeric" value={form.lifeMonths} disabled={formLocked} onChange={set("lifeMonths")} /></label>
            <label>{L("শেষে অবশিষ্ট মূল্য", "Residual value")}<input className="pm-input" inputMode="decimal" value={form.residual} disabled={formLocked} onChange={set("residual")} /></label>
            {form.paidFrom === OPENING && <label>{L("আগের জমা অবচয়", "Depreciation before the books")}<input className="pm-input" inputMode="decimal" value={form.openingAccum} disabled={formLocked} onChange={set("openingAccum")} /></label>}
            <label>{L("নোট", "Note")}<input className="pm-input" value={form.note} onChange={set("note")} /></label>
            <div style={{ display: "flex", gap: 6, alignItems: "end" }}>
              <button type="button" className="pm-btn pm-btn--primary" onClick={saveForm} disabled={busy}>{L("সেভ", "Save")}</button>
              <button type="button" className="pm-btn-secondary" onClick={() => setForm(null)}>{L("বাতিল", "Cancel")}</button>
            </div>
            {formLocked && <div className="si-muted" style={{ gridColumn: "1 / -1" }}>{L("অবচয় / বিক্রি হয়ে গেছে - শুধু নাম আর নোট বদলানো যায়", "Depreciation or a disposal is posted - only the name and note can change")}</div>}
            {!formLocked && n(form.cost) > 0 && n(form.lifeMonths) > 0 && <div className="si-muted" style={{ gridColumn: "1 / -1" }}>{L("মাসিক অবচয়", "Monthly depreciation")}: {cur} {money((n(form.cost) - n(form.residual)) / Math.round(n(form.lifeMonths)))}</div>}
          </div>
        )}

        {dispose && (
          <div className="pm-panel" style={{ padding: 8, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "end" }}>
            <strong style={{ alignSelf: "center" }}>{assets.find((a) => a.id === dispose.id)?.name}</strong>
            <label>{L("তারিখ", "Date")}<DateField className="pm-input" max={today} value={dispose.date} onChange={(e) => setDispose((d) => ({ ...d, date: e.target.value }))} /></label>
            <label>{L("বিক্রির টাকা (০ = বাদ / নষ্ট)", "Sale proceeds (0 = written off)")}<input className="pm-input" inputMode="decimal" value={dispose.proceeds} onChange={(e) => setDispose((d) => ({ ...d, proceeds: e.target.value }))} /></label>
            <label>{L("টাকা এলো", "Received in")}<select className="pm-input" value={dispose.receivedIn} onChange={(e) => setDispose((d) => ({ ...d, receivedIn: e.target.value }))}>{[...new Set([CASH_ACCOUNT, "Bank", ...moneyAccounts])].map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
            <button type="button" className="pm-btn pm-btn--danger" onClick={saveDisposal} disabled={busy || disposeBlk.length > 0}>{L("বিক্রি / বাদ লিখুন", "Record disposal")}</button>
            <button type="button" className="pm-btn-secondary" onClick={() => setDispose(null)}>{L("বাতিল", "Cancel")}</button>
            {disposeBlk.map((b) => <div key={b.id} style={{ color: "#b91c1c", width: "100%", fontSize: 12.5 }}>{bn ? b.bn : b.en}</div>)}
          </div>
        )}

        <div style={{ overflow: "auto" }}>
          {!rows.length ? <div className="si-empty">{L("এই তারিখ পর্যন্ত কোনো স্থায়ী সম্পদ নেই", "No fixed assets up to this date")}</div> : (
            <table className="pm-table" style={{ minWidth: 900 }}>
              <thead><tr>
                <th>{L("কোড", "Code")}</th><th>{L("সম্পদ", "Asset")}</th><th>{L("বুকিং", "Booked")}</th><th className="si-num">{L("আয়ু", "Life")}</th>
                <th className="si-num">{L("দাম", "Cost")}</th><th className="si-num">{L("মাসিক", "Monthly")}</th><th className="si-num">{L("জমা অবচয়", "Accumulated")}</th><th className="si-num">{L("বই মূল্য", "Book value")}</th><th />
              </tr></thead>
              <tbody>
                {rows.map((r) => {
                  const a = assets.find((x) => x.id === r.id);
                  return (
                    <tr key={r.id} style={r.gone ? { color: "#94a3b8" } : undefined}>
                      <td>{r.code}</td>
                      <td className="si-strong">{r.name}<span style={{ color: "#64748b", fontWeight: 400 }}> · {r.category}</span>
                        {r.gone && <div style={{ fontWeight: 400, fontSize: 11.5 }}>{L("বিক্রি / বাদ", "Disposed")} {fmtDay(r.disposal.date)} · {r.disposal.result >= 0 ? L("লাভ", "gain") : L("ক্ষতি", "loss")} {money(Math.abs(r.disposal.result))}</div>}
                      </td>
                      <td>{fmtDay(r.purchaseDate)}{r.paidFrom === OPENING ? ` (${L("ওপেনিং", "opening")})` : ""}</td>
                      <td className="si-num">{r.lifeMonths}</td>
                      <td className="si-num">{money(r.cost)}</td><td className="si-num">{money(r.monthly)}</td><td className="si-num">{money(r.accumulated)}</td>
                      <td className="si-num si-strong">{money(r.bookValue)}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {isOwner && <button type="button" className="pm-btn-secondary" onClick={() => setForm({ ...EMPTY, ...a, cost: String(a.cost), vatAmount: String(a.vatAmount || ""), residual: String(a.residual || ""), lifeMonths: String(a.lifeMonths), openingAccum: String(a.openingAccum || "") })}>{L("এডিট", "Edit")}</button>}
                        {isOwner && !a.disposal && <button type="button" className="pm-btn-secondary" onClick={() => setDispose({ id: a.id, date: today, proceeds: "", receivedIn: CASH_ACCOUNT })}>{L("বিক্রি / বাদ", "Dispose")}</button>}
                        {isOwner && a.disposal && <button type="button" className="pm-btn-secondary" onClick={() => undoDisposal(a)} disabled={busy}>{L("বিক্রি বাতিল", "Undo disposal")}</button>}
                        {isOwner && !a.disposal && !hasDep(a) && <button type="button" className="pm-btn-secondary" onClick={() => remove(a)} disabled={busy}>{L("মুছুন", "Delete")}</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {assets.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <strong>{L("মাসিক অবচয়", "Monthly depreciation")}</strong>
            <span className="si-muted">{L("যে মাস পর্যন্ত", "Up to month")}</span>
            <input type="month" className="pm-input" style={{ width: 150 }} value={depMonth} onChange={(e) => e.target.value && setDepMonth(e.target.value)} />
            {due.length ? <span>{L(`বাকি মাস: ${due.join(", ")}`, `Months to post: ${due.join(", ")}`)}{depPreview ? ` · ${due[0]}: ${cur} ${money(depPreview.total)}` : ""}</span> : <span className="si-muted">{L("সব মাস দেওয়া আছে", "All months posted")}</span>}
            {isOwner && <button type="button" className="pm-btn pm-btn--primary" onClick={postDepreciation} disabled={busy || !due.length || depBlk.length > 0}>{L("অবচয় দিন", "Post depreciation")}</button>}
            {isOwner && lastDep && <button type="button" className="pm-btn-secondary" onClick={cancelLastDep} disabled={busy}>{L(`${lastDep.faMonth} বাতিল`, `Cancel ${lastDep.faMonth}`)}</button>}
            {depBlk.map((b) => <span key={b.id} style={{ color: "#b45309", fontSize: 12.5 }}>{bn ? b.bn : b.en}</span>)}
          </div>
        )}
        {!isOwner && <div className="si-muted">{L("সম্পদ যোগ, অবচয় আর বিক্রি শুধু মালিক পারেন", "Only the owner can add assets, post depreciation or record a disposal")}</div>}
        <div className="si-note">
          {L(
            "প্রতিটি সম্পদ বুক করলে একটা জার্নাল হয় (FA-…): \"Fixed Assets - ধরন\" খাতে দাম, VAT থাকলে VAT Input (VAT রিটার্নে আসে), টাকা যায় নগদ / ব্যাংক / সাপ্লায়ারের খাত থেকে, আগে থেকে থাকা সম্পদ Opening Balance থেকে। অবচয় সরল রেখায়: (দাম - অবশিষ্ট) ÷ আয়ু, বুকিংয়ের মাস থেকে পুরো মাস; প্রতি মাসে একটা জার্নাল (FA-DEP-…) - Depreciation খরচ, \"Accumulated Depreciation - ধরন\" জমা। বিক্রি / বাদে দাম আর জমা অবচয় সরে, লাভ / ক্ষতি আলাদা খাতে যায়। ব্যালেন্স শিটে \"স্থায়ী সম্পদ\" অংশে দাম - অবচয় দেখায়, ওয়ার্কিং ক্যাপিটালে ধরা হয় না। বছর বন্ধে Depreciation আর লাভ / ক্ষতি মূলধনে যায়।",
            "Booking an asset posts one journal (FA-…): the cost to \"Fixed Assets - category\", VAT (if any) to VAT Input (it shows in the VAT return), paid from cash / bank / the supplier's ledger, or Opening Balance for an asset already owned. Depreciation is straight line: (cost - residual) ÷ life, a full month from the booking month; one journal a month (FA-DEP-…) - Depreciation expense, credited to \"Accumulated Depreciation - category\". A disposal removes the cost and its depreciation and books the gain or loss. The Balance Sheet shows \"Fixed assets\" as cost less depreciation, left out of working capital. Year-end close moves Depreciation and the gain / loss into Capital.",
          )}
        </div>
      </div>
    </fieldset>
  );
}

