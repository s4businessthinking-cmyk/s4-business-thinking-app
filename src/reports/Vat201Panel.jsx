// VAT return (FTA VAT201) tab of the Tax / VAT page: the page's own VAT figures for the chosen period laid out box by
// box, each box opening the bills behind it, with the checks to clear before filing. The period, data, print and
// Excel come from the Tax page itself, so both always show the same numbers. S4 never files with FTA.
// Boxes 2, 3, 6, 7, 10 are filled from the owner's hand entries (customs declarations, reverse charge papers).
// Rules in vat201.js.
import React, { useState } from "react";
import { VAT201_MANUAL_BOXES } from "./vat201.js";

const money = (v) => (Math.round((Number(v) || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const ENTRY_ERRORS = {
  box: ["এই বক্স হাতে দেওয়া যায় না", "This box is not entered by hand"],
  date: ["তারিখ দিন", "Enter the date"],
  amount: ["মূল্য সংখ্যায় দিন", "Enter the amount as a number"],
  vat: ["VAT সংখ্যায় দিন (না থাকলে 0)", "Enter the VAT as a number (0 if none)"],
  zero: ["মূল্য আর VAT দুটোই 0", "Amount and VAT are both 0"],
  ref: ["রেফারেন্স দিন (কাস্টমস ডিক্লারেশন / বিল নং)", "Enter a reference (customs declaration / bill no.)"],
  locked: ["এই তারিখের হিসাব লক করা (Period lock)", "The books are locked for this date (period lock)"],
  busy: ["আগের সেভ চলছে", "A save is still running"],
  owner: ["শুধু মালিক দিতে পারেন", "Only the owner can enter this"],
};
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const blankEntry = (from, to) => {
  const t = todayIso();
  return { box: "6", date: (!from || t >= from) && (!to || t <= to) ? t : (to || t), amount: "", vat: "", ref: "", note: "" };
};
const VR_CSS = `
.vr-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.vr-table th { text-align: left; background: #e8eef7; padding: 4px 6px; border-bottom: 1px solid #8797a9; white-space: nowrap; position: sticky; top: 0; }
.vr-table td { padding: 4px 6px; border-bottom: 1px solid #e2e8f0; }
.vr-table .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.vr-table tr.is-total td { font-weight: 800; background: #f4f7fc; }
.vr-table tr.is-off td { color: #94a3b8; }
.vr-table tr.is-click { cursor: pointer; }
.vr-table tr.is-click:hover td, .vr-table tr.is-sel td { background: #eaf2ff; }
`;

/**
 * ret: buildVat201(vat, ...) for the page's period; vat: computeVat(...) of the same period.
 * noVatBox / onChangeNoVatBox: the owner's box 4 (zero rated) or 5 (exempt) choice for sales without VAT.
 */
/* from / to: the page's period; lockDate: the period lock day; onAddEntry(form, recover) / onRemoveEntry(entry) save the
 * owner's hand entries and resolve to "" or an error key / text. */
export default function Vat201Panel({ lang = "en", ret, vat, cur = "AED", isOwner = false, noVatBox = "4", onChangeNoVatBox, saving = false, onOpenDoc = null, mobile = false,
  from = "", to = "", lockDate = "", onAddEntry = null, onRemoveEntry = null }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const [sel, setSel] = useState("");
  const [form, setForm] = useState(() => blankEntry(from, to));
  const [recover, setRecover] = useState(true);
  const [entryMsg, setEntryMsg] = useState("");
  if (!ret) return null;
  const errText = (k) => (ENTRY_ERRORS[k] ? L(ENTRY_ERRORS[k][0], ENTRY_ERRORS[k][1]) : k);
  const pairOf = (id) => VAT201_MANUAL_BOXES.find((b) => b.id === id)?.pair;
  const canEdit = isOwner && !!onAddEntry;
  const setF = (k, v) => { setEntryMsg(""); setForm((f) => ({ ...f, [k]: v })); };
  const addEntry = async () => {
    const res = await onAddEntry(form, recover && !!pairOf(form.box));
    if (res) { setEntryMsg(errText(res)); return; }
    setEntryMsg(L("সেভ হয়েছে", "Saved"));
    setForm((f) => ({ ...blankEntry(from, to), box: f.box, date: f.date }));
  };
  const removeEntry = async (e) => {
    if (!window.confirm(L(`${e.no || ""} মুছবেন?${e.pairId ? " এর সাথে Box 10-এর অংশও মুছবে।" : ""}`, `Remove ${e.no || "this entry"}?${e.pairId ? " Its linked box 10 part is removed too." : ""}`))) return;
    const res = await onRemoveEntry(e);
    setEntryMsg(res ? errText(res) : L("মুছে ফেলা হয়েছে", "Removed"));
  };
  const manualRows = ret.boxes.filter((b) => !b.tracked && !b.total).flatMap((b) => b.rows);
  const lockedDay = (d) => !!lockDate && d <= lockDate;
  const box = ret.boxes.find((b) => b.id === sel) || null;
  const drillRows = sel === "unmapped" ? ret.unmapped.rows : sel === "excluded" ? ret.excluded.rows : box?.rows || [];
  const colOf = (r) => (vat?.purchaseRows.includes(r) ? "purchaseInvoices" : "salesInvoices");
  const openable = (r) => !r.isReturn && !r.isExpense && !r.isManual && !!onOpenDoc?.can?.(colOf(r));

  return (
    <>
      <style>{VR_CSS}</style>
      {!ret.agrees && <div className="si-paid-box is-due">{L("বক্সের যোগফল উপরের KPI-এর সাথে মেলেনি", "The boxes do not add up to the totals above")}</div>}
      {ret.manual?.count > 0 && (
        <div className="si-paid-box" style={{ display: "block" }}>
          {L(`Box 12-14-এ হাতে দেওয়া ${ret.manual.count}টি এন্ট্রি আছে: দেয় VAT ${cur} ${money(ret.manual.due)}, ফেরতযোগ্য VAT ${cur} ${money(ret.manual.recoverable)}। উপরের KPI শুধু বিল থেকে, তাই Box 14 KPI থেকে আলাদা হতে পারে।`,
            `Boxes 12-14 include ${ret.manual.count} hand entr${ret.manual.count === 1 ? "y" : "ies"}: VAT due ${cur} ${money(ret.manual.due)}, VAT recoverable ${cur} ${money(ret.manual.recoverable)}. The KPIs above come from bills only, so box 14 can differ from them.`)}
        </div>
      )}
      {ret.unmapped.rows.length > 0 && (
        <div className="si-paid-box is-due" style={{ display: "block" }}>
          {L(`${ret.unmapped.parties.length} কাস্টমারের Emirate বোঝা যায়নি - তাদের ${cur} ${money(ret.unmapped.amount)} বিক্রি Box 8-এ আছে কিন্তু 1a-1g-তে নেই। কাস্টমার মাস্টারে Emirate দিন: `,
            `The Emirate of ${ret.unmapped.parties.length} customer(s) could not be told - their ${cur} ${money(ret.unmapped.amount)} of sales is in box 8 but not in 1a-1g. Set the Emirate on the customer master: `)}
          {ret.unmapped.parties.slice(0, 8).map((p) => `${p.party}${p.text ? ` (${p.text})` : ""}`).join(", ")}
          {" "}<button type="button" className="pm-btn-secondary" onClick={() => setSel("unmapped")}>{L("বিলগুলো", "Bills")}</button>
        </div>
      )}
      {ret.excluded.rows.length > 0 && (
        <div className="si-paid-box" style={{ display: "block" }}>
          {L(`${ret.excluded.rows.length}টি ক্রয়ের সাপ্লায়ারের TRN নেই - তাদের VAT ${cur} ${money(ret.excluded.vat)} Box 9-এ ধরা হয়নি।`, `${ret.excluded.rows.length} purchase(s) are from suppliers without a TRN - their VAT ${cur} ${money(ret.excluded.vat)} is not in box 9.`)}
          {" "}<button type="button" className="pm-btn-secondary" onClick={() => setSel("excluded")}>{L("বিলগুলো", "Bills")}</button>
        </div>
      )}
      <div className={mobile || !sel ? "" : "si-cols"} style={mobile || !sel ? { display: "flex", flexDirection: "column", gap: 4 } : { alignItems: "start" }}>
        <fieldset className="pm-panel" style={{ margin: 0 }}>
          <legend className="pm-panel-legend">{L("VAT201 বক্স", "VAT201 boxes")}</legend>
          <div className="si-panel-body" style={{ overflow: "auto" }}>
            <table className="vr-table">
              <thead><tr><th>Box</th><th>{L("বিবরণ", "Description")}</th><th className="num">{L("মূল্য", "Amount")} ({cur})</th><th className="num">VAT ({cur})</th><th className="num">{L("সমন্বয়", "Adjustment")}</th></tr></thead>
              <tbody>
                {ret.boxes.map((b) => (
                  <React.Fragment key={b.id}>
                    {b.id === "1a" && <tr><td colSpan={5} style={{ background: "#dbe5f3", fontWeight: 800 }}>{L("বিক্রি ও অন্যান্য আউটপুট", "Sales and all other outputs")}</td></tr>}
                    {b.id === "9" && <tr><td colSpan={5} style={{ background: "#dbe5f3", fontWeight: 800 }}>{L("ক্রয় ও খরচ", "Expenses")}</td></tr>}
                    {b.id === "12" && <tr><td colSpan={5} style={{ background: "#dbe5f3", fontWeight: 800 }}>{L("নিট VAT", "Net VAT due")}</td></tr>}
                    <tr className={`${b.total ? "is-total" : ""}${!b.tracked && !b.manual ? " is-off" : ""}${b.rows.length ? " is-click" : ""}${sel === b.id ? " is-sel" : ""}`} onClick={b.rows.length ? () => setSel(sel === b.id ? "" : b.id) : undefined}>
                      <td>{b.id}</td>
                      <td>
                        {bn ? b.bn : b.en}
                        {!b.tracked && !b.manual && <span className="si-muted"> - {L("বিলে থাকে না, থাকলে নিচে হাতে দিন", "not on bills, enter below by hand if any")}</span>}
                        {b.manual && <span style={{ color: "#b45309" }}> - {L(`হাতে দেওয়া (${b.rows.length})`, `entered by hand (${b.rows.length})`)}</span>}
                        {(b.id === "4" || b.id === "5") && isOwner && onChangeNoVatBox ? (
                          <select className="pm-input" style={{ height: 22, width: "auto", display: "inline-block", marginLeft: 6 }} value={noVatBox} disabled={saving}
                            onClick={(e) => e.stopPropagation()} onChange={(e) => onChangeNoVatBox(e.target.value)} title={L("VAT ছাড়া বিক্রি কোন বক্সে", "Which box takes sales without VAT")}>
                            <option value="4">{L("VAT ছাড়া বিক্রি = জিরো-রেটেড (4)", "No-VAT sales = zero rated (4)")}</option>
                            <option value="5">{L("VAT ছাড়া বিক্রি = VAT-মুক্ত (5)", "No-VAT sales = exempt (5)")}</option>
                          </select>
                        ) : null}
                      </td>
                      <td className="num">{b.amount == null ? "" : money(b.amount)}</td>
                      <td className="num" style={b.id === "14" ? { color: b.vat >= 0 ? "#b91c1c" : "#15803d" } : undefined}>{money(b.vat)}</td>
                      <td className="num">{b.amount == null ? "" : money(b.adjustment)}</td>
                    </tr>
                    {b.id === "7" && ret.unmapped.rows.length > 0 && (
                      <tr className={`is-click${sel === "unmapped" ? " is-sel" : ""}`} onClick={() => setSel(sel === "unmapped" ? "" : "unmapped")}>
                        <td />
                        <td style={{ color: "#b45309" }}>{L("Emirate বরাদ্দ হয়নি (Box 8-এ আছে)", "Not allocated to an Emirate (in box 8)")}</td>
                        <td className="num" style={{ color: "#b45309" }}>{money(ret.unmapped.amount)}</td><td className="num" style={{ color: "#b45309" }}>{money(ret.unmapped.vat)}</td><td />
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </fieldset>
        {sel && (
          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{sel === "unmapped" ? L("Emirate নেই", "No Emirate") : sel === "excluded" ? L("TRN নেই", "No TRN") : `Box ${sel}`} ({drillRows.length})</legend>
            <div className="si-panel-body" style={{ overflow: "auto", maxHeight: mobile ? undefined : 460 }}>
              <table className="vr-table">
                <thead><tr><th>{L("তারিখ", "Date")}</th><th>{L("নং", "No")}</th><th>{L("পার্টি", "Party")}</th><th className="num">{L("মূল্য", "Amount")}</th><th className="num">VAT</th></tr></thead>
                <tbody>
                  {drillRows.map((r) => (
                    <tr key={`${r.id}-${r.no}`} className={openable(r) ? "is-click" : undefined} onClick={openable(r) ? () => onOpenDoc.open(colOf(r), r.id) : undefined}>
                      <td>{fmtDay(r.date)}</td>
                      <td style={openable(r) ? { color: "#1d4ed8", textDecoration: "underline" } : undefined}>{r.no}{r.isReturn ? <span className="si-muted"> ({L("নোট / রিটার্ন", "note / return")})</span> : null}{r.isExpense ? <span className="si-muted"> ({L("খরচ", "expense")})</span> : null}{r.isManual ? <span className="si-muted"> ({L("হাতে দেওয়া", "hand entry")})</span> : null}</td>
                      <td>{r.party || "-"}</td><td className="num">{money(r.taxable)}</td><td className="num">{money(r.vat)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 4 }}><button type="button" className="pm-btn-secondary" onClick={() => setSel("")}>{L("বন্ধ", "Close")}</button></div>
            </div>
          </fieldset>
        )}
      </div>
      <fieldset className="pm-panel" style={{ margin: "4px 0 0" }}>
        <legend className="pm-panel-legend">{L("হাতে দেওয়া এন্ট্রি - আমদানি ও রিভার্স চার্জ (Box 2, 3, 6, 7, 10)", "Hand entries - imports and reverse charge (boxes 2, 3, 6, 7, 10)")}</legend>
        <div className="si-panel-body" style={{ overflow: "auto" }}>
          {manualRows.length ? (
            <table className="vr-table">
              <thead><tr><th>Box</th><th>{L("তারিখ", "Date")}</th><th>{L("রেফারেন্স", "Reference")}</th><th>{L("নোট", "Note")}</th><th className="num">{L("মূল্য", "Amount")}</th><th className="num">VAT</th>{canEdit && <th />}</tr></thead>
              <tbody>
                {manualRows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.box}</td><td>{fmtDay(r.date)}</td><td>{r.no}</td><td>{r.party || "-"}{r.pairId ? <span className="si-muted"> ({L("লিঙ্ক করা", "linked")})</span> : null}</td>
                    <td className="num">{money(r.taxable)}</td><td className="num">{money(r.vat)}</td>
                    {canEdit && <td>{lockedDay(r.date) ? <span className="si-muted">{L("লক", "Locked")}</span> : (r.pairId && r.box === "10" ? null : <button type="button" className="pm-btn-secondary" disabled={saving} onClick={() => removeEntry(r)}>{L("মুছুন", "Remove")}</button>)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="si-muted">{L("এই সময়ে কোনো হাতে দেওয়া এন্ট্রি নেই।", "No hand entries in this period.")}</div>}
          {canEdit && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", marginTop: 6 }}>
              <select className="pm-input" style={{ width: mobile ? "100%" : 250 }} value={form.box} disabled={saving} onChange={(e) => setF("box", e.target.value)}>
                {VAT201_MANUAL_BOXES.map((b) => <option key={b.id} value={b.id}>{`Box ${b.id} - ${bn ? b.bn : b.en}`}</option>)}
              </select>
              <input type="date" className="pm-input" style={{ width: 130 }} value={form.date} disabled={saving} onChange={(e) => setF("date", e.target.value)} />
              <input className="pm-input" style={{ width: mobile ? "100%" : 170 }} value={form.ref} disabled={saving} onChange={(e) => setF("ref", e.target.value)} placeholder={L("কাস্টমস ডিক্লারেশন / বিল নং", "Customs declaration / bill no.")} />
              <input className="pm-input" style={{ width: 110, textAlign: "right" }} inputMode="decimal" value={form.amount} disabled={saving} onChange={(e) => setF("amount", e.target.value)} placeholder={L(`মূল্য (${cur})`, `Amount (${cur})`)} />
              <input className="pm-input" style={{ width: 100, textAlign: "right" }} inputMode="decimal" value={form.vat} disabled={saving} onChange={(e) => setF("vat", e.target.value)} placeholder={`VAT (${cur})`} />
              <input className="pm-input" style={{ width: mobile ? "100%" : 180 }} value={form.note} disabled={saving} onChange={(e) => setF("note", e.target.value)} placeholder={L("নোট (সাপ্লায়ার, পোর্ট…)", "Note (supplier, port…)")} />
              {pairOf(form.box) && (
                <label style={{ display: "inline-flex", gap: 4, alignItems: "center", fontSize: 12 }}>
                  <input type="checkbox" checked={recover} disabled={saving} onChange={(e) => setRecover(e.target.checked)} />
                  {L("একই VAT Box 10-এ ফেরতযোগ্য হিসেবে দিন", "Also recover the same VAT in box 10")}
                </label>
              )}
              <button type="button" className="pm-btn pm-btn--primary" disabled={saving} onClick={addEntry}>{saving ? L("সেভ হচ্ছে…", "Saving…") : L("এন্ট্রি যোগ করুন", "Add entry")}</button>
              {entryMsg && <span style={{ fontSize: 12, color: entryMsg === L("সেভ হয়েছে", "Saved") || entryMsg === L("মুছে ফেলা হয়েছে", "Removed") ? "#15803d" : "#b91c1c" }}>{entryMsg}</span>}
            </div>
          )}
          <div className="si-muted" style={{ marginTop: 4 }}>
            {L("কাস্টমস ডিক্লারেশন বা সাপ্লায়ারের কাগজ থেকে ঠিক যেমন পোর্টালে যাবে তেমন লিখুন (সমন্বয় বা পর্যটক ফেরত মাইনাস হতে পারে)। এন্ট্রির তারিখ যে সময়ের মধ্যে, সেই সময়ের রিটার্নে ধরা হয়। S4 কোনো আমদানি বিল বানায় না, FTA-তে কিছু জমা দেয় না।",
              "Type the figures from the customs declaration or supplier papers exactly as they go on the portal (an adjustment or tourist refund can be negative). An entry counts in the return whose period holds its date. S4 does not create import bills and does not file anything with FTA.")}
            {!isOwner && ` ${L("শুধু মালিক এন্ট্রি দিতে পারেন।", "Only the owner can add entries.")}`}
          </div>
        </div>
      </fieldset>
      <div className="si-note">
        {L(
          "এই পেজের একই হিসাব (উপরের KPI, draft ও বাতিল বাদ), FTA-র VAT201 বক্স অনুযায়ী সাজানো - পোর্টালে টাইপ করার জন্য; প্রিন্ট আর Excel উপরের বোতাম থেকে। S4 নিজে কিছু জমা দেয় না। 1a-1g: কাস্টমারের Emirate / শহর / এলাকা দেখে (Dubai, DXB, Deira…); কাস্টমার বা ঠিকানা না থাকলে দোকানের Emirate। ক্রেডিট নোট (রিটার্ন ও দামের নোট) যে সময়ে হয়েছে সেই সময়ের বক্স থেকে বাদ যায়। Box 9: TRN আছে এমন সাপ্লায়ারের ক্রয় ও খরচ। Box 2, 3, 6, 7, 10 (পর্যটক ফেরত, রিভার্স চার্জ, আমদানি) S4-এর বিলে থাকে না - নিচের হাতে দেওয়া এন্ট্রি থেকে দিন; Box 8-এ 2-7 আর Box 11-এ 10 যোগ হয়। সমন্বয় কলাম (যেমন খারাপ ঋণ) হাতে দিতে হয়। বক্সে ক্লিক করলে তার বিলগুলো দেখায়।",
          "This page's own figures (the KPIs above, drafts and cancelled left out), laid out by the FTA VAT201 boxes for typing into the portal; print and Excel are the buttons above. S4 does not file anything. 1a-1g: by the customer's Emirate / city / area (Dubai, DXB, Deira...); no customer or no address uses the shop's Emirate. Credit notes (returns and value notes) come off the boxes of the period they were made in. Box 9: purchases and expenses from suppliers with a TRN. Boxes 2, 3, 6, 7, 10 (tourist refunds, reverse charge, imports) are not on S4 bills - add them under Hand entries below; box 8 adds boxes 2-7 and box 11 adds box 10. The adjustment column (e.g. bad debt relief) is entered by hand. Click a box to see its bills."
        )}
      </div>
    </>
  );
}
