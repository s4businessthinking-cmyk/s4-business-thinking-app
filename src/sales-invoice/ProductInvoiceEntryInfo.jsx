import React from "react";
import { splitRack } from "./SalesInvoiceDesktopForm.jsx";

/**
 * Product cost + rack/floor/bin strip (desktop invoice forms show this under the entry row).
 * Mobile invoice UI reuses this below StockBadge.
 */
export default function ProductInvoiceEntryInfo({
  product,
  lang,
  fmt,
  canSeeCost = true,
  showMrp = true,
}) {
  if (!product) return null;
  const bn = lang === "bn";
  const rack = splitRack(product.rackLocation);
  const loc = [
    rack.rack && `${bn ? "র‍্যাক" : "Rack"}: ${rack.rack}`,
    rack.floor && `${bn ? "ফ্লোর" : "Floor"}: ${rack.floor}`,
    rack.bin && `${bn ? "বিন" : "Bin"}: ${rack.bin}`,
  ].filter(Boolean);

  const chips = [];
  if (showMrp && product.mrp != null && String(product.mrp).trim() !== "") {
    chips.push({ k: bn ? "MRP" : "MRP", v: fmt(product.mrp), color: "#1e3a8a" });
  }
  if (canSeeCost) {
    chips.push({ k: bn ? "ল্যান্ডিং" : "Lnd.", v: fmt(product.landingCost), color: "#1e3a8a" });
    chips.push({ k: bn ? "গড় কস্ট" : "Avg.", v: fmt(product.averageCost || product.landingCost), color: "#1e3a8a" });
  }

  if (!chips.length && !loc.length) return null;

  return (
    <div
      style={{
        margin: "6px 0",
        padding: "8px 10px",
        background: "#eef4fc",
        border: "1px solid #b8c9e6",
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 700,
        color: "#1e293b",
        lineHeight: 1.45,
      }}
    >
      {chips.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginBottom: loc.length ? 6 : 0 }}>
          {chips.map((c) => (
            <span key={c.k}>
              {c.k}: <span style={{ color: c.color }}>{c.v}</span>
            </span>
          ))}
        </div>
      )}
      {loc.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px", color: "#334155" }}>
          <span style={{ opacity: 0.85 }}>📍</span>
          {loc.map((line) => <span key={line}>{line}</span>)}
        </div>
      )}
    </div>
  );
}
