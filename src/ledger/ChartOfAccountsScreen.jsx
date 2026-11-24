// Chart of Accounts: the shop's account list with code, group (as the ledger posts it), system / custom and active
// flags, and the shop's own groups / sub-groups (coaGroups.js) as a tree inside each ledger group. Owner edits; everyone
// with access can view, print and export. Saved on the shop record; see chartOfAccounts.js.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { PM_CSS } from "../product-master/pmStyles";
import { SI_CSS, usePmFitHeight, usePmMobile } from "../sales-invoice/siSkin";
import { offlineList } from "../offline/offlineRepository";
import { rowsOf } from "../inventory/stockFromInvoices";
import { saveShopRecord } from "../offline/shopService";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { saveTextFile } from "../utils/saveTextFile.js";
import { csvText } from "../reports/vatExport.js";
import { EXPENSE_CATEGORIES } from "../expenses/ExpensesTab.jsx";
import { GROUPS } from "./globalLedger.js";
import { ESSENTIAL, canDelete, chartCsvRows, groupLabel, groupOfName, missingFromVouchers, normalizeChart, toSaved, usedNames, validateAccount } from "./chartOfAccounts.js";
import { GROUP_NATURES, applyGroups, assignIssue, canDeleteGroup, groupName, groupPath, groupTree, groupsForAccount, normalizeGroups, toSavedGroups, validateGroup } from "./coaGroups.js";

export const CHART_EXPENSE_NAMES = EXPENSE_CATEGORIES.filter((c) => c.key !== "other").map((c) => c.en);
const lc = (v) => String(v || "").trim().toLowerCase();

export default function ChartOfAccountsScreen({ lang = "en", shopId, shop, isOwner = false, customers = [], vendors = [], banks = [], shopName = "", canPrint = false, toast, onShopUpdated }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const [vouchers, setVouchers] = useState(null);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [draft, setDraft] = useState(null);
  const [groupDraft, setGroupDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const mobile = usePmMobile();
  const rootRef = useRef(null);
  const fitH = usePmFitHeight(rootRef, mobile);
  const seededRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    offlineList("accountVouchers").then((r) => { if (!cancelled) setVouchers(rowsOf(r).filter((v) => v && !v.isDeleted && (!shopId || !v.shopId || v.shopId === shopId))); })
      .catch(() => { if (!cancelled) setVouchers([]); });
    return () => { cancelled = true; };
  }, [shopId]);

  const saved = Array.isArray(shop?.chartOfAccounts) ? shop.chartOfAccounts : null;
  const coaGroups = useMemo(() => normalizeGroups(shop?.coaGroups), [shop?.coaGroups]);
  const chart = useMemo(() => applyGroups(normalizeChart(saved, { expenseNames: CHART_EXPENSE_NAMES }), coaGroups), [saved, coaGroups]);
  const used = useMemo(() => usedNames(vouchers || []), [vouchers]);
  const partyNames = useMemo(() => [...customers.filter((c) => c && !c.isDeleted).map((c) => c.customerName), ...vendors.filter((v) => v && !v.isDeleted).map((v) => v.vendorName)].filter(Boolean), [customers, vendors]);
  const missing = useMemo(() => (vouchers ? missingFromVouchers(chart, vouchers, partyNames) : []), [chart, vouchers, partyNames]);

  const persist = async (next, message) => {
    if (!isOwner) return false;
    setSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const list = toSaved(next).map((a) => ({ ...a, createdAt: a.createdAt || nowIso }));
      const updated = await saveShopRecord(shopId, { chartOfAccounts: list });
      onShopUpdated?.(updated);
      if (message) toast?.(message);
      return true;
    } catch (e) {
      toast?.(` ${e?.message || e}`, "err");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const persistGroups = async (next, message) => {
    if (!isOwner) return false;
    setSaving(true);
    try {
      const updated = await saveShopRecord(shopId, { coaGroups: toSavedGroups(next) });
      onShopUpdated?.(updated);
      if (message) toast?.(message);
      return true;
    } catch (e) {
      toast?.(` ${e?.message || e}`, "err");
      return false;
    } finally {
      setSaving(false);
    }
  };

  // First open by the owner: save the system accounts and every name already used in journals / contra.
  useEffect(() => {
    if (!isOwner || saved || !vouchers || seededRef.current) return;
    seededRef.current = true;
    persist([...chart, ...missing], L("হিসাবের খাতের তালিকা তৈরি হয়েছে", "Chart of accounts set up"));
  }, [isOwner, saved, vouchers]); // eslint-disable-line react-hooks/exhaustive-deps

  const errText = (e) => ({
    name: L("খাতের নাম দিন", "Enter the account name"),
    duplicate: L("এই নামে খাত আগে থেকেই আছে", "An account with this name already exists"),
    duplicateCode: L("এই কোড আরেকটা খাতে আছে", "Another account already has this code"),
    party: L("এটা কাস্টমার / সাপ্লায়ারের নাম — পার্টির লেজার আলাদা", "This is a customer / supplier name — parties have their own ledgers"),
    systemRename: L("সিস্টেম খাতের নাম বদলানো যায় না — বিল ও ভাউচার এই নামেই পোস্ট হয়", "System account names can't change — bills and vouchers post to this name"),
    usedRename: L("এই খাতে ভাউচার লেখা আছে, তাই নাম বদলানো যাবে না। বন্ধ করে নতুন নামে খাত যোগ করুন।", "Vouchers already use this account, so it can't be renamed. Switch it off and add a new one."),
    essential: L("এই খাত প্রতিটি বিল / VAT-এ লাগে, বন্ধ করা যাবে না", "Every bill / VAT entry uses this account, it can't be switched off"),
    nature: L("এই গ্রুপ লেজারের অন্য ভাগের - খাতটা শুধু নিজের ভাগের (যেমন খরচ খাত খরচের) গ্রুপে যায়", "That group is on another side of the ledger - an account only goes into a group of its own kind (an expense account into an expense group)"),
    group: L("গ্রুপটা নেই বা বন্ধ", "That group is missing or switched off"),
  }[e] || e);
  const groupErrText = (e) => ({
    name: L("গ্রুপের নাম দিন", "Enter the group name"), nature: L("লেজারের ভাগ বাছুন", "Pick the ledger side"),
    parent: L("উপরের গ্রুপ একই ভাগের হতে হবে", "The parent group must be of the same kind"), cycle: L("গ্রুপ নিজের ভেতরে রাখা যায় না", "A group can't sit inside itself"),
    depth: L("সর্বোচ্চ ৩ স্তর", "At most 3 levels"), duplicate: L("একই জায়গায় এই নামে গ্রুপ আছে", "A group with this name is already there"),
    duplicateCode: L("এই কোড আরেকটা গ্রুপে আছে", "Another group already has this code"),
    natureLocked: L("গ্রুপে খাত বা সাব-গ্রুপ আছে, তাই ভাগ বদলানো যাবে না", "The group has accounts or sub-groups, so its kind can't change"),
    busy: L("গ্রুপে খাত বা চালু সাব-গ্রুপ আছে - আগে সরিয়ে নিন", "The group still has accounts or active sub-groups - move them first"),
  }[e] || e);
  const saveGroup = async () => {
    const res = validateGroup(groupDraft, coaGroups, chart);
    if (res.error) { toast?.(groupErrText(res.error), "err"); return; }
    const nowIso = new Date().toISOString();
    const row = { ...res.group, createdAt: res.group.createdAt || nowIso, updatedAt: nowIso };
    const next = coaGroups.some((g) => g.id === row.id) ? coaGroups.map((g) => (g.id === row.id ? row : g)) : [...coaGroups, row];
    if (await persistGroups(next, groupDraft.id ? L("গ্রুপ আপডেট হয়েছে", "Group updated") : L("গ্রুপ যোগ হয়েছে", "Group added"))) setGroupDraft(null);
  };
  const removeGroup = async () => {
    const g = coaGroups.find((x) => x.id === groupDraft?.id);
    if (!canDeleteGroup(g, coaGroups, chart)) return;
    if (!window.confirm(L(`"${groupName(g, bn)}" গ্রুপ মুছবেন?`, `Delete the group "${groupName(g, bn)}"?`))) return;
    if (await persistGroups(coaGroups.filter((x) => x.id !== g.id), L("গ্রুপ মুছে ফেলা হয়েছে", "Group deleted"))) setGroupDraft(null);
  };

  const saveDraft = async () => {
    const res = validateAccount(draft, chart, { used, partyNames, expenseNames: CHART_EXPENSE_NAMES });
    if (res.error) { toast?.(errText(res.error), "err"); return; }
    const issue = assignIssue(res.account, draft.groupId || "", coaGroups);
    if (issue) { toast?.(errText(issue), "err"); return; }
    const nowIso = new Date().toISOString();
    const account = { ...res.account, groupId: draft.groupId || "" };
    const next = draft.id
      ? chart.map((a) => (a.id === draft.id ? { ...a, ...account, updatedAt: nowIso } : a))
      : [...chart, { ...account, createdAt: nowIso, updatedAt: nowIso }];
    if (await persist(next, draft.id ? L("খাত আপডেট হয়েছে", "Account updated") : L("খাত যোগ হয়েছে", "Account added"))) setDraft(null);
  };
  const removeDraft = async () => {
    const acc = chart.find((a) => a.id === draft?.id);
    if (!canDelete(acc, used)) return;
    if (!window.confirm(L(`"${acc.name}" খাত মুছে ফেলবেন?`, `Delete the account "${acc.name}"?`))) return;
    if (await persist(chart.filter((a) => a.id !== acc.id), L("খাত মুছে ফেলা হয়েছে", "Account deleted"))) setDraft(null);
  };
  const addMissing = () => persist([...chart, ...missing], L(`${missing.length}টি খাত যোগ হয়েছে`, `${missing.length} account(s) added`));

  const q = lc(query);
  const rows = chart.filter((a) => (showAll || a.active) && (!q || lc(a.name).includes(q) || lc(a.code).includes(q)));
  // each ledger group: its accounts without a custom group, then the custom group tree with the accounts inside
  const groups = GROUPS.map((g) => {
    const mine = rows.filter((a) => a.group === g.id);
    const tree = groupTree(coaGroups, g.id).filter(({ group }) => showAll || group.active || mine.some((a) => a.groupId === group.id))
      .map(({ group, depth }) => ({ group, depth, rows: mine.filter((a) => a.groupId === group.id) }));
    return { ...g, rows: mine, loose: mine.filter((a) => !a.groupId), tree };
  }).filter((g) => g.rows.length || (g.tree.length && !q));
  const pathOf = (a) => (a.groupId ? groupPath(coaGroups, a.groupId, false) : "");

  const print = () => {
    printWithSettings(generateStatementHTML({
      shopName, title: "CHART OF ACCOUNTS", subtitle: new Date().toISOString().slice(0, 10), partyLine: showAll ? "All accounts" : "Active accounts",
      cols: [{ label: "Code" }, { label: "Name" }, { label: "Group" }, { label: "System" }, { label: "Active" }],
      rows: rows.map((a) => [a.code, a.name, [groupLabel(a.group), pathOf(a)].filter(Boolean).join(" > "), a.system ? "Yes" : "No", a.active ? "Yes" : "No"]),
    }), { lang });
  };
  const exportCsv = async () => {
    try { await saveTextFile("chart-of-accounts.csv", csvText(chartCsvRows(rows, coaGroups.length ? pathOf : null))); } catch (e) { toast?.(e.message || String(e), "err"); }
  };

  const current = draft?.id ? chart.find((a) => a.id === draft.id) : null;
  const lockedName = !!current && (current.system || used.has(lc(current.name)));
  const draftGroup = draft ? groupOfName(draft.name || "", CHART_EXPENSE_NAMES) : "";
  const draftGroupChoices = draft ? groupsForAccount(coaGroups, { group: draftGroup }) : [];
  const currentGroup = groupDraft?.id ? coaGroups.find((g) => g.id === groupDraft.id) : null;
  // parents the group may sit under: same kind, active, and not itself / its own sub-group / too deep (same rule as save)
  const parentChoices = groupDraft ? groupTree(coaGroups, groupDraft.nature).filter(({ group }) => group.active
    && !["cycle", "depth", "parent"].includes(validateGroup({ ...groupDraft, nameEn: groupDraft.nameEn || "x", parentId: group.id }, coaGroups, chart).error)) : [];
  const openAccount = (a) => setDraft({ id: a.id, code: a.code, name: a.name, active: a.active, groupId: a.groupId || "" });
  const accountRow = (a, indent) => (
    <tr key={a.id} className={isOwner ? "pm-clickable" : undefined} onClick={isOwner ? () => openAccount(a) : undefined} style={!a.active ? { color: "#94a3b8" } : undefined}>
      <td>{a.code}</td><td className="si-strong" style={indent ? { paddingLeft: 8 + indent * 16 } : undefined}>{a.name}</td>{!mobile && <td>{[groupLabel(a.group, bn), a.groupId ? groupPath(coaGroups, a.groupId, bn) : ""].filter(Boolean).join(" > ")}</td>}
      <td>{a.system ? <span className="si-badge" style={{ color: "#1d4ed8" }}>{L("সিস্টেম", "System")}</span> : L("নিজের", "Custom")}</td>
      <td>{a.active ? L("চালু", "Active") : L("বন্ধ", "Off")}</td>
      {!mobile && <td>{used.has(lc(a.name)) ? L("হ্যাঁ", "Yes") : ""}</td>}
    </tr>
  );

  return (
    <div ref={rootRef} className="si-root" style={fitH ? { height: fitH } : undefined}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>
      <div className="pm-reference-title">
        <strong> {L("হিসাবের খাত (Chart of Accounts)", "Chart of Accounts")}</strong>
        <span>{chart.filter((a) => a.active).length} {L("টি চালু", "active")} / {chart.length}</span>
      </div>
      <div className="si-toolbar">
        {isOwner && <button type="button" className="pm-btn pm-btn--primary" onClick={() => { setGroupDraft(null); setDraft({ code: "", name: "", active: true, groupId: "" }); }} disabled={saving}>+ {L("নতুন খাত", "New account")}</button>}
        {isOwner && <button type="button" className="pm-btn-secondary" onClick={() => { setDraft(null); setGroupDraft({ code: "", nameEn: "", nameBn: "", nature: "other", parentId: "", active: true }); }} disabled={saving}>+ {L("নতুন গ্রুপ", "New group")}</button>}
        {canPrint && <button type="button" className="pm-btn-secondary" onClick={print}> {L("প্রিন্ট", "Print")}</button>}
        {canPrint && <button type="button" className="pm-btn-secondary" onClick={exportCsv}> Excel</button>}
        <span className="si-toolbar-gap" />
        <input className="pm-input" style={{ width: mobile ? "100%" : 220 }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={L("নাম বা কোড খুঁজুন", "Search name or code")} />
        <div className="si-pills">
          <button type="button" className={`pm-btn-secondary${!showAll ? " is-active" : ""}`} onClick={() => setShowAll(false)}>{L("চালু", "Active")}</button>
          <button type="button" className={`pm-btn-secondary${showAll ? " is-active" : ""}`} onClick={() => setShowAll(true)}>{L("সব", "All")}</button>
        </div>
      </div>
      <div className="si-body">
        {!saved && !isOwner && <div className="si-hint" style={{ margin: "2px 6px" }}>{L("মালিক এখনো তালিকা সেভ করেননি — সিস্টেম খাতগুলো দেখাচ্ছে।", "The owner has not saved the list yet — showing the system accounts.")}</div>}
        {isOwner && missing.length > 0 && saved && (
          <div className="si-paid-box" style={{ justifyContent: "space-between" }}>
            <span>{L(`ভাউচারে ব্যবহার হওয়া ${missing.length}টি খাত তালিকায় নেই: ${missing.slice(0, 5).map((a) => a.name).join(", ")}`, `${missing.length} account name(s) used in vouchers are not in the list: ${missing.slice(0, 5).map((a) => a.name).join(", ")}`)}</span>
            <button type="button" className="pm-btn-secondary" onClick={addMissing} disabled={saving}>{L("যোগ করুন", "Add them")}</button>
          </div>
        )}

        {draft && (
          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{current ? `${L("খাত এডিট", "Edit account")} — ${current.name}` : L("নতুন খাত", "New account")}</legend>
            <div className="si-panel-body" style={{ gap: 6 }}>
              <div className="si-grid2">
                <div className="si-field"><span className="pm-label">{L("কোড (ঐচ্ছিক)", "Code (optional)")}</span>
                  <input className="pm-input" value={draft.code || ""} onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))} placeholder="1010" />
                </div>
                <div className="si-field"><span className="pm-label">{L("খাতের নাম", "Account name")} *</span>
                  <input className="pm-input" list="coa-bank-names" value={draft.name || ""} disabled={lockedName} autoFocus={!current && !mobile}
                    onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder={L("যেমন: Furniture, Loan - Rahman, Bank - ADCB", "e.g. Furniture, Loan - Rahman, Bank - ADCB")} />
                  <datalist id="coa-bank-names">{banks.map((b) => <option key={b} value={`Bank - ${b}`} />)}</datalist>
                </div>
              </div>
              <div className="si-hint" style={{ marginLeft: 0 }}>
                {L("গ্রুপ", "Group")}: <b>{groupLabel(draftGroup, bn)}</b>{" — "}
                {L("লেজার নাম দেখে গ্রুপ ঠিক করে: \"Bank\" দিয়ে শুরু হলে ক্যাশ ও ব্যাংক, সিস্টেম খাত নিজের গ্রুপে, বাকি সব অন্যান্য (ব্যালেন্স শিটে অন্যান্য সম্পদ / দেনা)।", "The ledger sets the group from the name: names starting with \"Bank\" are cash & bank, system accounts keep their own group, everything else is other (other assets / liabilities on the Balance Sheet).")}
                {lockedName && <div>{current?.system ? errText("systemRename") : errText("usedRename")}</div>}
              </div>
              <div className="si-field"><span className="pm-label">{L("সাব-গ্রুপ (ঐচ্ছিক)", "Sub-group (optional)")}</span>
                <select className="pm-input" value={draft.groupId || ""} onChange={(e) => setDraft((d) => ({ ...d, groupId: e.target.value }))}>
                  <option value="">{L("নেই", "None")} ({groupLabel(draftGroup, bn)})</option>
                  {draftGroupChoices.map((g) => <option key={g.id} value={g.id}>{[g.code, groupPath(coaGroups, g.id, bn)].filter(Boolean).join(" · ")}</option>)}
                </select>
                {!draftGroupChoices.length && <span className="si-hint" style={{ marginLeft: 0 }}>{L(`"${groupLabel(draftGroup, bn)}" ভাগে এখনো কোনো গ্রুপ নেই`, `No group of kind "${groupLabel(draftGroup, bn)}" yet`)}</span>}
              </div>
              <label className="pm-check">
                <input type="checkbox" checked={draft.active !== false} disabled={!!current?.system && current.active && ESSENTIAL.has(current.name)}
                  onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))} /> {L("চালু (জার্নাল / কন্ট্রায় বাছা যাবে)", "Active (can be picked on journal / contra)")}
              </label>
              <div className="si-actions" style={{ background: "transparent", padding: 0 }}>
                {current && canDelete(current, used) && <button type="button" className="pm-btn-secondary pm-btn--danger" onClick={removeDraft} disabled={saving}>{L("মুছুন", "Delete")}</button>}
                {current && !current.system && !canDelete(current, used) && <span className="si-hint" style={{ marginLeft: 0 }}>{L("ব্যবহার হয়েছে বলে মোছা যাবে না — বন্ধ করে রাখুন", "Used, so it can't be deleted — switch it off instead")}</span>}
                <span className="si-toolbar-gap" />
                <button type="button" className="pm-btn-secondary" onClick={() => setDraft(null)} disabled={saving}>{L("বন্ধ", "Close")}</button>
                <button type="button" className="pm-btn pm-btn--primary" onClick={saveDraft} disabled={saving}>{saving ? L("সেভ হচ্ছে…", "Saving…") : L("সেভ", "Save")}</button>
              </div>
            </div>
          </fieldset>
        )}

        {groupDraft && isOwner && (
          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{currentGroup ? `${L("গ্রুপ এডিট", "Edit group")} — ${groupName(currentGroup, bn)}` : L("নতুন গ্রুপ", "New group")}</legend>
            <div className="si-panel-body" style={{ gap: 6 }}>
              <div className="si-grid2">
                <div className="si-field"><span className="pm-label">{L("নাম (English)", "Name (English)")} *</span>
                  <input className="pm-input" value={groupDraft.nameEn || ""} autoFocus={!mobile} onChange={(e) => setGroupDraft((d) => ({ ...d, nameEn: e.target.value }))} placeholder="Fixed Assets" />
                </div>
                <div className="si-field"><span className="pm-label">{L("নাম (বাংলা)", "Name (Bangla)")}</span>
                  <input className="pm-input" value={groupDraft.nameBn || ""} onChange={(e) => setGroupDraft((d) => ({ ...d, nameBn: e.target.value }))} placeholder="স্থায়ী সম্পদ" />
                </div>
                <div className="si-field"><span className="pm-label">{L("কোড (ঐচ্ছিক)", "Code (optional)")}</span>
                  <input className="pm-input" value={groupDraft.code || ""} onChange={(e) => setGroupDraft((d) => ({ ...d, code: e.target.value }))} placeholder="1500" />
                </div>
                <div className="si-field"><span className="pm-label">{L("লেজারের ভাগ", "Ledger side")} *</span>
                  <select className="pm-input" value={groupDraft.nature} onChange={(e) => setGroupDraft((d) => ({ ...d, nature: e.target.value, parentId: "" }))}>
                    {GROUP_NATURES.map((n) => <option key={n} value={n}>{groupLabel(n, bn)}</option>)}
                  </select>
                </div>
                <div className="si-field"><span className="pm-label">{L("উপরের গ্রুপ", "Parent group")}</span>
                  <select className="pm-input" value={groupDraft.parentId || ""} onChange={(e) => setGroupDraft((d) => ({ ...d, parentId: e.target.value }))}>
                    <option value="">{L("নেই (প্রথম স্তর)", "None (top level)")}</option>
                    {parentChoices.map(({ group, depth }) => <option key={group.id} value={group.id}>{`${"- ".repeat(depth)}${groupName(group, bn)}`}</option>)}
                  </select>
                </div>
              </div>
              <div className="si-hint" style={{ marginLeft: 0 }}>
                {L("লেজারের ভাগ ঠিক করে কোন খাত এই গ্রুপে যেতে পারবে - ব্যালেন্স শিট, ফান্ড আর এজিং সেই ভাগ ধরেই চলে, গ্রুপ শুধু সাজানো আর লেবেল।", "The ledger side decides which accounts can go into this group - the Balance Sheet, Funds and ageing follow that side; the group only arranges and labels.")}
              </div>
              <label className="pm-check">
                <input type="checkbox" checked={groupDraft.active !== false} onChange={(e) => setGroupDraft((d) => ({ ...d, active: e.target.checked }))} /> {L("চালু (খাতে বাছা যাবে)", "Active (can be picked for accounts)")}
              </label>
              <div className="si-actions" style={{ background: "transparent", padding: 0 }}>
                {currentGroup && canDeleteGroup(currentGroup, coaGroups, chart) && <button type="button" className="pm-btn-secondary pm-btn--danger" onClick={removeGroup} disabled={saving}>{L("মুছুন", "Delete")}</button>}
                {currentGroup && !canDeleteGroup(currentGroup, coaGroups, chart) && <span className="si-hint" style={{ marginLeft: 0 }}>{L("ভেতরে খাত বা সাব-গ্রুপ আছে বলে মোছা যাবে না", "It has accounts or sub-groups, so it can't be deleted")}</span>}
                <span className="si-toolbar-gap" />
                <button type="button" className="pm-btn-secondary" onClick={() => setGroupDraft(null)} disabled={saving}>{L("বন্ধ", "Close")}</button>
                <button type="button" className="pm-btn pm-btn--primary" onClick={saveGroup} disabled={saving}>{saving ? L("সেভ হচ্ছে…", "Saving…") : L("সেভ", "Save")}</button>
              </div>
            </div>
          </fieldset>
        )}

        <div className="si-box" style={{ overflow: "auto" }}>
          {!groups.length ? <div className="si-empty">{L("কিছু পাওয়া যায়নি", "Nothing found")}</div> : (
            <table className="pm-table">
              <thead><tr>
                <th style={{ width: 80 }}>{L("কোড", "Code")}</th><th>{L("খাতের নাম", "Account")}</th>{!mobile && <th style={{ width: 150 }}>{L("গ্রুপ", "Group")}</th>}
                <th style={{ width: 80 }}>{L("ধরন", "Kind")}</th><th style={{ width: 70 }}>{L("অবস্থা", "Status")}</th>{!mobile && <th style={{ width: 90 }}>{L("ভাউচারে", "In vouchers")}</th>}
              </tr></thead>
              <tbody>
                {groups.map((g) => (
                  <React.Fragment key={g.id}>
                    <tr><td colSpan={6} style={{ background: "#e8eef7", fontWeight: 800 }}>{bn ? g.bn : g.en} ({g.rows.length})</td></tr>
                    {g.loose.map((a) => accountRow(a, 0))}
                    {g.tree.map(({ group, depth, rows: inGroup }) => (
                      <React.Fragment key={group.id}>
                        <tr className={isOwner ? "pm-clickable" : undefined} onClick={isOwner ? () => { setDraft(null); setGroupDraft({ ...group }); } : undefined}>
                          <td style={{ color: "#475569" }}>{group.code}</td>
                          <td colSpan={5} style={{ paddingLeft: 8 + depth * 16, fontWeight: 700, background: "#f4f7fc", color: group.active ? "#1e3a8a" : "#94a3b8" }}>
                            {groupName(group, bn)} ({inGroup.length}){group.active ? "" : ` - ${L("বন্ধ", "off")}`}
                          </td>
                        </tr>
                        {inGroup.map((a) => accountRow(a, depth + 1))}
                      </React.Fragment>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="si-note">
          {L(
            "গ্রুপ ও সাব-গ্রুপ দোকানের নিজের (সর্বোচ্চ ৩ স্তর), লেজারের প্রতিটি ভাগের ভেতরে; খাত শুধু নিজের ভাগের গ্রুপে যায়, তাই রিপোর্টের শ্রেণিবিভাগ একই থাকে। এটা খাতের তালিকা আর লেবেল — লেজার এখনো বিল ও ভাউচার থেকে নাম ধরে পোস্ট করে, তাই ব্যালেন্স শিট / ফান্ড / এজিংয়ের হিসাব বদলায় না। সিস্টেম খাত (ক্যাশ, ব্যাংক, বিক্রি, ক্রয়, VAT, মূলধন, খরচের ক্যাটাগরি…) মোছা বা নাম বদলানো যায় না। নিজের খাতের নাম বদলানো যায় যতক্ষণ কোনো ভাউচারে ব্যবহার হয়নি; বন্ধ খাত নতুন জার্নালে বাছা যায় না, পুরনো হিসাব লেজারে আগের মতোই থাকে। খরচের ক্যাটাগরি খরচ পেজে ব্যবহার হলে লেজারে খরচ খাত। তালিকা শুধু মালিক বদলাতে পারেন।",
            "Groups and sub-groups are the shop's own (up to 3 levels) inside each ledger side; an account only goes into a group of its own side, so the reports keep the same classification. This is the account list and its labels — the ledger still posts from bills and vouchers by name, so the Balance Sheet, Funds and ageing figures do not change. System accounts (cash, bank, sales, purchase, VAT, capital, expense categories…) can't be deleted or renamed. A custom account can be renamed until a voucher uses it; a switched-off account can't be picked on new journals, and its old entries stay in the ledger as they were. Expense categories are expense accounts in the ledger once used on the Expenses page. Only the owner can change the list."
          )}
        </div>
      </div>
      <div className="si-statusbar">
        <span>{L("সিস্টেম", "System")} <b>{chart.filter((a) => a.system).length}</b></span>
        <span>{L("নিজের", "Custom")} <b>{chart.filter((a) => !a.system).length}</b></span>
        <span>{L("বন্ধ", "Off")} <b>{chart.filter((a) => !a.active).length}</b></span>
      </div>
    </div>
  );
}
