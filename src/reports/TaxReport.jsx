import React, { useEffect, useMemo, useRef, useState } from "react";
import { PM_CSS } from "../product-master/pmStyles";
import { SI_CSS, usePmFitHeight, usePmMobile } from "../sales-invoice/siSkin";
import { offlineCreate, offlineList, offlineRemove } from "../offline/offlineRepository";
import { loadInvoiceRows, rowsOf } from "../inventory/stockFromInvoices";
import { saveShopRecord } from "../offline/shopService";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { saveTextFile } from "../utils/saveTextFile.js";
import { normUrl, openLink } from "../utils/openLink.js";
import { openDocFile, readDocFile } from "../utils/docFiles.js";
import { computeAccounts } from "./accountsCalc.js";
import { r2 } from "./reportFilters.js";
import { TAX_PRESETS, UAE_CT_DEFAULTS, UAE_EMIRATES, addDays, computeVat, corporateTax, ctDueDate, fyRange, periodRange, presetSettings, taxSettingsOf } from "./taxDomain.js";

const money = (v) => r2(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const csvCell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export default function TaxReport({ lang = "en", shopId, shop, user, products = [], customers = [], vendors = [], shopName = "", toast, onShopUpdated }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const settings = useMemo(() => taxSettingsOf(shop), [shop]);
  const tn = settings.taxName || "VAT";
  const cur = settings.currency || "AED";
  const isUae = settings.country === "ae";
  const [view, setView] = useState("vat");
  const [tab, setTab] = useState("summary");
  const [range, setRange] = useState(() => ({ key: "cur", ...periodRange(settings, 0) }));
  const [fyOffset, setFyOffset] = useState(0);
  const [sbr, setSbr] = useState(!!settings.sbrElected);
  const [data, setData] = useState(null);
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [taxPayments, setTaxPayments] = useState([]);
  const [payForm, setPayForm] = useState(null);
  const [payBusy, setPayBusy] = useState(false);
  const mobile = usePmMobile();
  const rootRef = useRef(null);
  const payFileRef = useRef(null);
  const fitH = usePmFitHeight(rootRef, mobile);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadInvoiceRows(), offlineList("salesReceipts"), offlineList("purchasePayments"), offlineList("expenses")])
      .then(([rows, rc, pm, ex]) => { if (!cancelled) setData({ ...rows, receipts: rowsOf(rc), payments: rowsOf(pm), expenses: rowsOf(ex) }); })
      .catch((err) => console.warn("[S4 Tax] load failed", err));
    return () => { cancelled = true; };
  }, [shopId, tick]);

  useEffect(() => {
    let cancelled = false;
    offlineList("taxPayments")
      .then((rows) => { if (!cancelled) setTaxPayments(rowsOf(rows).filter((p) => p.shopId === shopId)); })
      .catch((err) => console.warn("[S4 Tax] payments load failed", err));
    return () => { cancelled = true; };
  }, [shopId, tick]);

  useEffect(() => {
    const refresh = () => { if (document.visibilityState !== "hidden") setTick((v) => v + 1); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);

  // A changed monthly/quarterly setting moves the quick periods with it.
  useEffect(() => {
    setRange((r) => (r.key === "cur" || r.key === "prev" ? { key: r.key, ...periodRange(settings, r.key === "prev" ? -1 : 0) } : r));
  }, [settings]);
  useEffect(() => { setSbr(!!settings.sbrElected); }, [settings.sbrElected]);
  // An open "add payment" form is scoped to one view's periods (quarters/months for VAT, years for CT) —
  // switching VAT <-> Corporate Tax mid-edit would otherwise leave it showing the other view's period list.
  useEffect(() => { setPayForm(null); }, [view]);

  const { from, to } = range;
  const badRange = !!(from && to && from > to);
  const vat = useMemo(() => (badRange ? null : computeVat(data, { shopId, from, to, customers, vendors, defaultRegion: shop?.emirate })), [data, shopId, from, to, customers, vendors, badRange, shop?.emirate]);
  const fy = useMemo(() => fyRange(settings, fyOffset), [settings, fyOffset]);
  const fyAcc = useMemo(() => computeAccounts(data, { products, shopId, from: fy.from, to: fy.to, bn }), [data, products, shopId, fy, bn]);
  const ct = fyAcc ? corporateTax({ profit: fyAcc.netProfit, revenue: fyAcc.netSales, settings: { ...settings, sbrElected: sbr } }) : null;

  const monthly = settings.period === "monthly";
  const quick = [
    ["cur", monthly ? L("এই মাস", "This month") : L("এই কোয়ার্টার", "This quarter"), periodRange(settings, 0)],
    ["prev", monthly ? L("আগের মাস", "Last month") : L("আগের কোয়ার্টার", "Last quarter"), periodRange(settings, -1)],
    ["year", L("এই বছর", "This year"), fyRange(settings, 0)],
  ];
  const periodLabel = range.label || `${fmtDay(from)} — ${fmtDay(to)}`;
  const isFilingPeriod = range.key === "cur" || range.key === "prev";
  const dueDate = isFilingPeriod && settings.dueDays != null && settings.dueDays !== "" && to ? addDays(to, Number(settings.dueDays)) : "";
  const payable = vat?.payable || 0;

  // ── tables shared by screen, print and CSV ──
  const billCols = (partyLabel, refLabel) => [
    { label: L("তারিখ", "Date"), w: 80 }, { label: L("বিল নং", "Bill No"), w: 100 }, { label: refLabel, w: 100 }, { label: partyLabel }, { label: "TRN", w: 130 },
    { label: `${L("VAT ছাড়া", "Taxable")} (${cur})`, align: "right", w: 110 }, { label: `${tn} (${cur})`, align: "right", w: 90 }, { label: `${L("মোট", "Total")} (${cur})`, align: "right", w: 110 },
  ];
  const billRows = (rows, cashLabel) => rows.map((r) => [
    fmtDay(r.date), r.isReturn ? `↩ ${r.no}` : r.isExpense ? `💸 ${r.no}` : r.no, r.ref || "", r.party || cashLabel, r.trn || "", money(r.taxable), money(r.vat), money(r.total),
  ]);
  const billFoot = (rows) => [L("মোট", "Total"), `${rows.length}`, "", "", "", money(rows.reduce((t, r) => t + r.taxable, 0)), money(rows.reduce((t, r) => t + r.vat, 0)), money(rows.reduce((t, r) => t + r.total, 0))];

  const tables = !vat ? {} : {
    sales: { title: L(`বিক্রির ${tn} — বিল অনুযায়ী`, `Output ${tn} — Sales bills`), cols: billCols(L("কাস্টমার", "Customer"), L("মূল বিল", "Orig. bill")), rows: billRows(vat.salesRows, L("নগদ কাস্টমার", "Cash customer")), foot: billFoot(vat.salesRows), returns: vat.salesRows.map((r) => r.isReturn) },
    purchases: (() => {
      // Supplier has no TRN on file -> not a valid tax invoice, so it stays out of this report entirely (not just the totals).
      const claimableRows = vat.purchaseRows.filter((r) => r.vatClaimable);
      return { title: L(`ক্রয় ও খরচের ${tn} — বিল অনুযায়ী`, `Input ${tn} — Purchase & expense bills`), cols: billCols(L("সাপ্লায়ার / কাকে", "Supplier / Paid to"), L("সাপ্লায়ারের বিল", "Supplier bill")), rows: billRows(claimableRows, "—"), foot: billFoot(claimableRows), returns: claimableRows.map((r) => r.isReturn) };
    })(),
    products: {
      title: L(`পণ্য অনুযায়ী ${tn}`, `${tn} by product`),
      cols: [{ label: L("কোড", "Code"), w: 110 }, { label: L("পণ্য", "Product") }, { label: L("বিক্রি qty", "Sold qty"), align: "right", w: 70 }, { label: L("বিক্রি (VAT ছাড়া)", "Sales taxable"), align: "right", w: 105 }, { label: L(`বিক্রির ${tn}`, `Output ${tn}`), align: "right", w: 90 }, { label: L("ক্রয় qty", "Bought qty"), align: "right", w: 70 }, { label: L("ক্রয় (VAT ছাড়া)", "Purchase taxable"), align: "right", w: 105 }, { label: L(`ক্রয়ের ${tn}`, `Input ${tn}`), align: "right", w: 90 }],
      rows: vat.productRows.map((p) => [p.code, p.name, p.soldQty, money(p.salesTaxable), money(p.salesVat), p.boughtQty, money(p.purchTaxable), money(p.purchVat)]),
      foot: [L("মোট", "Total"), `${vat.productRows.length}`, "", money(vat.productRows.reduce((t, p) => t + p.salesTaxable, 0)), money(vat.productRows.reduce((t, p) => t + p.salesVat, 0)), "", money(vat.productRows.reduce((t, p) => t + p.purchTaxable, 0)), money(vat.productRows.reduce((t, p) => t + p.purchVat, 0))],
    },
    regions: {
      title: isUae ? L(`Emirate অনুযায়ী বিক্রির ${tn}`, `Output ${tn} by Emirate`) : L(`এলাকা অনুযায়ী বিক্রির ${tn}`, `Output ${tn} by region`),
      cols: [{ label: isUae ? "Emirate" : L("এলাকা / শহর", "Region / City") }, { label: L("বিল", "Bills"), align: "right", w: 70 }, { label: `${L("VAT ছাড়া বিক্রি", "Taxable sales")} (${cur})`, align: "right", w: 140 }, { label: `${tn} (${cur})`, align: "right", w: 110 }],
      rows: vat.regionRows.map((x) => [x.region || L("লেখা নেই (নগদ / কাস্টমারে Emirate নেই)", "Not set (cash / customer has no Emirate)"), x.bills, money(x.taxable), money(x.vat)]),
      foot: [L("মোট", "Total"), vat.regionRows.reduce((t, x) => t + x.bills, 0), money(vat.regionRows.reduce((t, x) => t + x.taxable, 0)), money(vat.regionRows.reduce((t, x) => t + x.vat, 0))],
    },
    vendors: {
      title: L(`সাপ্লায়ার অনুযায়ী ক্রয়ের ${tn}`, `Input ${tn} by supplier`),
      cols: [{ label: L("সাপ্লায়ার", "Supplier") }, { label: "TRN", w: 130 }, { label: L("বিল", "Bills"), align: "right", w: 70 }, { label: `${L("VAT ছাড়া ক্রয়", "Taxable purchases")} (${cur})`, align: "right", w: 140 }, { label: `${tn} (${cur})`, align: "right", w: 110 }],
      rows: vat.vendorRows.map((x) => [x.vendor, x.trn || "", x.bills, money(x.taxable), money(x.vat)]),
      foot: [L("মোট", "Total"), "", vat.vendorRows.reduce((t, x) => t + x.bills, 0), money(vat.vendorRows.reduce((t, x) => t + x.taxable, 0)), money(vat.vendorRows.reduce((t, x) => t + x.vat, 0))],
    },
    customers: {
      title: L(`কাস্টমার অনুযায়ী বিক্রি`, `Sales by customer`),
      cols: [{ label: L("কাস্টমার", "Customer") }, { label: "TRN", w: 130 }, { label: L("বিল", "Bills"), align: "right", w: 70 }, { label: `${L("VAT ছাড়া বিক্রি", "Taxable sales")} (${cur})`, align: "right", w: 140 }, { label: `${tn} (${cur})`, align: "right", w: 110 }, { label: `${L("মোট", "Total")} (${cur})`, align: "right", w: 120 }],
      rows: vat.customerRows.map((x) => [x.customer === "—" ? L("নগদ / নাম নেই", "Cash / no name") : x.customer, x.trn || "", x.bills, money(x.taxable), money(x.vat), money(x.total)]),
      foot: [L("মোট", "Total"), "", vat.customerRows.reduce((t, x) => t + x.bills, 0), money(vat.customerRows.reduce((t, x) => t + x.taxable, 0)), money(vat.customerRows.reduce((t, x) => t + x.vat, 0)), money(vat.customerRows.reduce((t, x) => t + x.total, 0))],
    },
  };

  const box = (no) => (isUae ? `Box ${no} · ` : "");
  const emirateBoxRows = !isUae || !vat ? [] : UAE_EMIRATES.flatMap((em, i) => {
    const letter = String.fromCharCode(97 + i);
    const row = vat.regionRows.find((x) => x.region === em);
    return [
      [`Box 1${letter} · ${em}`, null],
      [`   ${L("VAT ছাড়া মূল্য", "taxable value")}`, row?.taxable || 0],
      [`   ${tn}`, row?.vat || 0],
    ];
  });
  const unallocated = !isUae || !vat ? 0 : vat.stdSales - emirateBoxRows.filter((_, i) => i % 3 === 1).reduce((t, [, v]) => t + v, 0);

  const returnSections = !vat ? [] : [
    [L(`বিক্রি — যে ${tn} আপনি নিয়েছেন (Output)`, `Sales — ${tn} you collected (Output)`), [
      ...(isUae ? emirateBoxRows : [[`${box(1)}${L(`${tn} সহ বিক্রি (VAT ছাড়া মূল্য)`, `Standard-rated sales (taxable value)`)}`, vat.stdSales]]),
      ...(isUae && Math.abs(unallocated) > 0.004 ? [[L("বরাদ্দ করা হয়নি (কাস্টমারের Emirate নেই)", "Not allocated to an Emirate (customer has no Emirate)"), unallocated, false, "#b45309"]] : []),
      [`${box(1)}${L(`বিক্রির ${tn}`, `${tn} on sales`)}`, vat.outputVat, true],
      [`${isUae ? "Box 4/5 · " : ""}${L(`${tn} ছাড়া বিক্রি (zero-rated / exempt)`, `Sales without ${tn} (zero-rated / exempt)`)}`, vat.noVatSales],
    ]],
    [L(`ক্রয় ও খরচ — যে ${tn} আপনি দিয়েছেন (Input)`, `Purchases & expenses — ${tn} you paid (Input)`), [
      [`${box(9)}${L(`${tn} সহ ক্রয় ও খরচ (VAT ছাড়া মূল্য)`, `Standard-rated expenses (taxable value)`)}`, vat.stdPurch],
      ...(vat.expenseVat ? [[L(`   এর মধ্যে দোকানের খরচের ${tn} (${vat.expenseCount}টি বিল)`, `   of which ${tn} on shop expenses (${vat.expenseCount} bills)`), vat.expenseVat]] : []),
      [`${box(9)}${L(`ক্রয় ও খরচের ${tn} (ফেরত পাবেন)`, `Recoverable ${tn} on purchases & expenses`)}`, vat.inputVat, true],
      [L(`${tn} ছাড়া ক্রয়`, `Purchases without ${tn}`), vat.noVatPurch],
      ...(vat.noTrnPurchVat ? [[L(`সাপ্লায়ারের TRN নেই, তাই বাদ (${vat.missingVendorTrn}টি বিল)`, `Excluded — supplier has no TRN (${vat.missingVendorTrn} bill(s))`), vat.noTrnPurchVat, false, "#b45309"]] : []),
    ]],
    [L("ফলাফল", "Result"), [
      [`${box(12)}${L(`মোট ${tn} (বিক্রির)`, `Total ${tn} due`)}`, vat.outputVat],
      [`${box(13)}${L(`বাদ: ক্রয়ের ${tn}`, `Less: recoverable ${tn}`)}`, -vat.inputVat],
      [`${box(14)}${payable >= 0 ? L("সরকারকে দিতে হবে", `Net ${tn} payable`) : L("সরকার থেকে ফেরত পাবেন", `Net ${tn} refundable`)}`, payable, true, payable >= 0 ? "#b91c1c" : "#15803d"],
    ]],
  ];

  const ctSections = !fyAcc || !ct ? [] : [
    [L(`বছরের লাভ (${fy.label})`, `Profit for the year (${fy.label})`), [
      [L("নিট বিক্রি (VAT ও রিটার্ন বাদে)", "Net sales (excl. VAT & returns)"), fyAcc.netSales],
      [L("বিক্রি হওয়া মালের ক্রয়মূল্য", "Cost of goods sold"), -fyAcc.cogs],
      ...(fyAcc.vendorDiscount > 0 ? [[L("সাপ্লায়ারের ছাড়", "Supplier discounts"), fyAcc.vendorDiscount]] : []),
      [L("দোকানের খরচ", "Shop expenses"), -fyAcc.expenseTotal],
      [fyAcc.netProfit >= 0 ? L("নিট লাভ", "Net profit") : L("নিট ক্ষতি", "Net loss"), fyAcc.netProfit, true, fyAcc.netProfit >= 0 ? "#15803d" : "#b91c1c"],
    ]],
    [L("Corporate Tax হিসাব", "Corporate Tax"), [
      [L(`প্রথম ${cur} ${money(ct.threshold)} পর্যন্ত — 0%`, `First ${cur} ${money(ct.threshold)} — 0%`), ct.atZero],
      [L(`তার বেশি লাভ — ${ct.rate}%`, `Profit above that — ${ct.rate}%`), ct.atRate],
      ...(ct.sbrApplied ? [[L("Small Business Relief নেওয়া হয়েছে", "Small Business Relief applied"), 0]] : []),
      [L("Corporate Tax দিতে হবে", "Corporate Tax payable"), ct.tax, true, ct.tax > 0 ? "#b91c1c" : "#15803d"],
    ]],
  ];

  const sectionRows = (sections) => {
    const rows = [];
    sections.forEach(([title, lines]) => { rows.push([title.toUpperCase(), ""]); lines.forEach(([label, value]) => rows.push([`   ${label}`, money(value)])); });
    return rows;
  };

  const print = () => {
    const party = [shop?.trnNumber ? `TRN: ${shop.trnNumber}` : "", L(`দেশ: ${TAX_PRESETS[settings.country]?.bn || ""}`, `Country: ${TAX_PRESETS[settings.country]?.en || ""}`)].filter(Boolean).join("   ·   ");
    const amtCol = [{ label: L("বিবরণ", "Particulars") }, { label: `${L("টাকা", "Amount")} (${cur})`, align: "right" }];
    let doc;
    if (view === "ct") {
      if (!ctSections.length) return;
      doc = { title: L("কর্পোরেট ট্যাক্স হিসাব", "CORPORATE TAX ESTIMATE"), subtitle: `${L("বছর", "Year")} ${fy.label} · ${fmtDay(fy.from)} — ${fmtDay(fy.to)}`, cols: amtCol, rows: [...sectionRows(ctSections), [L("জমার শেষ তারিখ", "Filing due by"), fmtDay(ctDueDate(fy.to))]] };
    } else if (tab === "summary") {
      if (!returnSections.length) return;
      doc = { title: L(`${tn} রিটার্ন সারাংশ`, `${tn} RETURN SUMMARY`), subtitle: periodLabel, cols: amtCol, rows: [...sectionRows(returnSections), ...(dueDate ? [[L("জমার শেষ তারিখ", "Filing due by"), fmtDay(dueDate)]] : [])] };
    } else {
      const tb = tables[tab];
      if (!tb) return;
      doc = { title: tb.title.toUpperCase(), subtitle: periodLabel, cols: tb.cols, rows: tb.rows.map((r) => r.map(String)), foot: tb.foot.map(String) };
    }
    printWithSettings(generateStatementHTML({ shopName, partyLine: party, ...doc }), { lang });
  };

  const exportCsv = async () => {
    let cols, rows, name;
    if (view === "ct") { cols = ["Particulars", `Amount (${cur})`]; rows = sectionRows(ctSections); name = `corporate-tax-${fy.label}`; }
    else if (tab === "summary") { cols = ["Particulars", `Amount (${cur})`]; rows = sectionRows(returnSections); name = `${tn}-return-${from}_${to}`; }
    else { const tb = tables[tab]; cols = tb.cols.map((c) => c.label); rows = [...tb.rows, tb.foot]; name = `${tn}-${tab}-${from}_${to}`; }
    const text = "\uFEFF" + [cols, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
    try { await saveTextFile(`${name.replace(/[^\w.-]+/g, "-")}.csv`, text); } catch (e) { toast?.(e.message || String(e), "err"); }
  };

  // ── settings ──
  const openSettings = () => setEditing({ ...settings });
  const setE = (k, v) => setEditing((p) => ({ ...p, [k]: v }));
  const pickCountry = (country) => setEditing((p) => ({ ...p, ...presetSettings(country), ...(country === "ae" ? UAE_CT_DEFAULTS : {}) }));
  const saveSettings = async () => {
    if (!editing) return;
    const clean = {
      country: editing.country, taxName: String(editing.taxName || "").trim() || "VAT", rate: Math.max(0, Number(editing.rate) || 0),
      currency: String(editing.currency || "").trim().toUpperCase(), filingUrl: normUrl(editing.filingUrl),
      dueDays: editing.dueDays === "" || editing.dueDays == null ? null : Math.max(0, Math.round(Number(editing.dueDays) || 0)),
      period: editing.period === "monthly" ? "monthly" : "quarterly", periodStartMonth: Number(editing.periodStartMonth) || 1,
      ctEnabled: !!editing.ctEnabled, ctFilingUrl: normUrl(editing.ctFilingUrl), fyStartMonth: Number(editing.fyStartMonth) || 1,
      ctThreshold: Math.max(0, Number(editing.ctThreshold) || 0), ctRate: Math.max(0, Number(editing.ctRate) || 0),
      sbrLimit: Math.max(0, Number(editing.sbrLimit) || 0), sbrElected: !!editing.sbrElected,
      taxNotify: !!editing.taxNotify,
    };
    setSaving(true);
    try {
      const updated = await saveShopRecord(shopId, { country: clean.country, currency: clean.currency, fyStartMonth: clean.fyStartMonth, taxSettings: clean }, { ownerUid: user?.uid || shop?.ownerUid });
      onShopUpdated?.(updated);
      setEditing(null);
      if (!clean.ctEnabled) setView("vat");
      toast?.(L("✅ ট্যাক্স সেটিং সেভ হয়েছে", "✅ Tax settings saved"));
    } catch (e) {
      toast?.(e.message || String(e), "err");
    } finally {
      setSaving(false);
    }
  };

  const filingUrl = view === "ct" ? (settings.ctFilingUrl || settings.filingUrl) : settings.filingUrl;
  const fileNow = () => {
    if (!filingUrl) { openSettings(); toast?.(L("আগে সেটিংয়ে ট্যাক্স ওয়েবসাইটের লিংক দিন", "Add the tax website link in settings first"), "err"); return; }
    openLink(filingUrl);
  };

  // Payment history: which period, how much, when paid, optional receipt/document — per shop + view (vat/ct).
  const viewPayments = taxPayments.filter((p) => p.view === view).sort((a, b) => String(b.paidDate).localeCompare(String(a.paidDate)));
  // Dropdown of real filing periods to pick from — quarters/months for VAT, years for Corporate Tax —
  // instead of a free-text field the user had to type the period into by hand.
  const periodAt = (offset) => (view === "ct" ? fyRange(settings, offset) : periodRange(settings, offset));
  const periodChoices = Array.from({ length: view === "ct" ? 5 : 8 }, (_, i) => periodAt(-i));
  const openPayForm = () => {
    const p = periodAt(-1); // default to the last closed period — the one actually due/filed
    setPayForm({
      type: "payment",
      amount: "", paidDate: new Date().toISOString().slice(0, 10),
      periodFrom: p.from, periodTo: p.to, periodLabel: p.label,
      note: "", doc: "", docName: "",
    });
  };
  const pickPayDoc = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const data = await readDocFile(file, L);
      setPayForm((p) => ({ ...p, doc: data, docName: file.name }));
    } catch (err) {
      toast?.(err.message || String(err), "err");
    }
  };
  const savePayment = async () => {
    if (!payForm) return;
    setPayBusy(true);
    try {
      await offlineCreate("taxPayments", {
        shopId, view, type: payForm.type === "refund" ? "refund" : "payment",
        periodFrom: payForm.periodFrom, periodTo: payForm.periodTo, periodLabel: payForm.periodLabel,
        amount: Number(payForm.amount) || 0, paidDate: payForm.paidDate || new Date().toISOString().slice(0, 10), note: payForm.note || "",
        doc: payForm.doc || "", docName: payForm.docName || "", hasDocs: !!payForm.doc,
      });
      setPayForm(null);
      setTick((v) => v + 1);
      window.dispatchEvent(new Event("s4-tax-payments-changed"));
      toast?.(L("✅ পেমেন্ট সেভ হয়েছে", "✅ Payment recorded"));
    } catch (e) {
      toast?.(e.message || String(e), "err");
    } finally {
      setPayBusy(false);
    }
  };
  const deletePayment = async (id) => {
    try {
      await offlineRemove("taxPayments", id);
      setTick((v) => v + 1);
      window.dispatchEvent(new Event("s4-tax-payments-changed"));
    } catch (e) {
      toast?.(e.message || String(e), "err");
    }
  };

  const valColor = (value, color) => color || (value < 0 ? "#b91c1c" : undefined);
  const panel = (title, lines) => (
    <fieldset key={title} className="pm-panel" style={{ margin: 0 }}>
      <legend className="pm-panel-legend">{title}</legend>
      <div className="si-panel-body">
        {lines.map(([label, value, strong, color]) => (
          <div key={label} className={`si-total-row${strong ? " is-grand" : ""}`} style={strong ? { fontSize: mobile ? 15 : 12 } : undefined}>
            <span style={{ whiteSpace: "pre-wrap", color: strong ? undefined : "#1f2937", fontWeight: value === null ? 600 : undefined }}>{label}</span>
            {value !== null && <b style={{ whiteSpace: "nowrap", color: valColor(value, color) }}>{cur} {money(value)}</b>}
          </div>
        ))}
      </div>
    </fieldset>
  );

  const steps = (lines) => (
    <fieldset key="steps" className="pm-panel" style={{ margin: 0 }}>
      <legend className="pm-panel-legend">🌐 {L("কীভাবে জমা দেবেন", "How to file")}</legend>
      <div className="si-panel-body" style={{ gap: 4, fontSize: mobile ? 14 : 12, lineHeight: 1.5 }}>
        {lines.map((t, i) => <div key={i}><b>{i + 1}.</b> {t}</div>)}
        <button type="button" className="pm-btn pm-btn--primary" style={{ marginTop: 4, alignSelf: "flex-start" }} onClick={fileNow}>🌐 {view === "ct" ? L("Corporate Tax জমা দিন", "File Corporate Tax") : L(`${tn} জমা দিন`, `File ${tn}`)}</button>
        {filingUrl && <div className="si-hint" style={{ marginLeft: 0, wordBreak: "break-all" }}>{filingUrl}</div>}
      </div>
    </fieldset>
  );

  const paymentsBox = () => (
    <fieldset key="payments" className="pm-panel" style={{ margin: 0 }}>
      <legend className="pm-panel-legend">🧾 {L("পেমেন্ট ইতিহাস", "Payment history")}</legend>
      <div className="si-panel-body" style={{ gap: 6 }}>
        {viewPayments.length === 0 ? (
          <div className="si-hint" style={{ marginLeft: 0 }}>{L("এখনো কোনো পেমেন্ট যুক্ত করা হয়নি", "No payments recorded yet")}</div>
        ) : viewPayments.map((p) => (
          <div key={p.id} className="si-total-row" style={{ fontSize: mobile ? 14 : 12 }}>
            <span>{p.type === "refund" ? "↩️" : "💸"} {p.periodLabel || `${fmtDay(p.periodFrom)}–${fmtDay(p.periodTo)}`} · {fmtDay(p.paidDate)}{p.note ? ` · ${p.note}` : ""}</span>
            <span style={{ display: "flex", gap: 8, alignItems: "center", whiteSpace: "nowrap" }}>
              <b style={{ color: p.type === "refund" ? "#15803d" : "#b91c1c" }}>{cur} {money(p.amount)}</b>
              {p.hasDocs && <button type="button" onClick={() => openDocFile({ file: p.doc, label: p.docName })} style={{ border: "none", background: "none", color: "#2563eb", cursor: "pointer", fontSize: 11, fontWeight: 700, padding: 0 }}>📎</button>}
              <button type="button" onClick={() => deletePayment(p.id)} style={{ border: "none", background: "none", color: "#b91c1c", cursor: "pointer", fontSize: 13, padding: 0 }}>✕</button>
            </span>
          </div>
        ))}
        {payForm ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 2, border: "1px solid #e2e8f0", borderRadius: 8, padding: 8 }}>
            {fField(L("কী হয়েছে", "What happened"), (
              <div className="si-types" style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
                <button type="button" className={`pm-btn-secondary${payForm.type !== "refund" ? " is-active" : ""}`} onClick={() => setPayForm((p) => ({ ...p, type: "payment" }))}>💸 {L("দিয়েছি", "Paid")}</button>
                <button type="button" className={`pm-btn-secondary${payForm.type === "refund" ? " is-active" : ""}`} onClick={() => setPayForm((p) => ({ ...p, type: "refund" }))}>↩️ {L("ফেরত পেয়েছি", "Refund received")}</button>
              </div>
            ))}
            {fField(L("কোন সময়কাল", "Which period"), (
              <select className="pm-input" value={payForm.periodFrom} onChange={(e) => {
                const choice = periodChoices.find((c) => c.from === e.target.value);
                if (choice) setPayForm((p) => ({ ...p, periodFrom: choice.from, periodTo: choice.to, periodLabel: choice.label }));
              }}>
                {periodChoices.map((c) => <option key={c.from} value={c.from}>{c.label}</option>)}
              </select>
            ))}
            {fField(L("তারিখ", "Date"), <input type="date" className="pm-input" value={payForm.paidDate} onChange={(e) => setPayForm((p) => ({ ...p, paidDate: e.target.value }))} />)}
            {fField(`${L("পরিমাণ", "Amount")} (${cur})`, <input type="number" className="pm-input" value={payForm.amount} onChange={(e) => setPayForm((p) => ({ ...p, amount: e.target.value }))} />)}
            {fField(L("নোট (ঐচ্ছিক)", "Note (optional)"), <input className="pm-input" value={payForm.note} onChange={(e) => setPayForm((p) => ({ ...p, note: e.target.value }))} />)}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button type="button" className="pm-btn-secondary" onClick={() => payFileRef.current?.click()}>📎 {payForm.docName || L("রিসিট/ডকুমেন্ট যুক্ত করুন", "Attach receipt/document")}</button>
              <input ref={payFileRef} type="file" accept="application/pdf,image/*" style={{ display: "none" }} onChange={pickPayDoc} />
              {payForm.doc && <button type="button" onClick={() => openDocFile({ file: payForm.doc, label: payForm.docName })} style={{ border: "none", background: "none", color: "#2563eb", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>{L("দেখুন", "View")}</button>}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" className="pm-btn pm-btn--primary" disabled={payBusy} onClick={savePayment}>{L("✅ সেভ করুন", "✅ Save")}</button>
              <button type="button" className="pm-btn-secondary" onClick={() => setPayForm(null)}>{L("বাতিল", "Cancel")}</button>
            </div>
          </div>
        ) : (
          <button type="button" className="pm-btn-secondary" style={{ alignSelf: "flex-start" }} onClick={openPayForm}>➕ {L("পেমেন্ট যুক্ত করুন", "Add payment")}</button>
        )}
      </div>
    </fieldset>
  );

  // Two independent stacked columns (not a CSS grid) — boxes vary a lot in height (e.g. the
  // Emirate-split purchases box vs. the short result box), and a grid forces every box in a row
  // to the height of the tallest one, leaving a visible gap under the shorter boxes.
  const twoCols = (left, right, mobileOrder) => (
    mobile ? (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{mobileOrder || [...left, ...right]}</div>
    ) : (
      <div style={{ display: "flex", gap: 4, alignItems: "flex-start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 }}>{left}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 }}>{right}</div>
      </div>
    )
  );

  const vatSteps = [
    L(`নিচের "${tn} জমা দিন" বোতাম চাপুন — সরকারি ট্যাক্স ওয়েবসাইট খুলবে। সেখানে নিজের আইডি দিয়ে লগইন করুন${isUae ? " (EmaraTax / UAE Pass)" : ""}।`, `Press "File ${tn}" below — the government tax website opens. Log in with your own ID${isUae ? " (EmaraTax / UAE Pass)" : ""}.`),
    L(`${tn} Return ফর্ম খুলুন, সময়কাল বাছুন: ${periodLabel}।`, `Open the ${tn} return form and pick the period: ${periodLabel}.`),
    L(`বাঁ পাশের সংখ্যাগুলো${isUae ? " Box নম্বর মিলিয়ে" : ""} ফর্মে বসান।`, `Copy the numbers on the left into the form${isUae ? ", matching the Box numbers" : ""}.`),
    payable >= 0 ? L(`জমা দিন, তারপর ${cur} ${money(payable)} পেমেন্ট করুন${dueDate ? ` — শেষ তারিখ ${fmtDay(dueDate)}` : ""}।`, `Submit, then pay ${cur} ${money(payable)}${dueDate ? ` by ${fmtDay(dueDate)}` : ""}.`)
      : L(`জমা দিন — ${cur} ${money(-payable)} সরকারের কাছে পাওনা থাকবে (ফেরত চাইতে পারেন)।`, `Submit — ${cur} ${money(-payable)} stays as a credit (you can claim a refund).`),
  ];
  const ctSteps = [
    L("Corporate Tax-এ রেজিস্ট্রেশন করা বাধ্যতামূলক, লাভ কম হলেও। রেজিস্ট্রেশন না থাকলে আগে সেটা করুন।", "Corporate Tax registration is required even when profit is low. Register first if you haven't."),
    L(`বছর শেষ হওয়ার ৯ মাসের মধ্যে রিটার্ন আর পেমেন্ট — এই বছরের শেষ তারিখ ${fmtDay(ctDueDate(fy.to))}।`, `File and pay within 9 months of the year end — due ${fmtDay(ctDueDate(fy.to))} for this year.`),
    L(`নিচের বোতাম চাপুন, EmaraTax-এ লগইন করে Corporate Tax Return খুলুন, এখানের লাভ আর ট্যাক্স মিলিয়ে বসান।`, `Press the button below, log in to EmaraTax, open the Corporate Tax return and enter the profit and tax from here.`),
  ];

  const tabsList = [
    ["summary", L("📋 সারাংশ", "📋 Summary")],
    ["sales", L("🧾 বিক্রি", "🧾 Sales")],
    ["purchases", L("📥 ক্রয়", "📥 Purchases")],
    ["vendors", L("🏭 সাপ্লায়ার অনুযায়ী", "🏭 By supplier")],
    ["customers", L("🧑‍💼 কাস্টমার অনুযায়ী", "🧑‍💼 By customer")],
    ["products", L("📦 পণ্য অনুযায়ী", "📦 By product")],
    ["regions", isUae ? L("🗺️ Emirate অনুযায়ী", "🗺️ By Emirate") : L("🗺️ এলাকা অনুযায়ী", "🗺️ By region")],
  ];

  const tableView = (tb) => (
    <div className="si-box" style={{ overflowX: "auto" }}>
      <table className="pm-table" style={{ minWidth: mobile ? 640 : undefined }}>
        <thead><tr>{tb.cols.map((c) => <th key={c.label} style={{ width: c.w }} className={c.align === "right" ? "si-num" : undefined}>{c.label}</th>)}</tr></thead>
        <tbody>
          {tb.rows.map((r, i) => (
            <tr key={i} style={tb.returns?.[i] ? { color: "#b91c1c" } : undefined}>
              {r.map((v, j) => <td key={j} className={tb.cols[j]?.align === "right" ? "si-num" : j === 1 ? "si-strong" : undefined}>{v}</td>)}
            </tr>
          ))}
        </tbody>
        {tb.rows.length > 0 && <tfoot><tr>{tb.foot.map((v, j) => <td key={j} className={`si-strong${tb.cols[j]?.align === "right" ? " si-num" : ""}`} style={{ background: "#f1f5f9" }}>{v}</td>)}</tr></tfoot>}
      </table>
      {!tb.rows.length && <div className="si-empty">{L("এই সময়ে কিছু নেই", "Nothing in this period")}</div>}
    </div>
  );

  const fField = (label, el, hint) => (
    <div className="si-field">
      <span className="pm-label">{label}</span>
      {el}
      {hint && <span className="si-hint" style={{ marginLeft: 0 }}>{hint}</span>}
    </div>
  );
  const monthSelect = (key) => (
    <select className="pm-input" value={editing[key]} onChange={(e) => setE(key, Number(e.target.value))}>
      {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
    </select>
  );

  const settingsWindow = editing && (
    <div className="pm-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) setEditing(null); }}>
      <div className="pm-window" style={{ maxWidth: mobile ? undefined : 820 }}>
        <div className="pm-window-title">
          <span>⚙️ {L("ট্যাক্স সেটিং", "Tax settings")}</span>
          <button type="button" className="pm-window-close" onClick={() => setEditing(null)}>✕</button>
        </div>
        <div className="pm-window-body">
          <div className={mobile ? "" : "si-cols"} style={mobile ? { display: "flex", flexDirection: "column", gap: 8 } : { alignItems: "start" }}>
            <fieldset className="pm-panel" style={{ margin: 0 }}>
              <legend className="pm-panel-legend">{L("দেশ ও VAT", "Country & VAT")}</legend>
              <div className="si-panel-body" style={{ gap: 6 }}>
                {fField(L("দেশ", "Country"), (
                  <select className="pm-input" value={editing.country} onChange={(e) => pickCountry(e.target.value)}>
                    {Object.entries(TAX_PRESETS).map(([k, p]) => <option key={k} value={k}>{bn ? p.bn : p.en}</option>)}
                  </select>
                ), L("দেশ বাছলে ট্যাক্সের নাম, হার, মুদ্রা আর ওয়েবসাইট নিজে বসে যাবে — দরকার হলে বদলান", "Picking a country fills in the tax name, rate, currency and website — change them if needed"))}
                <div className="si-grid2">
                  {fField(L("ট্যাক্সের নাম", "Tax name"), <input className="pm-input" value={editing.taxName} onChange={(e) => setE("taxName", e.target.value)} placeholder="VAT / GST" />)}
                  {fField(L("সাধারণ হার %", "Standard rate %"), <input className="pm-input" inputMode="decimal" value={editing.rate} onChange={(e) => setE("rate", e.target.value)} />)}
                </div>
                <div className="si-grid2">
                  {fField(L("মুদ্রা", "Currency"), <input className="pm-input" value={editing.currency} onChange={(e) => setE("currency", e.target.value)} placeholder="AED" />)}
                  {fField(L("জমার সময় (দিন)", "Due after period (days)"), <input className="pm-input" inputMode="numeric" value={editing.dueDays ?? ""} onChange={(e) => setE("dueDays", e.target.value)} placeholder={L("খালি = দেখাবে না", "blank = don't show")} />)}
                </div>
                {fField(L("কত দিন পর পর জমা দেন", "How often you file"), (
                  <div className="si-types" style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
                    <button type="button" className={`pm-btn-secondary${editing.period === "monthly" ? " is-active" : ""}`} onClick={() => setE("period", "monthly")}>{L("প্রতি মাসে", "Monthly")}</button>
                    <button type="button" className={`pm-btn-secondary${editing.period !== "monthly" ? " is-active" : ""}`} onClick={() => setE("period", "quarterly")}>{L("৩ মাস পর পর", "Quarterly")}</button>
                  </div>
                ))}
                {editing.period !== "monthly" && fField(L("প্রথম কোয়ার্টার কোন মাসে শুরু", "First quarter starts in"), monthSelect("periodStartMonth"), L("ট্যাক্স রেজিস্ট্রেশন সার্টিফিকেটে লেখা থাকে (যেমন Jan-Mar বা Feb-Apr)", "Shown on your tax registration certificate (e.g. Jan-Mar or Feb-Apr)"))}
                {fField(L("ট্যাক্স জমার ওয়েবসাইট", "Tax filing website"), <input className="pm-input" value={editing.filingUrl} onChange={(e) => setE("filingUrl", e.target.value)} placeholder="https://" />)}
                <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input type="checkbox" checked={!!editing.taxNotify} onChange={(e) => setE("taxNotify", e.target.checked)} />
                  <span>{L(`জমার সময় হলে কত ${tn} দিতে হবে (বা পাওনা থাকলে) — নোটিফিকেশন দাও। কর্পোরেট ট্যাক্সেও একই নোটিফিকেশন চলবে।`, `Notify how much ${tn} is due (or refundable) near filing time. The same notification applies to Corporate Tax too.`)}</span>
                </label>
              </div>
            </fieldset>
            <fieldset className="pm-panel" style={{ margin: 0 }}>
              <legend className="pm-panel-legend">{L("কর্পোরেট ট্যাক্স (লাভের উপর)", "Corporate Tax (on profit)")}</legend>
              <div className="si-panel-body" style={{ gap: 6 }}>
                <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input type="checkbox" checked={!!editing.ctEnabled} onChange={(e) => setE("ctEnabled", e.target.checked)} />
                  <span>{L("কর্পোরেট ট্যাক্সের হিসাব দেখাও", "Show the Corporate Tax calculation")}</span>
                </label>
                {editing.ctEnabled && (
                  <>
                    {fField(L("হিসাবের বছর শুরু হয়", "Financial year starts in"), monthSelect("fyStartMonth"))}
                    <div className="si-grid2">
                      {fField(L("এই লাভ পর্যন্ত 0%", "0% on profit up to"), <input className="pm-input" inputMode="decimal" value={editing.ctThreshold} onChange={(e) => setE("ctThreshold", e.target.value)} />)}
                      {fField(L("তার বেশি হলে হার %", "Rate above that %"), <input className="pm-input" inputMode="decimal" value={editing.ctRate} onChange={(e) => setE("ctRate", e.target.value)} />)}
                    </div>
                    {fField(L("Small Business Relief — বছরে বিক্রি এর কম হলে", "Small Business Relief — yearly revenue up to"), <input className="pm-input" inputMode="decimal" value={editing.sbrLimit} onChange={(e) => setE("sbrLimit", e.target.value)} />, L("0 দিলে এই সুবিধা দেখাবে না", "Set 0 to hide this relief"))}
                    {fField(L("কর্পোরেট ট্যাক্স জমার ওয়েবসাইট", "Corporate Tax filing website"), <input className="pm-input" value={editing.ctFilingUrl} onChange={(e) => setE("ctFilingUrl", e.target.value)} placeholder={L("খালি = VAT-এর ওয়েবসাইট", "blank = same as VAT")} />)}
                  </>
                )}
              </div>
            </fieldset>
          </div>
        </div>
        <div className="si-actions si-sticky-actions" style={{ background: "transparent" }}>
          <span className="si-toolbar-gap" />
          <button type="button" className="pm-btn-secondary" disabled={saving} onClick={() => setEditing(null)}>{L("বন্ধ", "Close")}</button>
          <button type="button" className="pm-btn pm-btn--primary" disabled={saving} onClick={saveSettings}>{saving ? L("সেভ হচ্ছে…", "Saving…") : `💾 ${L("সেভ", "Save")}`}</button>
        </div>
      </div>
    </div>
  );

  const loading = !data;
  return (
    <div ref={rootRef} className="si-root" style={fitH ? { height: fitH } : undefined}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>
      <div className="pm-reference-title">
        <strong>🧾 {L(`ট্যাক্স / ${tn}`, `Tax / ${tn}`)}</strong>
        <span>{view === "ct" ? `${L("বছর", "Year")} ${fy.label}` : periodLabel}{shop?.trnNumber ? ` · TRN ${shop.trnNumber}` : ""}</span>
      </div>
      <div className="si-toolbar">
        <div className="si-pills">
          <button type="button" className={`pm-btn-secondary${view === "vat" ? " is-active" : ""}`} onClick={() => setView("vat")}>🧾 {tn}</button>
          {settings.ctEnabled && <button type="button" className={`pm-btn-secondary${view === "ct" ? " is-active" : ""}`} onClick={() => setView("ct")}>🏢 {L("কর্পোরেট ট্যাক্স", "Corporate Tax")}</button>}
        </div>
        <button type="button" className="pm-btn pm-btn--primary" onClick={fileNow}>🌐 {mobile ? L("জমা দিন", "File") : view === "ct" ? L("Corporate Tax জমা দিন", "File Corporate Tax") : L(`${tn} জমা দিন`, `File ${tn}`)}</button>
        <button type="button" className="pm-btn-secondary" onClick={print} disabled={loading || badRange}>🖨️ {L("প্রিন্ট", "Print")}</button>
        <button type="button" className="pm-btn-secondary" onClick={exportCsv} disabled={loading || badRange}>📥 Excel</button>
        <button type="button" className="pm-btn-secondary" onClick={() => setTick((v) => v + 1)}>🔄</button>
        <button type="button" className="pm-btn-secondary" onClick={openSettings}>⚙️ {L("সেটিং", "Settings")}</button>
        <span className="si-toolbar-gap" />
        {view === "vat" ? (
          <>
            <div className="si-pills">
              {quick.map(([key, label, p]) => (
                <button key={key} type="button" className={`pm-btn-secondary${range.key === key ? " is-active" : ""}`} onClick={() => setRange({ key, ...p })}>{label}</button>
              ))}
            </div>
            <input type="date" className="pm-input" style={{ width: mobile ? "calc(50% - 2px)" : 120, borderColor: badRange ? "#b91c1c" : undefined }} value={from} onChange={(e) => setRange({ key: "custom", from: e.target.value, to })} />
            <input type="date" className="pm-input" style={{ width: mobile ? "calc(50% - 2px)" : 120, borderColor: badRange ? "#b91c1c" : undefined }} value={to} onChange={(e) => setRange({ key: "custom", from, to: e.target.value })} />
          </>
        ) : (
          <div className="si-pills">
            <button type="button" className={`pm-btn-secondary${fyOffset === 0 ? " is-active" : ""}`} onClick={() => setFyOffset(0)}>{L("এই বছর", "This year")} ({fyRange(settings, 0).label})</button>
            <button type="button" className={`pm-btn-secondary${fyOffset === -1 ? " is-active" : ""}`} onClick={() => setFyOffset(-1)}>{L("আগের বছর", "Last year")} ({fyRange(settings, -1).label})</button>
          </div>
        )}
      </div>

      {view === "vat" && vat && (
        <div className="si-kpis">
          <div className="si-kpi"><span>{L(`বিক্রির ${tn} (নিয়েছেন)`, `Output ${tn} (collected)`)}</span><b>{cur} {money(vat.outputVat)}</b></div>
          <div className="si-kpi"><span>{L(`ক্রয়ের ${tn} (দিয়েছেন)`, `Input ${tn} (paid)`)}</span><b>{cur} {money(vat.inputVat)}</b></div>
          <div className="si-kpi"><span>{payable >= 0 ? L("সরকারকে দিতে হবে", "Payable to government") : L("ফেরত পাবেন", "Refundable")}</span><b style={{ color: payable >= 0 ? "#b91c1c" : "#15803d" }}>{cur} {money(Math.abs(payable))}</b></div>
          <div className="si-kpi"><span>{L("জমার শেষ তারিখ", "Due by")}</span><b>{dueDate ? fmtDay(dueDate) : "—"}</b></div>
        </div>
      )}
      {view === "ct" && ct && fyAcc && (
        <div className="si-kpis">
          <div className="si-kpi"><span>{L("বছরের বিক্রি", "Revenue")}</span><b>{cur} {money(fyAcc.netSales)}</b></div>
          <div className="si-kpi"><span>{fyAcc.netProfit >= 0 ? L("নিট লাভ", "Net profit") : L("নিট ক্ষতি", "Net loss")}</span><b style={{ color: fyAcc.netProfit >= 0 ? "#15803d" : "#b91c1c" }}>{cur} {money(fyAcc.netProfit)}</b></div>
          <div className="si-kpi"><span>{L("Corporate Tax", "Corporate Tax")}</span><b style={{ color: ct.tax > 0 ? "#b91c1c" : "#15803d" }}>{cur} {money(ct.tax)}</b></div>
          <div className="si-kpi"><span>{L("জমার শেষ তারিখ", "Due by")}</span><b>{fmtDay(ctDueDate(fy.to))}</b></div>
        </div>
      )}

      {view === "vat" && (
        <div className="si-toolbar" style={{ paddingTop: 0 }}>
          <div className="si-pills">
            {tabsList.map(([k, label]) => <button key={k} type="button" className={`pm-btn-secondary${tab === k ? " is-active" : ""}`} onClick={() => setTab(k)}>{label}</button>)}
          </div>
        </div>
      )}

      <div className="si-body">
        {settings.taxApplicable === "none" && view === "vat" && <div className="si-paid-box is-due">{L(`দোকানের তথ্যে "TAX Applicable" = None দেওয়া আছে — VAT রেজিস্টার্ড হলে ⚙️ সেটিংস → দোকানের তথ্যে বদলে দিন।`, `Shop Info has "TAX Applicable" = None — change it in ⚙️ Settings → Shop Info if you are VAT registered.`)}</div>}
        {badRange && view === "vat" && <div className="si-paid-box is-due">{L("শুরুর তারিখ শেষের তারিখের পরে — তারিখ ঠিক করুন", "The start date is after the end date — fix the dates")}</div>}
        {loading ? <div className="si-empty">{L("লোড হচ্ছে…", "Loading…")}</div> : view === "ct" ? (
          <>
            {twoCols(
              [panel(ctSections[0][0], ctSections[0][1])],
              [
                panel(ctSections[1][0], ctSections[1][1]),
                ...(ct && ct.sbrLimit > 0 ? [(
                  <fieldset key="sbr" className="pm-panel" style={{ margin: 0 }}>
                    <legend className="pm-panel-legend">{L("Small Business Relief (ছোট ব্যবসার ছাড়)", "Small Business Relief")}</legend>
                    <div className="si-panel-body" style={{ gap: 4, fontSize: mobile ? 14 : 12 }}>
                      <div>{ct.sbrEligible
                        ? <span style={{ color: "#15803d", fontWeight: 700 }}>✅ {L(`বছরের বিক্রি ${cur} ${money(ct.sbrLimit)}-এর কম — এই ছাড় নিতে পারবেন, তখন ট্যাক্স 0।`, `Revenue is under ${cur} ${money(ct.sbrLimit)} — you can elect this relief, then tax is 0.`)}</span>
                        : <span style={{ color: "#b45309", fontWeight: 700 }}>✖ {L(`বছরের বিক্রি ${cur} ${money(ct.sbrLimit)}-এর বেশি — এই ছাড় পাবেন না।`, `Revenue is above ${cur} ${money(ct.sbrLimit)} — this relief does not apply.`)}</span>}</div>
                      {ct.sbrEligible && (
                        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <input type="checkbox" checked={sbr} onChange={(e) => setSbr(e.target.checked)} />
                          <span>{L("এই ছাড় নেব (রিটার্নে বেছে নিতে হয়)", "I will elect this relief (chosen in the return)")}</span>
                        </label>
                      )}
                      {isUae && <div className="si-hint" style={{ marginLeft: 0 }}>{L("UAE-তে এই ছাড় ৩১ ডিসেম্বর ২০২৬-এ শেষ হওয়া বছর পর্যন্ত পাওয়া যায়।", "In the UAE this relief is available for tax years ending on or before 31 Dec 2026.")}</div>}
                    </div>
                  </fieldset>
                )] : []),
                steps(ctSteps),
                paymentsBox(),
                <div key="note" className="si-note">
                  {L(
                    "এটা আনুমানিক হিসাব: লাভ = 📊 হিসাব নিকাশের নিট লাভ (নিট বিক্রি − মালের গড় ক্রয়মূল্য − খরচ পেজের খরচ)। মালিকের বেতন, যন্ত্রপাতির অবচয় (depreciation), আগের বছরের ক্ষতি ইত্যাদি এখানে ধরা নেই — জমা দেওয়ার আগে হিসাবরক্ষক বা Tax Agent-কে একবার দেখিয়ে নিন।",
                    "This is an estimate: profit = net profit from 📊 Accounts (net sales − average cost of goods sold − expenses from the Expenses page). Owner salary, depreciation, losses brought forward etc. are not included — have an accountant or tax agent check it before filing."
                  )}
                  {fyAcc?.unpriced > 0 && <div style={{ color: "#b45309", fontWeight: 700, marginTop: 3 }}>⚠ {L(`${fyAcc.unpriced}টি বিক্রির লাইনে প্রোডাক্টের ক্রয়মূল্য নেই, তাই লাভ বেশি দেখাতে পারে।`, `${fyAcc.unpriced} sold line(s) have no purchase cost, so profit may show too high.`)}</div>}
                </div>,
              ],
            )}
          </>
        ) : vat && tab === "summary" ? (
          <>
            {(() => {
              const salesBox = panel(returnSections[0][0], returnSections[0][1]);
              const purchBox = panel(returnSections[1][0], returnSections[1][1]);
              const resultBox = panel(returnSections[2][0], returnSections[2][1]);
              const howToFileBox = steps(vatSteps);
              const paymentsBoxEl = paymentsBox();
              const noteBox = (
                <div key="note" className="si-note">
                  {L(
                    `বিক্রির ${tn} = confirmed/paid বিক্রির বিলের ${tn} − সেলস রিটার্নের ${tn}। ক্রয়ের ${tn} = পারচেজ বিলের ${tn} + 💸 খরচ পেজে যে খরচে ${tn} লেখা আছে − পারচেজ রিটার্নের ${tn} — শুধু যে সাপ্লায়ারের TRN Vendor Master-এ দেওয়া আছে তাদেরটাই ধরা হয়। Draft, বাতিল, কোটেশন, ডেলিভারি নোট আর Opening Balance বিল ধরা হয়নি। এই অ্যাপ নিজে সরকারের সাইটে জমা দেয় না — সংখ্যাগুলো আপনি নিজে ফর্মে বসাবেন।`,
                    `Output ${tn} = ${tn} on confirmed/paid sales bills − ${tn} on sales returns. Input ${tn} = ${tn} on purchase bills + ${tn} entered on 💸 Expenses − ${tn} on purchase returns — only counted for suppliers whose TRN is on file in Vendor Master. Drafts, cancelled bills, quotations, delivery notes and opening-balance bills are not counted. The app does not submit to the government site itself — you enter these numbers in the form.`
                  )}
                  {vat.missingCustomerTrn > 0 && <div style={{ color: "#b45309", fontWeight: 700, marginTop: 3 }}>⚠ {L(`${vat.missingCustomerTrn}টি Tax Invoice-এ কাস্টমারের TRN নেই — কাস্টমার রেজিস্টার্ড হলে TRN লিখে দিন।`, `${vat.missingCustomerTrn} tax invoice(s) have no customer TRN — add it if the customer is registered.`)}</div>}
                  {vat.missingVendorTrn > 0 && <div style={{ color: "#b45309", fontWeight: 700, marginTop: 3 }}>⚠ {L(`${vat.missingVendorTrn}টি ক্রয় বিলের সাপ্লায়ারের TRN নেই — তাদের ${tn} ফেরত হিসাবে ধরা হয়নি। Vendor Master-এ TRN লিখে দিন।`, `${vat.missingVendorTrn} purchase bill(s) have a supplier with no TRN — their ${tn} is not counted as recoverable. Add the TRN in Vendor Master.`)}</div>}
                  {!shop?.trnNumber && isUae && <div style={{ color: "#b45309", fontWeight: 700, marginTop: 3 }}>⚠ {L("দোকানের TRN দেওয়া নেই — ⚙️ সেটিংস → দোকানের তথ্যে লিখুন।", "Shop TRN is missing — add it in ⚙️ Settings → Shop Info.")}</div>}
                </div>
              );
              return twoCols(
                [salesBox, resultBox],
                [purchBox, howToFileBox, paymentsBoxEl, noteBox],
                [salesBox, purchBox, resultBox, howToFileBox, paymentsBoxEl, noteBox],
              );
            })()}
          </>
        ) : vat && tables[tab] ? (
          <>
            {tableView(tables[tab])}
            {tab === "products" && <div className="si-note">{L("পণ্যের লাইনের হিসাব; বিলের মোট ছাড় বা সমন্বয় লাইনে ভাগ করা নেই, তাই সারাংশের সাথে সামান্য পার্থক্য হতে পারে।", "Per bill line; bill-level discounts and adjustments are not split across lines, so totals may differ slightly from the summary.")}</div>}
            {tab === "regions" && <div className="si-note">{L(`কাস্টমার মাস্টারের ${isUae ? "Emirate" : "এলাকা"} থেকে নেওয়া (না থাকলে শহর/এলাকা)। নগদ কাস্টমারের বিক্রি দোকানের নিজের ${isUae ? "Emirate" : "এলাকা"}-তে ধরা হয় (⚙️ সেটিংস → দোকানের তথ্য)।`, `Taken from the customer's ${isUae ? "Emirate" : "region"} (else city/area). Cash sales count under your shop's own ${isUae ? "Emirate" : "region"} (⚙️ Settings → Shop Info).`)}</div>}
          </>
        ) : null}
      </div>
      <div className="si-statusbar">
        {vat && view === "vat" && <span>{L("বিক্রির বিল", "Sales bills")} <b>{vat.salesCount}</b>{vat.salesReturnCount ? ` (+${vat.salesReturnCount} ↩)` : ""}</span>}
        {vat && view === "vat" && <span>{L("ক্রয়ের বিল", "Purchase bills")} <b>{vat.purchCount}</b>{vat.purchReturnCount ? ` (+${vat.purchReturnCount} ↩)` : ""}</span>}
        {vat && view === "vat" && vat.expenseCount > 0 && <span>{L(`${tn} সহ খরচ`, `Expenses with ${tn}`)} <b>{vat.expenseCount}</b></span>}
        <span>{bn ? TAX_PRESETS[settings.country]?.bn : TAX_PRESETS[settings.country]?.en} · {tn} {settings.rate}% · {monthly ? L("মাসিক", "Monthly") : L("৩ মাস পর পর", "Quarterly")}</span>
      </div>
      {settingsWindow}
    </div>
  );
}
