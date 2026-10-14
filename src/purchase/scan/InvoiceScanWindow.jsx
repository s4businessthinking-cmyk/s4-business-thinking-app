import React, { useMemo, useRef, useState } from "react";
import { C, inp, lbl, btn, th, td } from "../../sales-invoice/SalesInvoiceDesktopForm.jsx";
import { readInvoiceFile } from "./invoiceText.js";
import { parseInvoice } from "./parseInvoice.js";
import { buildProductIndex, matchLine, matchVendor, nameScore, aliasKey } from "./matchInvoice.js";
import { offlinePatch } from "../../offline/offlineRepository";

const f2 = (n) => (Math.round((parseFloat(n) || 0) * 100) / 100).toFixed(2);
const n2 = (v) => parseFloat(v) || 0;
const STATUS = { exact: ["✅", "#15803d"], suggest: ["⚠️", "#b45309"], none: ["❌", "#b91c1c"] };

// Scan a supplier bill (PDF, photo or screenshot), check what was read, then fill the purchase form with it.
// Nothing is saved here: onApply fills the form and the user saves the bill as usual.
export default function InvoiceScanWindow({ lang = "en", products = [], vendors = [], onApply, onClose, onOpenProductMaster, onProductPatched }) {
  const bn = lang === "bn";
  const fileRef = useRef(null);
  const [phase, setPhase] = useState("pick"); // pick -> reading -> review
  const [step, setStep] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState("");
  const [source, setSource] = useState("");
  const [head, setHead] = useState({ invoiceNo: "", date: "", supplierName: "", trn: "", grandTotal: null, vatTotal: null });
  const [vendorId, setVendorId] = useState("");
  const [lines, setLines] = useState([]);
  const [search, setSearch] = useState({});
  const index = useMemo(() => buildProductIndex(products), [products]);
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const start = async (file) => {
    if (!file) return;
    setError(""); setPhase("reading");
    try {
      const res = await readInvoiceFile(file, (s) => setStep(s));
      const inv = parseInvoice(res.rows);
      setPreview(res.previewUrl); setSource(res.source);
      setHead({ invoiceNo: inv.invoiceNo, date: inv.date, supplierName: inv.supplierName, trn: inv.trn, grandTotal: inv.grandTotal, vatTotal: inv.vatTotal });
      const vm = matchVendor(inv, vendors);
      const vid = vm.vendor?.id || "";
      setVendorId(vid);
      // rows whose prices could not be read are kept only when their part number finds a product; rate left empty
      const loose = (inv.loose || []).map((l) => ({ l, m: matchLine(l, index, vid) })).filter(({ m }) => m.product && m.how !== "name");
      setLines([...inv.lines.map((l) => ({ l, m: matchLine(l, index, vid) })), ...loose].map(({ l, m }, i) => (
        { key: i, use: !l.loose || m.status === "exact", line: l, productId: m.product?.id || "", status: m.status, how: m.how, candidates: m.candidates,
          qty: String(l.qty), rate: l.loose ? "" : String(l.rate), discount: l.discount ? String(l.discount) : "", vatPerc: String(l.vatPerc || 0), learn: false })));
      setPhase("review");
      if (!inv.lines.length && !loose.length) setError(bn ? "কোনো আইটেমের লাইন পড়া যায়নি — নিচে নিজে যোগ করুন বা পরিষ্কার PDF / ছবি দিন।" : "No item lines could be read — add them below, or try a clearer PDF / photo.");
    } catch (err) {
      console.warn("[S4 Scan] read failed", err);
      setError((bn ? "ফাইল পড়া যায়নি: " : "Could not read the file: ") + (err?.message || err));
      setPhase("pick");
    }
  };

  const upd = (key, patch) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const pickProduct = (l, pid) => upd(l.key, { productId: pid, status: pid ? "exact" : "none", how: pid ? "picked" : "", learn: !!pid });
  const searchHits = (l) => {
    const q = (search[l.key] || "").trim();
    if (!q) return [];
    return products.map((p) => ({ p, s: Math.max(nameScore(q, p.name), String(p.code || "").toLowerCase().includes(q.toLowerCase()) ? 0.9 : 0) }))
      .filter((x) => x.s > 0.2).sort((a, b) => b.s - a.s).slice(0, 12).map((x) => x.p);
  };

  const used = lines.filter((l) => l.use && n2(l.qty) > 0);
  const lineTotal = (l) => { const base = n2(l.qty) * n2(l.rate) - n2(l.discount); return base * (1 + n2(l.vatPerc) / 100); };
  const total = used.reduce((s, l) => s + lineTotal(l), 0);
  const totalDiff = head.grandTotal != null ? Math.abs(total - head.grandTotal) : null;
  const unlinked = used.filter((l) => !l.productId).length;
  const vendor = vendors.find((v) => v.id === vendorId) || null;

  const apply = () => {
    if (!used.length) { alert(bn ? "অন্তত একটা লাইন দিন" : "Keep at least one line"); return; }
    if (unlinked && !window.confirm(bn
      ? `${unlinked}টি লাইনে কোনো product বাছাই হয়নি — এগুলোর stock হিসাব হবে না। তবুও বসাবেন?`
      : `${unlinked} line(s) have no product — their stock is not tracked. Fill the form anyway?`)) return;
    // remember the products linked by hand for this supplier (product.supplierAliases, syncs like any product edit)
    // (only for users who may edit products: the same permission opens Product Master, see onOpenProductMaster)
    if (vendorId && onOpenProductMaster) for (const l of used) {
      const p = l.learn && productById.get(l.productId);
      if (!p) continue;
      const alias = aliasKey(vendorId, l.line);
      const list = Array.isArray(p.supplierAliases) ? p.supplierAliases : [];
      if (list.includes(alias)) continue;
      const patch = { supplierAliases: [...list, alias].slice(-200), updatedAt: new Date().toISOString() };
      offlinePatch("products", p.id, patch, p)
        .then(() => onProductPatched?.(p.id, patch))
        .catch((err) => console.warn("[S4 Scan] could not remember the product link", err));
    }
    onApply?.({
      vendor, supplierName: head.supplierName, supplierInvoiceNo: head.invoiceNo, invoiceDate: head.date,
      lines: used.map((l) => ({ product: productById.get(l.productId) || null, name: l.line.name, code: l.line.code, unit: l.line.unit, qty: n2(l.qty), rate: n2(l.rate), discount: n2(l.discount), vatPerc: n2(l.vatPerc) })),
    });
  };

  const stepText = { pdf: bn ? "PDF পড়া হচ্ছে…" : "Reading the PDF…", ocr: bn ? "ছবি থেকে লেখা পড়া হচ্ছে (প্রথমবার একটু সময় লাগে)…" : "Reading text from the picture (the first time takes a little longer)…" };

  return (
    <div data-si-modal-open="" style={{ position: "fixed", inset: 0, zIndex: 10060, background: "rgba(10,25,55,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 10 }}>
      <div style={{ width: "100%", maxWidth: 1250, maxHeight: "96vh", display: "flex", flexDirection: "column", background: C.bg, border: `1px solid ${C.bar}`, borderRadius: 4, boxShadow: "0 18px 40px rgba(0,0,0,0.35)", overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: C.bar, color: "#fff", padding: "6px 12px", fontWeight: 800 }}>
          <span>📄 {bn ? "বিল স্ক্যান করে Purchase" : "Scan a bill into Purchase"}</span>
          <button type="button" onClick={onClose} style={{ background: "transparent", border: "none", color: "#fff", fontSize: 16, cursor: "pointer" }}>✕</button>
        </div>

        {phase !== "review" && (
          <div style={{ padding: 24, display: "grid", gap: 14, justifyItems: "center", textAlign: "center" }}>
            <div style={{ fontSize: 14, color: C.label, maxWidth: 620, lineHeight: 1.5 }}>
              {bn ? "সাপ্লায়ারের বিলের PDF, ছবি বা স্ক্রিনশট দিন। সফটওয়্যার পড়ে আইটেম মিলিয়ে দেখাবে — আপনি দেখে নিয়ে Purchase ফর্মে বসাবেন, তারপর নিজে Save করবেন।"
                : "Give the supplier's bill as a PDF, photo or screenshot. The software reads it and matches the items; you check them, fill the purchase form, then save it yourself."}
            </div>
            <input ref={fileRef} type="file" accept="application/pdf,image/*" style={{ display: "none" }} onChange={(e) => start(e.target.files?.[0])} />
            {phase === "pick"
              ? <button type="button" onClick={() => fileRef.current?.click()} style={btn("#1d4ed8", "#fff", { height: 40, padding: "0 26px", fontSize: 14 })}>📂 {bn ? "PDF / ছবি বাছাই করুন" : "Choose PDF / picture"}</button>
              : <div style={{ fontWeight: 700, color: "#1e3a8a" }}>⏳ {stepText[step] || (bn ? "পড়া হচ্ছে…" : "Reading…")}</div>}
            {error && <div style={{ color: C.red, fontWeight: 700 }}>{error}</div>}
            <div style={{ fontSize: 11.5, color: "#4b5f86", maxWidth: 620 }}>
              {bn ? "সাপ্লায়ারের সফটওয়্যারের PDF সবচেয়ে নির্ভুল। ছবি হলে সোজা করে, আলোতে, পুরো বিল ফ্রেমে রেখে তুলুন। হাতে লেখা বিল ভালো পড়া যায় না।"
                : "PDFs from the supplier's software read best. For photos: straight, well lit, the whole bill in frame. Handwritten bills do not read well."}
            </div>
          </div>
        )}

        {phase === "review" && (
          <div style={{ display: "grid", gridTemplateColumns: preview ? "minmax(0,1fr) 340px" : "1fr", gap: 10, padding: 10, minHeight: 0, overflow: "hidden", flex: 1 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,2fr) 1fr 150px auto", gap: 8, alignItems: "end" }}>
                <div>
                  <div style={lbl}>{bn ? "সাপ্লায়ার" : "Supplier"}</div>
                  <select style={inp({ borderColor: vendor ? C.border : C.red })} value={vendorId} onChange={(e) => {
                    const vid = e.target.value; setVendorId(vid);
                    setLines((prev) => prev.map((l) => (l.how === "picked" ? l : (() => { const m = matchLine(l.line, index, vid); return { ...l, productId: m.product?.id || "", status: m.status, how: m.how, candidates: m.candidates }; })())));
                  }}>
                    <option value="">{bn ? "— সাপ্লায়ার বাছাই করুন —" : "— choose the supplier —"}</option>
                    {[...vendors].sort((a, b) => String(a.vendorName).localeCompare(String(b.vendorName))).map((v) => <option key={v.id} value={v.id}>{v.vendorName}</option>)}
                  </select>
                  {head.supplierName && (
                    <div style={{ fontSize: 11, color: "#4b5f86", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {bn ? "বিলে" : "On bill"}: {head.supplierName}{head.trn ? ` · TRN ${head.trn}` : ""}{!vendor ? (bn ? " — লিস্টে না থাকলে এই নামেই বসবে" : " — used as the name if not in the list") : ""}
                    </div>
                  )}
                </div>
                <div><div style={lbl}>Supplier Inv. No</div><input style={inp({ borderColor: head.invoiceNo ? C.border : C.red })} value={head.invoiceNo} onChange={(e) => setHead((h) => ({ ...h, invoiceNo: e.target.value }))} /></div>
                <div><div style={lbl}>{bn ? "বিলের তারিখ" : "Bill date"}</div><input type="date" style={inp()} value={head.date} onChange={(e) => setHead((h) => ({ ...h, date: e.target.value }))} /></div>
                <button type="button" onClick={() => { setPhase("pick"); setLines([]); setError(""); }} style={btn()}>↺ {bn ? "অন্য ফাইল" : "Other file"}</button>
              </div>
              {error && <div style={{ color: C.red, fontWeight: 700, fontSize: 12.5 }}>{error}</div>}
              <div style={{ fontSize: 11.5, color: "#4b5f86" }}>
                {source === "ocr" ? (bn ? "ছবি থেকে পড়া — প্রতিটা সংখ্যা মিলিয়ে নিন।" : "Read from a picture — check every number.") : (bn ? "PDF থেকে পড়া।" : "Read from the PDF.")}
                {" "}✅ {bn ? "মিলেছে" : "matched"} · ⚠️ {bn ? "মিল সন্দেহের, দেখে নিন" : "likely match, check it"} · ❌ {bn ? "product নেই — বাছাই করুন বা নতুন বানান" : "no product — pick one or create it"}
              </div>
              <div style={{ border: `1px solid ${C.border}`, background: "#fff", overflow: "auto", flex: 1, minHeight: 160 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>
                    {["", "", bn ? "বিলে লেখা" : "On the bill", bn ? "আপনার product" : "Your product", "Qty", "Rate", "Dis Amt", "VAT %", bn ? "মোট" : "Total"].map((h, i) => <th key={i} style={{ ...th, textAlign: i >= 4 ? "right" : "left" }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {lines.map((l) => {
                      const [icon, color] = STATUS[l.status] || STATUS.none;
                      const hits = searchHits(l);
                      const cand = l.candidates.filter((c) => c.product.id !== l.productId);
                      return (
                        <tr key={l.key} style={{ opacity: l.use ? 1 : 0.45, background: l.status === "none" ? "#fef2f2" : l.status === "suggest" ? "#fffbeb" : "#fff" }}>
                          <td style={{ ...td, textAlign: "center", width: 24 }}><input type="checkbox" checked={l.use} onChange={(e) => upd(l.key, { use: e.target.checked })} /></td>
                          <td style={{ ...td, textAlign: "center", width: 26, color }} title={l.how}>{icon}</td>
                          <td style={{ ...td, textAlign: "left", whiteSpace: "normal", minWidth: 180 }}>
                            <div style={{ fontWeight: 700 }}>{l.line.name}</div>
                            <div style={{ fontSize: 11, color: "#64748b" }}>{[l.line.brand, l.line.code, l.line.unit].filter(Boolean).join(" · ")}</div>
                            {l.line.loose && <div style={{ fontSize: 11, color: C.red, fontWeight: 700 }}>⚠️ {bn ? "দাম পড়া যায়নি — qty / rate দেখে দিন" : "Price not readable — check qty / rate"}</div>}
                          </td>
                          <td style={{ ...td, textAlign: "left", minWidth: 260, whiteSpace: "normal" }}>
                            <select style={inp({ height: 24, fontSize: 12 })} value={l.productId} onChange={(e) => pickProduct(l, e.target.value)}>
                              <option value="">{bn ? "— product নেই —" : "— no product —"}</option>
                              {l.productId && productById.get(l.productId) && <option value={l.productId}>{productById.get(l.productId).name}{productById.get(l.productId).code ? ` · ${productById.get(l.productId).code}` : ""}</option>}
                              {cand.map((c) => <option key={c.product.id} value={c.product.id}>≈ {c.product.name}{c.product.code ? ` · ${c.product.code}` : ""}</option>)}
                              {hits.filter((p) => p.id !== l.productId && !cand.some((c) => c.product.id === p.id)).map((p) => <option key={p.id} value={p.id}>🔍 {p.name}{p.code ? ` · ${p.code}` : ""}</option>)}
                            </select>
                            <div style={{ display: "flex", gap: 4, marginTop: 3 }}>
                              <input style={inp({ height: 22, fontSize: 11.5 })} placeholder={bn ? "🔍 নাম / কোড খুঁজুন" : "🔍 search name / code"} value={search[l.key] || ""} onChange={(e) => setSearch((s) => ({ ...s, [l.key]: e.target.value }))} />
                              {onOpenProductMaster && !l.productId && (
                                <button type="button" onClick={() => onOpenProductMaster(l.line.name)} style={btn("#ecfdf5", "#15803d", { height: 22, fontSize: 11, padding: "0 6px" })}>＋ {bn ? "নতুন" : "New"}</button>
                              )}
                            </div>
                          </td>
                          {["qty", "rate", "discount", "vatPerc"].map((k) => (
                            <td key={k} style={{ ...td, width: k === "vatPerc" ? 56 : 80 }}>
                              <input style={inp({ height: 24, fontSize: 12, textAlign: "right" })} inputMode="decimal" value={l[k]} onChange={(e) => upd(l.key, { [k]: e.target.value })} />
                            </td>
                          ))}
                          <td style={{ ...td, fontWeight: 700, width: 90 }}>{f2(lineTotal(l))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <button type="button" onClick={() => setLines((prev) => [...prev, { key: Date.now(), use: true, line: { name: "", code: "", unit: "", raw: "" }, productId: "", status: "none", how: "", candidates: [], qty: "1", rate: "", discount: "", vatPerc: "5", learn: false }])} style={btn()}>＋ {bn ? "লাইন যোগ" : "Add line"}</button>
                <span style={{ marginLeft: "auto", fontSize: 13 }}>
                  {bn ? "হিসাব" : "Calculated"}: <b>{f2(total)}</b>
                  {head.grandTotal != null && <> · {bn ? "বিলে" : "On bill"}: <b>{f2(head.grandTotal)}</b> {totalDiff < 0.06 ? <span style={{ color: C.green, fontWeight: 800 }}>✅ {bn ? "মিলেছে" : "matches"}</span> : <span style={{ color: C.red, fontWeight: 800 }}>⚠️ {bn ? "পার্থক্য" : "difference"} {f2(total - head.grandTotal)}</span>}</>}
                </span>
                <button type="button" onClick={onClose} style={btn()}>{bn ? "বাতিল" : "Cancel"}</button>
                <button type="button" onClick={apply} disabled={!used.length} style={btn("#15803d", "#fff", { padding: "0 18px" })}>✔ {bn ? "Purchase ফর্মে বসাও" : "Fill the purchase form"}</button>
              </div>
            </div>
            {preview && (
              <div style={{ border: `1px solid ${C.border}`, background: "#fff", overflow: "auto", minHeight: 0 }}>
                <img src={preview} alt="" style={{ width: "100%", display: "block" }} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
