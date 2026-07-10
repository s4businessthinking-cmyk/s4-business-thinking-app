# 🔥 SpareTrack Setup Guide (Phase 1 — Authentication সহ)

এই app **Firebase Firestore + Firebase Authentication** ব্যবহার করে। প্রতিটা শপের আলাদা account, আলাদা data, real-time sync — সব কিছু।

---

## ধাপ ১: Firebase Project তৈরি

1. Browser এ যান: **https://console.firebase.google.com**
2. Google account দিয়ে login
3. **"Add project"** → Project name দিন (যেমন `sparetrack-app`)
4. Google Analytics disable করে দিতে পারেন
5. **Create project** → অপেক্ষা করুন

---

## ধাপ ২: Authentication Enable

1. বাম side menu → **Build → Authentication**
2. **"Get started"** click করুন
3. **"Sign-in method"** tab এ যান
4. **"Email/Password"** select করুন
5. **Enable** করে **Save**

---

## ধাপ ৩: Firestore Database Enable

1. বাম side menu → **Build → Firestore Database**
2. **"Create database"** → **Start in production mode** select করুন (test mode না)
3. Location: **`asia-south1` (Mumbai)** বা **`asia-southeast1` (Singapore)** — Bangladesh এর জন্য fast
4. **Enable** click করুন

---

## ধাপ ৪: Firestore Security Rules সেট করুন

**গুরুত্বপূর্ণ:** পুরনো rules-এ `products`, `vendors`, `customers` ইত্যাদি collection-এর **delete permission** ছিল না।  
এতে Owner login থাকলেও product delete / "সব মুছুন" এ `Missing or insufficient permissions` error আসে।

1. Firestore Database এর **"Rules"** tab এ যান  
   https://console.firebase.google.com/project/s4-business-thinking-31213/firestore/rules
2. পুরো content মুছে project root এর **`firestore.rules`** file এর সম্পূর্ণ content paste করুন
3. **Publish** button এ click করুন

**CLI দিয়ে deploy (optional):**
```bash
firebase login
firebase deploy --only firestore:rules --project s4-business-thinking-31213
```

✅ এক shop এর member শুধু নিজ shop এর data read/create/update/**delete** করতে পারবে — অন্য shop access করতে পারবে না।

---

## ধাপ ৫: Firestore Indexes (গুরুত্বপূর্ণ!)

Orders আর Companies এর queries জন্য composite indexes দরকার।

**সহজ পদ্ধতি:** App চালানোর পর owner হিসেবে login করলে console এ একটা error link আসবে — সেই link এ click করলে Firebase auto-create করে দেবে। শুধু **"Create Index"** button এ click করতে হবে।

**Manual পদ্ধতি:** Firestore → Indexes → Composite → Create Index:

**Index 1:** Collection: `orders`
- `shopId` (Ascending) + `createdAt` (Descending) → Create

**Index 2:** Collection: `companies`
- `shopId` (Ascending) + `name` (Ascending) → Create

**Index 3:** Collection: `products`
- `shopId` (Ascending) + `name` (Ascending) → Create

**Index 4:** Collection: `vendors`
- `shopId` (Ascending) + `vendorName` (Ascending) → Create

**Index 5:** Collection: `customers`
- `shopId` (Ascending) + `customerName` (Ascending) → Create

Index তৈরি হতে ১-৫ মিনিট লাগে।

---

## ধাপ ৬: Web App যোগ করুন

1. Project Overview → **"</>"** icon (web app)
2. App nickname দিন (যেমন `SpareTrack Web`)
3. Firebase Hosting **uncheck** রাখুন
4. **Register app**
5. একটা code block আসবে এমন:

```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

6. **পুরো config copy করুন**

---

## ধাপ ৭: Code এ Config Paste করুন

1. `spare-parts-app.jsx` খুলুন
2. উপরে এই অংশ খুঁজুন:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY_HERE",
  ...
};
```

3. পুরোটা **delete** করে আপনার copy করা config **paste** করে দিন
4. File save করুন

---

## ধাপ ৮: Package Install ও App চালু

```bash
npm install firebase
npm run dev
```

---

## 🎯 কীভাবে ব্যবহার করবেন

### মালিক প্রথম account তৈরি করবে:

1. **Sign Up** button এ click করুন
2. **🏢 মালিক হিসেবে রেজিস্টার** select করুন
3. সব তথ্য পূরণ করুন (Company name, Person name, Country, Area, Mobile, Email, Password)
4. **অ্যাকাউন্ট তৈরি করুন** click করুন
5. Email এ **verification link** আসবে — সেটা click করতে হবে
6. App এ ফিরে এসে **"✓ ভেরিফাই হয়েছে কিনা চেক করুন"** click করুন
7. ✅ Login হয়ে যাবে

### মালিক সেলসম্যানকে invite code দেবে:

1. Settings tab এ যান
2. **🎫 ইনভাইট কোড** section এ দেখবেন একটা ৬-অক্ষরের code (যেমন: `A3F9KX`)
3. **📋 কপি** button দিয়ে copy করুন, সেলসম্যানকে WhatsApp/SMS করুন

### সেলসম্যান sign up করবে:

1. **Sign Up** → **🛒 সেলসম্যান হিসেবে রেজিস্টার**
2. সব তথ্য পূরণ করুন + **ইনভাইট কোড** দিন
3. Email verify করুন → Login

এখন দোকান থেকে order pathate মালিকের phone এ instantly চলে আসবে! ⚡

---

## 💰 খরচ

**সম্পূর্ণ ফ্রি**, কোনো credit card লাগবে না:
- Authentication: প্রতিদিন ৫০,০০০ verification ফ্রি
- Firestore: প্রতিদিন ৫০,০০০ reads + ২০,০০০ writes ফ্রি
- ১ GB storage ফ্রি

ছোট-মাঝারি দোকানের জন্য কখনো limit ছোঁবে না।

---

## ⚠️ গুরুত্বপূর্ণ Notes

- **Email verification না করলে app এ ঢুকতে পারবেন না** — gate এ আটকে থাকবে
- **Email এর spam folder চেক করুন** যদি verification mail না আসে
- **এক shop এর সবার আলাদা email account লাগবে** (মালিক + সেলসম্যান)
- **মালিকের invite code কেউ পেলে আপনার shop এ ঢুকে যেতে পারবে** — তাই code regenerate এর option দিয়েছি

---

## 🐛 সমস্যা হলে

**Email verification mail আসছে না?**
- Spam/Junk folder check করুন
- Firebase console → Authentication → Templates → "Email address verification" → Sender support email check করুন

**"Permission denied" / "Missing or insufficient permissions" error?**
- Firebase Console → Firestore → **Rules** → `firestore.rules` file paste করে **Publish** করুন
- `users/{your-firebase-uid}` document-এ `shopId` আছে কিনা check করুন
- Product delete / Clear All এর জন্য rules-এ `allow delete` থাকতে হবে (`products` collection)
- Indexes তৈরি হয়েছে কিনা দেখুন (Firestore → Indexes)

**"failed-precondition" বা index error?**
- Console এ error message এ একটা link থাকবে — সেটায় click করে Create Index করুন

**Login করার পর "Profile not found" দেখাচ্ছে?**
- Firestore এ `users` collection check করুন — আপনার user document আছে কিনা
- না থাকলে Logout করে নতুন করে sign up করুন

কোনো জায়গায় আটকে গেলে error এর screenshot পাঠাবেন — সমাধান করে দেব।
