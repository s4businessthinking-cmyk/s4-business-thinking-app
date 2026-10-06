const STOP_LINE = /^\s*fit(ting)?\s+vehicles?\b/i;

const alnumLen = (token) => token.replace(/[^a-z0-9]/gi, "").length;
const hasDigit = (token) => /\d/.test(token);
const isWord = (token) => !hasDigit(token);

export function normalizePartNumber(value) {
  return String(value || "").replace(/\s+/g, "").toLowerCase();
}

function parseLine(line) {
  const tokens = line.split(/\s+/).map((t) => t.replace(/^[,;()[\]]+|[,;()[\]]+$/g, "")).filter(Boolean);
  const out = [];
  let group = [];
  const flush = () => {
    const joined = group.join("");
    if (hasDigit(joined) && alnumLen(joined) >= 3) out.push(joined);
    group = [];
  };
  const groupHasDigit = () => group.some(hasDigit);

  tokens.forEach((token, i) => {
    const next = tokens[i + 1];
    if (isWord(token)) {
      if (alnumLen(token) > 2) { flush(); return; }
      if (groupHasDigit()) {
        const suffix = token.length === 1 && (!next || isWord(next) || alnumLen(next) > 4);
        if (suffix) { group.push(token); return; }
        flush();
      }
      group.push(token);
      return;
    }
    if (alnumLen(token) > 4) {
      if (group.length && !groupHasDigit()) { group.push(token); flush(); return; }
      flush();
      group.push(token);
      flush();
      return;
    }
    const prev = group[group.length - 1];
    if (prev && /^\d+$/.test(token) && /^\d+$/.test(prev) && token.length < prev.length) flush();
    group.push(token);
  });
  flush();
  return out;
}

export function parsePartNumbers(text) {
  const result = [];
  const seen = new Set();
  for (const line of String(text || "").split(/\r?\n/)) {
    if (STOP_LINE.test(line)) break;
    for (const code of parseLine(line)) {
      const key = normalizePartNumber(code);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(code);
    }
  }
  return result;
}
