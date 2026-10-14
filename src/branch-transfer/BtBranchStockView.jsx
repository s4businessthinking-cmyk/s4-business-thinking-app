import { bt, fq, f2 } from "./btShared.jsx";
import { useState } from "react";
import { numberValue } from "./branchTransferDomain.js";

export function BranchStockView({ lang, mobile, stockRows, shopStock, branches, branchIds, loading }) {
  const t = bt(lang);
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const [branchFilter, setBranchFilter] = useState("");
  const [query, setQuery] = useState("");
  const visibleBranches = branches.filter((branch) => branchIds.includes(branch.id));
  const q = query.trim().toLocaleLowerCase();
  const rows = stockRows
    .filter((row) => branchIds.includes(row.branchId) && (!branchFilter || row.branchId === branchFilter))
    .filter((row) => row.received !== 0 || row.current !== 0)
    .filter((row) => !q || [row.productName, row.productCode, row.branchName].join(" ").toLocaleLowerCase().includes(q))
    .sort((a, b) => String(a.branchName || "").localeCompare(String(b.branchName || "")) || String(a.productName || "").localeCompare(String(b.productName || "")));
  const totalNow = rows.reduce((sum, row) => sum + row.current, 0);
  const value = rows.reduce((sum, row) => sum + Math.max(0, row.current) * numberValue(row.lastUnitCost), 0);
  // Branch stock is part of the shop total, so it can never be more than the total.
  // It happens when the purchase that brought the goods in was deleted after the transfer.
  const atBranches = new Map();
  stockRows.forEach((row) => atBranches.set(row.productId, (atBranches.get(row.productId) || 0) + Math.max(0, row.current)));
  const shopTotalOf = (productId) => (shopStock?.has(productId) ? shopStock.get(productId) : null);
  const overShop = (row) => {
    const total = shopTotalOf(row.productId);
    return total !== null && row.current > 0 && atBranches.get(row.productId) > total + 1e-9;
  };
  const overCount = new Set(rows.filter(overShop).map((row) => row.productId)).size;
  const overTitle = (row) => L(
    `দোকানের মোট স্টক মাত্র ${fq(shopTotalOf(row.productId))} — অথচ Branch-এ ${fq(atBranches.get(row.productId))}। পণ্যটার Purchase সম্ভবত delete হয়েছে।`,
    `The shop's total stock is only ${fq(shopTotalOf(row.productId))} but branches hold ${fq(atBranches.get(row.productId))}. The purchase was probably deleted.`
  );

  return (
    <>
      {overCount > 0 && (
        <div style={{ margin: "4px 0", padding: "8px 10px", border: "1px solid #fca5a5", background: "#fef2f2", color: "#991b1b", borderRadius: 6, fontSize: 12, lineHeight: 1.5 }}>
          ⚠️ {L(
            `${overCount}টা পণ্যের Branch স্টক দোকানের মোট স্টকের চেয়ে বেশি দেখাচ্ছে। সাধারণত পণ্য Branch-এ পাঠানোর পর তার Purchase delete করলে এমন হয়। Purchase ভুল করে delete হলে আবার এন্ট্রি দিন, আর পণ্য সত্যিই না থাকলে Branch-এ যাওয়া Transfer-টা দেখুন।`,
            `${overCount} product(s) show more stock at the branch than the shop's total. This usually means the purchase was deleted after the goods were sent to the branch. If it was deleted by mistake, enter it again; if the goods really are not there, check the transfer that sent them.`
          )}
    </div>
      )}
      <div className="si-kpis">
        <div className="si-kpi"><span>{L("পণ্য", "Products")}</span><b>{rows.length}</b></div>
        <div className="si-kpi"><span>{L("Branch-এ এখন", "At branch now")}</span><b style={{ color: "#15803d" }}>{fq(totalNow)}</b></div>
        <div className="si-kpi"><span>{L("আনুমানিক মূল্য", "Approx. value")}</span><b>{f2(value)}</b></div>
    </div>
      <div className="si-filters">
        <div className="si-search">
          <input className="pm-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={L("পণ্য, কোড বা Branch…", "Product, code or branch…")} />
          {query && <button type="button" onClick={() => setQuery("")}>✕</button>}
        </div>
        <select className="pm-input" style={{ width: mobile ? "100%" : 180 }} value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
          <option value="">{L("সব Branch", "All branches")}</option>
          {visibleBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select>
        {loading && <span className="si-hint">⏳ {L("বিক্রি হিসাব হচ্ছে…", "Counting sales…")}</span>}
      </div>
      <div className="si-main is-all">
        <div className="si-box">
          {mobile ? rows.map((row) => (
            <div key={row.id} className="si-mrow" style={{ cursor: "default" }}>
              <div className="si-mrow-top"><span>{row.productName}</span><b title={overShop(row) ? overTitle(row) : undefined} style={{ color: row.current < 0 || overShop(row) ? "#b91c1c" : "#15803d" }}>{overShop(row) ? "⚠️ " : ""}{fq(row.current)} {row.unit || "Pcs"}</b></div>
              <div className="si-mrow-sub"><span>{row.branchName} · {row.productCode || "—"}</span><span>{L("এসেছে", "In")} {fq(row.received)} · {L("বিক্রি", "Sold")} {fq(row.sold)}</span></div>
            </div>
          )) : rows.length > 0 && (
            <table className="pm-table">
              <thead><tr>
                <th style={{ width: 150 }}>{t.branch}</th>
                <th>{L("পণ্য", "Item")}</th>
                <th style={{ width: 130 }}>{L("কোড", "Code")}</th>
                <th style={{ width: 90 }} className="si-num">{L("এসেছে", "Received")}</th>
                <th style={{ width: 90 }} className="si-num">{L("বিক্রি", "Sold")}</th>
                <th style={{ width: 90 }} className="si-num">{L("এখন আছে", "Now")}</th>
                <th style={{ width: 60 }}>{t.unit}</th>
              </tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.branchName}</td>
                    <td className="si-strong" title={row.productName}>{row.productName}</td>
                    <td>{row.productCode || ""}</td>
                    <td className="si-num">{fq(row.received)}</td>
                    <td className="si-num">{fq(row.sold)}</td>
                    <td className="si-num si-strong" title={overShop(row) ? overTitle(row) : undefined} style={{ color: row.current < 0 || overShop(row) ? "#b91c1c" : "#15803d" }}>{overShop(row) ? "⚠️ " : ""}{fq(row.current)}</td>
                    <td>{row.unit || "Pcs"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!rows.length && <div className="si-empty">{t.noStock}</div>}
        </div>
      </div>
      <div className="si-statusbar">
        <span>{L("দেখাচ্ছে", "Showing")} <b>{rows.length}</b></span>
        <span>{L("Branch স্টক = রিসিভ হওয়া − Branch থেকে বিক্রি। দোকানের মোট স্টকে এটা আলাদা করে যোগ হয় না।", "Branch stock = received − sold from the branch. It is part of the shop's total stock, not added on top.")}</span>
      </div>
    </>
  );
}
