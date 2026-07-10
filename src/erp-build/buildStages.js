import buildState from "../../erp/build-state.json";

export const ARCHITECTURE_LOCKED = true;
export const LOCAL_BUILD_STATE = buildState;

export function getDashboardUrl() {
  if (typeof window === "undefined") return "/?erp-dashboard=1";
  const url = new URL(window.location.href);
  url.searchParams.set("erp-dashboard", "1");
  url.hash = "";
  return url.toString();
}

export function isErpDashboardRoute() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.has("erp-dashboard") || window.location.hash === "#erp-build";
}
