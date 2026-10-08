import { useMemo, useRef, useState } from "react";
import { PM_CSS } from "../product-master/pmStyles";
import { SI_CSS, usePmFitHeight, usePmMobile } from "../sales-invoice/siSkin";
import { filterProducts, findExactProductMatch } from "../utils/productSearch.js";
import { saveShopRecord } from "../offline/shopService";
import { printWithSettings } from "../print/printSettings.js";
import {
  LABEL_FIELDS, LABEL_PRESETS, applyPreset, buildLabelsHtml, canEncode, labelSettingsOf, labelsPerPage,
  productBarcode, productPrice,
} from "./labelLayout.js";

const ACCENT = "#7c3aed";

export default function BarcodeLabelsTab({ lang = "bn", shopId, user, profile, shop, products = [], toast, onShopUpdated, isOwner, cur = "" }) {
  const L = (bn, en) => (lang === "bn" ? bn : en);
  const [settings, setSettings] = useState(() => {
    const s = labelSettingsOf(shop);
    return { ...s, currency: s.currency || cur || "" };
  });
  const [queue, setQueue] = useState([]);
  const [q, setQ] = useState("");
  const [skip, setSkip] = useState(0);
  const [saving, setSaving] = useState(false);
  const mobile = usePmMobile();
  const rootRef = useRef(null);
  const fitH = usePmFitHeight(rootRef, mobile, "labels");

  const live = useMemo(() => products.filter((p) => p && p.id && p.name && !p.isDeleted && !p.deleted), [products]);
  const matches = useMemo(() => {
    if (!q.trim()) return [];
    const taken = new Set(queue.map((x) => x.product.id));
    return filterProducts(live.filter((p) => !taken.has(p.id)), q, { limit: 20 });
  }, [q, live, queue]);

  const add = (p, copies = 1) => {
    setQueue((list) => (list.some((x) => x.product.id === p.id)
      ? list.map((x) => (x.product.id === p.id ? { ...x, copies: x.copies + copies } : x))
      : [...list, { product: p, copies }]));
    setQ("");
  };
  const onKey = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const exact = findExactProductMatch(live, { code: q });
    const pick = exact || (matches.length === 1 ? matches[0] : null);
    if (pick) add(pick);
  };
  const setCopies = (id, v) => setQueue((list) => list.map((x) => (x.product.id === id ? { ...x, copies: Math.max(0, Math.min(1000, parseInt(v, 10) || 0)) } : x)));
  const remove = (id) => setQueue((list) => list.filter((x) => x.product.id !== id));
  const upd = (patch) => setSettings((s) => ({ ...s, ...patch }));
  const updField = (k, v) => setSettings((s) => ({ ...s, fields: { ...s.fields, [k]: v } }));

  const total = queue.reduce((t, x) => t + x.copies, 0);
  const per = labelsPerPage(settings);
  const missing = queue.filter((x) => !canEncode(productBarcode(x.product, settings)));
  const previewItems = useMemo(() => {
    const out = [];
    let left = Math.min(per * 2, 40);
    for (const x of queue) {
      if (left <= 0) break;
      const n = Math.min(x.copies, left);
      if (n > 0) out.push({ product: x.product, copies: n });
      left -= n;
    }
    if (!out.length && live[0]) out.push({ product: live[0], copies: 1 });
    return out;
  }, [queue, per, live]);
  const preview = useMemo(() => buildLabelsHtml({ items: previewItems, settings, shopName: shop?.companyName || "", skip }).html, [previewItems, settings, shop, skip]);

  const print = () => {
    if (!total) return toast?.(L("❌ অন্তত একটা পণ্য আর কপি সংখ্যা দিন", "❌ Add at least one product and copies"), "err");
    if (missing.length && !window.confirm(L(
      `${missing.length}টি পণ্যের বারকোড নেই বা বারকোড পড়া যায় না (যেমন: ${missing[0].product.name})। সেগুলোর লেবেলে "NO BARCODE" ছাপা হবে। তবুও প্রিন্ট করবেন?`,
      `${missing.length} product(s) have no usable barcode (e.g. ${missing[0].product.name}). Their labels will say "NO BARCODE". Print anyway?`
    ))) return;
    const { html } = buildLabelsHtml({ items: queue, settings, shopName: shop?.companyName || "", skip });
    printWithSettings(html, { lang, kind: "barcode" });
  };

  const saveSettings = async () => {
    if (!isOwner) return;
    setSaving(true);
    try {
      const updated = await saveShopRecord(shopId, { labelSettings: settings }, { ownerUid: user?.uid, profile, user });
      onShopUpdated?.(updated || { labelSettings: settings });
      toast?.(L("✅ লেবেল সেটিং সেভ হয়েছে — সব ডিভাইসে এটাই থাকবে", "✅ Label setup saved for all devices"));
    } catch (e) {
      toast?.(`❌ ${e?.message || e}`, "err");
    } finally {
      setSaving(false);
    }
  };

  const numIn = (label, key, step = "0.1", width = 70) => (
    <label className="si-field" style={{ minWidth: width }}>
      <span className="pm-label">{label}</span>
      <input type="number" step={step} min="0" className="pm-input" value={settings[key]}
        onChange={(e) => upd({ [key]: e.target.value, preset: "custom" })} style={{ textAlign: "right" }} />
    </label>
  );

  return (
    <div ref={rootRef} className="si-root" style={fitH ? { height: fitH } : undefined}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>
      <div className="pm-reference-title">
        <strong style={{ color: ACCENT }}>🏷️ {L("বারকোড লেবেল / স্টিকার প্রিন্ট", "Barcode labels / stickers")}</strong>
        <span>{total} {L("টি লেবেল", "labels")}{settings.sheet === "a4" && total ? ` · ${Math.ceil((total + Number(skip || 0)) / per)} ${L("পাতা", "sheets")}` : ""}</span>
      </div>
      <div className="si-body" style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "minmax(0,1.1fr) minmax(0,1fr)", gap: 8, overflow: "auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{L("পণ্য যোগ করুন", "Add products")}</legend>
            <div className="si-panel-body">
              <div className="si-search">
                <input className="pm-input" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} autoFocus={!mobile}
                  placeholder={L("নাম, কোড বা বারকোড লিখুন / স্ক্যান করুন…", "Type or scan name, code or barcode…")} />
              </div>
              {matches.length > 0 && (
                <div className="si-box" style={{ maxHeight: 200 }}>
                  {matches.map((p) => (
                    <button key={p.id} type="button" className="si-mrow" onClick={() => add(p)}
                      style={{ display: "flex", justifyContent: "space-between", gap: 8, width: "100%", border: 0, borderBottom: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", font: "inherit", textAlign: "left", padding: "4px 6px" }}>
                      <span><b>{p.name}</b>{p.code ? <span className="si-muted"> · {p.code}</span> : null}</span>
                      <span className="si-muted">{productBarcode(p, settings) || L("বারকোড নেই", "no barcode")}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </fieldset>

          <div className="si-box" style={{ minHeight: 140 }}>
            {!queue.length && <div className="si-empty">{L("উপরে পণ্য খুঁজে / স্ক্যান করে যোগ করুন, তারপর কত কপি লাগবে লিখুন", "Search or scan products above, then enter how many copies")}</div>}
            {queue.length > 0 && (
              <table className="pm-table">
                <thead><tr>
                  <th>{L("পণ্য", "Item")}</th>
                  <th style={{ width: 120 }}>{L("বারকোড", "Barcode")}</th>
                  <th style={{ width: 80 }} className="si-num">{L("দাম", "Price")}</th>
                  <th style={{ width: 80 }} className="si-num">{L("কপি", "Copies")}</th>
                  <th style={{ width: 30 }} />
                </tr></thead>
                <tbody>
                  {queue.map((x) => {
                    const code = productBarcode(x.product, settings);
                    const ok = canEncode(code);
                    return (
                      <tr key={x.product.id}>
                        <td className="si-strong" title={x.product.name}>{x.product.name}</td>
                        <td style={{ color: ok ? undefined : "#b91c1c" }}>{code || L("নেই", "none")}</td>
                        <td className="si-num">{productPrice(x.product) ? productPrice(x.product).toFixed(2) : "—"}</td>
                        <td style={{ padding: "1px 2px" }}>
                          <input type="number" min="0" className="pm-input" value={x.copies} onChange={(e) => setCopies(x.product.id, e.target.value)} style={{ textAlign: "right" }} />
                        </td>
                        <td className="si-center"><button type="button" className="pm-btn-secondary pm-btn--danger" style={{ minHeight: 17, padding: "0 5px" }} onClick={() => remove(x.product.id)}>✕</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{L("লেবেল সেটআপ", "Label setup")}</legend>
            <div className="si-panel-body" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label className="si-field">
                <span className="pm-label">{L("লেবেলের মাপ", "Label size")}</span>
                <select className="pm-input" value={settings.preset} onChange={(e) => setSettings((s) => applyPreset(s, e.target.value))}>
                  {LABEL_PRESETS.map((p) => <option key={p.key} value={p.key}>{p[lang] || p.en}</option>)}
                </select>
              </label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end" }}>
                <label className="si-field" style={{ minWidth: 110 }}>
                  <span className="pm-label">{L("কাগজ", "Paper")}</span>
                  <select className="pm-input" value={settings.sheet} onChange={(e) => upd({ sheet: e.target.value, preset: "custom" })}>
                    <option value="roll">{L("রোল / স্টিকার প্রিন্টার", "Roll / label printer")}</option>
                    <option value="a4">A4 {L("শীট", "sheet")}</option>
                  </select>
                </label>
                {numIn(L("চওড়া mm", "Width mm"), "width")}
                {numIn(L("উঁচু mm", "Height mm"), "height")}
                {numIn(L("পাশাপাশি", "Across"), "cols", "1", 60)}
                {numIn(L("ফাঁক ↔", "Gap ↔"), "gapX", "0.5", 60)}
                {numIn(L("ফাঁক ↕", "Gap ↕"), "gapY", "0.5", 60)}
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {LABEL_FIELDS.map((f) => (
                  <label key={f.key} className="pm-check"><input type="checkbox" checked={!!settings.fields[f.key]} onChange={(e) => updField(f.key, e.target.checked)} /> {f[lang] || f.en}</label>
                ))}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end" }}>
                <label className="si-field" style={{ minWidth: 70 }}>
                  <span className="pm-label">{L("লেখার সাইজ", "Font pt")}</span>
                  <input type="number" min="5" max="16" step="0.5" className="pm-input" value={settings.fontSize} onChange={(e) => upd({ fontSize: e.target.value })} />
                </label>
                <label className="si-field" style={{ minWidth: 70 }}>
                  <span className="pm-label">{L("বারকোড উঁচু mm", "Bar mm")}</span>
                  <input type="number" min="4" max="30" step="0.5" className="pm-input" value={settings.barHeight} onChange={(e) => upd({ barHeight: e.target.value })} />
                </label>
                <label className="si-field" style={{ minWidth: 90 }}>
                  <span className="pm-label">{L("দামের লেখা", "Price text")}</span>
                  <input className="pm-input" value={settings.priceLabel} onChange={(e) => upd({ priceLabel: e.target.value })} />
                </label>
                <label className="si-field" style={{ minWidth: 70 }}>
                  <span className="pm-label">{L("মুদ্রা", "Currency")}</span>
                  <input className="pm-input" value={settings.currency} onChange={(e) => upd({ currency: e.target.value })} />
                </label>
                {settings.sheet === "a4" && (
                  <label className="si-field" style={{ minWidth: 90 }}>
                    <span className="pm-label">{L("আগে ব্যবহৃত ঘর বাদ", "Skip used")}</span>
                    <input type="number" min="0" max={per - 1} className="pm-input" value={skip} onChange={(e) => setSkip(Math.max(0, Math.min(per - 1, parseInt(e.target.value, 10) || 0)))} />
                  </label>
                )}
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <label className="pm-check"><input type="checkbox" checked={!!settings.useCodeIfNoBarcode} onChange={(e) => upd({ useCodeIfNoBarcode: e.target.checked })} /> {L("বারকোড না থাকলে পণ্যের কোড দিয়ে বারকোড", "Use product code when no barcode")}</label>
                <label className="pm-check"><input type="checkbox" checked={!!settings.border} onChange={(e) => upd({ border: e.target.checked })} /> {L("লেবেলের চারপাশে দাগ", "Print label border")}</label>
              </div>
            </div>
          </fieldset>
        </div>

        <fieldset className="pm-panel" style={{ margin: 0, display: "flex", flexDirection: "column", minHeight: 360 }}>
          <legend className="pm-panel-legend">{L("প্রিভিউ", "Preview")} {settings.sheet === "a4" ? `· ${per} ${L("টি / পাতা", "per sheet")}` : ""}</legend>
          <iframe title="label-preview" srcDoc={preview} style={{ flex: 1, width: "100%", minHeight: 340, border: "1px solid #cbd5e1", background: "#e5e7eb" }} />
          <div className="si-muted" style={{ marginTop: 4 }}>
            {queue.length ? L("প্রথম কয়েকটা লেবেল দেখানো হচ্ছে", "Showing the first few labels") : L("নমুনা হিসেবে প্রথম পণ্যটা দেখানো হচ্ছে", "Showing the first product as a sample")}
          </div>
        </fieldset>
      </div>
      <div className={`si-actions${mobile ? " si-sticky-actions" : ""}`}>
        {queue.length > 0 && <button type="button" className="pm-btn-secondary pm-btn--danger" onClick={() => setQueue([])}>🧹 {L("তালিকা খালি", "Clear list")}</button>}
        {isOwner
          ? <button type="button" className="pm-btn-secondary" disabled={saving} onClick={saveSettings}>💾 {L("এই সেটআপ সেভ", "Save this setup")}</button>
          : <span className="si-hint">{L("সেটআপ সেভ শুধু মালিক করতে পারেন; আপনার বদল এখনকার প্রিন্টে কাজ করবে।", "Only the owner can save the setup; your changes apply to this print.")}</span>}
        {missing.length > 0 && <span className="si-hint" style={{ color: "#b91c1c" }}>⚠️ {missing.length} {L("টি পণ্যের বারকোড নেই", "without barcode")}</span>}
        <span className="si-toolbar-gap" />
        <button type="button" className="pm-btn pm-btn--primary" disabled={!total} onClick={print}>🖨️ {L(`${total}টি লেবেল প্রিন্ট`, `Print ${total} labels`)}</button>
      </div>
    </div>
  );
}
