// UAE e-invoice tab of the Tax screen: tax invoices and credit notes of the period with their e-invoice status,
// readiness reasons, the PINT AE fields, the UBL XML payload download, and queueing for the shop's Accredited
// Service Provider. S4 has no ASP / FTA connection, so nothing is ever sent from here. Rules in uaeEInvoice.js.
import React, { useEffect, useMemo, useState } from "react";
import { offlineUpdate } from "../offline/offlineRepository";
import { loadInvoiceRows } from "../inventory/stockFromInvoices";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { saveTextFile } from "../utils/saveTextFile.js";
import { logAudit } from "../utils/auditLog.js";
import { csvText } from "../reports/vatExport.js";
import { REGISTER_COLS, eInvoiceDocs, eInvoiceRecord, eInvoiceState, reasonText, registerRows } from "./uaeEInvoice.js";

const money = (v) => (Math.round(((Number(v) || 0) + Number.EPSILON) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const STATUS = {
  draft: ["যাচাই হয়নি", "Not checked", "#64748b"], ready: ["প্রস্তুত", "Ready", "#15803d"], blocked: ["আটকে আছে", "Blocked", "#b91c1c"], queued: ["ASP-র জন্য সারিতে", "Queued for ASP", "#1d4ed8"],
};

export default function EInvoicePanel({ lang = "en", shopId, shop, customers = [], user, profile, isOwner = false, canPrint = false, from, to, shopName = "", toast }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const today = localDay();
  const who = profile?.personName || profile?.username || user?.email || "";
  const [rows, setRows] = useState(null);
  const [tick, setTick] = useState(0);
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let off = false;
    loadInvoiceRows().then((r) => { if (!off) setRows({ salesInvoices: r.salesInvoices || [], salesReturns: r.extras?.salesReturns || [] }); }).catch((e) => { if (!off) { setRows({ salesInvoices: [], salesReturns: [] }); toast?.(e?.message || String(e), "err"); } });
    return () => { off = true; };
  }, [shopId, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = useMemo(() => (rows ? eInvoiceDocs({ ...rows, customers, shopId, from, to }).map((x) => ({ ...x, state: eInvoiceState({ ...x, shop, today }) })) : []), [rows, customers, shopId, from, to, shop, today]);
  const shown = items.filter((x) => filter === "all" || (filter === x.state.status) || (filter === "blockedNow" && x.state.live === "blocked"));
  const count = (k) => items.filter((x) => x.state.status === k).length;
  const keyOf = (x) => `${x.kind}:${x.doc.id}`;

  const save = async (x, action) => {
    const rec = eInvoiceRecord(x.state, { action, uid: user?.uid || "", by: who });
    if (rec.error) { toast?.(L("আগে সমস্যাগুলো ঠিক করুন", "Fix the reasons first"), "err"); return false; }
    await offlineUpdate(x.state.edoc.source.collection, x.doc.id, { eInvoice: rec });
    return rec;
  };
  const run = async (fn) => { if (busy) return; setBusy(true); try { await fn(); } catch (e) { toast?.(e?.message || String(e), "err"); } finally { setBusy(false); setTick((v) => v + 1); } };
  const validate = (x) => run(async () => {
    const rec = await save(x, "validate");
    toast?.(rec.status === "ready" ? L(`${x.state.edoc.id} প্রস্তুত`, `${x.state.edoc.id} is ready`) : L(`${x.state.edoc.id} আটকে আছে - কারণ দেখুন`, `${x.state.edoc.id} is blocked - see the reasons`), rec.status === "ready" ? undefined : "err");
  });
  const validateAll = () => run(async () => {
    const list = items.filter((x) => x.state.status !== "queued");
    let ready = 0;
    for (const x of list) { const rec = await save(x, "validate"); if (rec.status === "ready") ready += 1; }
    toast?.(L(`${list.length}টি যাচাই হয়েছে: ${ready} প্রস্তুত, ${list.length - ready} আটকে`, `${list.length} checked: ${ready} ready, ${list.length - ready} blocked`));
  });
  const queue = (x, on) => run(async () => {
    const rec = await save(x, on ? "queue" : "unqueue");
    if (!rec) return;
    logAudit({ shopId, user, profile, action: on ? "create" : "cancel", collection: x.state.edoc.source.collection, docId: x.doc.id, docNo: x.state.edoc.id, note: on ? "e-Invoice queued for ASP" : "e-Invoice taken off the ASP queue" });
    toast?.(on ? L("ASP-র জন্য সারিতে রাখা হয়েছে - এখনো পাঠানো হয়নি", "Queued for the ASP - not sent yet") : L("সারি থেকে সরানো হয়েছে", "Taken off the queue"));
  });
  const download = async (x) => {
    try { await saveTextFile(`${x.kind === "credit" ? "credit-note" : "invoice"}-${String(x.state.edoc.id).replace(/[^\w.-]+/g, "_")}.xml`, x.state.xml, "application/xml;charset=utf-8"); } catch (e) { toast?.(e?.message || String(e), "err"); }
  };
  const printRegister = () => printWithSettings(generateStatementHTML({
    shopName, title: "UAE E-INVOICE STATUS REGISTER", subtitle: `${fmtDay(from) || "Start"} - ${fmtDay(to) || "Today"}`,
    partyLine: "Format: Peppol PINT AE (UBL 2.1). Not submitted to the FTA - submission is through the shop's Accredited Service Provider.",
    cols: REGISTER_COLS.map((label, i) => ({ label, align: i >= 5 && i <= 7 ? "right" : undefined })), rows: registerRows(shown),
  }), { lang });
  const exportCsv = async () => { try { await saveTextFile(`e-invoice-register-${from || "start"}_${to || "today"}.csv`, csvText([REGISTER_COLS, ...registerRows(shown)])); } catch (e) { toast?.(e?.message || String(e), "err"); } };

  const badge = (k) => { const s = STATUS[k] || STATUS.draft; return <span style={{ color: s[2], fontWeight: 700 }}>{bn ? s[0] : s[1]}</span>; };
  const field = (label, value) => <div><span className="si-muted">{label}: </span><b>{value || "-"}</b></div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div className="si-paid-box" style={{ background: "#eff6ff", borderColor: "#bfdbfe", color: "#1e3a8a" }}>
        {L(
          "UAE ই-ইনভয়েস (Peppol PINT AE): S4 প্রতিটি ট্যাক্স ইনভয়েস আর ক্রেডিট নোটের e-invoice XML বানায় আর যাচাই করে। সরকারের কাছে পাঠানো হয় দোকানের নিজের Accredited Service Provider (ASP)-এর মাধ্যমে - S4-এ এখনো কোনো ASP সংযোগ নেই, তাই এখান থেকে কিছু পাঠানো হয় না, \"পাঠানো হয়েছে\" দেখানো হয় না। XML ডাউনলোড করে ASP-র পোর্টালে দিতে পারেন। PINT AE-তে QR কোড বাধ্যতামূলক নয়, তাই QR বানানো হয় না।",
          "UAE e-invoicing (Peppol PINT AE): S4 builds and checks the e-invoice XML of every tax invoice and credit note. Submission to the government goes through the shop's own Accredited Service Provider (ASP) - S4 has no ASP connection yet, so nothing is sent from here and nothing is shown as sent. You can download the XML and give it to your ASP. PINT AE does not require a QR code, so none is produced.",
        )}
      </div>
      <div className="si-toolbar">
        <div className="si-pills">
          {[["all", L("সব", "All")], ["draft", L("যাচাই হয়নি", "Not checked")], ["ready", L("প্রস্তুত", "Ready")], ["blocked", L("আটকে", "Blocked")], ["queued", L("সারিতে", "Queued")], ["blockedNow", L("এখন সমস্যা", "Problems now")]].map(([k, label]) => (
            <button key={k} type="button" className={`pm-btn-secondary${filter === k ? " is-active" : ""}`} onClick={() => setFilter(k)}>{label}{k !== "all" && k !== "blockedNow" ? ` (${count(k)})` : ""}</button>
          ))}
        </div>
        <span className="si-toolbar-gap" />
        {isOwner && <button type="button" className="pm-btn pm-btn--primary" onClick={validateAll} disabled={busy || !items.length}>{L("সব যাচাই করুন", "Check all")}</button>}
        <button type="button" className="pm-btn-secondary" disabled title={L("S4-এ এখনো কোনো ASP / FTA সংযোগ নেই - আপনার ASP-র API আর শপের credentials যোগ হলে চালু হবে", "S4 has no ASP / FTA connection yet - this turns on once your ASP's API and the shop's credentials are added")}>{L("ASP-তে পাঠান (সংযোগ নেই)", "Submit to ASP (not connected)")}</button>
        {canPrint && <button type="button" className="pm-btn-secondary" onClick={printRegister} disabled={!shown.length}>{L("রেজিস্টার প্রিন্ট", "Print register")}</button>}
        {canPrint && <button type="button" className="pm-btn-secondary" onClick={exportCsv} disabled={!shown.length}>Excel</button>}
      </div>
      {!rows ? <div className="si-empty">{L("লোড হচ্ছে…", "Loading…")}</div> : !shown.length ? <div className="si-empty">{L("এই সময়ে কোনো ট্যাক্স ইনভয়েস বা ক্রেডিট নোট নেই", "No tax invoices or credit notes in this period")}</div> : (
        <div className="si-box" style={{ overflow: "auto" }}>
          <table className="pm-table" style={{ minWidth: 900 }}>
            <thead><tr>
              <th>{L("ধরন", "Type")}</th><th>{L("নং", "No")}</th><th>{L("তারিখ", "Date")}</th><th>{L("কাস্টমার", "Customer")}</th><th>TRN</th>
              <th className="si-num">{L("মোট", "Total")}</th><th>{L("অবস্থা", "Status")}</th><th />
            </tr></thead>
            <tbody>
              {shown.map((x) => {
                const s = x.state, k = keyOf(x), e = s.edoc;
                return (
                  <React.Fragment key={k}>
                    <tr>
                      <td>{x.kind === "credit" ? L("ক্রেডিট নোট", "Credit note") : L("ট্যাক্স ইনভয়েস", "Tax invoice")}</td>
                      <td className="si-strong">{e.id}{e.billingRef ? <span className="si-muted"> · {e.billingRef.id}</span> : null}</td>
                      <td>{fmtDay(e.issueDate)}</td><td>{e.buyer.name}</td><td style={{ fontFamily: "monospace" }}>{e.buyer.trn || "-"}</td>
                      <td className="si-num">{money(e.totals.taxInclusive)}</td>
                      <td>{badge(s.status)}{s.stale && <div className="si-muted" style={{ fontSize: 11.5 }}>{L("যাচাইয়ের পরে বদলেছে", "Changed since it was checked")}</div>}
                        {s.status === "draft" && <div className="si-muted" style={{ fontSize: 11.5 }}>{s.live === "ready" ? L("এখন প্রস্তুত দেখাচ্ছে", "Looks ready now") : L(`${s.problems.length}টি সমস্যা`, `${s.problems.length} problem(s)`)}</div>}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button type="button" className="pm-btn-secondary" onClick={() => setOpen(open === k ? "" : k)}>{open === k ? L("বন্ধ", "Close") : L("দেখুন", "Preview")}</button>
                        {isOwner && s.status !== "queued" && <button type="button" className="pm-btn-secondary" onClick={() => validate(x)} disabled={busy}>{L("যাচাই", "Check")}</button>}
                        <button type="button" className="pm-btn-secondary" onClick={() => download(x)}>XML</button>
                        {isOwner && s.status === "ready" && <button type="button" className="pm-btn-secondary" onClick={() => queue(x, true)} disabled={busy}>{L("সারিতে রাখুন", "Queue for ASP")}</button>}
                        {isOwner && s.status === "queued" && <button type="button" className="pm-btn-secondary" onClick={() => queue(x, false)} disabled={busy}>{L("সারি থেকে সরান", "Take off queue")}</button>}
                      </td>
                    </tr>
                    {open === k && (
                      <tr><td colSpan={8} style={{ background: "#f8fafc" }}>
                        {s.problems.length > 0 && <div style={{ marginBottom: 6 }}>{s.problems.map((p) => <div key={p} style={{ color: "#b91c1c", fontWeight: 700, fontSize: 12.5 }}>{reasonText(p, bn)}</div>)}</div>}
                        {!s.problems.length && <div style={{ color: "#15803d", fontWeight: 700, fontSize: 12.5, marginBottom: 6 }}>{L("সব দরকারি তথ্য আছে - XML ASP-কে দেওয়া যায়", "All required fields are present - the XML can go to the ASP")}</div>}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 4, fontSize: 12.5 }}>
                          {field(L("ফরম্যাট", "Format"), `PINT AE · ${x.kind === "credit" ? "CreditNote 381" : "Invoice 380"}`)}
                          {field(L("লেনদেনের ফ্ল্যাগ", "Transaction flags"), e.flags)}
                          {field(L("বিক্রেতা", "Seller"), `${e.seller.name} · TRN ${e.seller.trn || "-"} · ${e.seller.emirate || "-"}`)}
                          {field(L("ক্রেতা", "Buyer"), `${e.buyer.name} · TRN ${e.buyer.trn || "-"} · ${e.buyer.emirate || "-"}`)}
                          {field(L("মুদ্রা", "Currency"), e.currency)}
                          {e.billingRef && field(L("মূল বিল", "Original bill"), `${e.billingRef.id} (${fmtDay(e.billingRef.issueDate)})`)}
                          {field(L("VAT ছাড়া", "Without VAT"), money(e.totals.taxExclusive))}
                          {field("VAT", money(e.totals.tax))}
                          {field(L("মোট", "Total"), money(e.totals.taxInclusive))}
                          {e.allowance && field(e.allowance.charge ? L("সমন্বয় (চার্জ)", "Adjustment (charge)") : L("বিলের ছাড়", "Bill discount"), money(e.allowance.amount))}
                          {field(L("VAT ভাগ", "VAT breakdown"), e.breakdown.map((b) => `${b.category} ${b.vatPerc}%: ${money(b.taxable)} / ${money(b.tax)}`).join(" · "))}
                          {field("QR", L("PINT AE-তে বাধ্যতামূলক নয় - বানানো হয়নি", "Not required by PINT AE - not produced"))}
                        </div>
                        <table className="pm-table" style={{ marginTop: 6 }}>
                          <thead><tr><th>#</th><th>{L("আইটেম", "Item")}</th><th className="si-num">{L("পরিমাণ", "Qty")}</th><th className="si-num">{L("দাম", "Price")}</th><th className="si-num">{L("নিট", "Net")}</th><th>{L("VAT ধরন", "VAT cat.")}</th><th className="si-num">VAT</th></tr></thead>
                          <tbody>{e.lines.map((l) => <tr key={l.id}><td>{l.id}</td><td>{l.name}{l.code ? ` (${l.code})` : ""}</td><td className="si-num">{l.qty}</td><td className="si-num">{l.price}</td><td className="si-num">{money(l.net)}</td><td>{l.category || "?"} {l.vatPerc}%</td><td className="si-num">{money(l.vat)}</td></tr>)}</tbody>
                        </table>
                        {x.doc.eInvoice?.validatedAt && <div className="si-muted" style={{ marginTop: 4 }}>{L("শেষ যাচাই", "Last checked")}: {String(x.doc.eInvoice.validatedAt).slice(0, 16).replace("T", " ")} · {x.doc.eInvoice.by || ""}</div>}
                      </td></tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="si-note">
        {L(
          "শুধু ট্যাক্স ইনভয়েস আর তার রিটার্ন / ভ্যালু নোট (ক্রেডিট নোট) এখানে আসে। কাস্টমারের TRN না থাকলে \"আটকে\" দেখায়: সাধারণ ভোক্তার (B2C) বিক্রি এই পর্যায়ে ই-ইনভয়েসের বাইরে। \"সারিতে রাখুন\" মানে শুধু - এই বিল ASP-কে দেওয়ার জন্য তৈরি; পাঠানো হয়নি। বিল বদলালে অবস্থা আবার \"যাচাই হয়নি\" হয়। পর্যায়ের তারিখ অর্থ মন্ত্রণালয় ঠিক করে - আপনার দোকানের তারিখ মিলিয়ে নিন।",
          "Only tax invoices and their returns / value notes (credit notes) are listed. A customer without a TRN shows Blocked: a sale to a consumer (B2C) is outside this e-invoicing phase. \"Queue for ASP\" only means the bill is ready to hand to the ASP - it has not been sent. If a bill changes, its status goes back to \"Not checked\". Phase dates are set by the Ministry of Finance - check the date that applies to your shop.",
        )}
      </div>
    </div>
  );
}
