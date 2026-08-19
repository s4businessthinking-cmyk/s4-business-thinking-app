import * as XLSX from "xlsx";
import { parseCsv } from "./csv";

function cellText(value) {
  if (value == null) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).trim();
}

function normalizeHint(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9%]/g, "");
}

function looksLikeHeaderRow(cells = []) {
  const joined = cells.map((cell) => normalizeHint(cell)).join(" ");
  return /productname|productcode|shoppart|barcode/.test(joined);
}

function matrixToRows(matrix) {
  if (!Array.isArray(matrix) || !matrix.length) return { headers: [], rows: [] };
  const headerIndex = Math.max(0, matrix.findIndex(looksLikeHeaderRow));
  const headerCells = matrix[headerIndex] || [];
  if (!headerCells.some((cell) => cellText(cell))) return { headers: [], rows: [] };

  const seen = new Map();
  const headers = headerCells.map((raw, index) => {
    const base = cellText(raw) || `Column ${index + 1}`;
    const key = base.toLowerCase();
    const count = (seen.get(key) || 0) + 1;
    seen.set(key, count);
    return count === 1 ? base : `${base} (${count})`;
  });

  const rows = matrix.slice(headerIndex + 1)
    .filter((cells) => (cells || []).some((cell) => cellText(cell)))
    .map((cells) => Object.fromEntries(headers.map((header, index) => [header, cellText(cells?.[index])])));

  return { headers, rows };
}

function isOleCompound(bytes) {
  return bytes.length >= 8
    && bytes[0] === 0xD0 && bytes[1] === 0xCF
    && bytes[2] === 0x11 && bytes[3] === 0xE0;
}

function isZipContainer(bytes) {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4B;
}

function parseExcelWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true, raw: false });
  const sheetName = workbook.SheetNames.find((name) => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: "" });
    return rows.some((row) => Array.isArray(row) && row.some((cell) => cellText(cell)));
  }) || workbook.SheetNames[0];
  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  });
  return matrixToRows(matrix);
}

function decodeText(buffer) {
  const utf8 = new TextDecoder("utf-8").decode(buffer).replace(/^\uFEFF/, "");
  const replacementCount = (utf8.match(/\uFFFD/g) || []).length;
  if (replacementCount < 20) return utf8;
  try {
    return new TextDecoder("windows-1256").decode(buffer);
  } catch {
    return utf8;
  }
}

export async function parseProductMasterFile(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const name = String(file.name || "");
  const excelByName = /\.xlsx?$/i.test(name);

  if (isOleCompound(bytes) || isZipContainer(bytes) || excelByName) {
    const parsed = parseExcelWorkbook(buffer);
    if (!parsed.headers.length || !parsed.rows.length) {
      throw new Error("No product rows found in the Excel file");
    }
    return parsed;
  }

  const parsed = parseCsv(decodeText(buffer));
  if (!parsed.headers.length || !parsed.rows.length) {
    throw new Error("No data rows found in the file");
  }
  return parsed;
}
