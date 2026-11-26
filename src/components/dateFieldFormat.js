/** ISO YYYY-MM-DD from value; empty if not a date-like string. */
export function isoDateOnly(v) {
  const m = String(v || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}

/** Closed-field display: always day/month/year (DD/MM/YYYY). */
export function formatDateDmY(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}
