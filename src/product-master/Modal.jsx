import React, { useEffect } from "react";

const WIDTHS = { xs: 320, sm: 400, md: 480, lg: 560, xl: 720 };

export default function Modal({ title, onClose, children, width = "lg" }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div className="pm-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pm-window" style={{ maxWidth: WIDTHS[width] || WIDTHS.lg }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="pm-window-title">
          <span>{title}</span>
          <button type="button" className="pm-window-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="pm-window-body">{children}</div>
      </div>
    </div>
  );
}
