// Base URL of the S4 ERP server (erp-server/). Override per build with
// VITE_S4_API_URL, or per device with localStorage "s4-api-url" for testing.
const PRODUCTION_API_URL = "https://erp.s4businessthinking.com";
const DEV_API_URL = "http://127.0.0.1:8710";

function readOverride() {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem("s4-api-url") || "" : "";
  } catch {
    return "";
  }
}

const env = import.meta.env || {};

export const API_BASE = String(
  readOverride() || globalThis.S4_API_URL || env.VITE_S4_API_URL || (env.DEV ? DEV_API_URL : PRODUCTION_API_URL)
).replace(/\/+$/, "");

export const REALTIME_URL = `${API_BASE.replace(/^http/i, "ws")}/v1/realtime`;
