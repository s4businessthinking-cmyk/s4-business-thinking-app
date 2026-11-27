# Golden Link — UAT সাইন-অফ গাইড (স্টেজিং)

**কোথায়:** Settings → Branch Transfer → নিচে **Premier multi-file UAT** (অ্যাপে টিক + সাইন-অফ সেভ হয়)

**নিয়ম:** আসল ডাটা নয় — **কপি/স্টেজিং** দিয়ে চালান।

---

## ক্রম (এক দিনে ~২ ঘণ্টা)

### ১. HQ সেটআপ (A1–A5)

1. **Settings → Branch Transfer** — *Each branch = separate company file* ON, *Share parties* ON → Save.
2. দুইটা শাখা সেভ করুন → **Counter login** তৈরি (`branch1`, `branch2`)।
3. **Sync products & parties from HQ to branches** বাটন।
4. উপরে **Company file switcher** দিয়ে child ফাইলে যান → **Chart of Accounts** এ `Bank - …` ও `Due to HQ` দেখুন।
5. **Settings → Cloud Sync** → Download (অনলাইন)।

### ২. একটা ট্রান্সফার (B + C)

1. HQ → **Branch Transfer** → নতুন ট্রান্সফার → **Dispatch** → HQ **Stock Hub** এ স্টক কমেছে (B1)।
2. শাখা লগইন → **Incoming** → **Receive** → child স্টক বাড়ে (B2)।
3. (আলাদা টেস্ট) Dispatch করেই receive ছাড়া **Cancel** — HQ স্টক ফিরে (B3)।
4. Receive পর: HQ **Global Ledger** এ JV-IC (C1); child **Purchase** এ PI-IC, **Due to HQ** (C2); দুটো Due টাকা মিল (C3).
5. HQ → Accounts → **Company consolidated** → Refresh → **Inter-company elimination** KPI (C4, E3).

### ৩. শাখায় বিক্রি/ক্রয় (D)

Child ফাইলে: Cash SI (D1); Bank SI + **Bank account** ড্রপডাউন + full pay → Ledger এ branch bank (D2); PI bank (D3); Receipt voucher bank default (D4); **Counter** shift শুধু child (D5).

পুরনো বিলে generic Bank থাকলে UAT প্যানেলে **Repair old bank bills** চাপুন।

### ৪. রিপোর্ট (E)

HQ switcher → TB/BS (E1); Child switcher → TB/BS (E2); Consolidated (E3); Child party aging (E4).

---

## সাইন-অফ

অ্যাপের UAT প্যানেলে সব টিক → **Owner name + Date** → Save (browser local)।

অফিস রেকর্ডের জন্য `docs/GOLDEN_LINK_PREMIER_UAT.md` টেবিলেও নাম/তারিখ লিখুন.

**অটো টেস্ট:** `npm run test:branch` ও `npm run test:e2e:branch`

---

## পাস না হলে

| সমস্যা | দেখুন |
|--------|--------|
| শাখায় HQ বিল দেখা | ভুল login / switcher child নয় |
| Due মিলছে না | Receive value vs PI-IC / JV-IC |
| Bank generic | Repair বাটন বা নতুন বিলে bank dropdown |
| Consolidated খালি | কমপক্ষে ২ company file + Refresh |