export const SI_PAY     = {
  cash:   { bn:"নগদ",            en:"Cash",          icon:"💵" },
  bank:   { bn:"ব্যাংক ট্রান্সফার", en:"Bank Transfer",  icon:"🏦" },
  card:   { bn:"কার্ড",           en:"Card",          icon:"💳" },
  cheque: { bn:"চেক",             en:"Cheque",         icon:"📃" },
  credit: { bn:"বাকি (ক্রেডিট)",  en:"Credit",         icon:"📅" },
};

// Cash, bank transfer and card settle the bill in full. Only credit / cheque / partial-cash keep a due.
export function siIsSettledPay(method, cashPartial = false) {
  if (method === "cash") return !cashPartial;
  return method === "bank" || method === "card";
}

export function siSettledPayLabel(method, lang) {
  const pm = SI_PAY[method];
  const name = pm?.[lang] || pm?.en || method || "";
  return lang === "bn" ? `সম্পূর্ণ পরিশোধিত (${name})` : `Fully paid (${name})`;
}
