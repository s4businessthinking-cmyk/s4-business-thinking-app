import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { offlineList } from "../offline/offlineRepository.js";
import { specValues } from "../product-master/productSpecs";

const nsq = (str) => String(str || "").replace(/[\.\-\/\\\s_,]+/g, "").toLowerCase();
const match = (hay, needle) => {
  if (!needle) return true;
  const n = nsq(needle);
  if (nsq(hay).includes(n)) return true;
  return String(hay || "").toLowerCase().includes(needle.toLowerCase());
};

function productHay(p) {
  const codes = [
    p.barcode, p.ean,
    ...(Array.isArray(p.moreBarcodes) ? p.moreBarcodes : []),
    ...(Array.isArray(p.unitPrices) ? p.unitPrices.map((r) => r?.barcode) : []),
  ].filter(Boolean);
  return [p.name, p.code, p.brand, p.company, p.category, p.barcode, codes.join(" "), specValues(p)].filter(Boolean).join(" ");
}

const KIND_META = {
  product: { icon: "📦", bn: "পণ্য", en: "Product" },
  customer: { icon: "👤", bn: "কাস্টমার", en: "Customer" },
  vendor: { icon: "🏭", bn: "সাপ্লায়ার", en: "Vendor" },
  salesInvoice: { icon: "🧾", bn: "বিক্রি বিল", en: "Sales bill" },
  purchaseInvoice: { icon: "📥", bn: "ক্রয় বিল", en: "Purchase bill" },
};

function ResultsList({ results, bn, th, onPick }) {
  if (!results.length) {
    return (
      <div style={{ padding: 18, fontSize: 13, color: th.txtMuted, textAlign: "center" }}>
        {bn ? "কিছু পাওয়া যায়নি" : "No results"}
      </div>
    );
  }
  return results.map((hit) => {
    const m = KIND_META[hit.kind];
    return (
      <button
        key={`${hit.kind}-${hit.id}`}
        type="button"
        onClick={() => onPick(hit)}
        style={{
          width: "100%", textAlign: "left", padding: "14px 14px", border: "none",
          borderBottom: `1px solid ${th.border}`, background: "transparent", cursor: "pointer",
          fontFamily: "inherit", color: th.txtPrimary, WebkitTapHighlightColor: "transparent",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 800 }}>
          {m.icon} {hit.title}
          <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: th.txtMuted }}>{bn ? m.bn : m.en}</span>
        </div>
        {hit.sub && <div style={{ fontSize: 12, color: th.txtMuted, marginTop: 4 }}>{hit.sub}</div>}
      </button>
    );
  });
}

export default function AppGlobalSearch({
  lang, th, glassCard,
  products = [], customers = [], vendors = [],
  can = {},
  onNavigate,
  isMobile = false,
  showBar = true,
}) {
  const bn = lang === "bn";
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [invoiceHits, setInvoiceHits] = useState([]);
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const inputRef = useRef(null);
  const wrapRef = useRef(null);

  const needle = q.trim();
  const canProduct = can.products;
  const canCustomer = can.customers;
  const canVendor = can.vendors;
  const canSales = can.sales;
  const canPurchase = can.purchase;
  const any = canProduct || canCustomer || canVendor || canSales || canPurchase;

  const staticHits = useMemo(() => {
    if (needle.length < 2) return [];
    const out = [];
    const cap = 8;
    if (canProduct) {
      for (const p of products) {
        if (!match(productHay(p), needle)) continue;
        out.push({ kind: "product", id: p.id, title: p.name || "—", sub: [p.code, p.brand].filter(Boolean).join(" · ") });
        if (out.filter((h) => h.kind === "product").length >= cap) break;
      }
    }
    if (canCustomer) {
      for (const c of customers) {
        const hay = [c.customerName, c.customerCode, c.mobileNumber, c.phoneNumber, c.trnNumber, c.address].join(" ");
        if (!match(hay, needle)) continue;
        out.push({ kind: "customer", id: c.id, title: c.customerName || "—", sub: c.mobileNumber || c.phoneNumber || "" });
        if (out.filter((h) => h.kind === "customer").length >= cap) break;
      }
    }
    if (canVendor) {
      for (const v of vendors) {
        const hay = [v.vendorName, v.vendorCode, v.mobileNumber, v.phoneNumber, v.trnNumber, v.address].join(" ");
        if (!match(hay, needle)) continue;
        out.push({ kind: "vendor", id: v.id, title: v.vendorName || "—", sub: v.mobileNumber || v.phoneNumber || "" });
        if (out.filter((h) => h.kind === "vendor").length >= cap) break;
      }
    }
    return out;
  }, [needle, products, customers, vendors, canProduct, canCustomer, canVendor]);

  useEffect(() => {
    if (needle.length < 2 || (!canSales && !canPurchase)) {
      setInvoiceHits([]);
      return undefined;
    }
    let cancelled = false;
    setInvoiceBusy(true);
    const t = setTimeout(async () => {
      try {
        const hits = [];
        if (canSales) {
          const res = await offlineList("salesInvoices");
          const rows = (res.records || []).map((r) => ({ ...r.data, id: r.data?.id || r.document_id || r.id }));
          for (const inv of rows) {
            if (inv.status === "cancelled" || inv.isDeleted) continue;
            const hay = [inv.invoiceNo, inv.customerName, inv.customerMobile, inv.refNo, inv.note].join(" ");
            if (!match(hay, needle)) continue;
            hits.push({
              kind: "salesInvoice", id: inv.id,
              title: inv.invoiceNo || "—",
              sub: `${inv.customerName || ""} · ${String(inv.invoiceDate || "").slice(0, 10)}`,
            });
            if (hits.filter((h) => h.kind === "salesInvoice").length >= 8) break;
          }
        }
        if (canPurchase) {
          const res = await offlineList("purchaseInvoices");
          const rows = (res.records || []).map((r) => ({ ...r.data, id: r.data?.id || r.document_id || r.id }));
          for (const inv of rows) {
            if (inv.status === "cancelled" || inv.isDeleted) continue;
            const hay = [inv.invoiceNo, inv.supplierInvoiceNo, inv.vendorName, inv.refNo, inv.note].join(" ");
            if (!match(hay, needle)) continue;
            hits.push({
              kind: "purchaseInvoice", id: inv.id,
              title: inv.supplierInvoiceNo || inv.invoiceNo || "—",
              sub: `${inv.vendorName || ""} · ${String(inv.invoiceDate || "").slice(0, 10)}`,
            });
            if (hits.filter((h) => h.kind === "purchaseInvoice").length >= 8) break;
          }
        }
        if (!cancelled) setInvoiceHits(hits);
      } catch {
        if (!cancelled) setInvoiceHits([]);
      } finally {
        if (!cancelled) setInvoiceBusy(false);
      }
    }, 220);
    return () => { cancelled = true; clearTimeout(t); };
  }, [needle, canSales, canPurchase]);

  const results = useMemo(() => {
    const merged = [...staticHits, ...invoiceHits];
    const order = ["product", "customer", "vendor", "salesInvoice", "purchaseInvoice"];
    merged.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
    return merged.slice(0, 20);
  }, [staticHits, invoiceHits]);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    setOpen(false);
    setQ("");
  }, []);

  const pick = useCallback((hit) => {
    closeSheet();
    onNavigate?.(hit);
  }, [onNavigate, closeSheet]);

  const openSheet = useCallback(() => {
    setSheetOpen(true);
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  useEffect(() => {
    const onDoc = (e) => {
      if (!isMobile && wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
    };
  }, [isMobile]);

  useEffect(() => {
    const onFocus = () => {
      if (isMobile) openSheet();
      else {
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("s4-focus-global-search", onFocus);
    return () => window.removeEventListener("s4-focus-global-search", onFocus);
  }, [isMobile, openSheet]);

  useEffect(() => {
    if (!isMobile || !sheetOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [isMobile, sheetOpen]);

  if (!any) return null;

  const placeholder = bn
    ? (isMobile ? "পণ্য, কাস্টমার, বিল, সাপ্লায়ার…" : "গ্লোবাল সার্চ — পণ্য, কাস্টমার, বিল, সাপ্লায়ার… (Ctrl+K)")
    : (isMobile ? "Product, customer, bill, vendor…" : "Global search — product, customer, bill, vendor… (Ctrl+K)");

  if (isMobile && !sheetOpen && !showBar) return null;

  if (isMobile && !sheetOpen) {
    return (
      <div style={{ padding: "6px 8px 4px", background: th.bgPage || "transparent" }}>
        <button
          type="button"
          onClick={openSheet}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 10,
            padding: "11px 12px", borderRadius: 10, border: `1px solid ${th.borderMid}`,
            background: th.bgInp || th.bgCard, color: th.txtMuted, fontSize: 14, fontWeight: 700,
            fontFamily: "inherit", textAlign: "left", cursor: "pointer",
          }}
        >
          <span style={{ fontSize: 18 }}>🔎</span>
          <span style={{ flex: 1 }}>{bn ? "সব জিনিস খুঁজুন…" : "Search everything…"}</span>
        </button>
      </div>
    );
  }

  if (isMobile && sheetOpen) {
    const sheet = (
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed", inset: 0, zIndex: 10050,
          display: "flex", flexDirection: "column",
          background: th.bgCard, color: th.txtPrimary,
          paddingTop: "max(8px, env(safe-area-inset-top))",
          paddingBottom: "max(8px, env(safe-area-inset-bottom))",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderBottom: `1px solid ${th.border}` }}>
          <button type="button" onClick={closeSheet} style={{
            border: "none", background: th.bgInp, color: th.txtPrimary, borderRadius: 8,
            padding: "8px 12px", fontSize: 14, fontWeight: 800, fontFamily: "inherit",
          }}>
            {bn ? "← বন্ধ" : "← Close"}
          </button>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            style={{
              flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: 8,
              border: `1px solid ${th.borderMid}`, background: th.bgInp, color: th.txtPrimary,
              fontSize: 16, fontWeight: 600, fontFamily: "inherit", outline: "none",
            }}
          />
          {invoiceBusy && <span style={{ fontSize: 12, color: th.txtMuted, paddingRight: 4 }}>…</span>}
        </div>
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          {needle.length < 2 ? (
            <div style={{ padding: 20, fontSize: 13, color: th.txtMuted, textAlign: "center" }}>
              {bn ? "কমপক্ষে ২ অক্ষর লিখুন" : "Type at least 2 characters"}
            </div>
          ) : (
            <ResultsList results={results} bn={bn} th={th} onPick={pick} />
          )}
        </div>
      </div>
    );
    return createPortal(sheet, document.body);
  }

  return (
    <div ref={wrapRef} style={{ ...glassCard, borderRadius: 14, padding: "10px 12px", marginTop: 6, marginBottom: 6, position: "relative", zIndex: 30 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 18 }}>🔎</span>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setOpen(false); e.target.blur(); }
            if (e.key === "Enter" && results[0]) pick(results[0]);
          }}
          placeholder={placeholder}
          style={{
            flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent",
            color: th.txtPrimary, fontSize: 13, fontWeight: 600, fontFamily: "inherit",
          }}
        />
        {invoiceBusy && <span style={{ fontSize: 11, color: th.txtMuted }}>…</span>}
      </div>
      {open && needle.length >= 2 && (
        <div style={{
          position: "absolute", left: 8, right: 8, top: "100%", marginTop: 6,
          maxHeight: 320, overflowY: "auto", borderRadius: 12,
          background: th.bgCard, border: `1px solid ${th.borderMid}`,
          boxShadow: "0 16px 40px rgba(0,0,0,0.35)",
        }}>
          <ResultsList results={results} bn={bn} th={th} onPick={pick} />
        </div>
      )}
    </div>
  );
}
