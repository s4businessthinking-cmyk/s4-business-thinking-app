// HQ consolidated snapshot: one row per company file (parent + branch child shops).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { PM_CSS } from "../product-master/pmStyles";
import { SI_CSS, usePmFitHeight, usePmMobile } from "../sales-invoice/siSkin";
import { offlineList } from "../offline/offlineRepository";
import { loadInvoiceRows, rowsOf } from "../inventory/stockFromInvoices";
import { expenseCategoryLabel } from "../expenses/ExpensesTab.jsx";
import { buildGlobalLedger, balances } from "../ledger/globalLedger.js";
import { CASH_ACCOUNT } from "../vouchers/accountVoucherDomain.js";
import { listOwnerCompanyFiles } from "../branch-transfer/branchCompanyFile.js";
import { mergeConsolidatedTrialBalance } from "../branch-transfer/consolidatedTrialBalance.js";
import {
  applyEliminationToGroupTotals,
  applyEliminationToPlTotals,
  eliminateInterCompanyTrialBalance,
  measureInterCompanyElimination,
  measureInterCompanyPlElimination,
} from "../branch-transfer/consolidatedElimination.js";
import {
  buildFileBs,
  buildFilePl,
  mergeConsolidatedBs,
  mergeConsolidatedPl,
} from "../branch-transfer/consolidatedCompanyFinancials.js";
import { loadShopRecord } from "../offline/shopService.js";
import { shopBankAccountName } from "../ledger/ledgerShopOpts.js";
import { buildTrialBalance } from "./trialBalance.js";
import { r2 } from "./reportFilters.js";

const money = (v) => r2(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const monthStart = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
const drCr = (v) => {
  if (Math.abs(v) < 0.005) return "-";
  return v > 0 ? `${money(v)} Dr` : `${money(-v)} Cr`;
};

function scopeCompanyFileLedger(data, shopId, customers, vendors) {
  const scoped = {
    salesInvoices: (data.salesInvoices || []).filter((d) => d.shopId === shopId),
    purchaseInvoices: (data.purchaseInvoices || []).filter((d) => d.shopId === shopId),
    salesReturns: (data.salesReturns || []).filter((d) => d.shopId === shopId),
    purchaseReturns: (data.purchaseReturns || []).filter((d) => d.shopId === shopId),
    receipts: (data.receipts || []).filter((d) => d.shopId === shopId),
    payments: (data.payments || []).filter((d) => d.shopId === shopId),
    expenses: (data.expenses || []).filter((d) => d.shopId === shopId),
    accountVouchers: (data.accountVouchers || []).filter((d) => d.shopId === shopId),
    partnerEntries: (data.partnerEntries || []).filter((d) => d.shopId === shopId),
    bankEntries: (data.bankEntries || []).filter((d) => d.shopId === shopId),
    stockAdjustments: (data.stockAdjustments || []).filter((d) => d.shopId === shopId),
  };
  const cust = (customers || []).filter((c) => !c.shopId || c.shopId === shopId);
  const vend = (vendors || []).filter((v) => !v.shopId || v.shopId === shopId);
  return { scoped, cust, vend };
}
const accountBalance = (ledger, name, asOf) => {
  if (!ledger) return 0;
  const key = [...ledger.accounts.values()].find((a) => String(a.name || "").toLowerCase() === String(name || "").toLowerCase())?.key;
  if (!key) return 0;
  return balances(ledger.postings, asOf).get(key) || 0;
};

function cashTotal(ledger, asOf) {
  if (!ledger) return 0;
  let t = 0;
  for (const a of ledger.accounts.values()) {
    if (a.group !== "money") continue;
    if (!/^cash in hand/i.test(String(a.name || ""))) continue;
    t += balances(ledger.postings, asOf).get(a.key) || 0;
  }
  return r2(t);
}

function bankTotal(ledger, asOf, preferName = "") {
  if (!ledger) return 0;
  if (preferName) {
    const preferred = accountBalance(ledger, preferName, asOf);
    if (Math.abs(preferred) >= 0.005) return r2(preferred);
  }
  let t = 0;
  for (const a of ledger.accounts.values()) {
    if (a.group !== "money") continue;
    if (!/^bank\b/i.test(String(a.name || ""))) continue;
    t += balances(ledger.postings, asOf).get(a.key) || 0;
  }
  return r2(t);
}

export default function ConsolidatedCompanyReport({ lang = "en", homeShopId, customers = [], vendors = [], cur = "AED" }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const [asOf, setAsOf] = useState(() => localDay());
  const [from, setFrom] = useState(() => monthStart());
  const [to, setTo] = useState(() => localDay());
  const [files, setFiles] = useState([]);
  const [data, setData] = useState(null);
  const [consolidatedTb, setConsolidatedTb] = useState(null);
  const [consolidatedPl, setConsolidatedPl] = useState(null);
  const [consolidatedBs, setConsolidatedBs] = useState(null);
  const [icElimination, setIcElimination] = useState(0);
  const [shopByFileId, setShopByFileId] = useState({});
  const [products, setProducts] = useState([]);
  const [tick, setTick] = useState(0);
  const rootRef = useRef(null);
  const mobile = usePmMobile();
  const fitH = usePmFitHeight(rootRef, mobile);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadInvoiceRows(),
      offlineList("salesReceipts"),
      offlineList("purchasePayments"),
      offlineList("expenses"),
      offlineList("accountVouchers").catch(() => []),
      offlineList("partnerEntries").catch(() => []),
      offlineList("bankReconciliations").catch(() => []),
      offlineList("products").catch(() => []),
      offlineList("stockAdjustments").catch(() => []),
    ]).then(([rows, rc, pm, ex, av, pe, br, pr, sa]) => {
      if (cancelled) return;
      setData({
        salesInvoices: rows.salesInvoices,
        purchaseInvoices: rows.purchaseInvoices,
        salesReturns: rows.extras?.salesReturns || [],
        purchaseReturns: rows.extras?.purchaseReturns || [],
        receipts: rowsOf(rc),
        payments: rowsOf(pm),
        expenses: rowsOf(ex),
        accountVouchers: rowsOf(av),
        partnerEntries: rowsOf(pe),
        bankEntries: rowsOf(br).filter((d) => d?.kind === "entry"),
        stockAdjustments: rowsOf(sa),
      });
      const prodDocs = (pr?.records || pr || [])
        .map((r) => ({ id: r.document_id || r.data?.id, ...(r.data || r) }))
        .filter((p) => p.id);
      if (!cancelled) setProducts(prodDocs);
    }).catch(() => {});
    listOwnerCompanyFiles(homeShopId).then((list) => { if (!cancelled) setFiles(list || []); });
    return () => { cancelled = true; };
  }, [homeShopId, tick]);

  useEffect(() => {
    if (!data || files.length < 2) {
      setConsolidatedTb(null);
      setConsolidatedPl(null);
      setConsolidatedBs(null);
      setIcElimination(0);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      const shopRows = await Promise.all(files.map((f) => loadShopRecord(f.shopId).catch(() => ({}))));
      if (!cancelled) {
        const map = {};
        files.forEach((f, i) => { map[f.shopId] = shopRows[i] || {}; });
        setShopByFileId(map);
      }
      const tbFile = [];
      const plFile = [];
      const plScoped = [];
      const bsFile = [];
      const ledgerFile = [];
      files.forEach((f, i) => {
        const { scoped, cust, vend } = scopeCompanyFileLedger(data, f.shopId, customers, vendors);
        plScoped.push({ scoped, shopId: f.shopId });
        const shop = shopRows[i] || {};
        const ledger = buildGlobalLedger(scoped, {
          shopId: f.shopId,
          customers: cust,
          vendors: vend,
          defaultBankAccount: shop?.defaultBankAccount || "",
          expenseLabel: (e) => expenseCategoryLabel(e, false),
        });
        ledgerFile.push({ ledger });
        const tb = buildTrialBalance(ledger, {
          from,
          to,
          chart: shop.chartOfAccounts || [],
          coaGroups: shop.coaGroups || [],
        });
        tbFile.push({ file: f, tb });
        const pl = buildFilePl({ scoped, shop, products, shopId: f.shopId, from, to });
        plFile.push({ file: f, pl });
        const bsPack = buildFileBs({ scoped, shop, products, customers, vendors, shopId: f.shopId, asOf, file: f });
        bsFile.push({ file: f, bs: bsPack?.sheet, bankName: bsPack?.bankName });
      });
      if (!cancelled) {
        const elimination = measureInterCompanyElimination(ledgerFile, asOf);
        setIcElimination(elimination);
        setConsolidatedTb(eliminateInterCompanyTrialBalance(mergeConsolidatedTrialBalance(tbFile)));
        const plMerge = mergeConsolidatedPl(plFile);
        const plElim = measureInterCompanyPlElimination(plScoped, from, to);
        plMerge.totals = applyEliminationToPlTotals(plMerge.totals, plElim);
        setConsolidatedPl(plMerge);
        const bs = mergeConsolidatedBs(bsFile);
        bs.totals = applyEliminationToGroupTotals(bs.totals, elimination);
        setConsolidatedBs(bs);
      }
    })();
    return () => { cancelled = true; };
  }, [data, files, customers, vendors, products, from, to, asOf, tick]);

  const rows = useMemo(() => {
    if (!data || !files.length) return [];
    return files.map((f) => {
      const shopId = f.shopId;
      const { scoped, cust, vend } = scopeCompanyFileLedger(data, shopId, customers, vendors);
      const fileShop = shopByFileId[shopId] || {};
      const ledger = buildGlobalLedger(scoped, {
        shopId,
        customers: cust,
        vendors: vend,
        defaultBankAccount: shopBankAccountName(fileShop),
        expenseLabel: (e) => expenseCategoryLabel(e, false),
      });
      const bankName = shopBankAccountName(fileShop);
      return {
        shopId,
        label: f.label,
        kind: f.kind,
        cash: cashTotal(ledger, asOf),
        bank: bankTotal(ledger, asOf, bankName),
        sales: accountBalance(ledger, "Sales", asOf),
        purchase: accountBalance(ledger, "Purchase", asOf),
      };
    });
  }, [data, files, customers, vendors, asOf, shopByFileId]);

  const totals = useMemo(() => ({
    cash: r2(rows.reduce((t, r) => t + r.cash, 0)),
    bank: r2(rows.reduce((t, r) => t + r.bank, 0)),
    sales: r2(rows.reduce((t, r) => t + Math.abs(r.sales), 0)),
  }), [rows]);

  return (
    <div ref={rootRef} className="si-root" style={fitH ? { height: fitH } : undefined}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>
      <div className="pm-reference-title">
        <strong>{L("সব শাখা — এক নজরে (HQ)", "All branches — HQ consolidated")}</strong>
        <span>{L("তারিখ", "As at")}: {asOf}</span>
      </div>
      <div className="si-toolbar">
        <input className="pm-input" type="date" style={{ width: mobile ? "100%" : 140 }} value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        <input className="pm-input" type="date" title={L("TB শুরু", "TB from")} style={{ width: mobile ? "100%" : 128 }} value={from} onChange={(e) => setFrom(e.target.value)} />
        <input className="pm-input" type="date" title={L("TB শেষ", "TB to")} style={{ width: mobile ? "100%" : 128 }} value={to} onChange={(e) => setTo(e.target.value)} />
        <button type="button" className="pm-btn-secondary" onClick={() => setTick((v) => v + 1)}>{L("রিফ্রেশ", "Refresh")}</button>
      </div>
      <div className="si-kpis">
        <div className="si-kpi"><span>{L("মোট ক্যাশ", "Total cash")}</span><b>{cur} {money(totals.cash)}</b></div>
        <div className="si-kpi"><span>{L("মোট ব্যাংক", "Total bank")}</span><b>{cur} {money(totals.bank)}</b></div>
        <div className="si-kpi"><span>{L("কোম্পানি ফাইল", "Company files")}</span><b>{rows.length}</b></div>
        {icElimination >= 0.01 && (
          <div className="si-kpi" title={L("HQ Due from ও শাখার Due to HQ একে অপরকে কেটে দেয় (TB ও গ্রুপ BS)", "HQ Due from and branch Due to HQ net off in TB and group BS")}>
            <span>{L("ইন্টার-কোম্পানি এলিমিনেশন", "Inter-company elimination")}</span>
            <b>{cur} {money(icElimination)}</b>
          </div>
        )}
      </div>
      <div className="pm-card" style={{ overflow: "auto" }}>
        <table className="pm-table" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th>{L("কোম্পানি ফাইল", "Company file")}</th>
              <th className="num">{L("ক্যাশ", "Cash")}</th>
              <th className="num">{L("ব্যাংক", "Bank")}</th>
              <th className="num">{L("সেলস (ক্রেডিট)", "Sales (Cr)")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.shopId}>
                <td>{r.label}{r.kind === "hq" ? ` · HQ` : ""}</td>
                <td className="num">{money(r.cash)}</td>
                <td className="num">{money(r.bank)}</td>
                <td className="num">{money(Math.abs(r.sales))}</td>
              </tr>
            ))}
            {rows.length > 1 && (
              <tr style={{ fontWeight: 800 }}>
                <td>{L("মোট", "Total")}</td>
                <td className="num">{money(totals.cash)}</td>
                <td className="num">{money(totals.bank)}</td>
                <td className="num">{money(totals.sales)}</td>
              </tr>
            )}
          </tbody>
        </table>
        {rows.length < 2 && (
          <p style={{ padding: 12, fontSize: 12, color: "#64748b" }}>
            {L("কমপক্ষে একটি শাখার company file দরকার — Branch Transfer সেটিংসে শাখা সেভ করুন।", "Save at least one branch with a company file in Branch Transfer settings.")}
          </p>
        )}
      </div>
      {consolidatedPl?.rows?.length > 0 && (
        <div className="pm-card" style={{ marginTop: 12, overflow: "auto" }}>
          <div style={{ padding: "10px 12px", fontWeight: 800, borderBottom: "1px solid #e2e8f0" }}>
            {L("সংযুক্ত লাভ-ক্ষতি (P&L)", "Consolidated profit & loss")}
            <span style={{ fontWeight: 500, marginLeft: 8, fontSize: 12, color: "#64748b" }}>{from} — {to}</span>
          </div>
          <table className="pm-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>{L("কোম্পানি ফাইল", "Company file")}</th>
                <th className="num">{L("নিট বিক্রি", "Net sales")}</th>
                <th className="num">{L("মোট লাভ", "Gross profit")}</th>
                <th className="num">{L("খরচ", "Expenses")}</th>
                <th className="num">{L("নিট লাভ", "Net profit")}</th>
              </tr>
            </thead>
            <tbody>
              {consolidatedPl.rows.map((r) => (
                <tr key={r.label}>
                  <td>{r.label}</td>
                  <td className="num">{money(r.netSales)}</td>
                  <td className="num">{money(r.grossProfit)}</td>
                  <td className="num">{money(r.expenseTotal)}</td>
                  <td className="num">{money(r.netProfit)}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 800 }}>
                <td>{L("মোট", "Total")}</td>
                <td className="num">{money(consolidatedPl.totals.netSales)}</td>
                <td className="num">{money(consolidatedPl.totals.grossProfit)}</td>
                <td className="num">{money(consolidatedPl.totals.expenseTotal)}</td>
                <td className="num">{money(consolidatedPl.totals.netProfit)}</td>
              </tr>
            </tbody>
          </table>
          {(consolidatedPl.totals?.interCompanyPlElimination >= 0.01 || icElimination >= 0.01) && (
            <p style={{ padding: 12, fontSize: 12, color: "#64748b" }}>
              {consolidatedPl.totals?.interCompanyPlElimination >= 0.01
                ? L(
                  `গ্রুপ P&L: ইন্টার-কোম্পানি ক্রয় ${money(consolidatedPl.totals.interCompanyPlElimination)} এক পাশ কেটে নিট লাভ সমন্বয়।`,
                  `Group P&L: eliminated ${money(consolidatedPl.totals.interCompanyPlElimination)} inter-company purchase double-count from net profit.`
                )
                : L(
                  `Due from/HQ দেনা ${money(icElimination)} TB ও গ্রুপ BS-এ কেটে গেছে।`,
                  `${money(icElimination)} Due from/HQ netted on TB and group BS.`
                )}
            </p>
          )}
        </div>
      )}
      {consolidatedBs?.rows?.length > 0 && (
        <div className="pm-card" style={{ marginTop: 12, overflow: "auto" }}>
          <div style={{ padding: "10px 12px", fontWeight: 800, borderBottom: "1px solid #e2e8f0" }}>
            {L("সংযুক্ত ব্যালেন্স শিট", "Consolidated balance sheet")}
            <span style={{ fontWeight: 500, marginLeft: 8, fontSize: 12, color: "#64748b" }}>{L("পর্যন্ত", "As at")} {asOf}</span>
          </div>
          <table className="pm-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>{L("কোম্পানি ফাইল", "Company file")}</th>
                <th className="num">{L("মোট সম্পদ", "Total assets")}</th>
                <th className="num">{L("মোট দেনা", "Liabilities")}</th>
                <th className="num">{L("ইকুইটি", "Equity")}</th>
                <th className="num">{L("ওয়ার্কিং ক্যাপিটাল", "Working capital")}</th>
              </tr>
            </thead>
            <tbody>
              {consolidatedBs.rows.map((r) => (
                <tr key={r.label}>
                  <td>{r.label}</td>
                  <td className="num">{money(r.totalAssets)}</td>
                  <td className="num">{money(r.totalLiabilities)}</td>
                  <td className="num">{money(r.totalEquity)}</td>
                  <td className="num">{money(r.workingCapital)}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 800 }}>
                <td>{L("গ্রুপ মোট", "Group total")}</td>
                <td className="num">{money(consolidatedBs.totals.totalAssets)}</td>
                <td className="num">{money(consolidatedBs.totals.totalLiabilities)}</td>
                <td className="num">{money(consolidatedBs.totals.totalEquity)}</td>
                <td className="num" />
              </tr>
            </tbody>
          </table>
          {consolidatedBs.totals?.elimination >= 0.01 && (
            <p style={{ padding: 12, fontSize: 12, color: "#64748b" }}>
              {L(
                `গ্রুপ মোট সম্পদ/দেনায় ${money(consolidatedBs.totals.elimination)} এলিমিনেশন প্রয়োগ।`,
                `Group total assets/liabilities reflect ${money(consolidatedBs.totals.elimination)} inter-company elimination.`
              )}
            </p>
          )}
        </div>
      )}
      {consolidatedTb?.accounts?.length > 0 && (
        <div className="pm-card" style={{ marginTop: 12, overflow: "auto" }}>
          <div style={{ padding: "10px 12px", fontWeight: 800, borderBottom: "1px solid #e2e8f0" }}>
            {L("সংযুক্ত ট্রায়াল ব্যালেন্স", "Consolidated trial balance")}
            <span style={{ fontWeight: 500, marginLeft: 8, fontSize: 12, color: "#64748b" }}>{from} — {to}</span>
          </div>
          <table className="pm-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>{L("অ্যাকাউন্ট", "Account")}</th>
                <th className="num">{L("ওপেনিং", "Opening")}</th>
                <th className="num">Dr</th>
                <th className="num">Cr</th>
                <th className="num">{L("ক্লোজিং", "Closing")}</th>
              </tr>
            </thead>
            <tbody>
              {consolidatedTb.accounts.filter((a) => Math.abs(a.closing) >= 0.01 || Math.abs(a.dr) >= 0.01).slice(0, 80).map((a) => (
                <tr key={a.key}>
                  <td>{a.name}</td>
                  <td className="num">{drCr(a.opening)}</td>
                  <td className="num">{money(a.dr)}</td>
                  <td className="num">{money(a.cr)}</td>
                  <td className="num">{drCr(a.closing)}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 800 }}>
                <td>{L("মোট (ডি/সি)", "Totals (Dr/Cr)")}</td>
                <td className="num" />
                <td className="num">{money(consolidatedTb.totals.dr)}</td>
                <td className="num">{money(consolidatedTb.totals.cr)}</td>
                <td className="num">{drCr(consolidatedTb.difference)}</td>
              </tr>
            </tbody>
          </table>
          {(consolidatedTb.elimination >= 0.01 || icElimination >= 0.01) && (
            <p style={{ padding: 12, fontSize: 12, color: "#64748b" }}>
              {L(
                `ইন্টার-কোম্পানি Due এলিমিনেশন: ${money(consolidatedTb.elimination ?? icElimination)}`,
                `Inter-company Due elimination: ${money(consolidatedTb.elimination ?? icElimination)}`
              )}
            </p>
          )}
          {Math.abs(consolidatedTb.difference) > 0.02 && (
            <p style={{ padding: 12, fontSize: 12, color: "#b91c1c" }}>
              {L("সতর্ক: সংযুক্ত ক্লোজিং ডেবিট/ক্রেডিট মিলছে না — শাখা ভিন্ন CoA বা ইন্টার-কোম্পানি এন্ট্রি চেক করুন।", "Warning: consolidated closing Dr/Cr do not tie — check branch CoA alignment or inter-company entries.")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}