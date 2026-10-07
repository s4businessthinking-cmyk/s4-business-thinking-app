import React, { useEffect, useMemo, useRef, useState } from "react";
import { offlineCreate, offlineRemove, offlineUpdate } from "../offline/offlineRepository";
import { PM_CSS } from "../product-master/pmStyles";
import { SI_CSS, usePmFitHeight, usePmMobile } from "../sales-invoice/siSkin";
import { subscribeShopCollection } from "../offline/realtimeSync";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { logAudit } from "../utils/auditLog.js";
import { readDocFile, readProfilePhoto, openDocFile } from "../utils/docFiles.js";
import { saveShopRecord } from "../offline/shopService";
import { alertText } from "./employeeAlerts.js";
import { NATIONALITIES, SALARY_PARTS, countryRule, isExpat, grossSalary, expiringItems, serviceLength } from "./employeeProfile.js";

const n = (v) => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
const r2 = (v) => Math.round((n(v) + Number.EPSILON) * 100) / 100;
const money = (v) => r2(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const PAYERS = [["company", "কোম্পানি দেবে", "Company"], ["employee", "কর্মচারী দেবে", "Employee"], ["shared", "দুজনে ভাগ করে", "Shared"]];
const DOC_TYPES = [
  ["passport", "পাসপোর্ট কপি", "Passport copy"], ["visa", "ভিসা কপি", "Visa copy"], ["residentId", "রেসিডেন্স আইডি (সামনে/পেছনে)", "Residence ID (front/back)"],
  ["workPermit", "ওয়ার্ক পারমিট / লেবার কার্ড", "Work permit / Labour card"], ["localId", "জাতীয় পরিচয়পত্র", "National ID"], ["contract", "চুক্তিপত্র (Agreement)", "Contract / Agreement"],
  ["offer", "অফার লেটার", "Offer letter"], ["insurance", "ইনস্যুরেন্স কার্ড", "Insurance card"], ["license", "ড্রাইভিং লাইসেন্স", "Driving licence"],
  ["certificate", "সার্টিফিকেট / শিক্ষা", "Certificate / Education"], ["ticket", "এয়ার টিকিট", "Air ticket"], ["guardianId", "অভিভাবকের আইডি", "Guardian's ID"],
  ["photo", "ছবি", "Photo"], ["other", "অন্যান্য", "Other"],
];

/**
 * Every profile field: t = input type, opts = [value, bn, en], show(form, ctx) hides fields that don't apply
 * (visa papers only for foreign workers, local ID only for citizens, sponsor only when not the company's visa, …).
 */
const SECTIONS = [
  { key: "basic", icon: "👤", bn: "মূল তথ্য", en: "Basic", fields: [
    { k: "name", bn: "নাম *", en: "Name *" }, { k: "code", bn: "কোড", en: "Code" },
    { k: "designation", bn: "পদবি (Position)", en: "Designation (Position)", t: "position" }, { k: "department", bn: "বিভাগ", en: "Department" },
    { k: "mobile", bn: "মোবাইল", en: "Mobile", mode: "tel" }, { k: "email", bn: "ইমেইল", en: "Email", mode: "email" },
    { k: "dob", bn: "জন্ম তারিখ", en: "Date of birth", t: "date" }, { k: "gender", bn: "লিঙ্গ", en: "Gender", t: "select", opts: [["", "—", "—"], ["male", "পুরুষ", "Male"], ["female", "মহিলা", "Female"]] },
    { k: "maritalStatus", bn: "বৈবাহিক অবস্থা", en: "Marital status", t: "select", opts: [["", "—", "—"], ["single", "অবিবাহিত", "Single"], ["married", "বিবাহিত", "Married"]] },
    { k: "nationalityCode", bn: "জাতীয়তা", en: "Nationality", t: "nationality" },
    { k: "workerType", bn: "কর্মচারীর ধরন", en: "Worker type", t: "select", opts: [["", "জাতীয়তা দেখে ঠিক হবে", "Auto (by nationality)"], ["local", "দেশি (ভিসা লাগে না)", "Local citizen (no visa)"], ["expat", "প্রবাসী (ভিসায়)", "Foreign worker (on visa)"]] },
    { k: "joinDate", bn: "যোগদানের তারিখ", en: "Joining date", t: "date" },
    { k: "status", bn: "অবস্থা", en: "Status", t: "select", opts: [["active", "কাজ করছেন", "Working"], ["inactive", "চলে গেছেন", "Left"]] },
    { k: "leftDate", bn: "কবে চলে গেছেন *", en: "Leaving date *", t: "date", show: (f) => f.status === "inactive" },
    { k: "leaveReason", bn: "চলে যাওয়ার কারণ", en: "Reason for leaving", t: "select", show: (f) => f.status === "inactive", opts: [["", "—", "—"], ["resigned", "নিজে ছেড়েছেন", "Resigned"], ["terminated", "বাদ দেওয়া হয়েছে", "Terminated"], ["contractEnd", "চুক্তি শেষ", "Contract ended"], ["absconded", "পালিয়েছেন (Absconding)", "Absconded"], ["other", "অন্যান্য", "Other"]] },
    { k: "note", bn: "নোট", en: "Note", t: "textarea", wide: true },
  ] },
  { key: "pay", icon: "💰", bn: "বেতন ও চুক্তি", en: "Salary & Contract", fields: [
    ...SALARY_PARTS.map((p) => ({ k: p.k, bn: p.bn, en: p.en, t: "money" })),
    { k: "otRate", bn: "ওভারটাইম রেট / ঘণ্টা", en: "Overtime rate / hour", t: "money" },
    { k: "payMethod", bn: "বেতন কীভাবে", en: "Salary paid by", t: "select", opts: [["cash", "নগদ", "Cash"], ["bank", "ব্যাংক", "Bank transfer"], ["wps", "WPS", "WPS"], ["cheque", "চেক", "Cheque"]] },
    { k: "salaryDay", bn: "মাসের কত তারিখে বেতন", en: "Salary day of month", mode: "numeric" },
    { k: "bankName", bn: "ব্যাংকের নাম", en: "Bank name", show: (f) => f.payMethod === "bank" || f.payMethod === "wps" },
    { k: "bankAccount", bn: "অ্যাকাউন্ট / IBAN", en: "Account / IBAN", show: (f) => f.payMethod === "bank" || f.payMethod === "wps" },
    { k: "contractType", bn: "চুক্তির ধরন", en: "Contract type", t: "select", opts: [["", "—", "—"], ["unlimited", "মেয়াদহীন", "Unlimited"], ["limited", "নির্দিষ্ট মেয়াদ", "Limited / fixed term"], ["partTime", "পার্ট টাইম", "Part time"], ["daily", "দৈনিক মজুরি", "Daily wage"]] },
    { k: "contractStart", bn: "চুক্তি শুরু", en: "Contract start", t: "date" },
    { k: "contractEnd", bn: "চুক্তি শেষ", en: "Contract end", t: "date", show: (f) => f.contractType !== "unlimited" },
    { k: "probationMonths", bn: "প্রবেশন (মাস)", en: "Probation (months)", mode: "numeric" },
    { k: "noticeDays", bn: "নোটিশ পিরিয়ড (দিন)", en: "Notice period (days)", mode: "numeric" },
    { k: "annualLeaveDays", bn: "বার্ষিক ছুটি (দিন)", en: "Annual leave (days)", mode: "numeric" },
    { k: "workHours", bn: "দৈনিক কাজের ঘণ্টা", en: "Working hours / day", mode: "decimal" },
    { k: "weeklyOff", bn: "সাপ্তাহিক ছুটি", en: "Weekly off", t: "select", opts: [["", "—", "—"], ["fri", "শুক্রবার", "Friday"], ["sat", "শনিবার", "Saturday"], ["sun", "রবিবার", "Sunday"], ["rotating", "ঘুরিয়ে", "Rotating"]] },
  ] },
  { key: "papers", icon: "🛂", bn: "ভিসা ও আইডি", en: "Visa & ID", fields: [
    { k: "visaType", bn: "ভিসার ধরন", en: "Visa type", t: "select", show: (f, c) => c.expat, opts: [["", "—", "—"], ["company", "কোম্পানির ভিসা (আমাদের)", "Company visa (ours)"], ["other", "অন্যের ভিসা (অন্য স্পন্সর)", "Other sponsor's visa"], ["family", "ফ্যামিলি ভিসা", "Family visa"], ["visit", "ভিজিট ভিসা", "Visit visa"], ["freelance", "ফ্রিল্যান্স / নিজের", "Freelance / own"], ["golden", "গোল্ডেন / দীর্ঘমেয়াদি", "Golden / long-term"]] },
    { k: "visaSponsor", bn: "ভিসা কার (স্পন্সর)", en: "Visa sponsor", show: (f, c) => c.expat && f.visaType && f.visaType !== "company" },
    { k: "visaNo", bn: "ভিসা / ফাইল নং", en: "Visa / file no", show: (f, c) => c.expat },
    { k: "visaIssue", bn: "ভিসা ইস্যু", en: "Visa issued", t: "date", show: (f, c) => c.expat },
    { k: "visaExpiry", bn: "ভিসার মেয়াদ শেষ", en: "Visa expiry", t: "date", show: (f, c) => c.expat },
    { k: "residentIdNo", bnFn: (c) => `${c.rule.residentId} নং`, enFn: (c) => `${c.rule.residentId} no`, show: (f, c) => c.expat },
    { k: "residentIdExpiry", bnFn: (c) => `${c.rule.residentId} মেয়াদ`, enFn: (c) => `${c.rule.residentId} expiry`, t: "date", show: (f, c) => c.expat },
    { k: "workPermitNo", bnFn: (c) => `${c.rule.workPermit} নং`, enFn: (c) => `${c.rule.workPermit} no`, show: (f, c) => c.expat },
    { k: "workPermitExpiry", bnFn: (c) => `${c.rule.workPermit} মেয়াদ`, enFn: (c) => `${c.rule.workPermit} expiry`, t: "date", show: (f, c) => c.expat },
    { k: "localIdNo", bnFn: (c) => `${c.rule.localId} নং`, enFn: (c) => `${c.rule.localId} no`, show: (f, c) => !c.expat },
    { k: "localIdExpiry", bnFn: (c) => `${c.rule.localId} মেয়াদ`, enFn: (c) => `${c.rule.localId} expiry`, t: "date", show: (f, c) => !c.expat },
    { k: "localSocialNo", bnFn: (c) => c.rule.localSocial, enFn: (c) => c.rule.localSocial, show: (f, c) => !c.expat },
    { k: "passportNo", bn: "পাসপোর্ট নং", en: "Passport no" },
    { k: "passportExpiry", bn: "পাসপোর্টের মেয়াদ", en: "Passport expiry", t: "date" },
    { k: "passportHeldBy", bn: "পাসপোর্ট কার কাছে", en: "Passport kept by", t: "select", show: (f, c) => c.expat, opts: [["", "—", "—"], ["employee", "কর্মচারীর কাছে", "Employee"], ["company", "কোম্পানির কাছে", "Company"]] },
    { k: "insuranceNo", bn: "মেডিকেল ইনস্যুরেন্স নং", en: "Medical insurance no" },
    { k: "insuranceExpiry", bn: "ইনস্যুরেন্সের মেয়াদ", en: "Insurance expiry", t: "date" },
    { k: "drivingLicenseNo", bn: "ড্রাইভিং লাইসেন্স নং", en: "Driving licence no" },
    { k: "drivingLicenseExpiry", bn: "লাইসেন্সের মেয়াদ", en: "Licence expiry", t: "date" },
    { k: "visaCostPaidBy", bn: "ভিসার খরচ কে দেবে", en: "Visa cost paid by", t: "select", show: (f, c) => c.expat, opts: [["", "—", "—"], ...PAYERS] },
    { k: "visaCostAmount", bn: "ভিসার মোট খরচ", en: "Total visa cost", t: "money", show: (f, c) => c.expat && !!f.visaCostPaidBy },
    { k: "visaEmployeeShare", bn: "কর্মচারীর অংশ (বেতন থেকে কাটা হবে)", en: "Employee's share (deducted from salary)", t: "money", show: (f, c) => c.expat && f.visaCostPaidBy === "shared" },
    { k: "ticketEntitlement", bn: "দেশে যাওয়ার টিকিট", en: "Air ticket entitlement", t: "select", show: (f, c) => c.expat, opts: [["", "নেই", "None"], ["yearly", "প্রতি বছর", "Every year"], ["2years", "প্রতি ২ বছর", "Every 2 years"], ["contractEnd", "চুক্তি শেষে", "At contract end"]] },
    { k: "ticketPaidBy", bn: "টিকিট কে দেবে", en: "Ticket paid by", t: "select", show: (f, c) => c.expat && !!f.ticketEntitlement, opts: [["", "—", "—"], ...PAYERS] },
    { k: "ticketDestination", bn: "কোথায় যাবে (এয়ারপোর্ট)", en: "Destination airport", show: (f, c) => c.expat && !!f.ticketEntitlement },
    { k: "lastTicketDate", bn: "শেষ টিকিট কবে", en: "Last ticket date", t: "date", show: (f, c) => c.expat && !!f.ticketEntitlement },
  ] },
  { key: "family", icon: "👪", bn: "পরিবার ও জরুরি যোগাযোগ", en: "Family & Emergency", fields: [
    { k: "presentAddress", bn: "বর্তমান ঠিকানা", en: "Present address", wide: true },
    { k: "homeAddress", bnFn: (c) => (c.expat ? "দেশের বাড়ির ঠিকানা" : "স্থায়ী ঠিকানা"), enFn: (c) => (c.expat ? "Home country address" : "Permanent address"), wide: true },
    { k: "fatherName", bn: "বাবার নাম", en: "Father's name" }, { k: "motherName", bn: "মায়ের নাম", en: "Mother's name" },
    { k: "spouseName", bn: "স্বামী / স্ত্রীর নাম", en: "Spouse's name", show: (f) => f.maritalStatus === "married" },
    { k: "guardianName", bn: "অভিভাবকের নাম", en: "Guardian's name" }, { k: "guardianRelation", bn: "অভিভাবকের সম্পর্ক", en: "Guardian's relation" },
    { k: "guardianPhone", bn: "অভিভাবকের মোবাইল", en: "Guardian's mobile", mode: "tel" }, { k: "guardianIdNo", bn: "অভিভাবকের আইডি নং", en: "Guardian's ID no" },
    { k: "emergencyName", bn: "জরুরি যোগাযোগ (এখানে)", en: "Emergency contact (local)" }, { k: "emergencyPhone", bn: "জরুরি মোবাইল", en: "Emergency mobile", mode: "tel" },
    { k: "emergencyRelation", bn: "সম্পর্ক", en: "Relation" },
    { k: "nomineeName", bn: "নমিনি (টাকা কে পাবে)", en: "Nominee (gets dues)" }, { k: "nomineeRelation", bn: "নমিনির সম্পর্ক", en: "Nominee's relation" },
  ] },
];
const ALL_FIELDS = SECTIONS.flatMap((s) => s.fields);
const emptyForm = () => ({ ...Object.fromEntries(ALL_FIELDS.map((f) => [f.k, ""])), status: "active", payMethod: "cash", joinDate: localDay(), photo: "" });

const PRESET_POSITIONS = ["Senior Salesman", "Junior Salesman", "Manager", "Cashier", "Storekeeper", "Delivery Man", "Accountant", "Supervisor", "Mechanic", "Driver"];
const PRESET_POSITIONS_BN = ["সিনিয়র সেলসম্যান", "জুনিয়র সেলসম্যান", "ম্যানেজার", "ক্যাশিয়ার", "স্টোরকিপার", "ডেলিভারি ম্যান", "অ্যাকাউন্ট্যান্ট", "সুপারভাইজার", "মেকানিক", "ড্রাইভার"];

export default function EmployeesTab({ lang = "en", shopId, user, profile, isOwner, canManage, cur = "AED", toast, shopName = "", shop = null, onShopUpdated, leaveGuard = null, alerts = [], focus = null, onFocusHandled, onOpenAlert }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const shopCountry = shop?.country || "";
  const rule = countryRule(shopCountry);
  const [rows, setRows] = useState([]);
  const [docs, setDocs] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [search, setSearch] = useState("");
  const [showLeft, setShowLeft] = useState(false);
  const [showExpiry, setShowExpiry] = useState(false);
  const [form, setForm] = useState(null);
  const [section, setSection] = useState("basic");
  const [editId, setEditId] = useState(null);
  const [baseline, setBaseline] = useState("");
  const [saving, setSaving] = useState(false);
  const [docForm, setDocForm] = useState(null);
  const [newPos, setNewPos] = useState(null);
  const mobile = usePmMobile();
  const rootRef = useRef(null);
  const photoRef = useRef(null);
  const docFileRef = useRef(null);
  const fitH = usePmFitHeight(rootRef, mobile);

  useEffect(() => {
    if (!shopId) return undefined;
    const u1 = subscribeShopCollection({ collectionName: "employees", shopId, onRows: (list) => setRows(list || []) });
    const u2 = subscribeShopCollection({ collectionName: "expenses", shopId, onRows: (list) => setExpenses(list || []) });
    const u3 = subscribeShopCollection({ collectionName: "employeeDocs", shopId, onRows: (list) => setDocs(list || []) });
    return () => { try { u1?.(); u2?.(); u3?.(); } catch { /* ignore */ } };
  }, [shopId]);

  const all = useMemo(() => rows.filter((r) => r && !r.isDeleted && r.shopId === shopId), [rows, shopId]);
  const liveDocs = useMemo(() => docs.filter((d) => d && !d.isDeleted && d.shopId === shopId), [docs, shopId]);
  const today = localDay();
  const month = today.slice(0, 7);
  const paidThisMonth = useMemo(() => {
    const map = new Map();
    expenses.forEach((x) => {
      if (!x || x.isDeleted || x.shopId !== shopId || x.status === "cancelled" || !x.employeeId) return;
      if (String(x.forMonth || x.expenseDate || "").slice(0, 7) !== month) return;
      map.set(x.employeeId, (map.get(x.employeeId) || 0) + n(x.amount));
    });
    return map;
  }, [expenses, shopId, month]);
  const expiring = useMemo(() => expiringItems(all, liveDocs, { today, withinDays: 30, shopCountry }), [all, liveDocs, today, shopCountry]);
  const expiringByEmp = useMemo(() => { const m = new Map(); expiring.forEach((x) => m.set(x.employeeId, [...(m.get(x.employeeId) || []), x])); return m; }, [expiring]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all
      .filter((r) => showLeft || r.status !== "inactive")
      .filter((r) => !q || [r.name, r.code, r.designation, r.mobile, r.passportNo, r.residentIdNo, r.localIdNo, r.visaNo].some((v) => String(v || "").toLowerCase().includes(q)))
      .sort((a, b) => (a.status === "inactive") - (b.status === "inactive") || String(a.name || "").localeCompare(String(b.name || "")));
  }, [all, search, showLeft]);

  const activeList = all.filter((r) => r.status !== "inactive");
  const salaryTotal = activeList.reduce((t, r) => t + grossSalary(r), 0);
  const paidTotal = activeList.reduce((t, r) => t + (paidThisMonth.get(r.id) || 0), 0);
  const expatCount = activeList.filter((r) => isExpat(r, shopCountry)).length;

  const nextCode = () => {
    const mx = all.reduce((m, r) => { const x = String(r.code || "").match(/EMP-?(\d+)$/i); return x ? Math.max(m, Number(x[1])) : m; }, 0);
    return `EMP-${String(mx + 1).padStart(3, "0")}`;
  };

  const openNew = () => { const f = { ...emptyForm(), code: nextCode() }; setEditId(null); setForm(f); setSection("basic"); setNewPos(null); setBaseline(JSON.stringify(f)); };
  const openEdit = (r, sec = "basic") => {
    const f = { ...emptyForm(), ...Object.fromEntries([...ALL_FIELDS.map((x) => x.k), "photo"].map((k) => [k, r[k] == null ? "" : String(r[k])])) };
    if (!f.status) f.status = "active";
    if (!f.payMethod) f.payMethod = "cash";
    if (!SALARY_PARTS.some((p) => n(f[p.k]) > 0) && n(r.salary) > 0) f.basicSalary = String(r.salary);
    setEditId(r.id); setForm(f); setSection(sec); setBaseline(JSON.stringify(f));
  };
  useEffect(() => {
    if (!focus) return;
    const r = all.find((x) => x.id === focus.id);
    if (!r) return;
    if (!formDirty) openEdit(r, focus.section);
    onFocusHandled?.();
  }, [focus, all.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const editRow = editId ? all.find((r) => r.id === editId) : null;
  const readOnly = !canManage;
  const formDirty = !!form && !readOnly && JSON.stringify(form) !== baseline;
  const closeForm = () => {
    if (saving) return;
    if (formDirty && !window.confirm(L("সেভ না করা পরিবর্তন আছে। বন্ধ করবেন?", "You have unsaved changes. Close anyway?"))) return;
    setForm(null); setEditId(null); setDocForm(null); setNewPos(null);
  };
  const ctx = form ? { expat: isExpat(form, shopCountry), rule } : { expat: false, rule };

  const save = async () => {
    if (saving || !form || readOnly) return;
    const name = form.name.trim();
    if (!name) { setSection("basic"); toast?.(L("❌ কর্মচারীর নাম লিখুন", "❌ Enter the employee name"), "err"); return; }
    if (all.some((r) => r.id !== editId && String(r.name || "").trim().toLowerCase() === name.toLowerCase())) {
      toast?.(L("❌ এই নামে কর্মচারী আগে থেকেই আছে", "❌ An employee with this name already exists"), "err"); return;
    }
    if (form.status === "inactive" && !form.leftDate) { setSection("basic"); toast?.(L("❌ কবে চলে গেছেন সেই তারিখ দিন", "❌ Pick the leaving date"), "err"); return; }
    if (form.contractStart && form.contractEnd && form.contractEnd < form.contractStart) { setSection("pay"); toast?.(L("❌ চুক্তি শেষের তারিখ শুরুর আগে হতে পারে না", "❌ Contract end is before its start"), "err"); return; }
    setSaving(true);
    const nowIso = new Date().toISOString();
    const c = { expat: isExpat(form, shopCountry), rule };
    const body = {};
    ALL_FIELDS.forEach((f) => {
      const visible = !f.show || f.show(form, c);
      const raw = visible ? form[f.k] : "";
      body[f.k] = f.t === "money" ? r2(raw) : String(raw ?? "").trim();
    });
    body.name = name;
    body.status = form.status === "inactive" ? "inactive" : "active";
    body.photo = form.photo || "";
    body.salary = grossSalary(body);
    body.nationality = NATIONALITIES.find((x) => x.code === body.nationalityCode)?.en || "";
    body.updatedAt = nowIso;
    body.updatedBy = user?.uid || "";
    try {
      if (editRow) {
        await offlineUpdate("employees", editRow.id, { ...editRow, ...body });
        setRows((list) => list.map((r) => (r.id === editRow.id ? { ...r, ...body } : r)));
        toast?.(L("✅ কর্মচারী আপডেট হয়েছে", "✅ Employee updated"));
        setBaseline(JSON.stringify(form));
      } else {
        const payload = { ...body, shopId, createdBy: user?.uid || "", createdByName: profile?.personName || "", createdAt: nowIso };
        const res = await offlineCreate("employees", payload);
        setRows((list) => [{ ...payload, id: res.documentId }, ...list]);
        toast?.(L(`✅ ${name} যোগ হয়েছে — এখন ডকুমেন্ট যোগ করতে পারেন`, `✅ ${name} added — you can add documents now`));
        setEditId(res.documentId);
        setBaseline(JSON.stringify(form));
      }
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
    } catch (e) {
      toast?.(`❌ ${e?.message || e}`, "err");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r) => {
    if (!isOwner) return;
    if (expenses.some((x) => x && !x.isDeleted && x.employeeId === r.id)) { toast?.(L("❌ এই কর্মচারীর খরচ লেখা আছে — মুছবেন না, \"চলে গেছেন\" করে দিন", "❌ This employee has expenses — mark as Left instead of deleting"), "err"); return; }
    if (!window.confirm(L(`${r.name} কে একেবারে মুছে ফেলবেন? তার ডকুমেন্টও মুছে যাবে।`, `Delete ${r.name} permanently? Their documents will be deleted too.`))) return;
    try {
      for (const d of liveDocs.filter((x) => x.employeeId === r.id)) await offlineRemove("employeeDocs", d.id);
      await offlineRemove("employees", r.id);
      setRows((list) => list.filter((x) => x.id !== r.id));
      setDocs((list) => list.filter((x) => x.employeeId !== r.id));
      setForm(null); setEditId(null);
      toast?.(L("কর্মচারী মুছে ফেলা হয়েছে", "Employee deleted"), "err");
      logAudit({ shopId, user, profile, action: "delete", collection: "employees", docId: r.id, docNo: r.code || r.name, note: r.name });
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
    } catch (e) {
      toast?.(`❌ ${e?.message || e}`, "err");
    }
  };

  // ── photo & documents ──
  const pickPhoto = async (file) => {
    if (!file) return;
    if (!String(file.type || "").startsWith("image/")) { toast?.(L("❌ শুধু ছবি দেওয়া যাবে", "❌ Only images"), "err"); return; }
    try { const data = await readProfilePhoto(file); setForm((f) => ({ ...f, photo: data })); }
    catch { toast?.(L("❌ ছবিটা পড়া গেল না", "❌ Could not read the image"), "err"); }
  };
  const pickDocFile = async (file) => {
    if (!file) return;
    try { const data = await readDocFile(file, L); setDocForm((d) => ({ ...d, file: data, fileName: file.name, fileType: file.type })); }
    catch (e) { toast?.(`❌ ${e?.message || e}`, "err"); }
  };
  const saveDoc = async () => {
    if (!docForm || !editId || readOnly) return;
    if (!docForm.file) { toast?.(L("❌ ছবি বা PDF বাছুন", "❌ Choose a photo or PDF"), "err"); return; }
    const t = DOC_TYPES.find((x) => x[0] === docForm.docType) || DOC_TYPES[DOC_TYPES.length - 1];
    setSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const payload = { shopId, employeeId: editId, docType: t[0], label: docForm.label.trim() || t[2], number: docForm.number.trim(), expiryDate: docForm.expiryDate || "",
        file: docForm.file, fileName: docForm.fileName || "", fileType: docForm.fileType || "", createdBy: user?.uid || "", createdByName: profile?.personName || "", createdAt: nowIso, updatedAt: nowIso, updatedBy: user?.uid || "" };
      const res = await offlineCreate("employeeDocs", payload);
      setDocs((l) => [...l, { ...payload, id: res.documentId }]);
      setDocForm(null);
      toast?.(L("✅ ডকুমেন্ট যোগ হয়েছে", "✅ Document added"));
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
    } catch (e) {
      toast?.(`❌ ${e?.message || e}`, "err");
    } finally {
      setSaving(false);
    }
  };
  const deleteDoc = async (d) => {
    if (readOnly || !window.confirm(L(`"${d.label}" মুছে ফেলবেন?`, `Delete "${d.label}"?`))) return;
    try {
      await offlineRemove("employeeDocs", d.id);
      setDocs((l) => l.filter((x) => x.id !== d.id));
      logAudit({ shopId, user, profile, action: "delete", collection: "employeeDocs", docId: d.id, docNo: d.label, note: all.find((e) => e.id === d.employeeId)?.name || "" });
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
    } catch (e) {
      toast?.(`❌ ${e?.message || e}`, "err");
    }
  };
  const openDoc = openDocFile;

  const printProfile = (r) => {
    const c = { expat: isExpat(r, shopCountry), rule };
    const rowsOut = [];
    SECTIONS.forEach((s) => {
      const lines = s.fields.filter((f) => (!f.show || f.show(r, c)) && String(r[f.k] ?? "").trim() !== "" && !(f.t === "money" && !n(r[f.k])));
      if (!lines.length) return;
      rowsOut.push([`— ${s.en.toUpperCase()} —`, ""]);
      lines.forEach((f) => {
        const label = (f.enFn ? f.enFn(c) : f.en).replace(" *", "");
        let v = r[f.k];
        if (f.t === "date") v = fmtDay(v);
        else if (f.t === "money") v = `${cur} ${money(v)}`;
        else if (f.t === "select") v = f.opts.find((o) => o[0] === v)?.[2] || v;
        else if (f.t === "nationality") v = NATIONALITIES.find((x) => x.code === v)?.en || v;
        rowsOut.push([label, String(v)]);
      });
      if (s.key === "pay") rowsOut.push(["Gross monthly salary", `${cur} ${money(grossSalary(r))}`]);
    });
    const docsOf = liveDocs.filter((d) => d.employeeId === r.id);
    if (docsOf.length) { rowsOut.push(["— DOCUMENTS ON FILE —", ""]); docsOf.forEach((d) => rowsOut.push([d.label, [d.number, d.expiryDate ? `expires ${fmtDay(d.expiryDate)}` : ""].filter(Boolean).join(" · ")])); }
    printWithSettings(generateStatementHTML({ shopName, title: `EMPLOYEE PROFILE — ${r.name}`, subtitle: [r.code, r.designation, c.expat ? "Foreign worker" : "Local"].filter(Boolean).join(" · "), cols: [{ label: "Field" }, { label: "Details" }], rows: rowsOut }), { lang });
  };

  const printList = () => {
    const cols = [{ label: "Code" }, { label: "Name" }, { label: "Designation" }, { label: "Mobile" }, { label: "Nationality" }, { label: "Visa / ID expiry" }, { label: "Joined" }, { label: `Salary (${cur})`, align: "right" }];
    const body = filtered.map((r) => [r.code || "", `${r.name}${r.status === "inactive" ? " (Left)" : ""}`, r.designation || "", r.mobile || "", r.nationality || "", fmtDay(isExpat(r, shopCountry) ? r.visaExpiry || r.residentIdExpiry : r.localIdExpiry), fmtDay(r.joinDate), money(grossSalary(r))]);
    printWithSettings(generateStatementHTML({ shopName, title: "EMPLOYEE LIST", subtitle: fmtDay(today), cols, rows: body, foot: ["", "", "", "", "", "", "TOTAL", money(filtered.filter((r) => r.status !== "inactive").reduce((t, r) => t + grossSalary(r), 0))] }), { lang });
  };

  useEffect(() => {
    if (!leaveGuard || !form) return undefined;
    const guard = {
      leave: () => !formDirty || window.confirm(L("সেভ না করা পরিবর্তন আছে। বন্ধ করবেন?", "You have unsaved changes. Close anyway?")),
      back: () => { closeForm(); return true; },
    };
    leaveGuard.current = guard;
    return () => { if (leaveGuard.current === guard) leaveGuard.current = null; };
  });
  useEffect(() => {
    if (!form) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); if (docForm) setDocForm(null); else closeForm(); }
      else if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === "s") { e.preventDefault(); save(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const positions = Array.isArray(shop?.positions) ? shop.positions.filter(Boolean) : [];
  // Designations are the shop's Positions list (Settings → Manage Positions); one list for staff logins and employees.
  const presetPositions = (bn ? PRESET_POSITIONS_BN : PRESET_POSITIONS).filter((p) => !positions.some((x) => x.toLowerCase() === p.toLowerCase()));
  const addPosition = async (raw) => {
    if (!isOwner) return;
    const name = String(raw || "").trim();
    if (!name) return;
    const existing = positions.find((p) => p.toLowerCase() === name.toLowerCase());
    if (existing) { setF("designation", existing); setNewPos(null); return; }
    try {
      const updated = await saveShopRecord(shopId, { positions: [...positions, name] }, { ownerUid: user?.uid, profile, user });
      onShopUpdated?.(updated);
      setF("designation", name);
      setNewPos(null);
      toast?.(L(`✅ "${name}" পদবি যোগ হয়েছে (Manage Positions-এও দেখাবে)`, `✅ Position "${name}" added (also shows in Manage Positions)`));
    } catch (e) {
      toast?.(`❌ ${e?.message || e}`, "err");
    }
  };
  const removePosition = async (name) => {
    if (!isOwner) return;
    const usedBy = rows.filter((r) => r.designation === name).length;
    if (!window.confirm(usedBy
      ? L(`"${name}" পদবিতে ${usedBy} জন কর্মচারী আছে। তালিকা থেকে মুছলেও তাদের পদবি থেকে যাবে। মুছবেন?`, `${usedBy} employee(s) have "${name}". They keep it, but it leaves the list. Remove?`)
      : L(`"${name}" পদবি তালিকা থেকে মুছবেন?`, `Remove "${name}" from the list?`))) return;
    try {
      const updated = await saveShopRecord(shopId, { positions: positions.filter((p) => p !== name) }, { ownerUid: user?.uid, profile, user });
      onShopUpdated?.(updated);
    } catch (e) {
      toast?.(`❌ ${e?.message || e}`, "err");
    }
  };
  const fieldLabel = (f) => (bn ? (f.bnFn ? f.bnFn(ctx) : f.bn) : (f.enFn ? f.enFn(ctx) : f.en));
  const renderField = (f) => {
    if (f.show && !f.show(form, ctx)) return null;
    const label = f.t === "money" ? `${fieldLabel(f)} (${cur})` : fieldLabel(f);
    let control;
    if (f.t === "select") control = <select className="pm-input" disabled={readOnly} value={form[f.k]} onChange={(e) => setF(f.k, e.target.value)}>{f.opts.map((o) => <option key={o[0]} value={o[0]}>{bn ? o[1] : o[2]}</option>)}</select>;
    else if (f.t === "position") {
      const opts = form[f.k] && !positions.includes(form[f.k]) ? [...positions, form[f.k]] : positions;
      control = (
        <>
          <select className="pm-input" disabled={readOnly} value={form[f.k]} onChange={(e) => { if (e.target.value === "__add") setNewPos(""); else setF(f.k, e.target.value); }}>
            <option value="">{opts.length ? L("— বাছুন —", "— Pick —") : L("— কোনো পদবি নেই, নিচে যোগ করুন —", "— No positions yet, add below —")}</option>
            {opts.map((p) => <option key={p} value={p}>{p}{positions.includes(p) ? "" : ` (${L("পুরোনো", "old")})`}</option>)}
            {isOwner && <option value="__add">➕ {L("নতুন পদবি যোগ করুন…", "Add new position…")}</option>}
          </select>
          {isOwner && !readOnly && newPos === null && !opts.length && (
            <button type="button" className="pm-btn-secondary" style={{ alignSelf: "flex-start", marginTop: 4 }} onClick={() => setNewPos("")}>➕ {L("পদবি যোগ করুন", "Add position")}</button>
          )}
          {isOwner && !readOnly && newPos !== null && (
            <div className="si-entry" style={{ marginTop: 4 }}>
              {presetPositions.length > 0 && <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>👇 {L("বেছে নিন বা নিজে লিখুন:", "Pick one or type your own:")}</div>}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
                {presetPositions.map((p) => (
                  <button key={p} type="button" onClick={() => setNewPos(p)}
                    style={{ padding: "3px 9px", borderRadius: 14, border: "1px solid #94a3b8", background: newPos === p ? "#f97316" : "#fff", color: newPos === p ? "#fff" : "#334155", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>{p}</button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <input className="pm-input" style={{ flex: 1 }} autoFocus value={newPos} placeholder={L("পদবির নাম", "Position name")}
                  onChange={(e) => setNewPos(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPosition(newPos); } else if (e.key === "Escape") { e.stopPropagation(); setNewPos(null); } }} />
                <button type="button" className="pm-btn" disabled={!newPos.trim()} onClick={() => addPosition(newPos)}>{L("যোগ", "Add")}</button>
                <button type="button" className="pm-btn-secondary" onClick={() => setNewPos(null)}>✕</button>
              </div>
              {positions.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", marginTop: 6, fontSize: 11, color: "#64748b" }}>
                  {L("আগের পদবি:", "Existing:")}
                  {positions.map((p) => (
                    <span key={p} style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 4px 2px 8px", borderRadius: 12, background: "#e2e8f0", color: "#334155" }}>
                      {p}
                      <button type="button" title={L("তালিকা থেকে মুছুন", "Remove from list")} onClick={() => removePosition(p)} style={{ border: 0, background: "transparent", color: "#b91c1c", cursor: "pointer", fontSize: 12, padding: "0 2px" }}>✕</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      );
    }
    else if (f.t === "nationality") control = <select className="pm-input" disabled={readOnly} value={form[f.k]} onChange={(e) => setF(f.k, e.target.value)}><option value="">—</option>{NATIONALITIES.map((x) => <option key={x.code} value={x.code}>{bn ? x.bn : x.en}</option>)}</select>;
    else if (f.t === "textarea") control = <textarea className="pm-input" disabled={readOnly} rows={2} value={form[f.k]} onChange={(e) => setF(f.k, e.target.value)} style={{ height: 44 }} />;
    else control = <input className="pm-input" disabled={readOnly} type={f.t === "date" ? "date" : "text"} inputMode={f.t === "money" ? "decimal" : f.mode} placeholder={f.ph ? f.ph[bn ? 0 : 1] : f.t === "money" ? "0.00" : undefined} value={form[f.k]} autoFocus={f.k === "name" && !mobile && !readOnly && !editId} onChange={(e) => setF(f.k, e.target.value)} />;
    return <div key={f.k} className="si-field" style={f.wide ? { gridColumn: "1 / -1" } : undefined}><span className="pm-label">{label}</span>{control}</div>;
  };

  const empDocs = editId ? liveDocs.filter((d) => d.employeeId === editId).sort((a, b) => String(a.docType).localeCompare(String(b.docType))) : [];
  const docsPanel = (
    <div className="si-panel-body" style={{ gap: 6 }}>
      {!editId ? <div className="si-hint" style={{ marginLeft: 0 }}>💡 {L("আগে কর্মচারী সেভ করুন, তারপর এখানে পাসপোর্ট, ভিসা, আইডি, চুক্তিপত্র, অভিভাবকের আইডি ইত্যাদির ছবি বা PDF যোগ করতে পারবেন।", "Save the employee first, then attach photos or PDFs of passport, visa, ID, contract, guardian's ID and so on.")}</div> : (
        <>
          {!readOnly && !docForm && <button type="button" className="pm-btn-secondary" style={{ alignSelf: "flex-start" }} onClick={() => setDocForm({ docType: ctx.expat ? "passport" : "localId", label: "", number: "", expiryDate: "", file: "", fileName: "", fileType: "" })}>📎 {L("ডকুমেন্ট যোগ করুন", "Add document")}</button>}
          {docForm && (
            <div className="si-entry">
              <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(2, minmax(0,1fr))", gap: 6 }}>
                <div className="si-field"><span className="pm-label">{L("ধরন", "Type")}</span><select className="pm-input" value={docForm.docType} onChange={(e) => setDocForm((d) => ({ ...d, docType: e.target.value }))}>{DOC_TYPES.map((t) => <option key={t[0]} value={t[0]}>{bn ? t[1] : t[2]}</option>)}</select></div>
                <div className="si-field"><span className="pm-label">{L("নাম / বিবরণ", "Label")}</span><input className="pm-input" value={docForm.label} placeholder={L("যেমন: পাসপোর্ট ১ম পাতা", "e.g. Passport first page")} onChange={(e) => setDocForm((d) => ({ ...d, label: e.target.value }))} /></div>
                <div className="si-field"><span className="pm-label">{L("নম্বর", "Number")}</span><input className="pm-input" value={docForm.number} onChange={(e) => setDocForm((d) => ({ ...d, number: e.target.value }))} /></div>
                <div className="si-field"><span className="pm-label">{L("মেয়াদ শেষ", "Expiry date")}</span><input type="date" className="pm-input" value={docForm.expiryDate} onChange={(e) => setDocForm((d) => ({ ...d, expiryDate: e.target.value }))} /></div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
                <input ref={docFileRef} type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={(e) => { pickDocFile(e.target.files?.[0]); e.target.value = ""; }} />
                <button type="button" className="pm-btn-secondary" onClick={() => docFileRef.current?.click()}>📷 {L("ছবি / PDF বাছুন", "Choose photo / PDF")}</button>
                {docForm.file && (String(docForm.file).startsWith("data:image") ? <img src={docForm.file} alt="" style={{ height: 48, borderRadius: 4, border: "1px solid #cbd5e1" }} /> : <span>📄 {docForm.fileName}</span>)}
                <span className="si-toolbar-gap" />
                <button type="button" className="pm-btn-secondary" onClick={() => setDocForm(null)}>{L("বাদ", "Cancel")}</button>
                <button type="button" className="pm-btn pm-btn--primary" disabled={saving || !docForm.file} onClick={saveDoc}>💾 {L("ডকুমেন্ট সেভ", "Save document")}</button>
              </div>
              <div className="si-hint" style={{ marginLeft: 0 }}>{L("ছবি নিজে থেকে ছোট করে রাখা হয়। PDF সর্বোচ্চ ১.৫ MB। মেয়াদ দিলে শেষ হওয়ার ৩০ দিন আগে সতর্ক করা হবে।", "Photos are shrunk automatically. PDFs up to 1.5 MB. With an expiry date you'll be warned 30 days before.")}</div>
            </div>
          )}
          {!empDocs.length && !docForm && <div className="si-empty">{L("এখনো কোনো ডকুমেন্ট নেই", "No documents yet")}</div>}
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "repeat(2, minmax(0,1fr))" : "repeat(4, minmax(0,1fr))", gap: 6 }}>
            {empDocs.map((d) => {
              const left = d.expiryDate ? Math.round((new Date(`${d.expiryDate}T12:00:00`) - new Date(`${today}T12:00:00`)) / 86400000) : null;
              const isImg = String(d.file || "").startsWith("data:image");
              return (
                <div key={d.id} style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: 4, background: "#fff", display: "flex", flexDirection: "column", gap: 2 }}>
                  <button type="button" onClick={() => openDoc(d)} style={{ border: 0, padding: 0, background: "#f1f5f9", height: 90, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }} title={L("বড় করে দেখুন", "Open")}>
                    {isImg ? <img src={d.file} alt="" style={{ maxWidth: "100%", maxHeight: 90, objectFit: "contain" }} /> : <span style={{ fontSize: 32 }}>📄</span>}
                  </button>
                  <b style={{ fontSize: 12 }}>{d.label}</b>
                  {d.number && <span className="si-muted" style={{ fontSize: 11 }}>{d.number}</span>}
                  {d.expiryDate && <span style={{ fontSize: 11, fontWeight: 700, color: left < 0 ? "#b91c1c" : left <= 30 ? "#b45309" : "#15803d" }}>{left < 0 ? L("মেয়াদ শেষ", "Expired") : L("মেয়াদ", "Expires")} {fmtDay(d.expiryDate)}</span>}
                  {!readOnly && <button type="button" onClick={() => deleteDoc(d)} style={{ border: 0, background: "none", color: "#b91c1c", cursor: "pointer", fontSize: 11, textAlign: "left", padding: 0 }}>🗑️ {L("মুছুন", "Delete")}</button>}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );

  const sec = SECTIONS.find((s) => s.key === section);
  const gross = form ? grossSalary(form) : 0;
  const svc = editRow ? serviceLength(editRow, today) : null;
  const formWindow = form && (
    <div className="pm-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) closeForm(); }}>
      <div className="pm-window" style={{ maxWidth: mobile ? undefined : 860 }}>
        <div className="pm-window-title">
          <span>{editRow ? `👷 ${editRow.name}` : L("👷 নতুন কর্মচারী", "👷 New Employee")}</span>
          <button type="button" className="pm-window-close" onClick={closeForm}>✕</button>
        </div>
        <div className="pm-window-body">
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
            <input ref={photoRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ""; }} />
            <button type="button" disabled={readOnly} onClick={() => photoRef.current?.click()} title={L("ছবি দিন", "Set photo")}
              style={{ width: 64, height: 64, borderRadius: "50%", border: "2px solid #cbd5e1", background: "#f1f5f9", overflow: "hidden", cursor: readOnly ? "default" : "pointer", padding: 0, fontSize: 28 }}>
              {form.photo ? <img src={form.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "📷"}
            </button>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <b>{form.name || L("নতুন কর্মচারী", "New employee")}</b>
              <span className="si-muted" style={{ fontSize: 12 }}>
                <span className="si-badge" style={{ color: ctx.expat ? "#7c3aed" : "#0e7490" }}>{ctx.expat ? L("প্রবাসী — ভিসায়", "Foreign worker — on visa") : L("দেশি — ভিসা লাগে না", "Local — no visa")}</span>
                {gross > 0 ? ` · ${L("মোট বেতন", "Gross")} ${cur} ${money(gross)}` : ""}
                {svc ? ` · ${L("চাকরির বয়স", "Service")} ${svc.years}${L("ব", "y")} ${svc.months}${L("মা", "m")}` : ""}
              </span>
              {form.photo && !readOnly && <button type="button" onClick={() => setF("photo", "")} style={{ border: 0, background: "none", color: "#b91c1c", cursor: "pointer", fontSize: 11, padding: 0, textAlign: "left" }}>{L("ছবি সরান", "Remove photo")}</button>}
            </div>
          </div>
          <div className="si-pills" style={{ marginBottom: 6, flexWrap: "wrap" }}>
            {SECTIONS.map((s) => <button key={s.key} type="button" className={`pm-btn-secondary${section === s.key ? " is-active" : ""}`} onClick={() => setSection(s.key)}>{s.icon} {bn ? s.bn : s.en}</button>)}
            <button type="button" className={`pm-btn-secondary${section === "docs" ? " is-active" : ""}`} onClick={() => setSection("docs")}>📎 {L("ডকুমেন্ট / ছবি", "Documents")}{editId ? ` (${empDocs.length})` : ""}</button>
          </div>
          {section === "docs" ? docsPanel : (
            <div className="si-panel-body" style={{ gap: 6 }}>
              {section === "papers" && (
                <div className="si-hint" style={{ marginLeft: 0 }}>
                  {ctx.expat
                    ? L(`প্রবাসী কর্মচারী — ভিসা, ${rule.residentId}, ${rule.workPermit}, পাসপোর্ট, ভিসা খরচ আর টিকিটের তথ্য দিন।`, `Foreign worker — fill visa, ${rule.residentId}, ${rule.workPermit}, passport, visa cost and ticket details.`)
                    : L(`দেশি কর্মচারী — ভিসা লাগে না, ${rule.localId} আর ${rule.localSocial} দিন। ধরন বদলাতে "মূল তথ্য" থেকে জাতীয়তা বা কর্মচারীর ধরন ঠিক করুন।`, `Local citizen — no visa needed; fill ${rule.localId} and ${rule.localSocial}. To change, set nationality or worker type under Basic.`)}
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(2, minmax(0,1fr))", gap: 6 }}>
                {sec.fields.map(renderField)}
              </div>
              {section === "pay" && (
                <div className="si-hint" style={{ marginLeft: 0 }}>
                  {L("মোট মাসিক বেতন", "Gross monthly salary")}: <b>{cur} {money(gross)}</b> — {L("হাজিরা খাতায় এই বেতন দিয়েই পাওনা হিসাব হবে।", "the Attendance Register works out pay from this figure.")}
                  {rule.payroll === "WPS" && form.payMethod !== "wps" && ctx.expat ? ` ${L("আমিরাত/সৌদিতে প্রবাসীদের বেতন সাধারণত WPS-এ দিতে হয়।", "In the Gulf, foreign workers' pay usually has to go through WPS.")}` : ""}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="si-actions si-sticky-actions" style={{ background: "transparent" }}>
          {editRow && isOwner && <button type="button" className="pm-btn-secondary pm-btn--danger" disabled={saving} onClick={() => remove(editRow)}>🗑️ {L("মুছে ফেলুন", "Delete")}</button>}
          {editRow && <button type="button" className="pm-btn-secondary" onClick={() => printProfile(editRow)}>🖨️ {L("প্রোফাইল প্রিন্ট", "Print profile")}</button>}
          <span className="si-toolbar-gap" />
          <button type="button" className="pm-btn-secondary" disabled={saving} onClick={closeForm}>{L("বন্ধ", "Close")}</button>
          {!readOnly && <button type="button" className="pm-btn pm-btn--primary" disabled={saving} onClick={save}>{saving ? L("সেভ হচ্ছে…", "Saving…") : `💾 ${editRow ? L("আপডেট", "Update") : L("সেভ", "Save")} (Ctrl+S)`}</button>}
        </div>
      </div>
    </div>
  );

  const nextExpiry = (r) => (expiringByEmp.get(r.id) || [])[0];
  const expiryBadge = (x) => x && <span className="si-badge" style={{ color: x.daysLeft < 0 ? "#b91c1c" : "#b45309", marginLeft: 4 }}>⚠ {bn ? x.labelBn : x.label} {x.daysLeft < 0 ? L("শেষ", "expired") : `${x.daysLeft}${L("দি", "d")}`}</span>;

  const listTable = (
    <table className="pm-table">
      <thead><tr>
        <th style={{ width: 36 }} />
        <th style={{ width: 70 }}>{L("কোড", "Code")}</th>
        <th>{L("নাম", "Name")}</th>
        <th style={{ width: 120 }}>{L("পদবি", "Designation")}</th>
        <th style={{ width: 105 }}>{L("মোবাইল", "Mobile")}</th>
        <th style={{ width: 120 }}>{L("জাতীয়তা", "Nationality")}</th>
        <th style={{ width: 92 }}>{L("ভিসা / আইডি মেয়াদ", "Visa / ID expiry")}</th>
        <th style={{ width: 88 }} className="si-num">{L("বেতন", "Salary")}</th>
        <th style={{ width: 96 }} className="si-num">{L("এই মাসে দেওয়া", "Paid this month")}</th>
      </tr></thead>
      <tbody>
        {filtered.map((r) => {
          const left = r.status === "inactive";
          const expat = isExpat(r, shopCountry);
          const exp = expat ? r.visaExpiry || r.residentIdExpiry : r.localIdExpiry;
          return (
            <tr key={r.id} className={`pm-clickable${editId === r.id ? " pm-selected" : ""}`} onClick={() => openEdit(r)} style={left ? { color: "#6b7280" } : undefined}>
              <td>{r.photo ? <img src={r.photo} alt="" style={{ width: 26, height: 26, borderRadius: "50%", objectFit: "cover" }} /> : "👷"}</td>
              <td>{r.code}</td>
              <td className="si-strong">{r.name}{left ? <span className="si-badge" style={{ color: "#6b7280", marginLeft: 6 }}>{L("চলে গেছেন", "Left")} {fmtDay(r.leftDate)}</span> : expiryBadge(nextExpiry(r))}</td>
              <td>{r.designation}</td>
              <td>{r.mobile}</td>
              <td>{NATIONALITIES.find((x) => x.code === r.nationalityCode)?.[bn ? "bn" : "en"] || r.nationality || ""} <span className="si-badge" style={{ color: expat ? "#7c3aed" : "#0e7490" }}>{expat ? L("প্রবাসী", "Expat") : L("দেশি", "Local")}</span></td>
              <td>{fmtDay(exp)}</td>
              <td className="si-num">{grossSalary(r) > 0 ? money(grossSalary(r)) : ""}</td>
              <td className="si-num">{paidThisMonth.get(r.id) ? money(paidThisMonth.get(r.id)) : ""}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const listMobile = filtered.map((r) => (
    <button key={r.id} type="button" className="si-mrow" onClick={() => openEdit(r)} style={r.status === "inactive" ? { opacity: 0.6 } : undefined}>
      <div className="si-mrow-top"><span>{r.photo ? <img src={r.photo} alt="" style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover", verticalAlign: "middle", marginRight: 4 }} /> : "👷 "}{r.name}</span><span>{grossSalary(r) > 0 ? `${cur} ${money(grossSalary(r))}` : ""}</span></div>
      <div className="si-mrow-sub">
        <span>{[r.code, r.designation, r.mobile].filter(Boolean).join(" · ")}</span>
        <span>{r.status === "inactive" ? L("চলে গেছেন", "Left") : expiryBadge(nextExpiry(r))}</span>
      </div>
    </button>
  ));

  const urgent = alerts.filter((a) => a.tone !== "info").length;
  const openAlert = (a) => {
    const e = a.employeeId && all.find((r) => r.id === a.employeeId);
    if (e && !["salaryDue", "salarySoon", "attendance"].includes(a.kind)) openEdit(e, a.section || "basic");
    else onOpenAlert?.(a);
  };
  const toneColor = { danger: "#b91c1c", warn: "#b45309", info: "#334155" };
  const expiryPanel = showExpiry && (
    <div className="si-box" style={{ maxHeight: 240, overflow: "auto", marginBottom: 4 }}>
      {alerts.map((a) => {
        const txt = alertText(a, bn, cur);
        return (
          <button key={a.key} type="button" className="si-mrow" onClick={() => openAlert(a)} style={{ display: "flex", gap: 8, alignItems: "flex-start", textAlign: "left" }}>
            <span style={{ fontSize: 18 }}>{txt.icon}</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontWeight: 700, color: toneColor[a.tone] }}>{txt.title}</span>
              <span style={{ display: "block", fontSize: 11, color: "#64748b" }}>{txt.sub}</span>
            </span>
          </button>
        );
      })}
      {!alerts.length && <div className="si-empty">{L("এখন দেখার মতো কিছু নেই ✅", "Nothing needs attention ✅")}</div>}
      <div className="si-hint" style={{ margin: "4px 6px" }}>💡 {L("মেয়াদ শেষ (৩০ দিন আগে থেকে), বেতন বাকি / বেতনের দিন, আজকের হাজিরা, প্রবেশন শেষ, টিকিট পাওনা, জন্মদিন ও চাকরির বছর পূর্ণ — সব এখানে আর উপরের 🔔 বেলে আসে।", "Expiries (from 30 days before), unpaid salary / salary day, today's attendance, probation end, ticket due, birthdays and work anniversaries all show here and in the 🔔 bell.")}</div>
    </div>
  );

  return (
    <div ref={rootRef} className="si-root" style={fitH ? { height: fitH } : undefined}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>
      <div className="pm-reference-title">
        <strong>👷 {L("কর্মচারী", "Employees")}</strong>
        <span>{L("মাস্টার", "Master")}</span>
      </div>
      <div className="si-toolbar">
        {canManage && <button type="button" className="pm-btn pm-btn--primary" onClick={openNew}>+ {L("নতুন কর্মচারী", "New Employee")}</button>}
        <button type="button" className="pm-btn-secondary" onClick={printList} disabled={!filtered.length}>🖨️ {L("তালিকা প্রিন্ট", "Print list")}</button>
      </div>
      <div className="si-kpis">
        <div className="si-kpi"><span>{L("কর্মরত", "Working")}</span><b>{activeList.length}</b></div>
        <div className="si-kpi"><span>{L("প্রবাসী / দেশি", "Expat / Local")}</span><b>{expatCount} / {activeList.length - expatCount}</b></div>
        <div className="si-kpi"><span>{L("মোট মাসিক বেতন", "Total monthly salary")}</span><b>{cur} {money(salaryTotal)}</b></div>
        <div className="si-kpi"><span>{L("এই মাসে দেওয়া", "Paid this month")}</span><b style={{ color: "#b91c1c" }}>{cur} {money(paidTotal)}</b></div>
        <button type="button" className="si-kpi" onClick={() => setShowExpiry((v) => !v)} style={{ cursor: "pointer", border: urgent ? "1px solid #f59e0b" : undefined, background: showExpiry ? "#fef3c7" : undefined, font: "inherit", textAlign: "left" }}>
          <span>🔔 {L("নোটিফিকেশন", "Alerts")}</span><b style={{ color: urgent ? "#b45309" : undefined }}>{alerts.length}{urgent ? ` (${urgent} ${L("জরুরি", "urgent")})` : ""} ▾</b>
        </button>
      </div>
      {expiryPanel}
      <div className="si-filters">
        <div className="si-search">
          <input className="pm-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={L("খুঁজুন: নাম, কোড, মোবাইল, পাসপোর্ট, আইডি…", "Search: name, code, mobile, passport, ID…")} />
          {search && <button type="button" onClick={() => setSearch("")}>✕</button>}
        </div>
        <label className="pm-check"><input type="checkbox" checked={showLeft} onChange={(e) => setShowLeft(e.target.checked)} /> {L("চলে যাওয়াদেরও দেখাও", "Show employees who left")}</label>
      </div>
      <div className="si-main is-all">
        <div className="si-box">
          {filtered.length ? (mobile ? listMobile : listTable) : <div className="si-empty">{all.length ? L("কিছু পাওয়া যায়নি", "Nothing matches") : L("এখনো কোনো কর্মচারী যোগ করা হয়নি", "No employees yet")}</div>}
        </div>
      </div>
      <div className="si-statusbar">
        <span>{L("দেখাচ্ছে", "Showing")} <b>{filtered.length}</b> / {all.length}</span>
        {shopCountry && <span>{L("দোকানের দেশ", "Shop country")}: <b>{shopCountry}</b></span>}
      </div>
      {formWindow}
    </div>
  );
}
