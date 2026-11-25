// The shop's own Accredited Service Provider (ASP) for UAE e-invoicing: the connection the owner adds in
// Tax -> e-Invoice, and the request that sends one PINT AE XML to it. The UAE send path is shop -> ASP -> Peppol
// network / FTA, and each ASP has its own API, so the connection is described by settings, not code:
//   - a preset ("generic" HTTPS API, "portal" only, "custom"); a named ASP can be added to ASP_PRESETS later with
//     its own paths, auth and reply fields, without changing the panel;
//   - the API address, the auth (API key header, Bearer token or Basic client id / secret), the submit and test
//     paths, and which reply fields carry the ASP's reference, status and message.
// Kept on the shop record under taxSettings.eInvoiceAsp (the owner saves it; staff only read whether it is connected).
// A document is marked submitted / accepted only from a real HTTP reply of that ASP; nothing here is ever "cleared".
import { payloadDigest } from "./uaeEInvoice.js";

export const ASP_PRESETS = {
  generic: { bn: "জেনেরিক HTTPS API", en: "Generic HTTPS API", api: true, authType: "bearer" },
  portal: { bn: "শুধু পোর্টাল (API পরে যোগ হবে)", en: "Portal only (API details later)", api: false },
  custom: { bn: "অন্য ASP (নিজে লিখুন)", en: "Other ASP (custom)", api: true, authType: "apiKey" },
};
export const AUTH_TYPES = { apiKey: ["API key (হেডারে)", "API key (header)"], bearer: ["Bearer টোকেন", "Bearer token"], basic: ["Client ID + Secret (Basic)", "Client ID + secret (Basic)"] };
export const ASP_TIMEOUT_MS = 30000;
const RAW_KEEP = 2000;

const DEFAULTS = {
  enabled: true, provider: "generic", displayName: "", portalUrl: "", apiBaseUrl: "", submitPath: "", testPath: "", testMethod: "GET",
  authType: "bearer", apiKeyHeader: "X-API-Key", apiKey: "", clientId: "", clientSecret: "",
  refField: "id, reference, referenceId, submissionId, documentId, uuid", statusField: "status, state, result", messageField: "message, error, detail, description, errors",
  notes: "", testStatus: "untested", testedAt: "", testedDigest: "", lastError: "", updatedAt: "", updatedBy: "",
};
const s = (v) => String(v ?? "").trim();

/** Saved (or form) value -> a full config with every field, the preset's defaults filled in. */
export function normalizeAspConfig(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const provider = ASP_PRESETS[r.provider] ? r.provider : DEFAULTS.provider;
  const preset = ASP_PRESETS[provider];
  const out = { ...DEFAULTS, ...(preset.authType ? { authType: preset.authType } : {}) };
  Object.keys(DEFAULTS).forEach((k) => { if (r[k] != null && r[k] !== "") out[k] = typeof DEFAULTS[k] === "boolean" ? !!r[k] : s(r[k]); });
  out.provider = provider;
  if (!AUTH_TYPES[out.authType]) out.authType = preset.authType || DEFAULTS.authType;
  out.testMethod = out.testMethod === "POST" ? "POST" : "GET";
  if (!["untested", "ok", "failed"].includes(out.testStatus)) out.testStatus = "untested";
  out.enabled = r.enabled == null ? true : !!r.enabled;
  return out;
}

/** True once there is anything saved at all. */
export const hasAspConfig = (raw) => !!(raw && typeof raw === "object" && (s(raw.displayName) || s(raw.apiBaseUrl) || s(raw.portalUrl)));
export const isApiMode = (cfg) => !!ASP_PRESETS[cfg?.provider]?.api;

// The fields a connection test proves; changing any of them needs a new test.
export const connectionDigest = (cfg) => payloadDigest(JSON.stringify(["provider", "apiBaseUrl", "submitPath", "testPath", "testMethod", "authType", "apiKeyHeader", "apiKey", "clientId", "clientSecret"].map((k) => cfg?.[k] ?? "")));

const urlProblem = (v) => {
  let u;
  try { u = new URL(v); } catch { return "bad"; }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  if (u.protocol === "https:" || (u.protocol === "http:" && local)) return u.username || u.password ? "userinfo" : "";
  return "https";
};
const pathOk = (p) => !p || (p.startsWith("/") && !p.includes("://") && !/\s/.test(p));

const PROBLEM = {
  displayName: ["ASP-র নাম লিখুন", "Enter the ASP's name"],
  portalUrl: ["পোর্টালের ঠিকানা https:// দিয়ে শুরু হতে হবে", "The portal address must be a full https:// link"],
  apiBaseUrl: ["API ঠিকানা লিখুন (ASP যেটা দিয়েছে)", "Enter the API address your ASP gave you"],
  apiHttps: ["API ঠিকানা https:// দিয়ে শুরু হতে হবে", "The API address must start with https://"],
  apiUserinfo: ["ঠিকানার ভেতরে ইউজার / পাসওয়ার্ড দেবেন না - নিচের ঘরে দিন", "Do not put a user / password inside the address - use the fields below"],
  paths: ["পাথ / দিয়ে শুরু হবে, যেমন /v1/invoices", "Paths start with /, e.g. /v1/invoices"],
  apiKey: ["API key / টোকেন লিখুন", "Enter the API key / token"],
  apiKeyHeader: ["API key-র হেডারের নাম লিখুন (যেমন X-API-Key)", "Enter the API key header name (e.g. X-API-Key)"],
  basic: ["Client ID আর Secret দুটোই লিখুন", "Enter both the client ID and the secret"],
};
export const aspProblemText = (id, bn = false) => (PROBLEM[id] ? PROBLEM[id][bn ? 0 : 1] : id);

/** What is missing or wrong before the config can be saved / tested: [problem id]. */
export function validateAspConfig(raw) {
  const cfg = normalizeAspConfig(raw);
  const out = [];
  if (!cfg.displayName) out.push("displayName");
  if (cfg.portalUrl && urlProblem(cfg.portalUrl)) out.push("portalUrl");
  if (!isApiMode(cfg)) return out;
  const u = cfg.apiBaseUrl ? urlProblem(cfg.apiBaseUrl) : "missing";
  if (u === "missing" || u === "bad") out.push("apiBaseUrl");
  else if (u === "https") out.push("apiHttps");
  else if (u === "userinfo") out.push("apiUserinfo");
  if (!pathOk(cfg.submitPath) || !pathOk(cfg.testPath)) out.push("paths");
  if (cfg.authType === "basic") { if (!cfg.clientId || !cfg.clientSecret) out.push("basic"); }
  else {
    if (!cfg.apiKey) out.push("apiKey");
    if (cfg.authType === "apiKey" && !/^[A-Za-z0-9-]+$/.test(cfg.apiKeyHeader)) out.push("apiKeyHeader");
  }
  return out;
}

/**
 * none: nothing saved | off: switched off | portal: portal only, no API | invalid: API details incomplete |
 * untested: never tested, or changed since the test | failed: the last test failed | connected: tested OK as saved.
 */
export function aspState(raw) {
  if (!hasAspConfig(raw)) return "none";
  const cfg = normalizeAspConfig(raw);
  if (!cfg.enabled) return "off";
  if (!isApiMode(cfg)) return "portal";
  if (validateAspConfig(cfg).length) return "invalid";
  if (cfg.testedDigest !== connectionDigest(cfg)) return "untested";
  return cfg.testStatus === "ok" ? "connected" : cfg.testStatus === "failed" ? "failed" : "untested";
}
export const isAspConnected = (raw) => aspState(raw) === "connected";

const base64 = (text) => (typeof btoa === "function" ? btoa(unescape(encodeURIComponent(text))) : Buffer.from(text, "utf8").toString("base64"));
export const joinUrl = (base, path) => (path ? `${s(base).replace(/\/+$/, "")}${path}` : s(base));

function authHeaders(cfg) {
  if (cfg.authType === "basic") return { Authorization: `Basic ${base64(`${cfg.clientId}:${cfg.clientSecret}`)}` };
  if (cfg.authType === "bearer") return { Authorization: `Bearer ${cfg.apiKey}` };
  return { [cfg.apiKeyHeader]: cfg.apiKey };
}

/** The HTTP request for a test (kind "test") or one document (kind "submit"): { url, method, headers, body }. */
export function buildAspRequest(raw, { kind = "submit", xml = "" } = {}) {
  const cfg = normalizeAspConfig(raw);
  const headers = { Accept: "application/json, application/xml;q=0.9, text/plain;q=0.8", ...authHeaders(cfg) };
  if (kind === "test") {
    return { url: joinUrl(cfg.apiBaseUrl, cfg.testPath), method: cfg.testMethod, headers, body: cfg.testMethod === "POST" ? "" : undefined };
  }
  return { url: joinUrl(cfg.apiBaseUrl, cfg.submitPath), method: "POST", headers: { ...headers, "Content-Type": "application/xml; charset=utf-8" }, body: String(xml || "") };
}

const fieldList = (v) => s(v).split(/[,\s]+/).filter(Boolean);
const pick = (obj, names) => {
  for (const name of names) {
    const v = name.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), obj);
    if (v == null || v === "") continue;
    if (Array.isArray(v)) { const t = v.map((x) => (x && typeof x === "object" ? x.message || x.detail || x.description || x.code || JSON.stringify(x) : String(x))).filter(Boolean).join("; "); if (t) return t; continue; }
    if (typeof v === "object") { const t = v.message || v.detail || v.description || v.code; if (t) return String(t); continue; }
    return String(v);
  }
  return "";
};
const xmlTag = (text, names) => {
  for (const name of names) {
    const m = String(text).match(new RegExp(`<(?:[\\w-]+:)?${name.replace(/[^\w-]/g, "")}[^>]*>([^<]{1,500})</`, "i"));
    if (m) return m[1].trim();
  }
  return "";
};
const ACCEPTED = /^(accepted|valid|validated|success|succeeded|ok|delivered|reported|cleared|completed)$/i;
const REJECTED = /(reject|invalid|fail|error|denied|refused)/i;

/**
 * An ASP reply -> { ok, outcome, httpStatus, aspRef, aspStatus, message, raw }.
 * outcome: accepted (2xx and the reply's status field says so) | rejected (the status field says so) |
 *          submitted (2xx with no clear status - the ASP took the request, nothing more is claimed) | failed (not 2xx).
 */
export function readAspReply({ status = 0, text = "" } = {}, raw) {
  const cfg = normalizeAspConfig(raw);
  const body = String(text ?? "");
  let json = null;
  try { json = body.trim() ? JSON.parse(body) : null; } catch { json = null; }
  const get = (names) => (json && typeof json === "object" ? pick(json, names) : xmlTag(body, names));
  const aspRef = get(fieldList(cfg.refField));
  const aspStatus = get(fieldList(cfg.statusField));
  const message = get(fieldList(cfg.messageField));
  const http = Number(status) || 0;
  const ok2xx = http >= 200 && http < 300;
  const outcome = !ok2xx ? "failed" : REJECTED.test(aspStatus) ? "rejected" : ACCEPTED.test(aspStatus) ? "accepted" : "submitted";
  return { ok: outcome === "accepted" || outcome === "submitted", outcome, httpStatus: http, aspRef, aspStatus, message: message || (ok2xx ? "" : `HTTP ${http}`), raw: body.slice(0, RAW_KEEP) };
}

/**
 * How a request leaves the app: the desktop app sends it from its main process (an ASP's server API does not
 * answer browser CORS requests); the browser version uses fetch and the ASP must allow it.
 * A transport takes { url, method, headers, body } and resolves { status, text } or throws.
 */
export function defaultAspTransport() {
  const desk = typeof window !== "undefined" ? window.S4Desktop?.asp?.request : null;
  if (typeof desk === "function") return (req) => desk(req);
  return async (req) => {
    const ctrl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), ASP_TIMEOUT_MS) : null;
    try {
      const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body || undefined, redirect: "error", signal: ctrl?.signal });
      return { status: res.status, text: await res.text() };
    } catch (e) {
      throw new Error(ctrl?.signal.aborted ? `The ASP did not answer within ${ASP_TIMEOUT_MS / 1000} seconds` : String(e?.message || e));
    } finally { if (timer) clearTimeout(timer); }
  };
}
export const isDesktopTransport = () => typeof window !== "undefined" && typeof window.S4Desktop?.asp?.request === "function";

const networkFail = (e) => ({ ok: false, outcome: "failed", httpStatus: 0, aspRef: "", aspStatus: "", message: String(e?.message || e || "Network error"), raw: "", network: true });

/** Test the saved / typed connection. -> { ok, httpStatus, message, network?, patch } - patch is what to save. */
export async function testAspConnection({ config, transport = defaultAspTransport(), now = new Date() } = {}) {
  const cfg = normalizeAspConfig(config);
  const problems = validateAspConfig(cfg);
  if (!isApiMode(cfg) || problems.length) return { ok: false, httpStatus: 0, message: problems.join(", ") || "portal", patch: null };
  let res;
  try { res = readAspReply(await transport(buildAspRequest(cfg, { kind: "test" })), cfg); } catch (e) { res = networkFail(e); }
  const ok = res.httpStatus >= 200 && res.httpStatus < 300;
  const message = ok ? "" : res.message || `HTTP ${res.httpStatus}`;
  return {
    ok, httpStatus: res.httpStatus, message, network: !!res.network,
    patch: { testStatus: ok ? "ok" : "failed", testedAt: new Date(now).toISOString(), testedDigest: connectionDigest(cfg), lastError: message },
  };
}

/** Send one PINT AE XML to the connected ASP. Never sends when the connection is not tested OK as saved. */
export async function submitEInvoiceXml({ config, xml, transport = defaultAspTransport() } = {}) {
  if (!isAspConnected(config)) return { ok: false, outcome: "failed", httpStatus: 0, aspRef: "", aspStatus: "", message: "notConnected", raw: "", notConnected: true };
  if (!String(xml || "").trim()) return { ok: false, outcome: "failed", httpStatus: 0, aspRef: "", aspStatus: "", message: "empty", raw: "" };
  try { return readAspReply(await transport(buildAspRequest(config, { kind: "submit", xml })), config); } catch (e) { return networkFail(e); }
}

/**
 * doc.eInvoice after a send. Success -> status submitted / accepted with the ASP's reference; anything else keeps the
 * document's ready / queued status and records the error. The XML digest is kept so a later bill change shows.
 */
export function submissionRecord(saved, state, result, { aspName = "", by = "", uid = "", now = new Date() } = {}) {
  const at = new Date(now).toISOString();
  const prev = saved && typeof saved === "object" ? saved : {};
  const attempt = { lastAttemptAt: at, httpStatus: result.httpStatus || 0, aspOutcome: result.outcome, aspName };
  if (!result.ok) {
    return { ...prev, status: ["ready", "queued"].includes(prev.status) ? prev.status : "ready", digest: prev.digest || state.digest, ...attempt, lastError: result.message || result.outcome, aspStatus: result.aspStatus || "" };
  }
  return {
    ...prev, ...attempt, status: result.outcome === "accepted" ? "accepted" : "submitted", digest: state.digest, errors: [],
    submittedAt: at, submittedBy: by, submittedUid: uid, aspRef: result.aspRef || "", aspStatus: result.aspStatus || "", lastError: "",
    format: prev.format || "PINT AE (UBL 2.1)",
  };
}
