import { useEffect, useState } from "react";

// Same sections as classic desktop accounting software: Masters / Transaction / Accounts / Reports / Utilities.
export const MENU_GROUPS = [
  { key: "home", bn: "", en: "", tabs: ["dashboard", "owner", "shop"] },
  { key: "masters", icon: "🗂️", bn: "মাস্টার (Masters)", en: "Masters", tabs: ["products", "vendors", "customers", "employees"] },
  { key: "transaction", icon: "🧾", bn: "লেনদেন (Transaction)", en: "Transaction", tabs: ["purchaseOrder", "salesOrder", "delivery", "goodsReceipt", "branchTransfer", "stockAdjust", "loosen", "bundle", "purchase", "sales", "purchaseReturn", "salesReturn", "employeeExpense", "attendance", "quotation", "jobCard"] },
  { key: "accounts", icon: "💰", bn: "হিসাব (Accounts)", en: "Accounts", tabs: ["vouchers", "expenses", "cheque", "pdc", "bankRec", "partners"] },
  { key: "reports", icon: "📊", bn: "রিপোর্ট (Reports)", en: "Reports", tabs: ["accounts", "tax", "auditLog"] },
  { key: "utilities", icon: "🛠️", bn: "ইউটিলিটি (Utilities)", en: "Utilities", tabs: ["settings"] },
];

// items: [[tabKey, label], …] already filtered by permission; empty groups are dropped, unknown tabs go to Utilities.
export function groupMenuItems(items, lang) {
  const bn = lang === "bn";
  const known = new Set(MENU_GROUPS.flatMap((g) => g.tabs));
  return MENU_GROUPS.map((g) => ({
    key: g.key, icon: g.icon || "", label: bn ? g.bn : g.en,
    items: [
      ...g.tabs.map((k) => items.find(([key]) => key === k)).filter(Boolean),
      ...(g.key === "utilities" ? items.filter(([key]) => !known.has(key)) : []),
    ],
  })).filter((g) => g.items.length);
}

const STORE_KEY = "s4_menu_closed_groups";
const readClosed = () => { try { return new Set(JSON.parse(localStorage.getItem(STORE_KEY) || "[]")); } catch { return new Set(); } };

// Which sections are folded; remembered per device. The section holding the open page always unfolds.
export function useMenuGroups(activeKey) {
  const [closed, setClosed] = useState(readClosed);
  useEffect(() => {
    const g = MENU_GROUPS.find((x) => x.tabs.includes(activeKey));
    if (g && closed.has(g.key)) setClosed((prev) => { const next = new Set(prev); next.delete(g.key); return next; });
  }, [activeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { try { localStorage.setItem(STORE_KEY, JSON.stringify([...closed])); } catch { /* storage full or blocked */ } }, [closed]);
  const toggle = (key) => setClosed((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  return { isOpen: (key) => key === "home" || !closed.has(key), toggle };
}
