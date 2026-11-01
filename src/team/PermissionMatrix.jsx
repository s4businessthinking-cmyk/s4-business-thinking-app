import { MATRIX_ACTIONS, MATRIX_GROUPS, MATRIX_ROWS, OWNER_ONLY_AREAS, countOn, matrixKeys, rowSpans, setMatrixFlags } from "./permissionMatrix.js";

function Cell({ isOn, onClick, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 26, height: 26, borderRadius: 7, cursor: disabled ? "default" : "pointer",
        border: isOn ? "1px solid #ea580c" : "1px solid #52525b",
        background: isOn ? "#f97316" : "transparent",
        color: "#fff", fontSize: 14, fontWeight: 800, lineHeight: "22px", padding: 0,
        opacity: disabled ? 0.6 : 1,
      }}
    >{isOn ? "✓" : ""}</button>
  );
}

export default function PermissionMatrix({ lang = "bn", th, perms = {}, onToggle, onSetFlags, readOnly = false, compact = false }) {
  const L = (bn, en) => (lang === "bn" ? bn : en);
  const txt = th?.txtPrimary || "#e4e4e7";
  const border = th?.border || "#3f3f46";
  const muted = "#71717a";
  const toggle = (key) => { if (!readOnly && key) onToggle?.(key, !(perms[key] === true)); };
  const setAll = (on) => {
    if (readOnly) return;
    const next = setMatrixFlags(on, perms);
    if (onSetFlags) onSetFlags(next);
    else matrixKeys().forEach((k) => onToggle?.(k, on));
  };
  const chipBtn = (on) => ({
    fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 999, cursor: readOnly ? "default" : "pointer",
    border: `1px solid ${on ? "#ea580c" : border}`,
    background: on ? "rgba(249,115,22,.16)" : "transparent",
    color: on ? "#ea580c" : muted, fontFamily: "inherit",
  });
  const thStyle = { fontSize: 10, color: muted, fontWeight: 800, textTransform: "uppercase", padding: "4px 2px", textAlign: "center", whiteSpace: "nowrap" };
  const tdCenter = { textAlign: "center", padding: compact ? "3px 2px" : "5px 2px", borderTop: `1px solid ${border}` };

  return (
    <div>
      {!readOnly && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 8 }}>
          <button type="button" style={chipBtn(true)} onClick={() => setAll(true)}>☑ {L("সব টিক", "Select all")}</button>
          <button type="button" style={chipBtn(false)} onClick={() => setAll(false)}>☐ {L("সব খালি", "Clear all")}</button>
          <span style={{ fontSize: 11, color: muted }}>{countOn(perms)}/{matrixKeys().length}</span>
        </div>
      )}
      <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, textAlign: "left" }}>{L("মেনু", "Menu")}</th>
            {MATRIX_ACTIONS.map((a) => <th key={a.key} style={thStyle}>{a[lang] || a.en}</th>)}
            <th style={{ ...thStyle, textAlign: "left" }}>{L("আরও", "More")}</th>
          </tr>
        </thead>
        <tbody>
          {MATRIX_GROUPS.map((g) => (
            [
              <tr key={`g_${g.key}`}>
                <td colSpan={MATRIX_ACTIONS.length + 2} style={{ fontSize: 11, fontWeight: 800, color: "#f97316", padding: "10px 2px 4px" }}>{g[lang] || g.en}</td>
              </tr>,
              ...MATRIX_ROWS.filter((r) => r.group === g.key).map((row) => (
                <tr key={row.key}>
                  <td style={{ fontSize: 12, color: txt, padding: compact ? "3px 4px" : "5px 4px", borderTop: `1px solid ${border}` }}>{row[lang] || row.en}</td>
                  {rowSpans(row).map((sp) => (
                    <td key={sp.from} colSpan={sp.span} style={tdCenter}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                        {sp.span > 1 && <span style={{ flex: 1, height: 1, background: perms[sp.key] === true ? "#f97316" : border, maxWidth: 40 }} />}
                        <Cell isOn={perms[sp.key] === true} disabled={readOnly || !sp.key} onClick={() => toggle(sp.key)} />
                        {sp.span > 1 && <span style={{ flex: 1, height: 1, background: perms[sp.key] === true ? "#f97316" : border, maxWidth: 40 }} />}
                      </div>
                    </td>
                  ))}
                  <td style={{ padding: "3px 2px", borderTop: `1px solid ${border}` }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {(row.extras || []).map((x) => {
                        const isOn = perms[x.key] === true;
                        return (
                          <button key={x.key} type="button" disabled={readOnly} onClick={() => toggle(x.key)}
                            style={{
                              fontSize: 11, padding: "3px 8px", borderRadius: 999, cursor: readOnly ? "default" : "pointer",
                              border: isOn ? "1px solid #ea580c" : `1px solid ${border}`,
                              background: isOn ? "rgba(249,115,22,.18)" : "transparent",
                              color: isOn ? "#f97316" : muted, fontWeight: 700,
                            }}>{isOn ? "✓ " : ""}{x[lang] || x.en}</button>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              )),
            ]
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 11, color: muted, marginTop: 8, lineHeight: 1.5 }}>
        {L("প্রতি ঘরে টিক আছে। পাশাপাশি একই টিক হলে সেগুলো একসাথে চালু/বন্ধ হয়। টেমপ্লেটের ডিফল্ট থাকে; মালিক বাকি টিক ইচ্ছেমতো দিতে পারেন। ",
          "Every cell has a tick. Neighbouring cells that share a switch turn on together. Templates keep their defaults; the owner can grant any remaining tick. ")}
        🔒 {OWNER_ONLY_AREAS[lang] || OWNER_ONLY_AREAS.en}
      </div>
      </div>
    </div>
  );
}
