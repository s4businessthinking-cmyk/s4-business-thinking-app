import test from "node:test";
import assert from "node:assert/strict";
import { countryCodeOf, docMessage, normalizeWaPhone, partyPhone, pdfFileName, setShareCountryCode, shareOutcome, voucherShareDoc, waTextUrl } from "./whatsappDocShare.js";
import { defaultTemplates, fillTemplate, logEntry, normalizeTemplates, recipientsOf, saveTemplate, unknownVars } from "./bulkMessage.js";

test("phone: WhatsApp field first, local UAE numbers get 971, junk rejected", () => {
  assert.equal(partyPhone({ whatsappNumber: "+971 55 111 2222", mobileNumber: "050 000 0000" }), "+971 55 111 2222");
  assert.equal(partyPhone({ mobileNumber: "0501234567" }), "0501234567");
  assert.equal(partyPhone(null), "");
  assert.equal(normalizeWaPhone("050 123 4567"), "971501234567");
  assert.equal(normalizeWaPhone("+971-50-123-4567"), "971501234567");
  assert.equal(normalizeWaPhone("00971501234567"), "971501234567");
  assert.equal(normalizeWaPhone("01712345678", "880"), "8801712345678");
  assert.equal(normalizeWaPhone("12345"), "");
  assert.equal(normalizeWaPhone(""), "");
  assert.equal(waTextUrl("971501234567", "Hi & bye"), "https://wa.me/971501234567?text=Hi%20%26%20bye");
});

test("document message and file name: BN / EN, total, party, shop", () => {
  const en = docMessage({ shop: "S4 Parts", docType: "Tax Invoice", no: "SI-0001", date: "2026-11-24", total: 1234.5, cur: "AED", party: "Al Noor" });
  assert.equal(en, "Dear Al Noor,\nTax Invoice SI-0001 dated 24/11/2026\nTotal: AED 1,234.50\nPlease find the PDF attached.\n- S4 Parts");
  const bn = docMessage({ bn: true, shop: "S4", docType: "কোটেশন", no: "QT-7", date: "2026-11-24", total: 10, party: "আলী" });
  assert.ok(bn.startsWith("প্রিয় আলী,\nকোটেশন QT-7, তারিখ 24/11/2026\nমোট: AED 10.00"));
  assert.equal(docMessage({ docType: "Journal voucher", no: "JV-1" }).includes("Total"), false);
  assert.equal(pdfFileName("SI-0001", "Al Noor & Sons / LLC"), "SI-0001-Al-Noor-Sons-LLC.pdf");
  assert.equal(pdfFileName(""), "document.pdf");
  const rv = voucherShareDoc({ kind: "receipt", raw: { receiptNo: "RV-3", receiptDate: "2026-11-20", customerName: "Ali", totalAmount: 50, customerMobile: "0501112222" }, html: "<p>x</p>" });
  assert.deepEqual([rv.fileName, rv.phone], ["RV-3-Ali.pdf", "0501112222"]);
  assert.ok(rv.text.includes("Receipt voucher RV-3") && rv.text.includes("AED 50.00"));
  const pv = voucherShareDoc({ kind: "payment", raw: { paymentNo: "PV-1", vendorName: "Gulf", totalAmount: 100, discountAmount: 5 }, partyRecord: { whatsappNumber: "0559998888" }, html: "x", bn: true });
  assert.ok(pv.text.includes("পেমেন্ট ভাউচার PV-1") && pv.text.includes("AED 95.00"));
  assert.equal(pv.phone, "0559998888");
});

test("shop country code for local numbers", () => {
  assert.equal(countryCodeOf({ countryCode: "+880" }), "880");
  assert.equal(countryCodeOf({ mobile: "+966 55 000 0000" }), "966");
  assert.equal(countryCodeOf({ mobile: "00968 9000 0000" }), "968");
  assert.equal(countryCodeOf({ mobile: "050 000 0000", currency: "BDT" }), "880");
  assert.equal(countryCodeOf(null), "971");
  setShareCountryCode("880");
  assert.equal(normalizeWaPhone("01712345678"), "8801712345678");
  setShareCountryCode("971");
  assert.equal(normalizeWaPhone("0501234567"), "971501234567");
});

test("share outcome: says the PDF is not attached by itself, never claims sent", () => {
  const p = "C:\Docs\SI-1.pdf";
  const texts = [
    shareOutcome({ mode: "desktop", desktop: true, clipboard: true, path: p }), shareOutcome({ mode: "desktop", desktop: true, clipboard: false, path: p }),
    shareOutcome({ mode: "desktop", desktop: false, clipboard: true, path: p }), shareOutcome({ mode: "android", opened: true }),
    shareOutcome({ mode: "browser", downloaded: true, opened: true }), shareOutcome({ mode: "desktop-old", downloaded: true, opened: true }),
    shareOutcome({ mode: "desktop", desktop: true, path: "", pdfError: "boom" }), shareOutcome({ mode: "browser", downloaded: true, opened: false }),
  ].map((o) => o.text);
  assert.ok(texts[0].includes("WhatsApp Desktop") && texts[0].includes("Ctrl+V") && texts[0].includes("not attached by itself"));
  assert.ok(texts[1].includes("Drag the PDF"));
  assert.ok(texts[2].includes("browser (wa.me)") && texts[2].includes("Drag the PDF"));
  assert.ok(texts[4].includes("cannot hand files") && texts[4].includes("wa.me tab"));
  assert.ok(texts[5].includes("older build"));
  assert.ok(texts[6].includes("could not be made: boom"));
  assert.ok(texts[7].includes("pop-ups are blocked"));
  texts.forEach((t) => assert.equal(/\bsent\b|delivered/i.test(t), false, t));
});

test("templates: defaults, save rules, unknown variables, fill", () => {
  assert.deepEqual(normalizeTemplates([]).map((t) => t.id), ["greet", "due", "thanks"]);
  assert.equal(normalizeTemplates(null, true)[0].name, "শুভেচ্ছা");
  assert.deepEqual(unknownVars("Hi {name}, {foo} {due} {bar}"), ["foo", "bar"]);
  const list = defaultTemplates();
  assert.equal(saveTemplate(list, { name: "", body: "x" }).error, "name");
  assert.equal(saveTemplate(list, { name: "X", body: "  " }).error, "body");
  assert.deepEqual(saveTemplate(list, { name: "X", body: "{amount}" }), { error: "vars", vars: ["amount"] });
  assert.equal(saveTemplate(list, { name: "greeting", body: "Hi" }).error, "duplicate");
  const added = saveTemplate(list, { name: "Eid", body: "Eid Mubarak {name}" });
  assert.equal(added.list.length, 4);
  const off = saveTemplate(added.list, { ...added.list[3], active: false });
  assert.equal(off.list[3].active, false);
  assert.equal(normalizeTemplates(off.list).length, 4);
  assert.equal(fillTemplate("Dear {name}, {shop} {due} {loyaltyNo} {other}", { name: "Ali", shop: "S4", due: "AED 5.00" }), "Dear Ali, S4 AED 5.00  {other}");
});

test("recipients: numbers, filters, skipped count, inactive left out", () => {
  const customers = [
    { id: "a", customerName: "Ali", mobileNumber: "0501112222", loyaltyMember: true, loyaltyNo: "M-1" },
    { id: "b", customerName: "Bilal", whatsappNumber: "+971 55 333 4444" },
    { id: "c", customerName: "Chand", mobileNumber: "" },
    { id: "d", customerName: "Dawood", mobileNumber: "0507778888", status: "blocked" },
    { id: "e", customerName: "Esa", mobileNumber: "12" },
  ];
  const dues = new Map([["a", 120.5], ["b", 0]]);
  const all = recipientsOf(customers, dues);
  assert.deepEqual(all.list.map((r) => [r.name, r.phone]), [["Ali", "971501112222"], ["Bilal", "971553334444"]]);
  assert.equal(all.noNumber, 2);
  assert.deepEqual(recipientsOf(customers, dues, { onlyDue: true }).list.map((r) => r.id), ["a"]);
  assert.deepEqual(recipientsOf(customers, dues, { onlyMembers: true }).list.map((r) => r.loyaltyNo), ["M-1"]);
  assert.deepEqual(recipientsOf(customers, dues, { query: "bil" }).list.map((r) => r.id), ["b"]);
  const entry = logEntry(all.list[0], "opened", "Greeting", new Date("2026-11-24T10:00:00.000Z"));
  assert.deepEqual(entry, { at: "2026-11-24T10:00:00.000Z", id: "a", name: "Ali", phone: "971501112222", status: "opened", template: "Greeting" });
});
