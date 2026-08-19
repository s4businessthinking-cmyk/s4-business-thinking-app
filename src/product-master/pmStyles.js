// Windows/ERP skin for the Product Master screen. Mirrors the supplied
// product-master package (Tailwind erp-* tokens + globals.css) as plain CSS,
// scoped under .pm-root so it cannot leak into the rest of the dark-themed app.
export const PM_COLORS = {
  headerFrom: "#d9e7f7",
  headerTo: "#7ea1d4",
  border: "#7d94b7",
  panel: "#f3e6c8",
  bar: "#315eb8",
  body: "#f3e6c8",
  text: "#07101c",
};

export const PM_CSS = `
.pm-root {
  background: ${PM_COLORS.body};
  color: ${PM_COLORS.text};
  padding: 0;
  font-family: Tahoma, "MS Sans Serif", Arial, sans-serif;
  font-size: 11px;
  border: 1px solid #7790b2;
  min-width: 760px;
  width: 100%;
  height: 100%;
  min-height: 489px;
  overflow: hidden;
}
.pm-root *, .pm-window * { box-sizing: border-box; }

.pm-reference-title {
  height: 22px;
  padding: 2px 5px;
  background: linear-gradient(180deg, #dce9f8 0%, #91acd2 58%, #789bcf 100%);
  border-bottom: 1px solid #6c87af;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #064e22;
  letter-spacing: .2px;
}
.pm-reference-title strong { font-size: 13px; }
.pm-reference-title span {
  align-self: flex-end;
  color: #1f2937;
  font-size: 10px;
  font-weight: 400;
  letter-spacing: 0;
}
.pm-reference-grid {
  display: grid;
  grid-template-columns: minmax(280px, 38.3fr) minmax(315px, 40.2fr) minmax(180px, 21.5fr);
  grid-template-rows: minmax(344px, 1fr) 110px;
  gap: 4px;
  padding: 4px 4px 5px;
  height: calc(100% - 22px);
  overflow: hidden;
}
.pm-reference-left, .pm-reference-middle, .pm-reference-right { min-width: 0; }
.pm-reference-left { grid-column: 1; grid-row: 1; }
.pm-reference-middle {
  grid-column: 2;
  grid-row: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.pm-reference-right {
  grid-column: 3;
  grid-row: 1 / span 2;
  min-height: 0;
}

.pm-panel {
  border: 1px solid ${PM_COLORS.border};
  border-radius: 0;
  background: transparent;
  min-width: 0;
  margin: 0;
  padding: 4px 5px 5px;
}
.pm-panel-legend {
  min-width: 156px;
  height: 14px;
  margin-left: 7px;
  padding: 1px 8px 2px;
  text-align: center;
  background: linear-gradient(180deg, #4b70c2, #315bb4);
  color: #fff;
  border: 1px solid #8ca4c8;
  font-size: 10px;
  font-weight: 400;
  line-height: 10px;
}
.pm-details-panel { width: 100%; height: 100%; padding-top: 2px; }
.pm-details-body { height: 100%; display: flex; flex-direction: column; justify-content: space-between; gap: 5px; }
.pm-form-row {
  display: grid;
  grid-template-columns: 81px minmax(0, 1fr);
  align-items: center;
  min-height: 20px;
}
.pm-form-row > .pm-label { padding-left: 1px; }
.pm-barcode-row { grid-template-columns: 81px minmax(0, .57fr) minmax(110px, .43fr); }
.pm-barcode-checks {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding-left: 8px;
  line-height: 11px;
}
.pm-ean-row { grid-template-columns: 81px minmax(0, .56fr) minmax(110px, .44fr); gap: 4px; }
.pm-unit-row { grid-template-columns: 81px minmax(0, 1fr) 91px; gap: 4px; }
.pm-shop-part-row { grid-template-columns: 81px minmax(0, 1fr) 91px; gap: 4px; }
.pm-arabic-row { grid-template-columns: 81px minmax(0, 1fr) 31px; gap: 3px; }
.pm-lang-btn {
  height: 23px;
  border: 1px solid #59789c;
  background: linear-gradient(90deg, #2d8dba 0 52%, #0aab60 52%);
  color: #fff;
  font: 10px Tahoma, sans-serif;
  cursor: pointer;
}

.pm-field { min-width: 0; }
.pm-label {
  display: block;
  font-size: 10px;
  font-weight: 700;
  color: #07101c;
  margin: 0 0 2px;
  line-height: 11px;
}
.pm-input {
  width: 100%;
  height: 20px;
  border: 1px solid #8797a9;
  border-radius: 0;
  padding: 1px 4px;
  font: 11px Tahoma, "MS Sans Serif", Arial, sans-serif;
  background: #fff;
  color: ${PM_COLORS.text};
  outline: none;
  box-shadow: inset 1px 1px 1px rgba(0,0,0,.12);
}
.pm-input:focus { border-color: #315fa8; box-shadow: inset 1px 1px 1px rgba(0,0,0,.14), 0 0 0 1px #b8d4f5; }
.pm-input:disabled, .pm-input[readonly] { background: #e4e8ed; color: #475569; }
textarea.pm-input { resize: vertical; }
.pm-check { display: inline-flex; align-items: center; gap: 3px; font-size: 10px; color: #07101c; white-space: nowrap; }
.pm-check input { margin: 0; width: 11px; height: 11px; }

.pm-btn, .pm-btn-secondary, .pm-btn-danger {
  min-height: 21px;
  padding: 2px 7px;
  font: 10px Tahoma, "MS Sans Serif", Arial, sans-serif;
  border-radius: 2px;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: inset 1px 1px 0 rgba(255,255,255,.9), inset -1px -1px 0 rgba(35,64,104,.45);
}
.pm-btn, .pm-btn-secondary, .pm-btn-danger {
  border: 1px solid #41658e;
  background: linear-gradient(180deg, #f8fbff 0%, #d4e3f4 49%, #a8c5e6 51%, #e4effa 100%);
  color: #07101c;
}
.pm-btn:hover:enabled, .pm-btn-secondary:hover:enabled, .pm-btn-danger:hover:enabled {
  background: linear-gradient(180deg, #fff 0%, #e7f1fc 49%, #b9d5f1 51%, #f3f8fd 100%);
}
.pm-btn:active:enabled, .pm-btn-secondary:active:enabled, .pm-btn-danger:active:enabled { transform: translateY(1px); }
.pm-btn:disabled, .pm-btn-secondary:disabled, .pm-btn-danger:disabled { opacity: .45; cursor: not-allowed; }

.pm-pricing-stack { height: auto; flex: 0 0 auto; display: flex; flex-direction: column; gap: 4px; }
.pm-tax-row { display: grid; grid-template-columns: 46% 1fr; gap: 25px; height: 54px; }
.pm-tax-panel { height: 54px; }
.pm-tax-controls { display: grid; grid-template-columns: 1fr 1fr; gap: 11px; }
.pm-average-cost { display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: center; padding-top: 8px; font-weight: 700; }
.pm-price-panel { height: 72px; padding-top: 3px; }
.pm-panel-body { padding: 0; }
.pm-price-panel .pm-grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px 16px; }
.pm-mrp-line { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 5px; align-items: center; }

.pm-selling-panel { min-height: 210px; flex: 1; padding-top: 2px; }
.pm-selling-panel .pm-panel-legend { min-width: 274px; text-align: left; margin-left: 0; }
.pm-selling-body { height: 100%; display: flex; flex-direction: column; gap: 3px; }
.pm-selling-panel.is-disabled .pm-selling-body {
  opacity: .46;
  filter: grayscale(.45);
}
.pm-selling-panel.is-disabled .pm-panel-legend::after {
  content: " — Disabled";
  color: #e4edf8;
}
.pm-selling-panel:not(.is-disabled) .pm-panel-legend::after {
  content: " — Enabled";
  color: #d8ffe5;
}
.pm-selling-top { display: grid; grid-template-columns: minmax(0, 1fr) 69px 109px; gap: 4px; align-items: end; }
.pm-selling-top > .pm-btn-secondary { height: 23px; }
.pm-link-btn {
  color: #244cb0;
  border: 0;
  background: none;
  padding: 0;
  font: 9px Tahoma, sans-serif;
  text-decoration: underline;
  cursor: pointer;
  white-space: nowrap;
}
.pm-selling-top > .pm-link-btn { align-self: center; margin-top: 11px; }
.pm-selling-fields { display: grid; grid-template-columns: 27% 29% 22% 22%; gap: 3px; }
.pm-selling-alt { display: grid; grid-template-columns: 27% minmax(0, 1fr) 89px; gap: 3px; align-items: end; }
.pm-selling-alt > .pm-btn { height: 19px; min-height: 19px; }
.pm-selling-table { min-height: 88px; flex: 1; overflow: auto; }

.pm-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 9px; background: #fff; }
.pm-table th {
  text-align: left;
  height: 14px;
  padding: 1px 3px;
  background: linear-gradient(180deg, #3f69bd, #2854ad);
  color: #fff;
  font-weight: 400;
  position: sticky;
  top: 0;
  z-index: 1;
  border-right: 1px solid #8fa8d0;
  border-bottom: 1px solid #23498f;
  white-space: nowrap;
  overflow: hidden;
}
.pm-table td {
  height: 13px;
  padding: 0 3px;
  border-bottom: 0;
  overflow: hidden;
  text-overflow: clip;
  white-space: nowrap;
  color: #111827;
}
.pm-table tbody tr.pm-clickable { cursor: pointer; }
.pm-table tbody tr.pm-clickable:hover { background: #cfe0f5; }
.pm-table tbody tr.pm-selected { background: #8eafe0; }
.pm-table-wrap { border: 1px solid #7088aa; border-radius: 0; overflow: auto; background: #fff; }
.pm-empty { text-align: center; color: #64748b; padding: 18px 6px; font-size: 10px; }
.pm-link-danger { background: none; border: none; color: #dc2626; cursor: pointer; font-family: inherit; font-size: 11.5px; padding: 0; }
.pm-link-danger:hover { text-decoration: underline; }

.pm-list {
  height: 100%;
  border: 1px solid #6680a7;
  background: #fff;
  overflow: hidden;
}
.pm-list-scroll { height: 100%; overflow: auto; background: #fff; }
.pm-list .pm-table { table-layout: fixed; }
.pm-list .pm-table th:nth-child(1) { width: 53%; }
.pm-list .pm-table th:nth-child(2) { width: 47%; }
.pm-list.pm-list--shop-parts .pm-table th:nth-child(1) { width: 46%; }
.pm-list.pm-list--shop-parts .pm-table th:nth-child(2) { width: 24%; }
.pm-list.pm-list--shop-parts .pm-table th:nth-child(3) { width: 30%; }
.pm-list .pm-table td {
  height: 13px;
  font-size: 9px;
  line-height: 11px;
  padding: 0 2px;
}

.pm-suggest {
  position: absolute; z-index: 30; left: 0; right: 0; top: 100%;
  margin-left: 81px;
  background: #fff; border: 1px solid #5f789b; max-height: 190px; overflow: auto;
  box-shadow: 0 6px 16px rgba(15,23,42,.22);
}
.pm-suggest button {
  display: block; width: 100%; text-align: left; padding: 4px 8px;
  font-size: 10px; font-family: inherit; background: none; border: none; cursor: pointer; color: ${PM_COLORS.text};
}
.pm-suggest button:hover { background: #eff6ff; }

.pm-actions {
  grid-column: 1 / 3;
  grid-row: 2;
  display: grid;
  grid-template-columns: 48.5% 51.5%;
  gap: 4px;
  min-width: 0;
}
.pm-actions-left, .pm-actions-middle { min-width: 0; display: flex; flex-direction: column; }
.pm-actions-left { justify-content: space-between; }
.pm-multi-rate-check { font-weight: 700; margin-top: 25px; }
.pm-master-tools { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 2px; }
.pm-master-tools .pm-btn-secondary { padding-left: 2px; padding-right: 2px; }
.pm-tool-wide { grid-column: 1 / span 2; }
.pm-tool-photo { grid-column: 3 / span 3; }
.pm-actions-middle { justify-content: space-between; padding: 0 3px; }
.pm-opening-tools { display: grid; grid-template-columns: 1.25fr .75fr; gap: 5px; padding-left: 126px; }
.pm-weighing-btn { align-self: flex-end; width: 73%; }
.pm-primary-actions { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 2px; height: 39px; }
.pm-primary-actions .pm-btn { height: 39px; line-height: 11px; white-space: normal; }

/* F10 Search Product window — based on product-SEARCH.zip and the supplied
   desktop screenshot. It deliberately uses a slightly greener/steel-blue
   palette so the search window remains visually distinct from Product Master. */
.pm-search-backdrop {
  position: fixed;
  inset: 0;
  z-index: 5000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 20px;
  background: rgba(15, 31, 51, .48);
}
.pm-search-window {
  width: min(1100px, calc(100vw - 40px));
  height: min(760px, calc(100dvh - 24px));
  min-height: 540px;
  display: grid;
  grid-template-rows: 27px minmax(0, 1fr) auto;
  overflow: hidden;
  border: 2px solid #385d78;
  background: ${PM_COLORS.body};
  color: #08131d;
  font-family: Tahoma, "MS Sans Serif", Arial, sans-serif;
  box-shadow: 0 16px 45px rgba(0, 0, 0, .45);
}
.pm-search-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 4px;
  border-bottom: 1px solid #527791;
  background: linear-gradient(180deg, #edf7f8 0%, #b8d7dc 48%, #6fa6b2 100%);
  color: #07533d;
}
.pm-search-title strong { font-size: 13px; }
.pm-search-title button {
  width: 24px;
  height: 20px;
  padding: 0;
  border: 1px solid #477087;
  background: linear-gradient(180deg, #f8fdff, #a9cbd5);
  color: #173342;
  cursor: pointer;
  font: 11px Tahoma, sans-serif;
}
.pm-search-content {
  min-height: 0;
  display: grid;
  grid-template-rows: auto 23px minmax(0, 1fr);
  gap: 5px;
  padding: 10px 16px 0;
}
.pm-search-fields {
  position: relative;
  margin: 0;
  padding: 9px 10px 6px;
  border: 1px solid #7894aa;
  background: ${PM_COLORS.body};
}
.pm-search-fields legend {
  padding: 0 4px;
  font-size: 11px;
  font-weight: 700;
}
.pm-search-control-hint {
  position: absolute;
  top: -17px;
  right: 2px;
  color: #a11f28;
  font-size: 10px;
}
.pm-search-field-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 7px 11px;
}
.pm-search-field {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.pm-search-field > span {
  font-size: 11px;
  font-weight: 700;
  text-decoration: underline;
  white-space: nowrap;
  overflow: hidden;
}
.pm-search-field input {
  width: 100%;
  height: 26px;
  padding: 2px 5px;
  border: 1px solid #758797;
  border-radius: 0;
  background: #fff;
  color: #08131d;
  font: 12px Tahoma, sans-serif;
  box-shadow: inset 1px 1px 1px rgba(0, 0, 0, .14);
  outline: none;
}
.pm-search-field input:focus {
  border-color: #176d88;
  box-shadow: inset 1px 1px 1px rgba(0, 0, 0, .14), 0 0 0 1px #66b6c9;
}
.pm-search-command {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 43px;
  gap: 16px;
  align-items: end;
}
.pm-search-command button,
.pm-search-close {
  height: 27px;
  border: 1px solid #53758c;
  border-radius: 0;
  background: linear-gradient(180deg, #f8fdff 0%, #d9e8ef 48%, #abc8d7 52%, #eaf3f6 100%);
  color: #08131d;
  font: 700 12px Tahoma, sans-serif;
  cursor: pointer;
  box-shadow: inset 1px 1px 0 #fff, inset -1px -1px 0 rgba(38, 79, 99, .35);
}
.pm-search-command button:hover,
.pm-search-close:hover { filter: brightness(1.04); }
.pm-search-command .pm-search-lang {
  height: 34px;
  color: #fff;
  background: linear-gradient(90deg, #247eab 0 52%, #0aa45c 52%);
}
.pm-search-results-title {
  display: flex;
  align-items: end;
  justify-content: space-between;
  padding: 0 1px;
  font-size: 11px;
}
.pm-search-results-title span { font-size: 9px; color: #375468; }
.pm-search-grid-wrap {
  min-height: 0;
  overflow: auto;
  border: 1px solid #6f8799;
  background: #fff;
  outline: none;
}
.pm-search-grid-wrap:focus { box-shadow: 0 0 0 2px #3b91a5; }
.pm-search-grid {
  width: 100%;
  min-width: 800px;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 10px;
}
.pm-search-grid th {
  position: sticky;
  top: 0;
  z-index: 1;
  height: 20px;
  padding: 2px 3px;
  border-right: 1px solid #9aa7ae;
  border-bottom: 1px solid #8a989f;
  background: linear-gradient(180deg, #f8fafb, #e1e5e7);
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  font-weight: 700;
}
.pm-search-grid td {
  height: 19px;
  padding: 2px 3px;
  border-right: 1px solid #aeb8bd;
  border-bottom: 1px solid #b8c0c4;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.pm-search-grid tbody tr { cursor: default; }
.pm-search-grid tbody tr:not(.pm-search-empty-row):hover { background: #d8edf1; }
.pm-search-grid tbody tr.is-selected { background: #86bdcb; color: #071d25; }
.pm-search-empty-row td {
  height: 90px;
  text-align: center;
  color: #647680;
}
.pm-search-footer {
  position: relative;
  min-height: 64px;
  padding: 4px 14px 7px 18px;
  border-top: 1px solid #7f98aa;
  background: ${PM_COLORS.body};
}
.pm-search-options {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-right: 90px;
}
.pm-search-options label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
}
.pm-search-options input { width: 13px; height: 13px; margin: 0; }
.pm-search-options span { margin-left: 9px; color: #a21f32; }
.pm-search-close {
  position: absolute;
  top: 4px;
  right: 14px;
  width: 61px;
}
.pm-search-columns-link {
  position: absolute;
  right: 14px;
  bottom: 5px;
  padding: 0;
  border: 0;
  background: none;
  color: #163d9d;
  font: 10px Tahoma, sans-serif;
  text-decoration: underline;
  cursor: pointer;
}
.pm-search-column-settings {
  position: fixed;
  left: 50%;
  top: 50%;
  z-index: 5200;
  width: min(440px, calc(100vw - 24px));
  transform: translate(-50%, -50%);
  border: 2px solid #42687a;
  background: #bed4ce;
  box-shadow: 0 12px 35px rgba(0, 0, 0, .45);
  color: #07101c;
  font-family: Tahoma, "MS Sans Serif", Arial, sans-serif;
}
.pm-search-column-settings__title {
  height: 25px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 5px 2px 8px;
  background: linear-gradient(180deg, #e9f5ef, #79ae9c);
  border-bottom: 1px solid #4e796c;
}
.pm-search-column-settings__title strong { font-size: 12px; color: #075439; }
.pm-search-column-settings__title button {
  width: 22px;
  height: 20px;
  padding: 0;
  border: 1px solid #52766b;
  background: linear-gradient(180deg, #fff, #b7d4ca);
  cursor: pointer;
}
.pm-search-column-settings__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 44px;
  grid-template-rows: minmax(220px, 1fr) auto auto;
  gap: 7px 8px;
  padding: 10px;
}
.pm-search-column-settings__list {
  min-height: 220px;
  overflow: auto;
  border: 2px solid #202020;
  background: #fff;
}
.pm-search-column-settings__head {
  height: 22px;
  padding: 3px 7px;
  background: #050505;
  color: #fff;
  text-align: center;
  font-weight: 700;
}
.pm-search-column-settings__list > button {
  width: 100%;
  display: block;
  padding: 2px 8px;
  border: 0;
  background: #fff;
  color: #07101c;
  text-align: left;
  font: 700 11px Tahoma, sans-serif;
  cursor: pointer;
}
.pm-search-column-settings__list > button:hover { background: #e2f1eb; }
.pm-search-column-settings__list > button.is-selected { background: #7fb09f; color: #042b1f; }
.pm-search-column-settings__arrows {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.pm-search-column-settings__arrows button {
  width: 38px;
  height: 42px;
  border: 1px solid #456d5f;
  background: linear-gradient(180deg, #f7fff8, #b9d7c7);
  color: #35b50f;
  font: 700 34px/34px Tahoma, sans-serif;
  cursor: pointer;
}
.pm-search-column-settings__width {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: 45px minmax(0, 1fr) 50px;
  gap: 7px;
  align-items: center;
}
.pm-search-column-settings__width label { font-weight: 700; }
.pm-search-column-settings__width input {
  min-width: 0;
  height: 24px;
  border: 1px solid #728a82;
  background: #fff;
  font: 12px Tahoma, sans-serif;
}
.pm-search-column-settings__width button,
.pm-search-column-settings__actions button {
  height: 25px;
  border: 1px solid #52766b;
  background: linear-gradient(180deg, #fff, #b7d4ca);
  font: 11px Tahoma, sans-serif;
  cursor: pointer;
}
.pm-search-column-settings__actions {
  grid-column: 1 / -1;
  display: flex;
  justify-content: space-between;
}
.pm-search-column-settings__actions button { min-width: 58px; }
.pm-search-column-settings__actions button:last-child { margin-left: auto; }

/* Modal "window" system */
.pm-backdrop {
  position: fixed; inset: 0; z-index: 400; background: rgba(15,23,42,.45);
  display: flex; align-items: flex-start; justify-content: center; padding: 26px 12px; overflow: auto;
}
.pm-window {
  width: 100%; background: ${PM_COLORS.panel};
  border: 1px solid ${PM_COLORS.border}; border-radius: 6px;
  box-shadow: 0 18px 44px rgba(2,6,23,.5);
  color: ${PM_COLORS.text}; font-family: inherit;
}
.pm-window-title {
  background: linear-gradient(180deg, ${PM_COLORS.headerFrom}, ${PM_COLORS.headerTo});
  border-bottom: 1px solid ${PM_COLORS.border};
  padding: 6px 10px; border-radius: 6px 6px 0 0;
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  font-size: 12.5px; font-weight: 700; color: #1e293b;
}
.pm-window-close {
  background: none; border: none; cursor: pointer; font-size: 14px;
  font-weight: 800; color: #334155; padding: 0 3px; line-height: 1; font-family: inherit;
}
.pm-window-close:hover { color: #dc2626; }
.pm-window-body { padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.pm-window-foot { display: flex; justify-content: flex-end; gap: 7px; padding-top: 3px; }
.pm-hint { font-size: 11.5px; color: #475569; }
.pm-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.pm-grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 8px; }
.pm-grid-6 { display: grid; grid-template-columns: repeat(6, minmax(0,1fr)); gap: 7px; align-items: end; }
.pm-inline { display: grid; grid-template-columns: 1fr auto; gap: 7px; align-items: end; }
.pm-btn--primary { font-weight: 700; }
.pm-btn--danger { color: #8b1111; }

/* Additional Barcode confirmation and entry windows */
.pm-confirm-dialog {
  min-height: 74px;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 13px;
  align-items: center;
  padding: 5px 9px;
  background: #d3e1f1;
  border: 1px solid #8da4c1;
}
.pm-confirm-dialog__icon {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 2px solid #2f62a8;
  background: #fff;
  color: #24599f;
  font: 700 24px Georgia, serif;
}
.pm-confirm-dialog__message { font-size: 12px; line-height: 17px; }
.pm-confirm-dialog__actions { display: flex; justify-content: center; gap: 10px; }
.pm-confirm-dialog__actions .pm-btn { min-width: 70px; }
.pm-additional-barcodes {
  min-height: 270px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 84px;
  gap: 12px;
}
.pm-additional-barcodes__main { min-width: 0; display: flex; flex-direction: column; gap: 7px; }
.pm-additional-barcodes__input { display: grid; grid-template-columns: 86px minmax(0, 1fr); align-items: center; }
.pm-additional-barcodes__input .pm-label { margin: 0; }
.pm-additional-barcodes__actions { display: flex; flex-direction: column; gap: 8px; padding-top: 18px; }
.pm-additional-barcodes__actions .pm-btn { width: 100%; }
.pm-additional-barcodes__list,
.pm-master-list {
  min-height: 190px;
  flex: 1;
  overflow: auto;
  border: 1px solid #6d83a2;
  background: #fff;
}
.pm-additional-barcodes__head,
.pm-additional-barcodes__list > button,
.pm-master-list__head,
.pm-master-list > button {
  width: 100%;
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  min-height: 22px;
  align-items: center;
  padding: 0;
  border: 0;
  border-bottom: 1px solid #bdc8d2;
  background: #fff;
  color: #07101c;
  text-align: left;
  font: 11px Tahoma, sans-serif;
}
.pm-additional-barcodes__head,
.pm-master-list__head {
  position: sticky;
  top: 0;
  z-index: 1;
  background: linear-gradient(180deg, #f8fafc, #d9e1e8);
  font-weight: 700;
}
.pm-additional-barcodes__head span,
.pm-additional-barcodes__list > button span,
.pm-master-list__head span,
.pm-master-list > button span { height: 100%; padding: 4px 6px; border-right: 1px solid #aab7c4; }
.pm-additional-barcodes__list > button:hover,
.pm-master-list > button:hover { background: #d8e7f5; }
.pm-additional-barcodes__list > button.is-selected,
.pm-master-list > button.is-selected { background: #87afe0; }
.pm-additional-barcodes__empty { padding: 28px 8px; text-align: center; color: #607080; }

/* UNIT and CUSTOMER TYPE CREATION windows */
.pm-unit-master {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 285px;
  gap: 11px 14px;
}
.pm-unit-master__form {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  border: 1px solid #8197b5;
  background: #b8cce5;
}
.pm-unit-master__form > .pm-field {
  display: grid;
  grid-template-columns: 145px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}
.pm-unit-master__form > .pm-field .pm-label { margin: 0; }
.pm-unit-master__equals > .pm-label { margin-bottom: 4px; }
.pm-unit-master__equals > div { display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 7px; }
.pm-unit-master__print {
  white-space: normal;
  align-items: flex-start;
  font-size: 11px;
  line-height: 15px;
}
.pm-unit-master__print input { margin-top: 2px; }
.pm-unit-master__browser { min-width: 0; display: grid; grid-template-rows: auto 20px minmax(0, 1fr); gap: 3px; }
.pm-unit-master__browser > .pm-label span { color: #9a1d28; font-weight: 400; }
.pm-unit-master__browser .pm-master-list { min-height: 245px; }
.pm-master-actions {
  display: flex;
  justify-content: flex-end;
  gap: 7px;
}
.pm-master-actions .pm-btn { min-width: 68px; }
.pm-unit-master__actions { grid-column: 1 / -1; }
.pm-customer-master { display: flex; flex-direction: column; gap: 9px; }
.pm-customer-master > .pm-field {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}
.pm-customer-master > .pm-field .pm-label { margin: 0; }
.pm-customer-master__list { min-height: 190px; max-height: 260px; }

/* Per-shop configurable Shop Part Number pattern builder */
.pm-shop-part-format {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(230px, .65fr);
  gap: 12px;
}
.pm-shop-part-format__builder,
.pm-shop-part-format__preview {
  padding: 10px;
  border: 1px solid #8197b5;
  background: #b8cce5;
}
.pm-shop-part-format__builder { display: flex; flex-direction: column; gap: 11px; }
.pm-shop-part-format__tokens {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
}
.pm-shop-part-format__tokens > span { width: 100%; font-weight: 700; }
.pm-shop-part-format__tokens .pm-btn-secondary { flex: 1; min-width: 82px; }
.pm-shop-part-format__options {
  display: grid;
  grid-template-columns: .65fr 1fr 1.15fr;
  gap: 8px;
}
.pm-shop-part-format__preview { display: flex; flex-direction: column; gap: 9px; }
.pm-shop-part-format__preview > strong {
  padding: 3px 6px;
  background: linear-gradient(180deg, #4b70c2, #315bb4);
  color: #fff;
  text-align: center;
}
.pm-shop-part-format__result {
  min-height: 40px;
  display: grid;
  place-items: center;
  padding: 6px;
  border: 2px inset #dbe8f5;
  background: #fff;
  color: #074b2c;
  font: 700 18px "Courier New", monospace;
  overflow-wrap: anywhere;
}
.pm-shop-part-format__examples {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 7px;
  border: 1px solid #8ca0b8;
  background: #d9e5f1;
  font-size: 10px;
}
.pm-shop-part-format__apply {
  grid-column: 1 / -1;
  white-space: normal;
  font-size: 11px;
  line-height: 15px;
}
.pm-shop-part-format > .pm-master-actions { grid-column: 1 / -1; }

@media (max-width: 759px) {
  .pm-root { min-width: 0; min-height: 0; height: auto; overflow: visible; }
  .pm-reference-grid {
    display: flex;
    flex-direction: column;
    height: auto;
    overflow: visible;
  }
  .pm-reference-left, .pm-reference-middle, .pm-reference-right { width: 100%; }
  .pm-details-panel { height: auto; }
  .pm-selling-panel { height: auto; }
  .pm-list { height: 60vh; }
  .pm-actions { display: flex; flex-direction: column; min-height: 250px; }
  .pm-actions-left, .pm-actions-middle { min-height: 120px; }
  .pm-opening-tools { padding-left: 0; }
  .pm-input { padding: 7px; font-size: 14px; }
  .pm-btn, .pm-btn-secondary, .pm-btn-danger { padding: 9px 12px; font-size: 13px; }
  .pm-quick-bar { position: sticky; top: 0; z-index: 40; display: flex; gap: 7px; padding: 7px 0; background: ${PM_COLORS.body}; }
  .pm-quick-bar > button { flex: 1; }
  .pm-search-backdrop { padding: 0; align-items: stretch; }
  .pm-search-window {
    width: 100vw;
    height: 100dvh;
    min-height: 0;
    border-width: 0;
    grid-template-rows: 34px minmax(0, 1fr) auto;
  }
  .pm-search-title { padding: 4px 7px; }
  .pm-search-content {
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    padding: 10px 8px 0;
  }
  .pm-search-fields { padding: 10px 7px 7px; }
  .pm-search-control-hint {
    position: static;
    display: block;
    margin-bottom: 6px;
    text-align: right;
  }
  .pm-search-field-grid { grid-template-columns: 1fr 1fr; gap: 7px; }
  .pm-search-field input { height: 36px; font-size: 14px; }
  .pm-search-command { grid-column: 1 / -1; }
  .pm-search-command button { height: 38px; font-size: 14px; }
  .pm-search-grid-wrap { min-height: 300px; height: 46dvh; flex: none; }
  .pm-search-footer { min-height: 91px; padding-left: 8px; }
  .pm-search-options { padding-right: 70px; }
  .pm-search-options label { align-items: flex-start; font-size: 11px; }
  .pm-search-options span { display: none; }
  .pm-search-columns-link { left: 8px; right: auto; }
  .pm-backdrop { align-items: flex-start; padding: 8px; }
  .pm-window { max-width: 100% !important; border-radius: 2px; }
  .pm-window-title { min-height: 35px; font-size: 14px; border-radius: 2px 2px 0 0; }
  .pm-window-close { min-width: 34px; min-height: 30px; font-size: 18px; }
  .pm-window-body { padding: 10px; }
  .pm-confirm-dialog { grid-template-columns: 38px minmax(0, 1fr); }
  .pm-confirm-dialog__message { font-size: 14px; }
  .pm-additional-barcodes { min-height: calc(100dvh - 90px); grid-template-columns: 1fr; grid-template-rows: minmax(0, 1fr) auto; }
  .pm-additional-barcodes__actions { flex-direction: row; padding-top: 0; }
  .pm-additional-barcodes__actions .pm-btn { flex: 1; }
  .pm-additional-barcodes__input { grid-template-columns: 75px minmax(0, 1fr); }
  .pm-additional-barcodes__list { min-height: 45dvh; }
  .pm-unit-master { grid-template-columns: 1fr; }
  .pm-unit-master__form > .pm-field { grid-template-columns: 1fr; gap: 2px; }
  .pm-unit-master__form { gap: 8px; }
  .pm-unit-master__browser .pm-master-list { min-height: 38dvh; }
  .pm-unit-master__actions { grid-column: auto; position: sticky; bottom: 0; padding: 5px 0; background: ${PM_COLORS.panel}; }
  .pm-master-actions .pm-btn { min-width: 0; flex: 1; }
  .pm-customer-master > .pm-field { grid-template-columns: 1fr; gap: 2px; }
  .pm-customer-master__list { min-height: 45dvh; max-height: none; }
  .pm-shop-part-format { grid-template-columns: 1fr; }
  .pm-shop-part-format__options { grid-template-columns: 1fr; }
  .pm-shop-part-format__apply,
  .pm-shop-part-format > .pm-master-actions { grid-column: auto; }
}

.pm-clear-products { display: grid; gap: 14px; }
.pm-clear-products__warning {
  display: grid;
  gap: 5px;
  padding: 12px;
  border: 1px solid #fecaca;
  border-left: 4px solid #dc2626;
  background: #fef2f2;
  color: #7f1d1d;
}
.pm-clear-products__warning strong { font-size: 14px; }
.pm-clear-products__warning span { font-size: 12px; line-height: 1.45; }
.pm-clear-products__steps {
  margin: 0;
  padding-left: 22px;
  color: ${PM_COLORS.text};
  font-size: 12px;
  line-height: 1.65;
}
.pm-import-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin: 8px 0;
  padding: 8px 10px;
  border: 1px solid ${PM_COLORS.border};
  background: #f8fafc;
  color: ${PM_COLORS.text};
  font-size: 11px;
}
@media (min-width: 760px) { .pm-quick-bar { display: none; } }
`;
