import { START_TABS } from "../team/UserDefaultsEditor.jsx";
import { billLeaveGuard, deviceSerialTag, nsmatch, reserveShopSerial } from "../shared/appShared.jsx";
import { branchTransferMenuLabel } from "../branch-transfer/BranchTransferNative.jsx";
import { chequeTypeIcon, chequeTypeLabel } from "../dashboard/ChequeDueAlert.jsx";
import { alertText as employeeAlertText } from "../employees/employeeAlerts.js";
import { partnerAlertText } from "../partners/partners.js";
import { reminderAlertText } from "../reminders/reminders.js";
import { useEffect, useMemo, useRef } from "react";
import { useEscapeKey } from "../components/WindowChrome.jsx";

export function useNavigationState({ btInbox, can, canUseBranchTransfer, confirmPmDiscard, employeeAlertList, finance, findOrderSupplier, getOrderDisplayNo, hErr, isDesktop, isOrderManager, isOwner, lang, localShop, menuOpen, openEmployeeAlert, orderModuleEnabled, orderReceive, orderReceiveSaving, orderStatusPage, orders, partnerAlertList, patchOrderOffline, pmOverSales, pmReset, profile, reminderAlertList, searchQ, setMenuOpen, setOrderReceive, setOrderStatusPage, setPmEditId, setPmOverSales, setPmShowAdd, setSettingsPage, setTab, setTabState, settingsPage, shopId, t, tab, team, th, toast, user }) {
  const unread = isOwner || isOrderManager
    ? orders.filter(o=>o.overall==="pending"&&!o.read).length
    : orders.filter(o=>o.items?.some(it=>it.status==="out_for_branch")).length;

  const notificationItems = [
    ...(isOwner ? finance.dueCheques.map(c => ({
      key:`chq-${c.key}`,
      icon:chequeTypeIcon(c.type),
      tone:c.daysLate>0?"danger":undefined,
      title:lang==="bn"
        ? `${chequeTypeLabel(c.type,true)} ক্লিয়ার করুন · ${t.cur||"AED"} ${(Math.round(c.amount*100)/100).toLocaleString("en-US",{minimumFractionDigits:2})}`
        : `Clear ${chequeTypeLabel(c.type,false).toLowerCase()} · ${t.cur||"AED"} ${(Math.round(c.amount*100)/100).toLocaleString("en-US",{minimumFractionDigits:2})}`,
      sub:`${c.party||"—"} · ${lang==="bn"?"চেক":"Cheque"} ${c.chequeNo||c.no} · ${c.daysLate>0?(lang==="bn"?`${c.daysLate} দিন পার`:`${c.daysLate} day(s) late`):(lang==="bn"?"আজ":"today")}`,
      onClick:()=>{ setSettingsPage(null); setTab("dashboard"); },
    })) : []),
    ...(isOwner ? finance.upcomingCheques.map(c => ({
      key:`chq-up-${c.key}`,
      icon:"⏳",
      title:lang==="bn"
        ? `${-c.daysLate} দিন পর ${chequeTypeLabel(c.type,true)} · ${t.cur||"AED"} ${(Math.round(c.amount*100)/100).toLocaleString("en-US",{minimumFractionDigits:2})}`
        : `${chequeTypeLabel(c.type,false)} in ${-c.daysLate} day(s) · ${t.cur||"AED"} ${(Math.round(c.amount*100)/100).toLocaleString("en-US",{minimumFractionDigits:2})}`,
      sub:`${c.party||"—"} · ${lang==="bn"?"চেক":"Cheque"} ${c.chequeNo||c.no} · 📅 ${c.chequeDate.split("-").reverse().join("/")}`,
      onClick:()=>{ setSettingsPage(null); setTab("dashboard"); },
    })) : []),
    ...employeeAlertList.filter(a => a.tone!=="info" || a.daysLeft<=7).map(a => {
      const txt = employeeAlertText(a, lang==="bn", t.cur||"AED");
      return { key:`emp-${a.key}`, icon:txt.icon, tone:a.tone==="danger"?"danger":undefined, title:txt.title, sub:txt.sub, onClick:()=>openEmployeeAlert(a) };
    }),
    ...partnerAlertList.map(a => {
      const txt = partnerAlertText(a, lang==="bn", t.cur||"AED");
      return { key:`partner-${a.key}`, icon:txt.icon, tone:a.tone==="danger"?"danger":undefined, title:txt.title, sub:txt.sub, onClick:()=>{ setSettingsPage(null); setTab("partners"); } };
    }),
    ...reminderAlertList.map(a => {
      const txt = reminderAlertText(a, lang==="bn");
      return { key:a.key, icon:txt.icon, tone:a.tone, title:txt.title, sub:txt.sub, onClick:()=>{ setSettingsPage(null); setTab("reminders"); } };
    }),
    ...(orderModuleEnabled && unread>0 ? [{
      key:"orders", icon:"📋", count:unread,
      title:lang==="bn"?`${unread}টি নতুন অর্ডার`:`${unread} new order(s)`,
      sub:lang==="bn"?"অর্ডার পাতায় দেখুন":"Open orders",
      onClick:()=>{ setSettingsPage(null); setTab(isOwner?"owner":"shop"); },
    }] : []),
  ];

  // Phone/browser back button and the header Back button: sub-page → settings
  // list → dashboard, instead of leaving the app.
  const navHistRef = useRef({ pushed:false, ignorePop:false });
  const navStateRef = useRef({ tab, settingsPage });
  navStateRef.current = { tab, settingsPage };
  // Back while Product Master is open: keep unsaved edits unless confirmed, and an overlay
  // opened from an invoice closes back to that invoice. Returns true when it handled the back.
  const pmBackRef = useRef(null);
  pmBackRef.current = () => {
    const pmVisible = tab === "products" || (pmOverSales && ["sales","quotation","delivery","purchase"].includes(tab));
    if (!pmVisible) return false;
    if (!confirmPmDiscard()) return true;
    setPmShowAdd(false); setPmEditId(null); pmReset();
    if (pmOverSales) { setPmOverSales(false); return true; }
    return false;
  };
  useEffect(() => {
    const h = navHistRef.current;
    const away = tab !== "dashboard";
    if (away && !h.pushed) { window.history.pushState({ s4nav:true }, ""); h.pushed = true; }
    else if (!away && h.pushed) { h.pushed = false; h.ignorePop = true; window.history.back(); }
  }, [tab, settingsPage]);
  useEffect(() => {
    const onPop = () => {
      const h = navHistRef.current;
      if (h.ignorePop) { h.ignorePop = false; return; }
      if (!h.pushed) return;
      h.pushed = false;
      if (pmBackRef.current?.() || billLeaveGuard.current?.back()) {
        window.history.pushState({ s4nav:true }, "");
        h.pushed = true;
        return;
      }
      const { tab:curTab, settingsPage:curPage } = navStateRef.current;
      if (curTab === "settings" && curPage) setSettingsPage(null);
      else setTab("dashboard");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const menuHistRef = useRef(false);
  useEffect(() => {
    if (!menuOpen) return undefined;
    window.history.pushState({ s4menu:true }, "");
    menuHistRef.current = true;
    const onPop = () => {
      if (!menuHistRef.current) return;
      menuHistRef.current = false;
      setMenuOpen(false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [menuOpen]);
  const closeMenu = () => {
    if (menuHistRef.current) {
      menuHistRef.current = false;
      navHistRef.current.ignorePop = true;
      window.history.back();
    }
    setMenuOpen(false);
  };
  const selectFromMenu = (k) => {
    if (k !== tab && billLeaveGuard.current && !billLeaveGuard.current.leave()) { closeMenu(); return; }
    if (menuHistRef.current) {
      menuHistRef.current = false;
      if (k !== "dashboard" && !navHistRef.current.pushed) navHistRef.current.pushed = true;
      else { navHistRef.current.ignorePop = true; window.history.back(); }
    }
    setMenuOpen(false);
    setSettingsPage(null);
    setTabState(k);
  };
  const stPage = settingsPage || (isDesktop ? "profile" : null);
  const goBack = () => {
    if (pmBackRef.current?.() || billLeaveGuard.current?.back()) return;
    if (tab === "settings" && settingsPage) setSettingsPage(null);
    else { setSettingsPage(null); setTab("dashboard"); }
  };

  // ── SEARCH FILTER ──
  const filterOrders = (list) => {
    const q = searchQ.trim();
    if (!q) return list;
    return list.filter(o => {
      const noMatch = nsmatch(getOrderDisplayNo(o), q);
      const itemMatch = o.items?.some(it =>
        nsmatch([it.name,it.brand,it.code].filter(Boolean).join(" "), q)
      );
      const supplierMatch = o.items?.some(it => {
        const supplier = findOrderSupplier(it.co);
        return nsmatch([supplier?.name, supplier?.phone, it.supplierPhone].filter(Boolean).join(" "), q);
      });
      const d = o.createdAt instanceof Date ? o.createdAt : new Date(o.createdAt);
      // Match against several date formats so user can type e.g. "9 may", "09/05", "2026"
      const dateFormats = [
        d.toLocaleDateString("bn-BD", { day:"numeric", month:"long", year:"numeric" }),
        d.toLocaleDateString("en-GB",  { day:"numeric", month:"long", year:"numeric" }),
        d.toLocaleDateString("en-GB",  { day:"2-digit", month:"2-digit", year:"numeric" }), // 09/05/2026
        d.toLocaleDateString("en-GB",  { day:"numeric", month:"short" }),                   // 9 May
        String(d.getFullYear()),
      ];
      const dateMatch = dateFormats.some(f => f.toLowerCase().includes(q));
      return noMatch || itemMatch || supplierMatch || dateMatch;
    });
  };

  // ── DAILY GROUP ──
  const groupByDay = (list) => {
    const groups = {};
    list.forEach(o => {
      const d = o.createdAt instanceof Date ? o.createdAt : new Date(o.createdAt);
      const key = d.toLocaleDateString(lang==="bn"?"bn-BD":"en-GB", { day:"numeric", month:"long", year:"numeric" });
      if (!groups[key]) groups[key] = [];
      groups[key].push(o);
    });
    return Object.entries(groups); // [ [dateStr, [orders]], ... ]
  };

  const orderPageTabs = [
    { key:"pending", label:lang==="bn"?"Pending":"Pending", icon:"⏳" },
    { key:"delivered", label:lang==="bn"?"Delivered":"Delivered", icon:"✅" },
    { key:"cancelled", label:lang==="bn"?"Cancelled":"Cancelled", icon:"🚫" },
  ];
  const orderPageCounts = {
    pending: orders.filter(o => !["delivered","cancelled"].includes(o.overall)).length,
    delivered: orders.filter(o => o.overall === "delivered").length,
    cancelled: orders.filter(o => o.overall === "cancelled").length,
  };
  const filterOrdersByStatusPage = (list) => list.filter((order) => {
    if (orderStatusPage === "delivered") return order.overall === "delivered";
    if (orderStatusPage === "cancelled") return order.overall === "cancelled";
    return !["delivered","cancelled"].includes(order.overall);
  });
  const renderOrderPageTabs = () => (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(3,minmax(0,1fr))", gap:7, marginBottom:12 }}>
      {orderPageTabs.map(page => (
        <button
          key={page.key}
          type="button"
          onClick={()=>setOrderStatusPage(page.key)}
          style={{ padding:"10px 8px", borderRadius:12, border:`1px solid ${orderStatusPage===page.key?"#f97316":th.borderMid}`, background:orderStatusPage===page.key?th.accentDim:th.bgCard, color:orderStatusPage===page.key?"#f97316":th.txtSecondary, fontSize:12, fontWeight:850, cursor:"pointer", fontFamily:"inherit" }}>
          {page.icon} {page.label}
          <span style={{ display:"block", fontSize:10, color:th.txtMuted, marginTop:2 }}>{orderPageCounts[page.key] || 0}</span>
        </button>
      ))}
    </div>
  );

  const canStaffSupplierArea = can("viewVendors") || can("viewSupplierLedger") || can("vendorPayments") || can("managePurchase");
  const canStaffVouchers = can("accountVouchers") || can("manageSales") || can("vendorPayments") || can("manageReturns");
  const staffQuickNavKeys = isOwner
    ? []
    : [
        ...(orderModuleEnabled ? ["shop"] : []),
        ...(can("viewProducts") ? ["products"] : []),
        ...(can("manageSales") ? ["sales"] : []),
        "purchase",
        ...(can("printCheques") ? ["cheque"] : []),
        ...(can("managePdc") ? ["pdc"] : []),
        ...(can("manageExpenses") ? ["expenses"] : []),
        ...(canStaffVouchers ? ["vouchers"] : []),
        ...(can("manageReturns") ? ["salesReturn","purchaseReturn"] : []),
        ...(can("stockAdjust") ? ["stockAdjust"] : []),
        "settings",
      ];

  const makeShopNo = async (field, prefix, nos = []) => {
    const re = new RegExp(`^${prefix}-?(\\d+)(?:-[A-Z]{2})?$`, "i");
    const local = nos.reduce((mx, no) => {
      const m = String(no || "").match(re);
      return m ? Math.max(mx, Number(m[1])) : mx;
    }, Number(localShop?.[field] || 0));
    const fmt = (n) => `${prefix}-${String(n).padStart(4, "0")}`;
    const serial = await reserveShopSerial(shopId, field, local);
    if (serial) return fmt(serial);
    return isOwner ? fmt(local + 1) : `${fmt(local + 1)}-${deviceSerialTag()}`;
  };
  const newTabLabels = {
    salesOrder: lang==="bn"?"📝 সেলস অর্ডার":"📝 Sales Order",
    purchaseOrder: lang==="bn"?"📋 পারচেজ অর্ডার":"📋 Purchase Order",
    goodsReceipt: lang==="bn"?"📥 মাল গ্রহণ (DN Received)":"📥 Delivery Note (Received)",
    employees: lang==="bn"?"👷 কর্মচারী":"👷 Employees",
    employeeExpense: lang==="bn"?"🧑‍💼 কর্মচারীর খরচ":"🧑‍💼 Employee Expense",
    attendance: lang==="bn"?"🗓️ হাজিরা খাতা":"🗓️ Attendance Register",
    bankRec: lang==="bn"?"🏦 ব্যাংক মেলানো":"🏦 Bank Reconciliation",
    jobCard: lang==="bn"?"🔧 জব কার্ড":"🔧 Job Card",
    partners: lang==="bn"?"🤝 পার্টনার ও লাভের ভাগ":"🤝 Partners",
    labels: lang==="bn"?"🏷️ বারকোড লেবেল":"🏷️ Barcode Labels",
    reminders: lang==="bn"?"🔔 রিমাইন্ডার":"🔔 Reminders",
    calculator: lang==="bn"?"🧮 ক্যালকুলেটর / মুদ্রা":"🧮 Calculator / Currency",
  };
  const returnTabLabels = {
    salesReturn: lang==="bn"?"↩️ সেলস রিটার্ন":"↩️ Sales Return",
    purchaseReturn: lang==="bn"?"↪️ পারচেজ রিটার্ন":"↪️ Purchase Return",
    stockAdjust: lang==="bn"?"⚖️ স্টক সমন্বয়":"⚖️ Stock Adjustment",
    loosen: lang==="bn"?"📦 পণ্য খোলা (Loosening)":"📦 Product Loosening",
    bundle: lang==="bn"?"🧰 পণ্য জোড়া / কিট":"🧰 Product Bundling",
    auditLog: lang==="bn"?"🕵️ অডিট লগ":"🕵️ Audit Log",
  };

  const visibleTabs = useMemo(() => (isOwner
    ? [["dashboard",t.tabDashboard],...(orderModuleEnabled?[["owner",t.tabOwner]]:[]),["products",t.tabProducts],["purchaseOrder",newTabLabels.purchaseOrder],["goodsReceipt",newTabLabels.goodsReceipt],["purchase",t.tabPurchase],["sales",t.tabSales],["quotation",t.tabQuotation],["salesOrder",newTabLabels.salesOrder],["delivery",t.tabDelivery],["jobCard",newTabLabels.jobCard],["vendors",t.tabVendor],["customers",t.tabCustomer],["cheque",t.tabCheque],["pdc",lang==="bn"?"📃 PDC চেক":"📃 PDC Cheques"],["expenses",lang==="bn"?"💸 খরচ":"💸 Expenses"],["employees",newTabLabels.employees],["employeeExpense",newTabLabels.employeeExpense],["attendance",newTabLabels.attendance],["vouchers",lang==="bn"?"🧾 ভাউচার":"🧾 Vouchers"],["salesReturn",returnTabLabels.salesReturn],["purchaseReturn",returnTabLabels.purchaseReturn],["stockAdjust",returnTabLabels.stockAdjust],["loosen",returnTabLabels.loosen],["bundle",returnTabLabels.bundle],["accounts",lang==="bn"?"📊 হিসাব নিকাশ":"📊 Accounts"],["bankRec",newTabLabels.bankRec],["partners",newTabLabels.partners],["tax",lang==="bn"?"🏛️ ট্যাক্স / VAT":"🏛️ Tax / VAT"],["auditLog",returnTabLabels.auditLog],...(canUseBranchTransfer?[["branchTransfer",branchTransferMenuLabel(lang, btInbox.length)]]:[]),["labels",newTabLabels.labels],["reminders",newTabLabels.reminders],["calculator",newTabLabels.calculator],["settings",t.tabSettings]]
    : [
        ["dashboard",t.tabDashboard],
        ...(orderModuleEnabled?[["shop",t.tabShop]]:[]),
        ...(can("viewProducts")?[["products",t.tabProducts]]:[]),
        ...(can("manageSales")?[["sales", t.tabSales],["quotation", t.tabQuotation],["salesOrder", newTabLabels.salesOrder],["delivery", t.tabDelivery]]:[]),
        ...(can("managePurchase")?[["purchaseOrder",newTabLabels.purchaseOrder],["goodsReceipt",newTabLabels.goodsReceipt]]:[]),
        ["purchase", canStaffSupplierArea ? t.tabPurchase : (lang==="bn"?"📦 ক্রয় তথ্য":"📦 Purchase Info")],
        ...(can("viewVendors")||can("manageVendors")?[["vendors",t.tabVendor]]:[]),
        ...(can("printCheques")?[["cheque",t.tabCheque]]:[]),
        ...(can("managePdc")?[["pdc",lang==="bn"?"📃 PDC চেক":"📃 PDC Cheques"]]:[]),
        ...(can("manageExpenses")?[["expenses",lang==="bn"?"💸 খরচ":"💸 Expenses"],["employeeExpense",newTabLabels.employeeExpense]]:[]),
        ...(can("manageEmployees")?[["employees",newTabLabels.employees],["attendance",newTabLabels.attendance]]:[]),
        ...(can("bankReconcile")?[["bankRec",newTabLabels.bankRec]]:[]),
        ...(can("manageJobs")?[["jobCard",newTabLabels.jobCard]]:[]),
        ...(canStaffVouchers?[["vouchers",lang==="bn"?"🧾 ভাউচার":"🧾 Vouchers"]]:[]),
        ...(can("manageReturns")?[["salesReturn",returnTabLabels.salesReturn],["purchaseReturn",returnTabLabels.purchaseReturn]]:[]),
        ...(can("stockAdjust")?[["stockAdjust",returnTabLabels.stockAdjust],["loosen",returnTabLabels.loosen],["bundle",returnTabLabels.bundle]]:[]),
        ...(canUseBranchTransfer?[["branchTransfer",branchTransferMenuLabel(lang, btInbox.length)]]:[]),
        ...(can("viewProducts")?[["labels",newTabLabels.labels]]:[]),
        ["reminders",newTabLabels.reminders],
        ["calculator",newTabLabels.calculator],
        ["settings",t.tabSettings],
      ]), [isOwner, orderModuleEnabled, t, newTabLabels, returnTabLabels, lang, canUseBranchTransfer, btInbox.length, canStaffSupplierArea, canStaffVouchers]);
  const validTabs = visibleTabs;

  // Safety: if any old/invalid tab is active after new menu changes, always return to Dashboard.
  useEffect(() => {
    if (!validTabs.some(([k]) => k === tab)) setTabState("dashboard");
  }, [tab, validTabs]);

  const myStartTab = (team.find(m=>(m.uid||m.id)===user?.uid)?.defaults || profile?.defaults || {}).startTab || "";
  const startTabDoneRef = useRef(false);
  const mountedAtRef = useRef(Date.now());
  useEffect(() => {
    if (startTabDoneRef.current || !myStartTab) return;
    if (!validTabs.some(([k]) => k === myStartTab)) return;
    startTabDoneRef.current = true;
    if (tab==="dashboard" && Date.now()-mountedAtRef.current < 20000 && START_TABS.some(([k]) => k === myStartTab)) setTab(myStartTab);
  }, [myStartTab, validTabs]); // eslint-disable-line react-hooks/exhaustive-deps

  const tabLabelOf = (k) => (validTabs.find(([key]) => key === k) || [])[1] || k;
  const currentTabLabel = tabLabelOf(tab);
  useEscapeKey(() => {
    if (settingsPage) setSettingsPage(null);
    else if (tab !== "dashboard") setTab("dashboard");
  }, { enabled: isDesktop && (tab !== "dashboard" || !!settingsPage), level: 0 });
  useEscapeKey(() => { if (!orderReceiveSaving) setOrderReceive(null); }, { enabled: !!orderReceive, level: 3 });

  // ── ORDER STATUS FLOW (overall) ──
  const setOrderStatus = async (oId, newStatus) => {
    if (!isOwner&&!can("setStatus")) return;
    const order = orders.find(o=>o.id===oId); if (!order) return;
    if (order.overall==="cancelled") return;
    const hasRecheckableItems = order.items.some(it=>it.status==="order_confirmed"||it.status==="pending");
    if (order.overall==="delivered" && !hasRecheckableItems) return;
    if (newStatus==="ordered_supplier") {
      const activeItems = order.items.filter(it =>
        it.status!=="out_of_stock" && it.status!=="cancelled" && it.status!=="delivered"
      );
      const missingCo = activeItems.some(it => !it.co);
      if (missingCo) return toast(
        lang==="bn"
          ? "❌ সব আইটেমে কোম্পানি সিলেক্ট করুন, তারপর এগিয়ে যান"
          : "❌ Select a company for every item before ordering supplier",
        "err"
      );
      const missingPrice = activeItems.some(it => !String(it.price||"").trim());
      if (missingPrice) return toast(
        lang==="bn"
          ? "❌ সব আইটেমের দাম সেট করুন, তারপর এগিয়ে যান"
          : "❌ Set price for all items before ordering supplier",
        "err"
      );
    }
    const updatable = new Set(["order_confirmed","ordered_supplier","waiting_delivery","arrived_main_shop","out_for_branch"]);
    const newItems = updatable.has(newStatus)
      ? order.items.map(it =>
          (it.status==="out_of_stock"||it.status==="delivered"||it.status==="cancelled")
            ? it
            : { ...it, status:newStatus }
        )
      : order.items;
    try { await patchOrderOffline(oId, {overall:newStatus,items:newItems}); }
    catch(e) { hErr(e); }
  };
  return { canStaffSupplierArea, canStaffVouchers, closeMenu, currentTabLabel, filterOrders, filterOrdersByStatusPage, goBack, groupByDay, makeShopNo, notificationItems, renderOrderPageTabs, selectFromMenu, setOrderStatus, stPage, staffQuickNavKeys, tabLabelOf, unread, visibleTabs };
}
