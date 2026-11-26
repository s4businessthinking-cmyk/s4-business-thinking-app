// Month-end pack panel (inside the Trial Balance hub): pick the month, see the checks, print / save the accountant
// pack (trial balance, P&L, balance sheet, cash flow, VAT, ageing, stock, bank reconciliation) and close the books
// up to the month end with the period lock. Every figure comes from the same report functions as their own screens;
// rules in monthEndPack.js. The lock is the owner's, the same record as Settings > Period lock.
import React, { useMemo, useState } from "react";
import { computeStockMap } from "../inventory/stockFromInvoices";
import { saveShopRecord } from "../offline/shopService";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { saveTextFile } from "../utils/saveTextFile.js";
import { periodLockOf } from "../accounts/periodLock.js";
import { collectBankTransactions, reconcile } from "../accounts/bankRec.js";
import { balances } from "../ledger/globalLedger.js";
import { computeAccounts } from "./accountsCalc.js";
import { shopAccountNature } from "../ledger/accountNature.js";
import { averageCosts } from "./averageCost.js";
import { unitCostsAt, valuationMethodOf } from "./stockValuation.js";
import { buildBalanceSheet, openingStockValue, stockDocsUpTo } from "./balanceSheet.js";
import { buildCashFlow } from "./cashFlow.js";
import { buildAging } from "./partyAging.js";
import { livePurchasesOf, liveReturnsOf, r2 } from "./reportFilters.js";
import { computeVat, taxSettingsOf } from "./taxDomain.js";
import { buildTrialBalance } from "./trialBalance.js";
import { vat201ForPeriod } from "./vat201.js";
import { closedYearAt } from "./yearEnd.js";
import { csvText } from "./vatExport.js";
import { combinePrintHtml, packChecks, packCsvRows, packFileName, packSections, packStatus } from "./monthEndPack.js";
import DateField from "../components/DateField.jsx";

const pad = (v) => String(v).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const BANK_COL = { salesInvoices: "Sales bill", purchaseInvoices: "Purchase bill", salesReceipts: "Receipt", purchasePayments: "Payment", expenses: "Expense", bankReconciliations: "Bank entry", salesReturns: "Sales return refund", purchaseReturns: "Purchase return refund", accountVouchers: "Journal / Contra", partnerEntries: "Partner money" };

/** Closing stock exactly as the Balance Sheet works it out (quantity on hand x cost at the method, negatives left out). */
export function stockValueAt(rows, products, shopId, day, method = "average") {
  const cut = stockDocsUpTo(rows, day);
  const avg = unitCostsAt(method, products, cut, { shopId, upTo: day });
  const qty = computeStockMap(products, cut.purchaseInvoices, cut.salesInvoices, shopId, cut.deliveryNotes, cut.extras);
  let value = 0;
  qty.forEach((q, id) => { if (q > 0) value += q * (avg.get(id) || 0); });
  return r2(value);
}

export default function MonthEndPackPanel({ lang = "en", shopId, shop, user, profile, isOwner = false, canPrint = false, data, ledger, products = [], customers = [], vendors = [], shopName = "", cur = "AED", toast, onShopUpdated, onClose }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const now = new Date();
  const lastStart = ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const lastEnd = ymd(new Date(now.getFullYear(), now.getMonth(), 0));
  const thisStart = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
  const today = ymd(now);
  const [from, setFrom] = useState(lastStart);
  const [to, setTo] = useState(lastEnd);
  const [busy, setBusy] = useState(false);
  const lock = periodLockOf(shop);
  const settings = useMemo(() => taxSettingsOf(shop), [shop]);
  const isUae = settings.country === "ae";
  const badRange = !from || !to || from > to;

  const pack = useMemo(() => {
    if (!data || !ledger || badRange) return null;
    const rows = data.rows || { salesInvoices: data.salesInvoices, purchaseInvoices: data.purchaseInvoices, extras: { salesReturns: data.salesReturns, purchaseReturns: data.purchaseReturns } };
    const docData = { ...rows, receipts: data.receipts, payments: data.payments, expenses: data.expenses, accountVouchers: data.accountVouchers };
    const tb = buildTrialBalance(ledger, { from, to, chart: shop?.chartOfAccounts || [], coaGroups: shop?.coaGroups || [] });
    const pl = computeAccounts(docData, { products, shopId, from, to, bn, natureOf: shopAccountNature(shop), method: valuationMethodOf(shop) });
    const stockValue = stockValueAt(rows, products, shopId, to, valuationMethodOf(shop));
    const sheet = buildBalanceSheet({ accounts: ledger.accounts, bal: balances(ledger.postings, to), closingStock: stockValue, openingStock: openingStockValue(products),
      closedStock: closedYearAt(shop?.yearEnds, to, data.accountVouchers)?.stockValue ?? null });
    const cash = buildCashFlow(ledger.postings, ledger.accounts, { from, to });
    const debtors = buildAging(ledger.postings, ledger.accounts, { side: "customer", asOf: to });
    const creditors = buildAging(ledger.postings, ledger.accounts, { side: "vendor", asOf: to });
    const vat = computeVat(docData, { shopId, from, to, customers, vendors, defaultRegion: shop?.emirate, natureOf: shopAccountNature(shop) });
    // the same VAT201 as the Tax page for this period, hand entries (boxes 2, 3, 6, 7, 10) included
    const ret201 = isUae && vat ? vat201ForPeriod(vat, { shop, customers, from, to, noVatBox: settings.vat201NoVatBox === "5" ? "5" : "4" }) : null;
    // bank reconciliation at the month end, with the statement saved for that day (Bank Reconciliation screen)
    const docs = (data.bankDocs || []).filter((d) => d && !d.isDeleted && d.shopId === shopId);
    const bankSettings = docs.filter((d) => d.kind === "settings").sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))[0] || null;
    const markDocs = new Map();
    docs.filter((d) => d.kind === "mark" && d.txKey).forEach((d) => { const p = markDocs.get(d.txKey); if (!p || String(d.updatedAt || "") > String(p.updatedAt || "")) markDocs.set(d.txKey, d); });
    const marks = new Map([...markDocs.entries()].map(([k, d]) => [k, d.clearedDate || ""]));
    const statement = docs.filter((d) => d.kind === "statement" && d.asOf === to).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))[0] || null;
    const txs = collectBankTransactions({ ...docData, salesReturns: rows.extras?.salesReturns || [], purchaseReturns: rows.extras?.purchaseReturns || [], vouchers: data.accountVouchers, partnerEntries: data.partnerEntries, bankEntries: docs.filter((d) => d.kind === "entry") }, shopId);
    const rec = reconcile(txs, marks, { opening: Number(bankSettings?.openingBalance) || 0, openingDate: bankSettings?.openingDate || "", asOf: to, statementBalance: statement ? statement.statementBalance : null });
    const bank = { configured: !!bankSettings || txs.length > 0, statement, rec, typeLabel: (t) => BANK_COL[t.col] || t.col };
    const inPeriod = (d) => d >= from && d <= to;
    const drafts = [...(rows.salesInvoices || []), ...(rows.purchaseInvoices || [])].filter((b) => b && !b.isDeleted && b.status === "draft" && (!b.shopId || b.shopId === shopId) && inPeriod(String(b.invoiceDate || "").slice(0, 10))).length;
    const checks = packChecks({ tb, sheet, ret201, vat, bank, drafts, lockDate: lock.lockDate, to });
    const meta = { shopName, trn: shop?.trnNumber || "", from, to, currency: cur, taxName: settings.taxName || "VAT", generatedAt: new Date().toISOString().slice(0, 16).replace("T", " ") };
    const sections = packSections({ meta, checks, tb, pl, sheet, cash, vat, ret201, debtors, creditors, stockValue, bank });
    return { checks, status: packStatus(checks), sections };
  }, [data, ledger, from, to, badRange, products, customers, vendors, shop, shopId, isUae, settings, lock.lockDate, shopName, cur, bn]);

  const print = () => {
    if (!pack) return;
    const numeric = (s, i) => i > 0 && s.rows.some((r) => r[i] !== "" && r[i] != null) && s.rows.every((r) => r[i] === "" || r[i] == null || !Number.isNaN(Number(r[i])));
    const pages = pack.sections.map((s) => generateStatementHTML({
      shopName, title: s.title, subtitle: `${fmtDay(from)} - ${fmtDay(to)}${shop?.trnNumber ? ` · TRN ${shop.trnNumber}` : ""}`,
      cols: s.cols.map((label, i) => ({ label, align: numeric(s, i) ? "right" : undefined })), rows: s.rows.map((r) => r.map((v) => String(v ?? ""))),
    }));
    printWithSettings(combinePrintHtml(pages), { lang });
  };
  const exportCsv = async () => {
    if (!pack) return;
    try { await saveTextFile(packFileName(from, to), csvText(packCsvRows(pack.sections))); } catch (e) { toast?.(e.message || String(e), "err"); }
  };
  const closeBooks = async () => {
    if (!isOwner || !pack || busy) return;
    if (to > today) { toast?.(L("ভবিষ্যতের তারিখ লক করা যাবে না", "You cannot lock a future date"), "err"); return; }
    if (pack.status === "blocked") { toast?.(L("আগে লাল চেকগুলো ঠিক করুন", "Fix the checks in red first"), "err"); return; }
    if (pack.status === "warn" && !window.confirm(L("কিছু চেক হলুদ (দেখে নেওয়ার মতো)। তবুও এগোবেন?", "Some checks are amber (worth a look). Go on anyway?"))) return;
    if (!window.confirm(L(`${to} পর্যন্ত সব হিসাব বন্ধ হবে। এই তারিখ বা তার আগের বিল, রিসিট, পেমেন্ট, খরচ, ভাউচার, রিটার্ন, স্টক সমন্বয় আর কেউ যোগ / এডিট / বাতিল / মুছতে পারবে না (মালিকও না, যতক্ষণ লক থাকে)। চালিয়ে যাবেন?`,
      `All books up to ${to} will be closed. Nobody (owner included, while locked) can add, edit, cancel or delete bills, receipts, payments, expenses, vouchers, returns or stock adjustments dated on or before it. Continue?`))) return;
    setBusy(true);
    try {
      const at = new Date().toISOString();
      const by = profile?.personName || user?.email || "";
      const note = `Month-end pack ${from} to ${to}`;
      const history = Array.isArray(lock.history) ? lock.history.slice(-19) : [];
      const next = { lockDate: to, note, lockedAt: at, lockedBy: user?.uid || "", lockedByName: by, history: [...history, { lockDate: to, at, by, note }] };
      const updated = await saveShopRecord(shopId, { periodLock: next }, { ownerUid: user?.uid, profile, user });
      onShopUpdated?.(updated || { periodLock: next });
      toast?.(L(`${to} পর্যন্ত হিসাব বন্ধ করা হলো`, `Books locked up to ${to}`));
    } catch (e) {
      toast?.(e?.message || String(e), "err");
    } finally {
      setBusy(false);
    }
  };

  const colorOf = (c) => (!c.ok ? "#b91c1c" : c.warn ? "#b45309" : "#15803d");
  const alreadyLocked = !!lock.lockDate && lock.lockDate >= to;
  return (
    <fieldset className="pm-panel" style={{ margin: 0 }}>
      <legend className="pm-panel-legend">{L("মাস শেষের প্যাক (হিসাবরক্ষকের জন্য)", "Month-end pack (for the accountant)")}</legend>
      <div className="si-panel-body" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <div className="si-pills">
            <button type="button" className={`pm-btn-secondary${from === lastStart && to === lastEnd ? " is-active" : ""}`} onClick={() => { setFrom(lastStart); setTo(lastEnd); }}>{L("গত মাস", "Last month")}</button>
            <button type="button" className={`pm-btn-secondary${from === thisStart && to === today ? " is-active" : ""}`} onClick={() => { setFrom(thisStart); setTo(today); }}>{L("এই মাস", "This month")}</button>
          </div>
          <DateField className="pm-input" style={{ width: 130, borderColor: badRange ? "#b91c1c" : undefined }} value={from} onChange={(e) => setFrom(e.target.value)} />
          <DateField className="pm-input" style={{ width: 130, borderColor: badRange ? "#b91c1c" : undefined }} value={to} onChange={(e) => setTo(e.target.value)} />
          <span className="si-toolbar-gap" />
          {canPrint && <button type="button" className="pm-btn pm-btn--primary" onClick={print} disabled={!pack}> {L("প্যাক প্রিন্ট / PDF", "Print / PDF pack")}</button>}
          {canPrint && <button type="button" className="pm-btn-secondary" onClick={exportCsv} disabled={!pack}> {L("প্যাক Excel", "Excel pack")}</button>}
          {onClose && <button type="button" className="pm-btn-secondary" onClick={onClose}>{L("বন্ধ", "Close")}</button>}
        </div>
        {badRange && <div className="si-paid-box is-due">{L("সঠিক সময় দিন", "Pick a valid period")}</div>}
        {pack && (
          <>
            <div>
              {pack.checks.map((c) => (
                <div key={c.id} style={{ color: colorOf(c), fontWeight: 700, fontSize: 12.5 }}>{!c.ok ? L("ঠিক নেই", "Not OK") : c.warn ? L("দেখে নিন", "Look") : L("ঠিক আছে", "OK")} - {bn ? c.bn : c.en}</div>
              ))}
            </div>
            <div className="si-muted">{L("প্যাকে থাকে: ", "The pack holds: ")}{pack.sections.filter((s) => s.id !== "cover").map((s) => s.title).join(" · ")}</div>
            {isUae && <div className="si-muted" style={{ fontSize: 12 }}>{L("VAT201 ট্যাক্স পাতার একই হিসাব - এই সময়ের হাতে দেওয়া এন্ট্রি (Box 2, 3, 6, 7, 10) সহ। S4 FTA-তে কিছু জমা দেয় না।", "VAT201 is the same as on the Tax page - this period's hand entries (boxes 2, 3, 6, 7, 10) included. S4 does not file anything with FTA.")}</div>}
            {isOwner ? (
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <button type="button" className="pm-btn pm-btn--danger" onClick={closeBooks} disabled={busy || alreadyLocked || pack.status === "blocked" || to > today}>
                  {L(`${fmtDay(to)} পর্যন্ত হিসাব বন্ধ করুন`, `Close the books up to ${fmtDay(to)}`)}
                </button>
                <span className="si-muted">
                  {alreadyLocked ? L(`${fmtDay(lock.lockDate)} পর্যন্ত আগেই বন্ধ`, `Already closed up to ${fmtDay(lock.lockDate)}`)
                    : pack.status === "blocked" ? L("লাল চেক ঠিক না করা পর্যন্ত বন্ধ করা যাবে না", "Cannot close while a check is red")
                      : to > today ? L("মাস শেষ হলে বন্ধ করা যাবে", "Can be closed once the month is over")
                        : L("বন্ধ করলে ওই তারিখ পর্যন্ত কেউ এন্ট্রি বদলাতে পারবে না (সেটিংস > পিরিয়ড লক থেকে খোলা যায়)", "Closing stops anyone changing entries up to that day (can be reopened in Settings > Period lock)")}
                </span>
              </div>
            ) : <div className="si-muted">{L("হিসাব বন্ধ করা শুধু মালিক পারেন", "Only the owner can close the books")}</div>}
          </>
        )}
      </div>
    </fieldset>
  );
}
