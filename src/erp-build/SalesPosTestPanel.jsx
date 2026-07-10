import React, { useState } from "react";
import {
  authLogin,
  confirmSalesOrder,
  createDeliveryFromSo,
  createPosSale,
  createSalesOrder,
  fetchCustomers,
  fetchDeliveries,
  fetchInventoryItems,
  fetchPosSales,
  fetchPosTerminals,
  fetchSalesOrders,
  fetchStockBalances,
  postDelivery,
  postPosSale,
} from "./erpApi";

export default function SalesPosTestPanel() {
  const [email, setEmail] = useState("admin@s4.local");
  const [password, setPassword] = useState("Admin@12345");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [terminals, setTerminals] = useState([]);
  const [posSales, setPosSales] = useState([]);
  const [balances, setBalances] = useState([]);
  const [flowResult, setFlowResult] = useState(null);

  const ensureSession = async () => {
    if (session?.token && session?.tenant?.id) return session;
    const loginRes = await authLogin({
      email,
      password,
      device_fingerprint: "sales-pos-dashboard",
      device_name: "Sales POS Dashboard",
      platform: "web",
      tenant_slug: "s4-demo",
    });
    if (!loginRes.ok || !loginRes.data?.success) throw new Error(loginRes.data?.error?.message || "Login failed");
    const nextSession = { token: loginRes.data.access_token, tenant: loginRes.data.tenant };
    setSession(nextSession);
    return nextSession;
  };

  const refreshData = async (token, tenantId) => {
    const [custRes, soRes, delRes, termRes, posRes, balRes] = await Promise.all([
      fetchCustomers(token, tenantId),
      fetchSalesOrders(token, tenantId),
      fetchDeliveries(token, tenantId),
      fetchPosTerminals(token, tenantId),
      fetchPosSales(token, tenantId),
      fetchStockBalances(token, tenantId),
    ]);
    if (custRes.ok) setCustomers(custRes.data?.customers || []);
    if (soRes.ok) setOrders(soRes.data?.sales_orders || []);
    if (delRes.ok) setDeliveries(delRes.data?.deliveries || []);
    if (termRes.ok) setTerminals(termRes.data?.terminals || []);
    if (posRes.ok) setPosSales(posRes.data?.pos_sales || []);
    if (balRes.ok) setBalances(balRes.data?.balances || []);
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

  const onRunSalesFlow = async () => {
    setBusy(true);
    setError("");
    setFlowResult(null);
    try {
      const active = await ensureSession();
      const token = active.token;
      const tenantId = active.tenant.id;
      const itemsRes = await fetchInventoryItems(token, tenantId);
      const customer = customers[0];
      const terminal = terminals[0];
      if (!itemsRes.ok || !itemsRes.data?.items?.length) throw new Error("No items for sale");
      if (!customer) throw new Error("No customer — load data first");
      if (!terminal) throw new Error("No POS terminal — load data first");
      const item = itemsRes.data.items[0];

      const soRes = await createSalesOrder(token, tenantId, {
        customer_id: customer.id,
        remarks: "Dashboard SO test",
        lines: [{ item_id: item.id, qty: 1, rate: Number(item.standard_rate || 10) }],
      });
      if (!soRes.ok || !soRes.data?.success) throw new Error(soRes.data?.error?.message || "Create SO failed");
      const so = soRes.data.sales_order;

      const confirmRes = await confirmSalesOrder(token, tenantId, so.id);
      if (!confirmRes.ok || !confirmRes.data?.success) throw new Error(confirmRes.data?.error?.message || "Confirm SO failed");

      const delRes = await createDeliveryFromSo(token, tenantId, { so_id: so.id, remarks: "Dashboard delivery" });
      if (!delRes.ok || !delRes.data?.success) throw new Error(delRes.data?.error?.message || "Create delivery failed");
      const delivery = delRes.data.delivery;

      const postDelRes = await postDelivery(token, tenantId, delivery.id, `post-do-${delivery.id}-${Date.now()}`);
      if (!postDelRes.ok || !postDelRes.data?.success) throw new Error(postDelRes.data?.error?.message || "Post delivery failed");

      const posRes = await createPosSale(token, tenantId, {
        terminal_id: terminal.id,
        customer_id: customer.id,
        payment_method: "CASH",
        device_fingerprint: "dashboard-pos",
        lines: [{ item_id: item.id, qty: 1, rate: Number(item.standard_rate || 10) }],
      });
      if (!posRes.ok || !posRes.data?.success) throw new Error(posRes.data?.error?.message || "Create POS sale failed");
      const sale = posRes.data.pos_sale;

      const postPosRes = await postPosSale(token, tenantId, sale.id, `post-pos-${sale.id}-${Date.now()}`);
      if (!postPosRes.ok || !postPosRes.data?.success) throw new Error(postPosRes.data?.error?.message || "Post POS failed");

      setFlowResult({
        so: so.so_number,
        delivery: delivery.delivery_number,
        invoice: postPosRes.data.result?.invoice_number,
      });
      await refreshData(token, tenantId);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 16, marginBottom: 12 }}>STAGE 7 — Sales + POS (Live)</h2>
      <div style={{ border: "1px solid #27272a", borderRadius: 14, padding: 16, background: "#111113" }}>
        <div style={{ display: "grid", gap: 10, maxWidth: 520 }}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" style={inputStyle} />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" style={inputStyle} />
          <button onClick={onLoad} disabled={busy} style={buttonStyle}>{busy ? "Loading..." : "Load Customers + SO + POS"}</button>
          <button onClick={onRunSalesFlow} disabled={busy} style={buttonStyleAlt}>{busy ? "Running..." : "Run SO → Delivery → POS Sale (stock OUT)"}</button>
        </div>

        {customers.length > 0 && <div style={{ marginTop: 14, fontSize: 13, color: "#86efac" }}>Customers: {customers.map((c) => c.code).join(", ")}</div>}
        {orders.length > 0 && <div style={{ marginTop: 8, fontSize: 13, color: "#93c5fd" }}>SOs: {orders.slice(0, 3).map((o) => `${o.so_number}(${o.status})`).join(" · ")}</div>}
        {deliveries.length > 0 && <div style={{ marginTop: 8, fontSize: 13, color: "#fde68a" }}>Deliveries: {deliveries.slice(0, 3).map((d) => `${d.delivery_number}(${d.status})`).join(" · ")}</div>}
        {posSales.length > 0 && <div style={{ marginTop: 8, fontSize: 13, color: "#c4b5fd" }}>POS: {posSales.slice(0, 3).map((p) => p.invoice_number || p.draft_number).join(" · ")}</div>}
        {balances.length > 0 && <div style={{ marginTop: 8, fontSize: 13, color: "#fda4af" }}>Stock: {balances.slice(0, 3).map((b) => `${b.item_sku}=${b.on_hand_qty}`).join(" · ")}</div>}
        {flowResult && <div style={{ marginTop: 10, fontSize: 13, color: "#6ee7b7" }}>Flow OK — SO {flowResult.so} → DO {flowResult.delivery} → POS {flowResult.invoice}</div>}
        {error && <div style={{ marginTop: 12, color: "#f87171", fontSize: 14 }}>{error}</div>}
      </div>
    </section>
  );
}

const inputStyle = { background: "#09090b", border: "1px solid #3f3f46", borderRadius: 8, color: "#e4e4e7", padding: "10px 12px" };
const buttonStyle = { background: "#0369a1", color: "#fff", border: "none", borderRadius: 8, padding: "10px 12px", fontWeight: 700, cursor: "pointer" };
const buttonStyleAlt = { background: "#0c4a6e", color: "#fff", border: "none", borderRadius: 8, padding: "10px 12px", fontWeight: 700, cursor: "pointer" };
