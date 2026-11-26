// The "Warehouse / godown" box on a purchase or sales bill (W01, inventory/billLocation.js). Hidden when the shop has
// only the main location. qtyHere: base qty of the line being entered at the picked location (null = not known yet).
import React from "react";
import { hasGodowns } from "./billLocation.js";
import { locationPath } from "./stockLocations.js";

const fmtQty = (v) => (Math.round((Number(v) || 0) * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });

export default function BillLocationPicker({ locations = [], value, onChange, bn = false, disabled = false, side = "sale", qtyHere = null, unit = "", labelStyle, inputStyle, className, inputClassName }) {
  if (!hasGodowns(locations)) return null;
  const label = side === "purchase" ? (bn ? "কোন গুদামে ঢুকবে" : "Into warehouse / godown") : (bn ? "কোন গুদাম থেকে যাবে" : "From warehouse / godown");
  return (
    <div className={className} style={{ minWidth: 0 }}>
      <div style={labelStyle} className={labelStyle ? undefined : "pm-label"}>{label}</div>
      <select className={inputClassName} style={inputStyle} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
        title={bn ? "স্টক এই গুদামে হিসাব হবে - মোট স্টক একই থাকে" : "The stock is counted at this location - the shop total does not change"}>
        {locations.map((l) => <option key={l.id} value={l.id}>{locationPath(locations, l.id, bn)}</option>)}
      </select>
      {qtyHere != null && (
        <div style={{ fontSize: 11, fontWeight: 700, marginTop: 2, color: qtyHere > 0 ? "#15803d" : "#b45309" }}>
          {bn ? "এখানে আছে" : "Qty here"}: {fmtQty(qtyHere)}{unit ? ` ${unit}` : ""}
        </div>
      )}
    </div>
  );
}
