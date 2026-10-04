import { useEffect, useRef, useState } from "react";

// Header bell: badge with the number of things needing attention and a
// dropdown list; each item jumps to the screen where it can be handled.
export default function NotificationBell({ lang, theme, items = [] }) {
  const bn = lang === "bn";
  const dark = theme === "dark";
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const count = items.reduce((a, it) => a + (it.count || 1), 0);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const colors = dark
    ? { bg: "#18181b", border: "#3f3f46", text: "#f4f4f5", muted: "#a1a1aa", hover: "#27272a", btn: "#27272a" }
    : { bg: "#ffffff", border: "#cbd5e1", text: "#0f172a", muted: "#64748b", hover: "#f1f5f9", btn: "#f1f5f9" };

  return (
    <div ref={wrapRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={bn ? "নোটিফিকেশন" : "Notifications"}
        style={{
          width: 38, height: 38, borderRadius: 10, border: `1px solid ${colors.border}`, background: colors.btn,
          cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", position: "relative",
        }}
      >
        🔔
        {count > 0 && (
          <span style={{
            position: "absolute", top: -6, right: -6, minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9,
            background: "linear-gradient(135deg,#fb7185,#ef4444)", color: "#fff", fontSize: 11, fontWeight: 900,
            display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box",
          }}>
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute", right: 0, top: 46, width: "min(340px, calc(100vw - 24px))", maxHeight: "70vh", overflowY: "auto",
          background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 14, zIndex: 1000,
          boxShadow: dark ? "0 18px 40px rgba(0,0,0,0.55)" : "0 18px 40px rgba(15,23,42,0.18)",
        }}>
          <div style={{ padding: "11px 14px", fontSize: 13, fontWeight: 900, color: colors.text, borderBottom: `1px solid ${colors.border}` }}>
            🔔 {bn ? "নোটিফিকেশন" : "Notifications"}
          </div>
          {items.length === 0 ? (
            <div style={{ padding: "18px 14px", fontSize: 13, color: colors.muted, textAlign: "center" }}>
              {bn ? "কোনো নতুন নোটিফিকেশন নেই ✅" : "No new notifications ✅"}
            </div>
          ) : (
            items.map((it) => (
              <button
                key={it.key}
                type="button"
                onClick={() => { setOpen(false); it.onClick?.(); }}
                style={{
                  display: "flex", gap: 10, width: "100%", textAlign: "left", padding: "10px 14px", border: "none",
                  borderBottom: `1px solid ${colors.border}`, background: "transparent", cursor: "pointer", fontFamily: "inherit",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = colors.hover; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ fontSize: 20, lineHeight: 1.2 }}>{it.icon}</span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 800, color: it.tone === "danger" ? "#ef4444" : colors.text }}>{it.title}</span>
                  {it.sub && <span style={{ display: "block", fontSize: 11, color: colors.muted, marginTop: 2 }}>{it.sub}</span>}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
