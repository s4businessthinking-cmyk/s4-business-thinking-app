import { localIsoDate } from "../utils/localIsoDate.js";
import AppGlobalSearch from "./AppGlobalSearch.jsx";
import ChequeDueAlert from "./ChequeDueAlert.jsx";
import DashboardQuickNav from "./DashboardQuickNav.jsx";

// ─── DASHBOARD TAB ───────────────────────────────────────────
export function DashboardTab({ t, lang, th, s, profile, userUid, localShop, orders, cos, products, team, vendors, customers, isOwner, isDesktop, setTab, unread, staffQuickNavKeys, canUseBranchTransfer, btInbox=[], orderModuleEnabled, finance, moneyLocked=false, onUnlockMoney, onLockMoney, toast, onOpenMenu, globalSearchCan, onGlobalSearchNavigate, globalSearchCur, globalSearchCanSeeCost }) {
  const myOrders   = isOwner ? orders : orders.filter(o=>o.createdBy===userUid);
  const isLightDash = th.bgCard === "#ffffff" || th.bgRoot === "#f1f5f9";
  const pending    = myOrders.filter(o=>o.overall==="pending").length;
  // Open orders count whenever they were made; delivered/cancelled only count when they closed today.
  const todayKey   = localIsoDate();
  const closedToday = (o) => {
    const raw = o.updatedAt || o.createdAt;
    const d = raw?.toDate ? raw.toDate() : raw ? new Date(raw) : null;
    return !!d && !Number.isNaN(d.getTime()) && localIsoDate(d) === todayKey;
  };
  const delivered  = myOrders.filter(o=>o.overall==="delivered"&&closedToday(o)).length;
  const cancelled  = myOrders.filter(o=>o.overall==="cancelled"&&closedToday(o)).length;
  const inProgress = myOrders.filter(o=>!["pending","delivered","cancelled"].includes(o.overall)).length;

  const panelStyle = isDesktop
    ? {
        ...s.desktopPanel,
        background:isLightDash
          ? "linear-gradient(180deg,#f8fafc,#eef6ff)"
          : `radial-gradient(circle at 8% 0%, rgba(96,165,250,0.18), transparent 34%), linear-gradient(180deg, ${th.bgRoot}, ${th.bgRoot})`,
      }
    : {
        ...s.panel,
        padding:"16px 14px 96px",
        background:isLightDash
          ? "radial-gradient(circle at 14% 0%, rgba(59,130,246,0.18), transparent 34%), linear-gradient(180deg,#f8fafc,#eaf3ff)"
          : `radial-gradient(circle at 15% 0%, rgba(96,165,250,0.20), transparent 34%), radial-gradient(circle at 92% 8%, rgba(14,165,233,0.10), transparent 30%), linear-gradient(180deg, ${th.bgRoot}, #07111f)`,
      };

  const sectionTitle = {
    display:"flex",
    justifyContent:"space-between",
    alignItems:"center",
    margin:"12px 2px 8px",
    color:th.txtPrimary,
    fontSize:isDesktop?12:11,
    fontWeight:900,
    textTransform:"uppercase",
    letterSpacing:0.7,
  };

  const dashRow = isDesktop ? {
    display:"flex",
    gap:10,
    marginBottom:14,
    overflowX:"auto",
    flexWrap:"nowrap",
    scrollbarWidth:"none",
    WebkitOverflowScrolling:"touch",
  } : {
    display:"grid",
    gridTemplateColumns:"repeat(4, minmax(0,1fr))",
    gap:8,
    marginBottom:14,
  };
  const moneyRow = isDesktop ? dashRow : {
    display:"grid",
    gridTemplateColumns:"repeat(2, minmax(0,1fr))",
    gap:8,
    marginBottom:14,
  };

  const glassCard = {
    background:isLightDash
      ? "linear-gradient(145deg, rgba(255,255,255,0.98), rgba(239,246,255,0.96))"
      : "linear-gradient(145deg, rgba(30,41,59,0.92), rgba(15,23,42,0.86))",
    border:isLightDash ? "1px solid rgba(59,130,246,0.18)" : "1px solid rgba(148,163,184,0.25)",
    boxShadow:isLightDash ? "0 12px 28px rgba(30,64,175,0.10)" : "0 14px 35px rgba(2,6,23,0.32)",
    backdropFilter:"blur(14px)",
  };

  const btWaiting = btInbox.length;
  const ownerNavItems = [
    ...(orderModuleEnabled ? [{ key:"owner", icon:"📋", label:lang==="bn"?"অর্ডার":"Orders", badge:unread }] : []),
    { key:"products", icon:"📦", label:lang==="bn"?"পণ্য":"Products",         badge:products.length },
    { key:"purchase", icon:"🧾", label:lang==="bn"?"ক্রয়":"Purchase",         badge:null },
    { key:"sales",    icon:"🧾", label:lang==="bn"?"বিক্রয়":"Sales",          badge:null },
    { key:"vendors",  icon:"🏭", label:lang==="bn"?"ভেন্ডর":"Vendors",        badge:vendors.length },
    { key:"customers",icon:"👥", label:lang==="bn"?"কাস্টমার":"Customers",    badge:customers.length },
    { key:"cheque",   icon:"🖨️", label:lang==="bn"?"চেক":"Cheque",            badge:null },
    { key:"pdc",      icon:"📃", label:lang==="bn"?"PDC চেক":"PDC",           badge:null },
    { key:"expenses", icon:"💸", label:lang==="bn"?"খরচ":"Expenses",          badge:null },
    { key:"vouchers", icon:"🧾", label:lang==="bn"?"ভাউচার":"Vouchers",       badge:null },
    { key:"salesReturn", icon:"↩️", label:lang==="bn"?"সেলস রিটার্ন":"Sales Return", badge:null },
    { key:"purchaseReturn", icon:"↪️", label:lang==="bn"?"পারচেজ রিটার্ন":"Purchase Return", badge:null },
    { key:"stockAdjust", icon:"⚖️", label:lang==="bn"?"স্টক সমন্বয়":"Stock Adjust", badge:null },
    { key:"accounts", icon:"📊", label:lang==="bn"?"হিসাব নিকাশ":"Accounts",  badge:null },
    { key:"tax",      icon:"🏛️", label:lang==="bn"?"ট্যাক্স / VAT":"Tax / VAT", badge:null },
    { key:"partners", icon:"🤝", label:lang==="bn"?"পার্টনার":"Partners",      badge:null },
    { key:"auditLog", icon:"🕵️", label:lang==="bn"?"অডিট লগ":"Audit Log",   badge:null },
    ...(canUseBranchTransfer ? [{ key:"branchTransfer", icon:"🚚", label:lang==="bn"?"Branch Transfer":"Branch Transfer", badge:btWaiting||null }] : []),
    { key:"settings", icon:"⚙️", label:lang==="bn"?"সেটিংস":"Settings",       badge:null },
  ];

  const salesNavItems = [
    ...(orderModuleEnabled ? [{ key:"shop", icon:"📋", label:lang==="bn"?"অর্ডার":"New Order", badge:unread }] : []),
    ...(staffQuickNavKeys.includes("products") ? [{ key:"products", icon:"📦", label:lang==="bn"?"পণ্য":"Products", badge:null }] : []),
    ...(staffQuickNavKeys.includes("sales") ? [{ key:"sales", icon:"🧾", label:lang==="bn"?"বিক্রয়":"Sales", badge:null }] : []),
    { key:"purchase", icon:"📦", label:lang==="bn"?"ক্রয় তথ্য":"Purchase",   badge:null },
    ...(staffQuickNavKeys.includes("cheque") ? [{ key:"cheque", icon:"🖨️", label:lang==="bn"?"চেক":"Cheque", badge:null }] : []),
    ...(staffQuickNavKeys.includes("pdc") ? [{ key:"pdc", icon:"📃", label:lang==="bn"?"PDC চেক":"PDC", badge:null }] : []),
    ...(staffQuickNavKeys.includes("expenses") ? [{ key:"expenses", icon:"💸", label:lang==="bn"?"খরচ":"Expenses", badge:null }] : []),
    ...(staffQuickNavKeys.includes("vouchers") ? [{ key:"vouchers", icon:"🧾", label:lang==="bn"?"ভাউচার":"Vouchers", badge:null }] : []),
    ...(staffQuickNavKeys.includes("salesReturn") ? [{ key:"salesReturn", icon:"↩️", label:lang==="bn"?"সেলস রিটার্ন":"Sales Return", badge:null }] : []),
    ...(staffQuickNavKeys.includes("purchaseReturn") ? [{ key:"purchaseReturn", icon:"↪️", label:lang==="bn"?"পারচেজ রিটার্ন":"Purchase Return", badge:null }] : []),
    ...(staffQuickNavKeys.includes("stockAdjust") ? [{ key:"stockAdjust", icon:"⚖️", label:lang==="bn"?"স্টক সমন্বয়":"Stock Adjust", badge:null }] : []),
    ...(canUseBranchTransfer ? [{ key:"branchTransfer", icon:"🚚", label:lang==="bn"?"Branch Transfer":"Branch Transfer", badge:btWaiting||null }] : []),
    { key:"settings", icon:"⚙️", label:lang==="bn"?"সেটিংস":"Settings",       badge:null },
  ];

  const navItems = isOwner ? ownerNavItems : salesNavItems;

  const statusCards = [
    { label:t.dashPending,    value:pending,    icon:"⏳", color:"#f59e0b", glow:"rgba(245,158,11,0.26)" },
    { label:t.dashInProgress, value:inProgress, icon:"🔄", color:"#0ea5e9", glow:"rgba(14,165,233,0.26)" },
    { label:t.dashDelivered,  value:delivered,  icon:"✅", color:"#22c55e", glow:"rgba(34,197,94,0.24)" },
    { label:t.dashCancelled,  value:cancelled,  icon:"✖", color:"#ef4444", glow:"rgba(239,68,68,0.24)" },
  ];

  const bn = lang==="bn";
  const cur = t.cur || "AED";
  const money = (v) => (Math.round((parseFloat(v)||0)*100)/100).toLocaleString("en-US", { minimumFractionDigits:2, maximumFractionDigits:2 });
  const salesCards = [
    { key:"st", tab:"sales",    icon:"🧾", color:"#22c55e", label:bn?"আজকের বিক্রি":"Today's sales",
      value:money(finance.salesToday), sub:bn?`${finance.salesTodayCount}টি ইনভয়েস`:`${finance.salesTodayCount} invoices` },
    { key:"sm", tab:"sales",    icon:"📈", color:"#3b82f6", label:bn?"এই মাসের বিক্রি":"This month's sales",
      value:money(finance.salesMonth), sub:bn?`${finance.salesMonthCount}টি ইনভয়েস`:`${finance.salesMonthCount} invoices` },
    { key:"ct", tab:"sales",    icon:"💵", color:"#10b981", label:bn?"আজ টাকা আদায়":"Collected today",
      value:money(finance.collectedToday), sub:bn?"নগদ + রিসিট":"Cash + receipts" },
    { key:"pt", tab:"purchase", icon:"🛒", color:"#8b5cf6", label:bn?"আজকের ক্রয়":"Today's purchase",
      value:money(finance.purchaseToday), sub:bn?`${finance.purchaseTodayCount}টি ইনভয়েস`:`${finance.purchaseTodayCount} invoices` },
    { key:"pm", tab:"purchase", icon:"📦", color:"#a855f7", label:bn?"এই মাসের ক্রয়":"This month's purchase",
      value:money(finance.purchaseMonth), sub:bn?`${finance.purchaseMonthCount}টি ইনভয়েস`:`${finance.purchaseMonthCount} invoices` },
  ];
  const creditCards = [
    { key:"rc", tab:"sales",    icon:"🙋", color:"#f59e0b", label:bn?"কাস্টমারের কাছে পাওনা":"Customers owe you",
      value:money(finance.receivable.amount), sub:bn?`${finance.receivable.parties} জন কাস্টমার`:`${finance.receivable.parties} customers` },
    { key:"py", tab:"purchase", icon:"🏭", color:"#ef4444", label:bn?"সাপ্লায়ারকে দেনা":"You owe suppliers",
      value:money(finance.payable.amount), sub:bn?`${finance.payable.parties} জন সাপ্লায়ার`:`${finance.payable.parties} suppliers` },
    { key:"cr", tab:"pdc",      icon:"📥", color:"#06b6d4", label:bn?"হাতে থাকা চেক (পাওয়া)":"Cheques received (pending)",
      value:money(finance.chequesReceived.amount),
      sub:finance.chequesReceived.dueNow>0
        ? (bn?`${finance.chequesReceived.count}টি · ${finance.chequesReceived.dueNow}টি জমার সময় হয়েছে`:`${finance.chequesReceived.count} · ${finance.chequesReceived.dueNow} due now`)
        : (bn?`${finance.chequesReceived.count}টি চেক`:`${finance.chequesReceived.count} cheques`),
      extra:{ label:bn?"এই মাসে":"This month", value:money(finance.chequesReceived.monthAmount), count:finance.chequesReceived.monthCount },
      alert:finance.chequesReceived.dueNow>0 },
    { key:"ci", tab:"pdc",      icon:"📤", color:"#ec4899", label:bn?"দেওয়া চেক (বাকি)":"Cheques issued (pending)",
      value:money(finance.chequesIssued.amount),
      sub:finance.chequesIssued.dueNow>0
        ? (bn?`${finance.chequesIssued.count}টি · ${finance.chequesIssued.dueNow}টি পাস হওয়ার সময়`:`${finance.chequesIssued.count} · ${finance.chequesIssued.dueNow} due now`)
        : (bn?`${finance.chequesIssued.count}টি চেক`:`${finance.chequesIssued.count} cheques`),
      extra:{ label:bn?"এই মাসে":"This month", value:money(finance.chequesIssued.monthAmount), count:finance.chequesIssued.monthCount },
      alert:finance.chequesIssued.dueNow>0 },
  ];

  const moneyCard = (item, idx, list) => (
    <button
      key={item.key}
      onClick={()=>setTab(item.tab)}
      style={{
        ...glassCard,
        borderRadius:14,
        padding:isDesktop?"10px 12px":"9px 10px",
        minHeight:86,
        boxSizing:"border-box",
        display:"flex",
        flexDirection:"column",
        alignItems:"flex-start",
        justifyContent:"space-between",
        gap:4,
        borderBottom:`3px solid ${item.color}`,
        flex:isDesktop?"1 1 0":undefined,
        minWidth:0,
        width:"100%",
        overflow:"hidden",
        gridColumn:!isDesktop && list.length%2===1 && idx===list.length-1 ? "1 / -1" : undefined,
        cursor:"pointer",
        fontFamily:"inherit",
        textAlign:"left",
        color:th.txtPrimary,
      }}
    >
      <div style={{ display:"flex", alignItems:"center", gap:7, width:"100%" }}>
        <span style={{ width:24, height:24, borderRadius:12, background:`linear-gradient(135deg, ${item.color}, rgba(255,255,255,0.12))`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, flexShrink:0 }}>{item.icon}</span>
        <span style={{ color:th.txtSecondary, fontSize:11, fontWeight:800, lineHeight:1.15, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.label}</span>
      </div>
      <div style={{ fontSize:isDesktop?19:16, fontWeight:900, lineHeight:1.1, letterSpacing:-0.3, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:"100%" }}>
        <span style={{ fontSize:11, fontWeight:800, color:th.txtMuted, marginRight:4 }}>{cur}</span>{item.value}
      </div>
      <div style={{ fontSize:10, fontWeight:700, color:item.alert?"#f59e0b":th.txtMuted, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:"100%" }}>{item.sub}</div>
      {item.extra&&(
        <div style={{ width:"100%", boxSizing:"border-box", marginTop:2, padding:"4px 7px", borderRadius:8, background:`${item.color}1f`, border:`1px solid ${item.color}44`, display:"flex", flexWrap:"wrap", justifyContent:"space-between", alignItems:"baseline", columnGap:6, rowGap:1, whiteSpace:"nowrap" }}>
          <span style={{ fontSize:10, fontWeight:800, color:th.txtSecondary }}>📅 {item.extra.label} ({item.extra.count})</span>
          <span style={{ fontSize:12, fontWeight:900, color:th.txtPrimary }}>{item.extra.value}</span>
        </div>
      )}
    </button>
  );

  const statCard = (item) => (
    <div
      key={item.label}
      style={{
        ...glassCard,
        borderRadius:14,
        padding:isDesktop?"10px 12px":"8px 8px",
        minHeight:isDesktop?72:64,
        height:isDesktop?72:64,
        boxSizing:"border-box",
        position:"relative",
        overflow:"hidden",
        borderBottom:`3px solid ${item.color}`,
        display:"flex",
        flexDirection:"column",
        justifyContent:"space-between",
        flex:"1 1 0",
        minWidth:0,
      }}
    >
      <div style={{ position:"absolute", inset:"auto -28px -32px auto", width:72, height:72, borderRadius:"50%", background:item.glow||`${item.color}22`, filter:"blur(4px)" }} />
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:6, position:"relative", zIndex:1 }}>
        <div style={{ width:30, height:30, borderRadius:15, background:`linear-gradient(135deg, ${item.color}, rgba(255,255,255,0.12))`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, boxShadow:`0 6px 14px ${item.color}44`, flexShrink:0 }}>
          {item.icon}
        </div>
        <div style={{ color:th.txtPrimary, fontSize:isDesktop?22:20, lineHeight:1, fontWeight:900, letterSpacing:-0.5 }}>{item.value}</div>
      </div>
      <div style={{ color:th.txtSecondary, fontSize:isDesktop?11:10, fontWeight:700, marginTop:6, lineHeight:1.2, position:"relative", zIndex:1 }}>{item.label}</div>
    </div>
  );

  const globalSearchOn = onGlobalSearchNavigate && globalSearchCan && Object.values(globalSearchCan).some(Boolean);

  return (
    <div style={panelStyle}>
      {!isDesktop && globalSearchOn && (
        <div style={{ marginBottom: 10 }}>
          <AppGlobalSearch
            lang={lang}
            th={th}
            glassCard={{ ...glassCard, borderRadius: 14, padding: "10px 12px" }}
            products={products}
            customers={customers}
            vendors={vendors}
            can={globalSearchCan}
            onNavigate={onGlobalSearchNavigate}
            isMobile
            cur={globalSearchCur || t.cur || "AED"}
            canSeeCost={globalSearchCanSeeCost}
          />
        </div>
      )}

      {orderModuleEnabled && (
        <>
          <div style={sectionTitle}>
            <span>{isOwner ? (lang==="bn"?"আজকের অর্ডার":"Today Overview") : t.dashMyOrders}</span>
            <button onClick={()=>setTab(isOwner?"owner":"shop")} style={{ background:"transparent", border:0, color:"#60a5fa", fontWeight:800, fontSize:12, cursor:"pointer" }}>
              {lang==="bn"?"সব দেখুন":"View all"}
            </button>
          </div>
          <div style={dashRow}>
            {statusCards.map(c=>statCard(c))}
          </div>
        </>
      )}

      {isDesktop && globalSearchOn && (
        <AppGlobalSearch
          lang={lang}
          th={th}
          glassCard={glassCard}
          products={products}
          customers={customers}
          vendors={vendors}
          can={globalSearchCan}
          onNavigate={onGlobalSearchNavigate}
          cur={globalSearchCur || t.cur || "AED"}
          canSeeCost={globalSearchCanSeeCost}
        />
      )}

      {isOwner && !moneyLocked && (
        <ChequeDueAlert lang={lang} th={th} cur={cur} cheques={finance.dueCheques} upcoming={finance.upcomingCheques} today={finance.today}
          userId={userUid} toast={toast} onOpenPdc={()=>setTab("pdc")} />
      )}

      {isOwner && moneyLocked && (
        <button onClick={onUnlockMoney} style={{ ...glassCard, width:"100%", borderRadius:14, padding:"16px 14px", marginTop:6, marginBottom:6, display:"flex", alignItems:"center", gap:12, cursor:"pointer", fontFamily:"inherit", textAlign:"left", color:th.txtPrimary, borderBottom:"3px solid #2563eb" }}>
          <span style={{ fontSize:28 }}>🔒</span>
          <span style={{ flex:1, minWidth:0 }}>
            <span style={{ display:"block", fontSize:14, fontWeight:900 }}>{bn?"টাকার হিসাব লুকানো আছে":"Money figures are hidden"}</span>
            <span style={{ display:"block", fontSize:11, color:th.txtMuted, marginTop:2 }}>
              {bn?"বিক্রি, ক্রয়, পাওনা, দেনা ও চেকের হিসাব দেখতে পিন দিন":"Enter your PIN to see sales, purchase, receivables, payables and cheques"}
              {(finance.dueCheques?.length||0)>0 ? (bn?` · ⏰ ${finance.dueCheques.length}টি চেকের তারিখ এসেছে`:` · ⏰ ${finance.dueCheques.length} cheques due`) : ""}
            </span>
          </span>
          <span style={{ padding:"8px 14px", borderRadius:10, background:"linear-gradient(135deg,#2563eb,#1d4ed8)", color:"#fff", fontSize:13, fontWeight:800, whiteSpace:"nowrap" }}>🔓 {bn?"দেখুন":"Show"}</span>
        </button>
      )}

      {isOwner && !moneyLocked && (
        <>
          <div style={{ ...sectionTitle, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span>{bn?"💰 বিক্রির হিসাব":"💰 Sales"}</span>
            {onLockMoney&&<button onClick={onLockMoney} title={bn?"আবার লুকান":"Hide again"} style={{ padding:"4px 10px", borderRadius:8, border:`1px solid ${th.borderMid}`, background:"transparent", color:th.txtSecondary, fontSize:11, fontWeight:800, cursor:"pointer", fontFamily:"inherit" }}>🔒 {bn?"লক":"Lock"}</button>}
          </div>
          <div style={moneyRow}>
            {salesCards.map(moneyCard)}
          </div>
          <div style={sectionTitle}><span>{bn?"📒 বাকির হিসাব":"📒 Credit"}</span></div>
          <div style={moneyRow}>
            {creditCards.map(moneyCard)}
          </div>
        </>
      )}

      {canUseBranchTransfer && btWaiting>0 && (
        <button type="button" onClick={()=>setTab("branchTransfer")}
          style={{ ...glassCard, width:"100%", display:"flex", alignItems:"center", gap:12, padding:"12px 14px", marginBottom:14, borderRadius:14, border:"1px solid #f59e0b", borderLeft:"5px solid #f59e0b", cursor:"pointer", textAlign:"left", fontFamily:"inherit", color:th.txtPrimary }}>
          <span style={{ fontSize:26 }}>🚚</span>
          <span style={{ flex:1, minWidth:0 }}>
            <span style={{ display:"block", fontSize:14, fontWeight:800 }}>
              {bn ? `${btWaiting}টা Branch Transfer রিসিভের অপেক্ষায়` : `${btWaiting} branch transfer${btWaiting>1?"s":""} waiting to be received`}
            </span>
            <span style={{ display:"block", fontSize:12, color:th.txtMuted, marginTop:2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
              {btInbox.slice(0,3).map(tr=>`${tr.transferNo||""}${tr.branchName?` → ${tr.branchName}`:""}`).join(" · ")}
            </span>
          </span>
          <span style={{ fontSize:12, fontWeight:800, color:"#b45309", whiteSpace:"nowrap" }}>{bn ? "খুলুন ›" : "Open ›"}</span>
        </button>
      )}

      <DashboardQuickNav
        navItems={navItems}
        lang={lang}
        isDesktop={isDesktop}
        isLightDash={isLightDash}
        th={th}
        setTab={setTab}
        title={t.dashQuickNav}
      />

      {!isDesktop && (
        <div style={{ position:"fixed", left:12, right:12, bottom:10, zIndex:20, borderRadius:24, padding:"10px 12px", background:isLightDash?"rgba(255,255,255,0.92)":"rgba(15,23,42,0.86)", border:isLightDash?"1px solid rgba(59,130,246,0.18)":"1px solid rgba(148,163,184,0.25)", boxShadow:isLightDash?"0 20px 40px rgba(30,64,175,0.14)":"0 20px 40px rgba(2,6,23,0.48)", backdropFilter:"blur(16px)", display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:6 }}>
          {[
            { key:"dashboard", icon:"🏠", label:lang==="bn"?"হোম":"Home" },
            { key:isOwner?"owner":"shop", icon:"📋", label:lang==="bn"?"অর্ডার":"Orders" },
            {
              key: isOwner ? "purchase" : "shop",
              icon:"＋",
              label: isOwner ? (lang==="bn"?"নতুন":"New") : (lang==="bn"?"অর্ডার":"Order"),
              main:true,
            },
            ...(isOwner ? [{ key:"vendors", icon:"🏭", label:lang==="bn"?"ভেন্ডর":"Vendors" }] : []),
            { key:"more", icon:"☰", label:lang==="bn"?"আরও":"More" },
          ].map(item=>(
            <button key={item.key} onClick={()=>item.key==="more" ? (onOpenMenu ? onOpenMenu() : setTab("settings")) : setTab(item.key)}
              style={{ border:0, background:"transparent", color:item.main?"#fff":th.txtSecondary, fontFamily:"inherit", display:"flex", flexDirection:"column", alignItems:"center", gap:3, fontSize:10, fontWeight:800 }}>
              <span style={{ width:item.main?50:30, height:item.main?50:30, marginTop:item.main?-24:0, borderRadius:999, background:item.main?"linear-gradient(135deg,#2563eb,#60a5fa)":"transparent", boxShadow:item.main?"0 12px 28px rgba(59,130,246,0.46)":"none", display:"flex", alignItems:"center", justifyContent:"center", fontSize:item.main?34:22 }}>
                {item.icon}
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
