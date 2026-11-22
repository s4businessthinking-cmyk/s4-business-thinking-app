import fs from "fs";
import path from "path";

const EMOJI = /\p{Extended_Pictographic}|\uFE0F|\u200D|\u20E3/gu;

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "dist", ".git", "coverage", "android", "ios"].includes(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (/\.(jsx?|tsx?|css|json)$/.test(ent.name)) acc.push(p);
  }
  return acc;
}

function cleanText(s) {
  // Remove emoji only — do not touch indentation / normal spaces.
  let t = s.replace(EMOJI, "");
  // Common label pattern: "  Text" or ' Text' after leading emoji removed → single space trim at string start
  t = t.replace(/(["'`])[ \t]+(?=[\p{L}\p{N}])/gu, "$1");
  // "Text " before closing when emoji was trailing: leave as-is
  // Empty icon strings already fine
  return t;
}

let changed = 0;
let hits = 0;
for (const f of walk("src")) {
  const before = fs.readFileSync(f, "utf8");
  EMOJI.lastIndex = 0;
  if (!EMOJI.test(before)) continue;
  EMOJI.lastIndex = 0;
  const m = before.match(EMOJI);
  const n = m ? m.length : 0;
  const after = cleanText(before);
  if (after !== before) {
    fs.writeFileSync(f, after);
    changed += 1;
    hits += n;
    console.log(n, f.replace(/\\/g, "/"));
  }
}
console.log("CHANGED_FILES", changed, "EMOJI_HITS", hits);
