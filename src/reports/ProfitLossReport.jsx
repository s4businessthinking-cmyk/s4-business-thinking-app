import React, { useEffect, useMemo, useRef, useState } from "react";
import { PM_CSS } from "../product-master/pmStyles";
import { SI_CSS, usePmFitHeight, usePmMobile } from "../sales-invoice/siSkin";
import { offlineList } from "../offline/offlineRepository";
import { loadInvoiceRows, rowsOf } from "../inventory/stockFromInvoices";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { computeAccounts, r2 } from "./accountsCalc.js";

const money = (v) => r2(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const monthStart = () => { const d = new Date(); return localDay(new Date(d.getFullYear(), d.getMonth(), 1)); };

export default function ProfitLossReport({ lang = "en", th, s, shopId, products = [], shopName = "", cur = "AED", isDesktop }) {
  const bn = lang === "bn";
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(() => localDay());
  const [data, setData] = useState(null);
  const [tick, setTick] = useState(0);
  const mobile = usePmMobile();
  const rootRef = useRef(null);
  const fitH = usePmFitHeight(rootRef, mobile);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadInvoiceRows(), offlineList("salesReceipts"), offlineList("purchasePayments"), offlineList("expenses")])
      .then(([rows, rc, pm, ex]) => { if (!cancelled) setData({ ...rows, receipts: rowsOf(rc), payments: rowsOf(pm), expenses: rowsOf(ex) }); })
      .catch((err) => console.warn("[S4 P&L] load failed", err));
    return () => { cancelled = true; };
  }, [shopId, tick]);

  useEffect(() => {
    const refresh = () => { if (document.visibilityState !== "hidden") setTick((v) => v + 1); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);

  const report = useMemo(() => computeAccounts(data, { products, shopId, from, to, bn }), [data, products, shopId, from, to, bn]);

  const L = (bnText, enText) => (bn ? bnText : enText);
  const sections = report ? [
    [L("বিক্রি ও লাভ", "Sales & Profit"), [
      [L(`মোট বিক্রি (${report.count}টি বিল, VAT সহ)`, `Total sales (${report.count} bills, incl. VAT)`), report.grossSales],
      ...(report.salesReturnCount ? [[L(`সেলস রিটার্ন (${report.salesReturnCount}টি)`, `Sales returns (${report.salesReturnCount})`), -report.salesReturnTotal]] : []),
      [L("বিক্রির VAT", "VAT on sales"), -report.vatOut],
      [L("নিট বিক্রি", "Net sales"), report.netSales, true],
      [L("বিক্রি হওয়া মালের ক্রয়মূল্য (গড় খরচ)", "Cost of goods sold (average cost)"), -report.cogs],
      [L(`মোট লাভ (${report.margin.toFixed(1)}%)`, `Gross profit (${report.margin.toFixed(1)}%)`), report.grossProfit, true, report.grossProfit >= 0 ? "#16a34a" : "#dc2626"],
    ]],
    [L("খরচ ও নিট লাভ", "Expenses & Net Profit"), [
      [L("মোট লাভ", "Gross profit"), report.grossProfit],
      ...(report.vendorDiscount > 0 ? [[L("সাপ্লায়ারের দেওয়া ছাড় (চেকে)", "Discount received from suppliers"), report.vendorDiscount]] : []),
      ...report.expenseByCat.map(([label, amt]) => [`   ${label}`, -amt]),
      [L(`মোট খরচ (${report.expenseCount}টি)`, `Total expenses (${report.expenseCount})`), -report.expenseTotal, true],
      [report.netProfit >= 0 ? L("নিট লাভ", "Net profit") : L("নিট ক্ষতি", "Net loss"), report.netProfit, true, report.netProfit >= 0 ? "#16a34a" : "#dc2626"],
    ]],
    [L("ক্রয়", "Purchases"), [
      [L(`মোট ক্রয় (${report.purchCount}টি বিল, VAT সহ)`, `Total purchases (${report.purchCount} bills, incl. VAT)`), report.grossPurch],
      ...(report.purchReturnCount ? [[L(`পারচেজ রিটার্ন (${report.purchReturnCount}টি)`, `Purchase returns (${report.purchReturnCount})`), -report.purchReturnTotal]] : []),
      [L("ক্রয়ের VAT", "VAT on purchases"), -report.vatIn],
      [L("নিট ক্রয়", "Net purchases"), report.netPurch, true],
    ]],
    [L("VAT হিসাব", "VAT"), [
      [L("বিক্রির VAT", "Output VAT"), report.vatOut],
      [L("ক্রয়ের VAT", "Input VAT"), -report.vatIn],
      [report.vatPayable >= 0 ? L("সরকারকে দিতে হবে", "VAT payable") : L("ফেরত পাবেন", "VAT refundable"), report.vatPayable, true],
    ]],
    [L("টাকা আসা-যাওয়া", "Money in / out"), [
      [L("বিলে নগদ পাওয়া", "Received on bills"), report.cashOnSales],
      [L("রিসিট ভাউচারে পাওয়া", "Receipt vouchers"), report.receiptsIn],
      ...(report.refundsReceived > 0 ? [[L("সাপ্লায়ার থেকে ফেরত", "Refunds from suppliers"), report.refundsReceived]] : []),
      [L("মোট টাকা এসেছে", "Total money in"), report.moneyIn, true, "#16a34a"],
      [L("বিলে নগদ দেওয়া", "Paid on bills"), -report.cashOnPurch],
      [L("পেমেন্ট ভাউচারে দেওয়া", "Payment vouchers"), -report.paymentsOut],
      ...(report.refundsPaid > 0 ? [[L("কাস্টমারকে ফেরত", "Refunds to customers"), -report.refundsPaid]] : []),
      [L("দোকানের খরচ", "Shop expenses"), -report.expensePaid],
      [L("মোট টাকা গেছে", "Total money out"), -report.moneyOut, true, "#dc2626"],
      [L("নিট (এসেছে − গেছে)", "Net (in − out)"), report.moneyIn - report.moneyOut, true],
    ]],
    [L("আজকের অবস্থা", "Position today"), [
      [L("কাস্টমারদের কাছে পাবো", "Customers owe you"), report.receivable],
      [L("সাপ্লায়ারদের দিতে হবে", "You owe suppliers"), -report.payable],
      [L("স্টকের মূল্য (গড় খরচে)", "Stock value (average cost)"), report.stockValue],
      [L("নিট অবস্থা", "Net position"), report.receivable - report.payable + report.stockValue, true],
    ]],
  ] : [];

  const print = () => {
    if (!report) return;
    const rows = [];
    sections.forEach(([title, lines]) => {
      rows.push([title.toUpperCase(), ""]);
      lines.forEach(([label, value]) => rows.push([`   ${label}`, money(value)]));
    });
    printWithSettings(generateStatementHTML({
      shopName, title: L("হিসাব নিকাশ", "PROFIT & LOSS / ACCOUNTS SUMMARY"), subtitle: `${from || "Start"} — ${to || "Today"}`,
      cols: [{ label: L("বিবরণ", "Particulars") }, { label: `${L("টাকা", "Amount")} (${cur})`, align: "right" }], rows,
    }), { lang });
  };

  const today = localDay();
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const quick = [
    ["today", L("আজ", "Today"), today, today],
    ["month", L("এই মাস", "This month"), monthStart(), today],
    ["year", L("এই বছর", "This year"), yearStart, today],
    ["all", L("সব সময়", "All time"), "", ""],
  ];
  const activeQuick = quick.find(([, , f, t]) => f === from && t === to)?.[0];
  const badRange = !!(from && to && from > to);
  const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
  const valColor = (value, color) => color || (value < 0 ? "#b91c1c" : undefined);

  return (
    <div ref={rootRef} className="si-root" style={fitH ? { height: fitH } : undefined}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>
      <div className="pm-reference-title">
        <strong>📊 {L("হিসাব নিকাশ", "Accounts Summary")}</strong>
        <span>{from ? fmtDay(from) : L("শুরু", "Start")} — {to ? fmtDay(to) : L("আজ", "Today")}</span>
      </div>
      <div className="si-toolbar">
        <button type="button" className="pm-btn pm-btn--primary" onClick={print} disabled={!report || badRange}>🖨️ {L("প্রিন্ট", "Print")}</button>
        <button type="button" className="pm-btn-secondary" onClick={() => setTick((v) => v + 1)}>🔄 {L("রিফ্রেশ", "Refresh")}</button>
        <span className="si-toolbar-gap" />
        <div className="si-pills">
          {quick.map(([key, label, f, t]) => (
            <button key={key} type="button" className={`pm-btn-secondary${activeQuick === key ? " is-active" : ""}`} onClick={() => { setFrom(f); setTo(t); }}>{label}</button>
          ))}
        </div>
        <input type="date" className="pm-input" style={{ width: mobile ? "calc(50% - 2px)" : 120, borderColor: badRange ? "#b91c1c" : undefined }} value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" className="pm-input" style={{ width: mobile ? "calc(50% - 2px)" : 120, borderColor: badRange ? "#b91c1c" : undefined }} value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      {report && (
        <div className="si-kpis">
          <div className="si-kpi"><span>{L("নিট বিক্রি", "Net sales")}</span><b>{cur} {money(report.netSales)}</b></div>
          <div className="si-kpi"><span>{L("মোট লাভ", "Gross profit")} ({report.margin.toFixed(1)}%)</span><b style={{ color: report.grossProfit >= 0 ? "#15803d" : "#b91c1c" }}>{money(report.grossProfit)}</b></div>
          <div className="si-kpi"><span>{L("খরচ", "Expenses")}</span><b style={{ color: "#b91c1c" }}>{money(report.expenseTotal)}</b></div>
          <div className="si-kpi"><span>{report.netProfit >= 0 ? L("নিট লাভ", "Net profit") : L("নিট ক্ষতি", "Net loss")}</span><b style={{ color: report.netProfit >= 0 ? "#15803d" : "#b91c1c" }}>{cur} {money(report.netProfit)}</b></div>
        </div>
      )}
      <div className="si-body">
        {badRange && <div className="si-paid-box is-due">{L("শুরুর তারিখ শেষের তারিখের পরে — তারিখ ঠিক করুন", "The start date is after the end date — fix the dates")}</div>}
        {!report ? (
          <div className="si-empty">{L("লোড হচ্ছে…", "Loading…")}</div>
        ) : (
          <>
            <div className={mobile ? "" : "si-cols"} style={mobile ? { display: "flex", flexDirection: "column", gap: 4 } : { alignItems: "start" }}>
              {sections.map(([title, lines]) => (
                <fieldset key={title} className="pm-panel" style={{ margin: 0 }}>
                  <legend className="pm-panel-legend">{title}</legend>
                  <div className="si-panel-body">
                    {lines.map(([label, value, strong, color]) => (
                      <div key={label} className={`si-total-row${strong ? " is-grand" : ""}`} style={strong ? { fontSize: mobile ? 15 : 12 } : undefined}>
                        <span style={{ whiteSpace: "pre-wrap", color: strong ? undefined : "#1f2937" }}>{label}</span>
                        <b style={{ whiteSpace: "nowrap", color: valColor(value, color) }}>{cur} {money(value)}</b>
                      </div>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
            <div className="si-note">
              {L(
                "মোট লাভ = নিট বিক্রি − বিক্রি হওয়া মালের গড় ক্রয়মূল্য (opening stock আর confirmed পারচেজ থেকে, VAT বাদে)। নিট লাভ = মোট লাভ − 💸 খরচ পেজে লেখা দোকানের খরচ (খরচের বিলের VAT বাদে, কারণ সেটা VAT রিটার্নে ফেরত পাওয়া যায়)। Draft, বাতিল, কোটেশন, ডেলিভারি নোট আর পার্টির Opening Balance বিল বিক্রি/ক্রয়ে ধরা হয়নি (তবে বাকিতে ধরা আছে)। বাউন্স হওয়া খরচের চেক টাকা-যাওয়াতে ধরা হয়নি।",
                "Gross profit = net sales − average purchase cost of goods sold (from opening stock and confirmed purchases, VAT excluded). Net profit = gross profit − shop expenses entered on the 💸 Expenses page (without the VAT on expense bills, which is claimed back in the VAT return). Drafts, cancelled bills, quotations, delivery notes and party opening-balance bills are not counted as sales/purchases (they are in the dues). Bounced expense cheques are not counted as money out."
              )}
              {report.unpriced > 0 && <div style={{ color: "#b45309", fontWeight: 700, marginTop: 3 }}>⚠ {L(`${report.unpriced}টি বিক্রির লাইনে প্রোডাক্টের ক্রয়মূল্য নেই, তাই সেগুলোর খরচ 0 ধরা হয়েছে।`, `${report.unpriced} sold line(s) have no purchase cost, so their cost is counted as 0.`)}</div>}
            </div>
          </>
        )}
      </div>
      <div className="si-statusbar">
        {report && <span>{L("বিক্রির বিল", "Sales bills")} <b>{report.count}</b></span>}
        {report && <span>{L("ক্রয়ের বিল", "Purchase bills")} <b>{report.purchCount}</b></span>}
        {report && <span>{L("খরচ", "Expenses")} <b>{report.expenseCount}</b></span>}
        <span>{L("উইন্ডোতে ফিরলে নিজে থেকে রিফ্রেশ হয়", "Refreshes automatically when you come back to the window")}</span>
      </div>
    </div>
  );
}
