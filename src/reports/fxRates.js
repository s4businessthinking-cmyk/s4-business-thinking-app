// Exchange rate from the owner's own rate service (shop.fxRateApi: { url, token }), only when one is set. The URL may
// use {from}, {to} and {token}, e.g. https://v6.exchangerate-api.com/v6/{token}/pair/{from}/{to}. A rate is taken only
// from a real HTTPS reply that carries a positive number; anything else is an error and the typed rate stays as it is.
// There is no built-in rate and no guess. The token is on the shop record, which every member of the shop can read.
const clean = (v) => String(v ?? "").trim();

export const rateApiOf = (shop) => ({ url: clean(shop?.fxRateApi?.url), token: clean(shop?.fxRateApi?.token) });
export const hasRateApi = (shop) => !!rateApiOf(shop).url;

/** The request URL, or { error }: "url" (missing / not https), "token" (the URL needs a token that is not set). */
export function rateUrl(api, from, to) {
  const url = clean(api?.url);
  if (!/^https:\/\//i.test(url)) return { error: "url" };
  if (url.includes("{token}") && !clean(api?.token)) return { error: "token" };
  const enc = (v) => encodeURIComponent(clean(v).toUpperCase());
  return { url: url.replace(/\{from\}/gi, enc(from)).replace(/\{to\}/gi, enc(to)).replace(/\{token\}/gi, encodeURIComponent(clean(api.token))) };
}

/** The rate in a reply body (several common shapes); null when there is none. */
export function parseRate(body, to) {
  const T = clean(to).toUpperCase();
  const pick = [body?.conversion_rate, body?.rate, body?.result, body?.rates?.[T], body?.data?.[T]?.value, body?.data?.[T], body?.info?.rate, body?.quotes?.[`USD${T}`]];
  for (const v of pick) {
    const x = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
    if (Number.isFinite(x) && x > 0) return x;
  }
  return null;
}

/** -> { rate, url } | { error } ("url", "token", "http", "body", "network", "timeout"). fetchImpl / timeoutMs for tests. */
export async function fetchRate(api, from, to, { fetchImpl = globalThis.fetch, timeoutMs = 10000 } = {}) {
  const u = rateUrl(api, from, to);
  if (u.error) return u;
  const ctrl = typeof AbortController === "function" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await fetchImpl(u.url, { method: "GET", redirect: "error", signal: ctrl?.signal, headers: { Accept: "application/json" } });
    if (!res || !res.ok) return { error: "http", status: res?.status || 0 };
    let body;
    try { body = await res.json(); } catch { return { error: "body" }; }
    const rate = parseRate(body, to);
    return rate ? { rate, url: u.url } : { error: "body" };
  } catch (e) {
    return { error: e?.name === "AbortError" ? "timeout" : "network", message: String(e?.message || e) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
