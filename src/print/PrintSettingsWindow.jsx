import { useEffect, useState } from "react";
import { loadPrintSettings, savePrintSettings, PAPER_SIZES, canPickPrinter, listPrinters, printHtmlDocument } from "./printSettings.js";
import { useEscapeKey } from "../components/WindowChrome.jsx";
import { DESIGN_DOCS, TEMPLATES, SAMPLE_DATA, loadPrintDesign, savePrintDesign, renderLayoutDocument, imageFileToDataUrl } from "./printDesign.js";
import PrintDesigner from "./PrintDesigner.jsx";

const C = {
  bg: "#c9d9ef", panel: "#dbe6f5", border: "#7d94b7", bar: "#2854ad", text: "#07101c", legend: "#1e3a8a",
};
const font = "Tahoma, 'Segoe UI', Arial, sans-serif";

function Check({ checked, onChange, children, hint, disabled }) {
  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12, color: disabled ? "#6b7280" : C.text, cursor: disabled ? "default" : "pointer", padding: "3px 0", lineHeight: 1.35 }}>
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} style={{ width: 15, height: 15, margin: "1px 0 0", flexShrink: 0 }} />
      <span>{children}{hint && <b style={{ color: "#9a3412", marginLeft: 6 }}>{hint}</b>}</span>
    </label>
  );
}

function Group({ title, children }) {
  return (
    <fieldset style={{ border: `1px solid ${C.border}`, borderRadius: 2, padding: "8px 10px 10px", margin: "0 0 10px", background: C.panel }}>
      <legend style={{ fontSize: 12, fontWeight: 700, color: C.legend, padding: "0 4px" }}>{title}</legend>
      {children}
    </fieldset>
  );
}

const tabBtn = (active) => ({
  padding: "6px 14px", fontSize: 13, fontFamily: font, cursor: "pointer",
  border: `1px solid ${C.border}`, borderBottom: active ? `1px solid ${C.panel}` : `1px solid ${C.border}`,
  background: active ? C.panel : "#eef3fb", color: C.text, fontWeight: active ? 700 : 400,
  borderRadius: "3px 3px 0 0", marginRight: 2, position: "relative", top: 1,
});

const winBtn = (primary) => ({
  minWidth: 84, padding: "7px 14px", fontSize: 13, fontFamily: font, cursor: "pointer", borderRadius: 3,
  border: "1px solid #41658e", color: C.text, fontWeight: primary ? 700 : 400,
  background: "linear-gradient(180deg,#f8fbff 0%,#d4e3f4 49%,#a8c5e6 51%,#e4effa 100%)",
});

function PaperPreview({ paper }) {
  const thermal = paper === "80mm" || paper === "58mm";
  const landscape = paper === "8x6";
  const w = thermal ? 46 : landscape ? 110 : 82;
  const h = thermal ? 120 : landscape ? 82 : 110;
  return (
    <div style={{ width: 120, height: 128, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", border: `1px solid ${C.border}`, flexShrink: 0 }}>
      <div style={{ width: w, height: h, border: "1px solid #6b7280", padding: 4, boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ height: 8, background: "#9ca3af" }} />
        {Array.from({ length: thermal ? 10 : 7 }).map((_, i) => <div key={i} style={{ height: 3, background: i % 3 === 0 ? "#cbd5e1" : "#e5e7eb" }} />)}
        <div style={{ marginTop: "auto", height: 6, width: "50%", alignSelf: "flex-end", background: "#9ca3af" }} />
      </div>
    </div>
  );
}

function PrinterSetup({ bn, billPrinter, barcodePrinter, onSet, onClose }) {
  const [printers, setPrinters] = useState(null);
  const [bill, setBill] = useState(billPrinter);
  const [barcode, setBarcode] = useState(barcodePrinter);
  const supported = canPickPrinter();
  useEscapeKey(onClose, { level: 4 });
  useEffect(() => { if (supported) listPrinters().then(setPrinters); }, [supported]);

  const testPrint = () => {
    const now = new Date().toLocaleString();
    printHtmlDocument(`<html><head><meta charset="UTF-8"></head><body style="font-family:Arial;padding:10px"><h3>S4 Business Thinking</h3><p>Printer test — ${bill}</p><p>${now}</p></body></html>`, { preview: false, printer: bill });
  };

  const select = (value, onChange) => (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      style={{ width: "100%", height: 28, border: "1px solid #8797a9", fontFamily: font, fontSize: 13, background: "#fff" }}>
      <option value="">{bn ? "— প্রতিবার জিজ্ঞেস করো (প্রিন্ট ডায়ালগ) —" : "— Ask every time (print dialog) —"}</option>
      {(printers || []).map((p) => <option key={p.name} value={p.name}>{p.displayName}{p.isDefault ? (bn ? " (ডিফল্ট)" : " (default)") : ""}</option>)}
      {value && printers && !printers.some((p) => p.name === value) && <option value={value}>{value} {bn ? "(পাওয়া যাচ্ছে না)" : "(not found)"}</option>}
    </select>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 5100, background: "rgba(10,25,55,0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
      <div style={{ width: "min(500px, 100%)", background: "#c7d5c9", border: "1px solid #3e6b54", boxShadow: "0 16px 40px rgba(2,6,23,0.5)", fontFamily: font, color: C.text }}>
        <div style={{ padding: "6px 10px", background: "linear-gradient(180deg,#5f8f74,#3e6b54)", color: "#fff", fontWeight: 700, fontSize: 13 }}>
          🖨️ {bn ? "প্রিন্টার সেটআপ (PRINTER SETUP)" : "PRINTER SETUP"}
        </div>
        <div style={{ padding: 14, display: "grid", gap: 14 }}>
          {!supported ? (
            <div style={{ fontSize: 13, lineHeight: 1.5, background: "#fff7ed", border: "1px solid #f59e0b", padding: 10 }}>
              {bn
                ? "সরাসরি প্রিন্টার বেছে রাখা শুধু পিসির S4 অ্যাপে (Windows) কাজ করে। ওয়েবসাইট বা মোবাইলে প্রিন্ট করার সময় যে ডায়ালগ আসে সেখান থেকে প্রিন্টার বাছুন।"
                : "Choosing a printer works only in the S4 desktop app (Windows). On the website or mobile, pick the printer in the print dialog."}
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ fontSize: 34, width: 56, textAlign: "center" }}>🧾</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{bn ? "বিল প্রিন্টার বাছুন" : "Select Bill Printer"}</div>
                  {printers === null ? <div style={{ fontSize: 12 }}>…</div> : select(bill, setBill)}
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ fontSize: 34, width: 56, textAlign: "center" }}>🏷️</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{bn ? "বারকোড প্রিন্টার বাছুন" : "Select Barcode Printer"}</div>
                  {printers === null ? <div style={{ fontSize: 12 }}>…</div> : select(barcode, setBarcode)}
                </div>
              </div>
              <div style={{ fontSize: 11, color: "#1f2937", lineHeight: 1.45 }}>
                {bn
                  ? "⚡ প্রিন্টার বেছে রেখে \"প্রিন্টের আগে বিল দেখাও\" টিক তুলে দিলে বিল কোনো ডায়ালগ ছাড়াই সরাসরি এই প্রিন্টারে চলে যাবে।"
                  : "⚡ With a printer chosen and \"Show Bill Preview\" off, bills go straight to this printer without any dialog."}
              </div>
            </>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, borderTop: "3px double #6b8f7a", paddingTop: 10 }}>
            {supported && bill && <button type="button" style={winBtn(false)} onClick={testPrint}>{bn ? "টেস্ট প্রিন্ট" : "Test Print"}</button>}
            {supported && <button type="button" style={winBtn(true)} onClick={() => { onSet(bill, barcode); onClose(); }}><u>S</u>et</button>}
            <button type="button" style={winBtn(false)} onClick={onClose}><u>C</u>lose</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DocTab({ title, doc, setDoc, isTax, bn }) {
  const set = (k, v) => setDoc({ ...doc, [k]: v });
  return (
    <>
      <Group title={bn ? `${title} — প্রিন্ট অপশন` : `Print Options for ${title}`}>
        <Check checked={doc.preprinted} onChange={(v) => set("preprinted", v)}>
          {bn ? "আগে থেকে ছাপানো প্যাড (Pre-printed form) ব্যবহার করি — দোকানের নাম/ঠিকানা প্রিন্ট হবে না" : "Tick if Pre-Printed form is used (company information is not printed)"}
        </Check>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>{bn ? "কয়টা কপি প্রিন্ট হবে:" : "No. of Copies to Print :"}</span>
          <input type="number" min={1} max={10} value={doc.copies}
            onChange={(e) => set("copies", Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1)))}
            style={{ width: 70, height: 26, border: "1px solid #8797a9", textAlign: "right", fontFamily: font, fontSize: 13, padding: "0 6px" }} />
        </div>
      </Group>
      <Group title={bn ? "প্রিন্ট সেটিংস" : "Windows Print Settings"}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, minWidth: 80 }}>{bn ? "কাগজের মাপ:" : "Paper Size :"}</span>
          <select value={doc.paper} onChange={(e) => set("paper", e.target.value)}
            style={{ flex: 1, height: 28, border: "1px solid #8797a9", fontFamily: font, fontSize: 13, background: "#fff" }}>
            {PAPER_SIZES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <PaperPreview paper={doc.paper} />
          <div style={{ flex: "1 1 180px", minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{bn ? "ইনভয়েসের ভাষা" : "Invoice Language"}</div>
            <div style={{ border: "1px solid #8797a9", background: "#fff" }}>
              {[["app", bn ? "অ্যাপের ভাষা অনুযায়ী" : "Same as app"], ["en", "English Only"], ["bn", "বাংলা (Bangla Only)"]].map(([k, label]) => (
                <button key={k} type="button" onClick={() => set("language", k)}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "5px 8px", border: 0, fontFamily: font, fontSize: 13, cursor: "pointer", background: doc.language === k ? "#0a64d8" : "#fff", color: doc.language === k ? "#fff" : C.text }}>
                  {label}
                </button>
              ))}
            </div>
            {isTax && (
              <div style={{ marginTop: 10 }}>
                <Check checked={doc.hideVatDiscCols} onChange={(v) => set("hideVatDiscCols", v)}>
                  {bn ? "VAT ও ছাড়ের কলাম লুকান, মোট VAT ও মোট ছাড় নিচে দেখান" : "Hide VAT and Discount Columns and Print Total VAT and Total Discount in the Bottom"}
                </Check>
              </div>
            )}
          </div>
        </div>
      </Group>
    </>
  );
}

function DesignPreview({ html }) {
  return (
    <div style={{ width: 410, height: 560, overflow: "hidden", background: "#fff", border: `1px solid ${C.border}`, flexShrink: 0, position: "relative" }}>
      <iframe title="preview" srcDoc={html.replace("</head>", "<style>.no-print{display:none!important}body{padding:10px!important}</style></head>")} sandbox=""
        style={{ width: 820, height: 1120, border: 0, transform: "scale(0.5)", transformOrigin: "0 0", pointerEvents: "none" }} />
    </div>
  );
}

function DesignTab({ bn, design, setDesign, previewHtml, onOpenDesigner }) {
  const [doc, setDoc] = useState("invoice");
  const style = design.style[doc];
  const layout = design.layout[doc];
  const setStyle = (k, v) => setDesign((d) => ({ ...d, style: { ...d.style, [doc]: { ...d.style[doc], [k]: v } } }));
  const tpl = TEMPLATES.find((t) => t.key === style.template) || TEMPLATES[0];

  const uploadLogo = async (file) => {
    if (!file) return;
    try { setStyle("logo", await imageFileToDataUrl(file, { maxW: 400, type: "image/png" })); }
    catch { alert(bn ? "ছবিটা পড়া যায়নি" : "Could not read the image"); }
  };
  const copyToAll = () => setDesign((d) => {
    const s = { ...d.style };
    DESIGN_DOCS.forEach(({ key }) => { s[key] = { ...d.style[doc] }; });
    return { ...d, style: s };
  });

  const html = layout.enabled
    ? renderLayoutDocument(layout, doc, { ...SAMPLE_DATA[doc], logo: style.logo }, { bn })
    : previewHtml?.(doc, style) || "";

  return (
    <>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {DESIGN_DOCS.map((d) => (
          <button key={d.key} type="button" onClick={() => setDoc(d.key)}
            style={{ ...winBtn(doc === d.key), minWidth: 0, background: doc === d.key ? "#0a64d8" : winBtn(false).background, color: doc === d.key ? "#fff" : C.text }}>
            {bn ? d.bn : d.en}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 360px", minWidth: 0 }}>
          <Group title={bn ? "পুরো ডিজাইন নিজের মতো (Designer / Pre-printed)" : "Custom layout (Designer / Pre-printed)"}>
            <div style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 8 }}>
              {layout.enabled
                ? <b style={{ color: "#15803d" }}>✅ {bn ? `চালু — ${layout.preprinted ? "Pre-printed কাগজে শুধু তথ্য" : "নিজের বানানো ডিজাইন"} প্রিন্ট হচ্ছে` : `On — printing ${layout.preprinted ? "data only on pre-printed paper" : "your own layout"}`}</b>
                : (bn ? "বন্ধ — নিচের রেডিমেড টেমপ্লেট দিয়ে প্রিন্ট হচ্ছে।" : "Off — the ready-made template below is used.")}
            </div>
            <button type="button" style={{ ...winBtn(true), minWidth: 180 }} onClick={() => onOpenDesigner(doc)}>
              🧩 {bn ? "ডিজাইনার খুলুন" : "Open Designer"}
            </button>
            <div style={{ fontSize: 11, color: "#374151", marginTop: 6, lineHeight: 1.45 }}>
              {bn
                ? "কাগজের উপর নাম, তারিখ, আইটেম টেবিল, টোটাল — যেটা যেখানে চান মাউস দিয়ে বসান। আগে থেকে ছাপানো প্যাড থাকলে \"Pre-printed\" টিক দিন — তখন শুধু কাস্টমারের তথ্য প্রিন্ট হবে।"
                : "Place name, date, item table, totals anywhere on the paper. For a pre-printed pad tick \"Pre-printed\" so only the data is printed."}
            </div>
          </Group>

          <Group title={bn ? "রেডিমেড টেমপ্লেট" : "Ready-made template"}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(96px,1fr))", gap: 6, opacity: layout.enabled ? 0.5 : 1 }}>
              {TEMPLATES.map((t) => (
                <button key={t.key} type="button" onClick={() => setStyle("template", t.key)}
                  style={{ padding: 5, border: style.template === t.key ? "2px solid #0a64d8" : `1px solid ${C.border}`, background: "#fff", cursor: "pointer", fontFamily: font, fontSize: 11, textAlign: "center" }}>
                  <div style={{ height: 44, border: "1px solid #d1d5db", marginBottom: 4, display: "flex", flexDirection: "column" }}>
                    <div style={{ height: 12, background: t.sample[0], borderBottom: `2px solid ${t.sample[2]}` }} />
                    <div style={{ flex: 1, background: t.sample[1], padding: 3, display: "grid", gap: 2 }}>
                      <div style={{ height: 3, background: "#d1d5db" }} /><div style={{ height: 3, background: "#e5e7eb" }} /><div style={{ height: 4, width: "45%", justifySelf: "end", background: t.sample[2] }} />
                    </div>
                  </div>
                  {bn ? t.bn : t.en}
                </button>
              ))}
            </div>
          </Group>

          <Group title={bn ? "রং, লোগো, লেখা" : "Colour, logo, text"}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, fontWeight: 700, minWidth: 70 }}>{bn ? "মূল রং:" : "Colour:"}</span>
              <input type="color" value={style.accent || tpl.accent || "#16a34a"} onChange={(e) => setStyle("accent", e.target.value)} style={{ width: 44, height: 26, border: "1px solid #8797a9", padding: 0 }} />
              {style.accent && <button type="button" style={{ ...winBtn(false), minWidth: 0 }} onClick={() => setStyle("accent", "")}>{bn ? "ডিফল্ট" : "Default"}</button>}
              <span style={{ fontSize: 12, fontWeight: 700, marginLeft: 8 }}>{bn ? "লেখার সাইজ:" : "Text size:"}</span>
              <input type="range" min={80} max={130} step={5} value={style.fontScale} onChange={(e) => setStyle("fontScale", parseInt(e.target.value, 10))} />
              <span style={{ fontSize: 12 }}>{style.fontScale}%</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, fontWeight: 700, minWidth: 70 }}>{bn ? "লোগো:" : "Logo:"}</span>
              {style.logo && <img src={style.logo} alt="" style={{ height: 32, maxWidth: 100, objectFit: "contain", background: "#fff", border: "1px solid #d1d5db" }} />}
              <label style={{ ...winBtn(false), minWidth: 0, display: "inline-block" }}>
                {style.logo ? (bn ? "বদলান" : "Change") : (bn ? "লোগো দিন" : "Upload")}
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { uploadLogo(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
              {style.logo && (
                <>
                  <button type="button" style={{ ...winBtn(false), minWidth: 0 }} onClick={() => setStyle("logo", "")}>✕</button>
                  <input type="range" min={30} max={110} value={style.logoSize} onChange={(e) => setStyle("logoSize", parseInt(e.target.value, 10))} title={bn ? "লোগোর সাইজ" : "Logo size"} />
                </>
              )}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 3 }}>{bn ? "দোকানের নামের নিচে লেখা (যেমন: সব ধরনের গাড়ির পার্টস পাওয়া যায়)" : "Text under shop name (e.g. dealer of all spare parts)"}</div>
            <textarea rows={2} value={style.headerNote} onChange={(e) => setStyle("headerNote", e.target.value)} style={{ width: "100%", boxSizing: "border-box", border: "1px solid #8797a9", fontFamily: font, fontSize: 12, padding: 4, marginBottom: 8 }} />
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 3 }}>{bn ? "নিচের লেখা / শর্তাবলী (খালি রাখলে ডিফল্ট)" : "Footer / terms (blank = default)"}</div>
            <textarea rows={2} value={style.footerText} onChange={(e) => setStyle("footerText", e.target.value)} style={{ width: "100%", boxSizing: "border-box", border: "1px solid #8797a9", fontFamily: font, fontSize: 12, padding: 4 }} />
            <Check checked={style.showSignatures} onChange={(v) => setStyle("showSignatures", v)}>{bn ? "স্বাক্ষরের জায়গা প্রিন্ট করো" : "Print signature lines"}</Check>
            <button type="button" style={{ ...winBtn(false), marginTop: 6 }} onClick={copyToAll}>
              {bn ? "এই ডিজাইন সব প্রিন্টে লাগাও" : "Use this style for all documents"}
            </button>
          </Group>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{bn ? "নমুনা (লাইভ প্রিভিউ)" : "Live preview"}</div>
          <DesignPreview html={html} />
        </div>
      </div>
    </>
  );
}

export default function PrintSettingsWindow({ lang, onClose, showCode, setShowCode, colorPrint, setColorPrint, isDesktop, toast, previewHtml }) {
  const bn = lang === "bn";
  const [tab, setTab] = useState("general");
  const [draft, setDraft] = useState(loadPrintSettings);
  const [hideCode, setHideCode] = useState(!showCode);
  const [color, setColor] = useState(!!colorPrint);
  const [setupOpen, setSetupOpen] = useState(false);
  const [design, setDesign] = useState(loadPrintDesign);
  const [designerDoc, setDesignerDoc] = useState(null);
  useEscapeKey(onClose, { level: 3 });

  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const apply = () => {
    savePrintSettings(draft);
    setShowCode?.(!hideCode);
    setColorPrint?.(color);
    const stored = loadPrintDesign();
    if (!savePrintDesign({ ...stored, style: design.style })) {
      toast?.(bn ? "⚠️ ডিজাইন সেভ হয়নি — লোগো/ছবি অনেক বড়" : "⚠️ Design not saved — logo/image too large", "err");
      return;
    }
    toast?.(bn ? "✅ প্রিন্ট সেটিংস সেভ হয়েছে" : "✅ Print settings saved");
  };
  const saveLayout = (kind, layout) => {
    const stored = loadPrintDesign();
    if (!savePrintDesign({ ...stored, layout: { ...stored.layout, [kind]: layout } })) {
      toast?.(bn ? "⚠️ সেভ হয়নি — প্যাডের ছবি অনেক বড়, ছোট ছবি দিন" : "⚠️ Not saved — form image too large", "err");
      return false;
    }
    setDesign((d) => ({ ...d, layout: { ...d.layout, [kind]: layout } }));
    toast?.(bn ? "✅ ডিজাইন সেভ হয়েছে" : "✅ Layout saved");
    return true;
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 5000, background: "rgba(10,25,55,0.45)", display: "flex", alignItems: isDesktop ? "center" : "stretch", justifyContent: "center", padding: isDesktop ? 12 : 0 }}>
      <div style={{ width: isDesktop ? (tab === "design" ? "min(980px, 100%)" : "min(560px, 100%)") : "100%", maxHeight: "100%", display: "flex", flexDirection: "column", background: C.bg, border: `1px solid ${C.bar}`, boxShadow: "0 18px 44px rgba(2,6,23,0.5)", fontFamily: font, color: C.text }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 6px 5px 10px", background: "linear-gradient(180deg,#3f69bd,#2854ad)", color: "#fff", fontWeight: 700, fontSize: 13 }}>
          <span>🖨️ {bn ? "প্রিন্ট সেটিংস (Print Settings)" : "Print Settings"}</span>
          <button type="button" onClick={onClose} title={bn ? "বন্ধ করুন (Esc)" : "Close (Esc)"}
            style={{ width: 30, height: 22, border: "1px solid #e8806f", borderRadius: 3, background: "#c42b1c", color: "#fff", fontWeight: 900, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ padding: "10px 10px 0", overflowY: "auto", flex: 1 }}>
          <div style={{ display: "flex", flexWrap: "wrap" }}>
            <button type="button" style={tabBtn(tab === "general")} onClick={() => setTab("general")}>{bn ? "সাধারণ" : "General"}</button>
            <button type="button" style={tabBtn(tab === "retail")} onClick={() => setTab("retail")}>{bn ? "রিটেইল ইনভয়েস" : "Retail Invoice"}</button>
            <button type="button" style={tabBtn(tab === "tax")} onClick={() => setTab("tax")}>{bn ? "ট্যাক্স ইনভয়েস" : "Tax Invoice"}</button>
            <button type="button" style={tabBtn(tab === "design")} onClick={() => setTab("design")}>🎨 {bn ? "ডিজাইন" : "Design"}</button>
          </div>
          <div style={{ border: `1px solid ${C.border}`, background: C.panel, padding: 10 }}>
            {tab === "general" && (
              <>
                <Group title={bn ? "প্রিন্টার" : "Printers"}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ flex: "1 1 220px", minWidth: 0, fontSize: 12, lineHeight: 1.6 }}>
                      <div>🧾 {bn ? "বিল:" : "Bill:"} <b>{draft.billPrinter || (bn ? "প্রতিবার জিজ্ঞেস করবে" : "Ask every time")}</b></div>
                      <div>🏷️ {bn ? "বারকোড:" : "Barcode:"} <b>{draft.barcodePrinter || (bn ? "প্রতিবার জিজ্ঞেস করবে" : "Ask every time")}</b></div>
                    </div>
                    <button type="button" style={{ ...winBtn(true), minWidth: 130 }} onClick={() => setSetupOpen(true)}>
                      {bn ? "প্রিন্টার সেটআপ" : "Printer Setup"}
                    </button>
                  </div>
                </Group>
                <Group title={bn ? "সাধারণ সেটিংস" : "General Settings"}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, minWidth: 70 }}>{bn ? "বিলের ধরন:" : "Bill Type :"}</span>
                    <select value={draft.defaultBillType} onChange={(e) => set("defaultBillType", e.target.value)}
                      style={{ flex: 1, height: 28, border: "1px solid #8797a9", fontFamily: font, fontSize: 13, background: "#fff" }}>
                      <option value="tax">{bn ? "ট্যাক্স ইনভয়েস (Tax Invoice)" : "Tax Invoice"}</option>
                      <option value="regular">{bn ? "রিটেইল ইনভয়েস (Retail Invoice)" : "Retail Invoice"}</option>
                    </select>
                  </div>
                  <Check checked={draft.showPreview} onChange={(v) => set("showPreview", v)}>
                    {bn ? "প্রিন্টের আগে বিল দেখাও (Show Bill Preview)" : "Show Bill Preview"}
                  </Check>
                  <Check checked={hideCode} onChange={setHideCode}>
                    {bn ? "বিলে পণ্যের Code/Model/Brand প্রিন্ট করবে না" : "Don't Print Code/Model/Size in the Bill"}
                  </Check>
                  <Check checked={draft.printVatSummary} onChange={(v) => set("printVatSummary", v)}>
                    {bn ? "বিলে VAT সারাংশ প্রিন্ট করো" : "Print VAT Summary in Bill"}
                  </Check>
                  <Check checked={color} onChange={setColor}>
                    {bn ? "রঙিন হেডার দিয়ে প্রিন্ট করো" : "Print with Color Header"}
                  </Check>
                </Group>
                <Group title={bn ? "বিলে কী কী প্রিন্ট হবে" : "Print in Bill"}>
                  <Check checked={draft.printSalesman} onChange={(v) => set("printSalesman", v)}>{bn ? "বিক্রেতা/Salesman-এর নাম" : "Print Name of Salesman/Executive in Bill"}</Check>
                  <Check checked={draft.printCustomerBalance} onChange={(v) => set("printCustomerBalance", v)}>{bn ? "বাকির বিলে কাস্টমারের মোট বাকি" : "Print total Credit Balance of Customer in Credit Bill"}</Check>
                  <Check checked={draft.printCreditPeriod} onChange={(v) => set("printCreditPeriod", v)}>{bn ? "বাকির মেয়াদ (Credit Period)" : "Print Credit Period in Bill"}</Check>
                  <Check checked={draft.printUserName} onChange={(v) => set("printUserName", v)}>{bn ? "যে ইউজার বিল বানিয়েছে তার নাম" : "Print User name in Bill"}</Check>
                  <Check checked={draft.printNarration} onChange={(v) => set("printNarration", v)}>{bn ? "বিলের নোট (Narration)" : "Print Sales Narration in Bill"}</Check>
                  <Check checked={draft.printTime} onChange={(v) => set("printTime", v)}>{bn ? "বিলের সময়" : "Print Time in Bill"}</Check>
                </Group>
                <div style={{ fontSize: 11, color: "#374151", lineHeight: 1.45 }}>
                  {bn
                    ? "🖨️ এই সেটিংস আর ডিজাইন এই ডিভাইসেই থাকে — অন্য পিসিতে আলাদা করে সেট করতে হবে।"
                    : "🖨️ These settings and designs are saved on this device — set them separately on each PC."}
                </div>
              </>
            )}
            {tab === "retail" && (
              <DocTab title={bn ? "রিটেইল ইনভয়েস" : "Retail Invoice"} bn={bn} isTax={false}
                doc={draft.retail} setDoc={(d) => set("retail", d)} />
            )}
            {tab === "tax" && (
              <DocTab title={bn ? "ট্যাক্স ইনভয়েস" : "Tax Invoice"} bn={bn} isTax
                doc={draft.tax} setDoc={(d) => set("tax", d)} />
            )}
            {tab === "design" && (
              <DesignTab bn={bn} design={design} setDesign={setDesign} previewHtml={previewHtml} onOpenDesigner={setDesignerDoc} />
            )}
          </div>
        </div>

        {designerDoc && (
          <PrintDesigner kind={designerDoc} layout={design.layout[designerDoc]} lang={lang} logo={design.style[designerDoc]?.logo || ""}
            onSave={(layout) => saveLayout(designerDoc, layout)} onClose={() => setDesignerDoc(null)} />
        )}

        {setupOpen && (
          <PrinterSetup bn={bn} billPrinter={draft.billPrinter} barcodePrinter={draft.barcodePrinter}
            onClose={() => setSetupOpen(false)}
            onSet={(billPrinter, barcodePrinter) => {
              const next = { ...draft, billPrinter, barcodePrinter };
              setDraft(next);
              savePrintSettings({ ...loadPrintSettings(), billPrinter, barcodePrinter });
              toast?.(bn ? "✅ প্রিন্টার সেট হয়েছে" : "✅ Printers set");
            }} />
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: 10 }}>
          <button type="button" style={winBtn(true)} onClick={() => { apply(); onClose(); }}>OK</button>
          <button type="button" style={winBtn(false)} onClick={onClose}>{bn ? "বাতিল" : "Cancel"}</button>
          <button type="button" style={winBtn(false)} onClick={apply}>{bn ? "প্রয়োগ" : "Apply"}</button>
        </div>
      </div>
    </div>
  );
}
