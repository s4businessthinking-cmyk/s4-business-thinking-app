import { useEffect, useMemo, useRef } from "react";
import { Header } from "../components/AppHeader.jsx";
import { _globalS } from "../shared/appShared.jsx";
import { MAIN_BRANCH } from "../reports/groupView.js";
import { branchDefaultsOf } from "./userBranchDefaults.js";

/** After username/password: pick the outlet (branch). Staff with one assigned branch enters automatically. */
export default function BranchLoginGate({ lang = "bn", shopId, profile, team = [], isOwner, branches = [], shopName = "", onSelect, onLogout, s = _globalS, theme, setTheme, setLang, t }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const myDefaults = useMemo(
    () => team.find((m) => (m.uid || m.id) === profile?.uid)?.defaults || profile?.defaults || {},
    [team, profile]
  );
  const assigned = useMemo(() => branchDefaultsOf(myDefaults), [myDefaults]);
  const autoRef = useRef(false);

  const rows = useMemo(() => {
    const mains = { id: MAIN_BRANCH, name: L("মূল দোকান", "Main store") };
    const fromMaster = (branches || []).map((b) => ({ id: b.id, name: b.name || b.id }));
    const all = [mains, ...fromMaster.filter((b) => b.id !== MAIN_BRANCH)];
    if (!isOwner && assigned?.stockLocation) {
      const id = assigned.stockLocation;
      const hit = all.find((b) => b.id === id);
      if (hit) return [hit];
    }
    return all;
  }, [branches, isOwner, assigned, bn]);

  useEffect(() => {
    if (autoRef.current) return;
    if (rows.length === 1) {
      autoRef.current = true;
      onSelect?.({ branchId: rows[0].id, branchName: rows[0].name });
    }
  }, [rows, onSelect]);

  const pick = (row) => onSelect?.({ branchId: row.id, branchName: row.name });

  return (
    <div style={{ ...s.root, minHeight: "100vh", background: theme === "dark" ? "#0a0a0b" : "#f1f5f9" }}>
      <Header t={t} lang={lang} setLang={setLang} s={s} theme={theme} setTheme={setTheme} shopName={shopName} personName={profile?.personName || ""} />
      <div style={{ maxWidth: 420, margin: "32px auto", padding: "0 16px 24px" }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: theme === "dark" ? "#fafafa" : "#0f172a", marginBottom: 6 }}>
          {L("কোন শাখায় কাজ করবেন?", "Which branch are you working at?")}
        </div>
        <div style={{ fontSize: 13, color: theme === "dark" ? "#a1a1aa" : "#64748b", marginBottom: 20, lineHeight: 1.5 }}>
          {L(
            "একই কোম্পানির এক বই — শাখা বেছে নিলে বিক্রি, কাউন্টার ও ক্যাশ শুধু সেই শাখার। লগআউট না করে শাখা বদলাতে সেটিংসে যান।",
            "Same company books — sales, counter and cash stay on the branch you pick. Use Settings to switch branch without logging out."
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => pick(row)}
              style={{
                padding: "16px 18px",
                borderRadius: 14,
                border: `2px solid ${theme === "dark" ? "#3f3f46" : "#cbd5e1"}`,
                background: theme === "dark" ? "#18181b" : "#fff",
                color: theme === "dark" ? "#fafafa" : "#0f172a",
                fontSize: 17,
                fontWeight: 900,
                textAlign: "left",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {row.name}
              <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#f97316", marginTop: 4 }}>
                {L("এই শাখায় লগইন", "Log in to this branch")}
              </span>
            </button>
          ))}
        </div>
        <button type="button" style={{ ...s.linkBtnInline, marginTop: 20 }} onClick={onLogout}>
          {L("লগআউট", "Logout")}
        </button>
      </div>
    </div>
  );
}