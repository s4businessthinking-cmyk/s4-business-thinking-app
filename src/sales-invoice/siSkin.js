import { useEffect, useState } from "react";
import { PM_MOBILE_QUERY } from "../product-master/pmStyles";

// Light-background status colours for the Product Master skin.
export const SI_STATUS_COLOR = {
  draft: "#b45309",
  confirmed: "#0e7490",
  partial: "#7e22ce",
  paid: "#15803d",
  cancelled: "#6b7280",
  open: "#0e7490",
  converted: "#15803d",
  invoiced: "#15803d",
};

// Theme handed to shared pickers/typeaheads so they render light inside the skin.
export const PM_TH = {
  bgCard: "#ffffff",
  bgInp: "#ffffff",
  border: "#9fb0c8",
  borderMid: "#8797a9",
  txtPrimary: "#07101c",
  txtSecondary: "#1f2937",
  txtMuted: "#475569",
  txtFaint: "#64748b",
};

const mobileQuery = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(PM_MOBILE_QUERY) : null);

export function usePmMobile() {
  const [mobile, setMobile] = useState(() => !!mobileQuery()?.matches);
  useEffect(() => {
    const query = mobileQuery();
    if (!query) return undefined;
    const onChange = () => setMobile(query.matches);
    onChange();
    query.addEventListener?.("change", onChange);
    return () => query.removeEventListener?.("change", onChange);
  }, []);
  return mobile;
}

// On PC the screen fills exactly the space below the window title, so the page never scrolls.
export function usePmFitHeight(ref, mobile, key) {
  const [height, setHeight] = useState(null);
  useEffect(() => {
    if (mobile) { setHeight(null); return undefined; }
    const fit = () => {
      const el = ref.current; if (!el) return;
      const top = el.getBoundingClientRect().top + (el.parentElement?.scrollTop || 0);
      setHeight(Math.max(420, Math.floor(window.innerHeight - top)));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [ref, mobile, key]);
  return height;
}

export const SI_CSS = `
.si-root {
  background: #f3e6c8; color: #07101c;
  font-family: Tahoma, "MS Sans Serif", Arial, sans-serif; font-size: 11px;
  border: 1px solid #7790b2;
  display: flex; flex-direction: column;
  min-height: 470px;
}
.si-root * { box-sizing: border-box; }
.si-root .pm-reference-title { flex: 0 0 auto; }
.si-root .pm-reference-title strong { display: flex; align-items: center; gap: 6px; }
.si-toolbar {
  flex: 0 0 auto; display: flex; flex-wrap: wrap; align-items: center; gap: 3px;
  padding: 4px; border-bottom: 1px solid #7d94b7;
}
.si-toolbar .pm-btn, .si-toolbar .pm-btn-secondary { height: 26px; min-width: 82px; }
.si-toolbar-gap { flex: 1; }
.si-kpis { flex: 0 0 auto; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; padding: 4px 4px 0; }
.si-kpi {
  border: 1px solid #7d94b7; background: #fffdf6; padding: 3px 7px;
  display: flex; justify-content: space-between; align-items: baseline; gap: 6px; min-width: 0;
}
.si-kpi span { font-size: 10px; color: #334155; white-space: nowrap; }
.si-kpi b { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.si-filters { flex: 0 0 auto; display: flex; flex-wrap: wrap; gap: 4px; padding: 4px; align-items: center; }
.si-filters .si-search { flex: 1 1 220px; position: relative; }
.si-filters .si-search .pm-input { padding-right: 20px; }
.si-filters .si-search button {
  position: absolute; right: 2px; top: 50%; transform: translateY(-50%);
  border: 0; background: none; cursor: pointer; font-size: 11px; color: #475569;
}
.si-pills { display: flex; gap: 2px; flex-wrap: wrap; }
.si-pills > button.is-active { background: #315eb8; color: #fff; border-color: #213f80; }
.si-main { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(220px, 0.38fr) minmax(0, 1fr); gap: 4px; padding: 0 4px 4px; }
.si-main.is-all { grid-template-columns: minmax(0, 1fr); }
.si-box { border: 1px solid #6680a7; background: #fff; overflow: auto; min-height: 0; }
.si-root .pm-table { font-size: 10.5px; }
.si-root .pm-table th { height: 18px; font-size: 10px; padding: 1px 4px; }
.si-root .pm-table td { height: 19px; font-size: 10.5px; padding: 0 4px; border-bottom: 1px solid #e2e8f0; text-overflow: ellipsis; }
.si-root .pm-table td.si-wrap { white-space: normal; overflow-wrap: anywhere; padding-top: 2px; padding-bottom: 2px; }
.si-num { text-align: right !important; }
.si-center { text-align: center !important; }
.si-due { color: #b91c1c; font-weight: 700; }
.si-strong { font-weight: 700; }
.si-muted { color: #475569; }
.si-badge { display: inline-block; padding: 0 5px; border: 1px solid currentColor; font-size: 9.5px; line-height: 13px; white-space: nowrap; background: #fff; }
.si-statusbar { flex: 0 0 auto; display: flex; flex-wrap: wrap; gap: 4px 14px; padding: 3px 6px; border-top: 1px solid #7d94b7; font-size: 10px; color: #334155; }
.si-statusbar b { color: #07101c; }
.si-empty { text-align: center; color: #64748b; padding: 22px 6px; font-size: 11px; }
.si-party-row td:first-child { font-weight: 700; }
.si-match { font-size: 9.5px; color: #15803d; }

.si-body { flex: 1; min-height: 0; overflow: auto; padding: 4px; display: flex; flex-direction: column; gap: 4px; }
.si-cols { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 4px; }
.si-panel-body { display: flex; flex-direction: column; gap: 3px; padding-top: 3px; }
.si-root .pm-form-row { grid-template-columns: 96px minmax(0, 1fr); gap: 4px; }
.si-val {
  min-height: 20px; padding: 2px 4px; border: 1px solid #8797a9; background: #e4e8ed;
  color: #07101c; display: flex; align-items: center; overflow-wrap: anywhere;
}
.si-val.is-strong { font-weight: 700; }
.si-total-row { display: flex; justify-content: space-between; gap: 8px; padding: 2px 2px; border-bottom: 1px dotted #9fb0c8; }
.si-total-row.is-grand { border-bottom: 0; border-top: 1px solid #7d94b7; margin-top: 2px; padding-top: 4px; font-size: 13px; font-weight: 700; }
.si-note { padding: 4px 6px; border: 1px solid #8797a9; background: #fffdf6; white-space: pre-wrap; }
.si-actions { flex: 0 0 auto; display: flex; flex-wrap: wrap; gap: 3px; padding: 4px; border-top: 1px solid #7d94b7; }
.si-actions .pm-btn, .si-actions .pm-btn-secondary { min-width: 90px; height: 28px; }
.si-hint { font-size: 10px; color: #475569; align-self: center; margin-left: 4px; }

.si-types { display: grid; gap: 3px; }
.si-types > button.is-active { background: #315eb8; color: #fff; border-color: #213f80; }
.si-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
.si-grid3 { display: grid; grid-template-columns: minmax(0, 1fr) 70px 62px; gap: 4px; }
.si-field { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.si-entry { border: 1px dashed #7d94b7; background: #fbf4e2; padding: 4px; display: flex; flex-direction: column; gap: 4px; }
.si-history { border: 1px dashed #15803d; background: #f0fdf4; padding: 3px 5px; }
.si-history button {
  display: flex; width: 100%; justify-content: space-between; gap: 6px; padding: 2px 0;
  border: 0; background: none; cursor: pointer; font: inherit; color: #07101c; text-align: left;
}
.si-paid-box { display: flex; justify-content: space-between; align-items: center; padding: 4px 6px; border: 1px solid #15803d; background: #f0fdf4; font-weight: 700; color: #15803d; }
.si-paid-box.is-due { border-color: #b91c1c; background: #fef2f2; color: #b91c1c; }
.si-sticky-actions { position: sticky; bottom: 0; z-index: 5; background: #f3e6c8; }
.si-line-tools { display: flex; gap: 3px; margin-top: 2px; }
.si-line-tools .pm-btn-secondary { min-height: 18px; padding: 0 6px; }
.si-root tr.is-editing { background: #dbeafe; }

@media ${PM_MOBILE_QUERY} {
  .si-root { min-height: 0; border: 0; }
  .si-root .pm-reference-title { height: auto; min-height: 26px; flex-wrap: wrap; gap: 2px 8px; }
  .si-root .pm-reference-title strong { font-size: 14px; }
  .si-root .pm-reference-title span { font-size: 11px; }
  .si-toolbar .pm-btn, .si-toolbar .pm-btn-secondary { flex: 1 1 30%; height: 36px; font-size: 12px; min-width: 0; }
  .si-toolbar-gap { display: none; }
  .si-kpis { grid-template-columns: 1fr 1fr; }
  .si-kpi span { font-size: 11px; }
  .si-kpi b { font-size: 13px; }
  .si-root .pm-input { height: 34px; padding: 4px 7px; font-size: 14px; }
  .si-root select.pm-input { padding: 2px 4px; }
  .si-root textarea.pm-input { height: 64px; }
  .si-pills { flex-wrap: nowrap; overflow-x: auto; width: 100%; }
  .si-pills > button { min-height: 32px; font-size: 12px; flex: 0 0 auto; }
  .si-main, .si-main.is-all { display: block; padding: 0 4px 4px; }
  .si-box { overflow: visible; }
  .si-root .pm-table th { height: 24px; font-size: 12px; }
  .si-root .pm-table td { height: 38px; font-size: 13px; }
  .si-statusbar { font-size: 11px; }
  .si-cols { grid-template-columns: 1fr; }
  .si-root .pm-form-row { grid-template-columns: 100px minmax(0, 1fr); min-height: 34px; }
  .si-root .pm-label { font-size: 12px; line-height: 14px; }
  .si-val { min-height: 32px; font-size: 13px; }
  .si-total-row { font-size: 13px; padding: 4px 2px; }
  .si-total-row.is-grand { font-size: 16px; }
  .si-actions .pm-btn, .si-actions .pm-btn-secondary { flex: 1 1 45%; height: 40px; font-size: 13px; }
  .si-hint { width: 100%; text-align: center; font-size: 11px; }
  .si-types > button { min-height: 38px; font-size: 13px; }
  .si-grid3 { grid-template-columns: minmax(0, 1fr) 76px 64px; }
  .si-history button { font-size: 12px; padding: 4px 0; }
  .si-paid-box { font-size: 14px; padding: 7px 8px; }
  .si-line-tools .pm-btn-secondary { min-height: 30px; padding: 0 10px; font-size: 12px; }
  .si-mrow {
    display: block; width: 100%; text-align: left; padding: 7px 8px; border: 0; border-bottom: 1px solid #cbd5e1;
    background: #fff; font: inherit; color: #07101c; cursor: pointer;
  }
  .si-mrow:active { background: #cfe0f5; }
  .si-mrow-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; }
  .si-mrow-sub { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; color: #475569; margin-top: 2px; }
  .si-mrow-sub b { color: #07101c; }

  /* Entry forms on phones: one clean card per section, labels above fields. */
  .si-root .pm-reference-title { padding: 6px 10px; min-height: 40px; }
  .si-root .pm-reference-title strong { font-size: 15px; }
  .si-body { padding: 10px 8px; gap: 10px; background: #eef2f7; }
  .si-body > .pm-panel {
    background: #fff; border: 1px solid #dbe3ee; border-radius: 12px;
    padding: 10px 12px 12px; box-shadow: 0 1px 3px rgba(15, 23, 42, .08);
  }
  .si-body > .pm-panel > .pm-panel-legend {
    float: left; width: 100%; height: auto; min-width: 0; margin: 0 0 10px; padding: 0 0 8px;
    background: none; border: 0; border-bottom: 1px solid #e2e8f0;
    color: #1e3a8a; font-size: 14px; font-weight: 700; line-height: 18px; text-align: left;
  }
  .si-body > .pm-panel > .pm-panel-legend + * { clear: both; }
  .si-body .si-panel-body { gap: 10px; padding-top: 0; }
  .si-body .pm-form-row:has(.pm-input, input, select, textarea) { display: flex; flex-direction: column; align-items: stretch; gap: 4px; min-height: 0; }
  .si-body .pm-form-row > .pm-label { padding: 0; }
  .si-body .pm-label { font-size: 12px; font-weight: 600; color: #475569; margin: 0; line-height: 15px; }
  .si-body .pm-input {
    height: 42px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 6px 10px;
    font-size: 15px; background: #fff; box-shadow: none;
  }
  .si-body .pm-input:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37, 99, 235, .15); }
  .si-body select.pm-input { padding: 4px 8px; font-weight: 600; }
  .si-body textarea.pm-input { height: auto; min-height: 72px; }
  .si-body .pm-input:disabled, .si-body .pm-input[readonly] { background: #f1f5f9; }
  .si-body .si-val { min-height: 40px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; padding: 6px 10px; font-size: 14px; }
  .si-body .si-entry { border: 1px dashed #93c5fd; background: #f8fbff; border-radius: 10px; padding: 10px; gap: 10px; }
  .si-body .si-grid2, .si-body .si-grid3 { gap: 8px; }
  .si-body .pm-btn, .si-body .pm-btn-secondary { border-radius: 8px; min-height: 40px; font-size: 14px; }
  .si-body .pm-btn--primary { background: linear-gradient(180deg, #3b82f6, #2563eb); border-color: #1d4ed8; color: #fff; box-shadow: none; }
  .si-body .si-paid-box { border-radius: 8px; padding: 9px 10px; }
  .si-body .si-history { border-radius: 8px; }
  .si-body .si-box { border-color: #dbe3ee; border-radius: 8px; overflow: hidden; }
  .si-body .si-total-row { border-bottom: 1px solid #f1f5f9; padding: 6px 2px; font-size: 14px; }
  .si-body .si-total-row.is-grand { font-size: 18px; border-top: 2px solid #e2e8f0; padding-top: 10px; }
  .si-body .pm-hint { font-size: 12px; }
  .si-sticky-actions { background: #fff; border-top: 1px solid #dbe3ee; box-shadow: 0 -2px 8px rgba(15, 23, 42, .08); padding: 8px; gap: 6px; }
  .si-actions .pm-btn, .si-actions .pm-btn-secondary { border-radius: 8px; height: 44px; }
  .si-actions .pm-btn--primary { background: linear-gradient(180deg, #22c55e, #16a34a); border-color: #15803d; color: #fff; box-shadow: none; }
}
`;
