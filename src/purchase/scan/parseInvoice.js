// Reads a supplier invoice from text rows (from a PDF text layer or OCR) without any AI: header fields by
// pattern, item lines by finding qty x rate = amount among the numbers of a row.
// rows: [{ text, cells: [{ x, text }] }] in reading order.

const NUM_RE = /^-?\(?[\d,]*\.?\d+\)?$/;
const toNum = (s) => {
  const t = String(s).replace(/[(),]/g, "").replace(/^AED|^Dhs?\.?/i, "");
  const v = parseFloat(t);
  return Number.isFinite(v) ? v : null;
};
// line amounts are rounded to fils, so a real fit is within a few fils (0.5 % covers rounded rates)
const near = (a, b, tol = 0.005) => Math.abs(a - b) <= Math.max(0.02, Math.abs(b) * tol);
const r2 = (v) => Math.round(v * 100) / 100;

const HEADER_WORDS = /\b(description|particulars|item\s*name|qty|quantity|unit\s*price|rate|amount|s\.?\s*no)\b/i;
const TOTAL_WORDS = /\b(sub\s*-?\s*total|total|vat|tax|discount|round\s*off|balance|amount\s+due|paid|net\s+amount|grand)\b/i;
const UNITS = ["PCS", "PC", "NOS", "NO", "SET", "SETS", "KG", "LTR", "L", "BOX", "CTN", "DZ", "MTR", "M", "CM", "PKT", "PAIR", "EA", "EACH", "ROLL", "BTL"];

// "15/10/2026", "15-10-2026", "2026-10-15", "15 Oct 2026", "15-Oct-26" -> "2026-10-15"
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
export function parseDate(text) {
  const s = String(text || "");
  const pad = (n) => String(n).padStart(2, "0");
  const full = (y) => (y < 100 ? 2000 + y : y);
  let m = s.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (m && Number(m[2]) <= 12 && Number(m[1]) <= 31) return `${full(Number(m[3]))}-${pad(m[2])}-${pad(m[1])}`;
  m = s.match(/\b(\d{1,2})[\s-]*(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*[\s,-]*(\d{2,4})\b/i);
  if (m) return `${full(Number(m[3]))}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(m[1])}`;
  return "";
}

function parseHeader(rows) {
  const all = rows.map((r) => r.text);
  const joined = all.join("\n");
  const out = { invoiceNo: "", date: "", trn: "", supplierName: "", grandTotal: null, vatTotal: null };
  for (const line of all) {
    if (!out.invoiceNo) {
      const m = line.match(/\b(?:tax\s+)?(?:invoice|inv|bill|quot(?:ation)?|qtn|doc(?:ument)?|voucher|delivery\s*note|dn)\s*(?:no\.?|number|#|num)\s*[:\-.]?\s*([A-Z0-9][A-Z0-9/\-_.]{1,24})/i);
      if (m && /\d/.test(m[1])) out.invoiceNo = m[1].replace(/[.,]$/, "");
    }
    if (!out.date && /\bdate\b/i.test(line)) out.date = parseDate(line);
  }
  if (!out.date) out.date = parseDate(joined);
  const trn = joined.match(/\bTRN\s*(?:no\.?|number)?\s*[:\-.]?\s*(\d[\d\s-]{13,20}\d)/i);
  if (trn) out.trn = trn[1].replace(/\D/g, "");
  // the supplier: a company-looking line near the top (LLC / Trading / Est. …), else the first real text line;
  // logos read by OCR give short junk lines, so skip lines with fewer than 8 letters
  const top = all.slice(0, 12).map((l) => l.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9.)]+$/g, "").trim())
    .filter((l) => (l.match(/[A-Za-z]/g) || []).length >= 8 && !/\b(tax\s+)?invoice\b|quotation|^\s*(date|trn|tel|phone|mob|email|e-mail|p\.?o\.?\s*box|shop\s*no|address)/i.test(l));
  out.supplierName = (top.find((l) => /\b(l\.?\s*l\.?\s*c|llc|trading|est\.?|establishment|co\.?|company|ltd|fze|fzco|enterprises?)\b/i.test(l)) || top[0] || "").slice(0, 80);
  // totals: the last "grand total / total / net amount" with a number, and the VAT amount
  for (const line of all) {
    const nums = (line.match(/-?[\d,]*\.\d{2}\b|\b\d{1,3}(?:,\d{3})+\b/g) || []).map(toNum).filter((v) => v !== null);
    if (!nums.length) continue;
    if (/\b(grand\s*total|total\s*amount|net\s*(total|amount)|invoice\s*total|total\s*(incl|inc|with)|amount\s*payable|total\s*due)\b/i.test(line)) out.grandTotal = nums[nums.length - 1];
    else if (out.grandTotal === null && /^\s*total\b/i.test(line)) out.grandTotal = nums[nums.length - 1];
    if (/\b(vat|tax)\b/i.test(line) && !/\b(trn|registration|incl|exclusive|excl)\b/i.test(line) && !/%\s*$/.test(line.trim())) out.vatTotal = nums[nums.length - 1];
  }
  return out;
}

// One table row -> item line, or null. Finds qty and rate whose product (optionally less a discount, plus VAT)
// matches one of the amounts at the end of the row.
export function parseItemRow(row) {
  const text = row.text || row.cells.map((c) => c.text).join(" ");
  if (HEADER_WORDS.test(text) && !/\d+\.\d{2}/.test(text)) return null;
  // drop tokens without a letter or digit (table borders read as "|")
  // and the border marks OCR glues onto a word ("|LG", "[LG", "(PCS")
  const tokens = (row.cells && row.cells.length ? row.cells.map((c) => c.text).join(" ") : text).split(/\s+/)
    .map((t) => t.replace(/^[|[\](){}:;'"~`]+|[|[\](){}:;'"~`,]+$/g, "")).filter((t) => /[A-Za-z0-9]/.test(t));
  const numIdx = [];
  tokens.forEach((t, i) => { const clean = t.replace(/%$/, ""); if (NUM_RE.test(clean) && toNum(clean) !== null) numIdx.push(i); });
  if (numIdx.length < 2) return null;
  const nums = numIdx.map((i) => ({ i, v: toNum(tokens[i].replace(/%$/, "")), pct: /%$/.test(tokens[i]) }));
  // the first token may be the serial number; never treat the last number as the qty
  let best = null;
  const amounts = nums.slice(-3).filter((n) => !n.pct && n.v > 0);
  for (const A of amounts) {
    for (let a = 0; a < nums.length; a++) for (let b = 0; b < nums.length; b++) {
      if (a === b) continue;
      const q = nums[a], r = nums[b];
      if (q.pct || r.pct || q.i >= A.i || r.i >= A.i || q.v <= 0 || r.v <= 0 || q.v > 100000) continue;
      if (q.i === 0 || r.i === 0) continue; // the first token of a row is its serial number
      const gross = q.v * r.v;
      const fits = [];
      fits.push({ disc: 0, vat: 0, ok: near(gross, A.v) });
      for (const vat of [5, 15]) fits.push({ disc: 0, vat, ok: near(gross * (1 + vat / 100), A.v) });
      // a discount amount sitting between the rate and the amount
      for (const d of nums) if (d.i > Math.max(q.i, r.i) && d.i < A.i && !d.pct && d.v > 0 && d.v < gross) {
        fits.push({ disc: d.v, vat: 0, ok: near(gross - d.v, A.v) });
        for (const vat of [5, 15]) fits.push({ disc: d.v, vat, ok: near((gross - d.v) * (1 + vat / 100), A.v) });
      }
      for (const f of fits) {
        if (!f.ok) continue;
        // prefer: whole-number qty, qty before rate, the largest (rightmost) amount
        const score = (Number.isInteger(q.v) ? 4 : 0) + (q.i < r.i ? 2 : 0) + (A === amounts[amounts.length - 1] ? 1 : 0) + (f.disc ? 0 : 0.5);
        if (!best || score > best.score) best = { score, q, r, A, ...f };
      }
    }
  }
  if (!best) return null;
  if (TOTAL_WORDS.test(text) && !/[A-Za-z]{3,}.*\d/.test(tokens.slice(0, best.q.i).join(" "))) return null;
  const first = Math.min(best.q.i, best.r.i);
  let words = tokens.slice(0, first);
  if (words.length && NUM_RE.test(words[0]) && words.length > 1) words = words.slice(1); // serial no.
  let unit = "";
  const after = tokens[best.q.i + 1];
  if (after && UNITS.includes(after.toUpperCase().replace(/[.]/g, ""))) unit = after;
  const lastWord = words[words.length - 1];
  if (!unit && lastWord && UNITS.includes(lastWord.toUpperCase().replace(/[.]/g, ""))) { unit = lastWord; words = words.slice(0, -1); }
  // the code / part number: the first token with a digit (4+ characters) among the first words, joined with a short
  // digit token before or after it ("8PK 1275"); words before it are a brand prefix ("LG 4630131120"),
  // words after it the description. Else a code-looking last word.
  let code = "", brand = "";
  const hasDigit = (t) => /\d/.test(t);
  const isCode = (t) => hasDigit(t) && /^[A-Z0-9][A-Z0-9\-/.()%]{2,}$/i.test(t) && !/^\d{1,3}$/.test(t);
  const start = words.slice(0, 4).findIndex((t) => isCode(t) && t.replace(/[^A-Za-z0-9]/g, "").length >= 4);
  if (start >= 0 && words.length > 1) {
    let s = start, e = start + 1;
    if (s > 0 && hasDigit(words[s - 1]) && words[s - 1].length <= 4) s--;
    if (e < words.length - 1 && hasDigit(words[e]) && words[e].length <= 5) e++;
    code = words.slice(s, e).join(" ");
    brand = s > 0 && words.slice(0, s).join("").length <= 6 ? words.slice(0, s).join(" ") : "";
    words = brand ? words.slice(e) : [...words.slice(0, s), ...words.slice(e)];
  } else if (words.length > 1 && isCode(words[words.length - 1])) { code = words[words.length - 1]; words = words.slice(0, -1); }
  const vatTok = nums.find((n) => n.pct);
  const name = words.join(" ").replace(/\s{2,}/g, " ").trim();
  if (!name && !code) return null;
  return {
    raw: text, code, brand, name: name || code, qty: best.q.v, unit, rate: best.r.v,
    discount: best.disc ? r2(best.disc) : 0, vatPerc: vatTok ? vatTok.v : best.vat, amount: best.A.v,
  };
}

export function parseInvoice(rows) {
  const header = parseHeader(rows);
  const lines = [];
  for (const row of rows) {
    const item = parseItemRow(row);
    if (item) lines.push(item);
  }
  const linesTotal = r2(lines.reduce((s, l) => s + l.amount, 0));
  // no VAT column on the lines, VAT only in the totals: take the rate that turns the lines total into the grand total
  if (lines.length && header.grandTotal && lines.every((l) => !l.vatPerc)) {
    const v = [5, 15].find((p) => near(linesTotal * (1 + p / 100), header.grandTotal, 0.002));
    if (v) lines.forEach((l) => { l.vatPerc = v; });
  }
  return { ...header, lines, linesTotal };
}
