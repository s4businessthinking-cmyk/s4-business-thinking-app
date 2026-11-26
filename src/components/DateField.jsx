// Date field that always shows day/month/year (DD/MM/YYYY) in the closed box.
// Native <input type="date"> on Android/WebView often shows month/day from the device locale;
// lang="en-GB" is ignored there. Value stored/returned stays ISO YYYY-MM-DD.
// Drop-in: same value/onChange(event) contract as <input type="date">.
import React, { useRef } from "react";
import { formatDateDmY, isoDateOnly } from "./dateFieldFormat.js";

export default function DateField({
  value = "",
  onChange,
  className = "",
  style,
  disabled = false,
  readOnly = false,
  title,
  placeholder = "dd/mm/yyyy",
  min,
  max,
  required,
  name,
  id,
  ...rest
}) {
  const iso = isoDateOnly(value);
  const nativeRef = useRef(null);
  const openPicker = () => {
    if (disabled || readOnly) return;
    const el = nativeRef.current;
    if (!el) return;
    try {
      if (typeof el.showPicker === "function") el.showPicker();
      else el.click();
    } catch {
      el.click();
    }
  };
  return (
    <div style={{ position: "relative", display: "inline-block", width: style?.width || "100%", minWidth: 0, verticalAlign: "top" }}>
      <input
        type="text"
        inputMode="none"
        readOnly
        disabled={disabled}
        title={title || "dd/mm/yyyy"}
        placeholder={placeholder}
        value={formatDateDmY(iso)}
        onClick={openPicker}
        onFocus={openPicker}
        className={className}
        style={{
          width: "100%",
          boxSizing: "border-box",
          cursor: disabled || readOnly ? "default" : "pointer",
          ...(style || {}),
        }}
        {...rest}
      />
      <input
        ref={nativeRef}
        type="date"
        lang="en-GB"
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled || readOnly}
        value={iso}
        min={min}
        max={max}
        required={required}
        name={name}
        id={id}
        onChange={(e) => onChange?.(e)}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: "100%",
          height: "100%",
          opacity: 0,
          pointerEvents: "none",
          border: 0,
          padding: 0,
          margin: 0,
        }}
      />
    </div>
  );
}

export { formatDateDmY, isoDateOnly };
