import { useState, useEffect, useRef } from "react";
import { query, collection, where, onSnapshot } from "../backend/firestore";
import { db } from "../firebase-config";
import { offlinePatch, offlineList, offlineGetById } from "../offline/offlineRepository";
import { printHtmlDocument, loadPrintSettings, canPickPrinter, printWithSettings } from "../print/printSettings.js";
import { chequeVoucherHtml, chequeHandoverHtml, chequeAmountOfVoucher } from "../vouchers/chequeDocs.js";
import { loadHandoverDocs } from "../vouchers/chequeHandoverStore.js";
import { useFirebaseAuthReady } from "../auth/useFirebaseAuthReady.js";
import { localIsoDate } from "../utils/localIsoDate.js";
import { UAE_BANKS, amountToWordsAED, CHEQUE_POSITIONS, DATE_FORMAT_OPTIONS, getChequeTemplateDefault } from "./chequeConfig.js";

// ─── CHEQUE PRINTER TAB ───────────────────────────────────────────────────────
export default function ChequePrinterTab({ t, lang, th, s, isDesktop, shopName, shopAccount, shopIban, shopId, user, shop, prefill=null, onPrefillDone, onOpenHandover, syncRefreshKey=0, foldersVisible=false, onUnlockFolders, onLockFolders }) {
  const [bank, setBank]         = useState(UAE_BANKS[0]);
  const [linkedVoucher, setLinkedVoucher] = useState(null);
  const [vendorCheques, setVendorCheques] = useState([]);
  const [openFolder, setOpenFolder]       = useState(null);
  const [folderSearch, setFolderSearch]   = useState("");
  const authSyncReady = useFirebaseAuthReady();
  const [payee, setPayee]       = useState("");
  const [amount, setAmount]     = useState("");
  const [words, setWords]       = useState("");
  const [wordsManual, setWordsManual] = useState(false);
  const [dateVal, setDateVal]   = useState(() => localIsoDate());
  const [showBankList, setShowBankList] = useState(false);

  // ── Per-field calibration offsets (mm) + page size ────────────────────────
  // Each field has independent X (left/right) and Y (up/down) offset
  const [payeeX, setPayeeX] = useState(0);   // Pay-to name → left/right
  const [payeeY, setPayeeY] = useState(0);   // Pay-to name → up/down
  const [wordsX, setWordsX] = useState(0);   // Amount words → left/right
  const [wordsY, setWordsY] = useState(0);   // Amount words → up/down
  const [amtX,   setAmtX]   = useState(0);   // Amount number → left/right
  const [amtY,   setAmtY]   = useState(0);   // Amount number → up/down
  const [dateX,  setDateX]  = useState(0);   // Date DD → left/right (all move together)
  const [dateY,  setDateY]  = useState(0);   // Date → up/down
  const [mmOff,  setMmOff]  = useState(0);   // MM gap from DD (positive = more right)
  const [yyOff,  setYyOff]  = useState(0);   // YYYY gap from MM (positive = more right)
  const [pageW,  setPageW]  = useState(196); // Page width  mm — ADCB cheque measured
  const [pageH,  setPageH]  = useState(99);  // Page height mm — ADCB cheque measured
  const [dateMode, setDateMode] = useState("slash"); // slash/dot/dash/space/box
  const [saveDone, setSaveDone] = useState(false);

  const applyTemplateValues = (o) => {
    const d = getChequeTemplateDefault(bank.id);
    const v = { ...d, ...(o || {}) };
    setPayeeX(Number(v.px) || 0); setPayeeY(Number(v.py) || 0);
    setWordsX(Number(v.wx) || 0); setWordsY(Number(v.wy) || 0);
    setAmtX(Number(v.ax) || 0);   setAmtY(Number(v.ay) || 0);
    setDateX(Number(v.dx) || 0);  setDateY(Number(v.dy) || 0);
    setMmOff(Number(v.mo) || 0);  setYyOff(Number(v.yo) || 0);
    setPageW(Number(v.w) || d.w); setPageH(Number(v.h) || d.h);
    setDateMode(DATE_FORMAT_OPTIONS.some(x => x.id === v.dm) ? v.dm : d.dm);
  };

  const resetAll = () => {
    applyTemplateValues(getChequeTemplateDefault(bank.id));
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`chq_off2_${bank.id}`);
      if (saved) {
        applyTemplateValues(JSON.parse(saved));
      } else {
        applyTemplateValues(getChequeTemplateDefault(bank.id));
      }
    } catch(e) {
      applyTemplateValues(getChequeTemplateDefault(bank.id));
    }
  }, [bank.id]);

  const saveOffsets = () => {
    try {
      localStorage.setItem(`chq_off2_${bank.id}`, JSON.stringify({
        px:payeeX, py:payeeY,
        wx:wordsX, wy:wordsY,
        ax:amtX,   ay:amtY,
        dx:dateX,  dy:dateY,
        mo:mmOff,  yo:yyOff,
        w:pageW,   h:pageH,
        dm:dateMode,
      }));
      setSaveDone(true);
      setTimeout(() => setSaveDone(false), 2500);
    } catch(e) {
      alert(lang === "bn" ? "সেভ হয়নি — ব্রাউজার স্টোরেজ বন্ধ থাকতে পারে" : "Save failed — localStorage may be unavailable");
    }
  };

  // Helpers — step 1 mm per click
  const adj = (setter) => (d) => setter(v => +((v + d).toFixed(1)));

  // Auto-fill amount in words from numeric amount
  const normalizeChequeAmount = (v) => {
    const raw = String(v ?? "").replace(/[,\s]/g, "");
    const parts = raw.replace(/[^0-9.]/g, "").split(".");
    return parts.length > 1 ? `${parts[0]}.${parts.slice(1).join("")}` : parts[0];
  };

  const handleAmountChange = (v) => {
    const cleanAmount = normalizeChequeAmount(v);
    setAmount(cleanAmount);
    if (!wordsManual) {
      const n = parseFloat(cleanAmount);
      setWords(n > 0 ? amountToWordsAED(n) : "");
    }
  };
  const amountAtManualRef = useRef("");
  const printingRef = useRef(false);
  const handleWordsChange = (v) => { setWords(v); setWordsManual(true); amountAtManualRef.current = amount; };
  const handleAmountBlur = () => {
    if (amount !== amountAtManualRef.current) setWordsManual(false);
  };

  // Format number as AED amount for cheque: no comma, no spaces, always 2 decimals
  const fmtAmount = (v) => {
    const n = Number(normalizeChequeAmount(v));
    if (!Number.isFinite(n) || n <= 0) return "";
    return n.toFixed(2);
  };

  // Split date into parts
  const [yyyy, mm, dd] = dateVal ? dateVal.split("-") : ["", "", ""];

  // Final print positions = bank baseline + per-field user offsets
  const pos = CHEQUE_POSITIONS[bank.id] || CHEQUE_POSITIONS.default;
  const P = {
    payeeTop:   pos.payeeTop   + payeeY,
    payeeLeft:  pos.payeeLeft  + payeeX,
    payeeMaxW:  pos.payeeMaxW,
    amtTop:     pos.amtTop     + amtY,
    amtRight:   Math.max(1, pos.amtRight - amtX),
    wordsTop:   pos.wordsTop   + wordsY,
    wordsLeft:  pos.wordsLeft  + wordsX,
    wordsMaxW:  pos.wordsMaxW,
    dateTop:    pos.dateTop    + dateY,
    dateDDLeft: pos.dateDDLeft + dateX,
    dateMMLeft: pos.dateMMLeft + dateX + mmOff,   // MM gap adjustable
    dateYYLeft: pos.dateYYLeft + dateX + mmOff + yyOff,  // YYYY gap adjustable
  };

  // Shared styles
  const inp = {
    padding:"10px 12px", borderRadius:8,
    border:`1px solid ${th.borderMid}`,
    background:th.bgInp, color:th.txtPrimary,
    fontSize:14, outline:"none",
    width:"100%", boxSizing:"border-box", fontFamily:"inherit",
  };
  const lbl = {
    fontSize:11, color:th.txtMuted, fontWeight:700,
    textTransform:"uppercase", letterSpacing:0.4,
    marginBottom:4, display:"block",
  };
  const sec = {
    fontSize:12, fontWeight:700, color:th.accent,
    textTransform:"uppercase", letterSpacing:0,
    marginBottom:12, marginTop:4,
  };

  // Date render engine: supports slash, dot, dash, space, and box/digit mode per bank/user
  const selectedDateFormat = DATE_FORMAT_OPTIONS.find(x => x.id === dateMode) || DATE_FORMAT_OPTIONS[0];
  const chequeDateText = selectedDateFormat.id === "box"
    ? ""
    : `${dd}${selectedDateFormat.sep}${mm}${selectedDateFormat.sep}${yyyy}`;

  // ── Vendor-voucher cheques (only cheques printed from a payment voucher are listed) ──
  const mergeVendorCheques = (rows) => setVendorCheques(
    rows.filter(v => v && v.shopId === shopId && v.method === "cheque" && v.chequePrintedAt && v.status !== "cancelled")
      .sort((a,b) => String(b.chequePrintedAt).localeCompare(String(a.chequePrintedAt)))
  );
  useEffect(() => {
    if (!shopId || !foldersVisible) return undefined;
    let alive = true;
    offlineList("purchasePayments").then(res => {
      if (!alive) return;
      const rows = (Array.isArray(res) ? res : (res.records || [])).map(r => ({ ...(r.data || r), id:(r.data?.id || r.document_id || r.id) }));
      mergeVendorCheques(rows);
    }).catch(() => {});
    let unsub = null;
    if (authSyncReady) {
      unsub = onSnapshot(query(collection(db,"purchasePayments"), where("shopId","==",shopId)),
        snap => { if (alive) mergeVendorCheques(snap.docs.map(d => ({ ...d.data(), id:d.id }))); },
        err => console.warn("[Cheque] vendor cheque list failed", err));
    }
    return () => { alive = false; unsub?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId, authSyncReady, syncRefreshKey, foldersVisible]);

  const loadVoucherIntoForm = (v, { payee:p, amount:a, date, bankName } = {}) => {
    setPayee(p ?? v.vendorName ?? "");
    const amt = Number(a ?? (v.chequeAmount ?? v.totalAmount)) || 0;
    setAmount(amt > 0 ? amt.toFixed(2) : "");
    setWords(amt > 0 ? amountToWordsAED(amt) : "");
    setWordsManual(false);
    const d = date ?? v.chequeDate ?? v.paymentDate;
    if (d) setDateVal(String(d).slice(0,10));
    const bn = String(bankName ?? v.chequeBank ?? "").trim().toLowerCase();
    const matched = bn && UAE_BANKS.find(b => b.name.toLowerCase() === bn || b.short?.toLowerCase() === bn);
    if (matched) setBank(matched);
    setLinkedVoucher(v);
  };
  useEffect(() => {
    if (!prefill?.voucher) return;
    loadVoucherIntoForm(prefill.voucher, prefill);
    onPrefillDone?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  const markLinkedPrinted = async () => {
    if (!linkedVoucher?.id) return;
    try {
      const nowIso = new Date().toISOString();
      const local = await offlineGetById("purchasePayments", linkedVoucher.id);
      const base = local?.data || vendorCheques.find(v => v.id === linkedVoucher.id) || linkedVoucher;
      const patch = {
        chequePrintedAt: nowIso,
        chequePrintCount: (Number(base.chequePrintCount) || 0) + 1,
        updatedAt: nowIso, updatedBy: user?.uid || "",
      };
      const result = await offlinePatch("purchasePayments", linkedVoucher.id, patch, base);
      const updated = { ...base, ...result.data, id: linkedVoucher.id };
      setLinkedVoucher(updated);
      setVendorCheques(prev => [updated, ...prev.filter(v => v.id !== updated.id)]);
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] cheque print mark failed", err));
    } catch (e) { console.warn("[Cheque] mark printed failed", e); }
  };

  const chequeDocOpts = (v) => ({ cur: t.cur || "AED", amountWords: `${amountToWordsAED(chequeAmountOfVoucher(v))} Only` });

  // Printed from an isolated frame: printing the app window lets the hidden app
  // layout spill onto extra pages and makes the browser shrink the cheque to fit.
  const logStandaloneChequePrint = () => {
    if (linkedVoucher?.id || !shopId) return;
    const payeeTrim = String(payee || "").trim();
    const amt = parseFloat(normalizeChequeAmount(amount));
    if (!payeeTrim || !(amt > 0)) return;
    try {
      const key = `chq_standalone_log_${shopId}`;
      const prev = JSON.parse(localStorage.getItem(key) || "[]");
      const row = { payee: payeeTrim, amount: amt, bank: bank.name, date: dateVal, printedAt: new Date().toISOString() };
      localStorage.setItem(key, JSON.stringify([row, ...prev].slice(0, 200)));
    } catch { /* ignore */ }
  };

  const printCheque = () => {
    if (printingRef.current) return;
    const payeeTrim = String(payee || "").trim();
    const amt = parseFloat(normalizeChequeAmount(amount));
    if (!payeeTrim || !(amt > 0)) {
      alert(lang === "bn" ? "প্রাপকের নাম ও পরিমাণ দিন" : "Enter payee name and amount");
      return;
    }
    const reprintCount = Number(linkedVoucher?.chequePrintCount) || 0;
    if (reprintCount > 0) {
      const ok = window.confirm(
        lang === "bn"
          ? `এই ভাউচারের চেক আগে ${reprintCount} বার প্রিন্ট হয়েছে। আবার প্রিন্ট করবেন?`
          : `This voucher cheque was printed ${reprintCount} time(s) before. Print again?`
      );
      if (!ok) return;
    } else if (!linkedVoucher?.id) {
      const ok = window.confirm(
        lang === "bn"
          ? "ভাউচার লিংক ছাড়া চেক প্রিন্ট করলে শুধু স্থানীয় লগে থাকবে। চালিয়ে যাবেন?"
          : "Printing without a linked voucher is logged locally only. Continue?"
      );
      if (!ok) return;
    }
    printingRef.current = true;
    const area = document.getElementById("cheque-print-area");
    if (!area) { printingRef.current = false; return; }
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Cheque</title><style>
@page{size:${pageW}mm ${pageH}mm;margin:0}
html,body{margin:0;padding:0;background:transparent}
#cheque{position:relative;width:${pageW}mm;height:${pageH}mm;overflow:hidden}
#cheque>div{position:absolute}
</style></head><body><div id="cheque">${area.innerHTML}</div></body></html>`;
    logStandaloneChequePrint();
    markLinkedPrinted();
    const releasePrintLock = () => { setTimeout(() => { printingRef.current = false; }, 800); };
    if (window.Capacitor?.isNativePlatform?.()) { printHtmlDocument(html, { preview:true, lang }); releasePrintLock(); return; }
    const chequePrinter = loadPrintSettings().chequePrinter;
    if (chequePrinter && canPickPrinter()) {
      printHtmlDocument(html, { preview:false, lang, printer:chequePrinter, pageSizeMm:{ width:pageW, height:pageH } });
      releasePrintLock();
      return;
    }
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    doc.open();
    doc.write(html);
    doc.close();
    const cleanup = () => { setTimeout(() => frame.remove(), 1000); releasePrintLock(); };
    frame.contentWindow.addEventListener("afterprint", cleanup, { once:true });
    setTimeout(() => {
      try {
        frame.contentWindow.focus();
        frame.contentWindow.print();
      } catch (e) {
        console.error("[Cheque] print failed", e);
        frame.remove();
        releasePrintLock();
      }
    }, 150);
  };

  const previewDateBoxes = () => {
    if (dateMode === "box") {
      return (
        <div style={{ display:"flex", gap:8, alignItems:"center", fontFamily:"'Courier New', Courier, monospace", fontSize:16, fontWeight:800, color:"#000" }}>
          <span style={{ letterSpacing:"0.18em" }}>{dd}</span>
          <span style={{ letterSpacing:"0.18em" }}>{mm}</span>
          <span style={{ letterSpacing:"0.18em" }}>{yyyy}</span>
        </div>
      );
    }
    return (
      <div style={{
        fontSize:16,
        fontWeight:800,
        fontFamily:"'Courier New', Courier, monospace",
        color:"#000",
        letterSpacing:0,
        wordSpacing:0,
        whiteSpace:"nowrap",
        lineHeight:1,
      }}>
        {chequeDateText}
      </div>
    );
  };

  return (
    <div style={isDesktop ? s.desktopPanel : s.panel}>

      {/* ── PAGE HEADER ── */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16, flexWrap:"wrap", gap:10 }}>
        <div style={s.secTitle}>
          {lang==="bn" ? "🖨️ UAE ব্যাংক চেক প্রিন্টার" : "🖨️ UAE Bank Cheque Printer"}
        </div>
        <div style={{ fontSize:11, color:th.txtMuted, background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:8, padding:"5px 10px" }}>
          {lang==="bn" ? "প্রিন্টারে চেক লিফ রেখে প্রিন্ট করুন" : "Place cheque leaf in printer then print"}
        </div>
      </div>

      <div style={{ display:"flex", flexDirection:isDesktop?"row":"column", gap:16, alignItems:"flex-start" }}>

        {/* ════════════════════════════════════════
            LEFT PANEL — Form
        ════════════════════════════════════════ */}
        <div style={{ flex:"0 0 300px", minWidth:0 }}>

          {/* ── Bank Selector ── */}
          <div style={{ ...s.card, border:`1px solid ${th.border}`, marginBottom:14 }}>
            <div style={sec}>🏦 {lang==="bn" ? "ব্যাংক বেছে নিন" : "Select Bank"}</div>
            <div
              onClick={() => setShowBankList(!showBankList)}
              style={{
                display:"flex", alignItems:"center", gap:10,
                padding:"10px 12px", borderRadius:8,
                border:`1px solid ${showBankList ? bank.color : th.borderMid}`,
                background:th.bgInp, cursor:"pointer", transition:"border-color 0.2s",
              }}
            >
              <div style={{
                width:36, height:36, borderRadius:8, background:bank.color,
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:9, fontWeight:800, color:"#fff", flexShrink:0,
                textAlign:"center", lineHeight:1.2,
              }}>
                {bank.short}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:700, color:th.txtPrimary }}>{bank.name}</div>
                <div style={{ fontSize:10, color:th.txtMuted }}>{bank.tag}</div>
              </div>
              <span style={{ fontSize:16, color:th.txtMuted }}>{showBankList ? "▲" : "▼"}</span>
            </div>

            {showBankList && (
              <div style={{ marginTop:8, maxHeight:260, overflowY:"auto", borderRadius:8, border:`1px solid ${th.border}`, background:th.bgCard }}>
                {UAE_BANKS.map(b => (
                  <button
                    key={b.id}
                    onClick={() => { setBank(b); setShowBankList(false); }}
                    style={{
                      width:"100%", textAlign:"left", padding:"9px 12px",
                      background:b.id===bank.id ? th.accentDim : "transparent",
                      border:"none", borderBottom:`1px solid ${th.border}`,
                      cursor:"pointer", fontFamily:"inherit",
                      display:"flex", alignItems:"center", gap:10,
                    }}
                  >
                    <div style={{
                      width:28, height:28, borderRadius:6, background:b.color,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:8, fontWeight:800, color:"#fff", flexShrink:0,
                      textAlign:"center", lineHeight:1.1,
                    }}>{b.short}</div>
                    <div>
                      <div style={{ fontSize:12, fontWeight:700, color:b.id===bank.id ? th.accent : th.txtPrimary }}>{b.name}</div>
                      <div style={{ fontSize:10, color:th.txtMuted }}>{b.swift}</div>
                    </div>
                    {b.id===bank.id && <span style={{ marginLeft:"auto", color:th.accent }}>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Cheque Details Form ── */}
          <div style={{ ...s.card, marginBottom:14 }}>
            <div style={sec}>📝 {lang==="bn" ? "চেকের তথ্য" : "Cheque Details"}</div>

            {/* Date */}
            <div style={{ marginBottom:10 }}>
              <span style={lbl}>{lang==="bn" ? "তারিখ" : "Date"}</span>
              <input
                style={inp} type="date" value={dateVal}
                onChange={e => setDateVal(e.target.value)}
              />
            </div>

            {/* Payee */}
            <div style={{ marginBottom:10 }}>
              <span style={lbl}>{lang==="bn" ? "প্রাপকের নাম (Pay to)" : "Pay to (Beneficiary)"}</span>
              <input
                style={inp}
                value={payee}
                onChange={e => setPayee(e.target.value)}
                placeholder={lang==="bn" ? "ব্যক্তি বা কোম্পানির নাম" : "Person or company name"}
              />
            </div>

            {/* Amount */}
            <div style={{ marginBottom:10 }}>
              <span style={lbl}>{lang==="bn" ? "পরিমাণ (AED)" : "Amount (AED)"}</span>
              <input
                style={{ ...inp, fontWeight:700, fontSize:16, color:"#22c55e" }}
                inputMode="decimal"
                value={amount}
                onChange={e => handleAmountChange(e.target.value)}
                onBlur={handleAmountBlur}
                placeholder="0.00"
              />
            </div>

            {/* Amount in words */}
            <div>
              <span style={lbl}>{lang==="bn" ? "কথায় পরিমাণ (স্বয়ংক্রিয়)" : "Amount in Words (auto)"}</span>
              <input
                style={{ ...inp, fontSize:12 }}
                value={words}
                onChange={e => handleWordsChange(e.target.value)}
                placeholder={lang==="bn" ? "কথায় পরিমাণ..." : "Amount in words..."}
              />
              {!wordsManual && amount && (
                <div style={{ fontSize:10, color:th.txtMuted, marginTop:3 }}>
                  ✨ {lang==="bn" ? "স্বয়ংক্রিয় — এডিট করা যাবে" : "Auto-filled — editable"}
                </div>
              )}
            </div>
          </div>

          {/* ── 🎯 Position Calibration Card ── */}
          {(() => {
            // Reusable 4-direction control for one field
            const FieldCtrl = ({ icon, label, xVal, yVal, onXL, onXR, onYU, onYD }) => {
              const btnSt = {
                padding:"4px 9px", borderRadius:5,
                border:`1px solid ${th.borderMid}`,
                background:th.bgCard, color:th.txtPrimary,
                cursor:"pointer", fontWeight:800, fontSize:12, lineHeight:1,
              };
              const valSt = (v) => ({
                minWidth:42, textAlign:"center", fontSize:11, fontWeight:800,
                color: v!==0 ? th.accent : th.txtMuted,
              });
              return (
                <div style={{ marginBottom:10, background:th.bgInp, borderRadius:8, padding:"8px 10px", border:`1px solid ${th.border}` }}>
                  <div style={{ fontSize:10, fontWeight:700, color:th.txtSecondary, marginBottom:6 }}>
                    {icon} {label}
                  </div>
                  <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
                    {/* Up / Down */}
                    <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                      <span style={{ fontSize:9, color:th.txtMuted, marginRight:2 }}>↕</span>
                      <button style={btnSt} onClick={onYU}>▲</button>
                      <div style={valSt(yVal)}>{yVal>0?"+":""}{yVal}mm</div>
                      <button style={btnSt} onClick={onYD}>▼</button>
                    </div>
                    <div style={{ width:1, height:24, background:th.border }} />
                    {/* Left / Right */}
                    <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                      <span style={{ fontSize:9, color:th.txtMuted, marginRight:2 }}>↔</span>
                      <button style={btnSt} onClick={onXL}>◄</button>
                      <div style={valSt(xVal)}>{xVal>0?"+":""}{xVal}mm</div>
                      <button style={btnSt} onClick={onXR}>►</button>
                    </div>
                  </div>
                </div>
              );
            };

            // Page size row
            const SizeBtn = ({ onClick, label }) => (
              <button onClick={onClick} style={{
                padding:"3px 9px", borderRadius:5,
                border:`1px solid ${th.borderMid}`,
                background:th.bgCard, color:th.txtPrimary,
                cursor:"pointer", fontWeight:800, fontSize:13,
              }}>{label}</button>
            );

            return (
              <div style={{ ...s.card, marginBottom:14, border:`1.5px solid ${th.accent}44` }}>
                <div style={{ fontSize:12, fontWeight:700, color:th.accent, textTransform:"uppercase", letterSpacing:0, marginBottom:4 }}>
                  🎯 {lang==="bn" ? "প্রিন্ট ক্যালিব্রেশন" : "Print Calibration"}
                </div>
                <div style={{ fontSize:10, color:th.txtMuted, marginBottom:10, lineHeight:1.6 }}>
                  {lang==="bn"
                    ? "সাদা কাগজে প্রিন্ট → চেকের উপর রাখুন → নিচের বাটন দিয়ে প্রতিটা field ঠিক করুন → সেভ করুন"
                    : "Print on plain paper → hold over cheque → adjust each field below → save"}
                </div>

                {/* Page size */}
                <div style={{ background:th.bgInp, borderRadius:8, padding:"8px 10px", marginBottom:10, border:`1px solid ${th.border}` }}>
                  <div style={{ fontSize:10, fontWeight:700, color:th.txtSecondary, marginBottom:6 }}>
                    📐 {lang==="bn" ? "চেকের সাইজ" : "Cheque Size (mm)"}
                  </div>
                  <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:4, flex:1 }}>
                      <span style={{ fontSize:9, color:th.txtMuted }}>{lang==="bn" ? "প্রস্থ" : "W"}</span>
                      <SizeBtn onClick={() => setPageW(w => Math.max(100,w-1))} label="−" />
                      <div style={{ flex:1, textAlign:"center", fontSize:14, fontWeight:800, color:th.txtPrimary }}>{pageW}</div>
                      <SizeBtn onClick={() => setPageW(w => w+1)} label="+" />
                    </div>
                    <span style={{ color:th.txtMuted }}>×</span>
                    <div style={{ display:"flex", alignItems:"center", gap:4, flex:1 }}>
                      <span style={{ fontSize:9, color:th.txtMuted }}>{lang==="bn" ? "উচ্চতা" : "H"}</span>
                      <SizeBtn onClick={() => setPageH(h => Math.max(50,h-1))} label="−" />
                      <div style={{ flex:1, textAlign:"center", fontSize:14, fontWeight:800, color:th.txtPrimary }}>{pageH}</div>
                      <SizeBtn onClick={() => setPageH(h => h+1)} label="+" />
                    </div>
                  </div>
                </div>

                {/* Per-field controls */}
                <FieldCtrl
                  icon="👤" label={lang==="bn" ? "Pay to — নাম" : "Pay to (Name)"}
                  xVal={payeeX} yVal={payeeY}
                  onYU={() => adj(setPayeeY)(-1)} onYD={() => adj(setPayeeY)(+1)}
                  onXL={() => adj(setPayeeX)(-1)} onXR={() => adj(setPayeeX)(+1)}
                />
                <FieldCtrl
                  icon="📝" label={lang==="bn" ? "কথায় পরিমাণ" : "Amount in Words"}
                  xVal={wordsX} yVal={wordsY}
                  onYU={() => adj(setWordsY)(-1)} onYD={() => adj(setWordsY)(+1)}
                  onXL={() => adj(setWordsX)(-1)} onXR={() => adj(setWordsX)(+1)}
                />
                <FieldCtrl
                  icon="💰" label={lang==="bn" ? "পরিমাণ (AED)" : "Amount (AED)"}
                  xVal={amtX} yVal={amtY}
                  onYU={() => adj(setAmtY)(-1)} onYD={() => adj(setAmtY)(+1)}
                  onXL={() => adj(setAmtX)(-1)} onXR={() => adj(setAmtX)(+1)}
                />
                {/* Date: main position */}
                <FieldCtrl
                  icon="📅" label={lang==="bn" ? "তারিখ (DD উপর/নিচ/বাম/ডান)" : "Date DD (Up/Down/Left/Right)"}
                  xVal={dateX} yVal={dateY}
                  onYU={() => adj(setDateY)(-1)} onYD={() => adj(setDateY)(+1)}
                  onXL={() => adj(setDateX)(-1)} onXR={() => adj(setDateX)(+1)}
                />

                {/* Date format selector */}
                <div style={{ background:th.bgInp, borderRadius:8, padding:"8px 10px", marginBottom:10, border:`1px solid ${th.border}` }}>
                  <div style={{ fontSize:10, fontWeight:700, color:th.txtSecondary, marginBottom:6 }}>
                    📅 {lang==="bn" ? "তারিখের ফরম্যাট" : "Date Format"}
                  </div>
                  <select
                    value={dateMode}
                    onChange={e => setDateMode(e.target.value)}
                    style={{
                      width:"100%",
                      padding:"8px 10px",
                      borderRadius:7,
                      border:`1px solid ${th.borderMid}`,
                      background:th.bgCard,
                      color:th.txtPrimary,
                      fontSize:12,
                      fontWeight:700,
                      outline:"none",
                    }}
                  >
                    {DATE_FORMAT_OPTIONS.map(opt => (
                      <option key={opt.id} value={opt.id}>{opt.label}</option>
                    ))}
                  </select>
                  <div style={{ fontSize:9, color:th.txtMuted, marginTop:6, lineHeight:1.5 }}>
                    {lang==="bn"
                      ? "যে ব্যাংকের চেকে / . - space বা box যেটা লাগে, সেটাই সিলেক্ট করুন। Save All দিলে ওই ব্যাংকের জন্য থাকবে।"
                      : "Select the exact date style required by this bank cheque. Save All stores it per bank."}
                  </div>
                </div>

                {/* Date gap controls */}
                <div style={{ background:th.bgInp, borderRadius:8, padding:"8px 10px", marginBottom:10, border:`1px solid ${th.border}` }}>
                  <div style={{ fontSize:10, fontWeight:700, color:th.txtSecondary, marginBottom:8 }}>
                    📅 {lang==="bn" ? "তারিখের মাঝের gap (MM ও YYYY)" : "Date gap — MM & YYYY spacing"}
                  </div>
                  {/* MM gap */}
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
                    <span style={{ fontSize:10, color:th.txtMuted, minWidth:70, fontWeight:600 }}>
                      {lang==="bn" ? "MM gap" : "MM gap"}
                    </span>
                    <button onClick={() => adj(setMmOff)(-1)}
                      style={{ padding:"4px 10px", borderRadius:5, border:`1px solid ${th.borderMid}`, background:th.bgCard, color:th.txtPrimary, cursor:"pointer", fontWeight:800, fontSize:12 }}>◄</button>
                    <div style={{ minWidth:46, textAlign:"center", fontSize:12, fontWeight:800, color: mmOff!==0 ? "#f59e0b" : th.txtMuted }}>
                      {mmOff>0?"+":""}{mmOff}mm
                    </div>
                    <button onClick={() => adj(setMmOff)(+1)}
                      style={{ padding:"4px 10px", borderRadius:5, border:`1px solid ${th.borderMid}`, background:th.bgCard, color:th.txtPrimary, cursor:"pointer", fontWeight:800, fontSize:12 }}>►</button>
                    <span style={{ fontSize:9, color:th.txtMuted, marginLeft:4 }}>← DD·MM·YYYY</span>
                  </div>
                  {/* YYYY gap */}
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ fontSize:10, color:th.txtMuted, minWidth:70, fontWeight:600 }}>
                      {lang==="bn" ? "YYYY gap" : "YYYY gap"}
                    </span>
                    <button onClick={() => adj(setYyOff)(-1)}
                      style={{ padding:"4px 10px", borderRadius:5, border:`1px solid ${th.borderMid}`, background:th.bgCard, color:th.txtPrimary, cursor:"pointer", fontWeight:800, fontSize:12 }}>◄</button>
                    <div style={{ minWidth:46, textAlign:"center", fontSize:12, fontWeight:800, color: yyOff!==0 ? "#f59e0b" : th.txtMuted }}>
                      {yyOff>0?"+":""}{yyOff}mm
                    </div>
                    <button onClick={() => adj(setYyOff)(+1)}
                      style={{ padding:"4px 10px", borderRadius:5, border:`1px solid ${th.borderMid}`, background:th.bgCard, color:th.txtPrimary, cursor:"pointer", fontWeight:800, fontSize:12 }}>►</button>
                    <span style={{ fontSize:9, color:th.txtMuted, marginLeft:4 }}>← MM·YYYY</span>
                  </div>
                </div>

                {/* Save / Reset */}
                <div style={{ display:"flex", gap:8, marginTop:4 }}>
                  <button
                    onClick={saveOffsets}
                    style={{
                      flex:1, padding:"10px", borderRadius:8, border:"none",
                      background: saveDone ? "#22c55e" : th.accent,
                      color:"#fff", cursor:"pointer", fontWeight:700, fontSize:13,
                      display:"flex", alignItems:"center", justifyContent:"center", gap:5,
                      transition:"background 0.3s",
                    }}
                  >
                    {saveDone
                      ? `✅ ${lang==="bn" ? "সেভ হয়েছে!" : "Saved!"}`
                      : `💾 ${lang==="bn" ? "সেভ করুন" : "Save All"}`}
                  </button>
                  <button
                    onClick={resetAll}
                    style={{ ...s.stBtn, flex:"0 0 76px", padding:"10px", fontSize:12, textAlign:"center" }}
                  >
                    ↺ Reset
                  </button>
                </div>
              </div>
            );
          })()}

          {linkedVoucher&&(
            <div style={{ marginBottom:10, padding:"9px 12px", borderRadius:10, border:"1px solid #2563eb", background:"rgba(37,99,235,0.08)", display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ flex:1, minWidth:0, fontSize:12, color:th.txtPrimary }}>
                🔗 <b>{linkedVoucher.paymentNo}</b> · {linkedVoucher.vendorName}
                {(linkedVoucher.chequeStatus || linkedVoucher.status) && (
                  <span style={{ marginLeft:6, fontSize:10, fontWeight:700, color:linkedVoucher.chequeStatus==="bounced"?"#b91c1c":"#64748b" }}>
                    · {linkedVoucher.chequeStatus || linkedVoucher.status}
                    {linkedVoucher.chequePrintCount ? ` · ${lang==="bn"?"প্রিন্ট":"print"}×${linkedVoucher.chequePrintCount}` : ""}
                  </span>
                )}
                <div style={{ fontSize:10, color:th.txtMuted }}>{lang==="bn"?"ভেন্ডর ভাউচারের চেক — প্রিন্ট করলে ভেন্ডরের ফোল্ডারে জমা হবে":"Vendor voucher cheque — saved to the vendor's folder when printed"}</div>
              </div>
              <button onClick={()=>setLinkedVoucher(null)} title={lang==="bn"?"লিংক সরান":"Unlink"} style={{ border:"none", background:"transparent", color:th.txtMuted, fontSize:16, cursor:"pointer" }}>✕</button>
            </div>
          )}

          {/* ── Print + Clear buttons ── */}
          <button
            onClick={printCheque}
            style={{ ...s.sendBtn, marginBottom:10, fontSize:15, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}
          >
            🖨️ {lang==="bn" ? "চেক প্রিন্ট করুন" : "Print Cheque"}
          </button>
          <button
            onClick={() => {
              const dirty = payee || amount || words || linkedVoucher;
              if (dirty && !window.confirm(lang === "bn" ? "সব ফিল্ড মুছে ফেলবেন?" : "Clear all fields?")) return;
              setPayee(""); setAmount(""); setWords("");
              setDateVal(localIsoDate());
              setWordsManual(false);
              setLinkedVoucher(null);
            }}
            style={{ ...s.stBtn, width:"100%", padding:"11px", textAlign:"center", fontSize:13 }}
          >
            🗑️ {lang==="bn" ? "ক্লিয়ার করুন" : "Clear All"}
          </button>

          {/* ── Tips card ── */}
          <div style={{ marginTop:14, padding:"10px 12px", background:th.bgCard, borderRadius:8, border:`1px solid ${th.border}`, fontSize:11, color:th.txtMuted, lineHeight:1.8 }}>
            💡 <strong style={{ color:th.txtSecondary }}>{lang==="bn" ? "টিপস:" : "Tips:"}</strong>
            {lang==="bn"
              ? " প্রিন্টারে Paper Size: Custom 210×90mm, Scale: 100%, Margins: None সেট করুন।"
              : " Set printer: Paper Size=Custom 210×90mm, Scale=100%, Margins=None."}
            <div style={{ marginTop:6, padding:"6px 8px", background:"#fef3c7", borderRadius:6, border:"1px solid #fcd34d", color:"#92400e", fontWeight:700 }}>
              ⚠️ {lang==="bn" ? "Chrome → More settings → Paper size → Custom → 210mm × 90mm" : "Chrome → More settings → Paper size → Custom → 210 × 90 mm"}
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════
            RIGHT PANEL — Cheque Preview (screen only)
        ════════════════════════════════════════ */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:11, fontWeight:700, color:th.txtMuted, textTransform:"uppercase", letterSpacing:0, marginBottom:10 }}>
            {lang==="bn" ? "লাইভ প্রিভিউ" : "Live Preview"} — 210mm × 90mm
          </div>

          <div style={{ overflowX:"auto", paddingBottom:8 }}>
            {/* ─── SCREEN-ONLY CHEQUE PREVIEW ─── */}
            <div
              id="cheque-screen-preview"
              style={{
                width:794, height:302,
                background:"#fdfcf6",
                position:"relative",
                border:"1px solid #c4a87a",
                boxShadow:"0 4px 18px rgba(0,0,0,0.18)",
                fontFamily:"'Times New Roman', Georgia, serif",
                overflow:"hidden", flexShrink:0, marginBottom:8,
              }}
            >
              {/* Guilloche watermark pattern */}
              <div style={{
                position:"absolute", inset:0, opacity:0.04, pointerEvents:"none",
                backgroundImage:"repeating-linear-gradient(45deg,#8b6914 0,#8b6914 1px,transparent 0,transparent 50%)",
                backgroundSize:"80px 80px",
              }} />

              {/* Security micro-strip right edge */}
              <div style={{
                position:"absolute", top:0, right:0, width:7, bottom:0, pointerEvents:"none",
                backgroundImage:"repeating-linear-gradient(180deg,#c0a040 0,#c0a040 3px,#e8d070 3px,#e8d070 6px)",
                opacity:0.45,
              }} />

              {/* Inner border frame */}
              <div style={{ position:"absolute", inset:6, border:"0.75px solid #c8ac82", pointerEvents:"none" }} />

              {/* Bank-name watermark */}
              <div style={{
                position:"absolute", top:"50%", left:"50%",
                transform:"translate(-50%,-50%) rotate(-28deg)",
                fontSize:48, fontWeight:900,
                color:"rgba(139,105,20,0.04)",
                whiteSpace:"nowrap", pointerEvents:"none",
                letterSpacing:5, fontFamily:"Arial Black, sans-serif",
              }}>
                {bank.name.toUpperCase()}
              </div>

              {/* ── CHEQUE CONTENT ── */}
              <div style={{ position:"absolute", inset:0, padding:"14px 20px 34px" }}>

                {/* Row 1: Bank header + Date (top-right) */}
                <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:8 }}>

                  {/* Bank identity — NO software branding here */}
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    {/* Bank color badge as logo placeholder */}
                    <div style={{
                      width:40, height:40, borderRadius:7,
                      background:bank.color,
                      display:"flex", flexDirection:"column",
                      alignItems:"center", justifyContent:"center",
                      fontSize:8.5, fontWeight:800, color:"#fff",
                      flexShrink:0, textAlign:"center", lineHeight:1.25,
                      letterSpacing:0.3, padding:2,
                    }}>
                      {bank.short}
                    </div>
                    <div>
                      <div style={{ fontSize:14, fontWeight:700, color:"#1a1a1a", letterSpacing:0.2 }}>{bank.name}</div>
                      <div style={{ fontSize:8.5, color:"#666", marginTop:1 }}>SWIFT: {bank.swift} · Bank Code: {bank.code}</div>
                    </div>
                  </div>

                  {/* Date boxes */}
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:8.5, color:"#555", fontStyle:"italic", marginBottom:3 }}>Date</div>
                    {previewDateBoxes()}
                  </div>
                </div>

                {/* Row 2: Account / IBAN (pre-printed on physical cheque, shown dimmed) */}
                <div style={{ display:"flex", gap:18, marginBottom:6, opacity:0.45 }}>
                  <div style={{ display:"flex", gap:5, alignItems:"center" }}>
                    <span style={{ fontSize:8.5, color:"#555" }}>Account No.</span>
                    <div style={{
                      borderBottom:"1.5px solid #9b8060", minWidth:130,
                      height:14, background:"rgba(0,0,0,0.03)",
                    }} />
                  </div>
                  <div style={{ display:"flex", gap:5, alignItems:"center" }}>
                    <span style={{ fontSize:8.5, color:"#555" }}>IBAN</span>
                    <div style={{
                      borderBottom:"1.5px solid #9b8060", minWidth:190,
                      height:14, background:"rgba(0,0,0,0.03)",
                    }} />
                  </div>
                </div>

                {/* Row 3: Pay to + Amount box */}
                <div style={{ display:"flex", alignItems:"flex-end", gap:8, marginBottom:6 }}>
                  <span style={{ fontSize:10.5, color:"#444", fontStyle:"italic", whiteSpace:"nowrap", flexShrink:0 }}>
                    Pay to the order of
                  </span>
                  <div style={{
                    flex:1, borderBottom:"1.5px solid #9b8060",
                    height:24, display:"flex", alignItems:"flex-end",
                    paddingBottom:2, minWidth:0,
                  }}>
                    <span style={{
                      fontSize:14, fontWeight:800, color:"#1a1a1a",
                      whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:"100%",
                    }}>
                      {payee || "\u00a0"}
                    </span>
                  </div>
                  {/* Amount box */}
                  <div style={{ flexShrink:0 }}>
                    <div style={{ fontSize:7.5, color:"#555", textAlign:"center", marginBottom:1 }}>AED</div>
                    <div style={{ border:"1.5px solid #7a3e0e", background:"#faf3e0", padding:"4px 14px", minWidth:115, textAlign:"center" }}>
                      <div style={{ fontSize:14, fontWeight:800, fontFamily:"'Courier New',monospace", color:"#1a1a1a", letterSpacing:0 }}>
                        {fmtAmount(amount) || "0.00"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Row 4: Amount in words */}
                <div style={{ display:"flex", alignItems:"flex-end", gap:8, marginBottom:8 }}>
                  <span style={{ fontSize:9.5, color:"#444", fontStyle:"italic", whiteSpace:"nowrap", flexShrink:0 }}>
                    Amount in words
                  </span>
                  <div style={{
                    flex:1, borderBottom:"1.5px solid #9b8060",
                    height:20, display:"flex", alignItems:"flex-end",
                    paddingBottom:2, minWidth:0,
                  }}>
                    <span style={{
                      fontSize:11, color:"#1a1a1a", fontStyle:"italic",
                      whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:"100%",
                    }}>
                      {words ? `${words} Only` : "\u00a0"}
                    </span>
                  </div>
                </div>

                {/* Row 5: Company info (pre-printed) + Signature */}
                <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between" }}>
                  {/* Pre-printed company details on cheque (shown dimmed) */}
                  <div style={{ opacity:0.5, lineHeight:1.5 }}>
                    <div style={{ fontSize:10, fontWeight:700, color:"#222", textTransform:"uppercase", letterSpacing:0.3 }}>
                      {shopName || "YOUR COMPANY NAME"}
                    </div>
                    <div style={{ fontSize:8.5, color:"#555" }}>
                      {shopAccount
                        ? `Account No. ${shopAccount}`
                        : "Account No. ────────────────"}
                    </div>
                    <div style={{ fontSize:8.5, color:"#555", fontFamily:"monospace" }}>
                      {shopIban
                        ? `IBAN: ${shopIban}`
                        : "IBAN: ──────────────────────"}
                    </div>
                  </div>
                  {/* Signature line */}
                  <div style={{ textAlign:"right" }}>
                    <div style={{ width:165, borderBottom:"1px solid #9b8060", marginBottom:3 }} />
                    <div style={{ fontSize:8.5, color:"#555", fontStyle:"italic" }}>Authorised Signatory</div>
                  </div>
                </div>
              </div>

              {/* MICR strip (pre-printed on physical cheque, shown dimmed) */}
              <div style={{
                position:"absolute", bottom:0, left:0, right:0, height:34,
                background:"rgba(0,0,0,0.03)", borderTop:"1px solid #d4b896",
                display:"flex", alignItems:"center", padding:"0 18px",
                justifyContent:"space-between", opacity:0.6,
              }}>
                <div>
                  <div style={{ fontFamily:"'Courier New',monospace", fontSize:11.5, color:"#111", letterSpacing:"0.18em" }}>
                    ⑆────────⑆
                  </div>
                  <div style={{ fontSize:7.5, color:"#888", fontStyle:"italic" }}>Cheque No.</div>
                </div>
                <div>
                  <div style={{ fontFamily:"'Courier New',monospace", fontSize:11.5, color:"#111", letterSpacing:"0.18em" }}>
                    ⑆──────────────⑆
                  </div>
                  <div style={{ fontSize:7.5, color:"#888", fontStyle:"italic" }}>Account No.</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontFamily:"'Courier New',monospace", fontSize:11.5, color:"#111", letterSpacing:"0.18em" }}>
                    ⑆{bank.code}⑆
                  </div>
                  <div style={{ fontSize:7.5, color:"#888", fontStyle:"italic" }}>Bank Code</div>
                </div>
              </div>
            </div>
          </div>

          {/* Info box */}
          <div style={{ ...s.card, fontSize:12, color:th.txtMuted, lineHeight:1.9 }}>
            <div style={{ fontSize:11, fontWeight:700, color:th.txtSecondary, marginBottom:6, textTransform:"uppercase", letterSpacing:0 }}>
              ℹ️ {lang==="bn" ? "প্রিন্ট নির্দেশনা" : "Print Instructions"}
            </div>
            <div>📐 {lang==="bn" ? "UAE চেক সাইজ: 210mm × 90mm" : "UAE standard cheque: 210mm × 90mm"}</div>
            <div>🖨️ {lang==="bn" ? "প্রিন্টার সেটিং: Landscape, Margins → None, Scale → 100%" : "Printer: Landscape · Margins: None · Scale: 100%"}</div>
            <div>📋 {lang==="bn" ? "প্রতিটি ব্যাংকের চেকে field position একটু আলাদা হতে পারে" : "Field positions may vary slightly per bank"}</div>
            <div>✅ {lang==="bn" ? "আসল চেকে দেওয়ার আগে সাদা কাগজে মিলিয়ে নিন" : "Verify alignment on plain paper before printing on real cheque"}</div>
          </div>
        </div>
      </div>

      {/* ── Vendor cheque folders ── */}
      {!foldersVisible&&onUnlockFolders&&(
        <button onClick={onUnlockFolders} style={{ ...s.card, marginTop:16, width:"100%", display:"flex", alignItems:"center", gap:10, cursor:"pointer", fontFamily:"inherit", textAlign:"left", border:`1px solid ${th.border}` }}>
          <span style={{ fontSize:24 }}>🔒</span>
          <span style={{ flex:1, fontSize:13, fontWeight:800, color:th.txtPrimary }}>{lang==="bn"?"ভেন্ডর চেক ফোল্ডার লক করা — দেখতে পিন দিন":"Vendor cheque folders are locked — enter PIN to view"}</span>
          <span style={{ fontSize:13, fontWeight:800, color:"#2563eb" }}>🔓</span>
        </button>
      )}
      {foldersVisible&&(()=>{
        const bn = lang==="bn";
        const cur = t.cur || "AED";
        const folders = new Map();
        vendorCheques.forEach(v => {
          const k = v.vendorId || `n:${v.vendorName||""}`;
          const f = folders.get(k) || { key:k, name:v.vendorName||"—", items:[], total:0 };
          f.items.push(v); f.total += chequeAmountOfVoucher(v);
          folders.set(k, f);
        });
        const q = folderSearch.trim().toLowerCase();
        const list = [...folders.values()].filter(f => !q || f.name.toLowerCase().includes(q)).sort((a,b)=>a.name.localeCompare(b.name));
        const open = openFolder && folders.get(openFolder);
        const btn = (bg, col, bd) => ({ padding:"7px 10px", borderRadius:8, border:bd||"none", background:bg, color:col, fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" });
        return (
          <div style={{ ...s.card, marginTop:16 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", marginBottom:10 }}>
              <div style={{ fontSize:13, fontWeight:800, color:th.accent, flex:1 }}>
                {open
                  ? <><button onClick={()=>setOpenFolder(null)} style={{ ...btn("transparent", th.accent), padding:"0 8px 0 0" }}>←</button>📂 {open.name}</>
                  : <>📁 {bn?"ভেন্ডর চেক ফোল্ডার":"Vendor cheque folders"} <span style={{ fontSize:11, color:th.txtMuted, fontWeight:600 }}>({vendorCheques.length})</span></>}
              </div>
              {!open&&<input value={folderSearch} onChange={e=>setFolderSearch(e.target.value)} placeholder={bn?"ভেন্ডর খুঁজুন…":"Search vendor…"} style={{ ...inp, width:isDesktop?220:"100%", padding:"7px 10px", fontSize:13 }} />}
              {onLockFolders&&<button onClick={()=>{ setOpenFolder(null); onLockFolders(); }} style={btn("transparent", th.txtSecondary, `1px solid ${th.borderMid}`)}>🔒 {bn?"লক":"Lock"}</button>}
            </div>
            {!open&&(list.length===0
              ? <div style={{ fontSize:12, color:th.txtMuted, padding:"12px 0" }}>{bn?"এখনো কোনো ভেন্ডর ভাউচারের চেক প্রিন্ট হয়নি। পারচেজ → পেমেন্ট → 🖨️ ভেন্ডর চেক থেকে শুরু করুন।":"No vendor voucher cheques printed yet. Start from Purchase → Payments → 🖨️ Vendor Cheque."}</div>
              : <div style={{ display:"grid", gridTemplateColumns:isDesktop?"repeat(auto-fill,minmax(220px,1fr))":"1fr", gap:8 }}>
                  {list.map(f=>(
                    <button key={f.key} onClick={()=>setOpenFolder(f.key)} style={{ textAlign:"left", padding:"10px 12px", borderRadius:10, border:`1px solid ${th.border}`, background:th.bgInp, cursor:"pointer", fontFamily:"inherit" }}>
                      <div style={{ fontSize:13, fontWeight:800, color:th.txtPrimary }}>📁 {f.name}</div>
                      <div style={{ fontSize:11, color:th.txtMuted, marginTop:2 }}>{f.items.length} {bn?"টি চেক":"cheques"} · {cur} {f.total.toFixed(2)}</div>
                    </button>
                  ))}
                </div>)}
            {open&&(
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {open.items.map(v=>(
                  <div key={v.id} style={{ padding:"10px 12px", borderRadius:10, border:`1px solid ${th.border}`, background:th.bgInp }}>
                    <div style={{ display:"flex", justifyContent:"space-between", gap:8, flexWrap:"wrap" }}>
                      <div style={{ fontSize:13, fontWeight:800, color:th.txtPrimary }}>{v.paymentNo} · 📃 {v.chequeNo||"—"}</div>
                      <div style={{ fontSize:14, fontWeight:900, color:"#22c55e" }}>{cur} {chequeAmountOfVoucher(v).toFixed(2)}</div>
                    </div>
                    <div style={{ fontSize:11, color:th.txtMuted, marginTop:2 }}>
                      🏦 {v.chequeBank||"—"} · 📅 {v.chequeDate||"—"} · 🖨️ {String(v.chequePrintedAt).slice(0,10)}{v.chequePrintCount>1?` ×${v.chequePrintCount}`:""}
                      {v.handover?.receiverName?` · 🪪 ${v.handover.receiverName}`:""}
                    </div>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:8 }}>
                      <button onClick={()=>{ loadVoucherIntoForm(v); window.scrollTo?.({ top:0, behavior:"smooth" }); }} style={btn("linear-gradient(135deg,#f97316,#ea580c)", "#fff")}>🖨️ {bn?"আবার প্রিন্ট":"Reprint"}</button>
                      <button onClick={()=>printWithSettings(chequeVoucherHtml(v, shop, chequeDocOpts(v)), { lang })} style={btn("rgba(59,130,246,0.08)", "#3b82f6", "1px solid #3b82f6")}>📄 {bn?"ভাউচার":"Voucher"}</button>
                      {v.handover
                        ? <button onClick={async ()=>printWithSettings(chequeHandoverHtml(v, shop, await loadHandoverDocs(v), chequeDocOpts(v)), { lang })} style={btn("rgba(34,197,94,0.08)", "#22c55e", "1px solid #22c55e")}>🪪 {bn?"হস্তান্তর প্রিন্ট":"Print Handover"}</button>
                        : onOpenHandover&&<button onClick={()=>onOpenHandover(v)} style={btn("rgba(34,197,94,0.08)", "#22c55e", "1px solid #22c55e")}>🪪 {bn?"হস্তান্তর ডকুমেন্ট":"Handover"}</button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* ════════════════════════════════════════
          PRINT-ONLY AREA
          Hidden on screen. When window.print() is called,
          ONLY this div is shown — positioned on a
          transparent page so the text lands on the
          pre-printed physical cheque leaf.
      ════════════════════════════════════════ */}
      <div id="cheque-print-area">
        {/* Payee name */}
        {payee && (
          <div style={{
            position:"absolute",
            top:`${P.payeeTop}mm`,
            left:`${P.payeeLeft}mm`,
            maxWidth:`${P.payeeMaxW}mm`,
            fontSize:"12.5pt", fontWeight:"700",
            fontFamily:"Arial, Helvetica, sans-serif",
            color:"#000", whiteSpace:"nowrap",
            overflow:"hidden",
          }}>
            {payee}
          </div>
        )}

        {/* Amount in numbers (right-aligned in the AED box) */}
        {amount && (
          <div style={{
            position:"absolute",
            top:`${P.amtTop}mm`,
            right:`${P.amtRight}mm`,
            fontSize:"13pt", fontWeight:"700",
            fontFamily:"'Courier New', Courier, monospace",
            color:"#000",
          }}>
            {fmtAmount(amount)}
          </div>
        )}

        {/* Amount in words */}
        {words && (
          <div style={{
            position:"absolute",
            top:`${P.wordsTop}mm`,
            left:`${P.wordsLeft}mm`,
            maxWidth:`${P.wordsMaxW}mm`,
            fontSize:"11pt",
            fontFamily:"Arial, Helvetica, sans-serif",
            color:"#000", whiteSpace:"nowrap",
            overflow:"hidden",
          }}>
            {words} Only
          </div>
        )}

        {/* Date — selected format printed on cheque */}
        {dateMode !== "box" && chequeDateText && (
          <div style={{
            position:"absolute",
            top:`${P.dateTop}mm`,
            left:`${P.dateDDLeft}mm`,
            fontSize:"11.5pt",
            fontWeight:"700",
            fontFamily:"'Courier New', Courier, monospace",
            color:"#000",
            letterSpacing:0,
            wordSpacing:0,
            whiteSpace:"nowrap",
            lineHeight:1,
          }}>
            {chequeDateText}
          </div>
        )}

        {/* Date — box/digit mode for cheques with date boxes */}
        {dateMode === "box" && (
          <>
            {dd && (
              <div style={{
                position:"absolute",
                top:`${P.dateTop}mm`,
                left:`${P.dateDDLeft}mm`,
                fontSize:"11.5pt", fontWeight:"700",
                fontFamily:"'Courier New', Courier, monospace",
                color:"#000", letterSpacing:"0.18em",
              }}>{dd}</div>
            )}
            {mm && (
              <div style={{
                position:"absolute",
                top:`${P.dateTop}mm`,
                left:`${P.dateMMLeft}mm`,
                fontSize:"11.5pt", fontWeight:"700",
                fontFamily:"'Courier New', Courier, monospace",
                color:"#000", letterSpacing:"0.18em",
              }}>{mm}</div>
            )}
            {yyyy && (
              <div style={{
                position:"absolute",
                top:`${P.dateTop}mm`,
                left:`${P.dateYYLeft}mm`,
                fontSize:"11.5pt", fontWeight:"700",
                fontFamily:"'Courier New', Courier, monospace",
                color:"#000", letterSpacing:"0.18em",
              }}>{yyyy}</div>
            )}
          </>
        )}
      </div>

      {/* ── PRINT STYLES ── */}
      <style>{`
        /* The print layer is only a template; printCheque() prints a copy of it */
        #cheque-print-area {
          display: none;
        }
      `}</style>
    </div>
  );
}
