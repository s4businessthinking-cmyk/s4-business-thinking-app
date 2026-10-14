import AppGlobalSearch from "../dashboard/AppGlobalSearch.jsx";
import { ERP_MOBILE_CSS, TAB_SHORTCUT_KEYS, designPreviewHtml, saveSiColor, saveSiShowCode } from "./mainAppHelpers.js";
import { Header } from "../components/AppHeader.jsx";
import { LicenseActivationPanel } from "../settings/SettingsPanels.jsx";
import { MinimizedChip, WindowButtons } from "../components/WindowChrome.jsx";
import MobileMenuDrawer from "../dashboard/MobileMenuDrawer.jsx";
import NotificationBell from "../dashboard/NotificationBell.jsx";
import PrintSettingsWindow from "../print/PrintSettingsWindow.jsx";
import { ShopSetupWizard } from "../auth/AuthScreens.jsx";
import SideMenuGroups from "../dashboard/SideMenuGroups.jsx";
import { shopNeedsSetup } from "../offline/shopService";

export function renderMainLayout({ canSeeProductCost, closeMenu, closeOrderSupplierPicker, closePriceEditor, currentTabLabel, customers, erpDark, erpSkin, findOrderSupplier, getOrderDisplayNo, globalSearchCan, globalSearchCanAny, goBack, handleGlobalSearchNavigate, handleLogout, isDesktop, isOwner, lang, licenseAccess, licenseAccessLoading, localShop, menuOpen, minTab, notificationItems, orderReceive, orderReceiveSaving, orders, pageMax, pmOverSales, priceEditorInputRef, priceEditorTarget, priceEditorValue, printSettingsOpen, products, profile, refreshLicenseAccess, s, saveOrderReceive, savePriceEditor, searchOrderSuppliers, selectFromMenu, selectOrderSupplierFromPicker, setLang, setLocalShop, setMinTab, setOrderReceive, setPageMax, setPriceEditorValue, setPrintSettingsOpen, setSiColorPrint, setSiShowCode, setSupplierPickerQuery, setTab, setTheme, shopId, siColorPrint, siShowCode, supplierPickerInputRef, supplierPickerQuery, supplierPickerTarget, syncState, t, tab, tabContent, tabLabelOf, th, theme, toast, unread, user, vendors, visibleTabs }) {
  if (licenseAccessLoading && !licenseAccess) {
    return (
      <div style={s.root}>
        <Header t={t} lang={lang} setLang={setLang} isDesktop={isDesktop} s={s} theme={theme} setTheme={setTheme} />
        <div style={isDesktop?s.desktopPanel:s.panel}>
          <div style={s.empty}>⏳</div>
        </div>
      </div>
    );
  }

  if (licenseAccess?.accessAllowed === false) {
    return (
      <div style={s.root}>
        <Header t={t} lang={lang} setLang={setLang} isDesktop={isDesktop} s={s} theme={theme} setTheme={setTheme} />
        <div style={isDesktop?s.desktopPanel:s.panel}>
          <div style={{ ...s.card, border:"1px solid #ef4444", background:th.bgCard }}>
            <div style={{ fontSize:34, marginBottom:8 }}>🔐</div>
            <div style={{ fontSize:22, fontWeight:900, color:"#ef4444", marginBottom:6 }}>
              {lang==="bn"?"ফ্রি ট্রায়াল শেষ":"Free trial expired"}
            </div>
            <div style={{ fontSize:13, color:th.txtMuted, lineHeight:1.5 }}>
              {lang==="bn"?"চালিয়ে যেতে লাইসেন্স অ্যাক্টিভ করুন":"Please activate your license to continue"}
            </div>
            {licenseAccess?.accessReason&&(
              <div style={{ fontSize:11, color:th.txtMuted, marginTop:8 }}>
                {licenseAccess.accessReason}
              </div>
            )}
          </div>

          <LicenseActivationPanel
            lang={lang}
            th={th}
            s={s}
            toast={toast}
            locked
            onActivated={refreshLicenseAccess}
          />

          <button style={s.logoutBtn} onClick={handleLogout}>
            🚪 {lang==="bn"?"লগআউট":"Logout"}
          </button>
        </div>
      </div>
    );
  }

  if (isOwner && shopId && shopNeedsSetup(localShop)) {
    return (
      <ShopSetupWizard
        t={t}
        lang={lang}
        setLang={setLang}
        localShop={localShop}
        shopId={shopId}
        profile={profile}
        user={user}
        toast={toast}
        s={s}
        theme={theme}
        setTheme={setTheme}
        onShopSaved={setLocalShop}
      />
    );
  }

  const supplierPickerResults = supplierPickerTarget ? searchOrderSuppliers(supplierPickerQuery) : [];
  const supplierPickerOrder = supplierPickerTarget
    ? orders.find(order => order.id === supplierPickerTarget.orderId)
    : null;
  const supplierPickerSelectedId = supplierPickerTarget
    ? supplierPickerOrder?.items?.[supplierPickerTarget.itemIndex]?.co
    : null;

  return (
    <div style={s.root}>
      <Header t={t} lang={lang} setLang={setLang} isDesktop={isDesktop} s={s} theme={theme} setTheme={setTheme}
        shopName={localShop?.companyName||""} personName={profile.personName||""}
        rightSlot={(
          <>
            {!isDesktop && globalSearchCanAny && (
              <button
                type="button"
                aria-label={lang === "bn" ? "সার্চ" : "Search"}
                onClick={() => window.dispatchEvent(new CustomEvent("s4-focus-global-search"))}
                style={{ border: "none", background: "transparent", fontSize: 20, lineHeight: 1, padding: "2px 6px", cursor: "pointer" }}
              >
                🔎
              </button>
            )}
            <NotificationBell lang={lang} theme={theme} items={notificationItems} />
          </>
        )}
        onBack={!isDesktop && tab!=="dashboard" ? goBack : null} />

      {isDesktop ? (
        <div style={s.desktopLayout}>
          {!(pageMax && tab!=="dashboard") && <div style={s.sidebar}>
            <SideMenuGroups items={visibleTabs} activeKey={tab} lang={lang}
              colors={{ head:th.txtPrimary, headBg:th.bgInp, line:th.borderMid }}
              renderItem={(k,label)=>(
                <button style={{ ...s.sideTab, padding:"8px 12px", ...(tab===k?s.sideTabA:{}) }} onClick={()=>setTab(k)}>
                  <span style={{ flex:1, textAlign:"left" }}>{label}</span>
                  {TAB_SHORTCUT_KEYS[k]&&<span style={{ ...s.sideKey, ...(tab===k?s.sideKeyA:{}) }}>{TAB_SHORTCUT_KEYS[k]}</span>}
                  {((isOwner&&k==="owner")||(!isOwner&&k==="shop"))&&unread>0&&<span style={s.sideBadge}>{unread}</span>}
                </button>
              )} />
            <div style={{ flex:1 }} />
            <div style={{ fontSize:11, color:syncState==="connected"?"#22c55e":syncState==="offline"?"#ef4444":"#f59e0b", textAlign:"center", marginBottom:10 }}>
              {syncState==="connected"?"🟢 Online":syncState==="offline"?"🔴 Offline":syncState==="reconnecting"?"🟠 Reconnecting...":"🟡 Connecting..."}
            </div>
            <button style={s.sideLogout} onClick={handleLogout}>🚪 {t.logout}</button>
          </div>}
          <div style={s.desktopContent}>
            {tab!=="dashboard"&&(
              <div onDoubleClick={()=>setPageMax(m=>!m)}
                style={{ position:"sticky", top:0, zIndex:8, display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, padding:"4px 6px 4px 12px", background:"linear-gradient(180deg,#3f69bd,#2854ad)", color:"#fff", fontSize:13, fontWeight:800, userSelect:"none", fontFamily:"Segoe UI, Tahoma, sans-serif" }}>
                <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{currentTabLabel}</span>
                <WindowButtons lang={lang}
                  win={{ max:pageMax, minimize:()=>{ setMinTab(tab); setTab("dashboard"); }, toggleMax:()=>setPageMax(m=>!m) }}
                  onClose={()=>setTab("dashboard")} />
              </div>
            )}
            {tabContent}
          </div>
        </div>
      ) : erpSkin ? (
        <div className={erpDark ? "erp-m erp-m-dark" : "erp-m"}>
          <style>{ERP_MOBILE_CSS}</style>
          {tab!=="products"&&!pmOverSales&&(
            <div className="erp-m-title">
              <strong>{String((visibleTabs.find(([k])=>k===tab)||[])[1]||tab).replace(/^[^\p{L}\p{N}]+/u,"")}</strong>
              <span>{new Date().toLocaleDateString(lang==="bn"?"bn-BD":"en-GB",{ day:"numeric", month:"short", year:"numeric" })}</span>
            </div>
          )}
          {globalSearchCanAny && (tab === "products" || pmOverSales) && (
            <AppGlobalSearch
              lang={lang}
              th={th}
              glassCard={{ background: th.bgCard, border: `1px solid ${th.border}` }}
              products={products}
              customers={customers}
              vendors={vendors}
              can={globalSearchCan}
              onNavigate={handleGlobalSearchNavigate}
              isMobile
              showBar={false}
              cur={t.cur || localShop?.currency || "AED"}
              canSeeCost={canSeeProductCost}
            />
          )}
          {globalSearchCanAny && tab !== "products" && !pmOverSales && (
            <AppGlobalSearch
              lang={lang}
              th={th}
              glassCard={{ background: th.bgCard, border: `1px solid ${th.border}` }}
              products={products}
              customers={customers}
              vendors={vendors}
              can={globalSearchCan}
              onNavigate={handleGlobalSearchNavigate}
              isMobile
              cur={t.cur || localShop?.currency || "AED"}
              canSeeCost={canSeeProductCost}
            />
          )}
          {tabContent}
        </div>
      ) : tabContent}

      {printSettingsOpen && (
        <PrintSettingsWindow lang={lang} isDesktop={isDesktop} toast={toast}
          onClose={()=>setPrintSettingsOpen(false)}
          showCode={siShowCode} setShowCode={(v)=>{ setSiShowCode(v); saveSiShowCode(v); }}
          colorPrint={siColorPrint} setColorPrint={(v)=>{ setSiColorPrint(v); saveSiColor(v); }}
          previewHtml={(kind, style)=>designPreviewHtml(kind, style, localShop, lang, siShowCode, siColorPrint)} />
      )}

      {isDesktop && minTab && tab !== minTab && (
        <MinimizedChip title={tabLabelOf(minTab)} lang={lang} slot={2}
          onRestore={()=>setTab(minTab)} onClose={()=>setMinTab(null)} />
      )}

      {!isDesktop && (
        <MobileMenuDrawer open={menuOpen} onClose={closeMenu}
          items={visibleTabs} activeKey={tab} onSelect={selectFromMenu}
          unreadKey={isOwner?"owner":"shop"} unread={unread}
          lang={lang} theme={theme}
          personName={profile.personName||""} roleLabel={isOwner?t.ownerLabel:(profile.position||t.salesmanLabel)}
          shopName={localShop?.companyName||""} syncState={syncState} onLogout={handleLogout} />
      )}

      {orderReceive&&(()=>{
        const rcOrder = orders.find(o=>o.id===orderReceive.orderId);
        if (!rcOrder) return null;
        const bn = lang==="bn";
        const setRc = (patch) => setOrderReceive(prev => prev ? { ...prev, ...patch } : prev);
        const setLine = (iIdx, patch) => setOrderReceive(prev => prev ? { ...prev, lines:prev.lines.map(l => l.iIdx===iIdx ? { ...l, ...patch } : l) } : prev);
        const total = orderReceive.lines.reduce((sum,l)=>sum + (l.checked ? (Number(l.qty)||0)*(Number(l.unitCost)||0) : 0), 0);
        const lbl = { fontSize:11, color:th.txtMuted, marginBottom:3, display:"block" };
        return (
          <div
            onClick={e=>e.stopPropagation()}
            style={{ position:"fixed", inset:0, zIndex:99998, background:"rgba(2,6,23,0.72)", display:"flex", alignItems:"flex-start", justifyContent:"center", padding:"56px 12px 18px" }}>
            <div style={{ width:"min(640px,100%)", maxHeight:"calc(100vh - 80px)", display:"flex", flexDirection:"column", border:`1px solid ${th.borderMid}`, borderRadius:16, background:th.bgCard, boxShadow:"0 18px 60px rgba(0,0,0,0.35)", overflow:"hidden" }}>
              <div style={{ padding:"12px 14px", borderBottom:`1px solid ${th.border}`, display:"flex", alignItems:"center", gap:8 }}>
                <div style={{ flex:1, fontWeight:800, fontSize:14, color:th.txtPrimary }}>
                  🚚 {bn?"Invoice দিয়ে ডেলিভারি":"Receive with Invoice"} · {getOrderDisplayNo(rcOrder)}
                </div>
                <button type="button" onClick={()=>!orderReceiveSaving&&setOrderReceive(null)}
                  style={{ width:28, height:28, borderRadius:14, border:`1px solid ${th.borderMid}`, background:th.bgInp, color:th.txtMuted, cursor:"pointer" }}>✕</button>
              </div>
              <div style={{ padding:14, overflowY:"auto", WebkitOverflowScrolling:"touch" }}>
                <div style={{ fontSize:12, color:th.txtMuted, marginBottom:10, lineHeight:1.5 }}>
                  {bn?"সাপ্লায়ারের বিল দেখে Qty ও দাম মিলিয়ে নিন। Save করলে এটা Purchase List-এ সাধারণ Purchase হিসেবে যাবে এবং স্টকে যোগ হবে।":"Match the qty and cost with the supplier's bill. Saving adds it to the Purchase List as a normal purchase and adds stock."}
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))", gap:8, marginBottom:12 }}>
                  <label>
                    <span style={lbl}>{bn?"Vendor *":"Vendor *"}</span>
                    <input style={s.inp} value={orderReceive.vendorName} readOnly={!!findOrderSupplier(orderReceive.supplierKey)}
                      onChange={e=>setRc({ vendorName:e.target.value })} />
                  </label>
                  <label>
                    <span style={lbl}>{bn?"সাপ্লায়ারের Invoice No *":"Supplier Invoice No *"}</span>
                    <input style={s.inp} value={orderReceive.supplierInvoiceNo} autoFocus
                      onChange={e=>setRc({ supplierInvoiceNo:e.target.value })} />
                  </label>
                  <label>
                    <span style={lbl}>{bn?"Invoice তারিখ":"Invoice Date"}</span>
                    <input type="date" style={s.inp} value={orderReceive.invoiceDate}
                      onChange={e=>setRc({ invoiceDate:e.target.value })} />
                  </label>
                  <label>
                    <span style={lbl}>{bn?"পেমেন্ট":"Payment"}</span>
                    <select style={s.inp} value={orderReceive.paymentMethod} onChange={e=>setRc({ paymentMethod:e.target.value })}>
                      <option value="credit">{bn?"বাকি (Credit)":"Credit"}</option>
                      <option value="cash">{bn?"নগদ (Cash)":"Cash"}</option>
                    </select>
                  </label>
                </div>
                {orderReceive.lines.map(l=>{
                  const it = rcOrder.items[l.iIdx]; if (!it) return null;
                  return (
                    <div key={l.iIdx} style={{ ...s.oiCard, opacity:l.checked?1:0.55 }}>
                      <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, fontWeight:700, color:th.txtPrimary, marginBottom:6, cursor:"pointer" }}>
                        <input type="checkbox" checked={l.checked} onChange={e=>setLine(l.iIdx,{ checked:e.target.checked })} />
                        <span style={{ flex:1 }}>
                          {it.name}
                          {it.code&&<span style={{ fontSize:11, color:"#71717a", marginLeft:6 }}>📋 {it.code}</span>}
                          {it.brand&&<span style={{ fontSize:11, color:"#71717a", marginLeft:6 }}>🏷️ {it.brand}</span>}
                        </span>
                      </label>
                      <div style={{ display:"flex", gap:8, alignItems:"flex-end" }}>
                        <label style={{ flex:1 }}>
                          <span style={lbl}>Qty ({it.unit||"Pcs"})</span>
                          <input style={s.inp} inputMode="decimal" value={l.qty} disabled={!l.checked}
                            onChange={e=>setLine(l.iIdx,{ qty:e.target.value })} />
                        </label>
                        <label style={{ flex:1 }}>
                          <span style={lbl}>{bn?"দাম (৳)":"Cost (৳)"}</span>
                          <input style={s.inp} inputMode="decimal" value={l.unitCost} disabled={!l.checked}
                            onChange={e=>setLine(l.iIdx,{ unitCost:e.target.value })} />
                        </label>
                        <div style={{ flex:1, fontSize:13, fontWeight:700, color:th.txtPrimary, textAlign:"right", paddingBottom:10 }}>
                          ৳ {((Number(l.qty)||0)*(Number(l.unitCost)||0)).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ padding:"10px 14px", borderTop:`1px solid ${th.border}`, display:"flex", alignItems:"center", gap:8 }}>
                <div style={{ flex:1, fontSize:14, fontWeight:800, color:th.txtPrimary }}>
                  {bn?"মোট":"Total"}: ৳ {total.toFixed(2)}
                </div>
                <button type="button" style={s.stBtn} disabled={orderReceiveSaving} onClick={()=>setOrderReceive(null)}>
                  {bn?"বাতিল":"Cancel"}
                </button>
                <button type="button" style={s.sendBtn} disabled={orderReceiveSaving} onClick={saveOrderReceive}>
                  {orderReceiveSaving ? "..." : (bn?"✅ Save ও ডেলিভারি":"✅ Save & Deliver")}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {supplierPickerTarget&&(
        <div
          onClick={e=>e.stopPropagation()}
          onMouseDown={e=>e.stopPropagation()}
          onPointerDown={e=>e.stopPropagation()}
          onTouchStart={e=>e.stopPropagation()}
          style={{ position:"fixed", inset:0, zIndex:99999, background:"rgba(2,6,23,0.72)", display:"flex", alignItems:"flex-start", justifyContent:"center", padding:"72px 12px 18px" }}>
          <div style={{ width:"min(560px,100%)", maxHeight:"calc(100vh - 96px)", display:"flex", flexDirection:"column", border:`1px solid ${th.borderMid}`, borderRadius:16, background:th.bgCard, boxShadow:"0 18px 60px rgba(0,0,0,0.35)", overflow:"hidden" }}>
            <div style={{ padding:12, borderBottom:`1px solid ${th.border}` }}>
              <div style={{ position:"relative" }}>
                <input
                  ref={supplierPickerInputRef}
                  style={{ ...s.inp, paddingLeft:34, paddingRight:44 }}
                  value={supplierPickerQuery}
                  autoComplete="off"
                  inputMode="search"
                  placeholder={lang==="bn"?"ভেন্ডর নাম বা নম্বর দিয়ে খুঁজুন":"Search vendor by name or number"}
                  onChange={e=>setSupplierPickerQuery(e.target.value)}
                  onInput={e=>setSupplierPickerQuery(e.currentTarget.value)}
                  onKeyDown={e=>e.stopPropagation()}
                />
                <span style={{ position:"absolute", left:11, top:"50%", transform:"translateY(-50%)", fontSize:14, pointerEvents:"none", color:th.txtMuted }}>🔍</span>
                <button
                  type="button"
                  onClick={closeOrderSupplierPicker}
                  style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", width:28, height:28, borderRadius:14, border:`1px solid ${th.borderMid}`, background:th.bgInp, color:th.txtMuted, cursor:"pointer" }}>
                  ✕
                </button>
              </div>
            </div>
            <div style={{ overflowY:"auto", WebkitOverflowScrolling:"touch" }}>
              {supplierPickerResults.length===0&&(
                <div style={{ padding:"12px", fontSize:12, color:th.txtMuted }}>
                  {lang==="bn"?"কোনো ভেন্ডর পাওয়া যায়নি":"No vendor found"}
                </div>
              )}
              {supplierPickerResults.map(supplier=>(
                <button
                  key={supplier.id}
                  type="button"
                  onClick={(event)=>{
                    event.stopPropagation();
                    selectOrderSupplierFromPicker(supplier.id);
                  }}
                  style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, padding:"12px", border:"none", borderTop:`1px solid ${th.border}`, background:supplier.id===supplierPickerSelectedId?th.accentDim:"transparent", color:th.txtPrimary, cursor:"pointer", textAlign:"left", fontFamily:"inherit" }}>
                  <span style={{ minWidth:0 }}>
                    <span style={{ fontSize:13, fontWeight:800 }}>{supplier.name}</span>
                    <span style={{ fontSize:10, color:"#f97316", marginLeft:6 }}>{supplier.source}</span>
                  </span>
                  <span style={{ fontSize:11, color:th.txtMuted, whiteSpace:"nowrap" }}>{supplier.phone?`+${supplier.phone}`:"No number"}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {priceEditorTarget&&(
        <div
          onClick={e=>e.stopPropagation()}
          onMouseDown={e=>e.stopPropagation()}
          onPointerDown={e=>e.stopPropagation()}
          onTouchStart={e=>e.stopPropagation()}
          style={{ position:"fixed", inset:0, zIndex:99999, background:"rgba(2,6,23,0.72)", display:"flex", alignItems:"flex-start", justifyContent:"center", padding:"88px 12px 18px" }}>
          <div style={{ width:"min(420px,100%)", border:`1px solid ${th.borderMid}`, borderRadius:16, background:th.bgCard, boxShadow:"0 18px 60px rgba(0,0,0,0.35)", padding:14 }}>
            <div style={{ fontSize:14, fontWeight:900, color:th.txtPrimary, marginBottom:10 }}>
              {lang==="bn"?"Company price":"Company price"}
            </div>
            <input
              ref={priceEditorInputRef}
              style={{ ...s.inp, marginBottom:10 }}
              value={priceEditorValue}
              inputMode="decimal"
              autoComplete="off"
              placeholder={t.price}
              onChange={e=>setPriceEditorValue(e.target.value)}
              onInput={e=>setPriceEditorValue(e.currentTarget.value)}
              onKeyDown={e=>{
                e.stopPropagation();
                if (e.key === "Enter") savePriceEditor();
                if (e.key === "Escape") closePriceEditor();
              }}
            />
            <div style={{ display:"flex", gap:8 }}>
              <button type="button" style={{ ...s.stBtn, flex:1 }} onClick={closePriceEditor}>{lang==="bn"?"বন্ধ":"Cancel"}</button>
              <button type="button" style={{ ...s.savBtn, flex:1 }} onClick={savePriceEditor}>{t.save}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
