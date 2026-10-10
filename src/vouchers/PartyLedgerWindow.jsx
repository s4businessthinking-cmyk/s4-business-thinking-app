import React, { useMemo, useState } from "react";
import { C, inp, lbl, btn, GridTable, fmtDate, todayIso } from "../sales-invoice/SalesInvoiceDesktopForm.jsx";
import { PartySelect } from "./AgainstInvoiceVoucherWindow.jsx";
import { useEscapeKey, useWindowState, WindowButtons, MinimizedChip } from "../components/WindowChrome.jsx";
import { printWithSettings } from "../print/printSettings.js";
import { loadPrintDesign, renderLayoutDocument, generateStatementHTML } from "../print/printDesign.js";

const n2 = (v) => parseFloat(v) || 0;
const f2 = (n) => (Math.round((parseFloat(n) || 0) * 100) / 100).toFixed(2);
const norm = (v) => String(v ?? "").trim().toLowerCase();
const METHOD = { cash: "Cash", cheque: "Cheque", bank_transfer: "Bank Transfer", card: "Card", credit: "Credit" };
const voucherFilterOptions = (isCustomer, bn) => (bn
  ? [{ id: "all", label: "সব" }, { id: "bill", label: isCustomer ? "বিক্রয়" : "ক্রয়" }, { id: "settle", label: isCustomer ? "রসিদ" : "পেমেন্ট" }, { id: "opening", label: "ওপেনিং" }]
  : [{ id: "all", label: "All" }, { id: "bill", label: isCustomer ? "Sales" : "Purchase" }, { id: "settle", label: isCustomer ? "Receipt" : "Payment" }, { id: "opening", label: "Opening" }]);
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthTitle = (ym) => { const [y, m] = String(ym).split("-"); return `${MONTH_NAMES[(parseInt(m, 10) || 1) - 1]} ${y}`; };
const ledgerOptsKey = (mode) => `s4-party-ledger-opts-${mode}`;
const loadLedgerOpts = (mode) => {
  try { return JSON.parse(localStorage.getItem(ledgerOptsKey(mode)) || "{}"); } catch { return {}; }
};
const billNarration = (inv, isCustomer, merge) => {
  const raw = inv?.raw || inv;
  if (!raw) return "";
  const vat = n2(raw.totalVat ?? raw.totalTax);
  const gt = n2(raw.grandTotal ?? inv.total);
  const ex = Math.max(0, gt - vat);
  const lines = [];
  if (merge) lines.push("As per details");
  const head = isCustomer ? "SALES" : "PURCHASE";
  lines.push(`${head} : ${f2(ex)} Cr`);
  if (vat > 0.01) lines.push(`${isCustomer ? "OUTPUT VAT 5%" : "INPUT VAT"} : ${f2(vat)} Cr`);
  const ref = raw.deliveryNoteNo || raw.supplierInvoiceNo || inv.ref || raw.refNo || "";
  if (ref) lines.push(ref);
  return { text: lines.join("\n"), ref };
};
const entryPassesFilters = (e, { voucherFilter, includePdc }) => {
  if (!includePdc && e.isPdc) return false;
  if (voucherFilter === "opening") return e.kind === "opening";
  if (voucherFilter === "bill") return e.kind === "bill";
  if (voucherFilter === "settle") return e.kind === "direct" || e.kind === "voucher";
  return true;
};
const sumFiltered = (list, from, to, filters) => {
  let opening = 0, bill = 0, settle = 0, count = 0;
  list.forEach((e) => {
    if (!entryPassesFilters(e, filters)) return;
    const d = String(e.date).slice(0, 10);
    if (from && d < from) { opening += e.bill - e.settle; return; }
    if (to && d > to) return;
    bill += e.bill; settle += e.settle; if (e.kind === "bill" || e.kind === "opening") count++;
  });
  return { opening, bill, settle, count, closing: opening + bill - settle };
};

// Old-ERP style party ledger. Customers: bills are Debit, receipts Credit. Suppliers: bills Credit, payments Debit.
// invoices: [{ id, no, date, partyId, partyName, partyMobile, total, paid, status, ref, method, raw }]
// vouchers: [{ id, no, date, partyId, partyName, method, amount, status, allocations, raw }]
export default function PartyLedgerWindow({
  lang = "en", mode = "customer", cur = "AED", shopName = "",
  invoices = [], vouchers = [], partyCodes = null, onOpenInvoice, onOpenVoucher, onNewVoucher, onClose,
}) {
  const bn = lang === "bn";
  const isCustomer = mode === "customer";
  const partyLabel = isCustomer ? "Customer" : "Supplier";
  const settleLabel = isCustomer ? "Receipt" : "Payment";

  const savedOpts = useMemo(() => loadLedgerOpts(mode), [mode]);
  const [partyKey, setPartyKey] = useState(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [onlyDue, setOnlyDue] = useState(false);
  const [voucherFilter, setVoucherFilter] = useState(savedOpts.voucherFilter || "all");
  const [includePdc, setIncludePdc] = useState(!!savedOpts.includePdc);
  const [monthly, setMonthly] = useState(!!savedOpts.monthly);
  const [showNarration, setShowNarration] = useState(savedOpts.showNarration !== false);
  const [showBalanceInPrint, setShowBalanceInPrint] = useState(savedOpts.showBalanceInPrint !== false);
  const [mergeEntries, setMergeEntries] = useState(!!savedOpts.mergeEntries);
  const persistLedgerOpts = () => {
    try {
      localStorage.setItem(ledgerOptsKey(mode), JSON.stringify({
        voucherFilter, includePdc, monthly, showNarration, showBalanceInPrint, mergeEntries,
      }));
    } catch { /* ignore */ }
  };
  const win = useWindowState();
  const ledgerFilters = useMemo(() => ({ voucherFilter, includePdc }), [voucherFilter, includePdc]);
  useEscapeKey(() => onClose?.(), { enabled: !win.min, level: 2 });

  // One key per party: by id when known, otherwise by name; name-only rows join a same-named id party.
  const { parties, keyOf } = useMemo(() => {
    const byId = new Map();
    const nameToId = new Map();
    [...invoices, ...vouchers].forEach((r) => {
      if (r.partyId && !byId.has(r.partyId)) {
        byId.set(r.partyId, true);
        if (!nameToId.has(norm(r.partyName))) nameToId.set(norm(r.partyName), r.partyId);
      }
    });
    const keyOf = (r) => {
      if (r.partyId) return `i:${r.partyId}`;
      const id = nameToId.get(norm(r.partyName));
      return id ? `i:${id}` : `n:${norm(r.partyName) || "—"}`;
    };
    const map = new Map();
    const subOf = (code, mobile) => [code, mobile].filter(Boolean).join(" · ");
    [...invoices, ...vouchers].forEach((r) => {
      const k = keyOf(r);
      if (!map.has(k)) {
        const id = r.partyId || (k.startsWith("i:") ? k.slice(2) : null);
        const code = (id && partyCodes?.[id]) || "";
        map.set(k, { key: k, id: r.partyId || null, name: r.partyName || "—", code, mobile: r.partyMobile || "", sub: subOf(code, r.partyMobile) });
      } else if (!map.get(k).mobile && r.partyMobile) {
        const p = map.get(k);
        Object.assign(p, { mobile: r.partyMobile, sub: subOf(p.code, r.partyMobile) });
      }
    });
    return { parties: map, keyOf };
  }, [invoices, vouchers, partyCodes]);

  // Every ledger entry (all dates), grouped by party key.
  const entriesByParty = useMemo(() => {
    const allocByInv = new Map();
    const live = vouchers.filter((v) => v.status !== "cancelled");
    live.forEach((v) => (v.allocations || []).forEach((a) => allocByInv.set(a.invoiceId, (allocByInv.get(a.invoiceId) || 0) + n2(a.amount))));
    const out = new Map();
    const push = (k, e) => { if (!out.has(k)) out.set(k, []); out.get(k).push(e); };
    invoices.forEach((inv) => {
      if (inv.status === "cancelled" || inv.status === "draft") return;
      const k = keyOf(inv);
      const due = n2(inv.total) - n2(inv.paid);
      const state = due < 0.01 ? "Paid" : n2(inv.paid) > 0.01 ? `Partial (due ${f2(due)})` : "Unpaid";
      const dueDate = due >= 0.01 ? String(inv.raw?.dueDate || "").slice(0, 10) : "";
      const dueText = dueDate ? `Due ${fmtDate(dueDate)}${dueDate < todayIso() ? " — OVERDUE" : ""}` : "";
      const isOpening = inv.raw?.source === "openingBalance";
      const type = isOpening ? "Opening Balance" : (isCustomer ? "Sales Bill" : "Purchase Bill");
      const vType = isOpening ? "Opening" : (isCustomer ? "Sales" : "Purchase");
      const kind = isOpening ? "opening" : "bill";
      push(k, {
        key: `i-${inv.id}`, invId: inv.id, inv, date: inv.date || "", seq: 0, kind, vType, type, no: inv.no, ref: inv.ref || "",
        particulars: [METHOD[inv.method] || inv.method, state, dueText].filter(Boolean).join(" · "),
        bill: n2(inv.total), settle: 0, open: () => onOpenInvoice?.(inv.raw),
      });
      const direct = n2(inv.paid) - (allocByInv.get(inv.id) || 0);
      if (direct > 0.01) {
        push(k, {
          key: `d-${inv.id}`, invId: inv.id, date: inv.date || "", seq: 1, kind: "direct",
          vType: isCustomer ? "Receipt" : "Payment", type: isCustomer ? "Received on Bill" : "Paid on Bill",
          no: inv.no, ref: inv.ref || "", particulars: METHOD[inv.method] || inv.method || "",
          bill: 0, settle: direct, open: () => onOpenInvoice?.(inv.raw),
        });
      }
    });
    const refById = new Map(invoices.map((i) => [i.id, i.ref]));
    live.forEach((v) => {
      const allocs = v.allocations || [];
      const supRefs = isCustomer ? "" : allocs.map((a) => a.supplierInvoiceNo || refById.get(a.invoiceId) || "").filter(Boolean).join(", ");
      const raw = v.raw || {};
      const chequeDate = raw.method === "cheque" ? String(raw.chequeDate || "").slice(0, 10) : "";
      const isPdc = raw.method === "cheque" && chequeDate && chequeDate > todayIso();
      push(keyOf(v), {
        key: `v-${v.id}`, date: v.date || "", seq: 2, kind: "voucher", isPdc,
        vType: isCustomer ? "Receipt" : "Payment", type: v.typeLabel || settleLabel, no: v.no, ref: supRefs || v.ref || "",
        particulars: [METHOD[v.method] || v.method, allocs.map((a) => a.invoiceNo).filter(Boolean).join(", ")].filter(Boolean).join(" · "),
        bill: 0, settle: n2(v.amount), open: onOpenVoucher ? () => onOpenVoucher(v.raw) : null,
      });
    });
    out.forEach((list) => {
      const seen = new Map();
      list.filter((e) => e.key.startsWith("i-")).forEach((e) => {
        [`n:${norm(e.no)}`, e.ref ? `r:${norm(e.ref)}` : null].filter(Boolean).forEach((k) => seen.set(k, (seen.get(k) || 0) + 1));
      });
      list.forEach((e) => {
        if (!e.key.startsWith("i-")) return;
        if (seen.get(`n:${norm(e.no)}`) > 1 || (e.ref && seen.get(`r:${norm(e.ref)}`) > 1)) { e.dup = true; e.particulars = `⚠ Duplicate? · ${e.particulars}`; }
      });
    });
    out.forEach((list) => list.sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.seq - b.seq || String(a.no).localeCompare(String(b.no))));
    return out;
  }, [invoices, vouchers, keyOf, isCustomer, settleLabel, onOpenInvoice, onOpenVoucher]);

  const inRange = (d) => (!from || d >= from) && (!to || d <= to);
  const sumUp = (list) => {
    let opening = 0, bill = 0, settle = 0, count = 0;
    list.forEach((e) => {
      const d = String(e.date).slice(0, 10);
      if (from && d < from) { opening += e.bill - e.settle; return; }
      if (to && d > to) return;
      bill += e.bill; settle += e.settle; if (e.seq === 0) count++;
    });
    return { opening, bill, settle, count, closing: opening + bill - settle };
  };

  const summary = useMemo(() => {
    const rows = [];
    parties.forEach((p) => {
      const s = sumUp(entriesByParty.get(p.key) || []);
      if (!s.count && Math.abs(s.opening) < 0.01 && !s.settle) return;
      if (onlyDue && Math.abs(s.closing) < 0.01) return;
      rows.push({ ...p, ...s });
    });
    return rows.sort((a, b) => b.closing - a.closing || a.name.localeCompare(b.name));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parties, entriesByParty, from, to, onlyDue]);

  const party = partyKey ? parties.get(partyKey) : null;
  const statement = useMemo(() => {
    if (!party) return null;
    const list = entriesByParty.get(party.key) || [];
    const s = sumFiltered(list, from, to, ledgerFilters);
    let rows = list.filter((e) => entryPassesFilters(e, ledgerFilters) && inRange(String(e.date).slice(0, 10)));
    if (mergeEntries && !monthly) {
      const directByInv = new Map();
      rows.forEach((e) => { if (e.kind === "direct" && e.invId) directByInv.set(e.invId, (directByInv.get(e.invId) || 0) + e.settle); });
      rows = rows.filter((e) => e.kind !== "direct").map((e) => {
        if (e.kind === "bill" && e.invId && directByInv.has(e.invId)) {
          const extra = directByInv.get(e.invId);
          return { ...e, settle: e.settle + extra, mergedSettle: extra };
        }
        return e;
      });
    }
    if (showNarration && !monthly) {
      rows = rows.map((e) => {
        if ((e.kind === "bill" || e.kind === "opening") && e.inv) {
          const { text, ref } = billNarration(e.inv, isCustomer, mergeEntries);
          return { ...e, particulars: text, narrRef: ref || "" };
        }
        return e;
      });
    }
    if (monthly) {
      const byMonth = new Map();
      rows.forEach((e) => {
        const ym = String(e.date).slice(0, 7) || "—";
        if (!byMonth.has(ym)) byMonth.set(ym, { bill: 0, settle: 0 });
        const b = byMonth.get(ym);
        b.bill += e.bill; b.settle += e.settle;
      });
      let run = s.opening;
      rows = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([ym, v]) => {
        run += v.bill - v.settle;
        return { key: `m-${ym}`, monthly: true, date: `${ym}-01`, vType: "", type: monthTitle(ym), particulars: "", bill: v.bill, settle: v.settle, run };
      });
    } else {
      let run = s.opening;
      rows = rows.map((e) => { run += e.bill - e.settle; return { ...e, run }; });
    }
    return { ...s, rows };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [party, entriesByParty, from, to, ledgerFilters, mergeEntries, showNarration, monthly, isCustomer]);

  const balText = (v) => {
    if (Math.abs(v) < 0.005) return "0.00";
    const owedSide = isCustomer ? "Dr" : "Cr";
    const otherSide = isCustomer ? "Cr" : "Dr";
    return `${f2(Math.abs(v))} ${v > 0 ? owedSide : otherSide}`;
  };
  const dr = (e) => (isCustomer ? e.bill : e.settle);
  const cr = (e) => (isCustomer ? e.settle : e.bill);

  const partyOptions = useMemo(() => [...parties.values()].map((p) => ({ ...p, pending: Math.max(0, sumUp(entriesByParty.get(p.key) || []).closing) }))
    .sort((a, b) => a.name.localeCompare(b.name)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [parties, entriesByParty]);

  const summaryCols = [
    ...(partyCodes ? [{ key: "code", label: "Code", width: 75, render: (r) => r.code || "" }] : []),
    { key: "name", label: partyLabel, width: 230, bold: true, render: (r) => r.name },
    { key: "mob", label: "Mobile", width: 110, render: (r) => r.mobile },
    { key: "cnt", label: "Bills", width: 55, align: "right", render: (r) => r.count },
    { key: "open", label: "Opening", width: 95, align: "right", render: (r) => balText(r.opening) },
    { key: "bill", label: "Bill Amount", width: 100, align: "right", render: (r) => f2(r.bill) },
    { key: "set", label: isCustomer ? "Received" : "Paid", width: 100, align: "right", render: (r) => f2(r.settle) },
    { key: "bal", label: "Balance", width: 110, align: "right", bold: true, render: (r) => balText(r.closing), color: (r) => (r.closing > 0.01 ? C.red : C.green) },
  ];
  const renderParticulars = (e) => {
    if (!e.particulars) return "";
    const text = String(e.particulars);
    if (!text.includes("\n")) return text;
    return text.split("\n").map((line, i) => (
      <div key={i} style={{ color: e.narrRef && line === e.narrRef ? C.red : (e.dup && i === 0 ? C.red : undefined) }}>{line}</div>
    ));
  };
  const stmtCols = monthly ? [
    { key: "month", label: "Month", width: 140, render: (e) => (e.opening ? e.type : (e.monthly ? e.type : monthTitle(String(e.date).slice(0, 7)))) },
    { key: "part", label: "Particulars", width: 280, wrap: true, render: (e) => (e.opening ? e.particulars : "") },
    { key: "dr", label: "Debit", width: 100, align: "right", render: (e) => (dr(e) ? f2(dr(e)) : "") },
    { key: "cr", label: "Credit", width: 100, align: "right", render: (e) => (cr(e) ? f2(cr(e)) : "") },
    { key: "bal", label: "Balance", width: 120, align: "right", bold: true, render: (e) => balText(e.run) },
  ] : [
    { key: "date", label: "Date", width: 82, render: (e) => (e.opening ? "" : fmtDate(e.date)) },
    { key: "vtype", label: "V.Type", width: 72, render: (e) => e.vType || e.type || "" },
    { key: "no", label: "V.No.", width: 72, bold: true, render: (e) => e.no || "" },
    { key: "part", label: "Particulars", width: 220, wrap: true, render: renderParticulars, color: (e) => (e.dup ? C.red : undefined) },
    { key: "dr", label: "Debit", width: 88, align: "right", render: (e) => (dr(e) ? f2(dr(e)) : "") },
    { key: "cr", label: "Credit", width: 88, align: "right", render: (e) => (cr(e) ? f2(cr(e)) : "") },
    { key: "bal", label: "Balance", width: 110, align: "right", bold: true, render: (e) => balText(e.run) },
  ];
  const stmtRows = statement ? [
    ...(from ? [{
      key: "opening", opening: true, vType: "", type: "Opening Balance", no: "", particulars: `before ${fmtDate(from)}`,
      bill: 0, settle: 0, run: statement.opening,
    }] : []),
    ...statement.rows,
  ] : [];
  const stmtColsForPrint = showBalanceInPrint ? stmtCols : stmtCols.filter((c) => c.key !== "bal");

  const totals = party
    ? { bill: statement.bill, settle: statement.settle, closing: statement.closing }
    : summary.reduce((a, r) => ({ bill: a.bill + r.bill, settle: a.settle + r.settle, closing: a.closing + r.closing }), { bill: 0, settle: 0, closing: 0 });

  const cellForPrint = (c, r) => {
    if (c.key === "part") return String(r.particulars ?? "");
    const v = c.render(r);
    return typeof v === "object" && v !== null ? String(r.particulars ?? "") : String(v ?? "");
  };
  const printLedger = () => {
    persistLedgerOpts();
    const cols = party ? stmtColsForPrint : summaryCols;
    const rows = party ? stmtRows : summary;
    const period = from || to ? `${from ? fmtDate(from) : "Start"} — ${to ? fmtDate(to) : "Today"}` : "All dates";
    const totalDr = isCustomer || !party ? totals.bill : totals.settle;
    const totalCr = isCustomer || !party ? totals.settle : totals.bill;
    const design = loadPrintDesign();
    if (party && design.layout.statement?.enabled) {
      const items = stmtRows.map((e) => ({
        date: e.opening ? "" : (e.monthly ? e.type : fmtDate(e.date)),
        type: e.vType || e.type || "", no: e.no || "", ref: e.ref || "", particulars: String(e.particulars || ""),
        debit: dr(e) ? f2(dr(e)) : "", credit: cr(e) ? f2(cr(e)) : "",
        balance: showBalanceInPrint ? balText(e.run) : "",
      }));
      const fields = {
        shopName, title: `${partyLabel.toUpperCase()} STATEMENT`, partyName: party.code ? `${party.name} (${party.code})` : party.name, partyMobile: party.mobile || "", period,
        printDate: fmtDate(todayIso()), totalDebit: f2(totalDr), totalCredit: f2(totalCr), closing: balText(totals.closing),
      };
      printWithSettings(renderLayoutDocument(design.layout.statement, "statement", { fields, items, logo: design.style.statement?.logo }, { title: fields.title, bn }));
      return;
    }
    const totalIdx = { dr: cols.findIndex((c) => c.key === "dr"), cr: cols.findIndex((c) => c.key === "cr"), bal: cols.findIndex((c) => c.key === "bal") };
    const foot = cols.map((c, i) => (i === totalIdx.dr - 1 ? "TOTAL" : i === totalIdx.dr ? f2(totalDr) : i === totalIdx.cr ? f2(totalCr) : i === totalIdx.bal ? balText(totals.closing) : ""));
    printWithSettings(generateStatementHTML({
      shopName, title: party ? `${partyLabel.toUpperCase()} STATEMENT` : `${partyLabel.toUpperCase()} LEDGER SUMMARY`, subtitle: period,
      partyLine: party ? [party.code, party.name, party.mobile].filter(Boolean).join(" · ") : "",
      cols: cols.map((c) => ({ label: c.label, align: c.align })), rows: rows.map((r) => cols.map((c) => cellForPrint(c, r))), foot,
    }, design.style.statement));
  };

  const totalBox = (label, value, color) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ ...lbl, whiteSpace: "nowrap" }}>{label}</span>
      <input readOnly style={inp({ width: 120, textAlign: "right", fontWeight: 800, background: "#f4f7fc", color })} value={value} />
    </div>
  );

  const winTitle = `${isCustomer ? "CUSTOMER LEDGER (CREDIT SALES)" : "SUPPLIER LEDGER"}${party ? ` — ${party.name}${party.code ? ` (${party.code})` : ""}` : ""}`;
  return (
    <>
    {win.min && <MinimizedChip title={winTitle} onRestore={win.restore} onClose={onClose} lang={lang} />}
    <div data-si-modal-open="" style={{ position: "fixed", inset: 0, zIndex: 1600, background: "rgba(10,25,55,0.35)", display: win.min ? "none" : "flex", alignItems: "center", justifyContent: "center", padding: win.max ? 0 : 8, boxSizing: "border-box" }}>
      <div style={{ width: "100%", maxWidth: win.max ? "none" : 960, height: win.max ? "100%" : undefined, maxHeight: "100%", display: "flex", flexDirection: "column", background: C.bg, border: `1px solid ${C.bar}`, borderRadius: win.max ? 0 : 4, boxShadow: "0 18px 40px rgba(0,0,0,0.35)", fontFamily: "Segoe UI, Tahoma, sans-serif", color: C.label }}>
        <div onDoubleClick={win.toggleMax} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, background: C.bar, color: "#fff", padding: "5px 6px 5px 10px", fontWeight: 800, fontSize: 13, userSelect: "none" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{winTitle}</span>
          <WindowButtons win={win} onClose={onClose} lang={lang} />
        </div>

        <div style={{ padding: "10px 12px", display: "grid", gap: 8, minHeight: 0, overflow: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ ...lbl, width: 70 }}>{partyLabel}</span>
            <div style={{ flex: "1 1 260px", minWidth: 220, display: "flex" }}>
              <PartySelect parties={partyOptions} value={party} onPick={(p) => setPartyKey(p.key)}
                placeholder={bn ? `সব ${isCustomer ? "কাস্টমার" : "সাপ্লায়ার"} — নাম লিখে খুঁজুন` : `All ${partyLabel.toLowerCase()}s — type to search`} />
            </div>
            {party && <button type="button" onClick={() => setPartyKey(null)} style={btn()}>{bn ? "← সবাই" : "← All"}</button>}
            <span style={lbl}>From</span>
            <input type="date" style={inp({ width: 140 })} value={from} onChange={(e) => setFrom(e.target.value)} />
            <span style={lbl}>To</span>
            <input type="date" style={inp({ width: 140 })} value={to} onChange={(e) => setTo(e.target.value)} />
            {(from || to) && <button type="button" onClick={() => { setFrom(""); setTo(""); }} style={btn()}>Clear</button>}
            {!party && (
              <label style={{ ...lbl, fontWeight: 600, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <input type="checkbox" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} /> {bn ? "শুধু বাকি আছে" : "Only with balance"}
              </label>
            )}
          </div>

          {party && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", padding: "8px 10px", background: "#e8f0fb", border: `1px solid ${C.border}`, borderRadius: 3 }}>
              <span style={{ ...lbl, width: 88 }}>{bn ? "ভাউচার" : "Voucher Type"}</span>
              <select style={inp({ width: 120 })} value={voucherFilter} onChange={(e) => setVoucherFilter(e.target.value)}>
                {voucherFilterOptions(isCustomer, bn).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
              <label style={{ ...lbl, fontWeight: 600, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <input type="checkbox" checked={includePdc} onChange={(e) => setIncludePdc(e.target.checked)} />
                {bn ? "পোস্ট-ডেটেড চেক" : "Include post-dated cheques"}
              </label>
              <label style={{ ...lbl, fontWeight: 600, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <input type="checkbox" checked={monthly} onChange={(e) => setMonthly(e.target.checked)} />
                {bn ? "মাসিক" : "Monthly"}
              </label>
              <label style={{ ...lbl, fontWeight: 600, display: "flex", alignItems: "center", gap: 4, cursor: monthly ? "not-allowed" : "pointer", opacity: monthly ? 0.45 : 1 }}>
                <input type="checkbox" checked={showNarration} disabled={monthly} onChange={(e) => setShowNarration(e.target.checked)} />
                {bn ? "ন্যারেশন" : "Show Narration"}
              </label>
              <label style={{ ...lbl, fontWeight: 600, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <input type="checkbox" checked={showBalanceInPrint} onChange={(e) => setShowBalanceInPrint(e.target.checked)} />
                {bn ? "প্রিন্টে ব্যালান্স" : "Show Balance in Print"}
              </label>
              <label style={{ ...lbl, fontWeight: 600, display: "flex", alignItems: "center", gap: 4, cursor: monthly ? "not-allowed" : "pointer", opacity: monthly ? 0.45 : 1 }}>
                <input type="checkbox" checked={mergeEntries} disabled={monthly} onChange={(e) => setMergeEntries(e.target.checked)} />
                {bn ? "একত্রিত এন্ট্রি" : "Merge Multiple Entries"}
              </label>
              <button type="button" onClick={persistLedgerOpts} style={btn("#dbeafe", "#1e40af")}>{bn ? "দেখুন" : "View"}</button>
            </div>
          )}

          {party && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 180, background: "#fdf2f2", border: `1px solid ${C.border}`, padding: "4px 10px", fontSize: 12.5, fontWeight: 800, color: C.red, textAlign: "center" }}>
                {isCustomer ? "Customer owes" : "We owe"}: {cur} {balText(statement.closing)}
              </div>
              {party.mobile && <div style={{ background: "#fff", border: `1px solid ${C.border}`, padding: "4px 10px", fontSize: 12.5, fontWeight: 700 }}>📱 {party.mobile}</div>}
            </div>
          )}

          <div style={{ border: `1px solid ${C.border}`, maxHeight: "52vh", overflow: "auto" }}>
            {party
              ? <GridTable columns={stmtCols} rows={stmtRows} rowKey={(e) => e.key} minRows={14}
                  onRowDoubleClick={(e) => e.open?.()}
                  emptyText={bn ? "এই সময়ে কোনো লেনদেন নেই" : "No transactions in this period"} />
              : <GridTable columns={summaryCols} rows={summary} rowKey={(r) => r.key} minRows={14}
                  onRowDoubleClick={(r) => setPartyKey(r.key)}
                  emptyText={bn ? "কোনো রেকর্ড নেই" : "No records"} />}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <span style={{ fontSize: 11.5, color: "#4b5f86", marginRight: "auto" }}>
              {party
                ? (bn ? "বিল বা ভাউচার খুলতে row-তে double click করুন" : "Double click a row to open the bill / voucher")
                : (bn ? `স্টেটমেন্ট দেখতে ${isCustomer ? "কাস্টমারের" : "সাপ্লায়ারের"} row-তে double click করুন` : `Double click a ${partyLabel.toLowerCase()} to see the statement`)}
            </span>
            {totalBox("Bill Amount", f2(totals.bill))}
            {totalBox(isCustomer ? "Received" : "Paid", f2(totals.settle), C.green)}
            {totalBox("Balance", balText(totals.closing), totals.closing > 0.01 ? C.red : C.green)}
          </div>

          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
            {party && onNewVoucher && (
              <button type="button" onClick={() => onNewVoucher(party)} style={btn("#dcfce7", C.green)}>
                💰 {isCustomer ? (bn ? "টাকা গ্রহণ" : "Receive Payment") : (bn ? "পেমেন্ট দিন" : "Make Payment")}
              </button>
            )}
            <button type="button" onClick={printLedger} disabled={party ? !stmtRows.length : !summary.length} style={btn()}>🖨 Print</button>
            <button type="button" onClick={onClose} style={btn()}>Close</button>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
