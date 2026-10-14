import { DEFAULT_PERMISSIONS, PI_PREFIX, applyInvoiceStockEffect, billLeaveGuard, deviceSerialTag, nsq, reserveShopSerial, unlinkedStockOk } from "../shared/appShared.jsx";
import { ORDER_PREFIX, newItem, pushOrdersNow } from "../app/mainAppHelpers.js";
import { auth, friendlyAuthError } from "../firebase-config";
import { createShopStaffUser, mergeTeamMembers, removeShopTeamMember, resetShopMemberPassword, updateShopMemberPermissions, updateShopMemberPosition } from "../auth/userManagementService";
import { friendlyLocalAuthError } from "../auth/localAuthBootstrap";
import { groupPermissions } from "../team/permissionMatrix.js";
import { isAcceptablePassword } from "../auth/passwordRules.js";
import { localIsoDate } from "../utils/localIsoDate.js";
import { offlineCreate, offlineList, offlinePatch, offlineRemove, offlineUpdate } from "../offline/offlineRepository";
import { saveShopRecord } from "../offline/shopService";
import { signOut } from "../backend/auth";
import { unitFactorFor } from "../inventory/unitConversion";
import { useEffect } from "react";
import { backupBeforeExit } from "../backup/backupOnExit.js";

export function useOrderTeamActions({ can, cos, currentItem, editNm, editPh, editingOrderId, hErr, isOwner, isSalesman, items, lang, localShop, mergeShopRecord, nameRef, newNm, newPh, note, onLogout, orderEditBaselineRef, orderReceive, orderReceiveSaving, orders, priceEditorInputRef, priceEditorTarget, priceEditorValue, products, profile, rebuildTeam, selOrder, setCopyState, setCos, setCurrentItem, setEditId, setEditNm, setEditPh, setEditingOrderId, setItems, setLocalShop, setNewNm, setNewPh, setNote, setOrderReceive, setOrderReceiveSaving, setOrders, setPriceEditorTarget, setPriceEditorValue, setSelOrder, setShowAdd, setStaffForm, setStaffPwReset, setStaffSaving, setSupplierPickerQuery, setSupplierPickerTarget, setTeam, shopId, staffForm, staffPwReset, supplierPickerInputRef, supplierPickerTarget, t, teamPermissionOverridesRef, toast, user, userGroups, vendors, waStyle }) {
  const selectProductToOrder = (prod) => {
    setCurrentItem(p=>({...p, name:prod.name, code:prod.code||prod.barcode||"", brand:prod.brand||"", unit:prod.unit||"Pcs"}));
  };

  // ── INVOICE ITEM FUNCTIONS ──
  const updCurrentItem = (field, val) => {
    const value = (field==="name" && typeof val==="string" && val.length>0)
      ? (val.charAt(0).toUpperCase()+val.slice(1))
      : val;
    setCurrentItem(p=>({...p,[field]:value}));
  };

  const addItToInvoice = () => {
    if (!currentItem.name.trim()) return toast(t.noItemName,"err");
    if (!currentItem.qty.toString().trim()) return toast(t.noQty,"err");
    setItems(p=>[...p, { ...currentItem, id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}` }]);
    setCurrentItem(newItem());
    // Auto-focus the name field for fast entry
    setTimeout(()=>{ nameRef.current?.focus(); },50);
  };

  const delIt = (id) => setItems(p=>p.filter(it=>it.id!==id));

  const handleEnterAdd = (e) => {
    if (e.key === "Enter") { e.preventDefault(); addItToInvoice(); }
  };

  // ✅ নতুন কোড
const startEditOrder = (order) => {
  setItems(order.items.map(it=>({
    id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`, // ← এটা যোগ করুন
    name:it.name, code:it.code||"", brand:it.brand||"",
    qty:it.qty||"", unit:it.unit||"Pcs"
  })));
  setNote(order.note||"");
  orderEditBaselineRef.current = JSON.stringify({
    items: (order.items || []).map((it) => ({ name: it.name, code: it.code || "", brand: it.brand || "", qty: it.qty || "", unit: it.unit || "Pcs" })),
    note: order.note || "",
  });
  setEditingOrderId(order.id);
  setSelOrder(null);
  window.scrollTo({top:0,behavior:"smooth"});
};

  const cancelEditOrder = () => {
    setEditingOrderId(null);
    orderEditBaselineRef.current = "";
    setItems([]);
    setCurrentItem(newItem());
    setNote("");
  };

  useEffect(() => {
    if (!editingOrderId) return undefined;
    const snapshot = () => JSON.stringify({
      items: items.map((it) => ({ name: it.name, code: it.code || "", brand: it.brand || "", qty: it.qty || "", unit: it.unit || "Pcs" })),
      note: note || "",
    });
    const guard = {
      leave: () => snapshot() === orderEditBaselineRef.current || window.confirm(lang === "bn" ? "সেভ না করা অর্ডার পরিবর্তন আছে। চলে যাবেন?" : "You have unsaved order changes. Leave anyway?"),
      back: () => { cancelEditOrder(); return true; },
    };
    billLeaveGuard.current = guard;
    return () => { if (billLeaveGuard.current === guard) billLeaveGuard.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingOrderId, items, note, lang]);

  const sendOrder = async () => {
    const valid = items.filter(it=>it.name.trim());
    if (!valid.length) return toast(t.e1,"err");
    if (!isOwner && !can("sendOrder")) {
      toast(lang==="bn" ? "অর্ডার পাঠানোর অনুমতি নেই" : "You are not allowed to send orders", "err");
      return;
    }
    // ── EDIT MODE: update existing order ──
    if (editingOrderId) {
      try {
        const existing = orders.find(o => o.id === editingOrderId) || {};
        if (!isOwner && existing.createdBy && existing.createdBy !== user?.uid) {
          toast(lang==="bn" ? "শুধু অর্ডারকারী বা মালিক এডিট করতে পারেন" : "Only the order creator or owner can edit", "err");
          return;
        }
        const nowIso = new Date().toISOString();

        const patch = {
          items: valid.map((it, idx) => {
            const prev = (existing.items || [])[idx] || {};
            return {
              name: it.name,
              code: it.code || "",
              brand: it.brand || "",
              qty: it.qty || "",
              unit: it.unit || "Pcs",
              price: prev.price ?? it.price ?? "",
              status: prev.status ?? it.status ?? "pending",
              co: prev.co ?? it.co ?? null,
            };
          }),
          note: note || "",
          updatedAt: nowIso,
          updatedBy: user?.uid || "",
        };

        const result = await offlinePatch("orders", editingOrderId, patch, existing);
        const updated = { ...result.data, id: editingOrderId };

        setOrders(prev => prev.map(o => o.id === editingOrderId ? updated : o));

        setEditingOrderId(null);
        orderEditBaselineRef.current = "";
        setItems([]);
        setCurrentItem(newItem());
        setNote("");
        toast(lang==="bn"?"✅ অর্ডার আপডেট হয়েছে!":"✅ Order updated!");

        if (navigator.onLine) {
          pushOrdersNow();
        }
      } catch(e){ hErr(e); }
      return;
    }
    try {
      const now = new Date();
      const nowIso = now.toISOString();

      const localSerial = Date.now();
      const orderNo = `${ORDER_PREFIX}${String(localSerial).slice(-6)}`;

      const payload = {
        shopId,
        createdBy: user.uid,
        createdByName: profile.personName,
        serialNo: localSerial,
        orderNo,
        items: valid.map(it=>({name:it.name,code:it.code||"",brand:it.brand||"",qty:it.qty||"",unit:it.unit||"Pcs",price:"",status:"pending",co:null})),
        note: note || "",
        createdAt: now,
        createdAtIso: nowIso,
        overall: "pending",
        read: false,
      };

      const result = await offlineCreate("orders", payload);
      const created = { ...result.data, id: result.documentId };

      setOrders(prev => [created, ...prev.filter(o => o.id !== created.id)]);
      setItems([]);
      setCurrentItem(newItem());
      setNote("");
      toast(t.n1);

      if (navigator.onLine) {
        pushOrdersNow();
      }
    } catch(e) { hErr(e); }
  };

  const patchOrderOffline = async (oId, patch, successMessage = null) => {
    const existing = orders.find(o => o.id === oId) || {};
    const nowIso = new Date().toISOString();
    const syncPatch = { ...patch, updatedAt: nowIso, updatedBy: user?.uid || "" };

    const result = await offlinePatch("orders", oId, syncPatch, existing);
    const updated = { ...result.data, id: oId };

    setOrders(prev => prev.map(o => o.id === oId ? updated : o));

    if (successMessage) toast(successMessage);

    if (navigator.onLine) {
      pushOrdersNow();
    }

    return updated;
  };

  // Order line → purchase line, linked to the product master by code (+ brand when several share the code) so it adds stock.
  const buildOrderPurchaseLine = (item, qty, unitCost) => {
    const codeKey = nsq(item.code);
    const brandKey = String(item.brand || "").trim().toLowerCase();
    const byCode = codeKey ? (products || []).filter(p => !p.isDeleted && [p.code, p.barcode, p.ean].some(c => c && nsq(c) === codeKey)) : [];
    const byBrand = byCode.length > 1 && brandKey ? byCode.filter(p => String(p.brand || "").trim().toLowerCase() === brandKey) : byCode;
    const linked = item.productId ? (products || []).find(p => p.id === item.productId) : (byBrand.length === 1 ? byBrand[0] : null);
    return {
      productId:linked?.id || item.productId || null,
      unitFactor:linked ? unitFactorFor(linked, item.unit || "Pcs") : 1,
      name:String(item.name || "").trim(),
      code:String(item.code || "").trim(),
      brand:String(item.brand || "").trim(),
      qty,
      unit:item.unit || "Pcs",
      unitCost,
      discountPerc:0,
      discountAmt:0,
      taxPerc:0,
      taxAmt:0,
      lineTotal:Number((qty * unitCost).toFixed(2)),
      salePrice:null,
    };
  };

  const reserveOrderPurchaseNo = async () => {
    const rows = await offlineList("purchaseInvoices");
    const localMax = (rows.records || []).reduce((mx, r) => {
      const inv = r.data || {};
      if (inv.shopId !== shopId) return mx;
      const m = String(inv.invoiceNo || "").match(/PI-?(\d+)(?:-[A-Z]{2})?$/i);
      return m ? Math.max(mx, Number(m[1])) : mx;
    }, Number(localShop?.lastPISerial || 0));
    const serial = await reserveShopSerial(shopId, "lastPISerial", localMax);
    const fmt = (n) => `${PI_PREFIX}${String(n).padStart(4, "0")}`;
    if (serial) return fmt(serial);
    return isOwner ? fmt(localMax + 1) : `${fmt(localMax + 1)}-${deviceSerialTag()}`;
  };

  const savePrice = async (oId, iIdx, directVal) => {
    if (!isOwner&&!can("setPrices")) return;
    const order = orders.find(o=>o.id===oId); if (!order) return;
    const current = order.items[iIdx];
    if (!current || current.status==="delivered" || current.status==="cancelled") return;
    const upd = order.items.map((it,x)=>x===iIdx?{...it,price:String(directVal??"")}:it);
    try { await patchOrderOffline(oId, {items:upd}, t.n2); } catch(e) { hErr(e); }
  };

  const setItemStatus = async (oId,iIdx,status) => {
    if (!isOwner&&!can("setStatus")) return;
    const order = orders.find(o=>o.id===oId); if (!order) return;
    if (order.overall==="cancelled") return;
    const current = order.items[iIdx];
    if (!current || current.status==="delivered"||current.status==="cancelled") return;
    const isRecheck = current.status==="out_of_stock" && status==="order_confirmed";
    const isEditableItemState = ["pending","order_confirmed","out_of_stock"].includes(current.status);
    if (!isRecheck && !isEditableItemState) return;
    const upd = order.items.map((it,x)=>x===iIdx?{...it,status}:it);
    let newOverall = order.overall;
    if (isRecheck && order.overall!=="cancelled") newOverall = "order_confirmed";
    try { await patchOrderOffline(oId, {overall:newOverall,items:upd}); } catch(e) { hErr(e); }
  };

  // Goods arrived at the shop: the supplier's bill is entered here and becomes a normal purchase invoice.
  const deliverItem = (oId,iIdx) => {
    if (!isSalesman&&!can("markDelivery")) return;
    const order = orders.find(o=>o.id===oId); if (!order) return;
    if (isSalesman&&!can("markDelivery")&&order.createdBy!==user.uid) return;
    const target = order.items[iIdx];
    if (!target || target.status!=="out_for_branch") return;
    const supplierKey = target.co || "";
    const supplier = findOrderSupplier(supplierKey);
    setOrderReceive({
      orderId:oId,
      supplierKey,
      vendorName:supplier?.name || "",
      vendorMobile:supplier?.phone || "",
      supplierInvoiceNo:"",
      invoiceDate:localIsoDate(),
      paymentMethod:"credit",
      lines:order.items
        .map((it,x)=>({ iIdx:x, it }))
        .filter(({ it, iIdx:x }) => it.status==="out_for_branch" && (x===iIdx || (it.co||"")===supplierKey))
        .map(({ it, iIdx:x }) => ({ iIdx:x, checked:true, qty:String(it.qty ?? ""), unitCost:String(it.price ?? "") })),
    });
  };

  const saveOrderReceive = async () => {
    const rc = orderReceive; if (!rc || orderReceiveSaving) return;
    const order = orders.find(o=>o.id===rc.orderId); if (!order) { setOrderReceive(null); return; }
    const bn = lang==="bn";
    if (!rc.vendorName.trim()) { toast(bn?"❌ Vendor-এর নাম দিন":"❌ Enter the vendor name","err"); return; }
    if (!rc.supplierInvoiceNo.trim()) { toast(bn?"❌ সাপ্লায়ারের Invoice No দিন":"❌ Enter the supplier's invoice no","err"); return; }
    const picked = rc.lines.filter(l => l.checked && order.items[l.iIdx]?.status==="out_for_branch");
    if (!picked.length) { toast(bn?"❌ অন্তত একটা আইটেম বেছে নিন":"❌ Select at least one item","err"); return; }
    for (const l of picked) {
      const it = order.items[l.iIdx];
      if (!(Number(l.qty) > 0)) { toast(bn?`❌ "${it.name}": Qty দিন`:`❌ "${it.name}": enter the qty`,"err"); return; }
      if (Number(l.unitCost) < 0 || l.unitCost==="" || !Number.isFinite(Number(l.unitCost))) { toast(bn?`❌ "${it.name}": দাম দিন`:`❌ "${it.name}": enter the cost`,"err"); return; }
    }
    const builtItems = picked.map(l => buildOrderPurchaseLine(order.items[l.iIdx], Number(l.qty), Number(l.unitCost)));
    if (!unlinkedStockOk(builtItems, lang)) return;

    setOrderReceiveSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const orderNo = getOrderDisplayNo(order);
      const grandTotal = Number(builtItems.reduce((sum, it) => sum + (Number(it.lineTotal) || 0), 0).toFixed(2));
      const cash = rc.paymentMethod === "cash";
      const vendorRec = String(rc.supplierKey).startsWith("vendor:") ? vendors.find(v => v.id === String(rc.supplierKey).slice(7)) : null;
      const creditDays = Math.max(0, Math.round(Number(vendorRec?.paymentTerms) || 0));
      let dueDate = "";
      if (!cash && creditDays > 0) {
        const d = new Date(`${rc.invoiceDate || localIsoDate()}T00:00:00`);
        d.setDate(d.getDate() + creditDays);
        dueDate = localIsoDate(d);
      }
      const invoiceNo = await reserveOrderPurchaseNo();
      const payload = {
        shopId,
        invoiceNo,
        supplierInvoiceNo:rc.supplierInvoiceNo.trim(),
        invoiceDate:rc.invoiceDate || localIsoDate(),
        vendorId:String(rc.supplierKey).startsWith("vendor:") ? String(rc.supplierKey).slice(7) : null,
        vendorName:rc.vendorName.trim(),
        vendorMobile:rc.vendorMobile.trim(),
        items:builtItems,
        subtotal:grandTotal,
        totalDiscount:0,
        totalTax:0,
        grandTotal,
        paymentMethod:cash ? "cash" : "credit",
        amountPaid:cash ? grandTotal : 0,
        balanceDue:cash ? 0 : grandTotal,
        status:(cash || grandTotal <= 0) ? "paid" : "confirmed",
        note:`Order ${orderNo}`,
        dueDate,
        creditDays:dueDate ? creditDays : 0,
        source:"salesmanOrder",
        sourceOrderId:order.id,
        sourceOrderNo:orderNo,
        sourceSupplierKey:rc.supplierKey || "manual",
        createdBy:user.uid,
        createdByName:profile.personName,
        createdAt:nowIso,
        updatedAt:nowIso,
      };
      const result = await offlineCreate("purchaseInvoices", payload);
      const invoiceId = result.documentId || result.id;
      await applyInvoiceStockEffect({
        oldInvoice:null,
        newInvoice:payload,
        invoiceId,
        applyType:"purchase",
        reverseType:"adjustment",
        referenceType:"purchase_invoice",
        unitCostKey:"unitCost",
        shopId,
        actor:{ uid:user?.uid, personName:profile?.personName },
      });

      const byIdx = new Map(picked.map(l => [l.iIdx, l]));
      const upd = order.items.map((it,x) => {
        const l = byIdx.get(x);
        return l ? { ...it, status:"delivered", qty:String(l.qty), price:String(l.unitCost), purchaseInvoiceId:invoiceId, purchaseInvoiceNo:invoiceNo, supplierInvoiceNo:payload.supplierInvoiceNo } : it;
      });
      const activeItems = upd.filter(it=>it.status!=="cancelled" && it.status!=="out_of_stock");
      const allDelivered = activeItems.length>0 && activeItems.every(it=>it.status==="delivered");
      await patchOrderOffline(order.id, {
        overall:allDelivered ? "delivered" : order.overall,
        items:upd,
        purchaseInvoiceIds:[...new Set([...(order.purchaseInvoiceIds || []), invoiceId])],
        purchaseInvoiceCreated:allDelivered,
      }, bn ? `✅ ডেলিভারি হয়েছে — Purchase ${invoiceNo} তৈরি হয়েছে` : `✅ Delivered — purchase ${invoiceNo} created`);
      setOrderReceive(null);
    } catch(e) { hErr(e); }
    finally { setOrderReceiveSaving(false); }
  };

  const delOrder = async (oId) => {
    if (!can("deleteOrder")) return;
    if (!window.confirm(t.delConfirm)) return;

    try {
      await offlineRemove("orders", oId);

      setOrders(prev => prev.filter(o => o.id !== oId));
      if (selOrder===oId) setSelOrder(null);
      toast(t.n7,"err");

      if (navigator.onLine) {
        window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] order delete sync failed", err));
      }
    } catch(e) { hErr(e); }
  };

  const cancelOrder = async (oId) => {
    if (!window.confirm(lang==="bn"?"এই অর্ডারটি বাতিল করবেন?":"Cancel this order?")) return;
    const order = orders.find(o=>o.id===oId); if (!order) return;
    if (!isOwner && order.createdBy && order.createdBy !== user?.uid) {
      toast(lang==="bn" ? "শুধু অর্ডারকারী বা মালিক বাতিল করতে পারেন" : "Only the order creator or owner can cancel", "err");
      return;
    }
    const cancelledItems = order.items.map(it=>({...it, status:"cancelled"}));
    try {
      await patchOrderOffline(oId, { overall:"cancelled", items:cancelledItems });
      toast(t.n8,"err");
    } catch(e) { hErr(e); }
  };

  const setCo = async (oId,iIdx,coId) => {
    if (!isOwner&&!can("manageCompanies")) return;
    const order = orders.find(o=>o.id===oId); if (!order) return;
    const current = order.items[iIdx];
    if (!current || current.status==="delivered" || current.status==="cancelled") return;
    const selectedSupplier = findOrderSupplier(coId);
    const upd = order.items.map((it,x)=>x===iIdx?{
      ...it,
      co:coId||null,
      supplierPhone: selectedSupplier?.phone ? "" : (coId ? (it.supplierPhone || "") : ""),
    }:it);
    try { await patchOrderOffline(oId, {items:upd}); } catch(e) { hErr(e); }
  };

  const saveSupplierPhone = async (oId,iIdx,phone) => {
    if (!isOwner&&!can("manageCompanies")) return;
    const order = orders.find(o=>o.id===oId); if (!order) return;
    const current = order.items[iIdx];
    if (!current || current.status==="delivered" || current.status==="cancelled") return;
    if (!["pending","order_confirmed","out_of_stock"].includes(current.status)) return;
    const cleanPhone = String(phone || "").replace(/[^0-9]/g, "");
    const upd = order.items.map((it,x)=>x===iIdx?{...it,supplierPhone:cleanPhone}:it);
    try { await patchOrderOffline(oId, {items:upd}); } catch(e) { hErr(e); }
  };

  const markRead = async (oId) => {
    const order = orders.find(o=>o.id===oId); if (!order||order.read) return;
    try { await patchOrderOffline(oId, {read:true}); } catch(e) { console.error(e); }
  };

  const startEdit = (c) => { setEditId(c.id); setEditNm(c.name); setEditPh(c.phone||""); };
  const cancelEdit = () => { setEditId(null); setEditNm(""); setEditPh(""); };

  const saveEdit = async (id) => {
    if (!editNm.trim()) return toast(t.e2,"err");

    const now = new Date().toISOString();

    const payload = {
      shopId,
      name: editNm.trim(),
      phone: editPh.trim(),
      updatedBy: user?.uid || "",
      updatedAt: now,
    };

    try {
      const result = await offlineUpdate("companies", id, payload);
      const updated = { ...result.data, id };

      setCos(prev =>
        prev
          .map(c => c.id === id ? updated : c)
          .sort((a,b)=>(a.name||"").localeCompare(b.name||""))
      );

      cancelEdit();
      toast(t.n5);

      if (navigator.onLine) {
        window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] company update sync failed", err));
      }
    } catch(e) {
      hErr(e);
    }
  };

  const delCo = async (id) => {
    try {
      await offlineRemove("companies", id);

      setCos(prev => prev.filter(c => c.id !== id));
      toast(t.n6,"err");

      if (navigator.onLine) {
        window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] company delete sync failed", err));
      }
    } catch(e) {
      hErr(e);
    }
  };

  const addCo = async () => {
    if (!newNm.trim()) return toast(t.e3,"err");

    const now = new Date().toISOString();

    const payload = {
      shopId,
      name: newNm.trim(),
      phone: newPh.trim(),
      createdBy: user?.uid || "",
      createdAt: now,
      updatedAt: now,
    };

    try {
      const result = await offlineCreate("companies", payload);
      const created = { ...result.data, id: result.documentId };

      setCos(prev =>
        [created, ...prev.filter(c => c.id !== created.id)]
          .sort((a,b)=>(a.name||"").localeCompare(b.name||""))
      );

      setNewNm("");
      setNewPh("");
      setShowAdd(false);
      toast(t.n4);

      if (navigator.onLine) {
        window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] company sync failed", err));
      }
    } catch(e) {
      hErr(e);
    }
  };



  const savePermissions = async (member, newPerms) => {
    const memberId = member.uid || member.id;
    teamPermissionOverridesRef.current[memberId] = newPerms;
    setTeam((prev) => prev.map((m) => ((m.uid || m.id) === memberId ? { ...m, permissions: newPerms } : m)));
    try {
      await updateShopMemberPermissions(memberId, {
        permissions: newPerms,
        position: member.position,
        localUserId: member.localUserId,
        memberRecord: { ...member, permissions: newPerms, shopId },
      });
      toast(t.permSaved);
    } catch(e) {
      delete teamPermissionOverridesRef.current[memberId];
      rebuildTeam();
      hErr(e);
    }
  };

  const saveUserGroups = async (next) => {
    const updated = await saveShopRecord(shopId, { userGroups: next }, { ownerUid: user?.uid, profile, user });
    setLocalShop(prev=>mergeShopRecord(prev, updated || { userGroups: next }));
  };

  const saveMemberDefaults = async (member, defaults) => {
    const memberId = member.uid || member.id;
    try {
      await updateShopMemberPermissions(memberId, {
        localUserId: member.localUserId,
        memberRecord: { ...member, defaults, shopId },
        extra: { defaults },
      });
      setTeam((prev) => prev.map((m) => ((m.uid || m.id) === memberId ? { ...m, defaults } : m)));
      toast(lang==="bn"?"✅ ডিফল্ট সেভ হয়েছে — পরের নতুন বিল থেকে কাজ করবে":"✅ Defaults saved — used from the next new bill");
    } catch(e) { hErr(e); }
  };

  const applyGroupToMember = async (member, group, { notify = false } = {}) => {
    const memberId = member.uid || member.id;
    const newPerms = group ? groupPermissions(group, DEFAULT_PERMISSIONS) : { ...DEFAULT_PERMISSIONS, ...(member.permissions || {}) };
    const groupId = group?.id || "";
    teamPermissionOverridesRef.current[memberId] = newPerms;
    setTeam((prev) => prev.map((m) => ((m.uid || m.id) === memberId ? { ...m, permissions: newPerms, groupId } : m)));
    try {
      await updateShopMemberPermissions(memberId, {
        permissions: newPerms,
        position: member.position,
        localUserId: member.localUserId,
        memberRecord: { ...member, permissions: newPerms, groupId, shopId },
        extra: { groupId },
      });
      if (notify) toast(t.permSaved);
    } catch(e) {
      delete teamPermissionOverridesRef.current[memberId];
      rebuildTeam();
      if (notify) hErr(e); else throw e;
    }
  };

  const saveMemberPosition = async (member, position) => {
    const memberId = member.uid || member.id;
    try {
      await updateShopMemberPosition(memberId, position, member.localUserId);
      setTeam((prev) => prev.map((m) => ((m.uid || m.id) === memberId ? { ...m, position } : m)));
      toast(t.permSaved);
    } catch(e) { hErr(e); }
  };

  const createStaffMember = async () => {
    if (!staffForm.username.trim() || !staffForm.password || !staffForm.personName.trim()) {
      return toast(lang==="bn"?"username, password ও নাম দিন":"Enter username, password and name","err");
    }
    if (!isAcceptablePassword(staffForm.password)) {
      return toast(lang==="bn"?"password-এ অক্ষর ও সংখ্যা মিশিয়ে কমপক্ষে ৬ অক্ষর":"Password needs letters and numbers (min 6)","err");
    }

    setStaffSaving(true);
    try {
      const member = await createShopStaffUser({
        username: staffForm.username.trim(),
        password: staffForm.password,
        personName: staffForm.personName.trim(),
        shopId,
        position: staffForm.position || "Salesman",
        mobile: staffForm.mobile.trim(),
        permissions: { ...DEFAULT_PERMISSIONS },
      });
      setTeam((prev) => mergeTeamMembers(prev, [member]));
      const startGroup = userGroups.find(g=>g.id===staffForm.groupId);
      if (startGroup) {
        try { await applyGroupToMember(member, startGroup); }
        catch(err) { console.warn("[S4 Team] group apply failed", err); }
      }
      setStaffForm({ username:"", password:"", personName:"", mobile:"", position:"Salesman", groupId:staffForm.groupId||"" });
      toast(
        member.authEmail
          ? (lang==="bn"
            ? `✅ কর্মী যোগ হয়েছে। অন্য device-এ username "${member.username}" + password দিয়ে login করুন (প্রথমবার internet লাগবে)`
            : `✅ Staff added. On another device login with username "${member.username}" + password (internet needed once)`)
          : t.staffAddedOk
      );
    } catch(e) {
      if (e?.code === "OFFLINE_REQUIRED") {
        toast(friendlyLocalAuthError({ reason: "OFFLINE_REQUIRED" }, lang), "err");
      } else if (e?.code === "auth/email-already-in-use") {
        toast(friendlyAuthError(e, lang), "err");
      } else {
        hErr(e);
      }
    }
    finally { setStaffSaving(false); }
  };

  const resetStaffPassword = async (member) => {
    if (!member.localUserId) {
      return toast(lang==="bn"?"এই সদস্যের local account নেই":"No local account for this member","err");
    }
    const pw = staffPwReset[member.localUserId] || "";
    if (!isAcceptablePassword(pw)) {
      return toast(lang==="bn"?"password-এ অক্ষর ও সংখ্যা মিশিয়ে কমপক্ষে ৬ অক্ষর":"Password needs letters and numbers (min 6)","err");
    }
    try {
      await resetShopMemberPassword(member.localUserId, pw);
      setStaffPwReset((prev) => ({ ...prev, [member.localUserId]: "" }));
      toast(t.resetPwOk);
    } catch(e) { hErr(e); }
  };

  const closeTeamMember = async (member) => {
    const memberId = member.uid || member.id;
    if (!window.confirm(t.confirmRemoveMember)) return;

    try {
      await removeShopTeamMember(member, { ownerUid: user?.uid || profile?.uid || "" });
      setTeam((prev) => prev.filter((m) => (m.uid || m.id) !== memberId));
      toast(t.memberRemovedOk);
    } catch (e) {
      hErr(e);
    }
  };

  const shortId  = (id) => id.slice(-6).toUpperCase();
  const getOrderDisplayNo = (order) => {
    if (order.orderNo) return order.orderNo;
    if (Number.isFinite(order.serialNo)) return `${ORDER_PREFIX}${String(order.serialNo).padStart(4, "0")}`;
    return shortId(order.id);
  };
  // ── WA MESSAGE BUILDER (grouped, style-aware) ──
  const waLinkGroup = (phone, items) => {
    const isBn = lang === "bn";
    const title = isBn ? "*পণ্যের তালিকা:*" : "*Product List:*";
    const footer = isBn
      ? "_দয়া করে দাম ও স্টক জানান।_ 🙏 ধন্যবাদ"
      : "_Please share price and stock availability._ 🙏 Thank you";
    const nums = ["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟"];
    let lines = "";
    items.forEach((it, i) => {
      const name = `*${it.name}*`;
      const meta = [it.code, it.brand, `${it.qty} ${it.unit}`].filter(Boolean).join(" | ");
      if (waStyle==="1") lines += `▪️ ${name} | ${meta}\n`;
      else if (waStyle==="2") lines += `${nums[i]||`${i+1}.`} ${name} | ${meta}\n`;
      else if (waStyle==="3") lines += `🔸 ${name} | ${meta}\n`;
      else if (waStyle==="4") lines += `──────────────\n▪️ ${name}\n   ${meta}\n`;
    });
    if (waStyle==="4") lines += "──────────────";
    const msg = `${title}\n${lines}\n${footer}`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  };

  const supplierPhone = (row = {}) => String(
    row.whatsappNumber || row.mobileNumber || row.phoneNumber || row.phone || row.supplierPhone || ""
  ).replace(/[^0-9]/g, "");

  const orderSupplierOptions = [
    ...vendors
      .filter(v => v?.isDeleted !== true && !["disabled","inactive","blocked"].includes(v?.status))
      .map(v => ({
        id: `vendor:${v.id}`,
        name: v.vendorName || "",
        phone: supplierPhone(v),
        source: lang === "bn" ? "ভেন্ডর" : "Vendor",
      })),
  ].filter(row => row.name.trim());

  // Older orders may still point at an entry of the retired Companies list.
  const findOrderSupplier = (value) => {
    if (!value) return null;
    const vendorRow = orderSupplierOptions.find(row => row.id === value);
    if (vendorRow) return vendorRow;
    const legacy = cos.find(c => c.id === value);
    return legacy ? { id: legacy.id, name: legacy.name || "", phone: supplierPhone(legacy), source: lang === "bn" ? "কোম্পানি" : "Company" } : null;
  };

  const normalizeSupplierSearch = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9\u0980-\u09ff]+/g, "");
  const searchOrderSuppliers = (query) => {
    const clean = normalizeSupplierSearch(query);
    if (!clean) return orderSupplierOptions.slice(0, 80);
    return orderSupplierOptions
      .filter(row => normalizeSupplierSearch(`${row.name} ${row.phone} ${row.source}`).includes(clean))
      .slice(0, 80);
  };

  useEffect(() => {
    if (!supplierPickerTarget) return;
    const timer = setTimeout(() => {
      supplierPickerInputRef.current?.focus?.();
      supplierPickerInputRef.current?.select?.();
    }, 50);
    return () => clearTimeout(timer);
  }, [supplierPickerTarget]);

  const openOrderSupplierPicker = (orderId, itemIndex, selectedSupplier) => {
    setSupplierPickerTarget({ orderId, itemIndex });
    setSupplierPickerQuery(selectedSupplier?.name || "");
  };

  const closeOrderSupplierPicker = () => {
    setSupplierPickerTarget(null);
    setSupplierPickerQuery("");
  };

  const selectOrderSupplierFromPicker = (supplierId) => {
    if (!supplierPickerTarget) return;
    setCo(supplierPickerTarget.orderId, supplierPickerTarget.itemIndex, supplierId);
    closeOrderSupplierPicker();
  };

  useEffect(() => {
    if (!priceEditorTarget) return;
    const timer = setTimeout(() => {
      priceEditorInputRef.current?.focus?.();
      priceEditorInputRef.current?.select?.();
    }, 50);
    return () => clearTimeout(timer);
  }, [priceEditorTarget]);

  const openPriceEditor = (orderId, itemIndex, currentPrice) => {
    setPriceEditorTarget({ orderId, itemIndex });
    setPriceEditorValue(String(currentPrice ?? ""));
  };

  const closePriceEditor = () => {
    setPriceEditorTarget(null);
    setPriceEditorValue("");
  };

  const savePriceEditor = async () => {
    if (!priceEditorTarget) return;
    await savePrice(priceEditorTarget.orderId, priceEditorTarget.itemIndex, priceEditorValue);
    closePriceEditor();
  };

  const handleLogout = async () => {
    if (!window.confirm(t.confirmLogout)) return;
    if (isOwner && shopId && !(await backupBeforeExit({ shopId, lang, toast, action:"logout" }))) return;
    try {
      if (onLogout) await onLogout();
      else await signOut(auth);
    } catch(e) { hErr(e); }
  };

  const copyCode = async () => {
    try { await navigator.clipboard.writeText(localShop.inviteCode); setCopyState(true); setTimeout(()=>setCopyState(false),2000); }
    catch { toast("Copy failed","err"); }
  };
  return { addCo, addItToInvoice, applyGroupToMember, cancelEdit, cancelEditOrder, cancelOrder, closeOrderSupplierPicker, closePriceEditor, closeTeamMember, createStaffMember, delCo, delIt, delOrder, deliverItem, findOrderSupplier, getOrderDisplayNo, handleEnterAdd, handleLogout, markRead, openOrderSupplierPicker, openPriceEditor, patchOrderOffline, resetStaffPassword, saveEdit, saveMemberDefaults, saveMemberPosition, saveOrderReceive, savePermissions, savePriceEditor, saveSupplierPhone, saveUserGroups, searchOrderSuppliers, selectOrderSupplierFromPicker, selectProductToOrder, sendOrder, setCo, setItemStatus, startEdit, startEditOrder, supplierPhone, updCurrentItem, waLinkGroup };
}
