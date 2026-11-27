export const PREMIER_UAT_SECTIONS = [
  {
    id: "A",
    titleBn: "সেটআপ",
    titleEn: "Setup",
    items: [
      {
        id: "A1",
        bn: "প্রতি শাখা = আলাদা company file ON; পার্টি শেয়ার ON",
        en: "Each branch = separate company file ON; share parties ON",
        howBn: "Settings → Branch Transfer → দুটো টগল ON → Save settings",
        howEn: "Settings → Branch Transfer → both toggles ON → Save settings",
      },
      {
        id: "A2",
        bn: "শাখা কাউন্টার লগইন — শুধু সেই ফাইলের ডাটা",
        en: "Branch counter login opens only that company file",
        howBn: "Branch Transfer → শাখা সারিতে Counter login → লগআউট করে branch1 দিয়ে লগইন → Sales লিস্টে HQ বিল নেই",
        howEn: "Branch Transfer → branch row → Counter login → log out, login as branch1 → Sales list has no HQ bills",
      },
      {
        id: "A3",
        bn: "HQ থেকে পণ্য/পার্টি শাখায় সিঙ্ক",
        en: "Products/parties synced from HQ to branches",
        howBn: "HQ login → Branch Transfer → Sync products & parties… → child এ Product Master / Customer এ একই আইটেম",
        howEn: "HQ login → Branch Transfer → Sync products & parties → same item on child Product Master / Customer",
      },
      {
        id: "A4",
        bn: "Child CoA: Bank - (শাখা), Due to HQ",
        en: "Child CoA: branch bank, Due to HQ",
        howBn: "Child ফাইলে switch করে Chart of Accounts → Bank - (শাখা) ও Due to HQ আছে",
        howEn: "Switch to child file → Chart of Accounts → Bank - branch name and Due to HQ exist",
      },
      {
        id: "A5",
        bn: "HQ Cloud Download — শাখা ফাইল সহ",
        en: "HQ cloud download includes branch files",
        howBn: "Settings → Cloud Sync → Download (online) → HQ + শাখা ডাটা লোকালে আসে",
        howEn: "Settings → Cloud Sync → Download while online → HQ + branch data locally",
      },
    ],
  },
  {
    id: "B",
    titleBn: "স্টক",
    titleEn: "Stock",
    items: [
      {
        id: "B1",
        bn: "HQ dispatch — HQ স্টক কম",
        en: "HQ dispatch reduces HQ stock",
        howBn: "HQ → Branch Transfer → নতুন ট্রান্সফার → Dispatch → Stock Hub / adjustment এ HQ স্টক কম",
        howEn: "HQ → Branch Transfer → new transfer → Dispatch → HQ stock down in Stock Hub",
      },
      {
        id: "B2",
        bn: "শাখা receive — child স্টক বাড়ে",
        en: "Branch receive increases child stock",
        howBn: "শাখা লগইন → Incoming → Receive (partial OK) → child Stock Hub এ qty বাড়ে",
        howEn: "Branch login → Incoming → Receive → child Stock Hub qty up",
      },
      {
        id: "B3",
        bn: "Receive-এর আগে cancel dispatch",
        en: "Cancel dispatch before receive",
        howBn: "নতুন ট্রান্সফার Dispatch → receive করার আগে Cancel → HQ স্টক ফেরত",
        howEn: "New transfer Dispatch → Cancel before receive → HQ stock restored",
      },
    ],
  },
  {
    id: "C",
    titleBn: "ইন্টার-কোম্পানি",
    titleEn: "Inter-company",
    items: [
      {
        id: "C1",
        bn: "Receive পর HQ JV-IC",
        en: "HQ JV-IC after receive",
        howBn: "HQ Global Ledger / Books → JV-IC-… (Due from branch Dr, Purchase Cr)",
        howEn: "HQ Global Ledger / Books → JV-IC-… (Dr Due from branch, Cr Purchase)",
      },
      {
        id: "C2",
        bn: "Child PI-IC — Due to HQ",
        en: "Child PI-IC credits Due to HQ",
        howBn: "Child Purchase → PI-IC-… খুলুন → Due to HQ (vendor payable নয়)",
        howEn: "Child Purchase → open PI-IC-… → Due to HQ not vendor payable",
      },
      {
        id: "C3",
        bn: "Due from / Due to HQ মিল",
        en: "Due from / Due to HQ match",
        howBn: "HQ ও child Global Ledger এ Due পরিমাণ একই (receive value)",
        howEn: "HQ and child Global Ledger Due amounts match receipt value",
      },
      {
        id: "C4",
        bn: "Consolidated — inter-company elimination",
        en: "Consolidated inter-company elimination",
        howBn: "HQ → Accounts → Company consolidated → KPI Inter-company elimination > 0; TB তে Due net",
        howEn: "HQ → Accounts → Company consolidated → Inter-company elimination KPI; Due net on TB",
      },
    ],
  },
  {
    id: "D",
    titleBn: "দৈনন্দিন",
    titleEn: "Daily ops",
    items: [
      {
        id: "D1",
        bn: "Child cash SI",
        en: "Child cash sale invoice",
        howBn: "Child → Sales → Cash SI save → Global Ledger Cash in Hand",
        howEn: "Child → Sales → save cash SI → Cash in Hand in ledger",
      },
      {
        id: "D2",
        bn: "Child bank SI — branch bank ledger",
        en: "Child bank SI posts to branch bank",
        howBn: "Bank pay mode + Bank account dropdown → full pay → Ledger এ Bank - শাখা",
        howEn: "Bank pay mode + bank account dropdown → full pay → Bank - branch in ledger",
      },
      {
        id: "D3",
        bn: "Child PI bank pay",
        en: "Child PI bank payment",
        howBn: "Purchase → bank pay + bank pick → ledger branch bank",
        howEn: "Purchase → bank pay + bank pick → branch bank ledger",
      },
      {
        id: "D4",
        bn: "Voucher bank default",
        en: "Voucher default bank",
        howBn: "Receipt/Payment voucher → bank method → default Bank - শাখা selected",
        howEn: "Receipt/Payment voucher → bank → default branch bank pre-selected",
      },
      {
        id: "D5",
        bn: "Counter shift — child shop only",
        en: "Counter shift on child shop only",
        howBn: "Child → Counter → shift open/close → শুধু child ক্যাশ/লেজার",
        howEn: "Child → Counter → open/close shift → child cash/ledger only",
      },
    ],
  },
  {
    id: "E",
    titleBn: "রিপোর্ট",
    titleEn: "Reports",
    items: [
      {
        id: "E1",
        bn: "HQ TB/BS — HQ only",
        en: "HQ TB/BS HQ numbers only",
        howBn: "HQ company file (switcher) → Trial Balance / Balance Sheet — শাখা যোগ নয়",
        howEn: "HQ file on switcher → Trial Balance / Balance Sheet — not branch combined",
      },
      {
        id: "E2",
        bn: "Child TB/BS — child only",
        en: "Child TB/BS child numbers only",
        howBn: "Child file switch → TB/BS → bank নাম শাখার",
        howEn: "Switch child file → TB/BS → bank name matches branch",
      },
      {
        id: "E3",
        bn: "HQ consolidated + elimination",
        en: "HQ consolidated with elimination",
        howBn: "Company consolidated রিপোর্ট → Refresh → P&L টোটাল + elimination footnote",
        howEn: "Company consolidated report → Refresh → P&L total + elimination note",
      },
      {
        id: "E4",
        bn: "Party aging scoped",
        en: "Party aging per file",
        howBn: "Child ফাইল → Party aging — HQ-only party নেই (শেয়ার ছাড়া)",
        howEn: "Child file → Party aging — no stray HQ-only parties unless shared",
      },
    ],
  },
];

const storageKey = (shopId) => `s4-premier-uat:${shopId || "default"}`;

export function readPremierUatState(shopId) {
  try {
    const raw = localStorage.getItem(storageKey(shopId));
    if (!raw) return { passed: {}, signOff: {} };
    const parsed = JSON.parse(raw);
    return {
      passed: parsed.passed && typeof parsed.passed === "object" ? parsed.passed : {},
      signOff: parsed.signOff && typeof parsed.signOff === "object" ? parsed.signOff : {},
    };
  } catch {
    return { passed: {}, signOff: {} };
  }
}

export function writePremierUatState(shopId, state) {
  localStorage.setItem(storageKey(shopId), JSON.stringify(state));
}

export function premierUatProgress(state) {
  const all = PREMIER_UAT_SECTIONS.flatMap((s) => s.items);
  const done = all.filter((i) => state.passed?.[i.id]).length;
  return { done, total: all.length };
}