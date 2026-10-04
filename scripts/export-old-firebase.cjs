#!/usr/bin/env node
// One-time export of a shop's data from the old Firebase version of the app.
// Read-only: signs in with the shop owner's old login, downloads every shop
// collection and writes old-firebase-export-<date>.json. Import that file in
// the new app: Settings › Backup & restore › Choose backup file.
//
// Usage:  node scripts/export-old-firebase.cjs
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

const COLLECTIONS = [
  "products", "companies", "customers", "vendors", "suppliers", "orders",
  "purchaseInvoices", "purchasePayments", "supplierPayments", "purchaseOrders",
  "salesInvoices", "salesReceipts", "quotations", "deliveryNotes",
  "expenses", "settings", "inventory", "stockMovements", "stockBalances",
  "branches", "branchTransfers", "branchTransferReceipts", "branchStockBalances", "branchStockMovements",
  "purchases", "sales",
];

function oldFirebaseConfig() {
  const src = execSync("git show HEAD:src/firebase-config.js", { cwd: path.join(__dirname, ".."), encoding: "utf8" });
  const pick = (k) => (src.match(new RegExp(`${k}\\s*:\\s*["']([^"']+)["']`)) || [])[1];
  const cfg = { apiKey: pick("apiKey"), projectId: pick("projectId") };
  if (!cfg.apiKey || !cfg.projectId) throw new Error("Could not find the old Firebase settings in git (HEAD:src/firebase-config.js).");
  return cfg;
}

function ask(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); else rl.output.write("*"); };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

function fromValue(v) {
  if (!v || typeof v !== "object") return null;
  if ("nullValue" in v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("timestampValue" in v) return v.timestampValue;
  if ("referenceValue" in v) return v.referenceValue.split("/documents/")[1] || v.referenceValue;
  if ("geoPointValue" in v) return v.geoPointValue;
  if ("bytesValue" in v) return v.bytesValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromValue);
  if ("mapValue" in v) return fromFields(v.mapValue.fields || {});
  return null;
}
function fromFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = fromValue(v);
  return out;
}

async function main() {
  const cfg = oldFirebaseConfig();
  console.log("Old Firebase export (read-only). Use the shop OWNER's old login.\n");
  const email = await ask("Old email: ");
  const password = await ask("Old password: ", true);

  const signIn = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${cfg.apiKey}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  }).then((r) => r.json());
  if (!signIn.idToken) throw new Error(`Login failed: ${signIn.error?.message || "unknown error"}`);
  const token = signIn.idToken;
  const uid = signIn.localId;
  const base = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const userDoc = await fetch(`${base}/users/${uid}`, { headers }).then((r) => r.json());
  const profile = fromFields(userDoc.fields);
  const shopId = profile.shopId;
  if (!shopId) throw new Error("This login has no shop in the old app.");
  const shopDoc = await fetch(`${base}/shops/${shopId}`, { headers }).then((r) => r.json());
  const shop = shopDoc.fields ? fromFields(shopDoc.fields) : {};
  console.log(`\nShop: ${shop.shopName || shop.name || shopId}\n`);

  const collections = {};
  let total = 0;
  for (const name of COLLECTIONS) {
    const docs = [];
    let cursor = null;
    for (;;) {
      const structuredQuery = {
        from: [{ collectionId: name }],
        where: { fieldFilter: { field: { fieldPath: "shopId" }, op: "EQUAL", value: { stringValue: shopId } } },
        orderBy: [{ field: { fieldPath: "__name__" }, direction: "ASCENDING" }],
        limit: 500,
      };
      if (cursor) structuredQuery.startAt = { values: [{ referenceValue: cursor }], before: false };
      const res = await fetch(`${base}:runQuery`, { method: "POST", headers, body: JSON.stringify({ structuredQuery }) });
      const rows = await res.json();
      if (!res.ok || !Array.isArray(rows)) {
        const msg = (Array.isArray(rows) ? rows[0] : rows)?.error?.message || res.statusText;
        console.log(`  ${name.padEnd(24)} skipped (${msg})`);
        break;
      }
      const page = rows.filter((r) => r.document).map((r) => r.document);
      for (const d of page) docs.push({ id: d.name.split("/").pop(), data: fromFields(d.fields) });
      if (page.length < 500) break;
      cursor = page[page.length - 1].name;
    }
    if (docs.length) {
      collections[name] = docs;
      total += docs.length;
      console.log(`  ${name.padEnd(24)} ${docs.length}`);
    }
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const file = path.join(process.cwd(), `old-firebase-export-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify({
    format: "s4-firebase-export", version: 1, oldShopId: shopId, oldOwnerUid: uid,
    shopName: shop.shopName || shop.name || "", createdAt: new Date().toISOString(), documentCount: total, collections,
  }));
  console.log(`\nDone: ${total} records saved to\n  ${file}\n\nNext: open the new app › Settings › Backup & restore › Choose backup file.`);
}

main().catch((e) => {
  console.error(`\n❌ ${e.message || e}`);
  process.exit(1);
});
