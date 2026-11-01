// User-typed text is stored in capitals (Product / Vendor / Customer and every other save).
// System fields stay as-is so status, login and ids do not break.

// System choice fields (code compares them to lowercase words). These are never uppercased,
// and values an earlier build already uppercased are put back when records are read.
const ENUM_KEYS = new Set([
  "method", "repeat", "paymethod", "partneruse", "partnerpaid", "partytype", "vouchertype",
  "sourcetype", "mode", "period", "stocklocation", "defaultbilltype", "logoalign",
  "workertype", "ticketentitlement", "contracttype", "visatype", "visacostpaidby", "maritalstatus",
  "taxapplicable", "profitsource", "partnertype", "stmttype", "sheet", "dir", "tone", "voucherkind",
]);

// "category" is free text for products but a fixed key for expenses.
const EXPENSE_CATEGORY_KEYS = new Set([
  "rent", "salary", "electricity", "water", "phone", "transport", "fuel", "maintenance", "office",
  "food", "marketing", "bank", "govt", "other", "advance", "overtime", "bonus", "allowance",
  "visa", "ticket", "gratuity", "medical",
]);

const SKIP_KEY = new Set([
  "id", "uid", "shopid", "owneruid", "localuserid", "documentid", "docid",
  "createdby", "updatedby", "dispatchedby",
  "status", "prevstatus", "chequestatus",
  ...ENUM_KEYS,
  "country", "reason", "source",
  "paymentmethod", "paymenttype", "invoicetype", "dockind", "customertype",
  "role", "theme", "lang", "language", "wastyle",
  "email", "password", "username", "pin", "pinhash", "passwordhash",
  "kind", "type", "applytype", "reversetype", "referencetype", "movementtype",
  "direction", "entrytype", "collectionname", "operation",
  "website", "filingurl",
]);

const SKIP_BRANCH = new Set([
  "permissions", "grouppermissions", "printdesign", "printsettings", "taxsettings",
  "style", "layout", "fontdata", "printfontdata",
]);

const SKIP_KEY_END = /(?:id|uid|url|hash|token|html|css)$/i;

function skipKey(key) {
  if (key == null || key === "") return false;
  const k = String(key).toLowerCase();
  if (SKIP_KEY.has(k) || SKIP_BRANCH.has(k)) return true;
  if (k === "createdbyname" || k === "updatedbyname") return false;
  return SKIP_KEY_END.test(String(key));
}

function skipString(value) {
  const v = String(value);
  if (!v) return true;
  if (v.startsWith("data:")) return true;
  if (/^https?:\/\//i.test(v)) return true;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return true;
  if (/^\d{4}-\d{2}-\d{2}(?:[T\s]|$)/.test(v)) return true;
  if (v.length > 400 && /^[A-Za-z0-9+/=\s]+$/.test(v)) return true;
  return false;
}

function capString(value, key) {
  if (typeof value !== "string") return value;
  if (skipKey(key) || skipString(value)) return value;
  return value.replace(/[a-z]/g, (ch) => ch.toUpperCase());
}

// An expense row keeps "category" as a fixed key (rent, salary...); on products it is free text.
const isExpenseRow = (obj) => obj && typeof obj === "object" && !Array.isArray(obj) && "expenseDate" in obj;

// Puts system choice fields back to lowercase on records an earlier build saved in capitals.
export function repairSystemEnums(input, key) {
  if (input == null || typeof input !== "object") {
    if (typeof input !== "string" || !/^[A-Z][A-Z0-9_]*$/.test(input)) return input;
    return ENUM_KEYS.has(String(key || "").toLowerCase()) ? input.toLowerCase() : input;
  }
  if (Array.isArray(input)) {
    let changed = false;
    const next = input.map((item) => { const r = repairSystemEnums(item, key); if (r !== item) changed = true; return r; });
    return changed ? next : input;
  }
  const expense = isExpenseRow(input);
  let out = null;
  for (const [k, v] of Object.entries(input)) {
    if (v == null || (typeof v !== "string" && typeof v !== "object")) continue;
    let r;
    if (expense && k === "category" && typeof v === "string" && EXPENSE_CATEGORY_KEYS.has(v.toLowerCase())) r = v.toLowerCase();
    else r = repairSystemEnums(v, k);
    if (r !== v) { if (!out) out = { ...input }; out[k] = r; }
  }
  return out || input;
}

export function capsSavedText(input, key) {
  if (input == null || typeof input !== "object") return capString(input, key);
  if (Array.isArray(input)) return input.map((item) => capsSavedText(item, key));
  const expense = isExpenseRow(input);
  const out = {};
  for (const [k, v] of Object.entries(input)) {
    if (v && typeof v === "object" && SKIP_BRANCH.has(String(k).toLowerCase())) {
      out[k] = v;
      continue;
    }
    if (expense && k === "category" && typeof v === "string" && EXPENSE_CATEGORY_KEYS.has(v.toLowerCase())) {
      out[k] = v.toLowerCase();
      continue;
    }
    out[k] = capsSavedText(v, k);
  }
  return out;
}
