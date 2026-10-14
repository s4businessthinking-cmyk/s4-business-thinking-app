import { _globalS, LOGO_URL, APP_NAME } from "../shared/appShared.jsx";
import { useState, useEffect } from "react";

// ─── HEADER ──────────────────────────────────────────────────
export function Header({ t, lang, setLang, children, isDesktop, s, theme, setTheme, shopName, personName, rightSlot, onBack }) {
  const _s = s || _globalS;
  const [titleFx, setTitleFx] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTitleFx(v => (v + 1) % 4), 2400);
    return () => clearInterval(timer);
  }, []);
  const titleStyle = { ..._s.title3dBase, ..._s.title3dVariants[titleFx] };
  return (
    <div style={_s.hdr}>
      <style>{`
        @keyframes s4TitleFloat {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-1px) scale(1.015); }
        }
        @keyframes s4TitleShine {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes s4TitleGlowPulse {
          0%, 100% { filter: drop-shadow(0 0 2px rgba(96,165,250,.55)); }
          50% { filter: drop-shadow(0 0 10px rgba(96,165,250,.95)); }
        }
      `}</style>
      <div style={{ ..._s.hLeft, ...(shopName ? { minWidth:0, flex:"1 1 auto" } : {}) }}>
        {onBack && (
          <button type="button" onClick={onBack} title={lang==="bn"?"পেছনে":"Back"}
            style={{ height:38, padding:"0 10px", borderRadius:10, border:`1px solid ${theme==="dark"?"#3f3f46":"#cbd5e1"}`, background:theme==="dark"?"#27272a":"#f1f5f9", color:theme==="dark"?"#f4f4f5":"#0f172a", fontSize:15, fontWeight:900, cursor:"pointer", flexShrink:0, fontFamily:"inherit" }}>
            ← {lang==="bn"?"পেছনে":"Back"}
          </button>
        )}
        <img src={LOGO_URL} alt="S4" style={_s.headerLogo} />
        {shopName ? (
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:isDesktop?20:15, fontWeight:900, lineHeight:1.15, letterSpacing:-0.3, color:theme==="dark"?"#f8fafc":"#0f172a", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
              🏪 {shopName}
            </div>
            <div style={{ ..._s.sub, marginTop:2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
              {personName && <span style={{ color:"#3b82f6", fontWeight:800 }}>👤 {personName.toUpperCase()}</span>}
              {personName && " · "}{APP_NAME}
            </div>
          </div>
        ) : (
          <div>
            <div className="s4-live-3d-title" style={titleStyle}>{APP_NAME}</div>
            <div style={_s.sub}>{t.appSub}</div>
          </div>
        )}
      </div>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
        {rightSlot}
        {!rightSlot && setTheme && (
          <button
            onClick={() => setTheme(theme==="dark"?"light":"dark")}
            title={theme==="dark"?"Light Mode":"Dark Mode"}
            style={{
              width:34, height:34, borderRadius:8,
              border:`1px solid ${theme==="dark"?"#3f3f46":"#cbd5e1"}`,
              background:theme==="dark"?"#27272a":"#f1f5f9",
              cursor:"pointer", fontSize:16, display:"flex",
              alignItems:"center", justifyContent:"center",
              flexShrink:0, transition:"all 0.2s",
            }}>
            {theme==="dark" ? "☀️" : "🌙"}
          </button>
        )}
        {!rightSlot && (
          <div style={_s.langSw}>
            <button style={{ ..._s.lBtn, ...(lang==="bn"?_s.lBtnA:{}) }} onClick={() => setLang("bn")}>বাং</button>
            <button style={{ ..._s.lBtn, ...(lang==="en"?_s.lBtnA:{}) }} onClick={() => setLang("en")}>EN</button>
          </div>
        )}
        {!isDesktop && children}
      </div>
    </div>
  );
}
