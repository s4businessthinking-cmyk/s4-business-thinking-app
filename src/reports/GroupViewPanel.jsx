// Group view panel (Profit & Loss > Group view): the period's P&L split by the branch each sale was made from, a
// shop-level column for costs not tagged to a branch, and the group total (= this P&L report); stock by branch at
// average cost and the goods moved between branches (left out of the group's sales and purchases). Read-only.
import React, { useEffect, useMemo, useState } from "react";
import { offlineList } from "../offline/offlineRepository";
import { computeStockMap, rowsOf } from "../inventory/stockFromInvoices";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { saveTextFile } from "../utils/saveTextFile.js";
import { BRANCH_TRANSFER_COLLECTIONS } from "../branch-transfer/branchTransferService.js";
import { branchSalesMap } from "../branch-transfer/BranchTransferNative.jsx";
import { computeAccounts } from "./accountsCalc.js";
import { averageCosts } from "./averageCost.js";
import { fifoRun, unitCostsAt } from "./stockValuation.js";
import { livePurchasesOf, liveReturnsOf, r2 } from "./reportFilters.js";
import { branchStock } from "./stockHub.js";
import { csvText } from "./vatExport.js";
import { GROUP_COLS, branchColumns, branchData, groupCsvRows, groupPl, internalTransfers, stockByBranch } from "./groupView.js";

const money = (v) => r2(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");

export default function GroupViewPanel({ lang = "en", shopId, data, products = [], from, to, report, method = "average", shopName = "", cur = "AED", canPrint = false, onClose }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const [bt, setBt] = useState(null);

  useEffect(() => {
    let off = false;
    Promise.all([
      offlineList(BRANCH_TRANSFER_COLLECTIONS.BRANCHES).catch(() => []),
      offlineList(BRANCH_TRANSFER_COLLECTIONS.STOCK_BALANCES).catch(() => []),
      offlineList(BRANCH_TRANSFER_COLLECTIONS.TRANSFERS).catch(() => []),
    ]).then(([br, bal, tr]) => {
      if (off) return;
      const mine = (list) => rowsOf(list).filter((d) => d && !d.isDeleted && (!shopId || !d.shopId || d.shopId === shopId));
      setBt({ branches: mine(br), balances: mine(bal), transfers: mine(tr) });
    });
    return () => { off = true; };
  }, [shopId]);

  const cols = useMemo(() => (data ? branchColumns(bt?.branches, data.salesInvoices, data.deliveryNotes) : []), [data, bt]);
  const view = useMemo(() => {
    if (!data || !report) return null;
    // FIFO: one run of the whole shop's stock, each branch taking the cost of its own sales from it
    const fifoShared = method === "fifo" ? fifoRun(products, data, { shopId, upTo: to }) : null;
    const columns = cols.map((c) => ({ ...c, pl: computeAccounts(branchData(data, c.id), { products, shopId, from, to, bn, method, fifoShared }) }))
      .filter((c) => c.id === "main" || c.pl.count || c.pl.salesReturnCount);
    return groupPl(columns, report);
  }, [data, report, cols, products, shopId, from, to, bn, method]);

  // stock now: received at each branch less sold there; the main shop holds the rest (average cost as of today)
  const stock = useMemo(() => {
    if (!data || !bt) return null;
    const shopQty = computeStockMap(products, data.purchaseInvoices, data.salesInvoices, shopId, data.deliveryNotes, data.extras);
    const purchases = livePurchasesOf(data.purchaseInvoices, shopId).filter((inv) => inv.source !== "openingBalance");
    const cost = method === "fifo" ? unitCostsAt("fifo", products, data, { shopId }) : averageCosts(products, purchases, "", liveReturnsOf(data.extras?.purchaseReturns, shopId));
    const rows = branchStock(bt.balances, branchSalesMap(products, data.salesInvoices, data.deliveryNotes, shopId), shopQty, bt.branches).rows;
    return stockByBranch(cols, rows, shopQty, cost);
  }, [data, bt, products, shopId, cols]);
  const memo = useMemo(() => internalTransfers(bt?.transfers, { from, to, shopId }), [bt, from, to, shopId]);

  const name = (c) => (bn ? c.nameBn || c.name : c.name);
  const head = view ? GROUP_COLS(view.columns, bn) : [];
  const print = () => {
    if (!view) return;
    const rows = groupCsvRows(view);
    printWithSettings(generateStatementHTML({
      shopName, title: "GROUP PROFIT & LOSS BY BRANCH", subtitle: `${fmtDay(from) || "Start"} - ${fmtDay(to) || "Today"}`,
      partyLine: `Goods moved between branches (not sales): ${memo.count} transfer(s), ${cur} ${money(memo.value)}`,
      cols: head.map((label, i) => ({ label, align: i ? "right" : undefined })), rows,
      summaryLines: stock ? [`Stock now by branch: ${stock.map((s) => `${s.name} ${cur} ${money(s.value)}`).join(" · ")}`] : [],
    }), { lang });
  };
  const exportCsv = async () => {
    if (!view) return;
    const rows = [[`Group P&L by branch ${from || "start"} to ${to || "today"}`], head, ...groupCsvRows(view), [],
      ["Stock now by branch", `Qty`, `Value (${cur})`], ...(stock || []).map((s) => [s.name, String(s.qty), money(s.value)]), [],
      ["Goods moved between branches (not sales)", String(memo.count), money(memo.value)]];
    try { await saveTextFile(`group-view-${from || "start"}_${to || "today"}.csv`, csvText(rows)); } catch { /* the save dialog was closed */ }
  };

  const cell = (v, strong = false, color) => <td className={`si-num${strong ? " si-strong" : ""}`} style={color ? { color } : undefined}>{money(v)}</td>;
  const plColor = (v) => (v >= 0 ? "#15803d" : "#b91c1c");

  return (
    <fieldset className="pm-panel" style={{ margin: 0 }}>
      <legend className="pm-panel-legend">{L("গ্রুপ ভিউ (ব্রাঞ্চ অনুযায়ী)", "Group view (by branch)")}</legend>
      <div className="si-panel-body" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span className="si-muted">{fmtDay(from) || L("শুরু", "Start")} - {fmtDay(to) || L("আজ", "Today")}</span>
          <span className="si-toolbar-gap" />
          {canPrint && <button type="button" className="pm-btn-secondary" onClick={print} disabled={!view}>{L("প্রিন্ট / PDF", "Print / PDF")}</button>}
          {canPrint && <button type="button" className="pm-btn-secondary" onClick={exportCsv} disabled={!view}>Excel</button>}
          {onClose && <button type="button" className="pm-btn-secondary" onClick={onClose}>{L("বন্ধ", "Close")}</button>}
        </div>
        {!view ? <div className="si-empty">{L("লোড হচ্ছে…", "Loading…")}</div> : (
          <>
            <div style={{ overflow: "auto" }}>
              <table className="pm-table" style={{ minWidth: 560 }}>
                <thead><tr>
                  <th>{L("লাইন", "Line")}</th>
                  {view.columns.map((c) => <th key={c.id} className="si-num">{name(c)}{c.count ? <div style={{ fontWeight: 400, fontSize: 11 }}>{c.count} {L("বিল", "bills")}</div> : null}</th>)}
                  <th className="si-num">{L("দোকান-স্তর", "Shop level")}</th>
                  <th className="si-num">{L("গ্রুপ মোট", "Group")}</th>
                </tr></thead>
                <tbody>
                  <tr><td>{L("মোট বিক্রি (VAT সহ)", "Total sales (incl. VAT)")}</td>{view.columns.map((c) => <React.Fragment key={c.id}>{cell(c.grossSales)}</React.Fragment>)}<td />{cell(view.group.grossSales)}</tr>
                  <tr><td>{L("সেলস রিটার্ন", "Sales returns")}</td>{view.columns.map((c) => <React.Fragment key={c.id}>{cell(-c.salesReturnTotal)}</React.Fragment>)}<td />{cell(-view.group.salesReturnTotal)}</tr>
                  <tr><td>{L("বিক্রির VAT", "VAT on sales")}</td>{view.columns.map((c) => <React.Fragment key={c.id}>{cell(-c.vatOut)}</React.Fragment>)}<td />{cell(-view.group.vatOut)}</tr>
                  <tr><td className="si-strong">{L("নিট বিক্রি", "Net sales")}</td>{view.columns.map((c) => <React.Fragment key={c.id}>{cell(c.netSales, true)}</React.Fragment>)}<td />{cell(view.group.netSales, true)}</tr>
                  <tr><td>{L("বিক্রি হওয়া মালের ক্রয়মূল্য", "Cost of goods sold")}</td>{view.columns.map((c) => <React.Fragment key={c.id}>{cell(-c.cogs)}</React.Fragment>)}<td />{cell(-view.group.cogs)}</tr>
                  <tr><td className="si-strong">{L("মোট লাভ", "Gross profit")}</td>{view.columns.map((c) => <React.Fragment key={c.id}>{cell(c.grossProfit, true, plColor(c.grossProfit))}</React.Fragment>)}<td />{cell(view.group.grossProfit, true, plColor(view.group.grossProfit))}</tr>
                  <tr><td>{L("মার্জিন", "Margin")}</td>{view.columns.map((c) => <td key={c.id} className="si-num">{c.margin.toFixed(1)}%</td>)}<td /><td className="si-num">{view.group.margin.toFixed(1)}%</td></tr>
                  {view.shopLevel.vendorDiscount > 0 && <tr><td>{L("সাপ্লায়ারের ছাড়", "Discount received from suppliers")}</td>{view.columns.map((c) => <td key={c.id} />)}{cell(view.shopLevel.vendorDiscount)}{cell(view.shopLevel.vendorDiscount)}</tr>}
                  <tr><td>{L("খরচ (কোনো ব্রাঞ্চে ট্যাগ নেই)", "Expenses (not tagged to a branch)")}</td>{view.columns.map((c) => <td key={c.id} />)}{cell(-view.shopLevel.expenseTotal)}{cell(-view.shopLevel.expenseTotal)}</tr>
                  {view.shopLevel.stockAdjustLoss !== 0 && <tr><td>{L("স্টক অ্যাডজাস্টমেন্ট / রাইট-অফ", "Stock adjustments / write-offs")}</td>{view.columns.map((c) => <td key={c.id} />)}{cell(-view.shopLevel.stockAdjustLoss)}{cell(-view.shopLevel.stockAdjustLoss)}</tr>}
                  {view.shopLevel.warrantyStockGain !== 0 && <tr><td>{L("ওয়ারেন্টিতে বদলে পাওয়া স্টক", "Warranty replacement stock received")}</td>{view.columns.map((c) => <td key={c.id} />)}{cell(view.shopLevel.warrantyStockGain)}{cell(view.shopLevel.warrantyStockGain)}</tr>}
                  <tr><td className="si-strong">{L("নিট লাভ", "Net profit")}</td>{view.columns.map((c) => <React.Fragment key={c.id}>{cell(c.grossProfit, true, plColor(c.grossProfit))}</React.Fragment>)}{cell(view.shopLevel.net, true, plColor(view.shopLevel.net))}{cell(view.group.netProfit, true, plColor(view.group.netProfit))}</tr>
                </tbody>
              </table>
            </div>
            {Math.abs(view.difference) >= 0.005 && <div className="si-hint" style={{ color: "#b91c1c" }}>{L(`ব্রাঞ্চের কলামের নিট বিক্রি গ্রুপের চেয়ে ${money(view.difference)} কম`, `Branch columns are ${money(view.difference)} short of the group's net sales`)}</div>}
            {stock && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <strong>{L("এখন ব্রাঞ্চ অনুযায়ী স্টক (গড় খরচে)", "Stock now by branch (average cost)")}:</strong>
                {stock.map((x) => <span key={x.id}>{bn ? x.nameBn || x.name : x.name} {cur} {money(x.value)}</span>)}
                <span className="si-muted">= {cur} {money(stock.reduce((t, x) => t + x.value, 0))}</span>
              </div>
            )}
            <div className="si-hint">
              {L(`এই সময়ে ব্রাঞ্চে পাঠানো মাল: ${memo.count}টি ট্রান্সফার, ${cur} ${money(memo.value)} - এটা গ্রুপের বিক্রি বা ক্রয় নয়, তাই কোথাও ধরা হয়নি।`,
                `Goods moved between branches in the period: ${memo.count} transfer(s), ${cur} ${money(memo.value)} - not a sale or purchase of the group, so counted nowhere.`)}
            </div>
            <div className="si-note">
              {L(
                "সব ব্রাঞ্চ একই দোকানের একই খাতায় চলে, তাই গ্রুপের ট্রায়াল ব্যালেন্স আর ব্যালেন্স শিট দোকানেরটাই (ব্রাঞ্চে মাল পাঠানো সেখানে বিক্রি বা ক্রয় হিসেবে আসে না)। এখানে বিক্রি ভাগ হয় বিলের \"স্টক লোকেশন\" (কোন ব্রাঞ্চ থেকে বিক্রি) অনুযায়ী; রিটার্ন তার বিলের ব্রাঞ্চে; ক্রয়মূল্য দোকানের গড় খরচে। খরচ, জার্নাল আর সাপ্লায়ারের ছাড় কোনো ব্রাঞ্চে ট্যাগ হয় না, তাই \"দোকান-স্তর\" কলামে। সব কলাম মিলে = P&L রিপোর্টের নিট লাভ।",
                "All branches run in the same shop's books, so the group trial balance and balance sheet are the shop's own (goods sent to a branch are not booked as a sale or purchase there). Here sales are split by the bill's \"stock location\" (the branch it was sold from); a return follows its bill; cost of goods is at the shop's average cost. Expenses, journals and supplier discounts carry no branch, so they sit in the \"Shop level\" column. All columns add up to the P&L report's net profit.",
              )}
            </div>
          </>
        )}
      </div>
    </fieldset>
  );
}
