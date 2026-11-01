import { useEffect, useMemo, useState } from "react";
import PermissionMatrix from "./PermissionMatrix.jsx";
import { countOn, groupDraftDirty, groupPermissions, unusedGroupPresets } from "./permissionMatrix.js";

function memberLabel(m) {
  const name = m.personName || m.username || m.id;
  return m.username ? `${name} · @${m.username}` : name;
}

function GroupMembersBlock({ lang, th, s, draft, dirty, staff, members, onApplyGroup, toast }) {
  const L = (bn, en) => (lang === "bn" ? bn : en);
  const [addId, setAddId] = useState("");
  const [busy, setBusy] = useState(false);
  const free = staff.filter((m) => m.groupId !== draft.id);
  const apply = async (member, group) => {
    setBusy(true);
    try {
      await onApplyGroup(member, group);
      setAddId("");
      toast?.(group
        ? L("কর্মী গ্রুপে যোগ হয়েছে — লগইন তার নিজের username/password", "Staff added — they still log in with their own username/password")
        : L("কর্মী গ্রুপ থেকে সরানো হয়েছে", "Staff removed from group"));
    } catch (e) {
      toast?.(e?.message || String(e), "err");
    } finally {
      setBusy(false);
    }
  };
  if (draft.isNew) {
    return (
      <div style={{ fontSize: 12, color: "#71717a", marginBottom: 8, lineHeight: 1.5 }}>
        {L("গ্রুপ সেভ করলে এখানে কর্মী যোগ করা যাবে। প্রত্যেকের username ও password আলাদা থাকবে।",
          "Save the group first, then add staff here. Each person keeps a separate username and password.")}
      </div>
    );
  }
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12, color: "#71717a", marginBottom: 6, lineHeight: 1.5 }}>
        {L("গ্রুপ শুধু অনুমতি দেয়। লগইন আলাদা — সেটিংস → টিমে যে username/password দেওয়া হয়েছে।",
          "The group only sets permissions. Login stays separate — the username/password from Settings → Team.")}
      </div>
      {members.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {members.map((m) => (
            <span key={m.uid || m.id} style={{
              display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, padding: "4px 8px",
              borderRadius: 999, border: `1px solid ${th.border}`, color: th.txtPrimary,
            }}>
              {memberLabel(m)}
              <button type="button" disabled={busy} onClick={() => apply(m, null)}
                style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontWeight: 800, padding: 0, fontFamily: "inherit" }}>×</button>
            </span>
          ))}
        </div>
      )}
      {free.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <select style={{ ...s.sel, flex: 1, minWidth: 160 }} value={addId} onChange={(e) => setAddId(e.target.value)} disabled={busy}>
            <option value="">{L("কর্মী গ্রুপে দিন…", "Add staff to this group…")}</option>
            {free.map((m) => <option key={m.uid || m.id} value={m.uid || m.id}>{memberLabel(m)}</option>)}
          </select>
          <button type="button" style={{ ...s.addCoBtn, padding: "6px 10px" }} disabled={busy || !addId} onClick={() => {
            if (dirty) return toast?.(L("আগে গ্রুপ সেভ করুন, তারপর কর্মী যোগ করুন", "Save the group first, then add staff"), "err");
            const m = free.find((x) => (x.uid || x.id) === addId);
            if (m) apply(m, { id: draft.id, name: draft.name, permissions: draft.permissions });
          }}>{L("যোগ", "Add")}</button>
        </div>
      )}
    </div>
  );
}

const newId = () => `grp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export default function UserGroupsPanel({ lang = "bn", th, s, groups = [], team = [], defaults = {}, onSaveGroups, onApplyGroup, toast }) {
  const L = (bn, en) => (lang === "bn" ? bn : en);
  const [selId, setSelId] = useState(groups[0]?.id || "");
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);

  const staff = useMemo(() => team.filter((m) => m.role !== "owner"), [team]);
  const membersOf = (id) => staff.filter((m) => m.groupId === id);
  const dirty = groupDraftDirty(draft, groups, defaults);

  const askLeave = () => {
    if (!dirty) return true;
    return window.confirm(L("গ্রুপ সেভ হয়নি। বদল ফেলে চলে যাবেন?", "Group is not saved. Discard changes and leave?"));
  };

  useEffect(() => {
    if (!selId) {
      setDraft((prev) => (prev?.isNew ? prev : null));
      return;
    }
    const g = groups.find((x) => x.id === selId);
    if (!g) return;
    setDraft((prev) => {
      if (prev && prev.id === g.id && groupDraftDirty(prev, groups, defaults)) return prev;
      return { ...g, permissions: groupPermissions(g, defaults) };
    });
  }, [selId, groups]); // eslint-disable-line react-hooks/exhaustive-deps

  const startNew = (preset = null) => {
    if (!askLeave()) return;
    const rec = {
      id: newId(),
      name: preset ? (preset[lang] || preset.en) : "",
      permissions: groupPermissions(preset || { permissions: defaults }, defaults),
      isNew: true,
    };
    setDraft(rec);
    setSelId(rec.id);
  };

  const selectGroup = (id) => {
    if (id === selId || id === draft?.id) return;
    if (!askLeave()) return;
    setSelId(id);
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
      setDraft(rec);
      setSelId(rec.id);
      toast?.(L("গ্রুপ সেভ হয়েছে", "Group saved"));
    } catch (e) {
      toast?.(e?.message || String(e), "err");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!draft || draft.isNew) { setDraft(null); setSelId(groups[0]?.id || ""); return; }
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

  const unusedPresets = unusedGroupPresets(groups);
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
          {L("সেলসম্যান, ক্যাশিয়ার, স্টোর কিপার এর মতো গ্রুপ বানান। টেমপ্লেটের ডিফল্ট টিক থাকে; মালিক পরে যেকোনো টিক দিতে বা তুলতে পারেন। গ্রুপে দিলেও প্রত্যেকের নিজস্ব username ও password দিয়ে লগইন। মোবাইল ও পিসিতে একই।",
            "Create groups like Salesman, Cashier, Store keeper. Templates keep their default ticks; the owner can then turn any tick on or off. Each staff still logs in with their own username and password. Same on mobile and PC.")}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {groups.map((g) => (
            <button key={g.id} type="button" style={chip(draft?.id === g.id)} onClick={() => selectGroup(g.id)}>
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
          <GroupMembersBlock lang={lang} th={th} s={s} draft={draft} dirty={dirty} staff={staff}
            members={membersOf(draft.id)} onApplyGroup={onApplyGroup} toast={toast} />
          <PermissionMatrix lang={lang} th={th} perms={draft.permissions}
            onToggle={(key, val) => setDraft((d) => ({ ...d, permissions: { ...d.permissions, [key]: val } }))}
            onSetFlags={(perms) => setDraft((d) => ({ ...d, permissions: perms }))} />
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
