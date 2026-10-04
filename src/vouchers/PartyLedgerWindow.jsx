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

// Old-ERP style party ledger. Customers: bills are Debit, receipts Credit. Suppliers: bills Credit, payments Debit.
// invoices: [{ id, no, date, partyId, partyName, partyMobile, total, paid, status, ref, method, raw }]
// vouchers: [{ id, no, date, partyId, partyName, method, amount, status, allocations, raw }]
export default function PartyLedgerWindow({
  lang = "en", mode = "customer", cur = "AED", shopName = "",
  invoices = [], vouchers = [], onOpenInvoice, onOpenVoucher, onNewVoucher, onClose,
}) {
  const bn = lang === "bn";
  const isCustomer = mode === "customer";
  const partyLabel = isCustomer ? "Customer" : "Supplier";
  const settleLabel = isCustomer ? "Receipt" : "Payment";

  const [partyKey, setPartyKey] = useState(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [onlyDue, setOnlyDue] = useState(false);
  const win = useWindowState();
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
    [...invoices, ...vouchers].forEach((r) => {
      const k = keyOf(r);
      if (!map.has(k)) map.set(k, { key: k, id: r.partyId || null, name: r.partyName || "—", mobile: r.partyMobile || "", sub: r.partyMobile || "" });
      else if (!map.get(k).mobile && r.partyMobile) Object.assign(map.get(k), { mobile: r.partyMobile, sub: r.partyMobile });
    });
    return { parties: map, keyOf };
  }, [invoices, vouchers]);

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
      push(k, { key: `i-${inv.id}`, date: inv.date || "", seq: 0, type: isCustomer ? "Sales Bill" : "Purchase Bill", no: inv.no, ref: inv.ref || "", particulars: [METHOD[inv.method] || inv.method, state].filter(Boolean).join(" · "), bill: n2(inv.total), settle: 0, open: () => onOpenInvoice?.(inv.raw) });
      const direct = n2(inv.paid) - (allocByInv.get(inv.id) || 0);
      if (direct > 0.01) {
        push(k, { key: `d-${inv.id}`, date: inv.date || "", seq: 1, type: isCustomer ? "Received on Bill" : "Paid on Bill", no: inv.no, ref: inv.ref || "", particulars: METHOD[inv.method] || inv.method || "", bill: 0, settle: direct, open: () => onOpenInvoice?.(inv.raw) });
      }
    });
    const refById = new Map(invoices.map((i) => [i.id, i.ref]));
    live.forEach((v) => {
      const allocs = v.allocations || [];
      const supRefs = isCustomer ? "" : allocs.map((a) => a.supplierInvoiceNo || refById.get(a.invoiceId) || "").filter(Boolean).join(", ");
      push(keyOf(v), { key: `v-${v.id}`, date: v.date || "", seq: 2, type: settleLabel, no: v.no, ref: supRefs || v.ref || "", particulars: [METHOD[v.method] || v.method, allocs.map((a) => a.invoiceNo).filter(Boolean).join(", ")].filter(Boolean).join(" · "), bill: 0, settle: n2(v.amount), open: onOpenVoucher ? () => onOpenVoucher(v.raw) : null });
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
    const s = sumUp(list);
    let run = s.opening;
    const rows = list.filter((e) => inRange(String(e.date).slice(0, 10))).map((e) => { run += e.bill - e.settle; return { ...e, run }; });
    return { ...s, rows };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [party, entriesByParty, from, to]);

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
    { key: "name", label: partyLabel, width: 230, bold: true, render: (r) => r.name },
    { key: "mob", label: "Mobile", width: 110, render: (r) => r.mobile },
    { key: "cnt", label: "Bills", width: 55, align: "right", render: (r) => r.count },
    { key: "open", label: "Opening", width: 95, align: "right", render: (r) => balText(r.opening) },
    { key: "bill", label: "Bill Amount", width: 100, align: "right", render: (r) => f2(r.bill) },
    { key: "set", label: isCustomer ? "Received" : "Paid", width: 100, align: "right", render: (r) => f2(r.settle) },
    { key: "bal", label: "Balance", width: 110, align: "right", bold: true, render: (r) => balText(r.closing), color: (r) => (r.closing > 0.01 ? C.red : C.green) },
  ];
  const stmtCols = [
    { key: "date", label: "Date", width: 82, render: (e) => (e.opening ? "" : fmtDate(e.date)) },
    { key: "type", label: "Type", width: 115, render: (e) => e.type },
    { key: "no", label: "Doc No", width: 85, bold: true, render: (e) => e.no || "" },
    { key: "ref", label: isCustomer ? "Ref / DN No" : "Vendor Inv No", width: 110, render: (e) => e.ref || "" },
    { key: "part", label: "Particulars", width: 180, render: (e) => e.particulars || "", color: (e) => (e.dup ? C.red : undefined) },
    { key: "dr", label: "Debit", width: 90, align: "right", render: (e) => (dr(e) ? f2(dr(e)) : "") },
    { key: "cr", label: "Credit", width: 90, align: "right", render: (e) => (cr(e) ? f2(cr(e)) : "") },
    { key: "bal", label: "Balance", width: 110, align: "right", bold: true, render: (e) => balText(e.run) },
  ];
  const stmtRows = statement ? [
    ...(from ? [{ key: "opening", opening: true, type: "Opening Balance", no: "", particulars: `before ${fmtDate(from)}`, bill: 0, settle: 0, run: statement.opening }] : []),
    ...statement.rows,
  ] : [];

  const totals = party
    ? { bill: statement.bill, settle: statement.settle, closing: statement.closing }
    : summary.reduce((a, r) => ({ bill: a.bill + r.bill, settle: a.settle + r.settle, closing: a.closing + r.closing }), { bill: 0, settle: 0, closing: 0 });

  const printLedger = () => {
    const cols = party ? stmtCols : summaryCols;
    const rows = party ? stmtRows : summary;
    const period = from || to ? `${from ? fmtDate(from) : "Start"} — ${to ? fmtDate(to) : "Today"}` : "All dates";
    const totalDr = isCustomer || !party ? totals.bill : totals.settle;
    const totalCr = isCustomer || !party ? totals.settle : totals.bill;
    const design = loadPrintDesign();
    if (party && design.layout.statement?.enabled) {
      const items = stmtRows.map((e) => ({
        date: e.opening ? "" : fmtDate(e.date), type: e.type || "", no: e.no || "", ref: e.ref || "", particulars: e.particulars || "",
        debit: dr(e) ? f2(dr(e)) : "", credit: cr(e) ? f2(cr(e)) : "", balance: balText(e.run),
      }));
      const fields = {
        shopName, title: `${partyLabel.toUpperCase()} STATEMENT`, partyName: party.name, partyMobile: party.mobile || "", period,
        printDate: fmtDate(todayIso()), totalDebit: f2(totalDr), totalCredit: f2(totalCr), closing: balText(totals.closing),
      };
      printWithSettings(renderLayoutDocument(design.layout.statement, "statement", { fields, items, logo: design.style.statement?.logo }, { title: fields.title, bn }));
      return;
    }
    const foot = cols.map((c, i) => (i === cols.length - 4 ? "TOTAL" : i === cols.length - 3 ? f2(totalDr) : i === cols.length - 2 ? f2(totalCr) : i === cols.length - 1 ? balText(totals.closing) : ""));
    printWithSettings(generateStatementHTML({
      shopName, title: party ? `${partyLabel.toUpperCase()} STATEMENT` : `${partyLabel.toUpperCase()} LEDGER SUMMARY`, subtitle: period,
      partyLine: party ? [party.name, party.mobile].filter(Boolean).join(" · ") : "",
      cols: cols.map((c) => ({ label: c.label, align: c.align })), rows: rows.map((r) => cols.map((c) => String(c.render(r) ?? ""))), foot,
    }, design.style.statement));
  };

  const totalBox = (label, value, color) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ ...lbl, whiteSpace: "nowrap" }}>{label}</span>
      <input readOnly style={inp({ width: 120, textAlign: "right", fontWeight: 800, background: "#f4f7fc", color })} value={value} />
    </div>
  );

  const winTitle = `${isCustomer ? "CUSTOMER LEDGER (CREDIT SALES)" : "SUPPLIER LEDGER"}${party ? ` — ${party.name}` : ""}`;
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
