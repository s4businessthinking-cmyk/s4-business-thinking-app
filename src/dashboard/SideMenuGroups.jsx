import React from "react";
import { groupMenuItems, useMenuGroups } from "./menuGroups.js";

// Grouped, foldable menu list for the desktop sidebar and the mobile drawer.
// renderItem(key, label) draws one menu button; colors: { head, headBg, line }.
export default function SideMenuGroups({ items, activeKey, lang, renderItem, colors, compact = false }) {
  const groups = groupMenuItems(items, lang);
  const { isOpen, toggle } = useMenuGroups(activeKey);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 2 : 4 }}>
      {groups.map((g) => {
        const open = isOpen(g.key);
        const hasActive = g.items.some(([k]) => k === activeKey);
        return (
          <div key={g.key} style={{ display: "flex", flexDirection: "column", gap: compact ? 2 : 4 }}>
            {g.label && (
              <button type="button" onClick={() => toggle(g.key)} aria-expanded={open}
                style={{
                  display: "flex", alignItems: "center", gap: 6, marginTop: 6, padding: compact ? "7px 10px" : "6px 10px",
                  border: 0, borderRadius: 7, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                  background: colors.headBg, color: colors.head, fontSize: 11, fontWeight: 900, letterSpacing: 0.4, textTransform: "uppercase",
                  borderLeft: `3px solid ${hasActive ? "#f97316" : colors.line}`,
                }}>
                <span>{g.icon}</span>
                <span style={{ flex: 1 }}>{g.label}</span>
                {!open && <span style={{ fontSize: 10, opacity: 0.75 }}>{g.items.length}</span>}
                <span style={{ fontSize: 10, transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>▶</span>
              </button>
            )}
            {open && g.items.map(([k, label]) => <React.Fragment key={k}>{renderItem(k, label)}</React.Fragment>)}
          </div>
        );
      })}
    </div>
  );
}
