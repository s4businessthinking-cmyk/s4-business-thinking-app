import React, { useMemo, useState } from "react";
import { filterProducts, findExactProductMatch } from "../utils/productSearch.js";

const n2 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const fq = (v) => String(parseFloat(n2(v).toFixed(4)));
const live = (p) => p && !p.isDeleted && !p.deleted && p.name;

// Search box with a result list; Enter picks an exact code/barcode match or the only result.
export default function ProductPicker({ products, exclude = [], stockOf, onPick, placeholder, autoFocus, mobile, lang = "en" }) {
  const [q, setQ] = useState("");
  const pool = useMemo(() => products.filter((p) => live(p) && !exclude.includes(p.id)), [products, exclude]);
  const matches = useMemo(() => (q.trim() ? filterProducts(pool, q, { limit: 20 }) : []), [q, pool]);
  const pick = (p) => { onPick(p); setQ(""); };
  const onKey = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const exact = findExactProductMatch(pool, { code: q });
    const p = exact || (matches.length === 1 ? matches[0] : null);
    if (p) pick(p);
  };
  return (
    <div>
      <div className="si-search"><input className="pm-input" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} autoFocus={autoFocus} placeholder={placeholder} /></div>
      {matches.length > 0 && (
        <div className="si-box" style={{ maxHeight: mobile ? 240 : 160 }}>
          {matches.map((p) => {
            const st = stockOf ? stockOf(p.id) : undefined;
            return (
              <button key={p.id} type="button" className="si-mrow" style={{ display: "flex", justifyContent: "space-between", gap: 8, width: "100%", padding: mobile ? undefined : "3px 6px", border: 0, borderBottom: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", font: "inherit", textAlign: "left" }} onClick={() => pick(p)}>
                <span><b>{p.name}</b>{p.code ? <span className="si-muted"> · {p.code}</span> : null}{p.brand ? <span className="si-muted"> · {p.brand}</span> : null}</span>
                {st !== undefined && <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{st == null ? "…" : fq(st)} {p.unit || ""}</span>}
              </button>
            );
          })}
        </div>
      )}
      {q.trim() && !matches.length && <div className="si-muted">{lang === "bn" ? "কোনো পণ্য পাওয়া যায়নি" : "No product found"}</div>}
    </div>
  );
}
