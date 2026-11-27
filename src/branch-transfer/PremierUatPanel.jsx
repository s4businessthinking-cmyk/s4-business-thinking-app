import React, { useMemo, useState } from "react";
import {
  PREMIER_UAT_SECTIONS,
  premierUatProgress,
  readPremierUatState,
  writePremierUatState,
} from "./premierUatChecklist.js";
import { repairShopInvoicePaymentBanks } from "../ledger/repairInvoicePaymentBank.js";
import { loadShopRecord } from "../offline/shopService.js";
import { NativeButton } from "./btShared.jsx";
import { runPremierAcceptance, uatTicksFromAcceptance } from "./runPremierAcceptance.js";

export default function PremierUatPanel({
  lang = "en",
  s,
  th,
  shopId,
  homeShopId,
  localShop,
  toast,
  team = [],
  customers = [],
  vendors = [],
}) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const [state, setState] = useState(() => readPremierUatState(homeShopId || shopId));
  const [repairBusy, setRepairBusy] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [lastVerify, setLastVerify] = useState(null);
  const [showHow, setShowHow] = useState(true);
  const progress = useMemo(() => premierUatProgress(state), [state]);

  const persist = (next) => {
    setState(next);
    writePremierUatState(homeShopId || shopId, next);
  };

  const toggle = (id) => {
    const passed = { ...state.passed };
    if (passed[id]) delete passed[id];
    else passed[id] = true;
    persist({ ...state, passed });
  };

  const updateSignOff = (key, value) => {
    persist({ ...state, signOff: { ...state.signOff, [key]: value } });
  };

  const runVerify = async () => {
    const hq = homeShopId || shopId;
    setVerifyBusy(true);
    try {
      const { summary, checks, asOf } = await runPremierAcceptance(hq, { team, customers, vendors });
      setLastVerify({ summary, checks, asOf });
      const auto = uatTicksFromAcceptance(summary);
      const passed = { ...state.passed, ...auto };
      persist({ ...state, passed });
      const lines = [
        L("শাখায় HQ বিল নেই", "Branch file bill isolation") + `: ${summary.branchIsolation ? "OK" : "FAIL"}`,
        L("Due from / Due to মিল", "Due from / Due to match") + `: ${summary.dueMatch ? "OK" : "FAIL"}`,
        L("Bank - শাখা লেজার", "Branch bank ledger") + `: ${summary.bankLedger ? "OK" : "FAIL"}`,
        L("Consolidated elimination", "Consolidated elimination") + `: ${summary.consolidatedElimination ? "OK" : "FAIL"}`,
      ];
      toast(
        summary.allOk
          ? L("চারটি গ্রহণযোগ্যতা পাস — UAT আইটেম অটো টিক", "All four acceptance checks passed — UAT items auto-ticked")
          : lines.join(" | "),
        summary.allOk ? "ok" : "err"
      );
      if (!summary.bankLedger && checks.bank?.needRepair > 0) {
        toast(L("পুরনো ব্যাংক বিল Repair চাপুন", "Tap Repair old bank bills"), "err");
      }
      if (!summary.dueMatch) {
        toast(L("একবার Branch Transfer Receive চালান", "Run a branch transfer receive first"), "err");
      }
    } catch (e) {
      toast(String(e?.message || e), "err");
    } finally {
      setVerifyBusy(false);
    }
  };

  const runRepair = async () => {
    setRepairBusy(true);
    try {
      const shop = localShop || (await loadShopRecord(shopId));
      const out = await repairShopInvoicePaymentBanks(shopId, shop);
      toast(
        L(
          `পুরনো বিল ঠিক: বিক্রি ${out.sales}, ক্রয় ${out.purchase} → ${out.bankName}`,
          `Repaired old bills: sales ${out.sales}, purchase ${out.purchase} → ${out.bankName}`
        ),
        out.sales || out.purchase ? "ok" : undefined
      );
    } catch (e) {
      toast(String(e?.message || e), "err");
    } finally {
      setRepairBusy(false);
    }
  };

  const allPassed = progress.done === progress.total && progress.total > 0;

  return (
    <div style={{ ...s.card, marginTop: 12 }}>
      <div style={s.settingsLbl}>{L("Premier multi-file UAT", "Premier multi-file UAT")}</div>
      <p style={{ fontSize: 12, color: th.txtMuted, lineHeight: 1.5, margin: "0 0 10px" }}>
        {L(
          "স্টেজিং কপিতে প্রতিটি স্টেপ টিক দিন। সব টিক থাকলে সাইন-অফ রেকর্ড করুন।",
          "Tick each step on a staging copy. When all pass, record sign-off."
        )}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: allPassed ? "#15803d" : th.txtPrimary }}>
          {L("অগ্রগতি", "Progress")}: {progress.done}/{progress.total}
          {allPassed ? ` — ${L("সাইন-অফের জন্য প্রস্তুত", "ready for sign-off")}` : ""}
        </div>
        <button
          type="button"
          onClick={() => setShowHow((v) => !v)}
          style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: `1px solid ${th.border}`, background: th.bgInp, cursor: "pointer" }}
        >
          {showHow ? L("গাইড লুকান", "Hide steps") : L("গাইড দেখান", "Show steps")}
        </button>
      </div>
      <div style={{ fontSize: 11, color: th.txtMuted, lineHeight: 1.55, marginBottom: 10, padding: 10, borderRadius: 8, background: th.bgInp }}>
        <strong>{L("শুরু", "Start")}:</strong>{" "}
        {L(
          "কপি ডাটা দিয়ে HQ (main) লগইন → নিচের ক্রম অনুসরণ → পাস হলে টিক → সব শেষে সাইন-অফ।",
          "Use a data copy, HQ (main) login → follow steps below → tick pass → sign-off at end."
        )}
      </div>
      {PREMIER_UAT_SECTIONS.map((section) => (
        <div key={section.id} style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>
            {section.id}. {bn ? section.titleBn : section.titleEn}
          </div>
          {section.items.map((item) => (
            <label
              key={item.id}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                padding: "6px 0",
                borderBottom: `1px solid ${th.border}`,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={!!state.passed[item.id]}
                onChange={() => toggle(item.id)}
                style={{ marginTop: 2 }}
              />
              <span style={{ flex: 1 }}>
                <strong>{item.id}</strong> — {bn ? item.bn : item.en}
                {showHow && (item.howBn || item.howEn) && (
                  <div style={{ marginTop: 4, color: th.txtMuted, fontWeight: 500, lineHeight: 1.45 }}>
                    {bn ? item.howBn : item.howEn}
                  </div>
                )}
              </span>
            </label>
          ))}
        </div>
      ))}
      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 12 }}>{L("সাইন-অফ", "Sign-off")}</div>
        <input
          style={s.inp}
          placeholder={L("মালিকের নাম", "Owner name")}
          value={state.signOff.owner || ""}
          onChange={(e) => updateSignOff("owner", e.target.value)}
        />
        <input
          style={s.inp}
          type="date"
          value={state.signOff.date || ""}
          onChange={(e) => updateSignOff("date", e.target.value)}
        />
        <textarea
          style={{ ...s.inp, minHeight: 56 }}
          placeholder={L("নোট (ঐচ্ছিক)", "Notes (optional)")}
          value={state.signOff.notes || ""}
          onChange={(e) => updateSignOff("notes", e.target.value)}
        />
      </div>
      <NativeButton s={s} tone="primary" disabled={verifyBusy} onClick={runVerify} style={{ marginTop: 14 }}>
        {verifyBusy ? "..." : L("৪টি গ্রহণযোগ্যতা যাচাই (অটো টিক)", "Verify 4 acceptance checks (auto-tick)")}
      </NativeButton>
      {lastVerify && (
        <div style={{ marginTop: 10, fontSize: 11, lineHeight: 1.5, color: th.txtMuted, padding: 10, borderRadius: 8, background: th.bgInp }}>
          <div style={{ fontWeight: 700, color: th.txtPrimary, marginBottom: 4 }}>
            {L("সর্বশেষ যাচাই", "Last verify")} ({lastVerify.asOf})
          </div>
          {[
            [L("শাখায় HQ বিল নেই", "No HQ bills on branch file"), lastVerify.summary.branchIsolation],
            [L("Due from / Due to", "Due from / Due to"), lastVerify.summary.dueMatch],
            [L("Bank - শাখা", "Branch bank ledger"), lastVerify.summary.bankLedger],
            [L("Consolidated elimination", "Consolidated elimination"), lastVerify.summary.consolidatedElimination],
          ].map(([label, ok]) => (
            <div key={label}>
              {label}: <strong style={{ color: ok ? "#15803d" : "#dc2626" }}>{ok ? "OK" : "FAIL"}</strong>
            </div>
          ))}
        </div>
      )}
      <NativeButton s={s} tone="primary" disabled={repairBusy} onClick={runRepair} style={{ marginTop: 10 }}>
        {L("পুরনো ব্যাংক বিল → শাখার ব্যাংকে ঠিক করুন", "Repair old bank bills to branch bank")}
      </NativeButton>
    </div>
  );
}