/** Shared compact layout + PM/beige chrome for PI / SI / vouchers / ledger windows. */
import { PM_COLORS } from "../product-master/pmStyles.js";

const C = {
  head: PM_COLORS.bar,
  bar: PM_COLORS.bar,
  panel: PM_COLORS.panel,
  border: PM_COLORS.border,
};

export const DOC_FONT = 'Tahoma, "MS Sans Serif", Arial, sans-serif';

export function docWinFrameStyle(max) {
  return {
    position: "fixed",
    inset: max ? 0 : "18px 28px",
    zIndex: 1500,
    background: PM_COLORS.body,
    padding: max ? 4 : "0 4px 4px",
    boxSizing: "border-box",
    overflowX: "auto",
    overflowY: "hidden",
    display: "flex",
    flexDirection: "column",
    border: max ? "none" : "1px solid #7790b2",
    boxShadow: max ? "none" : "0 18px 50px rgba(2,6,23,0.45)",
    fontFamily: DOC_FONT,
  };
}

/** Same band as Product Master / Loosening (.pm-reference-title). */
export function docWinTitleChrome(max) {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    margin: max ? "-4px -4px 2px" : "0 -4px 2px",
    padding: "2px 6px 2px 10px",
    background: "linear-gradient(180deg, #dce9f8 0%, #91acd2 58%, #789bcf 100%)",
    borderBottom: "1px solid #6c87af",
    color: "#064e22",
    fontSize: 12,
    fontWeight: 800,
    userSelect: "none",
    flexShrink: 0,
    fontFamily: DOC_FONT,
  };
}

/** Modal / voucher title (not full-screen invoice shell). */
export const docModalTitleChrome = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  padding: "5px 6px 5px 10px",
  background: "linear-gradient(180deg, #dce9f8 0%, #91acd2 58%, #789bcf 100%)",
  borderBottom: "1px solid #6c87af",
  color: "#064e22",
  fontWeight: 800,
  fontSize: 13,
  userSelect: "none",
  fontFamily: DOC_FONT,
};

export const DOC_SHELL_CSS = `
.s4-doc-desktop-shell {
  flex: 1 1 0;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-self: stretch;
}
`;

export const docHdrGrid = { display: "grid", gridTemplateColumns: "130px 1fr 150px", gap: 8, padding: "8px 10px 4px", background: C.panel, flexShrink: 0, alignItems: "stretch" };
export const docTitleBar = {
  position: "relative",
  border: `1px solid ${C.bar}`,
  borderRadius: 4,
  background: "linear-gradient(180deg,#fffdf6,#f3e6c8)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 36,
};
export const docTitleText = { fontSize: 16, fontWeight: 900, letterSpacing: 0.3 };
export const docNoHead = { background: C.head, color: "#fff", textAlign: "center", fontSize: 12, fontWeight: 800, padding: "1px 0" };
export const docNoValue = { textAlign: "center", fontSize: 15, fontWeight: 900, color: "#111", padding: "3px 0" };
export const docNoBox = { border: `1px solid ${C.bar}`, borderRadius: 4, overflow: "hidden", background: "#fff", alignSelf: "stretch" };
export const docFieldLbl = { fontSize: 10, fontWeight: 700, color: PM_COLORS.text, whiteSpace: "nowrap", lineHeight: 1.05, marginBottom: 0 };
export const docInlineRow = { display: "flex", alignItems: "center", gap: 3, minWidth: 0 };
export const docInlineLbl = { ...docFieldLbl, flexShrink: 0 };
export const docPartyRow = (cols) => ({
  display: "grid",
  gridTemplateColumns: cols,
  gap: 8,
  padding: "4px 10px 6px",
  background: C.panel,
  borderBottom: `1px solid ${C.border}`,
  flexShrink: 0,
  alignItems: "end",
});
export const docEntryRow = { padding: "2px 6px", background: "#fffdf6", borderBottom: `1px solid ${C.border}`, flexShrink: 0 };
export const docEntryGrid = (cols) => ({ display: "grid", gridTemplateColumns: cols, gap: 4, alignItems: "end" });
export const docProductStrip = { display: "flex", gap: 10, marginTop: 1, fontSize: 10.5, fontWeight: 700, flexWrap: "wrap", lineHeight: 1.15 };
export const docItemsPane = {
  flex: "1 1 0",
  minHeight: 100,
  overflow: "auto",
  background: "#fff",
  borderBottom: `1px solid ${C.border}`,
};
export const docFooterGrid = {
  display: "grid",
  gridTemplateColumns: "minmax(0,1fr) minmax(0,0.85fr) 248px",
  gap: 4,
  padding: "2px 6px",
  background: C.panel,
  flexShrink: 0,
  alignItems: "start",
};
export const docFooterCol = { display: "grid", gap: 2, alignContent: "start" };
export const docFooterTotals = { display: "grid", gap: 2, alignContent: "start", background: "#fffdf6", border: `1px solid ${C.border}`, padding: "3px 5px", borderRadius: 2 };
export const docFooterFieldRow = (labelWidth = 76) => ({
  display: "flex",
  alignItems: "center",
  gap: 3,
  minWidth: 0,
  labelWidth,
});
export const docActionBar = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 4,
  padding: "2px 6px",
  background: "#eef2f7",
  borderTop: `1px solid ${C.border}`,
  flexShrink: 0,
};
export const docTotalBar = { display: "flex", justifyContent: "space-between", alignItems: "center", background: C.bar, color: "#fff", padding: "1px 5px", borderRadius: 2, minHeight: 22 };
export const docTotalAmt = { fontSize: 13, fontWeight: 900 };
export const docSummaryLine = { display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700, lineHeight: 1.2 };