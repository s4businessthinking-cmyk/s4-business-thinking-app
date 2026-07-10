import { useEffect, useId, useRef, useState } from "react";
import { filterProducts, findExactProductMatch } from "../utils/productSearch";

export function ProductTypeaheadInput({
  products = [],
  value = "",
  onChange,
  onSelectProduct,
  placeholder = "",
  style = {},
  inputRef,
  onKeyDown,
  field = "any",
  th,
  lang = "en",
  disabled = false,
  autoFocus = false,
}) {
  const listId = useId();
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const suggestions = open ? filterProducts(products, value, { field, limit: 8 }) : [];

  useEffect(() => {
    setActiveIndex(0);
  }, [value, open]);

  useEffect(() => {
    const onDocDown = (event) => {
      if (!wrapRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  const pickProduct = (product) => {
    if (!product) return;
    onSelectProduct?.(product);
    setOpen(false);
  };

  const handleBlur = () => {
    window.setTimeout(() => {
      if (!wrapRef.current?.contains(document.activeElement)) {
        setOpen(false);
        const exact = findExactProductMatch(products, field === "code" ? { code: value } : { name: value });
        if (exact && value.trim()) pickProduct(exact);
      }
    }, 140);
  };

  const handleKeyDown = (event) => {
    if (event.key === "ArrowDown" && suggestions.length) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((idx) => (idx + 1) % suggestions.length);
      return;
    }

    if (event.key === "ArrowUp" && suggestions.length) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((idx) => (idx - 1 + suggestions.length) % suggestions.length);
      return;
    }

    if (event.key === "Enter" && open && suggestions.length) {
      event.preventDefault();
      pickProduct(suggestions[activeIndex] || suggestions[0]);
      return;
    }

    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    onKeyDown?.(event);
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%" }}>
      <input
        ref={inputRef}
        autoFocus={autoFocus}
        disabled={disabled}
        role="combobox"
        aria-expanded={open && suggestions.length > 0}
        aria-controls={listId}
        style={style}
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          onChange?.(event.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (String(value || "").trim()) setOpen(true);
        }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />

      {open && suggestions.length > 0 && (
        <div
          id={listId}
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 1200,
            background: th?.bgCard || "#18181b",
            border: `1px solid ${th?.border || "#3f3f46"}`,
            borderRadius: 10,
            maxHeight: 220,
            overflowY: "auto",
            boxShadow: "0 12px 28px rgba(0,0,0,0.35)",
          }}
        >
          {suggestions.map((product, index) => (
            <button
              key={product.id}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pickProduct(product)}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "10px 12px",
                border: "none",
                borderBottom: `1px solid ${th?.border || "#27272a"}`,
                background: index === activeIndex ? "rgba(99,102,241,0.12)" : "transparent",
                color: th?.txtSecondary || "#d4d4d8",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: th?.txtPrimary || "#fafafa" }}>
                {product.name}
              </div>
              <div style={{ fontSize: 11, color: th?.txtMuted || "#71717a", marginTop: 2 }}>
                {[product.code, product.brand, product.category].filter(Boolean).join(" · ")}
              </div>
            </button>
          ))}
        </div>
      )}

      {open && String(value || "").trim() && suggestions.length === 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 1200,
            background: th?.bgCard || "#18181b",
            border: `1px solid ${th?.border || "#3f3f46"}`,
            borderRadius: 10,
            padding: "10px 12px",
            fontSize: 12,
            color: th?.txtMuted || "#71717a",
          }}
        >
          {lang === "bn" ? "কোনো পণ্য পাওয়া যায়নি" : "No matching product"}
        </div>
      )}
    </div>
  );
}
