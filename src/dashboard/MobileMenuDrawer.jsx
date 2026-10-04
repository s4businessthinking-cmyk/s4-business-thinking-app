import { useEffect } from "react";

export default function MobileMenuDrawer({
  open, onClose, items, activeKey, onSelect, unreadKey, unread = 0,
  lang, theme, personName, roleLabel, shopName, syncState, onLogout,
}) {
  const bn = lang === "bn";
  const dark = theme === "dark";

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const c = dark
    ? { panel: "#0f1d33", border: "#2b4568", text: "#f8fafc", muted: "#b6c7df", hover: "#17304f", active: "#2563eb" }
    : { panel: "#ffffff", border: "#dbe3ee", text: "#0f172a", muted: "#475569", hover: "#eef4fd", active: "#2563eb" };

  const syncText = syncState === "connected" ? "🟢 Online"
    : syncState === "offline" ? "🔴 Offline"
      : syncState === "reconnecting" ? "🟠 Reconnecting..." : "🟡 Connecting...";
  const syncColor = syncState === "connected" ? "#22c55e" : syncState === "offline" ? "#ef4444" : "#f59e0b";

  return (
    <div aria-hidden={!open} style={{ position: "fixed", inset: 0, zIndex: 3000, pointerEvents: open ? "auto" : "none" }}>
      <div onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(2,6,23,0.55)", opacity: open ? 1 : 0, transition: "opacity .2s" }} />
      <aside role="dialog" aria-label={bn ? "সব অপশন" : "All options"}
        style={{
          position: "absolute", top: 0, bottom: 0, left: 0, width: "min(300px, 84vw)",
          background: c.panel, borderRight: `1px solid ${c.border}`, color: c.text,
          transform: open ? "translateX(0)" : "translateX(-102%)", transition: "transform .22s ease",
          display: "flex", flexDirection: "column", boxShadow: "8px 0 30px rgba(2,6,23,0.35)",
          fontFamily: "inherit",
        }}>
        <div style={{ padding: "16px 14px 12px", borderBottom: `1px solid ${c.border}`, display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ fontSize: 30, lineHeight: 1 }}>🏪</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shopName || "S4"}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: c.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              👤 {personName}{roleLabel ? ` · ${roleLabel}` : ""}
            </div>
          </div>
          <button onClick={onClose} aria-label={bn ? "বন্ধ করুন" : "Close"}
            style={{ border: 0, background: "transparent", color: c.muted, fontSize: 22, lineHeight: 1, cursor: "pointer", padding: 2 }}>✕</button>
        </div>

        <nav style={{ flex: 1, overflowY: "auto", padding: "8px 8px" }}>
          {items.map(([key, label]) => {
            const active = key === activeKey;
            return (
              <button key={key} onClick={() => { onSelect(key); onClose(); }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "12px 12px", marginBottom: 2,
                  borderRadius: 10, border: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                  fontSize: 14, fontWeight: active ? 900 : 700,
                  background: active ? c.active : "transparent", color: active ? "#fff" : c.text,
                }}>
                <span style={{ flex: 1 }}>{label}</span>
                {key === unreadKey && unread > 0 && (
                  <span style={{ background: "#ef4444", color: "#fff", borderRadius: 999, padding: "1px 8px", fontSize: 11, fontWeight: 900 }}>{unread}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div style={{ borderTop: `1px solid ${c.border}`, padding: "10px 12px 14px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: syncColor, textAlign: "center", marginBottom: 8 }}>{syncText}</div>
          <button onClick={() => { onClose(); onLogout(); }}
            style={{ width: "100%", padding: "11px", borderRadius: 10, border: "1px solid #ef4444", background: "transparent", color: "#ef4444", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
            🚪 {bn ? "লগআউট" : "Logout"}
          </button>
        </div>
      </aside>
    </div>
  );
}
