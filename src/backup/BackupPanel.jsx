import { useEffect, useRef, useState } from "react";
import { BackupCancelled, backupPlatform, getLastBackupAt, prepareFirebaseImport, readBackupFile, restoreShopBackup, saveShopBackup } from "./backupService.js";
import { buildFirebaseImport, DEFAULT_SELECTED, matchSummary } from "./firebaseImport.js";

const COLLECTION_LABELS = {
  products: ["প্রোডাক্ট", "Products"], customers: ["কাস্টমার", "Customers"], vendors: ["ভেন্ডর", "Vendors"], suppliers: ["সাপ্লায়ার", "Suppliers"],
  companies: ["কোম্পানি", "Companies"], orders: ["অর্ডার", "Orders"], purchaseInvoices: ["পারচেজ ইনভয়েস", "Purchase invoices"],
  purchasePayments: ["পেমেন্ট ভাউচার (ক্যাশ/চেক)", "Payment vouchers (cash/cheque)"], supplierPayments: ["সাপ্লায়ার পেমেন্ট", "Supplier payments"],
  salesInvoices: ["সেলস ইনভয়েস", "Sales invoices"], salesReceipts: ["রসিদ ভাউচার", "Receipt vouchers"], expenses: ["খরচ", "Expenses"],
};

const fmtDate = (iso, lang) => (iso ? new Date(iso).toLocaleString(lang === "bn" ? "bn-BD" : "en-GB") : "—");
const fmtSize = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function FirebaseImportChoices({ bn, th, muted, pending, setPending }) {
  const { plan, selected } = pending;
  const sel = new Set(selected);
  const toggle = (name) => setPending((p) => ({ ...p, selected: sel.has(name) ? p.selected.filter((n) => n !== name) : [...p.selected, name] }));
  const m = matchSummary(plan, selected);
  const st = plan.stats;
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 100);
  const showItems = m.items > 0;
  const showVendors = m.vendorDocs > 0;
  return (
    <div style={{ ...muted, color: th.txtPrimary, marginTop: 8, padding: 10, borderRadius: 8, background: "rgba(59,130,246,0.08)" }}>
      <strong>☁️ {bn ? "পুরোনো সফটওয়্যারের ডেটা — কোনগুলো আনবেন বাছুন" : "Old software data — choose what to bring in"}</strong>
      {Object.entries(plan.byCollection).map(([name, docs]) => {
        const already = plan.currentCounts[name] || 0;
        return (
          <label key={name} style={{ display: "flex", gap: 8, alignItems: "center", padding: "3px 0", cursor: "pointer" }}>
            <input type="checkbox" checked={sel.has(name)} onChange={() => toggle(name)} />
            <span>{(COLLECTION_LABELS[name]?.[bn ? 0 : 1]) || name}: <strong>{docs.length}</strong>
              {already > 0 && <span style={{ color: th.txtMuted }}> · {bn ? `এখন আছে ${already}টি` : `${already} already in the app`}</span>}
            </span>
          </label>
        );
      })}
      {plan.alreadyThere > 0 && <div style={{ color: th.txtMuted }}>{bn ? `${plan.alreadyThere}টি রেকর্ড হুবহু আগে থেকেই আছে — বাদ যাবে` : `${plan.alreadyThere} records are already here — left out`}</div>}

      {(showItems || showVendors) && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${th.border}` }}>
          <strong>🔗 {bn ? "আপনার এখনকার প্রোডাক্ট/ভেন্ডরের সাথে মিল" : "Matched to your current products/vendors"}</strong>
          {showItems && (
            <div style={{ color: pct(m.itemsMatched, m.items) >= 90 ? "#16a34a" : "#f59e0b" }}>
              📦 {bn ? `ইনভয়েসের লাইন: ${m.items}টির মধ্যে ${m.itemsMatched}টি প্রোডাক্টের সাথে মিলেছে (${pct(m.itemsMatched, m.items)}%)` : `Invoice lines: ${m.itemsMatched} of ${m.items} matched a product (${pct(m.itemsMatched, m.items)}%)`}
            </div>
          )}
          {showVendors && (
            <div style={{ color: pct(m.vendorMatched, m.vendorDocs) >= 90 ? "#16a34a" : "#f59e0b" }}>
              🏪 {bn ? `ভেন্ডর: ${m.vendorDocs}টির মধ্যে ${m.vendorMatched}টি মিলেছে` : `Vendors: ${m.vendorMatched} of ${m.vendorDocs} matched`}
            </div>
          )}
          {showItems && m.itemsMatched < m.items && st.unmatchedItems.length > 0 && (
            <details style={{ marginTop: 4 }}>
              <summary style={{ cursor: "pointer" }}>{bn ? "যে প্রোডাক্টগুলো মেলেনি (স্টকে যোগ হবে না)" : "Unmatched products (won't count in stock)"}</summary>
              {st.unmatchedItems.map((x, i) => <div key={i} style={{ color: th.txtMuted }}>• {x}</div>)}
            </details>
          )}
          {showVendors && m.vendorMatched < m.vendorDocs && st.unmatchedVendors.length > 0 && (
            <details style={{ marginTop: 4 }}>
              <summary style={{ cursor: "pointer" }}>{bn ? "যে ভেন্ডরগুলো মেলেনি (নাম দিয়ে থাকবে)" : "Unmatched vendors (kept by name)"}</summary>
              {st.unmatchedVendors.map((x, i) => <div key={i} style={{ color: th.txtMuted }}>• {x}</div>)}
            </details>
          )}
          {sel.has("purchaseInvoices") && st.productsWithOpeningStock > 0 && (
            <div style={{ color: "#ef4444", marginTop: 6, fontWeight: 700 }}>
              ⚠️ {bn
                ? `মিলে যাওয়া ${st.productsWithOpeningStock}টি প্রোডাক্টে আগে থেকেই ওপেনিং স্টক আছে। পুরোনো পারচেজ যোগ হলে এদের স্টক বেড়ে যাবে — ওপেনিং স্টক যদি আজকের আসল স্টক হয়, তাহলে স্টক দুবার গোনা হবে।`
                : `${st.productsWithOpeningStock} matched products already have an opening stock. Old purchases will add to it — if the opening stock is today's real stock, it will be counted twice.`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function BackupPanel({ lang, th, s, toast, shopId, userId }) {
  const bn = lang === "bn";
  const platform = backupPlatform();
  const [lastAt, setLastAt] = useState(() => getLastBackupAt(shopId));
  const [busy, setBusy] = useState(false);
  const [folder, setFolder] = useState("");
  const [pending, setPending] = useState(null);
  const fileInput = useRef(null);

  useEffect(() => {
    if (platform === "desktop") window.S4Desktop.backup.getFolder().then(setFolder).catch(() => {});
  }, [platform]);

  const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;

  const runBackup = async () => {
    setBusy(true);
    try {
      const result = await saveShopBackup(shopId);
      setLastAt(result.at);
      toast(bn ? `✅ ব্যাকআপ তৈরি হয়েছে (${result.documentCount} রেকর্ড, ${fmtSize(result.sizeBytes)})` : `✅ Backup created (${result.documentCount} records, ${fmtSize(result.sizeBytes)})`);
    } catch (error) {
      if (error instanceof BackupCancelled) {
        toast(bn ? "ব্যাকআপ সেভ করা বাতিল হয়েছে" : "Backup sharing cancelled");
      } else {
        console.warn("[S4 Backup] backup failed", error);
        toast(bn ? `❌ ব্যাকআপ হয়নি: ${error?.message || error}` : `❌ Backup failed: ${error?.message || error}`);
      }
    } finally {
      setBusy(false);
    }
  };

  const chooseFolder = async () => {
    const picked = await window.S4Desktop.backup.chooseFolder().catch(() => null);
    if (picked) setFolder(picked);
  };

  const onPickFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    let parsed;
    try {
      parsed = await readBackupFile(file);
    } catch {
      toast(bn ? "❌ এটা সঠিক S4 ব্যাকআপ ফাইল নয়" : "❌ Not a valid S4 backup file");
      return;
    }
    if (parsed.firebaseExport) {
      setBusy(true);
      try {
        const plan = await prepareFirebaseImport(parsed.firebaseExport, { shopId, userId });
        if (!Object.keys(plan.byCollection).length) {
          toast(bn ? `ℹ️ নতুন কিছু আনার নেই — সব ${plan.alreadyThere}টি রেকর্ড আগে থেকেই আছে` : `ℹ️ Nothing new — all ${plan.alreadyThere} records are already here`);
          return;
        }
        setPending({
          fromFirebase: true, plan, fileName: file.name, createdAt: plan.createdAt,
          selected: DEFAULT_SELECTED.filter((n) => plan.byCollection[n]),
        });
      } catch (error) {
        toast(bn ? `❌ পুরোনো ডেটা পড়া যায়নি: ${error?.message || error}` : `❌ Could not read the old data: ${error?.message || error}`);
      } finally {
        setBusy(false);
      }
      return;
    }
    if (parsed.shopId !== shopId) {
      toast(bn ? "❌ এই ব্যাকআপ ফাইল অন্য দোকানের" : "❌ This backup belongs to a different shop");
      return;
    }
    setPending({ ...parsed, fileName: file.name });
  };

  const confirmRestore = async () => {
    let payload = pending;
    if (pending.fromFirebase) {
      const built = buildFirebaseImport(pending.plan, pending.selected);
      if (!built.total) {
        toast(bn ? "কিছু বাছাই করা হয়নি" : "Nothing selected");
        return;
      }
      payload = { shopId, text: built.text };
    }
    setBusy(true);
    try {
      const result = await restoreShopBackup(payload);
      toast(bn ? `✅ রিস্টোর হয়েছে: ${result.restored} রেকর্ড ফিরিয়ে আনা হয়েছে। অ্যাপ রিলোড হচ্ছে...` : `✅ Restored ${result.restored} records. Reloading...`);
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      console.warn("[S4 Backup] restore failed", error);
      toast(bn ? `❌ রিস্টোর হয়নি: ${error?.message || error}` : `❌ Restore failed: ${error?.message || error}`);
      setBusy(false);
    }
  };

  const muted = { fontSize: 12, color: th.txtMuted, lineHeight: 1.6 };

  return (
    <>
      <div style={s.card}>
        <div style={s.settingsLbl}>{bn ? "💾 ব্যাকআপ" : "💾 Backup"}</div>
        <div style={{ ...muted, marginBottom: 12 }}>
          {bn ? "আপনার দোকানের সব ডেটা (প্রোডাক্ট, ইনভয়েস, কাস্টমার, হিসাব) একটি ফাইলে সেভ হবে।" : "All your shop data (products, invoices, customers, accounts) is saved into one file."}
          <br />
          {bn ? "শেষ ব্যাকআপ" : "Last backup"}: <strong style={{ color: th.txtPrimary }}>{fmtDate(lastAt, lang)}</strong>
        </div>

        {platform === "desktop" && (
          <div style={{ ...muted, marginBottom: 12 }}>
            {bn ? "ব্যাকআপ ফোল্ডার" : "Backup folder"}: <strong style={{ color: th.txtPrimary, wordBreak: "break-all" }}>{folder || "—"}</strong>
            <br />
            {bn
              ? "প্রতিদিন নিজে থেকে ব্যাকআপ হয়, শেষ ৩০টা রাখা হয়। Google Drive-এ রাখতে চাইলে Google Drive for Desktop ইন্সটল করে তার ভেতরের একটা ফোল্ডার বেছে নিন।"
              : "Backs up automatically every day and keeps the last 30. To keep copies in Google Drive, install Google Drive for Desktop and choose a folder inside it."}
          </div>
        )}
        {platform === "mobile" && (
          <div style={{ ...muted, marginBottom: 12 }}>
            {bn ? "ব্যাকআপ চাপলে শেয়ার মেনু আসবে, সেখান থেকে \"Drive\" বেছে নিন। সপ্তাহে অন্তত একবার করুন।" : "Tap Backup, then choose \"Drive\" in the share menu. Do it at least once a week."}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button type="button" onClick={runBackup} disabled={busy || !isOnline} style={{ ...s.sendBtn, opacity: busy || !isOnline ? 0.6 : 1 }}>
            {busy ? "..." : platform === "mobile" ? (bn ? "💾 ব্যাকআপ নিন → Google Drive" : "💾 Back up → Google Drive") : bn ? "💾 এখনই ব্যাকআপ নিন" : "💾 Back up now"}
          </button>
          {platform === "desktop" && (
            <>
              <button type="button" onClick={chooseFolder} style={s.stBtn}>{bn ? "📁 ফোল্ডার পরিবর্তন করুন" : "📁 Change folder"}</button>
              <button type="button" onClick={() => window.S4Desktop.backup.openFolder()} style={s.stBtn}>{bn ? "📂 ফোল্ডার খুলুন" : "📂 Open folder"}</button>
            </>
          )}
        </div>
        {!isOnline && <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 12 }}>{bn ? "ব্যাকআপ/রিস্টোরের জন্য ইন্টারনেট লাগবে" : "Backup and restore need an internet connection"}</div>}
      </div>

      <div style={s.card}>
        <div style={s.settingsLbl}>{bn ? "♻️ রিস্টোর (ব্যাকআপ থেকে ফেরত আনা)" : "♻️ Restore from backup"}</div>
        <div style={{ ...muted, marginBottom: 12 }}>
          {bn
            ? "ব্যাকআপ ফাইলের সময়ে যা ছিল সেই ডেটা ফেরত আসবে। ব্যাকআপের পরে নতুন যোগ করা রেকর্ড মুছবে না।"
            : "Brings data back to how it was when the backup was made. Records added after the backup are kept."}
        </div>
        <input ref={fileInput} type="file" accept=".s4backup,application/octet-stream,application/gzip,application/json" style={{ display: "none" }} onChange={onPickFile} />

        {!pending && (
          <button type="button" onClick={() => fileInput.current?.click()} disabled={busy || !isOnline} style={{ ...s.stBtn, width: "100%", opacity: busy || !isOnline ? 0.6 : 1 }}>
            {bn ? "📄 ব্যাকআপ ফাইল বেছে নিন" : "📄 Choose backup file"}
          </button>
        )}

        {pending && (
          <div style={{ border: "1px solid #f59e0b", borderRadius: 12, padding: 12 }}>
            <div style={{ ...muted, color: th.txtPrimary }}>
              {bn ? "ফাইল" : "File"}: <strong style={{ wordBreak: "break-all" }}>{pending.fileName}</strong>
              <br />
              {bn ? "ব্যাকআপের সময়" : "Backup time"}: <strong>{fmtDate(pending.createdAt, lang)}</strong>
              {!pending.fromFirebase && <><br />{bn ? "মোট রেকর্ড" : "Total records"}: <strong>{pending.total}</strong></>}
            </div>
            {pending.fromFirebase && <FirebaseImportChoices bn={bn} th={th} muted={muted} pending={pending} setPending={setPending} />}
            <div style={{ fontSize: 12, color: "#f59e0b", margin: "10px 0" }}>
              {pending.fromFirebase
                ? (bn ? "⚠️ উপরের রেকর্ডগুলো আপনার দোকানে যোগ হবে। এখনকার কোনো ডেটা বদলাবে বা মুছবে না। নিশ্চিত?" : "⚠️ The records above are added to your shop. Nothing current is changed or deleted. Continue?")
                : (bn ? "⚠️ বর্তমান ডেটা ব্যাকআপের ডেটা দিয়ে বদলে যাবে। নিশ্চিত?" : "⚠️ Current records will be replaced with the backup's version. Continue?")}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={confirmRestore} disabled={busy} style={{ ...s.sendBtn, flex: 1, background: "linear-gradient(135deg,#dc2626,#b91c1c)", opacity: busy ? 0.6 : 1 }}>
                {busy ? "..." : pending.fromFirebase ? (bn ? "হ্যাঁ, ডেটা যোগ করুন" : "Yes, add the data") : bn ? "হ্যাঁ, রিস্টোর করুন" : "Yes, restore"}
              </button>
              <button type="button" onClick={() => setPending(null)} disabled={busy} style={{ ...s.stBtn, flex: 1 }}>
                {bn ? "বাতিল" : "Cancel"}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
