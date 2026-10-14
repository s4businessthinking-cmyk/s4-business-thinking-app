
export function CompaniesScreen({ addCo, cancelEdit, cos, delCo, editId, editNm, editPh, isDesktop, isOwner, lang, newNm, newPh, s, saveEdit, setEditNm, setEditPh, setNewNm, setNewPh, setShowAdd, setTab, showAdd, startEdit, t, th, vendors }) {
  return (
  <div style={isDesktop?s.desktopPanel:s.panel}>

    {isOwner&&(
      <button
        type="button"
        style={{ ...s.stBtn, marginBottom:12, padding:"8px 12px" }}
        onClick={()=>setTab("owner")}
      >
        {lang==="bn"?"← অপশন":"← Options"}
      </button>
    )}

    <div style={{
      display:"flex",
      alignItems:"center",
      justifyContent:"space-between",
      marginBottom:14,
      gap:10,
      flexWrap:"wrap"
    }}>

      <div style={s.secTitle}>
        {t.coList}
      </div>

      <div style={{
        display:"flex",
        gap:10,
        flexWrap:"wrap"
      }}>

        <button
          style={s.addCoBtn}
          onClick={()=>setShowAdd(!showAdd)}
        >
          {showAdd ? `✕ ${t.cancel}` : t.addNew}
        </button>

      </div>

    </div>

    {showAdd&&(
      <div style={{ ...s.card, border:"1px solid #f97316", marginBottom:14 }}>

        <div style={{
          fontSize:13,
          fontWeight:700,
          color:"#f97316",
          marginBottom:10
        }}>
          {t.addCoTitle}
        </div>

        <input
          style={{ ...s.inp, marginBottom:8 }}
          placeholder={t.coName}
          value={newNm}
          onChange={e=>setNewNm(e.target.value)}
        />

        <input
          style={{ ...s.inp, marginBottom:8 }}
          placeholder={t.waNum}
          value={newPh}
          onChange={e=>setNewPh(e.target.value)}
        />

        <div style={{
          fontSize:11,
          color:"#71717a",
          marginBottom:10
        }}>
          {t.waHint}
        </div>

        <div style={s.row}>

          <button
            style={{ ...s.sendBtn, flex:1, padding:"10px" }}
            onClick={addCo}
          >
            {t.addBtn}
          </button>

          <button
            style={{ ...s.stBtn, flex:1 }}
            onClick={()=>{
              setShowAdd(false);
              setNewNm("");
              setNewPh("");
            }}
          >
            {t.cancel}
          </button>

        </div>

      </div>
    )}


    {/* ───────── VENDORS LIST ───────── */}

{false && vendors.length > 0 && (

  <div style={{ marginTop:20 }}>

    <div style={s.secTitle}>
      Vendors
    </div>

    {vendors.map(v => (

      <div
        key={v.id}
        style={s.card}
      >

        <div
          style={{
            display:"flex",
            justifyContent:"space-between",
            gap:12,
            alignItems:"flex-start"
          }}
        >

          <div style={{ flex:1 }}>

            <div
              style={{
                fontSize:16,
                fontWeight:700,
                color:th.txtPrimary,
                marginBottom:4
              }}
            >
              {v.vendorName}
            </div>

            <div
              style={{
                fontSize:12,
                color:"#71717a",
                marginBottom:2
              }}
            >
              Code: {v.vendorCode || "-"}
            </div>

            <div
              style={{
                fontSize:12,
                color:"#71717a",
                marginBottom:2
              }}
            >
              📱 {v.mobileNumber || "-"}
            </div>

            <div
              style={{
                fontSize:12,
                color:"#71717a",
                marginBottom:2
              }}
            >
              ✉️ {v.email || "-"}
            </div>

            <div
              style={{
                fontSize:12,
                color:"#71717a"
              }}
            >
              🏢 {v.address || "-"}
            </div>

          </div>

          <div
            style={{
              display:"flex",
              gap:6
            }}
          >

            {v.mobileNumber && (

              <a
                href={`https://wa.me/${v.mobileNumber}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  ...s.waBtn,
                  padding:"6px 10px"
                }}
              >
                💬
              </a>

            )}

          </div>

        </div>

      </div>

    ))}

  </div>

)}


    
          {cos.length===0&&<div style={s.empty}><div style={{ fontSize:38 }}>🏢</div><div>{t.noCo}</div></div>}
          {cos.map(c=>(
            <div key={c.id} style={s.card}>
              {editId===c.id?(
                <div>
                  <div style={{ fontSize:12, color:"#f97316", fontWeight:700, marginBottom:10 }}>{t.editTitle}</div>
                  <input style={{ ...s.inp, marginBottom:8 }} value={editNm} onChange={e=>setEditNm(e.target.value)} />
                  <input style={{ ...s.inp, marginBottom:10 }} value={editPh} onChange={e=>setEditPh(e.target.value)} />
                  <div style={s.row}>
                    <button style={{ ...s.savBtn, flex:1, padding:"10px" }} onClick={()=>saveEdit(c.id)}>{t.saveEdit}</button>
                    <button style={{ ...s.stBtn, flex:1 }} onClick={cancelEdit}>{t.cancel}</button>
                  </div>
                </div>
              ):(
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <div style={s.coIcon}>🏢</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:15, fontWeight:700, color:th.txtPrimary }}>{c.name}</div>
                    <div style={{ fontSize:12, color:"#71717a", marginTop:2 }}>{c.phone?`📱 +${c.phone}`:t.noPhone}</div>
                  </div>
                  <div style={{ display:"flex", gap:6 }}>
                    {c.phone&&<a href={`https://wa.me/${c.phone}`} target="_blank" rel="noreferrer" style={{ ...s.waBtn, padding:"6px 10px" }}>💬</a>}
                    <button style={s.edBtn} onClick={()=>startEdit(c)}>✏️</button>
                    <button style={s.dlBtn} onClick={()=>delCo(c.id)}>🗑️</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
  );
}
