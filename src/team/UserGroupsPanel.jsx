import { useEffect, useMemo, useState } from "react";
import PermissionMatrix from "./PermissionMatrix.jsx";
import { GROUP_PRESETS, countOn, groupPermissions } from "./permissionMatrix.js";

const newId = () => `grp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export default function UserGroupsPanel({ lang = "bn", th, s, groups = [], team = [], defaults = {}, onSaveGroups, onApplyGroup, toast }) {
  const L = (bn, en) => (lang === "bn" ? bn : en);
  const [selId, setSelId] = useState(groups[0]?.id || "");
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);

  const staff = useMemo(() => team.filter((m) => m.role !== "owner"), [team]);
  const membersOf = (id) => staff.filter((m) => m.groupId === id);

  useEffect(() => {
    const g = groups.find((x) => x.id === selId);
    setDraft(g ? { ...g, permissions: groupPermissions(g, defaults) } : null);
  }, [selId, groups]); // eslint-disable-line react-hooks/exhaustive-deps

  const startNew = (preset = null) => {
    const name = preset ? (preset[lang] || preset.en) : "";
    setSelId("");
    setDraft({ id: newId(), name, permissions: groupPermissions(preset || { permissions: defaults }, defaults), isNew: true });
  };

  const save = async () => {
    if (!draft) return;
    const name = String(draft.name || "").trim();
    if (!name) return toast?.(L("গ্রুপের নাম দিন", "Enter a group name"), "err");
    if (groups.some((g) => g.id !== draft.id && g.name.trim().toLowerCase() === name.toLowerCase())) {
      return toast?.(L("এই নামে গ্রুপ আগেই আছে", "A group with this name already exists"), "err");
    }
    const rec = { id: draft.id, name, permissions: draft.permissions, updatedAt: new Date().toISOString() };
    const next = draft.isNew ? [...groups, rec] : groups.map((g) => (g.id === rec.id ? rec : g));
    const members = membersOf(rec.id);
    if (members.length && !window.confirm(L(
      `এই গ্রুপের ${members.length} জন কর্মীর অনুমতিও এখন এই অনুযায়ী বদলে যাবে। ঠিক আছে?`,
      `The permissions of ${members.length} staff in this group will change to match. Continue?`
    ))) return;
    setBusy(true);
    try {
      await onSaveGroups(next);
      for (const m of members) await onApplyGroup(m, rec);
      setSelId(rec.id);
      toast?.(L("গ্রুপ সেভ হয়েছে", "Group saved"));
    } catch (e) {
      toast?.(e?.message || String(e), "err");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!draft || draft.isNew) { setDraft(null); return; }
    const members = membersOf(draft.id);
    if (!window.confirm(members.length
      ? L(`${members.length} জন কর্মী এই গ্রুপে আছে। গ্রুপ মুছলে তাদের বর্তমান অনুমতি থেকে যাবে, শুধু গ্রুপের নাম উঠে যাবে। মুছবেন?`,
        `${members.length} staff are in this group. They keep their current permissions; only the group is removed. Delete?`)
      : L("গ্রুপটি মুছবেন?", "Delete this group?"))) return;
    setBusy(true);
    try {
      await onSaveGroups(groups.filter((g) => g.id !== draft.id));
      for (const m of members) await onApplyGroup(m, null);
      setSelId("");
      toast?.(L("গ্রুপ মুছে ফেলা হয়েছে", "Group deleted"));
    } catch (e) {
      toast?.(e?.message || String(e), "err");
    } finally {
      setBusy(false);
    }
  };

  const unusedPresets = GROUP_PRESETS.filter((p) => !groups.some((g) => g.name.trim().toLowerCase() === (p[lang] || p.en).toLowerCase()));
  const chip = (active) => ({
    padding: "7px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer",
    border: active ? "1px solid #f97316" : `1px solid ${th.border}`,
    background: active ? "rgba(249,115,22,.15)" : "transparent",
    color: active ? "#f97316" : th.txtPrimary,
  });

  return (
    <div>
      <div style={{ ...s.card, marginBottom: 12 }}>
        <div style={s.settingsLbl}>{L("ইউজার গ্রুপ", "User groups")} ({groups.length})</div>
        <div style={{ fontSize: 12, color: "#71717a", marginBottom: 10, lineHeight: 1.5 }}>
          {L("সেলসম্যান, ক্যাশিয়ার, স্টোর কিপার এর মতো গ্রুপ বানান। কোনো কর্মীকে গ্রুপে দিলে গ্রুপের সব অনুমতি তার উপর বসে যাবে; গ্রুপ বদলালে গ্রুপের সবার অনুমতি একসাথে বদলাবে। কর্মীকে গ্রুপে দিতে: সেটিংস → টিম।",
            "Create groups like Salesman, Cashier, Store keeper. A staff member placed in a group gets its permissions; changing the group updates everyone in it. Assign staff from Settings → Team.")}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {groups.map((g) => (
            <button key={g.id} type="button" style={chip(draft?.id === g.id)} onClick={() => setSelId(g.id)}>
              👥 {g.name} <span style={{ color: "#71717a", fontWeight: 600 }}>· {membersOf(g.id).length}</span>
            </button>
          ))}
          <button type="button" style={{ ...chip(draft?.isNew), borderStyle: "dashed" }} onClick={() => startNew()}>＋ {L("নতুন গ্রুপ", "New group")}</button>
        </div>
        {unusedPresets.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#71717a" }}>{L("তৈরি টেমপ্লেট:", "Templates:")}</span>
            {unusedPresets.map((p) => (
              <button key={p.id} type="button" style={{ ...chip(false), padding: "4px 10px", fontSize: 11 }} onClick={() => startNew(p)}>＋ {p[lang] || p.en}</button>
            ))}
          </div>
        )}
      </div>

      {draft && (
        <div style={{ ...s.card, border: "1px solid #f97316" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
            <input style={{ ...s.inp, flex: 1, minWidth: 180 }} placeholder={L("গ্রুপের নাম", "Group name")} value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
            <span style={{ fontSize: 12, color: "#71717a" }}>{countOn(draft.permissions)} {L("টি অনুমতি চালু", "permissions on")}</span>
          </div>
          {!draft.isNew && membersOf(draft.id).length > 0 && (
            <div style={{ fontSize: 12, color: "#71717a", marginBottom: 8 }}>
              {L("সদস্য:", "Members:")} {membersOf(draft.id).map((m) => m.personName || m.username).join(", ")}
            </div>
          )}
          <PermissionMatrix lang={lang} th={th} perms={draft.permissions}
            onToggle={(key, val) => setDraft((d) => ({ ...d, permissions: { ...d.permissions, [key]: val } }))} />
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button type="button" style={{ ...s.sendBtn, flex: 1 }} disabled={busy} onClick={save}>{busy ? "..." : `💾 ${L("গ্রুপ সেভ", "Save group")}`}</button>
            <button type="button" style={{ ...s.addCoBtn, borderColor: "#450a0a", color: "#ef4444" }} disabled={busy} onClick={remove}>
              {draft.isNew ? L("বাতিল", "Cancel") : `🗑️ ${L("মুছুন", "Delete")}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
