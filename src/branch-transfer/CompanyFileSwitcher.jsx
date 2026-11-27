import React from "react";

export default function CompanyFileSwitcher({ lang = "en", files = [], activeShopId, homeShopId, onSelect, disabled = false }) {
  if (!files || files.length < 2) return null;
  const bn = lang === "bn";
  const onChange = (e) => {
    const id = e.target.value;
    if (id && onSelect) onSelect(id);
  };
  const atBranch = activeShopId && homeShopId && activeShopId !== homeShopId;
  return (
    <select
      value={activeShopId || homeShopId || ""}
      onChange={onChange}
      disabled={disabled}
      title={bn ? "Company file (Premier)" : "Company file (Premier)"}
      style={{
        border: atBranch ? "1px solid #2563eb" : "1px solid #94a3b8",
        background: atBranch ? "rgba(37,99,235,0.1)" : "rgba(148,163,184,0.12)",
        color: atBranch ? "#1d4ed8" : "#334155",
        borderRadius: 8,
        padding: "4px 6px",
        fontSize: 11,
        fontWeight: 800,
        maxWidth: 200,
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "inherit",
      }}
    >
      {files.map((f) => (
        <option key={f.shopId} value={f.shopId}>
          {f.label}
        </option>
      ))}
    </select>
  );
}