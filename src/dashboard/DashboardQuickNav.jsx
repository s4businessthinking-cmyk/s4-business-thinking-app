import React from "react";
import { groupMenuItems } from "./menuGroups.js";

/**
 * Grouped quick-launch tiles on the dashboard (Masters / Transaction / …).
 * navItems: [{ key, icon, label, badge? }]
 */
export default function DashboardQuickNav({ navItems, lang, isDesktop, isLightDash, th, setTab, title }) {
  const tuples = navItems.map((n) => [n.key, n.label]);
  const metaByKey = Object.fromEntries(navItems.map((n) => [n.key, n]));
  const groups = groupMenuItems(tuples, lang).filter((g) => g.key !== "home" && g.items.length);

  const groupShell = {
    borderRadius: 16,
    padding: isDesktop ? "14px 14px 12px" : "12px 10px 10px",
    background: isLightDash
      ? "linear-gradient(160deg, rgba(255,255,255,0.97), rgba(241,245,255,0.94))"
      : "linear-gradient(160deg, rgba(30,41,59,0.88), rgba(15,23,42,0.82))",
    border: isLightDash ? "1px solid rgba(59,130,246,0.14)" : "1px solid rgba(148,163,184,0.22)",
    boxShadow: isLightDash ? "0 8px 24px rgba(30,64,175,0.08)" : "0 10px 28px rgba(2,6,23,0.28)",
  };

  const headerStyle = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
    paddingBottom: 8,
    borderBottom: isLightDash ? "1px solid rgba(59,130,246,0.12)" : "1px solid rgba(148,163,184,0.18)",
  };

  const tile = (item) => {
    const count = item.badge > 0 ? item.badge : null;
    return (
      <button
        key={item.key}
        type="button"
        onClick={() => setTab(item.key)}
        style={{
          borderRadius: 12,
          padding: isDesktop ? "10px 12px" : "9px 10px",
          minHeight: isDesktop ? 56 : 52,
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          boxSizing: "border-box",
          background: isLightDash ? "rgba(255,255,255,0.85)" : "rgba(51,65,85,0.45)",
          border: isLightDash ? "1px solid rgba(148,163,184,0.25)" : "1px solid rgba(71,85,105,0.5)",
          color: th.txtPrimary,
          transition: "transform .12s ease, box-shadow .12s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-1px)";
          e.currentTarget.style.boxShadow = isLightDash ? "0 6px 16px rgba(59,130,246,0.12)" : "0 6px 16px rgba(0,0,0,0.25)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "";
          e.currentTarget.style.boxShadow = "";
        }}
      >
        <span
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            background: isLightDash ? "linear-gradient(145deg,#eff6ff,#dbeafe)" : "linear-gradient(145deg,#334155,#1e293b)",
          }}
        >
          {item.icon}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: "block",
              fontSize: isDesktop ? 13 : 12,
              fontWeight: 800,
              color: th.txtPrimary,
              lineHeight: 1.25,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {item.label}
          </span>
          {count != null && (
            <span style={{ display: "block", fontSize: 10, fontWeight: 700, color: th.txtMuted, marginTop: 2 }}>
              {count.toLocaleString()}
            </span>
          )}
        </span>
      </button>
    );
  };

  return (
    <div style={{ marginBottom: isDesktop ? 0 : 18 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          margin: "12px 2px 10px",
          color: th.txtPrimary,
          fontSize: isDesktop ? 12 : 11,
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: 0.7,
        }}
      >
        <span>{title}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: isDesktop ? 12 : 10 }}>
        {groups.map((g) => (
          <div key={g.key} style={groupShell}>
            {g.label && (
              <div style={headerStyle}>
                <span style={{ fontSize: 16 }}>{g.icon}</span>
                <span style={{ flex: 1, fontSize: 12, fontWeight: 900, letterSpacing: 0.35, textTransform: "uppercase", color: isLightDash ? "#1e40af" : "#e2e8f0" }}>
                  {g.label.replace(/\s*\([^)]*\)\s*/g, "").trim() || g.label}
                </span>
                <span style={{ fontSize: 10, fontWeight: 800, color: th.txtMuted, padding: "2px 8px", borderRadius: 999, background: isLightDash ? "rgba(59,130,246,0.08)" : "rgba(148,163,184,0.12)" }}>
                  {g.items.length}
                </span>
              </div>
            )}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isDesktop ? "repeat(auto-fill, minmax(168px, 1fr))" : "repeat(2, minmax(0, 1fr))",
                gap: isDesktop ? 8 : 6,
              }}
            >
              {g.items.map(([key]) => {
                const item = metaByKey[key];
                return item ? tile(item) : null;
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
