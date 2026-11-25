// Stock Hub: on hand, stock movement (moving items), item ledger, valuation and locations (rack / branch / transfers)
// in one screen. Read-only; worked out from the saved documents with the same rules as the stock shown on products.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { PM_CSS } from "../product-master/pmStyles";
import { SI_CSS, usePmFitHeight, usePmMobile } from "../sales-invoice/siSkin";
import { offlineList } from "../offline/offlineRepository";
import { computeStockMap, loadInvoiceRows, rowsOf } from "../inventory/stockFromInvoices";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { saveTextFile } from "../utils/saveTextFile.js";
import { splitRack } from "../sales-invoice/rackLocation.js";
import { BRANCH_TRANSFER_COLLECTIONS } from "../branch-transfer/branchTransferService.js";
import { BRANCH_TRANSFER_STATUSES, remainingQuantityForLine, statusLabel } from "../branch-transfer/branchTransferDomain.js";
import { branchSalesMap } from "../branch-transfer/BranchTransferNative.jsx";
import { averageCosts } from "./averageCost.js";
import GodownsPanel from "../inventory/GodownsPanel.jsx";
import { livePurchasesOf, liveReturnsOf, r2 } from "./reportFilters.js";
import { branchStock, itemLedger, movementByProduct, onHandAt, productMatches, stockMovements, valuation } from "./stockHub.js";

const money = (v) => r2(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qf = (v) => (Math.round((Number(v) || 0) * 1000) / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 });
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const monthStart = () => { const d = new Date(); return localDay(new Date(d.getFullYear(), d.getMonth(), 1)); };
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const csvCell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

const TABS = [
  { id: "onhand", bn: "হাতে স্টক", en: "On hand" },
  { id: "movement", bn: "স্টক মুভমেন্ট", en: "Movement" },
  { id: "ledger", bn: "আইটেম লেজার", en: "Item ledger" },
  { id: "valuation", bn: "স্টকের মূল্য", en: "Valuation" },
  { id: "locations", bn: "র‍্যাক / ব্রাঞ্চ", en: "Rack / branch" },
  { id: "godowns", bn: "গোডাউন / লোকেশন", en: "Godowns / locations" },
];
const KIND_LABEL = {
  purchase: ["ক্রয়", "Purchase"], goodsReceipt: ["মাল রিসিভ (GRN)", "Goods received"], sale: ["বিক্রয়", "Sale"],
  delivery: ["ডেলিভারি নোট", "Delivery note"], salesReturn: ["সেলস রিটার্ন", "Sales return"], purchaseReturn: ["পারচেজ রিটার্ন", "Purchase return"],
  adjustment: ["স্টক সমন্বয়", "Stock adjustment"], warranty: ["ওয়ারেন্টি রিপ্লেস", "Warranty replacement"],
};
const CLOSED_TRANSFER = new Set([BRANCH_TRANSFER_STATUSES.RECEIVED, BRANCH_TRANSFER_STATUSES.CANCELLED]);
// Summary figures wrap instead of being cut off with an ellipsis.
const SH_CSS = `
.sh-kpis { grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); }
.sh-kpis .si-kpi b { white-space: normal; overflow: visible; text-overflow: clip; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.sh-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.sh-table th { text-align: left; background: #e8eef7; padding: 3px 5px; border-bottom: 1px solid #8797a9; white-space: nowrap; position: sticky; top: 0; z-index: 1; }
.sh-table td { padding: 3px 5px; border-bottom: 1px solid #e2e8f0; }
.sh-table .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.sh-table tfoot td { font-weight: 700; border-top: 1px solid #7d94b7; background: #f8fafc; }
.sh-table tr.is-neg td { background: #fef2f2; color: #991b1b; }
.sh-table tr.is-link { cursor: pointer; }
.sh-table tr.is-link:hover td { background: #eef4ff; }
`;

export default function StockHubReport({ lang = "en", shopId, products = [], shopName = "", toast, canPrint = false, canSeeCost = false, cur = "AED",
  shop = null, user = null, profile = null, isOwner = false, canMove = false, onShopUpdated }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const [tab, setTab] = useState("onhand");
  const [asOf, setAsOf] = useState(() => localDay());
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(() => localDay());
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [onlyNegative, setOnlyNegative] = useState(false);
  const [showZero, setShowZero] = useState(false);
  const [moveDetail, setMoveDetail] = useState(false);
  const [kind, setKind] = useState("");
  const [ledgerId, setLedgerId] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const mobile = usePmMobile();
  const rootRef = useRef(null);
  const fitH = usePmFitHeight(rootRef, mobile, tab);

  useEffect(() => {
    let cancelled = false;
    setError("");
    Promise.all([
      loadInvoiceRows(),
      offlineList(BRANCH_TRANSFER_COLLECTIONS.STOCK_BALANCES).catch(() => []),
      offlineList(BRANCH_TRANSFER_COLLECTIONS.BRANCHES).catch(() => []),
      offlineList(BRANCH_TRANSFER_COLLECTIONS.TRANSFERS).catch(() => []),
    ]).then(([rows, bal, br, tr]) => {
      if (cancelled) return;
      const mine = (list) => rowsOf(list).filter((d) => d && !d.isDeleted && (!shopId || !d.shopId || d.shopId === shopId));
      setData({ rows, balances: mine(bal), branches: mine(br), transfers: mine(tr) });
    }).catch((err) => { console.warn("[S4 Stock Hub] load failed", err); if (!cancelled) setError(String(err?.message || err)); });
    return () => { cancelled = true; };
  }, [shopId, tick]);

  useEffect(() => {
    const refresh = () => { if (document.visibilityState !== "hidden") setTick((v) => v + 1); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);

  const day = asOf || localDay();
  const productById = useMemo(() => new Map(products.filter((p) => p?.id).map((p) => [p.id, p])), [products]);
  const movements = useMemo(() => (data ? stockMovements(products, data.rows, shopId) : null), [data, products, shopId]);
  const qtyNow = useMemo(() => (movements ? onHandAt(products, movements) : null), [movements, products]);
  const qtyAt = useMemo(() => (movements ? onHandAt(products, movements, day) : null), [movements, products, day]);

  // Same stock the product screens show; a product that disagrees with this hub is reported, never hidden.
  const mismatch = useMemo(() => {
    if (!data || !qtyNow) return [];
    const r = data.rows;
    const shop = computeStockMap(products, r.purchaseInvoices, r.salesInvoices, shopId, r.deliveryNotes, r.extras);
    const bad = [];
    shop.forEach((q, id) => { if (Math.abs(q - (qtyNow.get(id) || 0)) > 1e-6) bad.push(id); });
    return bad;
  }, [data, qtyNow, products, shopId]);

  const avgCost = useMemo(() => {
    if (!data || !canSeeCost) return new Map();
    const r = data.rows;
    // averageCosts stops at `day` itself
    const purchases = livePurchasesOf(r.purchaseInvoices, shopId).filter((inv) => inv.source !== "openingBalance");
    return averageCosts(products, purchases, day, liveReturnsOf(r.extras?.purchaseReturns, shopId));
  }, [data, products, shopId, day, canSeeCost]);

  const categories = useMemo(() => [...new Set(products.map((p) => String(p.category || "").trim()).filter(Boolean))].sort(), [products]);
  const listed = useMemo(() => products.filter((p) => p?.id && productMatches(p, search) && (!category || String(p.category || "").trim() === category)), [products, search, category]);
  const listedIds = useMemo(() => new Set(listed.map((p) => p.id)), [listed]);

  const kindName = (k) => { const x = KIND_LABEL[k]; return x ? L(x[0], x[1]) : k; };
  const nameOf = (id) => productById.get(id)?.name || id;
  const codeOf = (id) => productById.get(id)?.code || productById.get(id)?.barcode || "";

  // On hand
  const onHandRows = useMemo(() => (qtyAt ? listed.map((p) => ({ p, qty: qtyAt.get(p.id) || 0 }))
    .filter((r) => (onlyNegative ? r.qty < 0 : showZero || Math.abs(r.qty) > 1e-9))
    .sort((a, b) => (b.qty < 0) - (a.qty < 0) || String(a.p.name || "").localeCompare(String(b.p.name || ""))) : []), [qtyAt, listed, onlyNegative, showZero]);
  const negativeCount = useMemo(() => (qtyAt ? listed.filter((p) => (qtyAt.get(p.id) || 0) < 0).length : 0), [qtyAt, listed]);

  // Movement
  const movementIn = useMemo(() => (movements ? movements.filter((m) => listedIds.has(m.productId) && (!kind || m.kind === kind)) : []), [movements, listedIds, kind]);
  const byProduct = useMemo(() => movementByProduct(movementIn, { from, to }), [movementIn, from, to]);
  const movingRows = useMemo(() => [...byProduct.entries()].map(([id, r]) => ({ id, ...r })).sort((a, b) => b.out - a.out || b.in - a.in), [byProduct]);
  const movementLines = useMemo(() => movementIn.filter((m) => (!from || m.date >= from) && (!to || m.date <= to)), [movementIn, from, to]);
  const badRange = !!(from && to && from > to);

  // Item ledger
  const ledgerChoices = useMemo(() => listed.slice(0, 300), [listed]);
  const ledgerProduct = productById.get(ledgerId) || null;
  const ledger = useMemo(() => (movements && ledgerProduct ? itemLedger(products, movements, ledgerProduct.id, { from, to }) : null), [movements, products, ledgerProduct, from, to]);

  // Valuation
  const val = useMemo(() => (qtyAt ? valuation(listed, qtyAt, avgCost) : null), [qtyAt, listed, avgCost]);

  // Locations
  const branch = useMemo(() => {
    if (!data || !qtyNow) return null;
    const sold = branchSalesMap(products, data.rows.salesInvoices, data.rows.deliveryNotes, shopId);
    return branchStock(data.balances, sold, qtyNow, data.branches);
  }, [data, qtyNow, products, shopId]);
  const branchRows = useMemo(() => (branch ? branch.rows.filter((r) => listedIds.has(r.productId)) : []), [branch, listedIds]);
  const openTransfers = useMemo(() => (data ? data.transfers.filter((t) => !CLOSED_TRANSFER.has(t.status))
    .map((t) => ({ t, qty: (t.items || []).filter((it) => !it.productId || listedIds.has(it.productId)).reduce((s, it) => s + remainingQuantityForLine(t, it), 0) }))
    .filter((x) => x.qty > 1e-9).sort((a, b) => String(b.t.createdAt || "").localeCompare(String(a.t.createdAt || ""))) : []), [data, listedIds]);
  const rackRows = useMemo(() => (qtyNow ? listed.filter((p) => String(p.rackLocation || "").trim())
    .map((p) => ({ p, ...splitRack(p.rackLocation), qty: qtyNow.get(p.id) || 0 }))
    .sort((a, b) => a.rack.localeCompare(b.rack, undefined, { numeric: true }) || a.floor.localeCompare(b.floor, undefined, { numeric: true }) || a.bin.localeCompare(b.bin, undefined, { numeric: true })) : []), [listed, qtyNow]);
  const noRack = useMemo(() => listed.filter((p) => !String(p.rackLocation || "").trim() && (qtyNow?.get(p.id) || 0) > 0).length, [listed, qtyNow]);

  // One table per tab, shared by screen totals, print and CSV.
  const sheet = () => {
    const codeCol = L("কোড", "Code"), prodCol = L("প্রোডাক্ট", "Product"), qtyCol = L("পরিমাণ", "Qty");
    if (tab === "onhand") {
      const cols = [codeCol, prodCol, L("ব্র্যান্ড", "Brand"), L("ক্যাটাগরি", "Category"), L("র‍্যাক", "Rack"), L("ইউনিট", "Unit"), qtyCol, ...(canSeeCost ? [`${L("মূল্য", "Value")} (${cur})`] : [])];
      const rows = onHandRows.map(({ p, qty }) => [p.code || p.barcode || "", p.name, p.brand || "", p.category || "", p.rackLocation || "", p.unit || "", qf(qty), ...(canSeeCost ? [qty > 0 ? money(qty * (avgCost.get(p.id) || 0)) : ""] : [])]);
      return { title: `${L("হাতে স্টক", "STOCK ON HAND")} — ${fmtDay(day)}`, cols, rows, num: [6, 7], foot: ["", `${onHandRows.length} ${L("টি প্রোডাক্ট", "products")}`, "", "", "", "", qf(onHandRows.reduce((t, r) => t + r.qty, 0)), ...(canSeeCost ? [money(onHandRows.reduce((t, r) => t + (r.qty > 0 ? r.qty * (avgCost.get(r.p.id) || 0) : 0), 0))] : [])] };
    }
    if (tab === "movement" && !moveDetail) {
      const cols = [codeCol, prodCol, L("ঢুকেছে", "In"), L("বেরিয়েছে", "Out"), L("নিট", "Net"), L("ডকুমেন্ট", "Docs"), L("শেষ মুভমেন্ট", "Last moved"), L("এখন হাতে", "On hand now")];
      const rows = movingRows.map((r) => [codeOf(r.id), nameOf(r.id), qf(r.in), qf(r.out), qf(r.net), String(r.docs), fmtDay(r.last), qf(qtyNow?.get(r.id) || 0)]);
      return { title: `${L("মুভিং আইটেম", "MOVING ITEMS")} — ${fmtDay(from)} - ${fmtDay(to)}`, cols, rows, num: [2, 3, 4, 5, 7], foot: ["", `${movingRows.length}`, qf(movingRows.reduce((t, r) => t + r.in, 0)), qf(movingRows.reduce((t, r) => t + r.out, 0)), qf(movingRows.reduce((t, r) => t + r.net, 0)), "", "", ""] };
    }
    if (tab === "movement") {
      const cols = [L("তারিখ", "Date"), L("ধরন", "Kind"), L("নং", "No"), L("পার্টি", "Party"), codeCol, prodCol, L("ঢুকেছে", "In"), L("বেরিয়েছে", "Out")];
      const rows = movementLines.map((m) => [fmtDay(m.date), kindName(m.kind), m.no, m.party, codeOf(m.productId), nameOf(m.productId), m.qtyIn ? qf(m.qtyIn) : "", m.qtyOut ? qf(m.qtyOut) : ""]);
      return { title: `${L("স্টক মুভমেন্ট", "STOCK MOVEMENT")} — ${fmtDay(from)} - ${fmtDay(to)}`, cols, rows, num: [6, 7], foot: ["", "", "", "", "", `${movementLines.length}`, qf(movementLines.reduce((t, m) => t + m.qtyIn, 0)), qf(movementLines.reduce((t, m) => t + m.qtyOut, 0))] };
    }
    if (tab === "ledger") {
      const cols = [L("তারিখ", "Date"), L("ধরন", "Kind"), L("নং", "No"), L("পার্টি", "Party"), L("ঢুকেছে", "In"), L("বেরিয়েছে", "Out"), L("ব্যালেন্স", "Balance")];
      if (!ledger) return { title: L("আইটেম লেজার", "ITEM LEDGER"), cols, rows: [], num: [4, 5, 6], foot: null };
      const rows = [["", "", "", L("ওপেনিং", "Opening"), "", "", qf(ledger.opening)], ...ledger.lines.map((m) => [fmtDay(m.date), kindName(m.kind), m.no, m.party, m.qtyIn ? qf(m.qtyIn) : "", m.qtyOut ? qf(m.qtyOut) : "", qf(m.balance)])];
      return { title: `${L("আইটেম লেজার", "ITEM LEDGER")} — ${fmtDay(from)} - ${fmtDay(to)}`, party: `${ledgerProduct.code || ""} ${ledgerProduct.name} (${ledgerProduct.unit || "Pcs"})`.trim(), cols, rows, num: [4, 5, 6], foot: ["", "", "", L("সমাপনী", "Closing"), qf(ledger.qtyIn), qf(ledger.qtyOut), qf(ledger.closing)] };
    }
    if (tab === "valuation") {
      const cols = [codeCol, prodCol, L("ক্যাটাগরি", "Category"), qtyCol, `${L("গড় খরচ", "Avg cost")} (${cur})`, `${L("মূল্য", "Value")} (${cur})`];
      const rows = (val?.rows || []).map((r) => [r.code, r.name, r.category, qf(r.qty), r.qty > 0 ? money(r.cost) : "", r.qty > 0 ? money(r.value) : L("মাইনাস", "negative")]);
      return { title: `${L("স্টকের মূল্য", "STOCK VALUATION")} — ${fmtDay(day)}`, cols, rows, num: [3, 4, 5], foot: ["", `${rows.length}`, "", "", "", money(val?.total || 0)] };
    }
    const cols = [L("ব্রাঞ্চ", "Branch"), codeCol, prodCol, L("পাঠানো / রিসিভ", "Received"), L("ব্রাঞ্চে বিক্রি", "Sold at branch"), L("ব্রাঞ্চে এখন", "At branch now")];
    const rows = branchRows.map((r) => [r.branchName, codeOf(r.productId), nameOf(r.productId), qf(r.received), qf(r.sold), qf(r.current)]);
    const rackPart = rackRows.map((r) => [`${L("র‍্যাক", "Rack")} ${[r.rack, r.floor, r.bin].filter(Boolean).join(" / ")}`, r.p.code || "", r.p.name, "", "", qf(r.qty)]);
    return { title: L("র‍্যাক / ব্রাঞ্চ স্টক", "RACK / BRANCH STOCK"), cols, rows: [...rows, ...(rows.length && rackPart.length ? [["", "", "", "", "", ""]] : []), ...rackPart], num: [3, 4, 5], foot: null };
  };

  const print = () => {
    const s = sheet();
    printWithSettings(generateStatementHTML({
      shopName, title: s.title.toUpperCase(), subtitle: search || category ? [search, category].filter(Boolean).join(" · ") : "", partyLine: s.party || "",
      cols: s.cols.map((label, i) => ({ label, align: s.num.includes(i) ? "right" : undefined })), rows: s.rows, ...(s.foot ? { foot: s.foot } : {}),
    }), { lang });
  };
  const exportCsv = async () => {
    const s = sheet();
    const text = "\uFEFF" + [s.cols, ...s.rows, ...(s.foot ? [s.foot] : [])].map((r) => r.map((c) => csvCell(String(c ?? "").trim())).join(",")).join("\r\n");
    try { await saveTextFile(`stock-${tab}-${tab === "onhand" || tab === "valuation" ? day : `${from || "start"}_${to || "today"}`}.csv`, text); } catch (e) { toast?.(e.message || String(e), "err"); }
  };

  const openLedger = (id) => { setLedgerId(id); setTab("ledger"); };
  const kpi = (label, value, color) => (
    <div className="si-kpi" title={`${label}: ${value}`}><span>{label}</span><b style={{ color }}>{value}</b></div>
  );
  const usesAsOf = tab === "onhand" || tab === "valuation" || tab === "godowns";
  const usesRange = tab === "movement" || tab === "ledger";
  const ready = !!movements;
  const warn = { color: "#b45309", fontWeight: 700, marginTop: 3 };
  const tableBox = { overflow: "auto", maxHeight: mobile ? undefined : 460 };

  return (
    <div ref={rootRef} className="si-root" style={fitH ? { height: fitH } : undefined}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>
      <style>{SH_CSS}</style>
      <div className="pm-reference-title">
        <strong> {L("স্টক হাব", "Stock Hub")}</strong>
        <span>{usesAsOf ? `${L("পর্যন্ত", "As at")} ${fmtDay(day)}` : usesRange ? `${fmtDay(from) || L("শুরু", "Start")} — ${fmtDay(to) || L("আজ", "Today")}` : L("এখন", "Now")}</span>
      </div>
      <div className="si-toolbar">
        <div className="si-pills">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={`pm-btn-secondary${tab === t.id ? " is-active" : ""}`} onClick={() => setTab(t.id)}>{bn ? t.bn : t.en}</button>
          ))}
        </div>
        <span className="si-toolbar-gap" />
        {canPrint && tab !== "godowns" && <button type="button" className="pm-btn pm-btn--primary" onClick={print} disabled={!ready || (tab === "ledger" && !ledger)}> {L("প্রিন্ট", "Print")}</button>}
        {canPrint && tab !== "godowns" && <button type="button" className="pm-btn-secondary" onClick={exportCsv} disabled={!ready || (tab === "ledger" && !ledger)}> Excel</button>}
        <button type="button" className="pm-btn-secondary" onClick={() => setTick((v) => v + 1)}> {L("রিফ্রেশ", "Refresh")}</button>
      </div>
      <div className="si-toolbar">
        <input className="pm-input" style={{ width: mobile ? "100%" : 220 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={L("কোড, নাম, ব্র্যান্ড বা র‍্যাক", "Code, name, brand or rack")} />
        {categories.length > 0 && (
          <select className="pm-input" style={{ width: mobile ? "100%" : 160 }} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{L("সব ক্যাটাগরি", "All categories")}</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {tab === "onhand" && (
          <>
            <label className="pm-btn-secondary" style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
              <input type="checkbox" checked={onlyNegative} onChange={(e) => setOnlyNegative(e.target.checked)} /> {L("শুধু মাইনাস", "Negative only")}
            </label>
            <label className="pm-btn-secondary" style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
              <input type="checkbox" checked={showZero} onChange={(e) => setShowZero(e.target.checked)} /> {L("শূন্যও দেখান", "Show zero")}
            </label>
          </>
        )}
        {tab === "movement" && (
          <>
            <select className="pm-input" style={{ width: mobile ? "100%" : 160 }} value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">{L("সব ধরন", "All kinds")}</option>
              {Object.keys(KIND_LABEL).map((k) => <option key={k} value={k}>{kindName(k)}</option>)}
            </select>
            <label className="pm-btn-secondary" style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
              <input type="checkbox" checked={moveDetail} onChange={(e) => setMoveDetail(e.target.checked)} /> {L("প্রতিটি ডকুমেন্ট", "Each document")}
            </label>
          </>
        )}
        {tab === "ledger" && (
          <select className="pm-input" style={{ width: mobile ? "100%" : 260 }} value={ledgerId} onChange={(e) => setLedgerId(e.target.value)}>
            <option value="">{L("প্রোডাক্ট বাছুন", "Choose a product")}{listed.length > ledgerChoices.length ? ` (${L("খুঁজে কমান", "search to narrow")})` : ""}</option>
            {ledgerProduct && !ledgerChoices.includes(ledgerProduct) && <option value={ledgerProduct.id}>{ledgerProduct.code} {ledgerProduct.name}</option>}
            {ledgerChoices.map((p) => <option key={p.id} value={p.id}>{[p.code, p.name].filter(Boolean).join("  ")}</option>)}
          </select>
        )}
        <span className="si-toolbar-gap" />
        {usesAsOf && (
          <>
            <button type="button" className={`pm-btn-secondary${day === localDay() ? " is-active" : ""}`} onClick={() => setAsOf(localDay())}>{L("আজ", "Today")}</button>
            <input type="date" className="pm-input" style={{ width: mobile ? "48%" : 130 }} value={asOf} onChange={(e) => setAsOf(e.target.value)} title={L("যে তারিখ পর্যন্ত", "As at date")} />
          </>
        )}
        {usesRange && (
          <>
            <button type="button" className={`pm-btn-secondary${from === monthStart() && to === localDay() ? " is-active" : ""}`} onClick={() => { setFrom(monthStart()); setTo(localDay()); }}>{L("এই মাস", "This month")}</button>
            <button type="button" className={`pm-btn-secondary${!from && !to ? " is-active" : ""}`} onClick={() => { setFrom(""); setTo(""); }}>{L("সব সময়", "All time")}</button>
            <input type="date" className="pm-input" style={{ width: mobile ? "calc(50% - 2px)" : 120, borderColor: badRange ? "#b91c1c" : undefined }} value={from} onChange={(e) => setFrom(e.target.value)} />
            <input type="date" className="pm-input" style={{ width: mobile ? "calc(50% - 2px)" : 120, borderColor: badRange ? "#b91c1c" : undefined }} value={to} onChange={(e) => setTo(e.target.value)} />
          </>
        )}
      </div>

      {ready && (
        <div className="si-kpis sh-kpis">
          {tab === "onhand" && <>
            {kpi(L("প্রোডাক্ট", "Products"), String(onHandRows.length))}
            {kpi(L("মোট পরিমাণ", "Total qty"), qf(onHandRows.reduce((t, r) => t + Math.max(0, r.qty), 0)))}
            {kpi(L("মাইনাস স্টক", "Negative stock"), String(negativeCount), negativeCount ? "#b91c1c" : "#15803d")}
            {canSeeCost && val && kpi(L("স্টকের মূল্য", "Stock value"), `${cur} ${money(val.total)}`, "#15803d")}
          </>}
          {tab === "movement" && <>
            {kpi(L("যে প্রোডাক্ট নড়েছে", "Products moved"), String(movingRows.length))}
            {kpi(L("ঢুকেছে", "Qty in"), qf(movingRows.reduce((t, r) => t + r.in, 0)), "#15803d")}
            {kpi(L("বেরিয়েছে", "Qty out"), qf(movingRows.reduce((t, r) => t + r.out, 0)), "#b91c1c")}
            {kpi(L("ডকুমেন্ট লাইন", "Document lines"), String(movementLines.length))}
          </>}
          {tab === "ledger" && ledger && <>
            {kpi(L("ওপেনিং", "Opening"), qf(ledger.opening))}
            {kpi(L("ঢুকেছে", "In"), qf(ledger.qtyIn), "#15803d")}
            {kpi(L("বেরিয়েছে", "Out"), qf(ledger.qtyOut), "#b91c1c")}
            {kpi(L("সমাপনী", "Closing"), qf(ledger.closing), ledger.closing < 0 ? "#b91c1c" : undefined)}
            {kpi(L("এখন হাতে", "On hand now"), qf(qtyNow?.get(ledgerProduct.id) || 0))}
          </>}
          {tab === "valuation" && val && <>
            {canSeeCost && kpi(L("মোট মূল্য (গড় খরচে)", "Total value (average cost)"), `${cur} ${money(val.total)}`, "#15803d")}
            {kpi(L("প্রোডাক্ট", "Products"), String(val.rows.length))}
            {kpi(L("ক্রয়মূল্য নেই", "No purchase cost"), String(val.unpriced), val.unpriced ? "#b45309" : undefined)}
            {kpi(L("মাইনাস (মূল্য ধরা হয়নি)", "Negative (not valued)"), String(val.negative), val.negative ? "#b91c1c" : undefined)}
          </>}
          {tab === "locations" && branch && <>
            {kpi(L("ব্রাঞ্চ", "Branches"), String(data.branches.length))}
            {kpi(L("ব্রাঞ্চে মোট", "Qty at branches"), qf(branchRows.reduce((t, r) => t + Math.max(0, r.current), 0)))}
            {kpi(L("পথে থাকা ট্রান্সফার", "Open transfers"), String(openTransfers.length))}
            {kpi(L("র‍্যাক ছাড়া (স্টক আছে)", "In stock, no rack"), String(noRack), noRack ? "#b45309" : undefined)}
          </>}
        </div>
      )}

      <div className="si-body">
        {error && <div className="si-paid-box is-due">{L("ডেটা পড়া যায়নি: ", "Could not load: ")}{error}</div>}
        {ready && tab === "godowns" && (
          <GodownsPanel lang={lang} shopId={shopId} shop={shop} user={user} profile={profile} isOwner={isOwner} canMove={canMove} canPrint={canPrint} canSeeCost={canSeeCost}
            products={products} movements={movements} avgCost={avgCost} day={day} cur={cur} toast={toast} shopName={shopName} onShopUpdated={onShopUpdated} filterIds={search || category ? listedIds : null} />
        )}
        {badRange && usesRange && <div className="si-paid-box is-due">{L("শুরুর তারিখ শেষের তারিখের পরে — তারিখ ঠিক করুন", "The start date is after the end date — fix the dates")}</div>}
        {mismatch.length > 0 && (
          <div className="si-paid-box is-due">{L(`${mismatch.length}টি প্রোডাক্টের হিসাব প্রোডাক্ট পেজের স্টকের সাথে মেলেনি: ${mismatch.slice(0, 5).map(nameOf).join(", ")}`, `${mismatch.length} product(s) do not agree with the stock on the product screen: ${mismatch.slice(0, 5).map(nameOf).join(", ")}`)}</div>
        )}
        {!ready && !error && <div className="si-empty">{L("লোড হচ্ছে…", "Loading…")}</div>}

        {ready && tab === "onhand" && (
          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{L("হাতে স্টক", "Stock on hand")} — {fmtDay(day)}</legend>
            <div className="si-panel-body" style={tableBox}>
              <table className="sh-table">
                <thead><tr>
                  <th>{L("কোড", "Code")}</th><th>{L("প্রোডাক্ট", "Product")}</th>{!mobile && <th>{L("ব্র্যান্ড", "Brand")}</th>}{!mobile && <th>{L("র‍্যাক", "Rack")}</th>}
                  <th className="num">{L("পরিমাণ", "Qty")}</th>{canSeeCost && <th className="num">{L("মূল্য", "Value")}</th>}
                </tr></thead>
                <tbody>
                  {onHandRows.map(({ p, qty }) => (
                    <tr key={p.id} className={`is-link${qty < 0 ? " is-neg" : ""}`} onClick={() => openLedger(p.id)} title={L("আইটেম লেজার খুলুন", "Open item ledger")}>
                      <td>{p.code || p.barcode || ""}</td><td>{p.name}</td>{!mobile && <td>{p.brand || ""}</td>}{!mobile && <td>{p.rackLocation || ""}</td>}
                      <td className="num" style={{ fontWeight: 700 }}>{qf(qty)} <span style={{ color: "#64748b", fontWeight: 400 }}>{p.unit || ""}</span></td>
                      {canSeeCost && <td className="num">{qty > 0 ? money(qty * (avgCost.get(p.id) || 0)) : ""}</td>}
                    </tr>
                  ))}
                  {!onHandRows.length && <tr><td colSpan={6} className="si-empty">{onlyNegative ? L("কোনো মাইনাস স্টক নেই", "No negative stock") : L("কিছু নেই", "Nothing")}</td></tr>}
                </tbody>
              </table>
            </div>
          </fieldset>
        )}

        {ready && tab === "movement" && !badRange && (
          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{moveDetail ? L("প্রতিটি ডকুমেন্ট", "Each document") : L("মুভিং আইটেম (বেশি বেরিয়েছে আগে)", "Moving items (most out first)")}</legend>
            <div className="si-panel-body" style={tableBox}>
              {!moveDetail ? (
                <table className="sh-table">
                  <thead><tr><th>{L("কোড", "Code")}</th><th>{L("প্রোডাক্ট", "Product")}</th><th className="num">{L("ঢুকেছে", "In")}</th><th className="num">{L("বেরিয়েছে", "Out")}</th><th className="num">{L("নিট", "Net")}</th>{!mobile && <th>{L("শেষ মুভমেন্ট", "Last moved")}</th>}<th className="num">{L("এখন হাতে", "On hand")}</th></tr></thead>
                  <tbody>
                    {movingRows.map((r) => (
                      <tr key={r.id} className={`is-link${(qtyNow?.get(r.id) || 0) < 0 ? " is-neg" : ""}`} onClick={() => openLedger(r.id)} title={L("আইটেম লেজার খুলুন", "Open item ledger")}>
                        <td>{codeOf(r.id)}</td><td>{nameOf(r.id)}</td><td className="num">{qf(r.in)}</td><td className="num">{qf(r.out)}</td>
                        <td className="num" style={{ color: r.net < 0 ? "#b91c1c" : "#15803d" }}>{qf(r.net)}</td>{!mobile && <td>{fmtDay(r.last)}</td>}<td className="num">{qf(qtyNow?.get(r.id) || 0)}</td>
                      </tr>
                    ))}
                    {!movingRows.length && <tr><td colSpan={7} className="si-empty">{L("এই সময়ে কোনো মুভমেন্ট নেই", "Nothing moved in this period")}</td></tr>}
                  </tbody>
                </table>
              ) : (
                <table className="sh-table">
                  <thead><tr><th>{L("তারিখ", "Date")}</th><th>{L("ধরন", "Kind")}</th><th>{L("নং", "No")}</th>{!mobile && <th>{L("পার্টি", "Party")}</th>}<th>{L("প্রোডাক্ট", "Product")}</th><th className="num">{L("ঢুকেছে", "In")}</th><th className="num">{L("বেরিয়েছে", "Out")}</th></tr></thead>
                  <tbody>
                    {movementLines.map((m, i) => (
                      <tr key={`${m.col}:${m.docId}:${m.productId}:${i}`} className="is-link" onClick={() => openLedger(m.productId)}>
                        <td>{fmtDay(m.date)}</td><td>{kindName(m.kind)}</td><td>{m.no}</td>{!mobile && <td>{m.party}</td>}<td>{nameOf(m.productId)}</td>
                        <td className="num" style={{ color: "#15803d" }}>{m.qtyIn ? qf(m.qtyIn) : ""}</td><td className="num" style={{ color: "#b91c1c" }}>{m.qtyOut ? qf(m.qtyOut) : ""}</td>
                      </tr>
                    ))}
                    {!movementLines.length && <tr><td colSpan={7} className="si-empty">{L("এই সময়ে কোনো মুভমেন্ট নেই", "Nothing moved in this period")}</td></tr>}
                  </tbody>
                </table>
              )}
            </div>
          </fieldset>
        )}

        {ready && tab === "ledger" && !badRange && (
          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{ledgerProduct ? `${ledgerProduct.code || ""} ${ledgerProduct.name} (${ledgerProduct.unit || "Pcs"})` : L("আইটেম লেজার", "Item ledger")}</legend>
            <div className="si-panel-body" style={tableBox}>
              {!ledger ? (
                <div className="si-empty">{L("উপর থেকে প্রোডাক্ট বাছুন, বা হাতে স্টক / মুভমেন্ট-এর কোনো সারিতে ক্লিক করুন।", "Choose a product above, or click a row on On hand / Movement.")}</div>
              ) : (
                <table className="sh-table">
                  <thead><tr><th>{L("তারিখ", "Date")}</th><th>{L("ধরন", "Kind")}</th><th>{L("নং", "No")}</th>{!mobile && <th>{L("পার্টি", "Party")}</th>}<th className="num">{L("ঢুকেছে", "In")}</th><th className="num">{L("বেরিয়েছে", "Out")}</th><th className="num">{L("ব্যালেন্স", "Balance")}</th></tr></thead>
                  <tbody>
                    <tr style={{ fontWeight: 700 }}><td colSpan={mobile ? 3 : 4}>{L("ওপেনিং", "Opening")}{from ? ` (${fmtDay(from)} ${L("এর আগে", "before")})` : ` (${L("প্রোডাক্ট মাস্টার", "product master")})`}</td><td /><td /><td className="num">{qf(ledger.opening)}</td></tr>
                    {ledger.lines.map((m, i) => (
                      <tr key={`${m.col}:${m.docId}:${i}`} className={m.balance < 0 ? "is-neg" : ""}>
                        <td>{fmtDay(m.date)}</td><td>{kindName(m.kind)}</td><td>{m.no}</td>{!mobile && <td>{m.party}</td>}
                        <td className="num" style={{ color: "#15803d" }}>{m.qtyIn ? qf(m.qtyIn) : ""}</td><td className="num" style={{ color: "#b91c1c" }}>{m.qtyOut ? qf(m.qtyOut) : ""}</td><td className="num" style={{ fontWeight: 700 }}>{qf(m.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr><td colSpan={mobile ? 3 : 4}>{L("সমাপনী", "Closing")}</td><td className="num">{qf(ledger.qtyIn)}</td><td className="num">{qf(ledger.qtyOut)}</td><td className="num">{qf(ledger.closing)}</td></tr></tfoot>
                </table>
              )}
            </div>
          </fieldset>
        )}

        {ready && tab === "valuation" && val && (
          <div className={mobile ? "" : "si-cols"} style={mobile ? { display: "flex", flexDirection: "column", gap: 4 } : { alignItems: "start", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)" }}>
            <fieldset className="pm-panel" style={{ margin: 0 }}>
              <legend className="pm-panel-legend">{L("প্রোডাক্ট অনুযায়ী", "By product")} — {fmtDay(day)}</legend>
              <div className="si-panel-body" style={tableBox}>
                {!canSeeCost ? (
                  <div className="si-empty">{L("ক্রয়মূল্য দেখার অনুমতি নেই, তাই মূল্য দেখানো হচ্ছে না।", "You are not allowed to see purchase cost, so values are hidden.")}</div>
                ) : (
                  <table className="sh-table">
                    <thead><tr><th>{L("কোড", "Code")}</th><th>{L("প্রোডাক্ট", "Product")}</th><th className="num">{L("পরিমাণ", "Qty")}</th><th className="num">{L("গড় খরচ", "Avg cost")}</th><th className="num">{L("মূল্য", "Value")}</th></tr></thead>
                    <tbody>
                      {[...val.rows].sort((a, b) => b.value - a.value || a.qty - b.qty).map((r) => (
                        <tr key={r.id} className={`is-link${r.qty < 0 ? " is-neg" : ""}`} onClick={() => openLedger(r.id)}>
                          <td>{r.code}</td><td>{r.name}</td><td className="num">{qf(r.qty)}</td>
                          <td className="num" style={{ color: r.qty > 0 && !r.cost ? "#b45309" : undefined }}>{r.qty > 0 ? money(r.cost) : ""}</td>
                          <td className="num" style={{ fontWeight: 700 }}>{r.qty > 0 ? money(r.value) : L("মাইনাস", "negative")}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr><td colSpan={4}>{L("মোট", "Total")}</td><td className="num">{cur} {money(val.total)}</td></tr></tfoot>
                  </table>
                )}
              </div>
            </fieldset>
            {canSeeCost && (
              <fieldset className="pm-panel" style={{ margin: 0 }}>
                <legend className="pm-panel-legend">{L("ক্যাটাগরি অনুযায়ী", "By category")}</legend>
                <div className="si-panel-body" style={tableBox}>
                  <table className="sh-table">
                    <thead><tr><th>{L("ক্যাটাগরি", "Category")}</th><th className="num">{L("পরিমাণ", "Qty")}</th><th className="num">{L("মূল্য", "Value")}</th></tr></thead>
                    <tbody>{val.byCategory.map((c) => <tr key={c.name} className="is-link" onClick={() => setCategory(c.name === "-" ? "" : c.name)}><td>{c.name}</td><td className="num">{qf(c.qty)}</td><td className="num">{money(c.value)}</td></tr>)}</tbody>
                  </table>
                </div>
              </fieldset>
            )}
          </div>
        )}

        {ready && tab === "locations" && branch && (
          <div className={mobile ? "" : "si-cols"} style={mobile ? { display: "flex", flexDirection: "column", gap: 4 } : { alignItems: "start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <fieldset className="pm-panel" style={{ margin: 0 }}>
                <legend className="pm-panel-legend">{L("ব্রাঞ্চের স্টক", "Branch stock")}</legend>
                <div className="si-panel-body" style={tableBox}>
                  {!data.branches.length && !branchRows.length ? (
                    <div className="si-empty">{L("কোনো ব্রাঞ্চ সেট করা নেই। Branch ট্রান্সফার চালু করলে এখানে দেখাবে।", "No branches set up. Branch transfer stock will show here once it is used.")}</div>
                  ) : (
                    <table className="sh-table">
                      <thead><tr><th>{L("ব্রাঞ্চ", "Branch")}</th><th>{L("প্রোডাক্ট", "Product")}</th><th className="num">{L("রিসিভ", "Received")}</th><th className="num">{L("বিক্রি", "Sold")}</th><th className="num">{L("এখন", "Now")}</th><th className="num">{L("মেইন দোকানে", "At main shop")}</th></tr></thead>
                      <tbody>
                        {branchRows.map((r) => (
                          <tr key={`${r.branchId}|${r.productId}`} className={`is-link${r.current < 0 ? " is-neg" : ""}`} onClick={() => openLedger(r.productId)}>
                            <td>{r.branchName}</td><td>{nameOf(r.productId)}</td><td className="num">{qf(r.received)}</td><td className="num">{qf(r.sold)}</td>
                            <td className="num" style={{ fontWeight: 700 }}>{qf(r.current)}</td><td className="num" style={{ color: (branch.main.get(r.productId) || 0) < 0 ? "#b91c1c" : undefined }}>{qf(branch.main.get(r.productId) || 0)}</td>
                          </tr>
                        ))}
                        {!branchRows.length && <tr><td colSpan={6} className="si-empty">{L("ব্রাঞ্চে কোনো স্টক নেই", "No stock at branches")}</td></tr>}
                      </tbody>
                    </table>
                  )}
                </div>
              </fieldset>
              {openTransfers.length > 0 && (
                <fieldset className="pm-panel" style={{ margin: 0 }}>
                  <legend className="pm-panel-legend">{L("খোলা ট্রান্সফার (এখনো পুরো রিসিভ হয়নি)", "Open transfers (not fully received)")}</legend>
                  <div className="si-panel-body" style={tableBox}>
                    <table className="sh-table">
                      <thead><tr><th>{L("নং", "No")}</th><th>{L("তারিখ", "Date")}</th><th>{L("ব্রাঞ্চ", "Branch")}</th><th>{L("অবস্থা", "Status")}</th><th className="num">{L("বাকি পরিমাণ", "Qty pending")}</th></tr></thead>
                      <tbody>{openTransfers.map(({ t, qty }) => <tr key={t.id}><td>{t.transferNo || ""}</td><td>{fmtDay(t.createdAt)}</td><td>{t.branchName || ""}</td><td>{statusLabel(t.status, lang)}</td><td className="num">{qf(qty)}</td></tr>)}</tbody>
                    </table>
                  </div>
                </fieldset>
              )}
            </div>
            <fieldset className="pm-panel" style={{ margin: 0 }}>
              <legend className="pm-panel-legend">{L("র‍্যাক অনুযায়ী", "By rack")} ({rackRows.length})</legend>
              <div className="si-panel-body" style={tableBox}>
                <table className="sh-table">
                  <thead><tr><th>{L("র‍্যাক", "Rack")}</th><th>{L("তাক", "Floor")}</th><th>{L("বিন", "Bin")}</th><th>{L("প্রোডাক্ট", "Product")}</th><th className="num">{L("হাতে", "On hand")}</th></tr></thead>
                  <tbody>
                    {rackRows.map((r) => (
                      <tr key={r.p.id} className={`is-link${r.qty < 0 ? " is-neg" : ""}`} onClick={() => openLedger(r.p.id)}>
                        <td>{r.rack}</td><td>{r.floor}</td><td>{r.bin}</td><td>{r.p.name}</td><td className="num">{qf(r.qty)}</td>
                      </tr>
                    ))}
                    {!rackRows.length && <tr><td colSpan={5} className="si-empty">{L("কোনো প্রোডাক্টে র‍্যাক লেখা নেই (প্রোডাক্ট মাস্টার > Rack)", "No product has a rack yet (Product Master > Rack)")}</td></tr>}
                  </tbody>
                </table>
              </div>
            </fieldset>
          </div>
        )}

        {ready && (
          <div className="si-note">
            {L(
              "সেভ করা ডকুমেন্ট থেকে হিসাব, প্রোডাক্ট পেজের স্টকের একই নিয়মে: ওপেনিং স্টক + confirmed ক্রয়, মাল রিসিভ, সেলস রিটার্ন ও ওয়ারেন্টি রিপ্লেস − বিক্রি, ডেলিভারি নোট ও পারচেজ রিটার্ন ± স্টক সমন্বয়। ডেলিভারি নোট / GRN-এর সাথে যুক্ত বিল শুধু পার্থক্যটুকু নাড়ায়; ব্রাঞ্চ ট্রান্সফারের ভেতরের ক্রয় বিল স্টক নাড়ায় না। Draft ও বাতিল ধরা হয়নি। পরিমাণ বেস ইউনিটে। মূল্য = হাতে পরিমাণ × ওই তারিখ পর্যন্ত গড় ক্রয়মূল্য (VAT বাদে), ব্যালেন্স শিটের মতোই; মাইনাস স্টকের মূল্য ধরা হয় না। ব্রাঞ্চের স্টক = ব্রাঞ্চে রিসিভ − ব্রাঞ্চ থেকে বিক্রি; মেইন দোকান = মোট − ব্রাঞ্চ।",
              "Worked out from the saved documents with the same rules as the stock on the product screen: opening stock + confirmed purchases, goods received, sales returns and warranty replacements − sales, delivery notes and purchase returns ± stock adjustments. A bill linked to a delivery note / GRN moves only the difference; branch-transfer purchase bills move nothing. Drafts and cancelled documents are not counted. Quantities are in base units. Value = quantity on hand × average purchase cost up to that date (VAT excluded), as on the Balance Sheet; negative stock is not valued. Branch stock = received at the branch − sold from the branch; main shop = total − branches."
            )}
            {negativeCount > 0 && tab !== "onhand" && <div style={warn}>{L(`${negativeCount}টি প্রোডাক্টের স্টক মাইনাস — হাতে স্টক ট্যাবে "শুধু মাইনাস" দেখুন।`, `${negativeCount} product(s) have negative stock — see "Negative only" on the On hand tab.`)}</div>}
            {tab === "valuation" && val?.unpriced > 0 && <div style={warn}>{L(`${val.unpriced}টি প্রোডাক্টের ক্রয়মূল্য নেই, তাই মূল্য 0 ধরা হয়েছে।`, `${val.unpriced} product(s) in stock have no purchase cost, so they are valued at 0.`)}</div>}
          </div>
        )}
      </div>
      <div className="si-statusbar">
        {ready && <span>{L("প্রোডাক্ট", "Products")} <b>{listed.length}</b></span>}
        {ready && <span>{L("মুভমেন্ট লাইন", "Movement lines")} <b>{movements.length}</b></span>}
        <span>{L("উইন্ডোতে ফিরলে নিজে থেকে রিফ্রেশ হয়", "Refreshes automatically when you come back to the window")}</span>
      </div>
    </div>
  );
}
