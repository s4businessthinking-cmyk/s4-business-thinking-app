
export function OwnerOrdersScreen({ OrderCard, filterOrders, filterOrdersByStatusPage, groupByDay, isDesktop, lang, orders, renderOrderPageTabs, s, searchQ, setSearchQ, t, th }) {
  return (
        <div style={isDesktop?s.desktopPanel:s.panel}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, marginBottom:10 }}>
                <div style={s.secTitle}>{lang==="bn"?"📋 সেলসম্যান অর্ডার":"📋 Order to Salesman"}</div>
              </div>
              {orders.length>0&&renderOrderPageTabs()}
              <div style={{ position:"relative", marginBottom:12 }}>
                <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:15, pointerEvents:"none" }}>🔍</span>
                <input
                  style={{ ...s.inp, paddingLeft:36, background:th.bgCard }}
                  placeholder={lang==="bn"?"অর্ডার, পণ্য, ভেন্ডর নাম বা নম্বর দিয়ে খুঁজুন...":"Search order, item, vendor name or number..."}
                  value={searchQ}
                  onChange={e=>setSearchQ(e.target.value)}
                />
                {searchQ&&<button onClick={()=>setSearchQ("")} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"#71717a", cursor:"pointer", fontSize:16, lineHeight:1 }}>✕</button>}
              </div>
              {orders.length===0
                ? <div style={s.empty}><div style={{ fontSize:42 }}>📭</div><div>{t.noOrders}</div></div>
                : (() => {
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
                        {dayOrders.map(o=><OrderCard key={o.id} order={o} showSenderName={true} />)}
                      </div>
                    ));
                  })()
              }
        </div>
  );
}
