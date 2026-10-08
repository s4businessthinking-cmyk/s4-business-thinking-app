import { useEffect, useRef, useState } from "react";
import { convertCurrency, tryEvaluate } from "./calc.js";

const HISTORY_KEY = "s4_calc_history";
const RATES_KEY = "s4_fx_rates";
const readJson = (k, fb) => { try { return JSON.parse(localStorage.getItem(k) || "") ?? fb; } catch { return fb; } };
const writeJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full */ } };
const fmt = (v) => (Number.isFinite(v) ? v.toLocaleString("en-US", { maximumFractionDigits: 6 }) : "");

const KEYS = [
  ["C", "(", ")", "÷"],
  ["7", "8", "9", "×"],
  ["4", "5", "6", "-"],
  ["1", "2", "3", "+"],
  ["%", "0", ".", "="],
];

export default function CalculatorWindow({ lang = "bn", baseCurrency = "AED", initialMode = "calc", onClose, inline = false }) {
  const L = (bn, en) => (lang === "bn" ? bn : en);
  const [mode, setMode] = useState(initialMode);
  const [expr, setExpr] = useState("");
  const [history, setHistory] = useState(() => readJson(HISTORY_KEY, []));
  const [rates, setRates] = useState(() => ({ [baseCurrency]: 1, USD: "", ...readJson(RATES_KEY, {}), [baseCurrency]: 1 }));
  const [amount, setAmount] = useState("");
  const [from, setFrom] = useState(baseCurrency);
  const [to, setTo] = useState("USD");
  const [newCur, setNewCur] = useState("");
  const inputRef = useRef(null);

  useEffect(() => { setMode(initialMode); }, [initialMode]);
  useEffect(() => { if (mode === "calc") inputRef.current?.focus(); }, [mode]);
  useEffect(() => {
    if (inline) return undefined;
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose?.(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, inline]);

  const live = tryEvaluate(expr);
  const commit = () => {
    const r = tryEvaluate(expr);
    if (!r.ok || !expr.trim()) return;
    const next = [{ expr, value: r.value }, ...history.filter((h) => h.expr !== expr)].slice(0, 12);
    setHistory(next); writeJson(HISTORY_KEY, next);
    setExpr(String(r.value));
  };
  const press = (k) => {
    if (k === "C") setExpr("");
    else if (k === "=") commit();
    else setExpr((x) => x + k);
    inputRef.current?.focus();
  };
  const copy = (v) => { try { navigator.clipboard?.writeText(String(v)); } catch { /* not allowed */ } };

  const saveRates = (next) => { setRates(next); const { [baseCurrency]: _b, ...rest } = next; writeJson(RATES_KEY, rest); };
  const curList = Object.keys(rates);
  const converted = convertCurrency(amount === "" ? NaN : tryEvaluate(amount).value, Number(rates[from]), Number(rates[to]));

  const box = { ...(inline ? { position: "relative", margin: "16px auto", maxWidth: 360 } : { position: "fixed", right: 16, bottom: 16, width: 300, zIndex: 9000 }), background: "#fff", color: "#0f172a", borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,.35)", border: "1px solid #cbd5e1", fontFamily: "inherit" };
  const tabBtn = (k, label) => (
    <button type="button" onClick={() => setMode(k)} style={{ flex: 1, padding: "6px 0", border: 0, borderBottom: mode === k ? "2px solid #2563eb" : "2px solid transparent", background: "none", fontWeight: 700, color: mode === k ? "#2563eb" : "#475569", cursor: "pointer" }}>{label}</button>
  );
  const keyBtn = (k) => (
    <button key={k} type="button" onClick={() => press(k)} style={{
      padding: "10px 0", fontSize: 16, fontWeight: 700, borderRadius: 8, cursor: "pointer",
      border: "1px solid #e2e8f0", background: k === "=" ? "#2563eb" : /[0-9.]/.test(k) ? "#fff" : "#f1f5f9", color: k === "=" ? "#fff" : k === "C" ? "#b91c1c" : "#0f172a",
    }}>{k}</button>
  );
  const inp = { width: "100%", padding: "6px 8px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 14, boxSizing: "border-box" };

  return (
    <div style={box} role="dialog" aria-label="Calculator">
      <div style={{ display: "flex", alignItems: "center", padding: "6px 8px 0" }}>
        {tabBtn("calc", `🧮 ${L("ক্যালকুলেটর", "Calculator")}`)}
        {tabBtn("fx", `💱 ${L("মুদ্রা", "Currency")}`)}
        {!inline && <button type="button" onClick={onClose} title="Esc" style={{ border: 0, background: "none", fontSize: 18, cursor: "pointer", color: "#64748b", padding: "0 4px" }}>✕</button>}
      </div>
      {mode === "calc" ? (
        <div style={{ padding: 10 }}>
          <input ref={inputRef} value={expr} onChange={(e) => setExpr(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === "=") { e.preventDefault(); commit(); } }}
            placeholder="0" style={{ ...inp, fontSize: 18, textAlign: "right", fontFamily: "monospace" }} />
          <div style={{ textAlign: "right", fontSize: 22, fontWeight: 800, minHeight: 30, margin: "4px 0", color: live.ok ? "#0f172a" : "#94a3b8", cursor: "copy" }}
            title={L("কপি করতে ক্লিক করুন", "Click to copy")} onClick={() => live.ok && copy(live.value)}>
            {expr.trim() ? (live.ok ? `= ${fmt(live.value)}` : "…") : ""}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>{KEYS.flat().map(keyBtn)}</div>
          {history.length > 0 && (
            <div style={{ marginTop: 8, maxHeight: 110, overflowY: "auto", borderTop: "1px solid #e2e8f0", paddingTop: 4 }}>
              {history.map((h, i) => (
                <button key={i} type="button" onClick={() => setExpr(h.expr)} style={{ display: "flex", justifyContent: "space-between", width: "100%", border: 0, background: "none", padding: "2px 0", fontSize: 12, color: "#475569", cursor: "pointer", fontFamily: "monospace" }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 170 }}>{h.expr}</span><b>{fmt(h.value)}</b>
                </button>
              ))}
            </div>
          )}
          <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 6 }}>{L("কীবোর্ড: Ctrl+F12 খুলুন/বন্ধ · Enter = হিসাব · Esc বন্ধ · 200+10% = 220", "Keys: Ctrl+F12 open/close · Enter = result · Esc close · 200+10% = 220")}</div>
        </div>
      ) : (
        <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={L("টাকার পরিমাণ", "Amount")} inputMode="decimal" style={{ ...inp, fontSize: 18, textAlign: "right" }} />
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <select value={from} onChange={(e) => setFrom(e.target.value)} style={inp}>{curList.map((c) => <option key={c}>{c}</option>)}</select>
            <button type="button" onClick={() => { setFrom(to); setTo(from); }} style={{ border: "1px solid #cbd5e1", background: "#f1f5f9", borderRadius: 6, cursor: "pointer", padding: "6px 8px" }}>⇄</button>
            <select value={to} onChange={(e) => setTo(e.target.value)} style={inp}>{curList.map((c) => <option key={c}>{c}</option>)}</select>
          </div>
          <div style={{ textAlign: "right", fontSize: 22, fontWeight: 800, minHeight: 30, cursor: "copy" }} onClick={() => converted != null && copy(converted)}>
            {converted != null ? `${fmt(converted)} ${to}` : <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 400 }}>{L("নিচে রেট দিন", "Enter the rates below")}</span>}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", borderTop: "1px solid #e2e8f0", paddingTop: 6 }}>
            {L(`রেট: ১ ইউনিট = কত ${baseCurrency}`, `Rates: 1 unit = how many ${baseCurrency}`)}
          </div>
          <div style={{ maxHeight: 150, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {curList.map((c) => (
              <div key={c} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <b style={{ width: 44, fontSize: 12 }}>{c}</b>
                <input value={rates[c]} disabled={c === baseCurrency} inputMode="decimal" onChange={(e) => saveRates({ ...rates, [c]: e.target.value })} style={{ ...inp, padding: "4px 6px", fontSize: 12 }} />
                {c !== baseCurrency && <button type="button" onClick={() => { const { [c]: _x, ...rest } = rates; saveRates(rest); if (from === c) setFrom(baseCurrency); if (to === c) setTo(baseCurrency); }} style={{ border: 0, background: "none", color: "#b91c1c", cursor: "pointer" }}>✕</button>}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input value={newCur} onChange={(e) => setNewCur(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4))} placeholder={L("নতুন মুদ্রা (যেমন BDT)", "New currency (e.g. BDT)")} style={{ ...inp, padding: "4px 6px", fontSize: 12 }} />
            <button type="button" disabled={!newCur || rates[newCur] !== undefined} onClick={() => { saveRates({ ...rates, [newCur]: "" }); setNewCur(""); }} style={{ border: "1px solid #2563eb", background: "#2563eb", color: "#fff", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>＋</button>
          </div>
          <div style={{ fontSize: 10, color: "#94a3b8" }}>{L("রেট এই ডিভাইসে সেভ থাকে। Shift+F12 দিয়ে সরাসরি খোলে।", "Rates stay on this device. Shift+F12 opens this directly.")}</div>
        </div>
      )}
    </div>
  );
}
