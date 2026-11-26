import React from "react";
import { groupMenuItems } from "./menuGroups.js";
import { GROUP_ACCENTS, TILE_CSS, monogram, tileVars } from "./dashTiles.js";

const MIN_CARD = 110;

/**
 * Grouped quick-launch cards on the dashboard (Masters / Transaction / …).
 * navItems: [{ key, icon, label, badge? }]
 */
export default function DashboardQuickNav({ navItems, lang, isDesktop, isLightDash, th, setTab, title }) {
  const metaByKey = Object.fromEntries(navItems.map((n) => [n.key, n]));
  const groups = groupMenuItems(navItems.map((n) => [n.key, n.label]), lang).filter((g) => g.items.length);

  // dashTiles.js: each card takes its group's accent; a lettered monogram stands where the icon would be
  const card = (item, accent) => (
    <button
      key={item.key}
      type="button"
      className="s4-tile is-click"
      onClick={() => setTab(item.key)}
      style={{
        ...tileVars(accent),
        borderRadius: 14,
        padding: isDesktop ? "12px 8px 12px 12px" : "10px 6px 10px 10px",
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
      {item.icon ? <span style={{ fontSize: isDesktop ? 28 : 25, lineHeight: 1 }}>{item.icon}</span> : <span className="s4-mono" aria-hidden="true">{monogram(item.label)}</span>}
      <span style={{ fontSize: isDesktop ? 13 : 12, fontWeight: 800, color: th.txtPrimary, textAlign: "center", lineHeight: 1.2, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {item.label}
      </span>
    </button>
  );

  // Desktop: the untitled first group (Orders) shows "Quick Navigate" in its title row, level with "Masters".
  const titleInRow = isDesktop && groups.length > 0 && !groups[0].label;

  return (
    <div className={isLightDash ? "s4-dash-light" : "s4-dash-dark"} style={{ marginBottom: isDesktop ? 0 : 18, marginTop: titleInRow ? 12 : 0 }}>
      <style>{TILE_CSS}</style>
      {!titleInRow && <div style={{ margin: "12px 2px 8px", color: th.txtPrimary, fontSize: isDesktop ? 12 : 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.7 }}>
        {title}
      </div>}
      <div style={isDesktop
        ? { display: "flex", flexWrap: "wrap", columnGap: 18, rowGap: 14 }
        : { display: "flex", flexDirection: "column", gap: 12 }}>
        {groups.map((g, gi) => (
          <div key={g.key} style={isDesktop ? { flex: `${g.items.length} 1 ${g.items.length * MIN_CARD + (g.items.length - 1) * 10}px`, minWidth: 0 } : undefined}>
            {/* Desktop: a group without a title (Orders) keeps a title row ("Quick Navigate" for the first one), so its
                cards line up with the cards of the titled group next to it (Masters) */}
            {(g.label || isDesktop) && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 2px 8px" }}>
                {g.label && <span style={{ width: 4, height: 12, borderRadius: 2, background: GROUP_ACCENTS[g.key] || GROUP_ACCENTS.utilities, flexShrink: 0 }} />}
                <span style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", color: g.label ? (isLightDash ? "#1e293b" : "#cbd5e1") : th.txtPrimary, letterSpacing: g.label ? 0.4 : 0.7, whiteSpace: "nowrap" }}>
                  {g.label ? `${g.icon ? `${g.icon} ` : ""}${g.label}` : (gi === 0 && titleInRow ? title : " ")}
                </span>
                {g.label && <span style={{ flex: 1, height: 1, background: isLightDash ? `${GROUP_ACCENTS[g.key] || GROUP_ACCENTS.utilities}33` : "rgba(148,163,184,0.22)" }} />}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: isDesktop ? `repeat(auto-fit, minmax(${MIN_CARD}px, 1fr))` : "repeat(3, minmax(0, 1fr))", gap: isDesktop ? 10 : 8 }}>
              {g.items.map(([key]) => (metaByKey[key] ? card(metaByKey[key], GROUP_ACCENTS[g.key] || GROUP_ACCENTS.utilities) : null))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
