import fs from "fs";
import path from "path";

const E = /\p{Extended_Pictographic}/gu;
function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "dist"].includes(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (/\.(jsx?|tsx?)$/.test(ent.name)) acc.push(p);
  }
  return acc;
}
let n = 0;
const files = [];
for (const x of walk("src")) {
  const m = fs.readFileSync(x, "utf8").match(E);
  if (m) {
    n += m.length;
    files.push(`${m.length} ${x}`);
  }
}
console.log("left", n);
console.log(files.join("\n"));
