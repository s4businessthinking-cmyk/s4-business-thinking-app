// Serial / IMEI Registry: search every product serial already saved on bills, returns, warranty claims and job cards,
// with its status and history from those documents. Read-only; see serialRegistry.js for the sources.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { PM_CSS } from "../product-master/pmStyles";
import { SI_CSS, usePmFitHeight, usePmMobile } from "../sales-invoice/siSkin";
import { offlineList } from "../offline/offlineRepository";
import { loadInvoiceRows, rowsOf } from "../inventory/stockFromInvoices";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { saveTextFile } from "../utils/saveTextFile.js";
import { WARRANTY_STATUSES } from "../returns/warrantyClaim.js";
import { jobSettingsOf, statusOf } from "../jobcard/jobCard.js";
import { STATUS_GROUPS, buildSerialRegistry, filterSerials } from "./serialRegistry.js";

const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const csvCell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

const KIND_LABEL = {
  purchase: ["ক্রয় হয়েছে", "Purchased"], sale: ["বিক্রি হয়েছে", "Sold"], salesReturn: ["কাস্টমার ফেরত দিয়েছে", "Returned by customer"],
  purchaseReturn: ["সাপ্লায়ারকে ফেরত", "Returned to supplier"],
};
const WARRANTY_KIND = { warrantyReceived: "received", warrantySent: "sent", warrantyReplaced: "replaced", warrantyDelivered: "delivered" };
const GROUP_LABEL = {
  purchased: ["ক্রয়", "Purchased"], sold: ["বিক্রি", "Sold"], returnedIn: ["কাস্টমার ফেরত", "Returned by customer"],
  returnedOut: ["সাপ্লায়ারকে ফেরত", "Returned to supplier"], warranty: ["ওয়ারেন্টি", "Warranty"], service: ["সার্ভিস (জব কার্ড)", "Service (job card)"],
};
const GROUP_COLOR = { purchased: "#1d4ed8", sold: "#15803d", returnedIn: "#b45309", returnedOut: "#7c3aed", warranty: "#0e7490", service: "#475569" };
const DOC_LABEL = {
  purchaseInvoices: ["পারচেজ ইনভয়েস", "Purchase invoice"], salesInvoices: ["সেলস ইনভয়েস", "Sales invoice"], salesReturns: ["সেলস রিটার্ন", "Sales return"],
  purchaseReturns: ["পারচেজ রিটার্ন", "Purchase return"], warrantyClaims: ["ওয়ারেন্টি ক্লেইম", "Warranty claim"], jobOrders: ["জব কার্ড", "Job card"],
};
const SR_CSS = `
.sr-kpis { grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); }
.sr-kpis .si-kpi b { white-space: normal; overflow: visible; text-overflow: clip; overflow-wrap: anywhere; }
.sr-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.sr-table th { text-align: left; background: #e8eef7; padding: 3px 5px; border-bottom: 1px solid #8797a9; white-space: nowrap; position: sticky; top: 0; z-index: 1; }
.sr-table td { padding: 3px 5px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
.sr-table tr.is-link { cursor: pointer; }
.sr-table tr.is-link:hover td, .sr-table tr.is-sel td { background: #eef4ff; }
.sr-serial { font-family: Consolas, "Courier New", monospace; font-weight: 700; }
`;

export default function SerialRegistryReport({ lang = "en", shopId, shop, products = [], shopName = "", toast, canPrint = false, includeJobs = false, onOpenDoc }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const [selKey, setSelKey] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const mobile = usePmMobile();
  const rootRef = useRef(null);
  const fitH = usePmFitHeight(rootRef, mobile);
  const searchRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setError("");
    Promise.all([loadInvoiceRows(), includeJobs ? offlineList("jobOrders").catch(() => []) : Promise.resolve([])])
      .then(([rows, jobs]) => {
        if (cancelled) return;
        setData({
          salesInvoices: rows.salesInvoices, purchaseInvoices: rows.purchaseInvoices, salesReturns: rows.extras?.salesReturns || [],
          purchaseReturns: rows.extras?.purchaseReturns || [], warrantyClaims: rows.extras?.warrantyClaims || [], jobOrders: rowsOf(jobs),
        });
      })
      .catch((err) => { console.warn("[S4 Serial Registry] load failed", err); if (!cancelled) setError(String(err?.message || err)); });
    return () => { cancelled = true; };
  }, [shopId, tick, includeJobs]);

  useEffect(() => {
    const refresh = () => { if (document.visibilityState !== "hidden") setTick((v) => v + 1); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  useEffect(() => { setTimeout(() => searchRef.current?.focus(), 0); }, []);

  const registry = useMemo(() => (data ? buildSerialRegistry({ ...data, products }, { shopId }) : null), [data, products, shopId]);
  const rows = useMemo(() => (registry ? filterSerials(registry, { query, group }) : []), [registry, query, group]);
  // Tiles count the serials the search matches, so each tile equals the rows shown when it is picked.
  const searched = useMemo(() => (registry ? filterSerials(registry, { query }) : []), [registry, query]);
  const counts = useMemo(() => {
    const m = Object.fromEntries(STATUS_GROUPS.map((g) => [g, 0]));
    searched.forEach((r) => { if (r.group in m) m[r.group] += 1; });
    return m;
  }, [searched]);
  const sources = useMemo(() => {
    const m = new Map();
    (registry || []).forEach((r) => r.events.forEach((e) => m.set(e.col, (m.get(e.col) || 0) + 1)));
    return m;
  }, [registry]);
  const selected = rows.find((r) => r.key === selKey) || (rows.length === 1 ? rows[0] : null);

  const jobSettings = useMemo(() => jobSettingsOf(shop), [shop]);
  const eventName = (e) => {
    if (KIND_LABEL[e.kind]) return L(KIND_LABEL[e.kind][0], KIND_LABEL[e.kind][1]);
    if (WARRANTY_KIND[e.kind]) { const w = WARRANTY_STATUSES[WARRANTY_KIND[e.kind]]; return `${L("ওয়ারেন্টি", "Warranty")}: ${bn ? w.bn : w.en}`; }
    if (e.kind === "service") { const s = statusOf(jobSettings, e.detail); return `${L("সার্ভিস", "Service")}: ${bn ? s.bn : s.en}`; }
    return e.kind;
  };
  const docName = (col) => { const x = DOC_LABEL[col]; return x ? L(x[0], x[1]) : col; };
  const groupName = (g) => { const x = GROUP_LABEL[g]; return x ? L(x[0], x[1]) : g; };

  const tableCols = [L("সিরিয়াল / IMEI", "Serial / IMEI"), L("প্রোডাক্ট", "Product"), L("অবস্থা", "Status"), L("শেষ ডকুমেন্ট", "Last document"), L("তারিখ", "Date"), L("পার্টি", "Party"), L("ডকুমেন্ট", "Docs")];
  const tableRows = () => rows.map((r) => [r.serial, [r.productCode, r.productName].filter(Boolean).join(" "), eventName(r.last), `${docName(r.last.col)} ${r.last.no}`.trim(), fmtDay(r.last.date), r.last.party, String(r.events.length)]);
  const filterLine = [query && `${L("খোঁজ", "Search")}: ${query}`, group && groupName(group)].filter(Boolean).join(" · ");

  const print = () => {
    if (!registry) return;
    const rowsOut = [...tableRows()];
    if (selected) {
      rowsOut.push(tableCols.map(() => ""));
      rowsOut.push([`${L("ইতিহাস", "HISTORY")}: ${selected.serial}`, "", "", "", "", "", ""]);
      selected.events.forEach((e) => rowsOut.push(["", [e.productCode, e.productName].filter(Boolean).join(" "), eventName(e), `${docName(e.col)} ${e.no}`.trim(), fmtDay(e.date), e.party, ""]));
    }
    printWithSettings(generateStatementHTML({ shopName, title: L("সিরিয়াল / IMEI রেজিস্টার", "SERIAL / IMEI REGISTER"), subtitle: filterLine, cols: tableCols.map((label) => ({ label })), rows: rowsOut }), { lang });
  };
  const exportCsv = async () => {
    if (!registry) return;
    // One line per event, so the file carries each serial's full history.
    const head = [L("সিরিয়াল / IMEI", "Serial / IMEI"), L("প্রোডাক্ট কোড", "Product code"), L("প্রোডাক্ট", "Product"), L("এখনকার অবস্থা", "Current status"), L("ঘটনা", "Event"), L("ডকুমেন্ট", "Document"), L("নং", "No"), L("তারিখ", "Date"), L("পার্টি", "Party")];
    const out = [head];
    rows.forEach((r) => r.events.forEach((e) => out.push([r.serial, e.productCode, e.productName, eventName(r.last), eventName(e), docName(e.col), e.no, fmtDay(e.date), e.party])));
    const text = "\uFEFF" + out.map((r) => r.map((c) => csvCell(String(c ?? "").trim())).join(",")).join("\r\n");
    try { await saveTextFile(`serial-register-${new Date().toISOString().slice(0, 10)}.csv`, text); } catch (e) { toast?.(e.message || String(e), "err"); }
  };

  const kpi = (label, value, color, onClick, active) => (
    <div className="si-kpi" title={`${label}: ${value}`} onClick={onClick} style={onClick ? { cursor: "pointer", outline: active ? "2px solid #315eb8" : undefined } : undefined}>
      <span>{label}</span><b style={{ color }}>{value}</b>
    </div>
  );
  const canOpen = (col) => !!onOpenDoc?.can?.(col);

  return (
    <div ref={rootRef} className="si-root" style={fitH ? { height: fitH } : undefined}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>
      <style>{SR_CSS}</style>
      <div className="pm-reference-title">
        <strong> {L("সিরিয়াল / IMEI রেজিস্টার", "Serial / IMEI Registry")}</strong>
        <span>{filterLine || L("সব সিরিয়াল", "All serials")}</span>
      </div>
      <div className="si-toolbar">
        <input ref={searchRef} className="pm-input" style={{ width: mobile ? "100%" : 260 }} value={query} onChange={(e) => { setQuery(e.target.value); setSelKey(""); }}
          placeholder={L("সিরিয়াল / IMEI (পুরো বা অংশ), প্রোডাক্ট বা পার্টি", "Serial / IMEI (full or part), product or party")} />
        <select className="pm-input" style={{ width: mobile ? "100%" : 180 }} value={group} onChange={(e) => { setGroup(e.target.value); setSelKey(""); }}>
          <option value="">{L("সব অবস্থা", "Any status")}</option>
          {STATUS_GROUPS.filter((g) => includeJobs || g !== "service").map((g) => <option key={g} value={g}>{groupName(g)}</option>)}
        </select>
        {(query || group) && <button type="button" className="pm-btn-secondary" onClick={() => { setQuery(""); setGroup(""); setSelKey(""); }}>{L("ফিল্টার সরান", "Clear filters")}</button>}
        <span className="si-toolbar-gap" />
        {canPrint && <button type="button" className="pm-btn pm-btn--primary" onClick={print} disabled={!registry}> {L("প্রিন্ট", "Print")}</button>}
        {canPrint && <button type="button" className="pm-btn-secondary" onClick={exportCsv} disabled={!registry}> Excel</button>}
        <button type="button" className="pm-btn-secondary" onClick={() => setTick((v) => v + 1)}> {L("রিফ্রেশ", "Refresh")}</button>
      </div>

      {registry && (
        <div className="si-kpis sr-kpis">
          {kpi(L("মোট সিরিয়াল", "Serials"), String(searched.length), undefined, () => setGroup(""), !group)}
          {STATUS_GROUPS.filter((g) => includeJobs || g !== "service").map((g) => <React.Fragment key={g}>{kpi(groupName(g), String(counts[g]), GROUP_COLOR[g], () => setGroup(group === g ? "" : g), group === g)}</React.Fragment>)}
        </div>
      )}

      <div className="si-body">
        {error && <div className="si-paid-box is-due">{L("ডেটা পড়া যায়নি: ", "Could not load: ")}{error}</div>}
        {!registry && !error && <div className="si-empty">{L("লোড হচ্ছে…", "Loading…")}</div>}
        {registry && (
          <div className={mobile ? "" : "si-cols"} style={mobile ? { display: "flex", flexDirection: "column", gap: 4 } : { alignItems: "start", gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)" }}>
            <fieldset className="pm-panel" style={{ margin: 0 }}>
              <legend className="pm-panel-legend">{L("সিরিয়াল", "Serials")} ({rows.length})</legend>
              <div className="si-panel-body" style={{ overflow: "auto", maxHeight: mobile ? 360 : 460 }}>
                {!registry.length ? (
                  <div className="si-empty">{L(
                    "এখনো কোনো সিরিয়াল / IMEI সেভ হয়নি। সেলস / পারচেজ রিটার্নের লাইনে, ওয়ারেন্টি ক্লেইমে বা জব কার্ডে সিরিয়াল লিখলে এখানে আসবে।",
                    "No serial / IMEI saved yet. Serials entered on sales / purchase return lines, warranty claims or job cards show here."
                  )}</div>
                ) : (
                  <table className="sr-table">
                    <thead><tr>
                      <th>{tableCols[0]}</th><th>{tableCols[1]}</th><th>{tableCols[2]}</th>{!mobile && <th>{tableCols[3]}</th>}<th>{tableCols[4]}</th>{!mobile && <th>{tableCols[5]}</th>}
                    </tr></thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.key} className={`is-link${selected?.key === r.key ? " is-sel" : ""}`} onClick={() => setSelKey(r.key)}>
                          <td className="sr-serial">{r.serial}</td>
                          <td>{[r.productCode, r.productName].filter(Boolean).join(" ")}</td>
                          <td style={{ color: GROUP_COLOR[r.group], fontWeight: 700 }}>{eventName(r.last)}</td>
                          {!mobile && <td>{docName(r.last.col)} {r.last.no}</td>}
                          <td style={{ whiteSpace: "nowrap" }}>{fmtDay(r.last.date)}</td>
                          {!mobile && <td>{r.last.party}</td>}
                        </tr>
                      ))}
                      {!rows.length && <tr><td colSpan={6} className="si-empty">{L("এই খোঁজে কোনো সিরিয়াল পাওয়া যায়নি", "No serial matches this search")}</td></tr>}
                    </tbody>
                  </table>
                )}
              </div>
            </fieldset>

            <fieldset className="pm-panel" style={{ margin: 0 }}>
              <legend className="pm-panel-legend">{selected ? `${L("ইতিহাস", "History")}: ${selected.serial}` : L("ইতিহাস", "History")}</legend>
              <div className="si-panel-body" style={{ overflow: "auto", maxHeight: mobile ? undefined : 460 }}>
                {!selected ? (
                  <div className="si-empty">{L("বাম দিক থেকে একটা সিরিয়াল বাছুন", "Pick a serial on the left")}</div>
                ) : (
                  <>
                    <div className="si-total-row"><span>{L("প্রোডাক্ট", "Product")}</span><b>{[selected.productCode, selected.productName].filter(Boolean).join(" ") || "-"}</b></div>
                    <div className="si-total-row"><span>{L("এখনকার অবস্থা", "Current status")}</span><b style={{ color: GROUP_COLOR[selected.group] }}>{eventName(selected.last)}</b></div>
                    <table className="sr-table" style={{ marginTop: 6 }}>
                      <thead><tr><th>{L("তারিখ", "Date")}</th><th>{L("ঘটনা", "Event")}</th><th>{L("ডকুমেন্ট", "Document")}</th><th>{L("পার্টি", "Party")}</th></tr></thead>
                      <tbody>
                        {[...selected.events].reverse().map((e, i) => (
                          <tr key={`${e.col}:${e.docId}:${e.kind}:${i}`} className={canOpen(e.col) ? "is-link" : undefined} onClick={canOpen(e.col) ? () => onOpenDoc.open(e.col, e.docId) : undefined}
                            title={canOpen(e.col) ? L("ডকুমেন্ট খুলুন", "Open document") : undefined}>
                            <td style={{ whiteSpace: "nowrap" }}>{fmtDay(e.date)}</td>
                            <td style={{ fontWeight: 700 }}>{eventName(e)}{e.detail && e.col.endsWith("Returns") ? <div style={{ color: "#64748b", fontWeight: 400 }}>{L("বিল", "Bill")} {e.detail}</div> : null}</td>
                            <td>{docName(e.col)} {e.no}{e.productName && e.productName !== selected.productName ? <div style={{ color: "#64748b" }}>{e.productName}</div> : null}</td>
                            <td>{e.party}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            </fieldset>
          </div>
        )}
        {registry && (
          <div className="si-note">
            {L(
              "এখানে শুধু আগে থেকে সেভ হওয়া সিরিয়াল দেখায়: সেলস / পারচেজ রিটার্নের লাইন, ওয়ারেন্টি ক্লেইম, জব কার্ড, আর যে সেলস / পারচেজ বিলের লাইনে সিরিয়াল আছে (পুরনো বা ইমপোর্ট করা বিল)। নতুন সেলস / পারচেজ বিলে এখনো সিরিয়াল নেওয়া হয় না, তাই বিক্রি / ক্রয় তখনই দেখাবে যখন বিলের লাইনে সিরিয়াল থাকে। অবস্থা = সবশেষ ডকুমেন্ট; দুই ডকুমেন্টের মাঝখানে কী হয়েছে তা ধরে নেওয়া হয়নি (যেমন ক্রয় হলেই \"স্টকে আছে\" বলা হয় না)। Draft ও বাতিল ডকুমেন্ট ধরা হয়নি। স্পেস / ড্যাশ বাদ দিয়ে মেলানো হয়। ইনভয়েস নম্বর (SI-0001 ইত্যাদি) প্রোডাক্টের সিরিয়াল নয়।",
              "Only serials already saved show here: sales / purchase return lines, warranty claims, job cards, and sales / purchase bill lines that carry a serial (older or imported bills). New sales / purchase bills do not ask for a serial yet, so a sale or purchase shows only when the bill line has one. Status = the latest document; nothing is assumed between documents (a purchase is not reported as \"in stock\"). Drafts and cancelled documents are not counted. Spaces and dashes are ignored when matching. Invoice numbers (SI-0001 and so on) are not product serials."
            )}
            {!includeJobs && <div style={{ marginTop: 3 }}>{L("জব কার্ডের সিরিয়াল দেখতে জব কার্ডের অনুমতি লাগে।", "Job card serials need the job card permission.")}</div>}
          </div>
        )}
      </div>
      <div className="si-statusbar">
        {registry && [...sources.entries()].map(([col, n]) => <span key={col}>{docName(col)} <b>{n}</b></span>)}
        <span>{L("উইন্ডোতে ফিরলে নিজে থেকে রিফ্রেশ হয়", "Refreshes automatically when you come back to the window")}</span>
      </div>
    </div>
  );
}
