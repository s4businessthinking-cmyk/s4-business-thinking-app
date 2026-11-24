// Customer display: a second browser / app window the cashier drags to a screen facing the customer. It shows the
// bill being entered on the Sales Invoice form, or the last confirmed bill when the form is empty. No serial / COM
// pole display: the window is a plain page this app writes into (same origin), so it needs no hardware or driver.
// The window lives as long as the app window that opened it; after the app reloads it has to be opened again.
const NAME = "s4-customer-display";
let win = null;

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (v) => (Math.round((Number(v) || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Page for a snapshot: { shopName, cur, mode: "live"|"last"|"idle", title, no, customer, member, lines: [{ name, qty, amount }], vat, total, paid }
 */
export function displayHtml(s = {}) {
  const lines = (s.lines || []).slice(-12);
  const hidden = Math.max(0, (s.lines || []).length - lines.length);
  const body = s.mode === "idle" || (!lines.length && !s.total)
    ? `<div class="idle"><div class="shop">${esc(s.shopName)}</div><div class="welcome">${esc(s.welcome || "Welcome")}</div></div>`
    : `<div class="head"><div class="shop">${esc(s.shopName)}</div><div class="meta">${esc(s.title || "")}${s.no ? ` ${esc(s.no)}` : ""}${s.customer ? ` &middot; ${esc(s.customer)}` : ""}${s.member ? ` &middot; ${esc(s.member)}` : ""}</div></div>
<table>${hidden ? `<tr class="more"><td colspan="3">+ ${hidden} more item(s)</td></tr>` : ""}${lines.map((l) => `<tr><td class="name">${esc(l.name)}</td><td class="qty">${esc(l.qty)}</td><td class="amt">${money(l.amount)}</td></tr>`).join("")}</table>
<div class="foot">${Number(s.vat) ? `<div class="row"><span>VAT</span><span>${esc(s.cur)} ${money(s.vat)}</span></div>` : ""}<div class="row grand"><span>Total</span><span>${esc(s.cur)} ${money(s.total)}</span></div>${s.paid != null && Number(s.paid) ? `<div class="row"><span>Paid</span><span>${esc(s.cur)} ${money(s.paid)}</span></div>` : ""}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(s.shopName || "Customer display")}</title><style>
body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#0f172a;color:#f8fafc;height:100vh;display:flex;flex-direction:column}
.head{padding:14px 20px;border-bottom:1px solid #334155}.shop{font-size:26px;font-weight:700}.meta{color:#94a3b8;font-size:16px;margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:22px;flex:1}td{padding:8px 20px;border-bottom:1px solid #1e293b}.qty{text-align:center;width:90px;color:#cbd5e1}
.amt{text-align:right;width:180px;font-variant-numeric:tabular-nums}.more td{color:#94a3b8;font-size:16px}
.foot{margin-top:auto;padding:12px 20px;border-top:2px solid #334155}.row{display:flex;justify-content:space-between;font-size:22px;padding:2px 0}
.grand{font-size:40px;font-weight:700;color:#4ade80}.idle{margin:auto;text-align:center}.welcome{font-size:30px;color:#94a3b8;margin-top:12px}
</style></head><body>${body}</body></html>`;
}

export const isDisplayOpen = () => !!win && !win.closed;

/** Opens (or brings back) the display window. -> false when the browser blocked it. */
export function openCustomerDisplay(snapshot) {
  if (typeof window === "undefined") return false;
  if (!isDisplayOpen()) win = window.open("", NAME, "width=900,height=600");
  if (!win) return false;
  showOnDisplay(snapshot);
  try { win.focus(); } catch { /* another window has focus */ }
  return true;
}

let lastHtml = "";
/** Shows a snapshot when the window is open; does nothing otherwise. */
export function showOnDisplay(snapshot) {
  if (!isDisplayOpen()) return;
  const html = displayHtml(snapshot);
  if (html === lastHtml && win.document.body?.childNodes.length) return;
  lastHtml = html;
  try {
    win.document.open();
    win.document.write(html);
    win.document.close();
  } catch (e) {
    console.warn("[S4 Customer display] update failed", e);
  }
}

export function closeCustomerDisplay() {
  if (isDisplayOpen()) win.close();
  win = null;
  lastHtml = "";
}

/** Snapshot of a saved sales bill. lineAmount(item) -> the line's amount with VAT. */
export const billSnapshot = (inv, { shopName = "", cur = "AED", lineAmount, member = "" } = {}) => ({
  shopName, cur, mode: "last", title: "Last bill", no: inv?.invoiceNo || "", customer: inv?.customerName || "", member,
  lines: (inv?.items || []).map((it) => ({ name: it.name || it.code || "", qty: it.qty, amount: lineAmount ? lineAmount(it) : Number(it.total) || 0 })),
  vat: Number(inv?.totalVat) || 0, total: Number(inv?.grandTotal) || 0, paid: Number(inv?.amountPaid) || 0,
});
