// "WhatsApp" button for any printable document: builds the same HTML as Print, makes the PDF and opens the party's
// WhatsApp chat with the message (whatsappDocShare.js). With no number on the party it asks for one for this send.
// build(): { html, fileName, phone, text } - called on click, so it always uses the document as it is now.
// useDocShare() is the same flow without the button, for the automatic WhatsApp after a sales invoice is confirmed.
import React, { useEffect, useState } from "react";
import { normalizeWaPhone, shareDocOnWhatsApp, shareMode, shareOutcome } from "./whatsappDocShare.js";

function Dialog({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,25,55,0.45)", zIndex: 10060, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-label={title} style={{ width: "100%", maxWidth: 420, background: "#f4f7fc", border: "1px solid #2f4f86", borderRadius: 4, boxShadow: "0 18px 40px rgba(0,0,0,0.35)" }}>
        <div style={{ background: "#2f4f86", color: "#fff", padding: "6px 10px", fontWeight: 800, fontSize: 13 }}>{title}</div>
        <div style={{ padding: 12, fontSize: 13, display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
      </div>
    </div>
  );
}

/**
 * Share state + dialogs. start(doc): from a click (asks for a missing number).
 * startAuto(doc, label): after a save - a missing number only shows a message; in a browser (where a window may only
 * open from a click) it first asks "Open WhatsApp?", in the apps it opens straight away.
 */
export function useDocShare({ lang = "en", toast, countryCode } = {}) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(null); // { doc, phone } while asking for a number
  const [confirmOpen, setConfirmOpen] = useState(null); // { doc, phone, label } browser: waits for a click
  const [done, setDone] = useState(null); // result: { text, path }

  // errors go to the toast (or the dialog when the screen has none); results always get the dialog so the steps stay readable
  const say = (text, tone) => (toast ? toast(text, tone) : setDone({ text }));
  const send = async (doc, phone) => {
    setBusy(true);
    try {
      const res = await shareDocOnWhatsApp({ ...doc, phone });
      const out = shareOutcome(res, bn);
      if (res.mode === "android" && res.opened) say(out.text);
      else setDone({ text: out.text, path: res.path || "", clipboard: !!res.clipboard });
    } catch (e) {
      console.warn("[S4 WhatsApp] share failed", e);
      say(L("WhatsApp-এ পাঠানো যায়নি: ", "Could not open WhatsApp: ") + (e?.message || e), "err");
    } finally {
      setBusy(false);
    }
  };
  const start = (doc) => {
    if (busy || !doc?.html) return;
    const phone = normalizeWaPhone(doc.phone, countryCode);
    if (!phone) { setAsk({ doc, phone: doc.phone || "" }); return; }
    send(doc, phone);
  };
  const startAuto = (doc, label = "") => {
    if (!doc?.html) return;
    const phone = normalizeWaPhone(doc.phone, countryCode);
    if (!phone) {
      toast?.(L(`${label} সেভ হয়েছে - কাস্টমারের WhatsApp / মোবাইল নম্বর নেই, তাই WhatsApp খোলেনি`, `${label} saved - the customer has no WhatsApp / mobile number, so WhatsApp did not open`), "info");
      return;
    }
    if (shareMode() === "browser") { setConfirmOpen({ doc, phone, label }); return; }
    send(doc, phone);
  };
  const askedPhone = ask ? normalizeWaPhone(ask.phone, countryCode) : "";

  const dialogs = (
    <>
      {ask && (
        <Dialog title={L("WhatsApp নম্বর", "WhatsApp number")} onClose={() => setAsk(null)}>
          <span>{L("এই পার্টির WhatsApp / মোবাইল নম্বর নেই। এবারের জন্য নম্বর দিন (মাস্টারে সেভ হবে না)।", "This party has no WhatsApp / mobile number. Type one for this send (it is not saved to the master).")}</span>
          <input className="pm-input" autoFocus inputMode="tel" value={ask.phone} placeholder="05x xxx xxxx / +971 5x xxx xxxx"
            onChange={(e) => setAsk((a) => ({ ...a, phone: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter" && askedPhone) { const a = ask; setAsk(null); send(a.doc, askedPhone); } }} />
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button type="button" className="pm-btn-secondary" onClick={() => setAsk(null)}>{L("বাতিল", "Cancel")}</button>
            <button type="button" className="pm-btn pm-btn--primary" disabled={!askedPhone} onClick={() => { const a = ask; setAsk(null); send(a.doc, askedPhone); }}>WhatsApp</button>
          </div>
        </Dialog>
      )}
      {confirmOpen && (
        <Dialog title="WhatsApp" onClose={() => setConfirmOpen(null)}>
          <span>{L(`${confirmOpen.label} সেভ হয়েছে। এই কাস্টমারের জন্য WhatsApp চালু - PDF আর মেসেজ নিয়ে WhatsApp খুলবেন?`, `${confirmOpen.label} saved. WhatsApp is on for this customer - open WhatsApp with the PDF and message?`)}</span>
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button type="button" className="pm-btn-secondary" onClick={() => setConfirmOpen(null)}>{L("এখন না", "Not now")}</button>
            <button type="button" className="pm-btn pm-btn--primary" autoFocus onClick={() => { const c = confirmOpen; setConfirmOpen(null); send(c.doc, c.phone); }}>WhatsApp</button>
          </div>
        </Dialog>
      )}
      {done && (
        <Dialog title="WhatsApp" onClose={() => setDone(null)}>
          <span>{done.text}</span>
          {done.path && <span style={{ fontSize: 11.5, color: "#475569", overflowWrap: "anywhere" }}>{done.path}</span>}
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
            {done.path && window.S4Desktop?.share?.copyFile && (
              <button type="button" className="pm-btn-secondary" onClick={async () => {
                const ok = await window.S4Desktop.share.copyFile(done.path);
                toast?.(ok ? L("PDF আবার কপি হয়েছে - চ্যাটে Ctrl+V চাপুন", "PDF copied again - press Ctrl+V in the chat") : L("কপি হয়নি - ফোল্ডার থেকে টেনে দিন", "Could not copy - drag it from the folder"), ok ? undefined : "err");
              }}>{L("PDF আবার কপি", "Copy PDF again")}</button>
            )}
            {done.path && <button type="button" className="pm-btn-secondary" onClick={() => window.S4Desktop?.share?.showFile?.(done.path)}>{L("ফোল্ডারে দেখান", "Show in folder")}</button>}
            <button type="button" className="pm-btn pm-btn--primary" autoFocus onClick={() => setDone(null)}>OK</button>
          </div>
        </Dialog>
      )}
    </>
  );
  return { busy, start, startAuto, say, dialogs };
}

export default function WhatsAppButton({ lang = "en", toast, build, countryCode, className = "pm-btn", style, disabled = false, label, title }) {
  const share = useDocShare({ lang, toast, countryCode });
  const click = () => {
    if (share.busy || disabled) return;
    let doc;
    try { doc = build(); } catch (e) { share.say(e?.message || String(e), "err"); return; }
    share.start(doc);
  };
  return (
    <>
      <button type="button" className={className} style={style} onClick={click} disabled={share.busy || disabled}
        title={title || (lang === "bn" ? "PDF আর মেসেজ WhatsApp-এ" : "PDF and message on WhatsApp")}>
        {share.busy ? "..." : label || "WhatsApp"}
      </button>
      {share.dialogs}
    </>
  );
}
