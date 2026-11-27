import { bt, actorFrom, useShopCollection, normalizeError, NativeButton } from "./btShared.jsx";
import { useMemo, useState, useEffect } from "react";
import { DEFAULT_BRANCH_TRANSFER_SETTINGS } from "./branchTransferDomain.js";
import { BRANCH_TRANSFER_COLLECTIONS, saveBranchTransferSettings, listShopRecords, saveBranch, disableBranch } from "./branchTransferService.js";
import { runFullParentCatalogSync } from "./parentCatalogSync.js";
import PremierUatPanel from "./PremierUatPanel.jsx";

export function ToggleRow({ th, label, help, checked, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "14px 0", borderBottom: `1px solid ${th.border}` }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: th.txtPrimary, marginBottom: 4 }}>{label}</div>
        {help && <div style={{ fontSize: 12, color: th.txtMuted, lineHeight: 1.5 }}>{help}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        style={{ width: 52, height: 30, borderRadius: 15, border: "none", cursor: "pointer", background: checked ? "#22c55e" : "#3f3f46", position: "relative", flexShrink: 0, transition: "background 0.2s", marginTop: 4 }}
      >
        <span style={{ position: "absolute", top: 3, left: checked ? 25 : 3, width: 24, height: 24, borderRadius: "50%", background: "#fff", transition: "left 0.15s", display: "block" }} />
      </button>
    </div>
  );
}

export function BranchForm({ lang, s, th, team, onSave, busy }) {
  const t = bt(lang);
  const [form, setForm] = useState({ name: "", code: "", location: "", phone: "", receiverKey: "" });
  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = () => {
    const member = team.find((row) => String(row.uid || row.id || row.localUserId || "") === form.receiverKey);
    onSave({
      name: form.name,
      code: form.code,
      location: form.location,
      phone: form.phone,
      receiverUserId: member?.firebaseUid || member?.uid || member?.id || "",
      receiverLocalUserId: member?.localUserId || "",
      receiverName: member?.personName || member?.username || "",
    }).then((ok) => {
      if (ok) setForm({ name: "", code: "", location: "", phone: "", receiverKey: "" });
    });
  };

  return (
    <div style={{ ...s.card, marginBottom: 12 }}>
      <div style={s.settingsLbl}> {t.saveBranch}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8 }}>
        <input style={s.inp} placeholder={t.branchName} value={form.name} onChange={(e) => update("name", e.target.value)} />
        <input style={s.inp} placeholder={t.branchCode} value={form.code} onChange={(e) => update("code", e.target.value)} />
        <input style={s.inp} placeholder={t.location} value={form.location} onChange={(e) => update("location", e.target.value)} />
        <input style={s.inp} placeholder={t.phone} value={form.phone} onChange={(e) => update("phone", e.target.value)} />
        <select style={s.sel} value={form.receiverKey} onChange={(e) => update("receiverKey", e.target.value)}>
          <option value="">{t.noReceiver}</option>
          {team.filter((member) => member.role !== "owner" && member.status !== "disabled").map((member) => {
            const key = String(member.uid || member.id || member.localUserId || member.username || "");
            return <option key={key} value={key}>{member.personName || member.username || key}</option>;
          })}
        </select>
      </div>
      <NativeButton s={s} tone="primary"disabled={busy} onClick={submit} style={{ marginTop: 10 }}>{t.saveBranch}</NativeButton>
    </div>
  );
}

export function BranchList({ lang, s, th, branches, onDisable, onCounterLogin, busy }) {
  const t = bt(lang);
  if (!branches.length) return <div style={{ ...s.card, color: th.txtMuted, textAlign: "center", padding: 30 }}>{t.noBranches}</div>;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {branches.map((branch) => (
        <div key={branch.id} style={{ ...s.card, display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: th.txtPrimary, fontWeight: 800 }}>{branch.name}</div>
            <div style={{ color: th.txtMuted, fontSize: 11, marginTop: 3 }}>
              {[branch.code, branch.location, branch.receiverName].filter(Boolean).join(" · ") || "—"}
            </div>
            {branch.ledgerShopId && (
              <div style={{ color: th.txtMuted, fontSize: 10, marginTop: 4, fontFamily: "monospace" }}>
                {lang === "bn" ? "Company file: " : "Company file: "}{branch.ledgerShopId}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            {onCounterLogin && branch.active !== false && (
              <NativeButton s={s} tone="primary" disabled={busy} onClick={() => onCounterLogin(branch)}>
                {lang === "bn" ? "কাউন্টার লগইন" : "Counter login"}
              </NativeButton>
            )}
            <NativeButton s={s} tone="danger" disabled={busy || branch.active === false} onClick={() => onDisable(branch)}>
              {branch.active === false ? t.disable : t.disable}
            </NativeButton>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SettingsPanel({ lang, s, th, shopId, homeShopId = "", localShop = null, user, profile, team, customers = [], vendors = [], settings, onSettingsChanged, toast, createBranchCounterLogin, createMainCounterLogin }) {
  const t = bt(lang);
  const actor = useMemo(() => actorFrom(user, profile), [user, profile]);
  const [draft, setDraft] = useState({ ...DEFAULT_BRANCH_TRANSFER_SETTINGS, ...settings });
  const [busy, setBusy] = useState(false);
  const [branches, setBranches] = useShopCollection(BRANCH_TRANSFER_COLLECTIONS.BRANCHES, shopId);

  useEffect(() => setDraft({ ...DEFAULT_BRANCH_TRANSFER_SETTINGS, ...settings }), [settings]);

  const run = async (work, success) => {
    setBusy(true);
    try {
      const result = await work();
      if (success) toast(success);
      return result;
    } catch (error) {
      toast(normalizeError(error, lang), "err");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = () => run(async () => {
    const saved = await saveBranchTransferSettings({ shopId, settings: draft, actor });
    const next = { ...DEFAULT_BRANCH_TRANSFER_SETTINGS, ...saved };
    onSettingsChanged?.(next);
    window.dispatchEvent(new CustomEvent("s4-branch-transfer-settings-changed", { detail: next }));
    return saved;
  }, t.savedSettings);

  const refreshBranches = async () => setBranches(await listShopRecords(BRANCH_TRANSFER_COLLECTIONS.BRANCHES, shopId));

  return (
    <>
      <div style={s.card}>
        <div style={s.settingsLbl}> {t.settingsTitle}</div>
        <ToggleRow th={th} label={t.enable} help={t.enableHelp} checked={draft.enabled === true} onChange={(value) => setDraft((prev) => ({ ...prev, enabled: value }))} />
        <ToggleRow th={th} label={t.autoInvoice} help={t.autoHelp} checked={draft.autoCreatePurchaseInvoiceOnReceive === true} onChange={(value) => setDraft((prev) => ({ ...prev, autoCreatePurchaseInvoiceOnReceive: value }))} />
        <ToggleRow th={th} label={t.partial} checked={draft.allowPartialReceive === true} onChange={(value) => setDraft((prev) => ({ ...prev, allowPartialReceive: value }))} />
        <ToggleRow
          th={th}
          label={lang === "bn" ? "প্রতি শাখা = আলাদা company file (Premier)" : "Each branch = separate company file (Premier)"}
          help={lang === "bn" ? "শাখা সেভ হলে child shopId তৈরি; কাউন্টার লগইন সেই ফাইলে — আলাদা ক্যাশ বই/ডাটা" : "Saving a branch creates a child shopId; counter logins use that file only"}
          checked={draft.companyFilePerBranch !== false}
          onChange={(value) => setDraft((prev) => ({ ...prev, companyFilePerBranch: value }))}
        />
        <ToggleRow
          th={th}
          label={lang === "bn" ? "HQ কাস্টমার/সাপ্লায়ার শাখায় শেয়ার" : "Share HQ customers & vendors with branches"}
          help={lang === "bn" ? "Child company file-এ HQ পার্টি লিস্ট + নতুন child পার্টি — child তৈরি হলে HQ থেকে কপি" : "Branch files see HQ party master; new child files copy HQ parties on create"}
          checked={draft.sharePartiesFromHq !== false}
          onChange={(value) => setDraft((prev) => ({ ...prev, sharePartiesFromHq: value }))}
        />
        <NativeButton s={s} tone="primary"disabled={busy} onClick={saveSettings} style={{ marginTop: 14 }}>{t.saveSettings}</NativeButton>
        {draft.companyFilePerBranch !== false && (
          <NativeButton
            s={s}
            tone="primary"
            disabled={busy}
            onClick={() => run(async () => {
              const out = await runFullParentCatalogSync(shopId);
              const pu = out.products?.updated ?? 0;
              const pc = out.parties?.customers ?? 0;
              const pv = out.parties?.vendors ?? 0;
              window.dispatchEvent(new CustomEvent("s4-products-changed", { detail: { shopId } }));
              toast(
                lang === "bn"
                  ? `সিঙ্ক: পণ্য ${pu}, কাস্টমার ${pc}, ভেন্ডর ${pv}`
                  : `Synced — products ${pu}, customers ${pc}, vendors ${pv}`
              );
              return out;
            })}
            style={{ marginTop: 10, marginLeft: 0 }}
          >
            {lang === "bn" ? "HQ থেকে পণ্য ও পার্টি শাখায় সিঙ্ক" : "Sync products & parties from HQ to branches"}
          </NativeButton>
        )}
      </div>

      {draft.enabled && (
        <div style={{ marginTop: 12 }}>
          <BranchForm
            lang={lang}
            s={s}
            th={th}
            team={team}
            busy={busy}
            onSave={(branch) => run(async () => {
              const saved = await saveBranch({ shopId, branch, actor });
              await refreshBranches();
              return saved;
            }, t.branchSaved)}
          />
          {createMainCounterLogin && (
            <div style={{ marginBottom: 10 }}>
              <NativeButton s={s} tone="primary" disabled={busy} onClick={() => run(async () => { await createMainCounterLogin(); }, lang === "bn" ? "মূল দোকানের কাউন্টার লগইন তৈরি" : "Main store counter login created")}>
                {lang === "bn" ? "মূল দোকান কাউন্টার লগইন (username: main)" : "Main counter login (username: main)"}
              </NativeButton>
            </div>
          )}
          <BranchList
            lang={lang}
            s={s}
            th={th}
            branches={branches}
            busy={busy}
            onCounterLogin={createBranchCounterLogin ? (branch) => run(async () => { await createBranchCounterLogin(branch); }, lang === "bn" ? "কাউন্টার লগইন তৈরি হয়েছে" : "Counter login created") : undefined}
            onDisable={(branch) => run(async () => {
              const saved = await disableBranch({ branch, actor });
              await refreshBranches();
              return saved;
            }, t.branchSaved)}
          />
        </div>
      )}
      {draft.companyFilePerBranch !== false && (
        <PremierUatPanel
          lang={lang}
          s={s}
          th={th}
          shopId={shopId}
          homeShopId={homeShopId || shopId}
          localShop={localShop}
          toast={toast}
          team={team}
          customers={customers}
          vendors={vendors}
        />
      )}
    </>
  );
}
