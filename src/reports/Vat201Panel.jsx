// VAT return (FTA VAT201) tab of the Tax / VAT page: the page's own VAT figures for the chosen period laid out box by
// box, each box opening the bills behind it, with the checks to clear before filing. The period, data, print and
// Excel come from the Tax page itself, so both always show the same numbers. S4 never files with FTA.
// Rules in vat201.js.
import React, { useState } from "react";

const money = (v) => (Math.round((Number(v) || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
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
export default function Vat201Panel({ lang = "en", ret, vat, cur = "AED", isOwner = false, noVatBox = "4", onChangeNoVatBox, saving = false, onOpenDoc = null, mobile = false }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const [sel, setSel] = useState("");
  if (!ret) return null;
  const box = ret.boxes.find((b) => b.id === sel) || null;
  const drillRows = sel === "unmapped" ? ret.unmapped.rows : sel === "excluded" ? ret.excluded.rows : box?.rows || [];
  const colOf = (r) => (vat?.purchaseRows.includes(r) ? "purchaseInvoices" : "salesInvoices");
  const openable = (r) => !r.isReturn && !r.isExpense && !!onOpenDoc?.can?.(colOf(r));

  return (
    <>
      <style>{VR_CSS}</style>
      {!ret.agrees && <div className="si-paid-box is-due">{L("বক্সের যোগফল উপরের KPI-এর সাথে মেলেনি", "The boxes do not add up to the totals above")}</div>}
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
                    <tr className={`${b.total ? "is-total" : ""}${!b.tracked ? " is-off" : ""}${b.rows.length ? " is-click" : ""}${sel === b.id ? " is-sel" : ""}`} onClick={b.rows.length ? () => setSel(sel === b.id ? "" : b.id) : undefined}>
                      <td>{b.id}</td>
                      <td>
                        {bn ? b.bn : b.en}
                        {!b.tracked && <span className="si-muted"> - {L("S4-এ রাখা হয় না, থাকলে নিজের কাগজ থেকে দিন", "not tracked in S4, enter from your own papers if any")}</span>}
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
                      <td style={openable(r) ? { color: "#1d4ed8", textDecoration: "underline" } : undefined}>{r.no}{r.isReturn ? <span className="si-muted"> ({L("নোট / রিটার্ন", "note / return")})</span> : null}{r.isExpense ? <span className="si-muted"> ({L("খরচ", "expense")})</span> : null}</td>
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
      <div className="si-note">
        {L(
          "এই পেজের একই হিসাব (উপরের KPI, draft ও বাতিল বাদ), FTA-র VAT201 বক্স অনুযায়ী সাজানো - পোর্টালে টাইপ করার জন্য; প্রিন্ট আর Excel উপরের বোতাম থেকে। S4 নিজে কিছু জমা দেয় না। 1a-1g: কাস্টমারের Emirate / শহর / এলাকা দেখে (Dubai, DXB, Deira…); কাস্টমার বা ঠিকানা না থাকলে দোকানের Emirate। ক্রেডিট নোট (রিটার্ন ও দামের নোট) যে সময়ে হয়েছে সেই সময়ের বক্স থেকে বাদ যায়। Box 9: TRN আছে এমন সাপ্লায়ারের ক্রয় ও খরচ। Box 2, 3, 6, 7, 10 (পর্যটক ফেরত, রিভার্স চার্জ, আমদানি) S4-এর বিলে থাকে না - থাকলে কাস্টমস / আমদানির কাগজ থেকে দিন। সমন্বয় কলাম (যেমন খারাপ ঋণ) হাতে দিতে হয়। বক্সে ক্লিক করলে তার বিলগুলো দেখায়।",
          "This page's own figures (the KPIs above, drafts and cancelled left out), laid out by the FTA VAT201 boxes for typing into the portal; print and Excel are the buttons above. S4 does not file anything. 1a-1g: by the customer's Emirate / city / area (Dubai, DXB, Deira...); no customer or no address uses the shop's Emirate. Credit notes (returns and value notes) come off the boxes of the period they were made in. Box 9: purchases and expenses from suppliers with a TRN. Boxes 2, 3, 6, 7, 10 (tourist refunds, reverse charge, imports) are not on S4 bills - enter them from your customs / import papers if any. The adjustment column (e.g. bad debt relief) is entered by hand. Click a box to see its bills."
        )}
      </div>
    </>
  );
}
