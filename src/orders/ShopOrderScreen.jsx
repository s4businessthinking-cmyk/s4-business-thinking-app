import { ProductTypeaheadInput } from "../components/ProductTypeaheadInput.jsx";

export function ShopOrderScreen({ OrderCard, addItToInvoice, can, cancelEditOrder, currentItem, delIt, editingOrderId, filterOrders, filterOrdersByStatusPage, groupByDay, handleEnterAdd, isDesktop, isOrderManager, items, lang, nameRef, note, orders, products, renderOrderPageTabs, s, searchQ, selectProductToOrder, sendOrder, setNote, setSearchQ, t, th, updCurrentItem }) {
  return (
        <div style={isDesktop?s.desktopPanel:s.panel}>
          {can("sendOrder")&&(
            <>
              <div style={s.secTitle}>{t.newOrder}</div>

              {/* ── ITEM ENTRY FORM ── */}
              <div style={{ ...s.card, border:"1px solid #3f3f46" }}>
                <div style={{ marginBottom:8 }}>
                  <ProductTypeaheadInput
                    products={products}
                    value={currentItem.name}
                    onChange={(value)=>updCurrentItem("name", value)}
                    onSelectProduct={selectProductToOrder}
                    field="name"
                    inputRef={nameRef}
                    placeholder={t.itemName}
                    th={th}
                    lang={lang}
                    onKeyDown={handleEnterAdd}
                    style={{ ...s.inp, fontSize:15, fontWeight:600 }}
                  />
                </div>
                <div style={{ display:"flex", gap:7, marginBottom:8 }}>
                  <ProductTypeaheadInput
                    products={products}
                    value={currentItem.code}
                    onChange={(value)=>updCurrentItem("code", value)}
                    onSelectProduct={selectProductToOrder}
                    field="code"
                    placeholder={lang==="bn"?"Code / Model":"Code / Model"}
                    th={th}
                    lang={lang}
                    onKeyDown={handleEnterAdd}
                    style={{ ...s.inp, flex:1 }}
                  />
                  <input style={{ ...s.inp, flex:1 }} placeholder={t.brand}
                    value={currentItem.brand}
                    onChange={e=>updCurrentItem("brand",e.target.value)}
                    onKeyDown={handleEnterAdd}
                  />
                </div>
                <div style={{ display:"flex", gap:7, marginBottom:10 }}>
                  <input
                    style={{ ...s.inp, flex:2 }}
                    placeholder={t.qty}
                    inputMode="numeric"
                    value={currentItem.qty}
                    onChange={e=>updCurrentItem("qty",e.target.value)}
                    onKeyDown={handleEnterAdd}
                  />
                  <select style={{ ...s.sel, flex:1 }} value={currentItem.unit}
                    onChange={e=>updCurrentItem("unit",e.target.value)}>
                    <option value="Pcs">{t.unitPcs}</option>
                    <option value="Set">{t.unitSet}</option>
                  </select>
                </div>
                <button style={s.addInvoiceBtn} onClick={addItToInvoice}>
                  {t.addItem}
                </button>
              </div>

              {/* ── INVOICE LIST ── */}
              {items.length > 0 && (
                <div style={{ marginTop:14 }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                    <div style={{ ...s.secTitle, margin:0 }}>{t.invoiceList}</div>
                    <span style={{ fontSize:12, color:"#f97316", fontWeight:700, background:th.accentDim, padding:"3px 10px", borderRadius:20 }}>
                      {items.length}{lang==="bn"?"টি":""}
                    </span>
                  </div>
                  <div style={s.invoiceCard}>
                    {/* Header row */}
                    <div style={s.invHeader}>
                      <span style={{ width:22, flexShrink:0 }}>#</span>
                      <span style={{ flex:1 }}>{lang==="bn"?"নাম":"Name"}</span>
                      <span style={{ width:70, textAlign:"center" }}>{lang==="bn"?"কোড":"Code"}</span>
                      <span style={{ width:60, textAlign:"center" }}>{lang==="bn"?"পরিমাণ":"Qty"}</span>
                      <span style={{ width:26, flexShrink:0 }}></span>
                    </div>
                    {/* Item rows */}
                    {items.map((item, idx) => (
                      <div key={item.id} style={s.invRow}>
                        <span style={{ ...s.invSerial, width:22, flexShrink:0 }}>{idx+1}</span>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:700, color:th.txtPrimary, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                            {item.name}
                          </div>
                          {item.brand&&(
                            <div style={{ fontSize:11, color:"#71717a" }}>🏷️ {item.brand}</div>
                          )}
                        </div>
                        <div style={{ width:70, textAlign:"center" }}>
                          {item.code
                            ? <span style={{ fontSize:11, color:"#a1a1aa", fontFamily:"monospace" }}>{item.code}</span>
                            : <span style={{ color:"#3f3f46" }}>—</span>
                          }
                        </div>
                        <div style={{ width:60, textAlign:"center" }}>
                          <span style={{ fontSize:13, fontWeight:700, color:"#f97316" }}>{item.qty}</span>
                          <span style={{ fontSize:10, color:"#71717a", marginLeft:2 }}>{item.unit}</span>
                        </div>
                        <button style={s.invDelBtn} onClick={()=>delIt(item.id)} title="Remove">✕</button>
                      </div>
                    ))}
                  </div>

                  {/* Note + Send */}
                  <textarea style={{ ...s.ta, marginTop:10 }} placeholder={t.noteP} value={note} onChange={e=>setNote(e.target.value)} rows={2} />
                  {editingOrderId&&(
                    <button style={{ ...s.stBtn, marginBottom:6, width:"100%" }} onClick={cancelEditOrder}>
                      ✕ {lang==="bn"?"এডিট বাতিল করুন":"Cancel Edit"}
                    </button>
                  )}
                  <button style={{ ...s.sendBtn, background:editingOrderId?"#0e7490":undefined }} onClick={sendOrder}>
                    {editingOrderId?(lang==="bn"?"✅ অর্ডার আপডেট করুন":"✅ Update Order"):t.sendOrder}
                  </button>
                </div>
              )}

              {/* If no items yet, show empty state hint */}
              {items.length === 0 && (
                <div style={{ textAlign:"center", padding:"18px 0 4px", color:"#52525b", fontSize:12 }}>
                  ↑ {lang==="bn"?"আইটেম যোগ করুন, তারপর অর্ডার পাঠান":"Add items above, then send order"}
                </div>
              )}
            </>
          )}

          {orders.length>0&&(<>
            <div style={{ ...s.secTitle, marginTop:20 }}>{t.sentOrders}</div>
          </>)}
          {orders.length>0&&renderOrderPageTabs()}
          {/* Search box - always visible */}
          {orders.length>0&&(
            <div style={{ position:"relative", marginBottom:12 }}>
              <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:15, pointerEvents:"none" }}>🔍</span>
              <input
                style={{ ...s.inp, paddingLeft:36, background:th.bgCard }}
              placeholder={lang==="bn"?"অর্ডার, পণ্য, কোম্পানি/ভেন্ডর নাম বা নম্বর দিয়ে খুঁজুন...":"Search order, item, company/vendor name or number..."}
                value={searchQ}
                onChange={e=>setSearchQ(e.target.value)}
              />
              {searchQ&&<button onClick={()=>setSearchQ("")} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"#71717a", cursor:"pointer", fontSize:16, lineHeight:1 }}>✕</button>}
            </div>
          )}
          {/* Daily grouped orders */}
          {(() => {
              const filtered = filterOrdersByStatusPage(filterOrders(orders));
              if (!filtered.length) return (
                <div style={s.empty}><div style={{ fontSize:36 }}>🔍</div><div>{lang==="bn"?"কিছু পাওয়া যায়নি":"No results found"}</div></div>
              );
              const groups = groupByDay(filtered);
              return groups.map(([dateStr, dayOrders]) => (
                <div key={dateStr}>
                  <div style={s.dayHeader}>
                    <span style={s.dayDot} />
                    <span style={s.dayLabel}>📅 {dateStr}</span>
                    <span style={s.dayCount}>{dayOrders.length}{lang==="bn"?"টি অর্ডার":" orders"}</span>
                  </div>
                  {dayOrders.map(o=><OrderCard key={o.id} order={o} showSenderName={isOrderManager} />)}
                </div>
              ));
            })()}
          {orders.length===0&&!can("sendOrder")&&(
            <div style={s.empty}><div style={{ fontSize:42 }}>📭</div><div>{t.noOrders}</div></div>
          )}
        </div>
  );
}
