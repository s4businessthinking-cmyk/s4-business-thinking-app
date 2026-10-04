import React, { useEffect, useMemo, useState } from "react";
import { offlineList } from "../offline/offlineRepository";
import { computeStockMap, loadInvoiceRows, rowsOf } from "../inventory/stockFromInvoices";
import { itemBaseQty } from "../inventory/unitConversion";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { expenseCategoryLabel } from "../expenses/ExpensesTab.jsx";

const LIVE = ["confirmed", "paid", "partial"];
const n = (v) => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
const r2 = (v) => Math.round((n(v) + Number.EPSILON) * 100) / 100;
const money = (v) => r2(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const monthStart = () => { const d = new Date(); return localDay(new Date(d.getFullYear(), d.getMonth(), 1)); };
const dayOf = (v) => String(v || "").slice(0, 10);
const inRange = (d, from, to) => (!from || d >= from) && (!to || d <= to);
const isLive = (doc, shopId) => doc && !doc.isDeleted && !doc.deleted && (!shopId || !doc.shopId || doc.shopId === shopId);

// Weighted average purchase cost per base unit up to a date: opening stock at its rate plus every confirmed purchase (VAT excluded).
function averageCosts(products, purchases, upTo) {
  const acc = new Map();
  (products || []).forEach((p) => {
    const q = n(p.openingStock);
    const rate = n(p.openingRate) || n(p.landingCost);
    acc.set(p.id, { qty: q > 0 ? q : 0, value: q > 0 ? q * rate : 0, fallback: n(p.landingCost) || n(p.averageCost) || rate });
  });
  const productById = new Map((products || []).map((p) => [p.id, p]));
  purchases.forEach((inv) => {
    if (upTo && dayOf(inv.invoiceDate) > upTo) return;
    (inv.items || []).forEach((it) => {
      if (!it?.productId || !acc.has(it.productId)) return;
      const q = itemBaseQty(it, productById.get(it.productId));
      if (q <= 0) return;
      const net = n(it.lineTotal) - n(it.taxAmt);
      const a = acc.get(it.productId);
      a.qty += q;
      a.value += net > 0 ? net : 0;
    });
  });
  const out = new Map();
  acc.forEach((a, id) => out.set(id, a.qty > 0 && a.value > 0 ? a.value / a.qty : a.fallback));
  return out;
}

export default function ProfitLossReport({ lang = "en", th, s, shopId, products = [], shopName = "", cur = "AED", isDesktop }) {
  const bn = lang === "bn";
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(() => localDay());
  const [data, setData] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadInvoiceRows(), offlineList("salesReceipts"), offlineList("purchasePayments"), offlineList("expenses")])
      .then(([rows, rc, pm, ex]) => { if (!cancelled) setData({ ...rows, receipts: rowsOf(rc), payments: rowsOf(pm), expenses: rowsOf(ex) }); })
      .catch((err) => console.warn("[S4 P&L] load failed", err));
    return () => { cancelled = true; };
  }, [shopId, tick]);

  const report = useMemo(() => {
    if (!data) return null;
    const sales = data.salesInvoices.filter((inv) => isLive(inv, shopId) && LIVE.includes(inv.status) && inv.docKind !== "quotation" && inv.invoiceType !== "delivery");
    const purchases = data.purchaseInvoices.filter((inv) => isLive(inv, shopId) && LIVE.includes(inv.status) && !inv.internalTransfer && inv.sourceType !== "branch_transfer");
    const receipts = data.receipts.filter((r) => isLive(r, shopId) && r.status !== "cancelled");
    const payments = data.payments.filter((p) => isLive(p, shopId) && p.status !== "cancelled");
    const productById = new Map(products.map((p) => [p.id, p]));
    const avg = averageCosts(products, purchases, to);

    const salesIn = sales.filter((inv) => inRange(dayOf(inv.invoiceDate), from, to));
    const purchIn = purchases.filter((inv) => inRange(dayOf(inv.invoiceDate), from, to));

    const grossSales = salesIn.reduce((t, inv) => t + n(inv.grandTotal), 0);
    const vatOut = salesIn.reduce((t, inv) => t + n(inv.totalVat), 0);
    const netSales = grossSales - vatOut;
    let cogs = 0;
    let unpriced = 0;
    salesIn.forEach((inv) => (inv.items || []).forEach((it) => {
      if (!it?.productId) return;
      const cost = avg.get(it.productId) || 0;
      if (!cost) unpriced += 1;
      cogs += itemBaseQty(it, productById.get(it.productId)) * cost;
    }));
    const grossProfit = netSales - cogs;

    const grossPurch = purchIn.reduce((t, inv) => t + n(inv.grandTotal), 0);
    const vatIn = purchIn.reduce((t, inv) => t + n(inv.totalTax), 0);

    const allocSum = (vouchers, id) => vouchers.reduce((t, v) => t + (v.allocations || []).filter((a) => a.invoiceId === id).reduce((x, a) => x + n(a.amount), 0), 0);
    const cashOnSales = salesIn.reduce((t, inv) => t + Math.max(0, n(inv.amountPaid) - allocSum(receipts, inv.id)), 0);
    const receiptsIn = receipts.filter((r) => inRange(dayOf(r.receiptDate || r.createdAt), from, to)).reduce((t, r) => t + n(r.totalAmount), 0);
    const cashOnPurch = purchIn.reduce((t, inv) => t + Math.max(0, n(inv.amountPaid) - allocSum(payments, inv.id)), 0);
    const paymentsOut = payments.filter((p) => inRange(dayOf(p.paymentDate || p.createdAt), from, to)).reduce((t, p) => t + n(p.totalAmount), 0);

    const expensesIn = (data.expenses || []).filter((e) => isLive(e, shopId) && e.status !== "cancelled" && inRange(dayOf(e.expenseDate), from, to));
    const expenseTotal = expensesIn.reduce((t, e) => t + n(e.amount), 0);
    const expenseMap = new Map();
    expensesIn.forEach((e) => { const k = expenseCategoryLabel(e, bn); expenseMap.set(k, (expenseMap.get(k) || 0) + n(e.amount)); });
    const expenseByCat = [...expenseMap.entries()].sort((a, b) => b[1] - a[1]);

    const receivable = sales.reduce((t, inv) => t + Math.max(0, n(inv.balanceDue)), 0);
    const payable = purchases.reduce((t, inv) => t + Math.max(0, n(inv.balanceDue)), 0);
    const stock = computeStockMap(products, data.purchaseInvoices, data.salesInvoices, shopId, data.deliveryNotes);
    let stockValue = 0;
    stock.forEach((q, id) => { if (q > 0) stockValue += q * (avg.get(id) || 0); });

    return {
      count: salesIn.length, purchCount: purchIn.length, grossSales, vatOut, netSales, cogs, grossProfit,
      margin: netSales > 0 ? (grossProfit / netSales) * 100 : 0, unpriced,
      grossPurch, vatIn, netPurch: grossPurch - vatIn, vatPayable: vatOut - vatIn,
      moneyIn: cashOnSales + receiptsIn, cashOnSales, receiptsIn,
      moneyOut: cashOnPurch + paymentsOut + expenseTotal, cashOnPurch, paymentsOut,
      receivable, payable, stockValue,
      expenseTotal, expenseByCat, expenseCount: expensesIn.length, netProfit: grossProfit - expenseTotal,
    };
  }, [data, products, shopId, from, to, bn]);

  const L = (bnText, enText) => (bn ? bnText : enText);
  const sections = report ? [
    [L("বিক্রি ও লাভ", "Sales & Profit"), [
      [L(`মোট বিক্রি (${report.count}টি বিল, VAT সহ)`, `Total sales (${report.count} bills, incl. VAT)`), report.grossSales],
      [L("বিক্রির VAT", "VAT on sales"), -report.vatOut],
      [L("নিট বিক্রি", "Net sales"), report.netSales, true],
      [L("বিক্রি হওয়া মালের ক্রয়মূল্য (গড় খরচ)", "Cost of goods sold (average cost)"), -report.cogs],
      [L(`মোট লাভ (${report.margin.toFixed(1)}%)`, `Gross profit (${report.margin.toFixed(1)}%)`), report.grossProfit, true, report.grossProfit >= 0 ? "#16a34a" : "#dc2626"],
    ]],
    [L("খরচ ও নিট লাভ", "Expenses & Net Profit"), [
      [L("মোট লাভ", "Gross profit"), report.grossProfit],
      ...report.expenseByCat.map(([label, amt]) => [`   ${label}`, -amt]),
      [L(`মোট খরচ (${report.expenseCount}টি)`, `Total expenses (${report.expenseCount})`), -report.expenseTotal, true],
      [report.netProfit >= 0 ? L("নিট লাভ", "Net profit") : L("নিট ক্ষতি", "Net loss"), report.netProfit, true, report.netProfit >= 0 ? "#16a34a" : "#dc2626"],
    ]],
    [L("ক্রয়", "Purchases"), [
      [L(`মোট ক্রয় (${report.purchCount}টি বিল, VAT সহ)`, `Total purchases (${report.purchCount} bills, incl. VAT)`), report.grossPurch],
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
      [L("মোট টাকা এসেছে", "Total money in"), report.moneyIn, true, "#16a34a"],
      [L("বিলে নগদ দেওয়া", "Paid on bills"), -report.cashOnPurch],
      [L("পেমেন্ট ভাউচারে দেওয়া", "Payment vouchers"), -report.paymentsOut],
      [L("দোকানের খরচ", "Shop expenses"), -report.expenseTotal],
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

  const card = { ...(s?.card || {}), padding: 14, borderRadius: 14, background: th.bgCard, border: `1px solid ${th.border}` };
  const inpStyle = { padding: "8px 10px", borderRadius: 8, border: `1px solid ${th.borderMid || th.border}`, background: th.bgInp, color: th.txtPrimary, fontFamily: "inherit", fontSize: 13 };
  const quick = [
    [L("আজ", "Today"), () => { const d = localDay(); setFrom(d); setTo(d); }],
    [L("এই মাস", "This month"), () => { setFrom(monthStart()); setTo(localDay()); }],
    [L("এই বছর", "This year"), () => { setFrom(`${new Date().getFullYear()}-01-01`); setTo(localDay()); }],
    [L("সব সময়", "All time"), () => { setFrom(""); setTo(""); }],
  ];

  return (
    <div style={isDesktop ? s?.desktopPanel : s?.panel}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: th.txtPrimary }}>📊 {L("হিসাব নিকাশ", "Accounts Summary")}</div>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" onClick={() => setTick((v) => v + 1)} style={{ ...inpStyle, cursor: "pointer", fontWeight: 700 }}>🔄</button>
          <button type="button" onClick={print} disabled={!report} style={{ ...inpStyle, cursor: "pointer", fontWeight: 800, background: "#2563eb", color: "#fff", border: "none" }}>🖨️ {L("প্রিন্ট", "Print")}</button>
        </div>
      </div>
      <div style={{ ...card, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inpStyle} />
        <span style={{ color: th.txtMuted }}>—</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inpStyle} />
        {quick.map(([label, fn]) => (
          <button key={label} type="button" onClick={fn} style={{ ...inpStyle, cursor: "pointer", fontWeight: 700 }}>{label}</button>
        ))}
      </div>
      {!report ? (
        <div style={{ ...card, textAlign: "center", color: th.txtMuted }}>{L("লোড হচ্ছে…", "Loading…")}</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "repeat(2, minmax(0,1fr))" : "1fr", gap: 12 }}>
          {sections.map(([title, lines]) => (
            <div key={title} style={card}>
              <div style={{ fontSize: 12, fontWeight: 900, color: "#3b82f6", textTransform: "uppercase", marginBottom: 6 }}>{title}</div>
              {lines.map(([label, value, strong, color]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0", borderTop: strong ? `1px solid ${th.border}` : "none" }}>
                  <span style={{ fontSize: 13, color: strong ? th.txtPrimary : th.txtSecondary, fontWeight: strong ? 800 : 500 }}>{label}</span>
                  <span style={{ fontSize: strong ? 15 : 13, fontWeight: strong ? 900 : 700, color: color || (value < 0 ? "#dc2626" : th.txtPrimary), whiteSpace: "nowrap" }}>{cur} {money(value)}</span>
                </div>
              ))}
            </div>
          ))}
          <div style={{ ...card, gridColumn: isDesktop ? "1 / -1" : undefined, fontSize: 11, color: th.txtMuted, lineHeight: 1.6 }}>
            {L(
              "মোট লাভ = নিট বিক্রি − বিক্রি হওয়া মালের গড় ক্রয়মূল্য (opening stock আর confirmed পারচেজ থেকে, VAT বাদে)। নিট লাভ = মোট লাভ − 💸 খরচ পেজে লেখা দোকানের খরচ। Draft, বাতিল, কোটেশন আর ডেলিভারি নোট ধরা হয়নি।",
              "Gross profit = net sales − average purchase cost of goods sold (from opening stock and confirmed purchases, VAT excluded). Net profit = gross profit − shop expenses entered on the 💸 Expenses page. Drafts, cancelled bills, quotations and delivery notes are excluded."
            )}
            {report.unpriced > 0 && <div style={{ color: "#f59e0b", fontWeight: 700 }}>⚠ {L(`${report.unpriced}টি বিক্রির লাইনে প্রোডাক্টের ক্রয়মূল্য নেই, তাই সেগুলোর খরচ 0 ধরা হয়েছে।`, `${report.unpriced} sold line(s) have no purchase cost, so their cost is counted as 0.`)}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
