// One look for the dashboard cards (DashboardTab KPI / money cards, DashboardQuickNav launch cards): a colour accent bar
// on the left per card type, a surface tinted toward that colour, soft layered depth, and a small lift on hover for the
// cards that open a page. Light and dark come from the class on the dashboard root (s4-dash-light / s4-dash-dark).
// Colours are 6-digit hex so the alpha steps below are plain hex suffixes (no color-mix, for older Android WebViews).

/** CSS variables for one card's accent colour. */
export const tileVars = (accent = "#2563eb") => ({
  "--acc": accent, "--acc-soft": `${accent}12`, "--acc-tint": `${accent}24`, "--acc-line": `${accent}3d`, "--acc-shadow": `${accent}47`,
});

/** Accent per quick-launch group (dashboard/menuGroups.js keys). */
export const GROUP_ACCENTS = {
  home: "#0284c7", masters: "#2563eb", transaction: "#0d9488", accounts: "#b45309", reports: "#4f46e5", utilities: "#475569",
};

/** Up to two letters for a launch card's monogram: first letter of the first two words, or of the one word. */
export function monogram(label) {
  const words = String(label || "").split(/[\s/()&+,-]+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  const first = (w) => Array.from(w.replace(/^[^\p{L}\p{N}]+/u, ""))[0] || "";
  return (words.length > 1 ? first(words[0]) + first(words[1]) : first(words[0] || "")).toUpperCase();
}

export const TILE_CSS = `
.s4-tile { position: relative; border-radius: 14px; box-sizing: border-box; transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease; }
.s4-dash-light .s4-tile {
  background: #ffffff;
  background: linear-gradient(165deg, #ffffff 0%, #ffffff 50%, var(--acc-soft) 100%);
  border: 1px solid var(--acc-line);
  box-shadow: inset 4px 0 0 var(--acc), 0 1px 2px rgba(15, 23, 42, .06), 0 10px 22px -14px var(--acc-shadow);
}
.s4-dash-dark .s4-tile {
  background: #172033;
  background: linear-gradient(165deg, rgba(30, 41, 59, .97) 0%, rgba(17, 24, 39, .95) 55%, var(--acc-tint) 100%);
  border: 1px solid rgba(148, 163, 184, .16);
  box-shadow: inset 4px 0 0 var(--acc), 0 1px 0 rgba(255, 255, 255, .04) inset, 0 12px 26px -16px rgba(2, 6, 23, .9);
}
.s4-tile.is-click { cursor: pointer; }
.s4-tile.is-click:hover { transform: translateY(-2px); border-color: var(--acc); }
.s4-dash-light .s4-tile.is-click:hover { box-shadow: inset 4px 0 0 var(--acc), 0 2px 4px rgba(15, 23, 42, .06), 0 16px 28px -14px var(--acc-shadow); }
.s4-dash-dark .s4-tile.is-click:hover { box-shadow: inset 4px 0 0 var(--acc), 0 16px 30px -16px rgba(2, 6, 23, .95), 0 0 0 1px var(--acc-line); }
.s4-tile.is-click:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
.s4-tile .s4-dot { width: 8px; height: 8px; border-radius: 2px; background: var(--acc); flex-shrink: 0; }
.s4-tile .s4-mono {
  width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 900; letter-spacing: .3px; color: var(--acc); background: var(--acc-tint); border: 1px solid var(--acc-line);
}
.s4-dash-dark .s4-tile .s4-mono { color: #ffffff; background: var(--acc); border-color: transparent; }
@media (prefers-reduced-motion: reduce) { .s4-tile { transition: none; } .s4-tile.is-click:hover { transform: none; } }
`;
