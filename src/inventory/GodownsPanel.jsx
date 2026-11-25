// Godowns / locations tab of the Stock Hub: the location tree with stock and value per location, items at a
// location, transfers between locations (transfer note print, cancel) and Excel. The owner sets up locations
// (shop.stockLocations); staff with stock rights record transfers (locationMoves). Rules in stockLocations.js.
import React, { useEffect, useMemo, useState } from "react";
import { offlineCreate, offlineList, offlineUpdate } from "../offline/offlineRepository";
import { saveShopRecord } from "../offline/shopService";
import { rowsOf } from "./stockFromInvoices";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { saveTextFile } from "../utils/saveTextFile.js";
import { logAudit } from "../utils/auditLog.js";
import { csvText } from "../reports/vatExport.js";
import { onHandAt } from "../reports/stockHub.js";
import {
  LOCATION_KINDS, MAIN_LOCATION_ID, MAX_LOCATION_DEPTH, cancelBlockers, depthOf, liveMoves, locationItems, locationName, locationPath, locationStock, locationSummary,
  locationTree, moveBlockers, moveDoc, negativeAtLocations, nextMoveNo, normalizeLocations, qtyIn, toSavedLocations, usedLocationIds, validateLocation,
} from "./stockLocations.js";

const money = (v) => (Math.round(((Number(v) || 0) + Number.EPSILON) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qf = (v) => (Math.round((Number(v) || 0) * 1000) / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 });
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const LOC_ERR = {
  name: ["নাম দিন", "Type the name"], duplicate: ["এই নামে লোকেশন আছে", "A location with this name exists"], duplicateCode: ["এই কোড আছে", "This code is in use"],
  parent: ["উপরের লোকেশন পাওয়া যায়নি", "Parent location not found"], cycle: ["নিজের ভেতরে রাখা যায় না", "A location cannot sit inside itself"],
  depth: [`সর্বোচ্চ ${MAX_LOCATION_DEPTH} ধাপ`, `At most ${MAX_LOCATION_DEPTH} levels`], inUse: ["স্টক / ট্রান্সফার আছে - বন্ধ করা যাবে না", "It holds stock or has transfers - it cannot be switched off"],
};

export default function GodownsPanel({ lang = "en", shopId, shop, user, profile, isOwner = false, canMove = false, canPrint = false, canSeeCost = false, products = [], movements, avgCost, day, cur = "AED", toast, shopName = "", onShopUpdated, filterIds = null }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const today = localDay();
  const who = profile?.personName || profile?.username || user?.email || "";
  const locations = useMemo(() => normalizeLocations(shop?.stockLocations), [shop?.stockLocations]);
  const [moves, setMoves] = useState([]);
  const [tick, setTick] = useState(0);
  const [selected, setSelected] = useState(MAIN_LOCATION_ID);
  const [withChildren, setWithChildren] = useState(true);
  const [locForm, setLocForm] = useState(null);
  const [move, setMove] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let off = false;
    offlineList("locationMoves").then((list) => { if (!off) setMoves(rowsOf(list).filter((m) => m && !m.isDeleted && (!m.shopId || m.shopId === shopId))); }).catch(() => { if (!off) setMoves([]); });
    return () => { off = true; };
  }, [shopId, tick]);

  const productById = useMemo(() => new Map(products.filter((p) => p?.id).map((p) => [p.id, p])), [products]);
  const stockOn = (d, skipId = "") => locationStock(onHandAt(products, movements, d), moves, locations, { asOf: d, shopId, skipId });
  const stock = useMemo(() => (movements ? stockOn(day) : null), [movements, products, moves, locations, day, shopId]); // eslint-disable-line react-hooks/exhaustive-deps
  const cost = canSeeCost ? avgCost : null;
  const summary = useMemo(() => (stock ? locationSummary(stock, locations, cost, { bn }) : []), [stock, locations, cost, bn]);
  const items = useMemo(() => (stock ? locationItems(stock, locations, selected, cost, { withChildren }) : []), [stock, locations, selected, cost, withChildren])
    .map((r) => ({ ...r, p: productById.get(r.productId) })).filter((r) => r.p && (!filterIds || filterIds.has(r.productId))).sort((a, b) => String(a.p.name).localeCompare(String(b.p.name)));
  const negatives = useMemo(() => (stock ? negativeAtLocations(stock) : []), [stock]);
  const used = useMemo(() => (stock ? usedLocationIds(stock, moves) : new Set()), [stock, moves]);
  const live = useMemo(() => liveMoves(moves, shopId).sort((a, b) => String(b.moveDate).localeCompare(String(a.moveDate)) || String(b.moveNo).localeCompare(String(a.moveNo))), [moves, shopId]);
  const locById = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);
  const locLabel = (id) => locationPath(locations, id, bn) || id;
  const run = async (fn) => { if (busy) return; setBusy(true); try { await fn(); } catch (e) { toast?.(e?.message || String(e), "err"); } finally { setBusy(false); } };
  const synced = () => { setTick((v) => v + 1); if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {}); };

  // ---- locations (owner) ----
  const saveLocation = () => run(async () => {
    const res = validateLocation(locForm, locations, { usedIds: used });
    if (res.error) { toast?.(L(...LOC_ERR[res.error]), "err"); return; }
    const next = [...locations.filter((l) => l.id !== res.location.id), { ...res.location, isMain: res.location.id === MAIN_LOCATION_ID }];
    const saved = toSavedLocations(next);
    const updated = await saveShopRecord(shopId, { stockLocations: saved }, { ownerUid: user?.uid, profile, user });
    onShopUpdated?.(updated || { stockLocations: saved });
    setLocForm(null);
    toast?.(L("লোকেশন সেভ হয়েছে", "Location saved"));
  });
  const removeLocation = (l) => run(async () => {
    if (l.isMain || used.has(l.id) || locations.some((x) => x.parentId === l.id)) { toast?.(L("স্টক / ট্রান্সফার / নিচের লোকেশন আছে - মোছা যাবে না", "It holds stock, has transfers or sub-locations - it cannot be removed"), "err"); return; }
    if (!window.confirm(L(`${locationName(l, true)} মুছবেন?`, `Remove ${l.name}?`))) return;
    const saved = toSavedLocations(locations.filter((x) => x.id !== l.id));
    const updated = await saveShopRecord(shopId, { stockLocations: saved }, { ownerUid: user?.uid, profile, user });
    onShopUpdated?.(updated || { stockLocations: saved });
    if (selected === l.id) setSelected(MAIN_LOCATION_ID);
  });

  // ---- transfers ----
  const lineProduct = (text) => {
    const t = String(text || "").trim().toLowerCase();
    if (!t) return null;
    return products.find((p) => `${p.code || p.barcode || ""} - ${p.name}`.toLowerCase() === t) || products.find((p) => [p.code, p.barcode].some((c) => c && String(c).toLowerCase() === t)) || null;
  };
  const moveDraft = () => move && ({ ...move, lines: move.lines.map((l) => ({ productId: lineProduct(l.text)?.id || "", qty: l.qty })) });
  const moveBlk = useMemo(() => (move && movements ? moveBlockers(moveDraft(), { locations, products, stockOn, today }) : []), [move, movements, moves, locations, products, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const fromStock = move && movements && move.moveDate ? stockOn(move.moveDate) : null;
  const saveMove = () => run(async () => {
    const d = moveDraft();
    if (moveBlk.length) return;
    const doc = moveDoc({ ...d, fromName: locLabel(d.fromId), toName: locLabel(d.toId) }, { shopId, moveNo: nextMoveNo(moves), products, uid: user?.uid || "", by: who });
    const res = await offlineCreate("locationMoves", doc);
    logAudit({ shopId, user, profile, action: "create", collection: "locationMoves", docId: res?.documentId, docNo: doc.moveNo, note: `${doc.fromName} to ${doc.toName}` });
    toast?.(L(`ট্রান্সফার ${doc.moveNo} সেভ হয়েছে`, `Transfer ${doc.moveNo} saved`));
    setMove(null);
    synced();
  });
  const cancelMove = (m) => run(async () => {
    const blk = cancelBlockers(m, { stockOn, today, locations });
    if (blk.length) { toast?.(bn ? blk[0].bn : blk[0].en, "err"); return; }
    if (!window.confirm(L(`${m.moveNo} বাতিল করবেন? মাল আগের লোকেশনে ফিরবে।`, `Cancel ${m.moveNo}? The goods go back to where they came from.`))) return;
    await offlineUpdate("locationMoves", m.id, { ...m, status: "cancelled", cancelledAt: new Date().toISOString(), cancelledBy: user?.uid || "", updatedAt: new Date().toISOString(), updatedBy: user?.uid || "" });
    logAudit({ shopId, user, profile, action: "cancel", collection: "locationMoves", docId: m.id, docNo: m.moveNo, note: `${m.fromName} to ${m.toName}` });
    toast?.(L("বাতিল হয়েছে", "Cancelled"));
    synced();
  });

  // ---- print / Excel ----
  const summaryCols = [L("লোকেশন", "Location"), L("আইটেম", "Items"), L("পরিমাণ", "Qty"), ...(canSeeCost ? [`${L("মূল্য", "Value")} (${cur})`] : [])];
  const summaryRows = () => summary.map((s) => [`${"  ".repeat(s.depth)}${s.name}`, String(s.items), qf(s.qty), ...(canSeeCost ? [money(s.value)] : [])]);
  const itemCols = [L("কোড", "Code"), L("প্রোডাক্ট", "Product"), L("একক", "Unit"), L("পরিমাণ", "Qty"), ...(canSeeCost ? [`${L("গড় খরচ", "Avg cost")} (${cur})`, `${L("মূল্য", "Value")} (${cur})`] : [])];
  const itemRows = () => items.map((r) => [r.p.code || r.p.barcode || "", r.p.name, r.p.unit || "", qf(r.qty), ...(canSeeCost ? [r.qty > 0 ? money(r.cost) : "", r.qty > 0 ? money(r.value) : L("মাইনাস", "negative")] : [])]);
  const printStock = () => {
    const a = generateStatementHTML({ shopName, title: "STOCK BY LOCATION", subtitle: `As at ${fmtDay(day)}`, cols: summaryCols.map((label, i) => ({ label, align: i ? "right" : undefined })), rows: summaryRows() });
    printWithSettings(a, { lang });
  };
  const printItems = () => printWithSettings(generateStatementHTML({
    shopName, title: "LOCATION STOCK", subtitle: `${locLabel(selected)}${withChildren ? " (with sub-locations)" : ""} - ${fmtDay(day)}`,
    cols: itemCols.map((label, i) => ({ label, align: i >= 3 ? "right" : undefined })), rows: itemRows(),
  }), { lang });
  const printMove = (m) => printWithSettings(generateStatementHTML({
    shopName, title: "STOCK TRANSFER NOTE", subtitle: `${m.moveNo} - ${fmtDay(m.moveDate)}`,
    partyLine: `From: ${m.fromName || locLabel(m.fromId)}   To: ${m.toName || locLabel(m.toId)}${m.note ? `   Note: ${m.note}` : ""}${m.status === "cancelled" ? "   CANCELLED" : ""}`,
    cols: [{ label: "Code" }, { label: "Item" }, { label: "Unit" }, { label: "Qty", align: "right" }],
    rows: (m.lines || []).map((l) => [l.code || "", l.name || productById.get(l.productId)?.name || l.productId, l.unit || "", qf(l.qty)]),
    summaryLines: [`Sent by: ${m.createdByName || ""}`, "Received by: ____________________"],
  }), { lang });
  const exportCsv = async () => {
    const moveRows = live.map((m) => (m.lines || []).map((l) => [m.moveNo, m.moveDate, m.fromName || locLabel(m.fromId), m.toName || locLabel(m.toId), l.code || "", l.name || "", qf(l.qty)])).flat();
    const rows = [[`Stock by location as at ${day}`], summaryCols, ...summaryRows(), [], [`${locLabel(selected)}`], itemCols, ...itemRows(), [], ["Transfers"], ["No", "Date", "From", "To", "Code", "Item", "Qty"], ...moveRows];
    try { await saveTextFile(`stock-locations-${day}.csv`, csvText(rows)); } catch (e) { toast?.(e?.message || String(e), "err"); }
  };

  const activeLocs = locationTree(locations).filter(({ loc }) => loc.active);
  const locOptions = activeLocs.map(({ loc, depth }) => <option key={loc.id} value={loc.id}>{`${"- ".repeat(depth)}${locationName(loc, bn)}`}</option>);
  const productList = (
    <datalist id="godown-products">{products.filter((p) => p?.id && !p.isDeleted).slice(0, 3000).map((p) => <option key={p.id} value={`${p.code || p.barcode || ""} - ${p.name}`} />)}</datalist>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div className="si-toolbar">
        {isOwner && <button type="button" className="pm-btn-secondary" onClick={() => setLocForm({ name: "", nameBn: "", code: "", kind: "godown", parentId: "", active: true, note: "" })} disabled={busy}>{L("নতুন লোকেশন", "New location")}</button>}
        {canMove && <button type="button" className="pm-btn pm-btn--primary" onClick={() => setMove({ moveDate: today, fromId: MAIN_LOCATION_ID, toId: activeLocs.find(({ loc }) => !loc.isMain)?.loc.id || "", note: "", lines: [{ text: "", qty: "" }] })} disabled={busy || locations.length < 2}>{L("নতুন ট্রান্সফার", "New transfer")}</button>}
        <span className="si-toolbar-gap" />
        {canPrint && <button type="button" className="pm-btn-secondary" onClick={printStock} disabled={!stock}>{L("লোকেশন অনুযায়ী প্রিন্ট", "Print by location")}</button>}
        {canPrint && <button type="button" className="pm-btn-secondary" onClick={exportCsv} disabled={!stock}>Excel</button>}
      </div>

      {locations.length < 2 && <div className="si-hint">{isOwner ? L("শুরু করতে \"নতুন লোকেশন\" দিয়ে গোডাউন / র‍্যাক যোগ করুন। সব স্টক এখন মূল দোকানে।", "Add a godown or rack with \"New location\" to start. All stock is at the main store now.") : L("মালিক এখনো কোনো গোডাউন যোগ করেননি - সব স্টক মূল দোকানে।", "The owner has not added any godown yet - all stock is at the main store.")}</div>}
      {negatives.length > 0 && (
        <div className="si-hint" style={{ color: "#b91c1c" }}>
          {L("মাইনাস স্টক: ", "Below zero: ")}
          {negatives.slice(0, 8).map((x) => `${locationName(locById.get(x.locationId), bn)} - ${productById.get(x.productId)?.name || x.productId} ${qf(x.qty)}`).join("; ")}
          {negatives.length > 8 ? ` +${negatives.length - 8}` : ""}
          {" "}{L("(বিক্রি সবসময় মূল দোকান থেকে কমে - গোডাউন থেকে মাল মূল দোকানে ট্রান্সফার করুন)", "(sales always come off the main store - transfer the goods from the godown to the main store)")}
        </div>
      )}

      {locForm && (
        <div className="pm-panel" style={{ padding: 8, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 6 }}>
          <label>{L("নাম (EN)", "Name (EN)")}<input className="pm-input" value={locForm.name} onChange={(e) => setLocForm((f) => ({ ...f, name: e.target.value }))} /></label>
          <label>{L("নাম (বাংলা)", "Name (BN)")}<input className="pm-input" value={locForm.nameBn} onChange={(e) => setLocForm((f) => ({ ...f, nameBn: e.target.value }))} /></label>
          <label>{L("কোড", "Code")}<input className="pm-input" value={locForm.code} onChange={(e) => setLocForm((f) => ({ ...f, code: e.target.value }))} /></label>
          <label>{L("ধরন", "Kind")}<select className="pm-input" value={locForm.kind} onChange={(e) => setLocForm((f) => ({ ...f, kind: e.target.value }))}>{LOCATION_KINDS.map((k) => <option key={k.key} value={k.key}>{bn ? k.bn : k.en}</option>)}</select></label>
          {locForm.id !== MAIN_LOCATION_ID && <label>{L("কোথার ভেতরে", "Inside")}<select className="pm-input" value={locForm.parentId} onChange={(e) => setLocForm((f) => ({ ...f, parentId: e.target.value }))}>
            <option value="">{L("- আলাদা -", "- top level -")}</option>
            {locationTree(locations).filter(({ loc }) => loc.id !== locForm.id && depthOf(locations, loc.id) < MAX_LOCATION_DEPTH).map(({ loc, depth }) => <option key={loc.id} value={loc.id}>{`${"- ".repeat(depth)}${locationName(loc, bn)}`}</option>)}
          </select></label>}
          <label>{L("নোট", "Note")}<input className="pm-input" value={locForm.note} onChange={(e) => setLocForm((f) => ({ ...f, note: e.target.value }))} /></label>
          {locForm.id && locForm.id !== MAIN_LOCATION_ID && <label style={{ display: "flex", gap: 4, alignItems: "center" }}><input type="checkbox" checked={locForm.active !== false} onChange={(e) => setLocForm((f) => ({ ...f, active: e.target.checked }))} /> {L("চালু", "Active")}</label>}
          <div style={{ display: "flex", gap: 6, alignItems: "end" }}>
            <button type="button" className="pm-btn pm-btn--primary" onClick={saveLocation} disabled={busy}>{L("সেভ", "Save")}</button>
            <button type="button" className="pm-btn-secondary" onClick={() => setLocForm(null)}>{L("বাতিল", "Cancel")}</button>
          </div>
        </div>
      )}

      {move && (
        <div className="pm-panel" style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          {productList}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "end" }}>
            <label>{L("তারিখ", "Date")}<input type="date" className="pm-input" max={today} value={move.moveDate} onChange={(e) => setMove((m) => ({ ...m, moveDate: e.target.value }))} /></label>
            <label>{L("যেখান থেকে", "From")}<select className="pm-input" value={move.fromId} onChange={(e) => setMove((m) => ({ ...m, fromId: e.target.value }))}>{locationTree(locations).map(({ loc, depth }) => <option key={loc.id} value={loc.id}>{`${"- ".repeat(depth)}${locationName(loc, bn)}`}</option>)}</select></label>
            <label>{L("যেখানে", "To")}<select className="pm-input" value={move.toId} onChange={(e) => setMove((m) => ({ ...m, toId: e.target.value }))}><option value="">-</option>{locOptions}</select></label>
            <label style={{ flex: 1, minWidth: 160 }}>{L("নোট", "Note")}<input className="pm-input" value={move.note} onChange={(e) => setMove((m) => ({ ...m, note: e.target.value }))} /></label>
          </div>
          <table className="sh-table">
            <thead><tr><th>{L("আইটেম (কোড বা নাম)", "Item (code or name)")}</th><th className="num">{L("সেখানে আছে", "Available there")}</th><th className="num" style={{ width: 110 }}>{L("পরিমাণ", "Qty")}</th><th /></tr></thead>
            <tbody>
              {move.lines.map((l, i) => {
                const p = lineProduct(l.text);
                return (
                  <tr key={i}>
                    <td><input className="pm-input" list="godown-products" value={l.text} onChange={(e) => setMove((m) => ({ ...m, lines: m.lines.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) }))} /></td>
                    <td className="num">{p && fromStock ? `${qf(qtyIn(fromStock, move.fromId, p.id))} ${p.unit || ""}` : ""}</td>
                    <td><input className="pm-input" inputMode="decimal" style={{ textAlign: "right" }} value={l.qty} onChange={(e) => setMove((m) => ({ ...m, lines: m.lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)) }))} /></td>
                    <td><button type="button" className="pm-btn-secondary" onClick={() => setMove((m) => ({ ...m, lines: m.lines.length > 1 ? m.lines.filter((_, j) => j !== i) : [{ text: "", qty: "" }] }))}>{L("সরান", "Remove")}</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" className="pm-btn-secondary" onClick={() => setMove((m) => ({ ...m, lines: [...m.lines, { text: "", qty: "" }] }))}>{L("আরও লাইন", "Add line")}</button>
            <span className="si-toolbar-gap" />
            <button type="button" className="pm-btn pm-btn--primary" onClick={saveMove} disabled={busy || moveBlk.length > 0}>{L("ট্রান্সফার সেভ", "Save transfer")}</button>
            <button type="button" className="pm-btn-secondary" onClick={() => setMove(null)}>{L("বাতিল", "Cancel")}</button>
          </div>
          {moveBlk.map((b, i) => <div key={i} style={{ color: "#b91c1c", fontSize: 12.5 }}>{b.productId ? `${productById.get(b.productId)?.name || ""}: ` : ""}{bn ? b.bn : b.en}</div>)}
        </div>
      )}

      <div className={"si-cols"} style={{ alignItems: "start" }}>
        <div className="si-box" style={{ overflow: "auto" }}>
          <table className="sh-table">
            <thead><tr><th>{L("লোকেশন", "Location")}</th><th className="num">{L("আইটেম", "Items")}</th><th className="num">{L("পরিমাণ", "Qty")}</th>{canSeeCost && <th className="num">{L("মূল্য", "Value")}</th>}{isOwner && <th />}</tr></thead>
            <tbody>
              {summary.map((s) => (
                <tr key={s.id} className="is-link" onClick={() => setSelected(s.id)} style={{ background: selected === s.id ? "#eef4ff" : undefined, color: s.loc.active ? undefined : "#94a3b8" }}>
                  <td style={{ paddingLeft: 6 + s.depth * 14, fontWeight: s.depth ? 400 : 700 }}>{s.name}{s.loc.code ? ` (${s.loc.code})` : ""}{!s.loc.active ? ` - ${L("বন্ধ", "off")}` : ""}</td>
                  <td className="num">{s.items}</td><td className="num">{qf(s.qty)}</td>{canSeeCost && <td className="num">{money(s.value)}</td>}
                  {isOwner && <td style={{ whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="pm-btn-secondary" onClick={() => setLocForm({ ...s.loc })}>{L("এডিট", "Edit")}</button>
                    {!s.loc.isMain && !used.has(s.id) && !locations.some((x) => x.parentId === s.id) && <button type="button" className="pm-btn-secondary" onClick={() => removeLocation(s.loc)} disabled={busy}>{L("মুছুন", "Remove")}</button>}
                  </td>}
                </tr>
              ))}
            </tbody>
            {summary.length > 0 && <tfoot><tr><td>{L("দোকানের মোট", "Shop total")}</td><td /><td className="num">{qf(summary.filter((s) => !s.depth).reduce((t, s) => t + s.qty, 0))}</td>{canSeeCost && <td className="num">{money(summary.filter((s) => !s.depth).reduce((t, s) => t + s.value, 0))}</td>}{isOwner && <td />}</tr></tfoot>}
          </table>
        </div>
        <div className="si-box" style={{ overflow: "auto" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", padding: 4, flexWrap: "wrap" }}>
            <strong>{locLabel(selected)}</strong>
            {locations.some((x) => x.parentId === selected) && <label style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><input type="checkbox" checked={withChildren} onChange={(e) => setWithChildren(e.target.checked)} /> {L("ভেতরের লোকেশনসহ", "With sub-locations")}</label>}
            <span className="si-toolbar-gap" />
            {canPrint && <button type="button" className="pm-btn-secondary" onClick={printItems} disabled={!items.length}>{L("প্রিন্ট", "Print")}</button>}
          </div>
          {!items.length ? <div className="si-empty">{L("এখানে কোনো স্টক নেই", "No stock here")}</div> : (
            <table className="sh-table">
              <thead><tr>{itemCols.map((c, i) => <th key={c} className={i >= 3 ? "num" : undefined}>{c}</th>)}</tr></thead>
              <tbody>{items.map((r) => (
                <tr key={r.productId} className={r.qty < 0 ? "is-neg" : undefined}>
                  <td>{r.p.code || r.p.barcode || ""}</td><td>{r.p.name}</td><td>{r.p.unit || ""}</td><td className="num">{qf(r.qty)}</td>
                  {canSeeCost && <><td className="num">{r.qty > 0 ? money(r.cost) : ""}</td><td className="num">{r.qty > 0 ? money(r.value) : L("মাইনাস", "negative")}</td></>}
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </div>

      <div className="si-box" style={{ overflow: "auto", maxHeight: 260 }}>
        <div style={{ padding: 4 }}><strong>{L("লোকেশন ট্রান্সফার", "Location transfers")}</strong></div>
        {!live.length ? <div className="si-empty">{L("এখনো কোনো ট্রান্সফার নেই", "No transfers yet")}</div> : (
          <table className="sh-table">
            <thead><tr><th>{L("নং", "No")}</th><th>{L("তারিখ", "Date")}</th><th>{L("যেখান থেকে", "From")}</th><th>{L("যেখানে", "To")}</th><th className="num">{L("আইটেম", "Items")}</th><th>{L("নোট", "Note")}</th><th /></tr></thead>
            <tbody>{live.slice(0, 200).map((m) => (
              <tr key={m.id}>
                <td>{m.moveNo}</td><td>{fmtDay(m.moveDate)}</td><td>{m.fromName || locLabel(m.fromId)}</td><td>{m.toName || locLabel(m.toId)}</td>
                <td className="num">{(m.lines || []).length}</td><td>{m.note || ""}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {canPrint && <button type="button" className="pm-btn-secondary" onClick={() => printMove(m)}>{L("প্রিন্ট", "Print")}</button>}
                  {canMove && (isOwner || m.createdBy === user?.uid) && <button type="button" className="pm-btn-secondary" onClick={() => cancelMove(m)} disabled={busy}>{L("বাতিল", "Cancel")}</button>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
      <div className="si-hint">
        {L(
          "দোকানের মোট স্টক আগের মতোই বিল থেকে হিসাব হয়; লোকেশন শুধু দেখায় মাল কোথায় আছে। ক্রয়, বিক্রি, রিটার্ন আর সমন্বয় সব মূল দোকানে ধরা হয়; গোডাউনে মাল যায় শুধু ট্রান্সফারে। তাই সব লোকেশনের যোগফল = দোকানের মোট, আর মোট মূল্য = স্টকের মূল্য / ব্যালেন্স শিটের স্টক। ট্রান্সফারে টাকার কোনো হিসাব বদলায় না।",
          "The shop's total stock is worked out from the bills as before; locations only show where it sits. Purchases, sales, returns and adjustments all count at the main store; goods reach a godown only by a transfer. So all locations add up to the shop total, and their value to the stock valuation / Balance Sheet stock. A transfer changes no money figure.",
        )}
      </div>
    </div>
  );
}
