import { OrderSupplierPicker, PriceCell } from "../components/OrderInputs.jsx";
import { SC } from "../app/mainAppHelpers.js";

export function createOrderRenderers({ can, canExpand, cancelOrder, delOrder, deliverItem, findOrderSupplier, getOrderDisplayNo, isDesktop, isOrderManager, isOwner, isSalesman, lang, markRead, openOrderSupplierPicker, openPriceEditor, s, saveSupplierPhone, selOrder, setCo, setItemStatus, setOrderStatus, setPinModal, setSelOrder, startEditOrder, supplierPhone, t, th, user, waLinkGroup }) {
  // ── RENDER ORDER ITEMS (expanded detail view) ──
  const renderOrderItems = (order) => {
    return (
      <>
        {order.items.map((it,iIdx)=>{
          const selectedSupplier = findOrderSupplier(it.co);
          const supplierPhoneForItem = selectedSupplier?.phone || supplierPhone(it);
          const itemLocked = it.status==="delivered" || it.status==="cancelled";
          const canEditProc = !itemLocked;
          return (
            <div key={iIdx} style={s.oiCard}>
              <div style={{ fontSize:13, fontWeight:700, color:th.txtPrimary, marginBottom:6 }}>
                {iIdx+1}. {it.name}
                {it.code&&<span style={{ fontSize:11, color:"#71717a", marginLeft:6 }}>📋 {it.code}</span>}
                {it.brand&&<span style={{ fontSize:11, color:"#71717a", marginLeft:6 }}>🏷️ {it.brand}</span>}
                <span style={{ fontSize:11, color:"#71717a", marginLeft:6 }}>{it.qty} {it.unit}</span>
              </div>
              {it.purchaseInvoiceNo&&(
                <div style={{ fontSize:11, color:"#22c55e", marginBottom:6 }}>
                  🧾 {lang==="bn"?"Purchase":"Purchase"} {it.purchaseInvoiceNo}{it.supplierInvoiceNo?` · ${lang==="bn"?"সাপ্লায়ার বিল":"Supplier bill"} ${it.supplierInvoiceNo}`:""}
                </div>
              )}
              {(isOwner||can("manageCompanies"))&&(
                <div>
                  <OrderSupplierPicker
                    s={s}
                    th={th}
                    selectedSupplier={selectedSupplier}
                    selectedSupplierId={it.co}
                    canEdit={canEditProc}
                    placeholder={lang==="bn"?"ভেন্ডর নাম বা নম্বর দিয়ে খুঁজুন":"Search vendor by name or number"}
                    onClear={()=>setCo(order.id,iIdx,"")}
                    onOpen={()=>openOrderSupplierPicker(order.id,iIdx,selectedSupplier)}
                  />
                  {supplierPhoneForItem&&(
                    <div style={{ fontSize:11, color:"#22c55e", marginTop:4 }}>
                      WhatsApp: +{supplierPhoneForItem}
                    </div>
                  )}
                  {selectedSupplier&&!selectedSupplier.phone&&canEditProc&&(
                    <input
                      style={{ ...s.inp, marginTop:6 }}
                      inputMode="tel"
                      defaultValue={it.supplierPhone || ""}
                      placeholder={lang==="bn"?"WhatsApp নম্বর দিন":"Enter WhatsApp number"}
                      onBlur={e=>saveSupplierPhone(order.id,iIdx,e.target.value)}
                    />
                  )}
                </div>
              )}
              {(isOwner||can("setPrices"))&&(
                <PriceCell
                  initialValue={it.price ?? ""}
                  disabled={!canEditProc}
                  placeholder={t.price}
                  onOpen={() => openPriceEditor(order.id, iIdx, it.price ?? "")}
                />
              )}
              {(isOwner||can("setStatus"))&&(
                <div style={s.sRow}>
                  {it.status==="out_of_stock" && !itemLocked && order.overall!=="cancelled" ? (
                    <button style={{ ...s.stBtn, flex:1, background:"#1d4ed8", color:"#fff", border:"1px solid #1d4ed8" }}
                      onClick={()=>setItemStatus(order.id,iIdx,"order_confirmed")}>
                      🔁 {lang==="bn"?"আবার চেক":"Recheck"}
                    </button>
                  ) : canEditProc && (
                    <>
                      <button style={{ ...s.stBtn, ...(it.status==="order_confirmed"?s.stBtnC:{}) }}
                        onClick={()=>setItemStatus(order.id,iIdx,"order_confirmed")}>{t.confirmed}</button>
                      <button style={{ ...s.stBtn, ...(it.status==="out_of_stock"?s.stBtnN:{}) }}
                        onClick={()=>setItemStatus(order.id,iIdx,"out_of_stock")}>{t.noStock}</button>
                    </>
                  )}
                </div>
              )}
              {(isSalesman&&order.createdBy===user.uid&&it.status==="out_for_branch")&&(
                <div style={{ marginTop:8 }}>
                  <button style={s.delBtn} onClick={()=>deliverItem(order.id,iIdx)}>🚚 {t.deliver}</button>
                </div>
              )}
              {(isSalesman&&can("markDelivery")&&order.createdBy!==user.uid&&it.status==="out_for_branch")&&(
                <div style={{ marginTop:8 }}>
                  <button style={s.delBtn} onClick={()=>deliverItem(order.id,iIdx)}>🚚 {t.deliver}</button>
                </div>
              )}
            </div>
          );
        })}
        {/* ── Grouped WA buttons per company ── */}
        {(isOwner||can("manageCompanies"))&&(()=>{
          const groups = {};
          order.items.forEach(it => {
            if (!it.co || it.status==="cancelled") return;
            const co = findOrderSupplier(it.co);
            const phone = co?.phone || supplierPhone(it);
            if (!co || !phone) return;
            const supplierForMessage = { ...co, phone };
            if (!groups[it.co]) groups[it.co] = { co, items:[] };
            groups[it.co].co = supplierForMessage;
            groups[it.co].items.push(it);
          });
          const entries = Object.values(groups);
          if (!entries.length) return null;
          return (
            <div style={{ marginTop:10, marginBottom:4 }}>
              <div style={{ fontSize:10, color:"#71717a", textTransform:"uppercase", letterSpacing:0, fontWeight:700, marginBottom:6 }}>
                {lang==="bn"?"💬 WhatsApp-এ পাঠান":"💬 Send via WhatsApp"}
              </div>
              {entries.map(({co, items})=>(
                <a key={co.id} href={waLinkGroup(co.phone, items)} target="_blank" rel="noreferrer"
                  style={{ ...s.waBtn, display:"flex", justifyContent:"space-between", marginBottom:7, textDecoration:"none", borderRadius:10 }}>
                  <span>💬 {co.name}</span>
                  <span style={{ opacity:0.8, fontSize:11 }}>{items.length} {lang==="bn"?"টি পণ্য":"items"}</span>
                </a>
              ))}
            </div>
          );
        })()}
        {(isOwner||can("setStatus"))&&order.overall!=="cancelled"&&(
          <div style={{ marginTop:10 }}>
            <div style={{ fontSize:11, color:"#71717a", marginBottom:8, textTransform:"uppercase", letterSpacing:0, fontWeight:700 }}>
              {lang==="bn"?"স্ট্যাটাস আপডেট করুন":"Update Status"}
            </div>
            {order.overall==="pending"&&(
              <button style={{ ...s.flowBtn, background:"#052e16", color:"#22c55e", border:"1px solid #22c55e" }}
                onClick={()=>setOrderStatus(order.id,"order_confirmed")}>
                ✅ {lang==="bn"?"অর্ডার গ্রহণ করুন":"Confirm Order"}
              </button>
            )}
            {order.overall==="order_confirmed"&&(
              <button style={{ ...s.flowBtn, background:"#083344", color:"#06b6d4", border:"1px solid #06b6d4" }}
                onClick={()=>setOrderStatus(order.id,"ordered_supplier")}>
                📦 {lang==="bn"?"কোম্পানিকে জানানো হয়েছে":"Ordered to Supplier"}
              </button>
            )}
            {order.overall==="ordered_supplier"&&(
              <button style={{ ...s.flowBtn, background:"#431407", color:"#f97316", border:"1px solid #f97316" }}
                onClick={()=>setOrderStatus(order.id,"waiting_delivery")}>
                ⏳ {lang==="bn"?"মাল আসার অপেক্ষায়":"Waiting for Delivery"}
              </button>
            )}
            {order.overall==="waiting_delivery"&&(
              <button style={{ ...s.flowBtn, background:"#2e1065", color:"#a855f7", border:"1px solid #a855f7" }}
                onClick={()=>setOrderStatus(order.id,"arrived_main_shop")}>
                🏪 {lang==="bn"?"মেইন শপে এসেছে":"Arrived at Main Shop"}
              </button>
            )}
            {order.overall==="arrived_main_shop"&&(
              <button style={{ ...s.flowBtn, background:"#083344", color:"#06b6d4", border:"1px solid #06b6d4" }}
                onClick={()=>setOrderStatus(order.id,"out_for_branch")}>
                🚚 {lang==="bn"?"ব্রাঞ্চে পাঠানো হচ্ছে":"Out for Branch"}
              </button>
            )}
            {order.overall==="out_for_branch"&&(
              <div style={{ fontSize:12, color:"#71717a", textAlign:"center", padding:"10px 0" }}>
                {lang==="bn"
                  ? "⏳ সেলসম্যান মাল বুঝে পাওয়ার পর ডেলিভারি সম্পন্ন হবে"
                  : "⏳ Waiting for salesman to confirm receipt"}
              </div>
            )}
            {order.overall==="delivered"&&order.items.some(it=>it.status==="order_confirmed")&&(
              <div style={{ background:th.accentDim, border:"1px solid #f97316", borderRadius:10, padding:"10px 12px", marginBottom:6 }}>
                <div style={{ fontSize:12, color:"#f97316", fontWeight:700, marginBottom:8 }}>
                  🔁 {lang==="bn"?"No Stock আইটেম Recheck করা হয়েছে — আবার অর্ডার করুন":"No-stock items rechecked — re-order below"}
                </div>
                <button style={{ ...s.flowBtn, background:"#083344", color:"#06b6d4", border:"1px solid #06b6d4", marginBottom:0 }}
                  onClick={()=>setOrderStatus(order.id,"ordered_supplier")}>
                  📦 {lang==="bn"?"কোম্পানিকে জানানো হয়েছে":"Ordered to Supplier"}
                </button>
              </div>
            )}
          </div>
        )}
        {can("deleteOrder")&&(
          <button style={s.delOrderBtn} onClick={()=>delOrder(order.id)}>🗑️ {t.delOrder}</button>
        )}
      </>
    );
  };

  // ── ORDER CARD ──
  const OrderCard = ({ order, showSenderName }) => {
    const isMyOrder = order.createdBy === user.uid;
    const isCancelled = order.overall === "cancelled";
    const canCancel = (isOwner || isMyOrder) && !isCancelled && order.overall === "pending";
    const orderAge = Date.now() - (order.createdAt instanceof Date ? order.createdAt : new Date(order.createdAt)).getTime();
    const canEditOrder = isSalesman && isMyOrder && order.overall === "pending" && orderAge < 60 * 60 * 1000;
    const canExpandThis = canExpand;
    return (
      <div style={{ ...s.card, cursor:canExpandThis?"pointer":"default", opacity:isCancelled?0.6:1 }}
        onClick={() => { if (!canExpandThis) return; markRead(order.id); setSelOrder(selOrder===order.id?null:order.id); }}>
        <div style={s.oHdr}>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <span style={s.oId}>Order #{getOrderDisplayNo(order)}</span>
            {!order.read&&(isOwner||isOrderManager)&&<span style={s.nBadge}>{t.newTag}</span>}
            {isSalesman&&order.items?.some(it=>it.status==="out_for_branch")&&<span style={s.nBadge}>{t.newTag}</span>}
          </div>
          <div style={{ display:"flex", gap:7, alignItems:"center" }}>
            <span style={{ color:"#6b7280", fontSize:11 }}>{(() => {
  const raw = order.createdAt || order.createdAtIso || Date.now();
  const d = raw?.toDate?.() || (raw instanceof Date ? raw : new Date(raw));
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString();
})()}</span>
            <span style={{ ...s.sBadge, color:SC[order.overall]?.color||"#71717a", background:SC[order.overall]?.bg||"#18181b" }}>{t.status[order.overall]}</span>
          </div>
        </div>
        <div style={{ fontSize:12, color:"#71717a" }}>
          {order.items.length}{t.items}
          {showSenderName&&order.createdByName&&` · 👨‍💼 ${order.createdByName}`}
          {order.note&&` · ${order.note}`}
        </div>
        {order.items.map((it,x)=>(
          <div key={x} style={s.iSum}>
            <div style={{ flex:1, minWidth:120 }}>
              <div style={s.iName}>{it.name}</div>
              {(it.code||it.brand)&&(
                <div style={s.iMeta}>
                  {it.code&&<span>📋 {it.code}</span>}
                  {it.code&&it.brand&&<span> · </span>}
                  {it.brand&&<span>🏷️ {it.brand}</span>}
                </div>
              )}
            </div>
            <span style={s.iQty}>{it.qty} {it.unit}</span>
            {it.price&&<span style={s.iPrice}>{t.cur} {it.price}</span>}
            <span style={{ fontSize:11, fontWeight:700, color:SC[it.status]?.color||SC[order.overall]?.color }}>{t.status[it.status]||t.status[order.overall]}</span>
          </div>
        ))}
        {(canCancel||canEditOrder)&&(
          <div style={{ display:"flex", gap:6, marginTop:8 }}>
            {canEditOrder&&(
              <button
                style={{ ...s.delOrderBtn, flex:1, borderColor:"#1d4ed8", color:"#60a5fa" }}
                onClick={e=>{ e.stopPropagation(); startEditOrder(order); }}>
                ✏️ {lang==="bn"?"অর্ডার এডিট করুন":"Edit Order"}
              </button>
            )}
            {canCancel&&(
              <button
                style={{ ...s.delOrderBtn, flex:1, borderColor:"#713f12", color:"#f59e0b" }}
                onClick={e=>{ e.stopPropagation(); cancelOrder(order.id); }}>
                🚫 {lang==="bn"?"বাতিল করুন":"Cancel Order"}
              </button>
            )}
          </div>
        )}
        {selOrder===order.id&&canExpandThis&&(
          <div
            onClick={e=>e.stopPropagation()}
            onMouseDown={e=>e.stopPropagation()}
            onPointerDown={e=>e.stopPropagation()}
            onTouchStart={e=>e.stopPropagation()}
            style={{ cursor:"default" }}>
            <div style={s.div} />
            {renderOrderItems(order)}
          </div>
        )}
      </div>
    );
  };

  // ── TAB CONTENT ──
  const ownerLockedPanel = (what) => (
    <div style={isDesktop?s.desktopPanel:s.panel}>
      <div style={{ ...s.card, textAlign:"center", padding:"36px 18px" }}>
        <div style={{ fontSize:42, marginBottom:8 }}>🔒</div>
        <div style={{ fontSize:16, fontWeight:800, color:th.txtPrimary, marginBottom:6 }}>{what}</div>
        <div style={{ fontSize:13, color:th.txtMuted, marginBottom:16 }}>{lang==="bn"?"দেখতে মালিকের পিন দিন":"Enter the owner PIN to view"}</div>
        <button onClick={()=>setPinModal("unlock")} style={{ padding:"11px 22px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#2563eb,#1d4ed8)", color:"#fff", fontSize:14, fontWeight:800, cursor:"pointer", fontFamily:"inherit" }}>🔓 {lang==="bn"?"পিন দিয়ে খুলুন":"Unlock with PIN"}</button>
      </div>
    </div>
  );
  return { OrderCard, ownerLockedPanel };
}
