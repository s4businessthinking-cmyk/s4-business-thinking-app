import React, { useState } from "react";
import {
  authLogin,
  createInventoryItem,
  fetchInventoryItems,
  fetchStockBalances,
  fetchStockLedger,
  postStockOpening,
} from "./erpApi";

export default function InventoryTestPanel() {
  const [email, setEmail] = useState("admin@s4.local");
  const [password, setPassword] = useState("Admin@12345");
  const [sku, setSku] = useState("TST-100");
  const [name, setName] = useState("Test Spare Part");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState(null);
  const [items, setItems] = useState([]);
  const [balances, setBalances] = useState([]);
  const [ledger, setLedger] = useState([]);

  const ensureSession = async () => {
    if (session?.token && session?.tenant?.id) return session;
    const loginRes = await authLogin({
      email,
      password,
      device_fingerprint: "inventory-dashboard",
      device_name: "Inventory Dashboard",
      platform: "web",
      tenant_slug: "s4-demo",
    });
    if (!loginRes.ok || !loginRes.data?.success) {
      throw new Error(loginRes.data?.error?.message || "Login failed");
    }
    const nextSession = {
      token: loginRes.data.access_token,
      tenant: loginRes.data.tenant,
    };
    setSession(nextSession);
    return nextSession;
  };

  const refreshData = async (token, tenantId) => {
    const [itemsRes, balRes, ledRes] = await Promise.all([
      fetchInventoryItems(token, tenantId),
      fetchStockBalances(token, tenantId),
      fetchStockLedger(token, tenantId),
    ]);
    if (itemsRes.ok) setItems(itemsRes.data?.items || []);
    if (balRes.ok) setBalances(balRes.data?.balances || []);
    if (ledRes.ok) setLedger(ledRes.data?.entries || []);
  };

  const onLoad = async () => {
    setBusy(true);
    setError("");
    try {
      const active = await ensureSession();
      await refreshData(active.token, active.tenant.id);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const onCreateItem = async () => {
    setBusy(true);
    setError("");
    try {
      const active = await ensureSession();
      const createRes = await createInventoryItem(active.token, active.tenant.id, {
        sku,
        name,
        brand: "TestBrand",
        uom_code: "PCS",
        category_code: "SPARES",
        standard_rate: 15.5,
      });
      if (!createRes.ok || !createRes.data?.success) {
        throw new Error(createRes.data?.error?.message || "Create item failed");
      }
      const item = createRes.data.item;
      const openRes = await postStockOpening(active.token, active.tenant.id, {
        item_id: item.id,
        qty: 10,
        valuation_rate: 15.5,
        idempotency_key: `opening-${item.id}-${Date.now()}`,
        remarks: "Dashboard test opening",
      });
      if (!openRes.ok || !openRes.data?.success) {
        throw new Error(openRes.data?.error?.message || "Opening stock failed");
      }
      await refreshData(active.token, active.tenant.id);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 16, marginBottom: 12 }}>STAGE 5 — Inventory Core (Live)</h2>
      <div style={{ border: "1px solid #27272a", borderRadius: 14, padding: 16, background: "#111113" }}>
        <div style={{ display: "grid", gap: 10, maxWidth: 520 }}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" style={inputStyle} />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" style={inputStyle} />
          <button onClick={onLoad} disabled={busy} style={buttonStyle}>
            {busy ? "Loading..." : "Load Items + Stock Balance + Ledger"}
          </button>
        </div>

        <div style={{ marginTop: 14, display: "grid", gap: 10, maxWidth: 520 }}>
          <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU" style={inputStyle} />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Item name" style={inputStyle} />
          <button onClick={onCreateItem} disabled={busy} style={buttonStyleAlt}>
            Create Item + Post Opening Stock (10 PCS)
          </button>
        </div>

        {items.length > 0 && (
          <div style={{ marginTop: 14, fontSize: 13, color: "#86efac", lineHeight: 1.7 }}>
            Items: {items.length} — {items.slice(0, 5).map((i) => i.sku).join(", ")}
            {items.length > 5 ? "..." : ""}
          </div>
        )}
        {balances.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 13, color: "#93c5fd", lineHeight: 1.6 }}>
            Stock balances: {balances.map((b) => `${b.item_sku}=${b.on_hand_qty}`).join(" · ")}
          </div>
        )}
        {ledger.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 13, color: "#fde68a" }}>
            Latest ledger: {ledger[0]?.voucher_type} {ledger[0]?.direction} {ledger[0]?.qty} ({ledger[0]?.item_sku})
          </div>
        )}

        {error && <div style={{ marginTop: 12, color: "#f87171", fontSize: 14 }}>{error}</div>}
      </div>
    </section>
  );
}

const inputStyle = {
  background: "#09090b",
  border: "1px solid #3f3f46",
  borderRadius: 8,
  color: "#e4e4e7",
  padding: "10px 12px",
};

const buttonStyle = {
  background: "#7c3aed",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "10px 12px",
  fontWeight: 700,
  cursor: "pointer",
};

const buttonStyleAlt = {
  background: "#b45309",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "10px 12px",
  fontWeight: 700,
  cursor: "pointer",
};
