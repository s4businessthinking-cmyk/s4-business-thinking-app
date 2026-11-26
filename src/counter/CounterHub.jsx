// Counter hub: the cash shift (open with the drawer cash, close with the counted cash against what the books expect),
// customer loyalty (the earning rule and each member's points - earn only, no redeem yet) and the customer display
// window. Rules are in counterShift.js, loyalty.js and customerDisplay.js; bills, vouchers and stock are only read.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { PM_CSS } from "../product-master/pmStyles";
import { SI_CSS, usePmFitHeight, usePmMobile } from "../sales-invoice/siSkin";
import { offlineCreate, offlineList, offlineUpdate } from "../offline/offlineRepository";
import { loadInvoiceRows, rowsOf } from "../inventory/stockFromInvoices";
import { saveShopRecord } from "../offline/shopService";
import { expenseCategoryLabel } from "../expenses/ExpensesTab.jsx";
import { siCalcLine } from "../sales-invoice/salesInvoiceShared.js";
import { saveTextFile } from "../utils/saveTextFile.js";
import { csvText } from "../reports/vatExport.js";
import { buildGlobalLedger } from "../ledger/globalLedger.js";
import { TYPE_LABEL } from "../ledger/GlobalLedgerWindow.jsx";
import { liveSalesOf, r2 } from "../reports/reportFilters.js";
import { closeShiftPatch, isoOf, openShiftDoc, openShifts, shiftCash, shiftCsvRows, shiftFileName, shiftSummary } from "./counterShift.js";
import { isMember, loyaltyBalances, memberCsvRows, normalizeLoyalty, rateOn, withRate } from "./loyalty.js";
import { billSnapshot, closeCustomerDisplay, isDisplayOpen, openCustomerDisplay } from "./customerDisplay.js";
import { kickCashDrawer, loadPrintSettings } from "../print/printSettings.js";
import { normalizeDrawerSettings, drawerPrinterName } from "./cashDrawer.js";
import DateField from "../components/DateField.jsx";

const money = (v) => r2(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtTime = (iso) => {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const CH_CSS = `
.ch-kpis { grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); }
.ch-kpis .si-kpi b { white-space: normal; overflow: visible; text-overflow: clip; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.ch-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.ch-table th { text-align: left; background: #e8eef7; padding: 3px 5px; border-bottom: 1px solid #8797a9; white-space: nowrap; position: sticky; top: 0; }
.ch-table td { padding: 3px 5px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
.ch-table .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.ch-form { display: flex; flex-wrap: wrap; gap: 6px; align-items: flex-end; }
.ch-form label { display: flex; flex-direction: column; gap: 2px; font-size: 11.5px; font-weight: 700; }
`;

export default function CounterHub({ lang = "en", shopId, shop, user, profile, isOwner = false, canSell = false, canPrint = false, customers = [], shopName = "", cur = "AED", toast, onShopUpdated, onOpenCustomers }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const [section, setSection] = useState("shift");
  const [data, setData] = useState(null);
  const [shifts, setShifts] = useState([]);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [busy, setBusy] = useState(false);
  const [openForm, setOpenForm] = useState({ counter: "", openingCash: "" });
  const [closeForm, setCloseForm] = useState({ closingCash: "", note: "" });
  const [rateForm, setRateForm] = useState({ per: "", from: localDay(), enabled: true });
  const [displayOpen, setDisplayOpen] = useState(isDisplayOpen());
  const mobile = usePmMobile();
  const rootRef = useRef(null);
  const fitH = usePmFitHeight(rootRef, mobile);
  const actorName = profile?.personName || profile?.username || user?.email || "";

  // Same documents and loading as the Global Ledger, plus the shifts.
  useEffect(() => {
    let cancelled = false;
    setError("");
    Promise.all([
      loadInvoiceRows(), offlineList("salesReceipts"), offlineList("purchasePayments"), offlineList("expenses"),
      offlineList("accountVouchers").catch(() => []), offlineList("partnerEntries").catch(() => []), offlineList("bankReconciliations").catch(() => []),
      offlineList("counterShifts").catch(() => []),
    ]).then(([rows, rc, pm, ex, av, pe, br, cs]) => {
      if (cancelled) return;
      setData({
        salesInvoices: rows.salesInvoices, purchaseInvoices: rows.purchaseInvoices, salesReturns: rows.extras?.salesReturns || [], purchaseReturns: rows.extras?.purchaseReturns || [],
        receipts: rowsOf(rc), payments: rowsOf(pm), expenses: rowsOf(ex), accountVouchers: rowsOf(av), partnerEntries: rowsOf(pe),
        bankEntries: rowsOf(br).filter((d) => d?.kind === "entry"),
      });
      setShifts(rowsOf(cs).filter((s) => s && !s.isDeleted && s.shopId === shopId));
      setNow(new Date());
    }).catch((err) => { console.warn("[S4 Counter] load failed", err); if (!cancelled) setError(String(err?.message || err)); });
    return () => { cancelled = true; };
  }, [shopId, tick]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState !== "hidden") setTick((v) => v + 1); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = setInterval(() => setDisplayOpen(isDisplayOpen()), 2000);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); clearInterval(timer); };
  }, []);

  const ledger = useMemo(() => (data ? buildGlobalLedger(data, { shopId, customers, expenseLabel: (e) => expenseCategoryLabel(e, false) }) : null), [data, shopId, customers]);
  const open = openShifts(shifts, shopId);
  const current = open[0] || null;
  const liveCash = useMemo(() => (ledger && current ? shiftCash(ledger, data, current.openedAt, isoOf(now)) : null), [ledger, data, current, now]);
  const summary = current ? shiftSummary(current, liveCash) : null;
  const closed = useMemo(() => shifts.filter((s) => s.status === "closed").sort((a, b) => isoOf(b.openedAt).localeCompare(isoOf(a.openedAt))), [shifts]);

  const loyalty = useMemo(() => normalizeLoyalty(shop?.loyaltySettings), [shop?.loyaltySettings]);
  const members = useMemo(() => customers.filter(isMember), [customers]);
  const balances = useMemo(() => (data ? loyaltyBalances({ customers, salesInvoices: data.salesInvoices, salesReturns: data.salesReturns, settings: loyalty, shopId }) : new Map()), [data, customers, loyalty, shopId]);
  const perToday = rateOn(loyalty, localDay());

  const syncSoon = () => { if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {}); };
  const errText = (code) => ({
    open: L("একটা শিফট এখনো খোলা আছে - আগে সেটা বন্ধ করুন", "A shift is still open - close it first"),
    amount: L("টাকার পরিমাণ সঠিকভাবে দিন (০ বা তার বেশি)", "Enter a valid amount (0 or more)"),
    closed: L("এই শিফট আগেই বন্ধ হয়েছে", "This shift is already closed"),
    rate: L("প্রতি পয়েন্টের টাকা ০-এর বেশি দিন", "Amount per point must be above 0"),
    date: L("শুরুর তারিখ দিন", "Enter the start date"),
  }[code] || code);

  const doOpen = async () => {
    if (!canSell || busy) return;
    const res = openShiftDoc(openForm, shifts, { shopId, uid: user?.uid || "", name: actorName });
    if (res.error) { toast?.(errText(res.error), "err"); return; }
    setBusy(true);
    try {
      const saved = await offlineCreate("counterShifts", res.doc);
      setShifts((prev) => [...prev, { ...res.doc, id: saved.documentId }]);
      setOpenForm({ counter: "", openingCash: "" });
      toast?.(L("শিফট খোলা হয়েছে", "Shift opened"));
      syncSoon();
    } catch (e) { toast?.(e.message || String(e), "err"); } finally { setBusy(false); }
  };
  const doClose = async () => {
    if (!canSell || busy || !current) return;
    const at = new Date();
    const res = closeShiftPatch(current, shiftCash(ledger, data, current.openedAt, isoOf(at)), closeForm, { uid: user?.uid || "", name: actorName, now: at });
    if (res.error) { toast?.(errText(res.error), "err"); return; }
    setBusy(true);
    try {
      await offlineUpdate("counterShifts", current.id, res.patch);
      setShifts((prev) => prev.map((s) => (s.id === current.id ? { ...s, ...res.patch } : s)));
      setCloseForm({ closingCash: "", note: "" });
      const d = res.patch.difference;
      toast?.(Math.abs(d) < 0.005 ? L("শিফট বন্ধ - ক্যাশ মিলেছে", "Shift closed - cash matches") : L(`শিফট বন্ধ - পার্থক্য ${cur} ${money(d)}`, `Shift closed - difference ${cur} ${money(d)}`), Math.abs(d) < 0.005 ? undefined : "err");
      syncSoon();
    } catch (e) { toast?.(e.message || String(e), "err"); } finally { setBusy(false); }
  };
  const saveRate = async () => {
    if (!isOwner || busy) return;
    const res = withRate(shop?.loyaltySettings, rateForm.per, rateForm.from, rateForm.enabled);
    if (res.error) { toast?.(errText(res.error), "err"); return; }
    setBusy(true);
    try {
      const updated = await saveShopRecord(shopId, { loyaltySettings: res.settings });
      onShopUpdated?.(updated);
      setRateForm((f) => ({ ...f, per: "" }));
      toast?.(L("লয়্যালটি নিয়ম সেভ হয়েছে", "Loyalty rule saved"));
    } catch (e) { toast?.(e.message || String(e), "err"); } finally { setBusy(false); }
  };
  const toggleLoyalty = async (enabled) => {
    if (!isOwner || busy || !loyalty.rates.length) return;
    setBusy(true);
    try {
      const updated = await saveShopRecord(shopId, { loyaltySettings: { enabled, rates: loyalty.rates } });
      onShopUpdated?.(updated);
    } catch (e) { toast?.(e.message || String(e), "err"); } finally { setBusy(false); }
  };

  const lastBill = useMemo(() => {
    const live = liveSalesOf(data?.salesInvoices, shopId).filter((inv) => inv.source !== "openingBalance");
    return live.sort((a, b) => isoOf(b.createdAt).localeCompare(isoOf(a.createdAt)))[0] || null;
  }, [data, shopId]);
  const doOpenDrawer = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await kickCashDrawer(lang);
      if (result.ok) toast?.(L("ড্রয়ার খোলার সিগন্যাল পাঠানো হয়েছে", "Drawer kick sent"));
      else toast?.(result.error || L("ড্রয়ার খোলা যায়নি", "Could not open the drawer"), "err");
    } catch (e) {
      toast?.(e.message || String(e), "err");
    } finally {
      setBusy(false);
    }
  };

  const showDisplay = () => {
    const member = lastBill ? customers.find((c) => c.id === lastBill.customerId) : null;
    const snap = lastBill
      ? billSnapshot(lastBill, { shopName, cur, member: isMember(member) && loyalty.enabled ? `${member.loyaltyNo} · ${balances.get(member.id)?.points || 0} pts` : "", lineAmount: (it) => { const c = siCalcLine(it, lastBill.invoiceType === "tax"); return c.gross - c.disc + c.vat; } })
      : { shopName, cur, mode: "idle", welcome: "Welcome" };
    if (!openCustomerDisplay(snap)) toast?.(L("পপ-আপ ব্লক করা আছে - এই সাইটের জন্য পপ-আপ চালু করুন", "Pop-up blocked - allow pop-ups for this site"), "err");
    setDisplayOpen(isDisplayOpen());
  };

  const exportShifts = async () => {
    try { await saveTextFile(shiftFileName(closed.length ? localDay(new Date(closed[closed.length - 1].openedAt)) : "", localDay()), csvText(shiftCsvRows(closed))); } catch (e) { toast?.(e.message || String(e), "err"); }
  };
  const exportMembers = async () => {
    try { await saveTextFile(`loyalty-members-${localDay()}.csv`, csvText(memberCsvRows(customers, balances))); } catch (e) { toast?.(e.message || String(e), "err"); }
  };

  const kpi = (labelText, value, color) => (
    <div className="si-kpi" title={`${labelText}: ${cur} ${money(value)}`}><span>{labelText}</span><b style={{ color }}>{cur} {money(value)}</b></div>
  );
  const typeLabel = (type) => (TYPE_LABEL[type] ? TYPE_LABEL[type][bn ? 0 : 1] : type);

  return (
    <div ref={rootRef} className="si-root" style={fitH ? { height: fitH } : undefined}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>
      <style>{CH_CSS}</style>
      <div className="pm-reference-title">
        <strong> {L("কাউন্টার", "Counter")}</strong>
        <span>{current ? L(`শিফট খোলা · ${fmtTime(current.openedAt)} থেকে`, `Shift open since ${fmtTime(current.openedAt)}`) : L("কোনো শিফট খোলা নেই", "No shift open")}</span>
      </div>
      <div className="si-toolbar">
        <div className="si-pills">
          {[["shift", L("ক্যাশ শিফট", "Cash shift")], ["loyalty", L("লয়্যালটি", "Loyalty")], ["display", L("কাস্টমার ডিসপ্লে", "Customer display")]].map(([key, label]) => (
            <button key={key} type="button" className={`pm-btn-secondary${section === key ? " is-active" : ""}`} onClick={() => setSection(key)}>{label}</button>
          ))}
        </div>
        <span className="si-toolbar-gap" />
        {(isOwner || canSell) && (
          <button type="button" className="pm-btn-secondary" onClick={doOpenDrawer} disabled={busy}
            title={(() => {
              const s = normalizeDrawerSettings(loadPrintSettings());
              const p = drawerPrinterName(s);
              return p
                ? (bn ? `ESC/POS কিক → ${p} (পিন ${s.drawerPin})` : `ESC/POS kick → ${p} (pin ${s.drawerPin})`)
                : (bn ? "প্রিন্ট সেটিংসে ড্রয়ার/বিল প্রিন্টার বাছুন" : "Set drawer/bill printer in Print Settings");
            })()}>
            {L("ড্রয়ার খুলুন", "Open drawer")}
          </button>
        )}
        <button type="button" className="pm-btn-secondary" onClick={() => setTick((v) => v + 1)}> {L("রিফ্রেশ", "Refresh")}</button>
      </div>

      {section === "shift" && summary && (
        <div className="si-kpis ch-kpis">
          {kpi(L("শুরুর ক্যাশ", "Opening cash"), current.openingCash, "#1d4ed8")}
          {kpi(L("ক্যাশ এসেছে", "Cash in"), summary.cashIn, "#15803d")}
          {kpi(L("ক্যাশ গেছে", "Cash out"), summary.cashOut, "#b91c1c")}
          {kpi(L("ড্রয়ারে থাকার কথা", "Expected in drawer"), summary.expected, "#7c3aed")}
        </div>
      )}
      <div className="si-body">
        {error && <div className="si-paid-box is-due">{L("ডেটা পড়া যায়নি: ", "Could not load: ")}{error}</div>}
        {!data && !error && <div className="si-empty">{L("লোড হচ্ছে…", "Loading…")}</div>}

        {data && section === "shift" && (
          <>
            {open.length > 1 && <div className="si-paid-box is-due">{L(`${open.length}টি শিফট একসাথে খোলা (অন্য ডিভাইস থেকে সিঙ্ক হয়ে এসেছে)। সবচেয়ে নতুনটা দেখানো হচ্ছে - বাকিগুলো বন্ধ করুন।`, `${open.length} shifts are open at once (synced from another device). The newest is shown - close the others too.`)}</div>}
            {!canSell && <div className="si-paid-box">{L("শিফট খুলতে / বন্ধ করতে 'বিক্রয় ম্যানেজ' অনুমতি লাগে", "Opening and closing a shift needs the Manage Sales permission")}</div>}
            <fieldset className="pm-panel" style={{ margin: 0 }}>
              <legend className="pm-panel-legend">{current ? L("শিফট বন্ধ করুন", "Close the shift") : L("শিফট খুলুন", "Open a shift")}</legend>
              <div className="si-panel-body">
                {current ? (
                  <>
                    <div style={{ marginBottom: 6 }}>
                      {current.counter ? `${current.counter} · ` : ""}{L("খুলেছেন", "Opened by")} <b>{current.openedByName || "-"}</b> · {fmtTime(current.openedAt)}
                    </div>
                    <div className="ch-form">
                      <label>{L("গুনে পাওয়া ক্যাশ", "Counted cash")} ({cur})
                        <input className="pm-input" style={{ width: 130 }} inputMode="decimal" value={closeForm.closingCash} disabled={!canSell} onChange={(e) => setCloseForm((f) => ({ ...f, closingCash: e.target.value }))} />
                      </label>
                      <label style={{ flex: 1, minWidth: 160 }}>{L("নোট", "Note")}
                        <input className="pm-input" value={closeForm.note} disabled={!canSell} onChange={(e) => setCloseForm((f) => ({ ...f, note: e.target.value }))} />
                      </label>
                      <button type="button" className="pm-btn pm-btn--primary" onClick={doClose} disabled={!canSell || busy}>{L("শিফট বন্ধ", "Close shift")}</button>
                    </div>
                    {closeForm.closingCash !== "" && Number.isFinite(Number(closeForm.closingCash)) && (
                      <div style={{ marginTop: 6 }}>
                        {L("পার্থক্য", "Difference")}: <b style={{ color: Math.abs(Number(closeForm.closingCash) - summary.expected) < 0.005 ? "#15803d" : "#b91c1c" }}>{cur} {money(Number(closeForm.closingCash) - summary.expected)}</b>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="ch-form">
                    <label>{L("কাউন্টারের নাম (ঐচ্ছিক)", "Counter name (optional)")}
                      <input className="pm-input" style={{ width: 160 }} value={openForm.counter} disabled={!canSell} onChange={(e) => setOpenForm((f) => ({ ...f, counter: e.target.value }))} />
                    </label>
                    <label>{L("শুরুর ক্যাশ", "Opening cash")} ({cur})
                      <input className="pm-input" style={{ width: 130 }} inputMode="decimal" value={openForm.openingCash} disabled={!canSell} onChange={(e) => setOpenForm((f) => ({ ...f, openingCash: e.target.value }))} />
                    </label>
                    <button type="button" className="pm-btn pm-btn--primary" onClick={doOpen} disabled={!canSell || busy}>{L("শিফট খুলুন", "Open shift")}</button>
                  </div>
                )}
              </div>
            </fieldset>
            {current && liveCash && (
              <fieldset className="pm-panel" style={{ margin: 0 }}>
                <legend className="pm-panel-legend">{L(`এই শিফটের ক্যাশ লেনদেন (${liveCash.lines.length})`, `Cash movements this shift (${liveCash.lines.length})`)}</legend>
                <div className="si-panel-body" style={{ overflow: "auto", maxHeight: mobile ? undefined : 260 }}>
                  {!liveCash.lines.length ? <div className="si-empty">{L("এখনো কোনো ক্যাশ লেনদেন নেই", "No cash movement yet")}</div> : (
                    <table className="ch-table">
                      <thead><tr><th>{L("সময়", "Time")}</th><th>{L("ধরন", "Type")}</th><th>{L("নং", "No")}</th><th className="num">{L("এসেছে", "In")}</th><th className="num">{L("গেছে", "Out")}</th></tr></thead>
                      <tbody>
                        {liveCash.lines.map((l, i) => <tr key={i}><td>{fmtTime(l.at)}</td><td>{typeLabel(l.type)}</td><td>{l.no}</td><td className="num">{l.dr ? money(l.dr) : ""}</td><td className="num">{l.cr ? money(l.cr) : ""}</td></tr>)}
                      </tbody>
                    </table>
                  )}
                </div>
              </fieldset>
            )}
            <fieldset className="pm-panel" style={{ margin: 0 }}>
              <legend className="pm-panel-legend">{L(`বন্ধ শিফট (${closed.length})`, `Closed shifts (${closed.length})`)}</legend>
              <div className="si-panel-body" style={{ overflow: "auto", maxHeight: mobile ? undefined : 300 }}>
                {canPrint && closed.length > 0 && <div style={{ marginBottom: 4 }}><button type="button" className="pm-btn-secondary" onClick={exportShifts}> CSV</button></div>}
                {!closed.length ? <div className="si-empty">{L("এখনো কোনো শিফট বন্ধ হয়নি", "No shift closed yet")}</div> : (
                  <table className="ch-table">
                    <thead><tr><th>{L("খোলা", "Opened")}</th><th>{L("বন্ধ", "Closed")}</th><th>{L("কে", "By")}</th><th className="num">{L("শুরু", "Opening")}</th><th className="num">{L("থাকার কথা", "Expected")}</th><th className="num">{L("গোনা", "Counted")}</th><th className="num">{L("পার্থক্য", "Difference")}</th><th>{L("নোট", "Note")}</th></tr></thead>
                    <tbody>
                      {closed.slice(0, 60).map((s) => (
                        <tr key={s.id}>
                          <td>{fmtTime(s.openedAt)}{s.counter ? <div className="si-muted">{s.counter}</div> : null}</td>
                          <td>{fmtTime(s.closedAt)}</td>
                          <td>{s.openedByName}{s.closedByName && s.closedByName !== s.openedByName ? ` / ${s.closedByName}` : ""}</td>
                          <td className="num">{money(s.openingCash)}</td>
                          <td className="num">{money(s.expectedCash)}</td>
                          <td className="num">{money(s.closingCash)}</td>
                          <td className="num" style={{ color: Math.abs(Number(s.difference) || 0) < 0.005 ? "#15803d" : "#b91c1c" }}>{money(s.difference)}</td>
                          <td>{s.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </fieldset>
            <div className="si-note">
              {L(
                "দোকানে একবারে একটাই শিফট খোলা থাকে। থাকার কথা = শুরুর ক্যাশ + ক্যাশ এসেছে − ক্যাশ গেছে। ক্যাশ এসেছে / গেছে গ্লোবাল লেজারের \"Cash in Hand\" থেকে - যে বিল, রিসিপ্ট, রিফান্ড, ক্যাশ খরচ, সাপ্লায়ার পেমেন্ট আর জার্নাল / কন্ট্রা এই শিফট খোলার পর প্রথম সেভ হয়েছে। কার্ড, ব্যাংক ও চেক ক্যাশে ধরা হয় না; বাতিল বাদ। আগে সেভ করা draft পরে confirm হলে সেটা draft সেভের সময়ের শিফটে পড়ে। বিল বা ভাউচারে কিছু লেখা বা বদলানো হয় না। বন্ধ শিফট শুধু মালিক বদলাতে পারেন। ক্যাশ ড্রয়ার: Windows ডেস্কটপ অ্যাপে \"ড্রয়ার খুলুন\" বা প্রিন্ট সেটিংসে অটো — ESC/POS কিক বিল/ড্রয়ার প্রিন্টারে; ব্যর্থ হলে আসল এরর। বারকোড: সেলস বিলের Code বক্সে স্ক্যান + Enter; লাইন যোগের পর ফোকাস Code-এ থাকে।",
                "Only one shift is open in the shop at a time. Expected = opening cash + cash in − cash out. Cash in / out come from the Global Ledger's \"Cash in Hand\": the bills, receipts, refunds, cash expenses, supplier payments and journals / contras first saved after the shift was opened. Card, bank and cheque are not cash; cancelled documents are left out. A draft saved earlier and confirmed later falls in the shift its draft was saved in. Nothing is written to or changed on the bills or vouchers. Only the owner can change a closed shift. Cash drawer: Windows desktop \"Open drawer\" or Print Settings auto — ESC/POS kick to the bill/drawer printer; failures show a real error. Barcode: scan into the sales bill Code box + Enter; focus stays on Code after each line."
              )}
            </div>
          </>
        )}

        {data && section === "loyalty" && (
          <>
            <div className="si-paid-box">{L("এখন শুধু পয়েন্ট জমা হয় - পয়েন্ট খরচ (redeem) এখনো নেই।", "Earn only for now - points cannot be redeemed yet.")}</div>
            <fieldset className="pm-panel" style={{ margin: 0 }}>
              <legend className="pm-panel-legend">{L("নিয়ম", "Rule")}</legend>
              <div className="si-panel-body">
                <div style={{ marginBottom: 6 }}>
                  {loyalty.rates.length
                    ? <>{L("অবস্থা", "Status")}: <b style={{ color: loyalty.enabled ? "#15803d" : "#b91c1c" }}>{loyalty.enabled ? L("চালু", "On") : L("বন্ধ", "Off")}</b>{perToday ? <> · {L(`প্রতি ${cur} ${money(perToday)} নিট বিক্রয়ে ১ পয়েন্ট`, `1 point per ${cur} ${money(perToday)} of net sales`)}</> : null}</>
                    : L("এখনো কোনো নিয়ম নেই", "No rule set yet")}
                  {isOwner && loyalty.rates.length > 0 && (
                    <button type="button" className="pm-btn-secondary" style={{ marginLeft: 8 }} onClick={() => toggleLoyalty(!loyalty.enabled)} disabled={busy}>{loyalty.enabled ? L("বন্ধ করুন", "Turn off") : L("চালু করুন", "Turn on")}</button>
                  )}
                </div>
                {isOwner ? (
                  <div className="ch-form">
                    <label>{L("কত টাকায় ১ পয়েন্ট", "Amount per point")} ({cur})
                      <input className="pm-input" style={{ width: 120 }} inputMode="decimal" value={rateForm.per} onChange={(e) => setRateForm((f) => ({ ...f, per: e.target.value }))} />
                    </label>
                    <label>{L("যে তারিখ থেকে", "From date")}
                      <DateField className="pm-input" style={{ width: 140 }} value={rateForm.from} onChange={(e) => setRateForm((f) => ({ ...f, from: e.target.value }))} />
                    </label>
                    <button type="button" className="pm-btn pm-btn--primary" onClick={saveRate} disabled={busy}>{L("নিয়ম সেভ", "Save rule")}</button>
                  </div>
                ) : <div className="si-muted">{L("নিয়ম শুধু মালিক বদলাতে পারেন", "Only the owner can change the rule")}</div>}
                {loyalty.rates.length > 0 && (
                  <table className="ch-table" style={{ marginTop: 6, maxWidth: 360 }}>
                    <thead><tr><th>{L("যে তারিখ থেকে", "From")}</th><th className="num">{L("কত টাকায় ১ পয়েন্ট", "Amount per point")}</th></tr></thead>
                    <tbody>{loyalty.rates.map((r) => <tr key={r.from}><td>{r.from.split("-").reverse().join("/")}</td><td className="num">{money(r.per)}</td></tr>)}</tbody>
                  </table>
                )}
              </div>
            </fieldset>
            <fieldset className="pm-panel" style={{ margin: 0 }}>
              <legend className="pm-panel-legend">{L(`সদস্য (${members.length})`, `Members (${members.length})`)}</legend>
              <div className="si-panel-body" style={{ overflow: "auto", maxHeight: mobile ? undefined : 360 }}>
                <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                  {canPrint && members.length > 0 && <button type="button" className="pm-btn-secondary" onClick={exportMembers}> CSV</button>}
                  {onOpenCustomers && <button type="button" className="pm-btn-secondary" onClick={onOpenCustomers}>{L("কাস্টমার মাস্টার", "Customer master")}</button>}
                </div>
                {!members.length ? <div className="si-empty">{L("কোনো সদস্য নেই - কাস্টমার মাস্টারে 'লয়্যালটি সদস্য' টিক দিন", "No members yet - tick 'Loyalty member' on the Customer master")}</div> : (
                  <table className="ch-table">
                    <thead><tr><th>{L("সদস্য নং", "Member No")}</th><th>{L("কাস্টমার", "Customer")}</th><th>{L("শুরু", "Since")}</th><th className="num">{L("বিল", "Bills")}</th><th className="num">{L("নিট বিক্রয়", "Net sales")}</th><th className="num">{L("পয়েন্ট", "Points")}</th></tr></thead>
                    <tbody>
                      {members.map((c) => ({ c, b: balances.get(c.id) || { points: 0, bills: 0, net: 0 } })).sort((a, b) => b.b.points - a.b.points || String(a.c.customerName).localeCompare(String(b.c.customerName))).map(({ c, b }) => (
                        <tr key={c.id}><td>{c.loyaltyNo}</td><td>{c.customerName}{c.mobileNumber ? <div className="si-muted">{c.mobileNumber}</div> : null}</td><td>{c.loyaltySince ? String(c.loyaltySince).slice(0, 10).split("-").reverse().join("/") : ""}</td><td className="num">{b.bills}</td><td className="num">{money(b.net)}</td><td className="num"><b>{b.points}</b></td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </fieldset>
            <div className="si-note">
              {L(
                "পয়েন্ট = নিট বিক্রয় ÷ প্রতি পয়েন্টের টাকা (ভগ্নাংশ বাদ), প্রতিটি বিলে আলাদা। নিট বিক্রয় = বিলের মোট − VAT − ওই বিলের সেলস রিটার্ন। শুধু confirmed / paid / partial বিল; draft, বাতিল, কোটেশন, ডেলিভারি নোট আর ওপেনিং বিল বাদ। সদস্য হওয়ার তারিখের আগের বিলে পয়েন্ট নেই। নিয়ম বদলালে শুধু নতুন তারিখ থেকে বদলায়। পয়েন্ট প্রতিবার সেভ করা বিল থেকে হিসাব হয় - বিল বাতিল বা ফেরত হলে পয়েন্টও কমে যায়।",
                "Points = net sales ÷ amount per point (fractions dropped), per bill. Net sales = bill total − VAT − that bill's sales returns. Only confirmed / paid / partial bills count; drafts, cancelled, quotations, delivery notes and opening-balance bills do not. Bills before the member's start date earn nothing. A new rule applies from its own date on. Points are worked out from the saved bills every time - a cancelled or returned bill takes its points back."
              )}
            </div>
          </>
        )}

        {data && section === "display" && (
          <>
            <fieldset className="pm-panel" style={{ margin: 0 }}>
              <legend className="pm-panel-legend">{L("কাস্টমার ডিসপ্লে", "Customer display")}</legend>
              <div className="si-panel-body">
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <button type="button" className="pm-btn pm-btn--primary" onClick={showDisplay}>{displayOpen ? L("ডিসপ্লে সামনে আনুন", "Bring display to front") : L("ডিসপ্লে খুলুন", "Open display")}</button>
                  {displayOpen && <button type="button" className="pm-btn-secondary" onClick={() => { closeCustomerDisplay(); setDisplayOpen(false); }}>{L("ডিসপ্লে বন্ধ", "Close display")}</button>}
                  <span className="si-muted">{displayOpen ? L("ডিসপ্লে খোলা আছে", "Display is open") : L("ডিসপ্লে বন্ধ", "Display is closed")}</span>
                </div>
                {lastBill && <div style={{ marginTop: 6 }}>{L("শেষ বিল", "Last bill")}: <b>{lastBill.invoiceNo}</b> · {lastBill.customerName || "-"} · {cur} {money(lastBill.grandTotal)}</div>}
              </div>
            </fieldset>
            <div className="si-note">
              {L(
                "ডিসপ্লে একটা আলাদা উইন্ডো - কাস্টমারের দিকের মনিটরে টেনে নিয়ে বড় করুন। সেলস ইনভয়েসে বিল লেখার সময় আইটেম আর মোট সাথে সাথে দেখায়; ফর্ম খালি থাকলে শেষ confirm করা বিল। কোনো COM / সিরিয়াল পোল ডিসপ্লে লাগে না। অ্যাপ রিলোড বা বন্ধ হলে ডিসপ্লে আবার এখান থেকে খুলতে হবে। ব্রাউজারে পপ-আপ চালু থাকতে হবে।",
                "The display is a separate window - drag it to the customer-facing monitor and maximise it. While a bill is entered on Sales Invoice it shows the items and total as they change; when the form is empty it shows the last confirmed bill. No COM / serial pole display is needed. After the app reloads or closes, open the display again from here. The browser must allow pop-ups."
              )}
            </div>
          </>
        )}
      </div>
      <div className="si-statusbar">
        <span>{current ? L("শিফট খোলা", "Shift open") : L("শিফট বন্ধ", "No shift open")}</span>
        {loyalty.enabled && <span>{L("লয়্যালটি চালু", "Loyalty on")} · {members.length} {L("সদস্য", "members")}</span>}
        <span>{L("উইন্ডোতে ফিরলে নিজে থেকে রিফ্রেশ হয়", "Refreshes automatically when you come back to the window")}</span>
      </div>
    </div>
  );
}
