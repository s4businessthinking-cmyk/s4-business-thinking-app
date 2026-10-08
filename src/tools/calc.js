// Safe calculator expression evaluator (no eval): + − × ÷ ( ) and % like a desk calculator
// ("200+10%" = 220, "200×10%" = 20).

function tokenize(src) {
  const s = String(src || "").replace(/[×xX]/g, "*").replace(/÷/g, "/").replace(/,/g, "").replace(/\s+/g, "");
  const out = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j += 1;
      const text = s.slice(i, j);
      if ((text.match(/\./g) || []).length > 1) throw new Error("bad number");
      out.push({ t: "n", v: Number(text) });
      i = j;
    } else if ("+-*/()%".includes(ch)) {
      out.push({ t: ch });
      i += 1;
    } else {
      throw new Error(`bad character ${ch}`);
    }
  }
  return out;
}

export function evaluate(src) {
  const tk = tokenize(src);
  let p = 0;
  const peek = () => tk[p]?.t;
  const eat = (t) => { if (peek() !== t) throw new Error(`expected ${t}`); p += 1; };

  function primary() {
    const tok = tk[p];
    if (!tok) throw new Error("unexpected end");
    if (tok.t === "n") { p += 1; return tok.v; }
    if (tok.t === "(") { p += 1; const v = expr(); eat(")"); return v; }
    throw new Error("unexpected token");
  }
  function factor() {
    if (peek() === "-") { p += 1; const f = factor(); return { v: -f.v, pct: f.pct }; }
    if (peek() === "+") { p += 1; return factor(); }
    const v = primary();
    if (peek() === "%") { p += 1; return { v, pct: true }; }
    return { v, pct: false };
  }
  function term() {
    const first = factor();
    let v = first.pct ? first.v / 100 : first.v;
    let lastPct = first.pct;
    while (peek() === "*" || peek() === "/") {
      const op = tk[p].t; p += 1;
      const f = factor();
      const r = f.pct ? f.v / 100 : f.v;
      if (op === "/" && r === 0) throw new Error("divide by zero");
      v = op === "*" ? v * r : v / r;
      lastPct = false;
    }
    return { v, pct: lastPct, raw: first.v };
  }
  function expr() {
    let v = term().v;
    while (peek() === "+" || peek() === "-") {
      const op = tk[p].t; p += 1;
      const t = term();
      const r = t.pct ? (v * t.raw) / 100 : t.v;
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }

  if (!tk.length) return 0;
  const v = expr();
  if (p !== tk.length) throw new Error("unexpected token");
  if (!Number.isFinite(v)) throw new Error("not a number");
  return Math.round(v * 1e10) / 1e10;
}

export function tryEvaluate(src) {
  try { return { ok: true, value: evaluate(src) }; } catch (e) { return { ok: false, error: e.message }; }
}

export function convertCurrency(amount, fromRate, toRate) {
  const a = Number(amount);
  const f = Number(fromRate);
  const t = Number(toRate);
  if (!Number.isFinite(a) || !(f > 0) || !(t > 0)) return null;
  return Math.round(((a * f) / t) * 1e6) / 1e6;
}
