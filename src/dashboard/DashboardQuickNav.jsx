import React from "react";
import { groupMenuItems } from "./menuGroups.js";

const MIN_CARD = 110;

/**
 * Grouped quick-launch cards on the dashboard (Masters / Transaction / …).
 * navItems: [{ key, icon, label, badge? }]
 */
export default function DashboardQuickNav({ navItems, lang, isDesktop, isLightDash, th, setTab, title }) {
  const metaByKey = Object.fromEntries(navItems.map((n) => [n.key, n]));
  const groups = groupMenuItems(navItems.map((n) => [n.key, n.label]), lang).filter((g) => g.items.length);

  const glassCard = {
    background: isLightDash
      ? "linear-gradient(145deg, rgba(255,255,255,0.98), rgba(239,246,255,0.96))"
      : "linear-gradient(145deg, rgba(30,41,59,0.92), rgba(15,23,42,0.86))",
    border: isLightDash ? "1px solid rgba(59,130,246,0.18)" : "1px solid rgba(148,163,184,0.25)",
    boxShadow: isLightDash ? "0 12px 28px rgba(30,64,175,0.10)" : "0 14px 35px rgba(2,6,23,0.32)",
    backdropFilter: "blur(14px)",
  };

  const card = (item) => (
    <button
      key={item.key}
      type="button"
      onClick={() => setTab(item.key)}
      style={{
        ...glassCard,
        borderRadius: 16,
        padding: isDesktop ? "14px 8px" : "12px 6px",
        height: isDesktop ? 104 : 92,
        boxSizing: "border-box",
        cursor: "pointer",
        fontFamily: "inherit",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        position: "relative",
        color: th.txtPrimary,
        minWidth: 0,
      }}
    >
      {item.badge > 0 && (
        <span style={{ position: "absolute", top: 8, right: 8, background: "linear-gradient(135deg,#fb7185,#ef4444)", color: "#fff", borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 900, boxShadow: "0 8px 18px rgba(239,68,68,0.35)" }}>
          {item.badge}
        </span>
      )}
      <span style={{ fontSize: isDesktop ? 28 : 25, lineHeight: 1, filter: "drop-shadow(0 8px 14px rgba(96,165,250,0.28))" }}>{item.icon}</span>
      <span style={{ fontSize: isDesktop ? 13 : 12, fontWeight: 800, color: th.txtSecondary, textAlign: "center", lineHeight: 1.2, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {item.label}
      </span>
    </button>
  );

  return (
    <div style={{ marginBottom: isDesktop ? 0 : 18 }}>
      <div style={{ margin: "12px 2px 8px", color: th.txtPrimary, fontSize: isDesktop ? 12 : 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.7 }}>
        {title}
      </div>
      <div style={isDesktop
        ? { display: "flex", flexWrap: "wrap", columnGap: 18, rowGap: 14 }
        : { display: "flex", flexDirection: "column", gap: 12 }}>
        {groups.map((g) => (
          <div key={g.key} style={isDesktop ? { flex: `${g.items.length} 1 ${g.items.length * MIN_CARD + (g.items.length - 1) * 10}px`, minWidth: 0 } : undefined}>
            {g.label && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 2px 8px" }}>
                <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.4, textTransform: "uppercase", color: isLightDash ? "#1e3a8a" : "#cbd5e1", whiteSpace: "nowrap" }}>
                  {g.icon} {g.label}
                </span>
                <span style={{ flex: 1, height: 1, background: isLightDash ? "rgba(59,130,246,0.18)" : "rgba(148,163,184,0.22)" }} />
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: isDesktop ? `repeat(auto-fit, minmax(${MIN_CARD}px, 1fr))` : "repeat(3, minmax(0, 1fr))", gap: isDesktop ? 10 : 8 }}>
              {g.items.map(([key]) => (metaByKey[key] ? card(metaByKey[key]) : null))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
