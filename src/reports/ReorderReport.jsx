// Reorder / low stock: products at or below their reorder level, with the suggested quantity to buy, filters, print,
// Excel and a plain-text copy for a supplier message. A row opens the product. Rules in inventory/reorder.js; the stock
// is the same count as the Stock Hub.
import React, { useMemo, useRef, useState } from "react";
import { PM_CSS } from "../product-master/pmStyles";
import { SI_CSS, usePmFitHeight, usePmMobile } from "../sales-invoice/siSkin";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { saveTextFile } from "../utils/saveTextFile.js";
import { csvText } from "./vatExport.js";
import { useLowStock } from "../inventory/useLowStock.js";
import { reorderFileName, reorderRows, reorderText } from "../inventory/reorder.js";

const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const RO_CSS = `
.ro-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.ro-table th { text-align: left; background: #e8eef7; padding: 4px 6px; border-bottom: 1px solid #8797a9; white-space: nowrap; position: sticky; top: 0; }
.ro-table td { padding: 4px 6px; border-bottom: 1px solid #e2e8f0; }
.ro-table .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.ro-table tr.is-click { cursor: pointer; }
.ro-table tr.is-click:hover td { background: #eaf2ff; }
`;

export default function ReorderReport({ lang = "en", shopId, products = [], shopName = "", toast, canPrint = false, onOpenProduct = null }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [onlyOut, setOnlyOut] = useState(false);
  const mobile = usePmMobile();
  const rootRef = useRef(null);
  const fitH = usePmFitHeight(rootRef, mobile);
  const today = localDay();
  const { rows, loaded, watchedCount, error, refresh } = useLowStock(products, shopId, { intervalMs: 60 * 1000 });

  const categories = useMemo(() => [...new Set(rows.map((r) => r.category).filter(Boolean))].sort(), [rows]);
  const q = search.trim().toLowerCase();
  const shown = useMemo(() => rows.filter((r) => (!onlyOut || r.out) && (!category || r.category === category)
    && (!q || [r.name, r.code, r.brand, r.rack].some((v) => String(v || "").toLowerCase().includes(q)))), [rows, onlyOut, category, q]);
  const outCount = rows.filter((r) => r.out).length;

  const print = () => {
    const t = reorderRows(shown);
    printWithSettings(generateStatementHTML({
      shopName, title: L("স্টক কম - রি-অর্ডার তালিকা", "LOW STOCK - REORDER LIST"), subtitle: fmtDay(today),
      partyLine: L(`${shown.length}টি পণ্য রি-অর্ডার লেভেলে বা তার নিচে`, `${shown.length} product(s) at or below the reorder level`),
      cols: t[0].map((label, i) => ({ label, align: i >= 6 ? "right" : undefined })), rows: t.slice(1),
    }), { lang });
  };
  const exportCsv = async () => {
    try { await saveTextFile(reorderFileName(today), csvText(reorderRows(shown))); } catch (e) { toast?.(e.message || String(e), "err"); }
  };
  const copyList = async () => {
    try {
      await navigator.clipboard.writeText(reorderText(shown, { shopName, day: fmtDay(today), bn }));
      toast?.(L("তালিকা কপি হয়েছে - মেসেজে পেস্ট করুন", "List copied - paste it into a message"));
    } catch { toast?.(L("কপি করা গেল না", "Could not copy the list"), "err"); }
  };

  return (
    <div ref={rootRef} className="si-root" style={fitH ? { height: fitH } : undefined}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>
      <style>{RO_CSS}</style>
      <div className="pm-reference-title">
        <strong> {L("স্টক কম / রি-অর্ডার", "Low Stock / Reorder")}</strong>
        <span>{fmtDay(today)}</span>
      </div>
      <div className="si-toolbar">
        {canPrint && <button type="button" className="pm-btn pm-btn--primary" onClick={print} disabled={!shown.length}> {L("প্রিন্ট", "Print")}</button>}
        {canPrint && <button type="button" className="pm-btn-secondary" onClick={exportCsv} disabled={!shown.length}> Excel</button>}
        <button type="button" className="pm-btn-secondary" onClick={copyList} disabled={!shown.length}>{L("তালিকা কপি", "Copy list")}</button>
        <button type="button" className="pm-btn-secondary" onClick={refresh}> {L("রিফ্রেশ", "Refresh")}</button>
        <span className="si-toolbar-gap" />
        <input className="pm-input" style={{ width: mobile ? "100%" : 220 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={L("নাম, কোড, ব্র্যান্ড বা র‍্যাক", "Name, code, brand or rack")} />
        {categories.length > 0 && (
          <select className="pm-input" style={{ width: mobile ? "100%" : 160 }} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{L("সব ক্যাটাগরি", "All categories")}</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <label className="pm-check"><input type="checkbox" checked={onlyOut} onChange={(e) => setOnlyOut(e.target.checked)} /> {L("শুধু স্টক শেষ", "Out of stock only")}</label>
      </div>
      {loaded && (
        <div className="si-kpis">
          <div className="si-kpi"><span>{L("রি-অর্ডার দরকার", "To reorder")}</span><b style={{ color: rows.length ? "#b45309" : "#15803d" }}>{rows.length}</b></div>
          <div className="si-kpi"><span>{L("স্টক শেষ", "Out of stock")}</span><b style={{ color: outCount ? "#b91c1c" : undefined }}>{outCount}</b></div>
          <div className="si-kpi"><span>{L("লেভেল দেওয়া পণ্য", "Products with a level")}</span><b>{watchedCount}</b></div>
        </div>
      )}
      <div className="si-body">
        {error && <div className="si-paid-box is-due">{L("স্টক পড়া যায়নি: ", "Could not read stock: ")}{error}</div>}
        {!loaded && !error && <div className="si-empty">{L("লোড হচ্ছে…", "Loading…")}</div>}
        {loaded && !watchedCount && <div className="si-empty">{L("কোনো পণ্যে রি-অর্ডার লেভেল দেওয়া নেই। প্রোডাক্ট মাস্টারে \"Reorder Level\" থেকে সর্বনিম্ন স্টক দিন।", "No product has a reorder level yet. Set the minimum stock under \"Reorder Level\" on the product master.")}</div>}
        {loaded && watchedCount > 0 && !shown.length && <div className="si-empty">{rows.length ? L("এই ফিল্টারে কিছু নেই", "Nothing matches the filter") : L("সব পণ্য রি-অর্ডার লেভেলের উপরে আছে", "Every product is above its reorder level")}</div>}
        {shown.length > 0 && (
          <div style={{ overflow: "auto" }}>
            <table className="ro-table">
              <thead><tr>
                <th>{L("কোড", "Code")}</th><th>{L("পণ্য", "Product")}</th>{!mobile && <th>{L("ব্র্যান্ড", "Brand")}</th>}{!mobile && <th>{L("র‍্যাক", "Rack")}</th>}
                <th className="num">{L("স্টক", "In stock")}</th><th className="num">{L("রি-অর্ডার লেভেল", "Reorder level")}</th>
                {!mobile && <th className="num">{L("সর্বোচ্চ", "Max")}</th>}<th className="num">{L("কিনুন", "Buy")}</th>
              </tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className={onOpenProduct ? "is-click" : undefined} onClick={onOpenProduct ? () => onOpenProduct(r.id) : undefined} title={onOpenProduct ? L("পণ্য খুলুন", "Open the product") : undefined}>
                    <td>{r.code}</td><td className="si-strong">{r.name}</td>{!mobile && <td>{r.brand}</td>}{!mobile && <td>{r.rack}</td>}
                    <td className="num" style={{ color: r.out ? "#b91c1c" : "#b45309", fontWeight: 700 }}>{r.stock} {r.unit}</td>
                    <td className="num">{r.min}</td>{!mobile && <td className="num">{r.max || ""}</td>}<td className="num si-strong">{r.suggest}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="si-note">
          {L(
            "স্টক = স্টক হাবের একই হিসাব (সেভ করা বিল, রিটার্ন, অ্যাডজাস্টমেন্ট)। রি-অর্ডার লেভেল দেওয়া পণ্যই শুধু দেখায়। কিনুন = পণ্যের রি-অর্ডার Qty, না থাকলে সর্বোচ্চ লেভেল পর্যন্ত, না থাকলে রি-অর্ডার লেভেল পর্যন্ত। \"তালিকা কপি\" শুধু কপি করে - কিছু পাঠায় না।",
            "Stock = the same count as the Stock Hub (saved bills, returns, adjustments). Only products with a reorder level are listed. Buy = the product's reorder quantity, else up to its maximum level, else back up to the reorder level. \"Copy list\" only copies - it does not send anything."
          )}
        </div>
      </div>
    </div>
  );
}
