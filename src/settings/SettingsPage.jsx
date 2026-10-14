import { branchTransferSettingsCopy, BranchTransferSettingsPanel } from "../branch-transfer/BranchTransferNative.jsx";
import { APP_VERSION } from "../update/githubUpdateService";
import { Fragment } from "react";
import { ProfilePasswordSettings, LicenseActivationPanel, HelpSettingsPanel, SyncSettingsPanel } from "./SettingsPanels.jsx";
import ShopInfoSettings from "./ShopInfoSettings.jsx";
import { AppUpdatePanel } from "../update/AppUpdatePanel.jsx";
import { InviteCodeRow, PermToggle } from "../team/TeamControls.jsx";
import { DEFAULT_PERMISSIONS } from "../shared/appShared.jsx";
import { memberGroupState } from "../team/permissionMatrix.js";
import PermissionMatrix from "../team/PermissionMatrix.jsx";
import UserDefaultsEditor from "../team/UserDefaultsEditor.jsx";
import { SI_PAY } from "../sales-invoice/salesInvoiceShared.js";
import PeriodLockPanel from "../accounts/PeriodLockPanel.jsx";
import { saveShopRecord } from "../offline/shopService";
import UserGroupsPanel from "../team/UserGroupsPanel.jsx";
import BackupPanel from "../backup/BackupPanel.jsx";
import { getCloudSyncBlockReason } from "../offline/cloudPullService";

export function SettingsPage({ WA_STYLES, applyGroupToMember, branchTransferSettings, closeTeamMember, cloudPullBusy, cloudUploadBusy, createStaffMember, deleteInviteCode, generateNewCode, handleLogout, inviteCodes, isDesktop, isOwner, lang, lastCloudPullAt, localShop, mergeShopRecord, orderModuleEnabled, orderSettingsSaving, periodLock, products, profile, refreshSyncDashboard, resetStaffPassword, runCloudDownload, runCloudUpload, s, saveMemberDefaults, saveMemberPosition, saveOrderModuleEnabled, savePermissions, saveUserGroups, setBranchTransferSettings, setLang, setLocalShop, setPinModal, setPrintSettingsOpen, setSettingsPage, setStaffForm, setStaffPwReset, setTheme, setWaStyle, settingsPage, shopId, stPage, staffForm, staffPwReset, staffSaving, syncDashboard, syncState, t, team, teamEmployees, th, theme, toast, user, userGroups, waStyle }) {
        const bnS = lang==="bn";
        const plain = (v)=>String(v||"").replace(/^[^\p{L}\p{N}]+/u,"");
        const btCopy = isOwner ? branchTransferSettingsCopy(lang, branchTransferSettings.enabled) : null;
        const items = [
          { id:"profile", icon:"👤", label:plain(t.profileTitle), sub:profile.personName },
          isOwner && { id:"period", icon:"📅", label:bnS?"হিসাব বছর বন্ধ / লক":"Accounting period lock", sub:periodLock.lockDate?(bnS?`${periodLock.lockDate} পর্যন্ত বন্ধ`:`Closed up to ${periodLock.lockDate}`):(bnS?"লক নেই — পুরোনো এন্ট্রি বন্ধ করুন":"Not locked — close old entries") },
          isOwner && { id:"pin", icon:"🔒", label:bnS?"মালিকের পিন":"Owner PIN", sub:bnS?"ড্যাশবোর্ডের টাকা, Accounts ও চেক ফোল্ডার — পিন সেট / পরিবর্তন":"Dashboard money, Accounts & cheque folders — set / change PIN", action:()=>setPinModal("reset") },
          localShop && { id:"shop", icon:"🏢", label:plain(t.shopInfoTitle), sub:`${localShop.companyName||""}${!isOwner?(bnS?" · শুধু দেখা":" · View only"):""}` },
          isOwner && { id:"invite", icon:"🔗", label:plain(t.inviteCodeTitle), sub:`${inviteCodes.filter(c=>!c.used).length} ${bnS?"টি active":"active"}` },
          (isOwner || team.length>0) && { id:"team", icon:"👥", label:plain(t.teamTitle), sub:`${team.length} ${bnS?"জন সদস্য":"members"}` },
          isOwner && { id:"groups", icon:"🛡️", label:bnS?"ইউজার গ্রুপ ও অনুমতি":"User groups & privileges", sub:`${userGroups.length} ${bnS?"টি গ্রুপ · দেখা / যোগ / এডিট / বাতিল / প্রিন্ট":"groups · view / add / edit / delete / print"}` },
          isOwner && { id:"orderModule", icon:"🧾", label:"Order Option", sub:orderModuleEnabled?(bnS?"চালু আছে":"Enabled"):(bnS?"বন্ধ আছে":"Disabled") },
          isOwner && { id:"branchTransfer", icon:"🚚", label:btCopy.title, sub:btCopy.subtitle },
          isOwner && { id:"wastyle", icon:"💬", label:"WhatsApp Message Style", sub:WA_STYLES.find(w=>w.id===waStyle)?.[bnS?"labelBn":"labelEn"]||"" },
          { id:"theme", icon:theme==="dark"?"🌙":"☀️", label:bnS?"থিম / রঙ":"Theme", sub:theme==="dark"?(bnS?"ডার্ক মোড":"Dark Mode"):(bnS?"লাইট মোড":"Light Mode") },
          { id:"language", icon:"🌐", label:bnS?"ভাষা":"Language", sub:bnS?"বাংলা":"English" },
          { id:"print", icon:"🖨️", label:bnS?"প্রিন্ট সেটিংস":"Print Settings", sub:bnS?"বিলের ধরন, কাগজের মাপ, কপি, প্রিভিউ":"Bill type, paper size, copies, preview", action:()=>setPrintSettingsOpen(true) },
          { id:"sync", icon:syncState==="connected"?"🟢":syncState==="offline"?"🔴":syncState==="reconnecting"?"🟠":"🟡", label:plain(t.syncStatus), sub:syncState==="connected"?"Online":syncState==="offline"?"Offline":syncState==="reconnecting"?"Reconnecting...":"Connecting..." },
          isOwner && { id:"backup", icon:"💾", label:bnS?"ব্যাকআপ ও রিস্টোর":"Backup & restore", sub:bnS?"Google Drive / কম্পিউটারে দোকানের ডেটার কপি":"Copy of shop data to Google Drive / computer" },
          { id:"license", icon:"🔐", label:bnS?"লাইসেন্স স্ট্যাটাস":"License status", sub:bnS?"ঐচ্ছিক লাইসেন্স অ্যাক্টিভেশন":"Optional license activation" },
          { id:"update", icon:"🔄", label:plain(t.updateTitle), sub:`v${APP_VERSION} · ${t.updateSub}` },
          { id:"help", icon:"❓", label:plain(t.helpTitle), sub:t.helpMenuSub },
        ].filter(Boolean);
        const openItem = (it)=>{ if (it.action) it.action(); else setSettingsPage(it.id); };
        const current = items.find(it=>it.id===stPage);
        const settingGroups = [
          { key:"company", label:bnS?"🏢 অ্যাকাউন্ট ও দোকান":"🏢 Account & Company", ids:["profile","shop","pin","period","license"] },
          { key:"team", label:bnS?"👥 টিম":"👥 Team", ids:["team","groups","invite"] },
          { key:"features", label:bnS?"🧩 ফিচার":"🧩 Features", ids:["orderModule","branchTransfer","wastyle"] },
          { key:"display", label:bnS?"🎨 দেখা ও প্রিন্ট":"🎨 Display & Print", ids:["print","theme","language"] },
          { key:"data", label:bnS?"💾 ডেটা ও সিস্টেম":"💾 Data & System", ids:["backup","sync","update"] },
          { key:"help", label:bnS?"❓ সাহায্য":"❓ Help", ids:["help"] },
        ].map(g=>({ ...g, items:g.ids.map(id=>items.find(it=>it.id===id)).filter(Boolean) }))
          .concat([{ key:"other", label:"", items:items.filter(it=>!["profile","shop","pin","period","license","team","groups","invite","positions","orderModule","branchTransfer","wastyle","print","theme","language","backup","sync","update","help"].includes(it.id)) }])
          .filter(g=>g.items.length);
        const groupHead = (label, first) => label && (
          <div style={{ fontSize:11, fontWeight:900, letterSpacing:0.4, textTransform:"uppercase", color:th.txtMuted, padding:isDesktop?"10px 10px 4px":"4px 4px 6px", marginTop:first?0:(isDesktop?4:14), borderTop:!first&&isDesktop?`1px solid ${th.border}`:"none" }}>{label}</div>
        );
        return (
        <div style={isDesktop?{ ...s.desktopPanel, maxWidth:1240 }:s.panel}>
          {isDesktop&&<style dangerouslySetInnerHTML={{ __html:`
.st-pc{display:grid;grid-template-columns:290px minmax(0,1fr);gap:18px;align-items:start;}
.st-side{position:sticky;top:12px;background:${th.bgCard};border:1px solid ${th.border};border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(15,23,42,.06);}
.st-side-head{padding:12px 16px;font-weight:800;font-size:15px;color:#fff;background:linear-gradient(180deg,#3d6fcb,#24519f);}
.st-list{max-height:calc(100vh - 210px);overflow:auto;padding:6px;}
.st-item{display:flex;align-items:center;gap:10px;width:100%;padding:9px 10px;border:none;border-left:3px solid transparent;border-radius:8px;background:transparent;cursor:pointer;text-align:left;font-family:inherit;color:${th.txtPrimary};}
.st-item:hover{background:${theme==="dark"?"rgba(96,165,250,.12)":"#f1f5fb"};}
.st-item.is-active{background:${theme==="dark"?"rgba(96,165,250,.2)":"#e3edfc"};border-left-color:${th.accent};}
.st-item .st-ic{width:32px;height:32px;flex-shrink:0;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:17px;background:${theme==="dark"?"rgba(255,255,255,.06)":"#eef3fb"};}
.st-item b{display:block;font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.st-item small{display:block;font-size:11px;color:${th.txtMuted};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.st-item .st-tx{min-width:0;flex:1;}
.st-out{display:block;width:calc(100% - 12px);margin:6px;padding:9px;border-radius:8px;border:1px solid #fecaca;background:${theme==="dark"?"#450a0a":"#fef2f2"};color:#dc2626;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit;}
.st-main{background:${th.bgCard};border:1px solid ${th.border};border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(15,23,42,.06);min-height:420px;}
.st-main-head{display:flex;align-items:center;gap:12px;padding:12px 18px;color:#fff;background:linear-gradient(180deg,#3d6fcb,#24519f);}
.st-main-head .st-ic{font-size:22px;}
.st-main-head .st-title{font-size:16px;font-weight:800;}
.st-main-head .st-sub{font-size:12px;opacity:.85;}
.st-main-body{padding:18px 22px 24px;max-width:860px;}
.st-main-body input:not([type=checkbox]):not([type=radio]),.st-main-body select{min-height:38px;}
` }} />}
          <div className={isDesktop?"st-pc":undefined}>
            {isDesktop ? (
              <aside className="st-side">
                <div className="st-side-head">⚙️ {plain(t.settingsTitle)}</div>
                <div className="st-list">
                  {settingGroups.map((g,gi)=>(
                    <Fragment key={g.key}>
                      {groupHead(g.label, gi===0)}
                      {g.items.map(it=>(
                        <button key={it.id} type="button" className={`st-item${stPage===it.id?" is-active":""}`} onClick={()=>openItem(it)} title={it.sub}>
                          <span className="st-ic">{it.icon}</span>
                          <span className="st-tx"><b>{it.label}</b><small>{it.sub}</small></span>
                        </button>
                      ))}
                    </Fragment>
                  ))}
                </div>
                <button type="button" className="st-out" onClick={handleLogout}>🚪 {t.logout}</button>
              </aside>
            ) : !settingsPage&&(
              <>
                <div style={s.secTitle}>{t.settingsTitle}</div>
                {settingGroups.map((g,gi)=>(
                  <Fragment key={g.key}>
                    {groupHead(g.label, gi===0)}
                    {g.items.map(it=>(
                      <button key={it.id} style={s.settingsRow} onClick={()=>openItem(it)}>
                        <span style={s.settingsRowIcon}>{it.icon}</span>
                        <div style={{ flex:1 }}>
                          <div style={s.settingsRowLabel}>{it.label}</div>
                          <div style={s.settingsRowSub}>{it.sub}</div>
                        </div>
                        {it.id!=="sync"&&<span style={s.settingsArrow}>›</span>}
                      </button>
                    ))}
                  </Fragment>
                ))}
                <button style={{ ...s.logoutBtn, marginTop:16 }} onClick={handleLogout}>🚪 {t.logout}</button>
              </>
            )}
            <section className={isDesktop?"st-main":undefined}>
              {isDesktop ? (
                <div className="st-main-head">
                  <span className="st-ic">{current?.icon}</span>
                  <div><div className="st-title">{current?.label}</div><div className="st-sub">{current?.sub}</div></div>
                </div>
              ) : settingsPage&&(
                <button style={s.backRowBtn} onClick={()=>setSettingsPage(null)}>
                  ← {bnS?"সেটিংস":"Settings"}
                </button>
              )}
              <div className={isDesktop?"st-main-body":undefined}>

          {stPage==="profile"&&(
            <>
              <div style={s.card}>
                <div style={s.settingsLbl}>{t.profileTitle}</div>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <div style={{ ...s.coIcon, fontSize:24 }}>{isOwner?"🏢":"👨‍💼"}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:15, fontWeight:700, color:th.txtPrimary }}>{profile.personName}</div>
                    <div style={{ fontSize:12, color:"#71717a", marginTop:2 }}>{profile.email} · {isOwner?t.ownerLabel:(profile.position||t.salesmanLabel)}</div>
                    <div style={{ fontSize:12, color:"#71717a" }}>📱 {profile.mobile} · {profile.area}, {profile.countryName}</div>
                  </div>
                </div>
              </div>
              <ProfilePasswordSettings t={t} lang={lang} profile={profile} toast={toast} th={th} s={s} />
            </>
          )}

          {stPage==="shop"&&localShop&&(
            <ShopInfoSettings
              localShop={localShop} shopId={shopId}
              profile={profile} user={user}
              onShopUpdated={setLocalShop}
              th={th} s={s} lang={lang} toast={toast}
              readOnly={!isOwner}
            />
          )}

          {stPage==="license"&&(
            <LicenseActivationPanel
              lang={lang}
              th={th}
              s={s}
              toast={toast}
            />
          )}

          {stPage==="update"&&(
            <AppUpdatePanel lang={lang} th={th} s={s} toast={toast} />
          )}

          {stPage==="help"&&(
            <HelpSettingsPanel t={t} lang={lang} th={th} s={s} />
          )}

          {stPage==="invite"&&isOwner&&(
            <div style={{ ...s.card, border:"1px solid #f97316" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
                <div style={s.settingsLbl}>{t.inviteCodeTitle}</div>
                <button style={s.addCoBtn} onClick={generateNewCode}>{lang==="bn"?"+ নতুন Code":"+ New Code"}</button>
              </div>
              <div style={{ fontSize:11, color:"#a1a1aa", marginBottom:12 }}>{t.inviteCodeDesc}</div>
              {inviteCodes.filter(c=>!c.used).length===0&&(
                <div style={{ fontSize:12, color:"#71717a", textAlign:"center", padding:"10px 0" }}>
                  {lang==="bn"?"কোনো active code নেই। নতুন তৈরি করুন।":"No active codes. Generate one above."}
                </div>
              )}
              {inviteCodes.filter(c=>!c.used).map(c=>(
                <InviteCodeRow key={c.code} c={c} lang={lang} t={t} onDelete={deleteInviteCode} th={th} />
              ))}
              {inviteCodes.filter(c=>c.used).length>0&&(
                <div style={{ marginTop:12, paddingTop:10, borderTop:`1px solid ${th.border}` }}>
                  <div style={{ fontSize:10, color:"#71717a", textTransform:"uppercase", letterSpacing:0, fontWeight:700, marginBottom:8 }}>
                    {lang==="bn"?"ব্যবহৃত Codes":"Used Codes"} ({inviteCodes.filter(c=>c.used).length})
                  </div>
                  {inviteCodes.filter(c=>c.used).map(c=>(
                    <div key={c.code} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 0", borderTop:`1px solid ${th.border}` }}>
                      <span style={{ fontSize:13, fontWeight:700, color:th.txtMuted, fontFamily:"monospace", flex:1, letterSpacing:1 }}>{c.code}</span>
                      <span style={{ fontSize:11, color:th.txtMuted }}>✅ {c.usedByName||"—"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {stPage==="team"&&(isOwner || team.length>0)&&(
            <>
              {isOwner&&(
                <div style={{ ...s.card, marginBottom:12, border:"1px solid #3b82f6" }}>
                  <div style={s.settingsLbl}>{t.addStaffTitle}</div>
                  <input style={{ ...s.inp, marginBottom:8 }} placeholder={t.personName} value={staffForm.personName} onChange={e=>setStaffForm(p=>({...p,personName:e.target.value}))} />
                  <input style={{ ...s.inp, marginBottom:8 }} placeholder={t.usernameLbl} value={staffForm.username} onChange={e=>setStaffForm(p=>({...p,username:e.target.value}))} autoComplete="off" autoCapitalize="none" />
                  <input style={{ ...s.inp, marginBottom:8 }} type="password" placeholder={t.passwordLbl} value={staffForm.password} onChange={e=>setStaffForm(p=>({...p,password:e.target.value}))} autoComplete="new-password" />
                  <input style={{ ...s.inp, marginBottom:8 }} type="tel" placeholder={t.mobileLbl} value={staffForm.mobile} onChange={e=>setStaffForm(p=>({...p,mobile:e.target.value}))} />
                  <select style={{ ...s.sel, marginBottom:10 }} value={staffForm.position} onChange={e=>setStaffForm(p=>({...p,position:e.target.value}))}>
                    <option value="Salesman">{t.defaultPosition}</option>
                    {(localShop?.positions||[]).map(p=><option key={p} value={p}>{p}</option>)}
                  </select>
                  {userGroups.length>0&&(
                    <select style={{ ...s.sel, marginBottom:10 }} value={staffForm.groupId||""} onChange={e=>setStaffForm(p=>({...p,groupId:e.target.value}))}>
                      <option value="">{lang==="bn"?"🛡️ ইউজার গ্রুপ — নেই (সাধারণ অনুমতি)":"🛡️ User group — none (default permissions)"}</option>
                      {userGroups.map(g=><option key={g.id} value={g.id}>🛡️ {g.name}</option>)}
                    </select>
                  )}
                  <button style={s.sendBtn} onClick={createStaffMember} disabled={staffSaving}>{staffSaving?"...":t.addStaffBtn}</button>
                </div>
              )}

              <div style={s.card}>
                <div style={s.settingsLbl}>{t.teamTitle} ({team.length})</div>
                {team.length===0&&(
                  <div style={{ fontSize:12, color:"#71717a", padding:"8px 0" }}>
                    {lang==="bn"?"এখনো কোনো কর্মী নেই। উপরে নতুন কর্মী যোগ করুন।":"No staff yet. Add a staff member above."}
                  </div>
                )}
                {team.map((m,idx)=>{
                  const memberId = m.uid || m.id;
                  return (
                <div key={memberId} style={{ padding:"10px 0", borderTop:idx>0?`1px solid ${th.border}`:"none" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:isOwner&&m.role!=="owner"&&memberId!==user.uid?10:0 }}>
                    <div style={{ width:34, height:34, borderRadius:"50%", background:th.border, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{m.role==="owner"?"🏢":"👨‍💼"}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:th.txtPrimary }}>{m.personName}{memberId===user.uid&&<span style={{ color:"#f97316", fontSize:11 }}> ({t.youLabel})</span>}</div>
                      <div style={{ fontSize:11, color:"#71717a" }}>
                        {m.role==="owner"?t.ownerLabel:(m.position||t.salesmanLabel)}
                        {m.username&&<span> · @{m.username}</span>}
                        {m.email&&<span> · ✉️ {m.email}</span>}
                        {m.mobile&&<span> · 📱 {m.mobile}</span>}
                        {m.area&&<span> · {m.area}</span>}
                      </div>
                    </div>
                  </div>
                  {isOwner&&m.role!=="owner"&&memberId!==user.uid&&(
                    <div style={{ background:th.bgInp, borderRadius:10, padding:"10px 12px" }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                        <span style={{ fontSize:12, color:"#71717a", fontWeight:700, textTransform:"uppercase", letterSpacing:0 }}>{t.positionLbl}</span>
                        <select style={{ ...s.sel, flex:"unset", width:"auto", fontSize:12, padding:"5px 8px" }}
                          value={m.position||"Salesman"}
                          onChange={e=>saveMemberPosition(m, e.target.value)}>
                          <option value="Salesman">{t.defaultPosition}</option>
                          {(localShop?.positions||[]).map(p=><option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>
                      <div style={{ height:1, background:th.bgCard, marginBottom:8 }} />
                      {(()=>{
                        const mPerms = { ...DEFAULT_PERMISSIONS, ...(m.permissions || {}) };
                        const gs = memberGroupState(m, userGroups);
                        return (
                          <>
                            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, marginBottom:8, flexWrap:"wrap" }}>
                              <span style={{ fontSize:12, color:"#71717a", fontWeight:700, textTransform:"uppercase" }}>🛡️ {lang==="bn"?"ইউজার গ্রুপ":"User group"}</span>
                              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                                {gs.custom&&<span style={{ fontSize:10, color:"#f59e0b", fontWeight:700 }}>{lang==="bn"?"কাস্টম বদল":"Customised"}</span>}
                                <select style={{ ...s.sel, flex:"unset", width:"auto", fontSize:12, padding:"5px 8px" }}
                                  value={gs.group?.id||""}
                                  onChange={e=>{ const g=userGroups.find(x=>x.id===e.target.value)||null; applyGroupToMember(m, g, { notify:true }); }}>
                                  <option value="">{lang==="bn"?"— গ্রুপ নেই (নিজস্ব) —":"— No group (custom) —"}</option>
                                  {userGroups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
                                </select>
                                {gs.custom&&<button type="button" style={{ ...s.addCoBtn, padding:"4px 8px", fontSize:11 }} onClick={()=>applyGroupToMember(m, gs.group, { notify:true })}>{lang==="bn"?"গ্রুপ অনুযায়ী করুন":"Reset to group"}</button>}
                              </div>
                            </div>
                            {userGroups.length===0&&(
                              <div style={{ fontSize:11, color:"#71717a", marginBottom:8 }}>
                                {lang==="bn"?"গ্রুপ বানাতে: সেটিংস → ইউজার গ্রুপ ও অনুমতি।":"Create groups in Settings → User groups & privileges."}
                                {" "}<button type="button" style={{ background:"none", border:"none", color:"#f97316", cursor:"pointer", fontSize:11, fontWeight:700, padding:0 }} onClick={()=>setSettingsPage("groups")}>{lang==="bn"?"খুলুন →":"Open →"}</button>
                              </div>
                            )}
                            <div style={{ fontSize:10, color:"#71717a", marginBottom:4, textTransform:"uppercase", letterSpacing:0, fontWeight:700 }}>{t.permissionsTitle}</div>
                            <PermissionMatrix lang={lang} th={th} perms={mPerms} compact
                              onToggle={(key,val)=>savePermissions(m,{ ...mPerms, [key]:val })} />
                            <div style={{ height:1, background:th.bgCard, margin:"10px 0 8px" }} />
                            <UserDefaultsEditor lang={lang} th={th} s={s} member={m} team={team} employees={teamEmployees} payOptions={SI_PAY}
                              onSave={(d)=>saveMemberDefaults(m, d)} />
                          </>
                        );
                      })()}
                      {m.localUserId&&(
                        <>
                          <div style={{ height:1, background:th.bgCard, margin:"10px 0 8px" }} />
                          <div style={{ fontSize:10, color:"#71717a", marginBottom:8, textTransform:"uppercase", letterSpacing:0, fontWeight:700 }}>{t.resetPwLbl}</div>
                          <div style={s.row}>
                            <input style={{ ...s.inp, flex:1 }} type="password" placeholder={t.resetPwLbl} value={staffPwReset[m.localUserId]||""}
                              onChange={e=>setStaffPwReset(prev=>({ ...prev, [m.localUserId]: e.target.value }))} autoComplete="new-password" />
                            <button style={s.savBtn} onClick={()=>resetStaffPassword(m)}>{t.resetPwBtn}</button>
                          </div>
                        </>
                      )}
                      <div style={{ height:1, background:th.bgCard, margin:"10px 0 8px" }} />
                      <button
                        style={{ ...s.addCoBtn, width:"100%", borderColor:"#450a0a", color:"#ef4444", marginTop:4 }}
                        onClick={()=>closeTeamMember(m)}
                      >{t.removeMemberBtn}</button>
                    </div>
                  )}
                </div>
                  );
                })}
              </div>
              {isOwner&&(()=>{
                const me = team.find(m=>(m.uid||m.id)===user.uid) || { uid:user.uid, id:user.uid, role:"owner", personName:profile.personName, defaults:profile.defaults||{} };
                return (
                  <div style={{ ...s.card, marginTop:12 }}>
                    <UserDefaultsEditor lang={lang} th={th} s={s} member={{ ...me, defaults: me.defaults || profile.defaults || {} }} team={team} employees={teamEmployees} payOptions={SI_PAY}
                      onSave={(d)=>saveMemberDefaults(me, d)} />
                    <div style={{ fontSize:11, color:"#71717a", marginTop:6 }}>{lang==="bn"?"↑ এটা আপনার (মালিকের) নিজের লগইনের ডিফল্ট।":"↑ These are your own (owner) login defaults."}</div>
                  </div>
                );
              })()}
            </>
          )}

          {stPage==="period"&&isOwner&&(
            <PeriodLockPanel lang={lang} th={th} s={s} shop={localShop} user={user} profile={profile} toast={toast}
              onSave={async (next)=>{
                const updated = await saveShopRecord(shopId, { periodLock: next }, { ownerUid: user?.uid, profile, user });
                setLocalShop(prev=>mergeShopRecord(prev, updated || { periodLock: next }));
              }} />
          )}

          {stPage==="groups"&&isOwner&&(
            <UserGroupsPanel lang={lang} th={th} s={s} groups={userGroups} team={team} defaults={DEFAULT_PERMISSIONS}
              onSaveGroups={saveUserGroups} onApplyGroup={(m,g)=>applyGroupToMember(m,g)} toast={toast} />
          )}

          {stPage==="branchTransfer"&&isOwner&&(
            <BranchTransferSettingsPanel
              lang={lang} th={th} s={s}
              shopId={shopId} user={user} profile={profile}
              team={team} settings={branchTransferSettings}
              onSettingsChanged={setBranchTransferSettings}
              toast={toast}
            />
          )}

          {stPage==="orderModule"&&isOwner&&(
            <div style={s.card}>
              <div style={s.settingsLbl}>{lang==="bn"?"📋 Order Option":"📋 Order Option"}</div>
              <div style={{ fontSize:12, color:th.txtMuted, lineHeight:1.6, marginBottom:14 }}>
                {lang==="bn"
                  ? "Single shop হলে এই option বন্ধ রাখতে পারেন। চালু করলে Orders/New Order দেখা যাবে (owner, salesman ও dashboard সবখানে)। বন্ধ থাকলে কারো কাছে দেখাবে না।"
                  : "For a single shop, you can keep this off. Enable it to show Orders/New Order for the owner, salesmen and dashboard. When off, it is hidden for everyone."}
              </div>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, padding:"14px 0", borderTop:`1px solid ${th.border}`, borderBottom:`1px solid ${th.border}` }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:800, color:th.txtPrimary }}>{lang==="bn"?"Order system":"Order system"}</div>
                  <div style={{ fontSize:12, color:th.txtMuted, marginTop:4 }}>
                    {orderModuleEnabled ? (lang==="bn"?"চালু আছে":"Enabled") : (lang==="bn"?"বন্ধ আছে (Default)":"Disabled (Default)")}
                  </div>
                </div>
                <PermToggle isOn={orderModuleEnabled} disabled={orderSettingsSaving} onToggle={()=>saveOrderModuleEnabled(!orderModuleEnabled)} />
              </div>
              {orderSettingsSaving&&(
                <div style={{ fontSize:12, color:"#f97316", marginTop:10 }}>{lang==="bn"?"সেভ হচ্ছে...":"Saving..."}</div>
              )}
            </div>
          )}

          {stPage==="wastyle"&&(
            <div style={s.card}>
              <div style={s.settingsLbl}>{lang==="bn"?"💬 WhatsApp Message Style":"💬 WhatsApp Message Style"}</div>
              <div style={{ fontSize:11, color:"#71717a", marginBottom:12 }}>
                {lang==="bn"?"কোম্পানিকে WhatsApp করার সময় কোন style-এ message যাবে বেছে নিন":"Choose how messages look when sending to companies"}
              </div>
              {WA_STYLES.map(st=>(
                <button key={st.id} onClick={()=>setWaStyle(st.id)}
                  style={{ width:"100%", textAlign:"left", background:waStyle===st.id?"rgba(249,115,22,0.08)":th.bgInp,
                    border:`1px solid ${waStyle===st.id?"#f97316":th.border}`, borderRadius:10,
                    padding:"10px 12px", marginBottom:8, cursor:"pointer", fontFamily:"inherit" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                    <span style={{ fontSize:12, fontWeight:700, color:waStyle===st.id?"#f97316":th.txtPrimary }}>
                      {waStyle===st.id?"✅ ":""}{lang==="bn"?st.labelBn:st.labelEn}
                    </span>
                  </div>
                  <pre style={{ fontSize:11, color:th.txtMuted, margin:0, fontFamily:"monospace", whiteSpace:"pre-wrap", lineHeight:1.6 }}>
                    {lang==="bn"?`*পণ্যের তালিকা:*\n${st.previewBn}\n\n_দয়া করে দাম ও স্টক জানান।_ 🙏 ধন্যবাদ`:`*Product List:*\n${st.previewEn}\n\n_Please share price and stock._ 🙏 Thanks`}
                  </pre>
                </button>
              ))}
            </div>
          )}

          {stPage==="language"&&(
            <div style={s.card}>
              <div style={s.settingsLbl}>{t.languageLbl}</div>
              <div style={s.langSw}>
                <button style={{ ...s.lBtn, padding:"10px 18px", flex:1, ...(lang==="bn"?s.lBtnA:{}) }} onClick={()=>setLang("bn")}>বাংলা</button>
                <button style={{ ...s.lBtn, padding:"10px 18px", flex:1, ...(lang==="en"?s.lBtnA:{}) }} onClick={()=>setLang("en")}>English</button>
              </div>
            </div>
          )}

          {stPage==="theme"&&(
            <div style={s.card}>
              <div style={s.settingsLbl}>{lang==="bn"?"🎨 থিম বেছে নিন":"🎨 Choose Theme"}</div>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                <button onClick={()=>setTheme("dark")}
                  style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 16px", borderRadius:12,
                    border:`2px solid ${theme==="dark"?"#f97316":th.border}`,
                    background:theme==="dark"?"rgba(249,115,22,0.08)":"transparent",
                    cursor:"pointer", fontFamily:"inherit", textAlign:"left", width:"100%" }}>
                  <span style={{ fontSize:28 }}>🌙</span>
                  <div>
                    <div style={{ fontSize:14, fontWeight:700, color:th.txtPrimary }}>{lang==="bn"?"ডার্ক মোড":"Dark Mode"}</div>
                    <div style={{ fontSize:12, color:th.txtMuted }}>{lang==="bn"?"চোখে আরামদায়ক অন্ধকার থিম":"Easy on the eyes dark theme"}</div>
                  </div>
                  {theme==="dark"&&<span style={{ marginLeft:"auto", color:"#f97316", fontSize:18 }}>✅</span>}
                </button>
                <button onClick={()=>setTheme("light")}
                  style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 16px", borderRadius:12,
                    border:`2px solid ${theme==="light"?"#f97316":th.border}`,
                    background:theme==="light"?"rgba(249,115,22,0.08)":"transparent",
                    cursor:"pointer", fontFamily:"inherit", textAlign:"left", width:"100%" }}>
                  <span style={{ fontSize:28 }}>☀️</span>
                  <div>
                    <div style={{ fontSize:14, fontWeight:700, color:th.txtPrimary }}>{lang==="bn"?"লাইট মোড":"Light Mode"}</div>
                    <div style={{ fontSize:12, color:th.txtMuted }}>{lang==="bn"?"উজ্জ্বল সাদা থিম":"Bright white theme"}</div>
                  </div>
                  {theme==="light"&&<span style={{ marginLeft:"auto", color:"#f97316", fontSize:18 }}>✅</span>}
                </button>
              </div>
            </div>
          )}

          {stPage==="backup"&&isOwner&&shopId&&(
            <BackupPanel lang={lang} th={th} s={s} toast={toast} shopId={shopId} userId={user?.uid} />
          )}

          {stPage==="sync"&&(
            <SyncSettingsPanel
              t={t}
              lang={lang}
              th={th}
              s={s}
              toast={toast}
              syncState={syncState}
              syncDashboard={syncDashboard}
              lastCloudPullAt={lastCloudPullAt}
              cloudUploadBusy={cloudUploadBusy}
              cloudPullBusy={cloudPullBusy}
              shopId={shopId}
              productCount={products.length}
              firebaseCloudReady={!getCloudSyncBlockReason()}
              onUpload={runCloudUpload}
              onDownload={() => runCloudDownload()}
              onRefresh={refreshSyncDashboard}
            />
          )}
              </div>
            </section>
          </div>
        </div>
        );
}
