import { bt, fq, TransferRemaining, normalizeError } from "./btShared.jsx";
import { remainingQuantityForLine, numberValue } from "./branchTransferDomain.js";
import { useState } from "react";
import { useEscapeKey } from "../components/WindowChrome.jsx";

export function ReceiveWindow({ lang, mobile, transfer, busy, allowPartial, onClose, onConfirm, toast }) {
  const t = bt(lang);
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const items = (transfer.items || []).filter((item) => remainingQuantityForLine(transfer, item) > 0);
  const [lines, setLines] = useState(() => (transfer.items || []).map((item) => ({
    lineId: item.lineId,
    receivedQty: fq(remainingQuantityForLine(transfer, item)),
    damagedQty: "0",
    issueNote: "",
  })));
  useEscapeKey(() => { if (!busy) onClose(); }, { level: 3 });
  const lineOf = (lineId) => lines.find((line) => line.lineId === lineId) || {};
  const upd = (lineId, key, value) => setLines((prev) => prev.map((line) => (line.lineId === lineId ? { ...line, [key]: value } : line)));
  const setAll = (full) => setLines((prev) => prev.map((line) => {
    const item = (transfer.items || []).find((row) => row.lineId === line.lineId);
    return { ...line, receivedQty: full ? fq(remainingQuantityForLine(transfer, item)) : "0", damagedQty: "0" };
  }));
  const problem = (item) => {
    const line = lineOf(item.lineId);
    const rec = numberValue(line.receivedQty);
    const dmg = numberValue(line.damagedQty);
    if (rec < 0 || dmg < 0) return L("মাইনাস হবে না", "Can't be negative");
    if (rec > remainingQuantityForLine(transfer, item) + 1e-9) return L("বাকির চেয়ে বেশি", "More than remaining");
    if (dmg > rec) return L("নষ্ট > পেয়েছেন", "Damaged > received");
    return "";
  };
  const totalRec = items.reduce((sum, item) => sum + numberValue(lineOf(item.lineId).receivedQty), 0);
  const totalDmg = items.reduce((sum, item) => sum + numberValue(lineOf(item.lineId).damagedQty), 0);
  const totalRemaining = TransferRemaining(transfer);

  const confirm = () => {
    if (busy) return;
    const bad = items.find(problem);
    if (bad) return toast(`❌ ${bad.name}: ${problem(bad)}`, "err");
    if (totalRec <= 0) return toast(normalizeError(new Error("RECEIPT_QUANTITY_REQUIRED"), lang), "err");
    if (!allowPartial && totalRec < totalRemaining - 1e-9) return toast(normalizeError(new Error("PARTIAL_RECEIVE_DISABLED"), lang), "err");
    onConfirm(lines);
  };

  const numInput = (item, key) => (
    <input type="number" min="0" step="any" inputMode="decimal" className="pm-input" value={lineOf(item.lineId)[key] ?? ""} onChange={(e) => upd(item.lineId, key, e.target.value)} style={{ textAlign: "right" }} />
  );

  return (
    <div className="pm-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="pm-window" style={{ maxWidth: mobile ? undefined : 860 }}>
        <div className="pm-window-title">
          <span>📥 {t.receive} — {transfer.transferNo} · {transfer.branchName}</span>
          <button type="button" className="pm-window-close" disabled={busy} onClick={onClose}>✕</button>
        </div>
        <div className="pm-window-body">
          <div className="si-pills" style={{ marginBottom: 4 }}>
            <button type="button" className="pm-btn-secondary" onClick={() => setAll(true)}>✓ {L("সব বাকি পেয়েছি", "Got all remaining")}</button>
            <button type="button" className="pm-btn-secondary" onClick={() => setAll(false)}>0 {L("সব শূন্য", "Clear all")}</button>
          </div>
          <div className="si-box" style={{ maxHeight: mobile ? undefined : 380 }}>
            {mobile ? items.map((item) => {
              const line = lineOf(item.lineId);
              const err = problem(item);
          return (
                <div key={item.lineId} className="si-mrow" style={{ cursor: "default" }}>
                  <div className="si-mrow-top"><span>{item.name}</span><span>{t.remaining} <b>{fq(remainingQuantityForLine(transfer, item))}</b> {item.unit}</span></div>
                  <div className="si-grid2" style={{ marginTop: 4 }}>
                    <div className="si-field"><span className="pm-label">{t.received}</span>{numInput(item, "receivedQty")}</div>
                    <div className="si-field"><span className="pm-label">{t.damaged}</span>{numInput(item, "damagedQty")}</div>
              </div>
                  <input className="pm-input" style={{ marginTop: 4 }} value={line.issueNote || ""} onChange={(e) => upd(item.lineId, "issueNote", e.target.value)} placeholder={t.issueNote} />
                  {err && <div style={{ color: "#b91c1c", fontWeight: 700 }}>⚠️ {err}</div>}
            </div>
              );
            }) : (
              <table className="pm-table">
                <thead><tr>
                  <th style={{ width: 28 }} className="si-center">#</th>
                  <th>{L("পণ্য", "Item")}</th>
                  <th style={{ width: 80 }} className="si-num">{t.remaining}</th>
                  <th style={{ width: 95 }} className="si-num">{t.received}</th>
                  <th style={{ width: 95 }} className="si-num">{t.damaged}</th>
                  <th style={{ width: 80 }} className="si-num">{L("ভালো", "Good")}</th>
                  <th style={{ width: 200 }}>{t.issueNote}</th>
                </tr></thead>
                <tbody>
                  {items.map((item, index) => {
                    const line = lineOf(item.lineId);
                    const err = problem(item);
                    return (
                      <tr key={item.lineId} className="is-editing" title={err || undefined}>
                        <td className="si-center">{index + 1}</td>
                        <td className="si-strong" title={item.name}>{item.name}{item.code ? <span className="si-muted"> · {item.code}</span> : null}</td>
                        <td className="si-num">{fq(remainingQuantityForLine(transfer, item))} {item.unit}</td>
                        <td style={{ padding: "1px 2px" }}>{numInput(item, "receivedQty")}</td>
                        <td style={{ padding: "1px 2px" }}>{numInput(item, "damagedQty")}</td>
                        <td className="si-num si-strong" style={{ color: err ? "#b91c1c" : "#15803d" }}>{err ? "⚠️" : fq(numberValue(line.receivedQty) - numberValue(line.damagedQty))}</td>
                        <td style={{ padding: "1px 2px" }}><input className="pm-input" value={line.issueNote || ""} onChange={(e) => upd(item.lineId, "issueNote", e.target.value)} /></td>
                      </tr>
          );
        })}
                </tbody>
              </table>
            )}
          </div>
          <div className="si-hint" style={{ marginLeft: 0 }}>
            {t.received} <b>{fq(totalRec)}</b> · {t.damaged} <b>{fq(totalDmg)}</b> · {L("ভালো", "Good")} <b>{fq(totalRec - totalDmg)}</b>
            {!allowPartial && ` · ${L("আংশিক রিসিভ বন্ধ — সব বাকি একসাথে রিসিভ করতে হবে", "Partial receive is off — receive all remaining at once")}`}
          </div>
          <div className="si-actions" style={{ padding: 0 }}>
            <button type="button" className="pm-btn-secondary" disabled={busy} onClick={onClose}>{L("বন্ধ", "Close")}</button>
            <span className="si-toolbar-gap" />
            <button type="button" className="pm-btn pm-btn--primary" disabled={busy} onClick={confirm}>{busy ? L("সেভ হচ্ছে…", "Saving…") : `✓ ${t.confirmReceive}`}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
