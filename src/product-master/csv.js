function detectDelimiter(text) {
  const candidates = [",", "\t", ";"];
  const counts = new Map(candidates.map((candidate) => [candidate, 0]));
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && text[index + 1] === '"') {
      index += 1;
      continue;
    }
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === "\n" || char === "\r")) break;
    else if (!quoted && counts.has(char)) counts.set(char, counts.get(char) + 1);
  }
  return candidates.sort((a, b) => counts.get(b) - counts.get(a))[0];
}

function parseDelimitedRows(text, delimiter) {
  const records = [];
  let record = [];
  let value = "";
  let quoted = false;

  const pushValue = () => {
    record.push(value.trim());
    value = "";
  };
  const pushRecord = () => {
    pushValue();
    if (record.some((cell) => cell !== "")) records.push(record);
    record = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      pushValue();
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      pushRecord();
    } else {
      value += char;
    }
  }
  if (value || record.length) pushRecord();
  return records;
}

export function parseCsvLine(line, delimiter = ",") {
  return parseDelimitedRows(String(line), delimiter)[0] || [];
}

export function parseCsv(text) {
  const source = String(text || "").replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(source);
  const records = parseDelimitedRows(source, delimiter);
  if (records.length < 2) return { headers: [], rows: [], delimiter };

  const seen = new Map();
  const headers = records[0].map((raw, index) => {
    const base = String(raw || "").trim() || `Column ${index + 1}`;
    const count = (seen.get(base.toLowerCase()) || 0) + 1;
    seen.set(base.toLowerCase(), count);
    return count === 1 ? base : `${base} (${count})`;
  });
  const rows = records.slice(1).map((cells) => {
    const row = {};
    headers.forEach((header, index) => { row[header] = cells[index] ?? ""; });
    return row;
  });
  return { headers, rows, delimiter };
}
