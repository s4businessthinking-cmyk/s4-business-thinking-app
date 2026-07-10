import React, { useState } from "react";
import {
  authLogin,
  createGrnFromPo,
  createPurchaseOrder,
  fetchGrns,
  fetchInventoryItems,
  fetchPurchaseOrders,
  fetchStockBalances,
  fetchSuppliers,
  postGrn,
  submitPurchaseOrder,
} from "./erpApi";

export default function PurchaseTestPanel() {
  const [email, setEmail] = useState("admin@s4.local");
  const [password, setPassword] = useState("Admin@12345");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [grns, setGrns] = useState([]);
  const [balances, setBalances] = useState([]);
  const [flowResult, setFlowResult] = useState(null);

  const ensureSession = async () => {
    if (session?.token && session?.tenant?.id) return session;
    const loginRes = await authLogin({
      email,
      password,
      device_fingerprint: "purchase-dashboard",
      device_name: "Purchase Dashboard",
      platform: "web",
      tenant_slug: "s4-demo",
    });
    if (!loginRes.ok || !loginRes.data?.success) {
      throw new Error(loginRes.data?.error?.message || "Login failed");
    }
    const nextSession = { token: loginRes.data.access_token, tenant: loginRes.data.tenant };
    setSession(nextSession);
    return nextSession;
  };

  const refreshData = async (token, tenantId) => {
    const [supRes, poRes, grnRes, balRes] = await Promise.all([
      fetchSuppliers(token, tenantId),
      fetchPurchaseOrders(token, tenantId),
      fetchGrns(token, tenantId),
      fetchStockBalances(token, tenantId),
    ]);
    if (supRes.ok) setSuppliers(supRes.data?.suppliers || []);
    if (poRes.ok) setOrders(poRes.data?.purchase_orders || []);
    if (grnRes.ok) setGrns(grnRes.data?.grns || []);
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

  const onRunPurchaseFlow = async () => {
    setBusy(true);
    setError("");
    setFlowResult(null);
    try {
      const active = await ensureSession();
      const token = active.token;
      const tenantId = active.tenant.id;

      const itemsRes = await fetchInventoryItems(token, tenantId);
      if (!itemsRes.ok || !itemsRes.data?.items?.length) {
        throw new Error("No inventory items found for PO lines");
      }
      const items = itemsRes.data.items.slice(0, 2);
      const supplier = suppliers[0];
      if (!supplier) {
        throw new Error("No supplier found — run seed or load data first");
      }

      const poRes = await createPurchaseOrder(token, tenantId, {
        supplier_id: supplier.id,
        remarks: "Dashboard test PO",
        lines: items.map((item) => ({
          item_id: item.id,
          qty: 5,
          rate: Number(item.standard_rate || 10),
        })),
      });
      if (!poRes.ok || !poRes.data?.success) {
        throw new Error(poRes.data?.error?.message || "Create PO failed");
      }
      const po = poRes.data.purchase_order;

      const submitRes = await submitPurchaseOrder(token, tenantId, po.id);
      if (!submitRes.ok || !submitRes.data?.success) {
        throw new Error(submitRes.data?.error?.message || "Submit PO failed");
      }

      const grnRes = await createGrnFromPo(token, tenantId, { po_id: po.id, remarks: "Dashboard test GRN" });
      if (!grnRes.ok || !grnRes.data?.success) {
        throw new Error(grnRes.data?.error?.message || "Create GRN failed");
      }
      const grn = grnRes.data.grn;

      const postRes = await postGrn(token, tenantId, grn.id, `post-grn-${grn.id}-${Date.now()}`);
      if (!postRes.ok || !postRes.data?.success) {
        throw new Error(postRes.data?.error?.message || "Post GRN failed");
      }

      setFlowResult({
        po: po.po_number,
        grn: grn.grn_number,
        postings: postRes.data.result?.postings?.length || 0,
        poStatus: postRes.data.result?.po_status,
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
      <h2 style={{ fontSize: 16, marginBottom: 12 }}>STAGE 6 — Purchase (Live)</h2>
      <div style={{ border: "1px solid #27272a", borderRadius: 14, padding: 16, background: "#111113" }}>
        <div style={{ display: "grid", gap: 10, maxWidth: 520 }}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" style={inputStyle} />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" style={inputStyle} />
          <button onClick={onLoad} disabled={busy} style={buttonStyle}>
            {busy ? "Loading..." : "Load Suppliers + POs + GRNs"}
          </button>
          <button onClick={onRunPurchaseFlow} disabled={busy} style={buttonStyleAlt}>
            {busy ? "Running..." : "Run PO → Submit → GRN → Post (stock IN)"}
          </button>
        </div>

        {suppliers.length > 0 && (
          <div style={{ marginTop: 14, fontSize: 13, color: "#86efac" }}>
            Suppliers: {suppliers.map((s) => s.code).join(", ")}
          </div>
        )}
        {orders.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 13, color: "#93c5fd" }}>
            POs: {orders.slice(0, 3).map((p) => `${p.po_number}(${p.status})`).join(" · ")}
          </div>
        )}
        {grns.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 13, color: "#fde68a" }}>
            GRNs: {grns.slice(0, 3).map((g) => `${g.grn_number}(${g.status})`).join(" · ")}
          </div>
        )}
        {balances.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 13, color: "#c4b5fd" }}>
            Stock: {balances.slice(0, 3).map((b) => `${b.item_sku}=${b.on_hand_qty}`).join(" · ")}
          </div>
        )}
        {flowResult && (
          <div style={{ marginTop: 10, fontSize: 13, color: "#6ee7b7" }}>
            Flow OK — PO {flowResult.po} → GRN {flowResult.grn} posted ({flowResult.postings} ledger entries), PO status={flowResult.poStatus}
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
  background: "#be123c",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "10px 12px",
  fontWeight: 700,
  cursor: "pointer",
};

const buttonStyleAlt = {
  background: "#9f1239",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "10px 12px",
  fontWeight: 700,
  cursor: "pointer",
};
