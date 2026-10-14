import test from "node:test";
import assert from "node:assert/strict";
import { parseInvoice, parseItemRow, parseLooseRow, parseDate } from "./parseInvoice.js";
import { buildProductIndex, matchLine, matchVendor, aliasKey } from "./matchInvoice.js";

const rows = (text) => text.split("\n").map((t) => t.trim()).filter(Boolean).map((t) => ({ text: t, cells: t.split(/\s+/).map((w, i) => ({ x: i, text: w })) }));

const SAMPLE = `
AL NOOR AUTO SPARE PARTS TRADING LLC
P.O. Box 1234, Sharjah, UAE  Tel: 06 555 1234
TRN: 100234567800003
TAX INVOICE
Invoice No: INV-2026-0457      Date: 14/10/2026
S.No Item Code Description Qty Unit Rate Amount
1 OF-90915 Oil Filter Toyota 10 PCS 12.50 125.00
2 BP-4471 Brake Pad Front Corolla 4 SET 85.00 340.00
3 Spark Plug NGK BKR6E 20 PCS 9.00 180.00
4 AF-17801 Air Filter Hilux 5 PCS 30.00 10.00 140.00
Sub Total 785.00
VAT 5% 39.25
Grand Total AED 824.25
`;

test("header: supplier, TRN, invoice number, date and totals", () => {
  const inv = parseInvoice(rows(SAMPLE));
  assert.equal(inv.supplierName, "AL NOOR AUTO SPARE PARTS TRADING LLC");
  assert.equal(inv.trn, "100234567800003");
  assert.equal(inv.invoiceNo, "INV-2026-0457");
  assert.equal(inv.date, "2026-10-14");
  assert.equal(inv.grandTotal, 824.25);
  assert.equal(inv.vatTotal, 39.25);
});

test("item lines: qty x rate = amount, code, unit, discount; totals rows skipped", () => {
  const inv = parseInvoice(rows(SAMPLE));
  assert.equal(inv.lines.length, 4);
  assert.deepEqual(inv.lines.map((l) => [l.code, l.name, l.qty, l.unit, l.rate, l.discount, l.amount]), [
    ["OF-90915", "Oil Filter Toyota", 10, "PCS", 12.5, 0, 125],
    ["BP-4471", "Brake Pad Front Corolla", 4, "SET", 85, 0, 340],
    ["BKR6E", "Spark Plug NGK", 20, "PCS", 9, 0, 180],
    ["AF-17801", "Air Filter Hilux", 5, "PCS", 30, 10, 140],
  ]);
  assert.equal(inv.linesTotal, 785);
});

test("a line whose amount includes 5% VAT", () => {
  const l = parseItemRow(rows("Wiper Blade 22in 2 15.00 5% 31.50")[0]);
  assert.equal(l.qty, 2); assert.equal(l.rate, 15); assert.equal(l.vatPerc, 5); assert.equal(l.amount, 31.5);
});

test("dates in the usual formats", () => {
  assert.equal(parseDate("Date: 2026-10-14"), "2026-10-14");
  assert.equal(parseDate("Dated 5-Oct-26"), "2026-10-05");
  assert.equal(parseDate("14.10.2026"), "2026-10-14");
});

test("matching: barcode, code, linked before for this vendor, name suggestion, none", () => {
  const products = [
    { id: "p1", name: "Oil Filter Toyota Corolla", code: "OF-90915" },
    { id: "p2", name: "Brake Pad Front", code: "BPF-1", moreBarcodes: ["BP-4471"] },
    { id: "p3", name: "Spark Plug NGK", code: "SP-1" },
    { id: "p4", name: "Air Filter Hilux 2.7", code: "AFH", supplierAliases: [aliasKey("v1", { code: "AF-17801" })] },
  ];
  const idx = buildProductIndex(products);
  const [oil, brake, spark, air] = parseInvoice(rows(SAMPLE)).lines;
  assert.deepEqual([matchLine(oil, idx, "v1").status, matchLine(oil, idx, "v1").product.id, matchLine(oil, idx, "v1").how], ["exact", "p1", "code"]);
  assert.deepEqual([matchLine(brake, idx, "v1").product.id, matchLine(brake, idx, "v1").how], ["p2", "barcode"]);
  assert.deepEqual([matchLine(spark, idx, "v1").status, matchLine(spark, idx, "v1").product.id], ["suggest", "p3"]);
  assert.deepEqual([matchLine(air, idx, "v1").product.id, matchLine(air, idx, "v1").how], ["p4", "linked before"]);
  assert.equal(matchLine(air, idx, "v2").how, "name"); // the link is per vendor
  assert.equal(matchLine({ name: "Radiator Cap", code: "", raw: "Radiator Cap" }, idx, "v1").status, "none");
});

test("vendor by TRN, else by name", () => {
  const vendors = [{ id: "v1", vendorName: "Al Noor Auto Spare Parts", trnNumber: "100234567800003" }, { id: "v2", vendorName: "Gulf Motors" }];
  assert.equal(matchVendor({ trn: "100234567800003", supplierName: "x" }, vendors).vendor.id, "v1");
  assert.equal(matchVendor({ trn: "", supplierName: "AL NOOR AUTO SPARE PARTS TRADING LLC" }, vendors).vendor.id, "v1");
  assert.equal(matchVendor({ trn: "", supplierName: "Unknown Trading" }, vendors).status, "none");
});

test("OCR rows with table borders read as |, and VAT given only in the totals", () => {
  const ocr = `INVOICE
Invoice No: INV-9 Date: 14/10/2026
1 AOF-1 Oil Filter Toyota 10 | PCS 40.00 30.00 370.00
2 BP-4471 Brake Pad Front Corolla 4 | SET 85.00 340.00
3 RC-220 Radiator Cap 0.9 Bar 6 PCS 12.50 75.00
Sub Total 785.00
VAT 5% 39.25
Grand Total AED 824.25`;
  const inv = parseInvoice(rows(ocr));
  assert.deepEqual(inv.lines.map((l) => [l.code, l.qty, l.unit, l.rate, l.discount, l.amount, l.vatPerc]), [
    ["AOF-1", 10, "PCS", 40, 30, 370, 5], ["BP-4471", 4, "SET", 85, 0, 340, 5], ["RC-220", 6, "PCS", 12.5, 0, 75, 5],
  ]);
  assert.equal(inv.linesTotal, 785);
});

test("part number inside the shop's longer product codes; brand and side pick between several", () => {
  const products = [
    { id: "a", name: "STARTER", code: "0001416002 LG MERC/LP" },
    { id: "b1", name: "NIPPLE", code: "MC889604 CE1306 J&P RR LH W/G NIPPLE" },
    { id: "b2", name: "NIPPLE", code: "MC889604 CE1306 LG RR LH W/G NIPPLE" },
    { id: "b3", name: "NIPPLE", code: "MC889604 CE1306 LG RR RH W/G NIPPLE" },
    { id: "c", name: "FAN BELT", code: "8PK1275 LG" },
    { id: "d", name: "BOLT", code: "BOLT 10.00 MM 2000" },
  ];
  const idx = buildProductIndex(products);
  const line = (t) => parseItemRow(rows(t)[0]);
  const starter = matchLine(line("1 LG 0001416002 STARTER 1 PCS 100.00 100.00"), idx, "v");
  assert.deepEqual([starter.status, starter.product.id, starter.how], ["exact", "a", "part no"]);
  assert.equal(matchLine(line("2 LG MC889604 LH NIPPLE 1 PCS 20.00 20.00"), idx, "v").product.id, "b2");
  assert.equal(matchLine(line("3 LG 8PK 1275 BELT 1 PCS 60.00 60.00"), idx, "v").product.id, "c");
  // an OCR slip of one character is only a suggestion
  const slip = matchLine(line("4 LG MC883604 LH NIPPLE 1 PCS 20.00 20.00"), idx, "v");
  assert.deepEqual([slip.status, slip.product.id, slip.how], ["suggest", "b2", "part no (close)"]);
  // qty / rate / amount of the row are not part numbers
  assert.notEqual(matchLine(line("5 LG X9 WASHER 1 PCS 20.00 20.00"), idx, "v").product?.id, "d");
});

test("blurred photo rows: part number kept without prices; brand prefix like ELR finds ELRING", () => {
  const products = [
    { id: "e", name: "WHEEL SEAL KIT", code: "208.230 KIT RR HUB ELRING MERC/ACTROS/LP", barcode: "6243560080", company: "ELRING" },
    { id: "e2", name: "WHEEL SEAL KIT", code: "6243560080 FEBI", company: "FEBI" },
    { id: "y", name: "AXLE", code: "17801-15070 SM MAZDA 1992-05/2002-01" },
  ];
  const idx = buildProductIndex(products);
  const l = parseLooseRow(rows("2 ELR 6243560080/M HUB SEAL KIT MERC 5 PCS 3s.0O 17s 0O")[0]);
  assert.deepEqual([l.brand, l.code, l.qty, l.unit, l.loose], ["ELR", "6243560080/M", 5, "PCS", true]);
  assert.equal(matchLine(l, idx, "v").product.id, "e");
  // a year is not a part number; header rows are not items
  assert.equal(parseLooseRow(rows("SHOP SINCE 1992 MUSAFFAH 64")[0]), null);
  assert.notEqual(matchLine({ code: "1992", name: "", raw: "1992" }, idx, "v").how, "part no");
  assert.equal(parseLooseRow(rows("TRN 100364990000003")[0]), null);
  const inv = parseInvoice(rows("1 DFT 0980623220 HUB BOLT 50 PCS 6 7S 33?\nVAT 5% 85.08"));
  assert.deepEqual([inv.lines.length, inv.loose.length, inv.loose[0].code, inv.loose[0].qty, inv.loose[0].vatPerc], [0, 1, "0980623220", 50, 5]);
});
