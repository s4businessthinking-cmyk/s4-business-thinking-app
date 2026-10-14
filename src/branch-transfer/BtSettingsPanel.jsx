import { bt, actorFrom, useShopCollection, normalizeError, NativeButton } from "./btShared.jsx";
import { useMemo, useState, useEffect } from "react";
import { DEFAULT_BRANCH_TRANSFER_SETTINGS } from "./branchTransferDomain.js";
import { BRANCH_TRANSFER_COLLECTIONS, saveBranchTransferSettings, listShopRecords, saveBranch, disableBranch } from "./branchTransferService.js";

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
      <div style={s.settingsLbl}>➕ {t.saveBranch}</div>
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
      <NativeButton s={s} tone="primary" disabled={busy} onClick={submit} style={{ marginTop: 10 }}>{t.saveBranch}</NativeButton>
    </div>
  );
}

export function BranchList({ lang, s, th, branches, onDisable, busy }) {
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
          </div>
          <NativeButton s={s} tone="danger" disabled={busy || branch.active === false} onClick={() => onDisable(branch)}>
            {branch.active === false ? t.disable : t.disable}
          </NativeButton>
        </div>
      ))}
    </div>
  );
}

export function SettingsPanel({ lang, s, th, shopId, user, profile, team, settings, onSettingsChanged, toast }) {
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
        <div style={s.settingsLbl}>🚚 {t.settingsTitle}</div>
        <ToggleRow th={th} label={t.enable} help={t.enableHelp} checked={draft.enabled === true} onChange={(value) => setDraft((prev) => ({ ...prev, enabled: value }))} />
        <ToggleRow th={th} label={t.autoInvoice} help={t.autoHelp} checked={draft.autoCreatePurchaseInvoiceOnReceive === true} onChange={(value) => setDraft((prev) => ({ ...prev, autoCreatePurchaseInvoiceOnReceive: value }))} />
        <ToggleRow th={th} label={t.partial} checked={draft.allowPartialReceive === true} onChange={(value) => setDraft((prev) => ({ ...prev, allowPartialReceive: value }))} />
        <NativeButton s={s} tone="primary" disabled={busy} onClick={saveSettings} style={{ marginTop: 14 }}>{t.saveSettings}</NativeButton>
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
          <BranchList
            lang={lang}
            s={s}
            th={th}
            branches={branches}
            busy={busy}
            onDisable={(branch) => run(async () => {
              const saved = await disableBranch({ branch, actor });
              await refreshBranches();
              return saved;
            }, t.branchSaved)}
          />
        </div>
      )}
    </>
  );
}
