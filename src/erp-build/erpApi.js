const DEFAULT_BASE = "/api/v1";

export function getErpApiBase() {
  const fromEnv = import.meta.env.VITE_ERP_API_BASE;
  if (fromEnv && String(fromEnv).trim()) {
    return String(fromEnv).replace(/\/$/, "");
  }
  return DEFAULT_BASE;
}

async function fetchJson(path, options = {}) {
  const base = getErpApiBase();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 8000);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(options.headers || {}),
      },
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    return { ok: res.ok, status: res.status, data, url };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchBuildStatus() {
  return fetchJson("/build/status/");
}

export async function fetchHealth() {
  return fetchJson("/health/");
}

export async function fetchHealthLive() {
  return fetchJson("/health/live/");
}

export async function authLogin(payload) {
  return fetchJson("/auth/login/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function authMe(accessToken, tenantId = "") {
  return fetchJson("/auth/me/", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(tenantId ? { "X-Tenant-Id": tenantId } : {}),
    },
  });
}

export async function fetchTenants(accessToken) {
  return fetchJson("/tenants/", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function fetchLicenseStatus(accessToken, tenantId) {
  return fetchJson("/license/status/", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Tenant-Id": tenantId,
    },
  });
}

export async function activateLicense(accessToken, tenantId, payload) {
  return fetchJson("/license/activate/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Tenant-Id": tenantId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

function authHeaders(accessToken, tenantId) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "X-Tenant-Id": tenantId,
    "Content-Type": "application/json",
  };
}

export function clientHlcNow(nodeId = "web-dashboard") {
  return { wall_ms: Date.now(), logical: 0, node_id: nodeId };
}

export async function syncHandshake(accessToken, tenantId, payload) {
  return fetchJson("/sync/handshake/", {
    method: "POST",
    headers: authHeaders(accessToken, tenantId),
    body: JSON.stringify(payload),
  });
}

export async function syncPull(accessToken, tenantId, payload) {
  return fetchJson("/sync/pull/", {
    method: "POST",
    headers: authHeaders(accessToken, tenantId),
    body: JSON.stringify(payload),
  });
}

export async function syncPush(accessToken, tenantId, payload) {
  return fetchJson("/sync/push/", {
    method: "POST",
    headers: authHeaders(accessToken, tenantId),
    body: JSON.stringify(payload),
  });
}

export async function syncStatus(accessToken, tenantId, deviceId = "") {
  const qs = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : "";
  return fetchJson(`/sync/status/${qs}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Tenant-Id": tenantId,
    },
  });
}

export async function fetchInventoryItems(accessToken, tenantId, query = "") {
  const qs = query ? `?q=${encodeURIComponent(query)}` : "";
  return fetchJson(`/inventory/items${qs}`, {
    headers: authHeaders(accessToken, tenantId),
  });
}

export async function createInventoryItem(accessToken, tenantId, payload) {
  return fetchJson("/inventory/items/", {
    method: "POST",
    headers: authHeaders(accessToken, tenantId),
    body: JSON.stringify(payload),
  });
}

export async function fetchStockBalances(accessToken, tenantId) {
  return fetchJson("/inventory/stock/balance/", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Tenant-Id": tenantId,
    },
  });
}

export async function postStockOpening(accessToken, tenantId, payload) {
  return fetchJson("/inventory/stock/opening/", {
    method: "POST",
    headers: authHeaders(accessToken, tenantId),
    body: JSON.stringify(payload),
  });
}

export async function fetchStockLedger(accessToken, tenantId) {
  return fetchJson("/inventory/stock/ledger/", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Tenant-Id": tenantId,
    },
  });
}

export async function fetchSuppliers(accessToken, tenantId) {
  return fetchJson("/purchase/suppliers/", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Tenant-Id": tenantId,
    },
  });
}

export async function fetchPurchaseOrders(accessToken, tenantId) {
  return fetchJson("/purchase/orders/", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Tenant-Id": tenantId,
    },
  });
}

export async function createPurchaseOrder(accessToken, tenantId, payload) {
  return fetchJson("/purchase/orders/", {
    method: "POST",
    headers: authHeaders(accessToken, tenantId),
    body: JSON.stringify(payload),
  });
}

export async function submitPurchaseOrder(accessToken, tenantId, poId) {
  return fetchJson(`/purchase/orders/${poId}/submit/`, {
    method: "POST",
    headers: authHeaders(accessToken, tenantId),
    body: JSON.stringify({}),
  });
}

export async function fetchGrns(accessToken, tenantId) {
  return fetchJson("/purchase/grn/", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Tenant-Id": tenantId,
    },
  });
}

export async function createGrnFromPo(accessToken, tenantId, payload) {
  return fetchJson("/purchase/grn/from-po/", {
    method: "POST",
    headers: authHeaders(accessToken, tenantId),
    body: JSON.stringify(payload),
  });
}

export async function postGrn(accessToken, tenantId, grnId, idempotencyKey) {
  return fetchJson(`/purchase/grn/${grnId}/post/`, {
    method: "POST",
    headers: authHeaders(accessToken, tenantId),
    body: JSON.stringify({ idempotency_key: idempotencyKey }),
  });
}

export async function fetchCustomers(accessToken, tenantId) {
  return fetchJson("/sales/customers/", {
    headers: { Authorization: `Bearer ${accessToken}`, "X-Tenant-Id": tenantId },
  });
}

export async function fetchSalesOrders(accessToken, tenantId) {
  return fetchJson("/sales/orders/", {
    headers: { Authorization: `Bearer ${accessToken}`, "X-Tenant-Id": tenantId },
  });
}

export async function createSalesOrder(accessToken, tenantId, payload) {
  return fetchJson("/sales/orders/", {
    method: "POST",
    headers: authHeaders(accessToken, tenantId),
    body: JSON.stringify(payload),
  });
}

export async function confirmSalesOrder(accessToken, tenantId, soId) {
  return fetchJson(`/sales/orders/${soId}/confirm/`, {
    method: "POST",
    headers: authHeaders(accessToken, tenantId),
    body: JSON.stringify({}),
  });
}

export async function fetchDeliveries(accessToken, tenantId) {
  return fetchJson("/sales/deliveries/", {
    headers: { Authorization: `Bearer ${accessToken}`, "X-Tenant-Id": tenantId },
  });
}

export async function createDeliveryFromSo(accessToken, tenantId, payload) {
  return fetchJson("/sales/deliveries/from-so/", {
    method: "POST",
    headers: authHeaders(accessToken, tenantId),
    body: JSON.stringify(payload),
  });
}

export async function postDelivery(accessToken, tenantId, deliveryId, idempotencyKey) {
  return fetchJson(`/sales/deliveries/${deliveryId}/post/`, {
    method: "POST",
    headers: authHeaders(accessToken, tenantId),
    body: JSON.stringify({ idempotency_key: idempotencyKey }),
  });
}

export async function fetchPosTerminals(accessToken, tenantId) {
  return fetchJson("/pos/terminals/", {
    headers: { Authorization: `Bearer ${accessToken}`, "X-Tenant-Id": tenantId },
  });
}

export async function fetchPosSales(accessToken, tenantId) {
  return fetchJson("/pos/sales/", {
    headers: { Authorization: `Bearer ${accessToken}`, "X-Tenant-Id": tenantId },
  });
}

export async function createPosSale(accessToken, tenantId, payload) {
  return fetchJson("/pos/sales/", {
    method: "POST",
    headers: authHeaders(accessToken, tenantId),
    body: JSON.stringify(payload),
  });
}

export async function postPosSale(accessToken, tenantId, saleId, idempotencyKey) {
  return fetchJson(`/pos/sales/${saleId}/post/`, {
    method: "POST",
    headers: authHeaders(accessToken, tenantId),
    body: JSON.stringify({ idempotency_key: idempotencyKey }),
  });
}

export async function fetchAccountingAccounts(accessToken, tenantId) {
  return fetchJson("/accounting/accounts/?postable_only=1", {
    headers: { Authorization: `Bearer ${accessToken}`, "X-Tenant-Id": tenantId },
  });
}

export async function fetchFiscalPeriods(accessToken, tenantId) {
  return fetchJson("/accounting/periods/", {
    headers: { Authorization: `Bearer ${accessToken}`, "X-Tenant-Id": tenantId },
  });
}

export async function fetchJournals(accessToken, tenantId) {
  return fetchJson("/accounting/journals/", {
    headers: { Authorization: `Bearer ${accessToken}`, "X-Tenant-Id": tenantId },
  });
}

export async function createJournalEntry(accessToken, tenantId, payload) {
  return fetchJson("/accounting/journals/", {
    method: "POST",
    headers: authHeaders(accessToken, tenantId),
    body: JSON.stringify(payload),
  });
}

export async function postJournalEntry(accessToken, tenantId, journalId) {
  return fetchJson(`/accounting/journals/${journalId}/post/`, {
    method: "POST",
    headers: authHeaders(accessToken, tenantId),
    body: JSON.stringify({}),
  });
}

export async function fetchGeneralLedger(accessToken, tenantId) {
  return fetchJson("/accounting/gl/", {
    headers: { Authorization: `Bearer ${accessToken}`, "X-Tenant-Id": tenantId },
  });
}

export async function fetchTrialBalance(accessToken, tenantId) {
  return fetchJson("/accounting/trial-balance/", {
    headers: { Authorization: `Bearer ${accessToken}`, "X-Tenant-Id": tenantId },
  });
}

export async function fetchDepartments(accessToken, tenantId) {
  return fetchJson("/hrm/departments/", {
    headers: { Authorization: `Bearer ${accessToken}`, "X-Tenant-Id": tenantId },
  });
}

export async function fetchEmployees(accessToken, tenantId) {
  return fetchJson("/hrm/employees/", {
    headers: { Authorization: `Bearer ${accessToken}`, "X-Tenant-Id": tenantId },
  });
}

export async function createEmployee(accessToken, tenantId, payload) {
  return fetchJson("/hrm/employees/", {
    method: "POST",
    headers: authHeaders(accessToken, tenantId),
    body: JSON.stringify(payload),
  });
}

export async function recordAttendance(accessToken, tenantId, payload) {
  return fetchJson("/hrm/attendance/", {
    method: "POST",
    headers: authHeaders(accessToken, tenantId),
    body: JSON.stringify(payload),
  });
}

export async function fetchLeaveRequests(accessToken, tenantId) {
  return fetchJson("/hrm/leaves/", {
    headers: { Authorization: `Bearer ${accessToken}`, "X-Tenant-Id": tenantId },
  });
}

export async function createLeaveRequest(accessToken, tenantId, payload) {
  return fetchJson("/hrm/leaves/", {
    method: "POST",
    headers: authHeaders(accessToken, tenantId),
    body: JSON.stringify(payload),
  });
}

export async function submitLeaveRequest(accessToken, tenantId, leaveId) {
  return fetchJson(`/hrm/leaves/${leaveId}/submit/`, {
    method: "POST",
    headers: authHeaders(accessToken, tenantId),
    body: JSON.stringify({}),
  });
}

export async function fetchCrmLeads(accessToken, tenantId) {
  return fetchJson("/crm/leads/", {
    headers: { Authorization: `Bearer ${accessToken}`, "X-Tenant-Id": tenantId },
  });
}

export async function createCrmLead(accessToken, tenantId, payload) {
  return fetchJson("/crm/leads/", {
    method: "POST",
    headers: authHeaders(accessToken, tenantId),
    body: JSON.stringify(payload),
  });
}

export async function convertLead(accessToken, tenantId, leadId, customerCode = "") {
  return fetchJson(`/crm/leads/${leadId}/convert/`, {
    method: "POST",
    headers: authHeaders(accessToken, tenantId),
    body: JSON.stringify(customerCode ? { customer_code: customerCode } : {}),
  });
}

export async function fetchCrmOpportunities(accessToken, tenantId) {
  return fetchJson("/crm/opportunities/", {
    headers: { Authorization: `Bearer ${accessToken}`, "X-Tenant-Id": tenantId },
  });
}

export async function createCrmOpportunity(accessToken, tenantId, payload) {
  return fetchJson("/crm/opportunities/", {
    method: "POST",
    headers: authHeaders(accessToken, tenantId),
    body: JSON.stringify(payload),
  });
}

export async function updateOpportunityStage(accessToken, tenantId, opportunityId, stage) {
  return fetchJson(`/crm/opportunities/${opportunityId}/stage/`, {
    method: "POST",
    headers: authHeaders(accessToken, tenantId),
    body: JSON.stringify({ stage }),
  });
}

export async function fetchCrmActivities(accessToken, tenantId) {
  return fetchJson("/crm/activities/", {
    headers: { Authorization: `Bearer ${accessToken}`, "X-Tenant-Id": tenantId },
  });
}

export async function createCrmActivity(accessToken, tenantId, payload) {
  return fetchJson("/crm/activities/", {
    method: "POST",
    headers: authHeaders(accessToken, tenantId),
    body: JSON.stringify(payload),
  });
}

export async function fetchReportCatalog(accessToken, tenantId) {
  return fetchJson("/reports/catalog/", {
    headers: { Authorization: `Bearer ${accessToken}`, "X-Tenant-Id": tenantId },
  });
}

export async function fetchReportDashboardKpis(accessToken, tenantId) {
  return fetchJson("/reports/dashboard/kpis/", {
    headers: { Authorization: `Bearer ${accessToken}`, "X-Tenant-Id": tenantId },
  });
}

export async function fetchReportStockSummary(accessToken, tenantId) {
  return fetchJson("/reports/inventory/stock-summary/", {
    headers: { Authorization: `Bearer ${accessToken}`, "X-Tenant-Id": tenantId },
  });
}

export async function fetchReportFinanceTb(accessToken, tenantId) {
  return fetchJson("/reports/finance/trial-balance/", {
    headers: { Authorization: `Bearer ${accessToken}`, "X-Tenant-Id": tenantId },
  });
}

export async function fetchReportRuns(accessToken, tenantId) {
  return fetchJson("/reports/runs/", {
    headers: { Authorization: `Bearer ${accessToken}`, "X-Tenant-Id": tenantId },
  });
}

export async function runReport(accessToken, tenantId, reportCode, parameters = {}) {
  return fetchJson("/reports/runs/", {
    method: "POST",
    headers: authHeaders(accessToken, tenantId),
    body: JSON.stringify({ report_code: reportCode, parameters }),
  });
}

// -- STAGE 11 — Realtime (WebSocket) ---------------------------------------

export function getErpWsUrl(path = "/ws/realtime/") {
  const explicit = import.meta.env.VITE_ERP_WS_BASE;
  if (explicit && String(explicit).trim()) {
    return `${String(explicit).replace(/\/$/, "")}${path}`;
  }
  if (typeof window === "undefined") return path;
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${path}`;
}

export async function requestWsTicket(accessToken, tenantId, deviceId = "") {
  return fetchJson("/realtime/ws-ticket/", {
    method: "POST",
    headers: authHeaders(accessToken, tenantId),
    body: JSON.stringify({ device_id: deviceId }),
  });
}

export async function fetchRealtimeStatus(accessToken, tenantId) {
  return fetchJson("/realtime/status/", {
    headers: { Authorization: `Bearer ${accessToken}`, "X-Tenant-Id": tenantId },
  });
}

export async function relayOutbox(accessToken, tenantId, batchSize = 200) {
  return fetchJson("/realtime/relay-outbox/", {
    method: "POST",
    headers: authHeaders(accessToken, tenantId),
    body: JSON.stringify({ batch_size: batchSize }),
  });
}

export async function publishRealtimeTest(accessToken, tenantId, message = "") {
  return fetchJson("/realtime/publish-test/", {
    method: "POST",
    headers: authHeaders(accessToken, tenantId),
    body: JSON.stringify({ group: "tenant", event_type: "realtime.test.ping", message }),
  });
}

// -- STAGE 12 — Desktop Devices (provisioning / registry) ------------------

export async function fetchDeviceStatus(accessToken, tenantId) {
  return fetchJson("/devices/status/", {
    headers: { Authorization: `Bearer ${accessToken}`, "X-Tenant-Id": tenantId },
  });
}

export async function fetchDevices(accessToken, tenantId) {
  return fetchJson("/devices/list/", {
    headers: { Authorization: `Bearer ${accessToken}`, "X-Tenant-Id": tenantId },
  });
}

export async function fetchDeviceActivations(accessToken, tenantId) {
  return fetchJson("/devices/activations/", {
    headers: { Authorization: `Bearer ${accessToken}`, "X-Tenant-Id": tenantId },
  });
}

export async function createDeviceActivation(accessToken, tenantId, payload = {}) {
  return fetchJson("/devices/activations/", {
    method: "POST",
    headers: authHeaders(accessToken, tenantId),
    body: JSON.stringify(payload),
  });
}

export async function redeemDeviceActivation(tenantId, payload) {
  return fetchJson("/devices/redeem/", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
    body: JSON.stringify(payload),
  });
}

export async function deviceHeartbeat(tenantId, payload) {
  return fetchJson("/devices/heartbeat/", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
    body: JSON.stringify(payload),
  });
}

export async function deviceAction(accessToken, tenantId, payload) {
  return fetchJson("/devices/action/", {
    method: "POST",
    headers: authHeaders(accessToken, tenantId),
    body: JSON.stringify(payload),
  });
}
