// formula.js — Parser, Pretty-Printer und Normalisierung für Transitionsformeln.
//
// AST-Knoten:
//   {t:'true'} {t:'false'}
//   {t:'not', a}
//   {t:'and', xs:[...]}  {t:'or', xs:[...]}          (n-är, chain:true bei Ketten wie y<=x<=y+1)
//   {t:'atom', rel, left, right}                      Terme als Linearformen
//
// Terme werden intern als Linearform gehalten:
//   {x: Fraction, ys: {1: Fraction, 2: ...}, c: Fraction, sym: name|null}
// In der Gleichheitstheorie sind Terme nur 'x', ein Parameter y_i oder eine Konstante (sym).
(function (root) {
  'use strict';

  const F = root.Fraction;

  // ---------- Linearformen ----------

  function lin() { return { x: F.ZERO, ys: {}, c: F.ZERO, sym: null }; }
  function linX() { const t = lin(); t.x = F.ONE; return t; }
  function linY(i) { const t = lin(); t.ys[i] = F.ONE; return t; }
  function linConst(f) { const t = lin(); t.c = f; return t; }
  function linSym(name) { const t = lin(); t.sym = name; return t; }

  function linAdd(a, b) {
    if (a.sym || b.sym) throw new Error('Konstante ' + (a.sym || b.sym) + ' kann nicht gerechnet werden');
    const t = lin();
    t.x = a.x.add(b.x);
    t.c = a.c.add(b.c);
    for (const k in a.ys) t.ys[k] = a.ys[k];
    for (const k in b.ys) t.ys[k] = (t.ys[k] || F.ZERO).add(b.ys[k]);
    for (const k in t.ys) if (t.ys[k].isZero()) delete t.ys[k];
    return t;
  }
  function linScale(a, k) {
    if (a.sym) throw new Error('Konstante ' + a.sym + ' kann nicht skaliert werden');
    const t = lin();
    t.x = a.x.mul(k); t.c = a.c.mul(k);
    for (const key in a.ys) { const v = a.ys[key].mul(k); if (!v.isZero()) t.ys[key] = v; }
    return t;
  }
  function linNeg(a) { return linScale(a, new F(-1n, 1n)); }
  function linSub(a, b) { return linAdd(a, linNeg(b)); }

  function linIsConstNumber(t) {
    if (t.sym) return false;
    if (!t.x.isZero()) return false;
    for (const k in t.ys) return false;
    return true;
  }

  function linKey(t) {
    if (t.sym) return 'sym:' + t.sym;
    const ks = Object.keys(t.ys).map(Number).sort(function (a, b) { return a - b; });
    return 'x=' + t.x.toString() + ';' + ks.map(function (k) { return 'y' + k + '=' + t.ys[k].toString(); }).join(',') + ';c=' + t.c.toString();
  }

  // ---------- Lexer ----------

  const REL_MAP = {
    '<': '<', '<=': '<=', '≤': '<=', '=': '=', '==': '=', '!=': '!=', '≠': '!=',
    '>=': '>=', '≥': '>=', '>': '>'
  };

  function lex(src) {
    const toks = [];
    let i = 0;
    const s = src;
    while (i < s.length) {
      const ch = s[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === '#') break; // Kommentar bis Zeilenende
      // zweistellige Operatoren zuerst
      const two = s.substr(i, 2);
      if (two === '<=' || two === '>=' || two === '!=' || two === '==') {
        toks.push({ k: 'rel', v: REL_MAP[two], p: i }); i += 2; continue;
      }
      if ('≤≥≠'.indexOf(ch) >= 0 || '<>='.indexOf(ch) >= 0) {
        toks.push({ k: 'rel', v: REL_MAP[ch], p: i }); i++; continue;
      }
      if (ch === '∧' || ch === '&') { if (s[i + 1] === '&') i++; toks.push({ k: 'and', p: i }); i++; continue; }
      if (ch === '∨' || ch === '|') { if (s[i + 1] === '|') i++; toks.push({ k: 'or', p: i }); i++; continue; }
      if (ch === '¬' || ch === '!') { toks.push({ k: 'not', p: i }); i++; continue; }
      if (ch === '⊤') { toks.push({ k: 'true', p: i }); i++; continue; }
      if (ch === '⊥') { toks.push({ k: 'false', p: i }); i++; continue; }
      if (ch === '(') { toks.push({ k: '(', p: i }); i++; continue; }
      if (ch === ')') { toks.push({ k: ')', p: i }); i++; continue; }
      if (ch === '+') { toks.push({ k: '+', p: i }); i++; continue; }
      if (ch === '-' || ch === '−') { toks.push({ k: '-', p: i }); i++; continue; }
      if (ch === '*' || ch === '·') { toks.push({ k: '*', p: i }); i++; continue; }
      if (ch === '/') { toks.push({ k: '/', p: i }); i++; continue; }
      if (/[0-9.]/.test(ch)) {
        let j = i;
        while (j < s.length && /[0-9.]/.test(s[j])) j++;
        toks.push({ k: 'num', v: s.slice(i, j), p: i });
        i = j; continue;
      }
      if (/[A-Za-z_]/.test(ch)) {
        let j = i;
        while (j < s.length && /[A-Za-z0-9_']/.test(s[j])) j++;
        const w = s.slice(i, j);
        const lw = w.toLowerCase();
        if (lw === 'and') toks.push({ k: 'and', p: i });
        else if (lw === 'or') toks.push({ k: 'or', p: i });
        else if (lw === 'not') toks.push({ k: 'not', p: i });
        else if (lw === 'true') toks.push({ k: 'true', p: i });
        else if (lw === 'false') toks.push({ k: 'false', p: i });
        else toks.push({ k: 'id', v: w, p: i });
        i = j; continue;
      }
      throw new Error('Unerwartetes Zeichen "' + ch + '" an Position ' + i);
    }
    toks.push({ k: 'eof', p: s.length });
    return toks;
  }

  // ---------- Parser ----------

  // ctx: {theory: 'reals'|'equality', constants: Set (nur equality, wird ergänzt)}
  function parse(src, ctx) {
    ctx = ctx || { theory: 'reals' };
    const toks = lex(src);
    let pos = 0;
    const seenParams = new Set();
    const seenConsts = new Set();

    function peek() { return toks[pos]; }
    function next() { return toks[pos++]; }
    function expect(k) {
      if (toks[pos].k !== k) throw new Error('Erwartet "' + k + '", gefunden "' + (toks[pos].v || toks[pos].k) + '"');
      return toks[pos++];
    }

    function parseFormula() { return parseDisj(); }

    function parseDisj() {
      const xs = [parseConj()];
      while (peek().k === 'or') { next(); xs.push(parseConj()); }
      return xs.length === 1 ? xs[0] : { t: 'or', xs: xs };
    }
    function parseConj() {
      const xs = [parseNeg()];
      while (peek().k === 'and') { next(); xs.push(parseNeg()); }
      return xs.length === 1 ? xs[0] : { t: 'and', xs: xs };
    }
    function parseNeg() {
      if (peek().k === 'not') { next(); return { t: 'not', a: parseNeg() }; }
      return parseAtomOrChain();
    }
    function parseAtomOrChain() {
      const k = peek().k;
      if (k === 'true') { next(); return { t: 'true' }; }
      if (k === 'false') { next(); return { t: 'false' }; }
      if (k === '(') {
        // Klammer könnte Formel oder Term sein: erst Formel versuchen, bei Misserfolg Term.
        const save = pos;
        try {
          next();
          const f = parseFormula();
          expect(')');
          // Wenn direkt eine Relation folgt, war es doch ein Term.
          if (peek().k === 'rel') { pos = save; return parseChain(); }
          return f;
        } catch (e) {
          pos = save;
          return parseChain();
        }
      }
      return parseChain();
    }

    // chain := term (REL term)+ ; mehrere Relationen ergeben eine Konjunktion.
    function parseChain() {
      const terms = [parseTerm()];
      const rels = [];
      while (peek().k === 'rel') { rels.push(next().v); terms.push(parseTerm()); }
      if (rels.length === 0) throw new Error('Relation erwartet (z.B. x < y)');
      const atoms = [];
      for (let i = 0; i < rels.length; i++) atoms.push(mkAtom(rels[i], terms[i], terms[i + 1]));
      if (atoms.length === 1) return atoms[0];
      return { t: 'and', xs: atoms, chain: true, chainRels: rels, chainTerms: terms };
    }

    function mkAtom(rel, l, r) {
      if (ctx.theory === 'equality') {
        if (rel !== '=' && rel !== '!=') throw new Error('In der Gleichheitstheorie sind nur = und ≠ erlaubt');
        const a = eqSide(l), b = eqSide(r);
        if (a.kind === 'x' && b.kind === 'x') throw new Error('x = x ist sinnlos');
        if (a.kind !== 'x' && b.kind !== 'x') throw new Error('Ein Atom muss x enthalten (Vergleiche ohne x sind in v1 nicht erlaubt)');
        const other = a.kind === 'x' ? b : a;
        return { t: 'atom', rel: rel, left: linX(), right: other.term, eqSide: other };
      }
      return { t: 'atom', rel: rel, left: l, right: r };
    }

    function eqSide(t) {
      if (t.sym) return { kind: 'const', name: t.sym, term: t };
      if (!t.x.isZero()) {
        if (!t.x.eq(F.ONE) || !t.c.isZero() || Object.keys(t.ys).length) throw new Error('In der Gleichheitstheorie sind keine Rechnungen erlaubt');
        return { kind: 'x', term: t };
      }
      const ks = Object.keys(t.ys);
      if (ks.length === 1 && t.ys[ks[0]].eq(F.ONE) && t.c.isZero()) return { kind: 'param', idx: Number(ks[0]), term: t };
      throw new Error('In der Gleichheitstheorie sind nur x, Parameter und Konstanten erlaubt');
    }

    // term := sum
    function parseTerm() {
      let t = parseSum();
      return t;
    }
    function parseSum() {
      let sign = 1;
      if (peek().k === '-') { next(); sign = -1; }
      else if (peek().k === '+') next();
      let acc = parseProduct();
      if (sign < 0) acc = linNeg(acc);
      for (;;) {
        if (peek().k === '+') { next(); acc = linAdd(acc, parseProduct()); }
        else if (peek().k === '-') { next(); acc = linSub(acc, parseProduct()); }
        else break;
      }
      return acc;
    }
    function parseProduct() {
      let acc = parseFactor();
      for (;;) {
        if (peek().k === '*') {
          next();
          const rhs = parseFactor();
          if (linIsConstNumber(acc)) acc = linScale(rhs, acc.c);
          else if (linIsConstNumber(rhs)) acc = linScale(acc, rhs.c);
          else throw new Error('Nur lineare Terme: Produkt zweier Variablen');
        } else if (peek().k === '/') {
          next();
          const rhs = parseFactor();
          if (!linIsConstNumber(rhs) || rhs.c.isZero()) throw new Error('Division nur durch eine Zahl ungleich 0');
          acc = linScale(acc, F.ONE.div(rhs.c));
        } else break;
      }
      return acc;
    }
    function parseFactor() {
      const tk = peek();
      if (tk.k === '-') { next(); return linNeg(parseFactor()); }
      if (tk.k === '+') { next(); return parseFactor(); }
      if (tk.k === 'num') { next(); return linConst(F.fromString(tk.v)); }
      if (tk.k === '(') { next(); const t = parseSum(); expect(')'); return t; }
      if (tk.k === 'id') {
        next();
        const w = tk.v;
        if (w === 'x') return linX();
        const m = /^y(\d*)$/.exec(w);
        if (m) {
          const idx = m[1] === '' ? 1 : parseInt(m[1], 10);
          if (idx < 1) throw new Error('Parameterindex muss ≥ 1 sein: ' + w);
          seenParams.add(idx);
          return linY(idx);
        }
        if (ctx.theory === 'equality') { seenConsts.add(w); return linSym(w); }
        throw new Error('Unbekannter Bezeichner "' + w + '" (in der reellen Theorie gibt es nur x, y_i und Zahlen)');
      }
      throw new Error('Term erwartet, gefunden "' + (tk.v || tk.k) + '"');
    }

    const f = parseFormula();
    if (peek().k !== 'eof') throw new Error('Unerwartetes "' + (peek().v || peek().k) + '" nach der Formel');
    return { ast: f, params: Array.from(seenParams).sort(function (a, b) { return a - b; }), constants: Array.from(seenConsts).sort() };
  }

  // ---------- Sammler ----------

  function walk(ast, fn) {
    fn(ast);
    if (ast.t === 'not') walk(ast.a, fn);
    else if (ast.t === 'and' || ast.t === 'or') ast.xs.forEach(function (c) { walk(c, fn); });
  }

  function collectParams(ast) {
    const s = new Set();
    walk(ast, function (n) {
      if (n.t !== 'atom') return;
      for (const term of [n.left, n.right]) for (const k in term.ys) s.add(Number(k));
    });
    return Array.from(s).sort(function (a, b) { return a - b; });
  }

  function collectConstants(ast) {
    const s = new Set();
    walk(ast, function (n) {
      if (n.t !== 'atom') return;
      for (const term of [n.left, n.right]) if (term.sym) s.add(term.sym);
    });
    return Array.from(s).sort();
  }

  // ---------- Pretty-Printer ----------

  const SUB = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉' };
  function sub(n) { return String(n).split('').map(function (c) { return SUB[c] || c; }).join(''); }

  const REL_PRETTY = { '<': '<', '<=': '≤', '=': '=', '!=': '≠', '>=': '≥', '>': '>' };
  const REL_ASCII = { '<': '<', '<=': '<=', '=': '=', '!=': '!=', '>=': '>=', '>': '>' };

  function fmtNum(f, opts) {
    const d = f.toDecimalString();
    const s = (d !== null && d.length < f.toString().length - 1) ? d : f.toString();
    return opts && opts.ascii ? s : s.replace(/^-/, '−');
  }

  // y_1 heisst 'y', solange nichts anderes verlangt ist (der Plan nennt y ein Alias fuer y1).
  function paramName(k, opts) {
    const bare = (k === 1 && !(opts && opts.numberedParams));
    if (opts && opts.ascii) return bare ? 'y' : ('y' + k);
    return bare ? 'y' : ('y' + sub(k));
  }

  function fmtTerm(t, opts) {
    if (t.sym) return t.sym;
    const parts = [];
    function push(coef, name) {
      if (coef.isZero()) return;
      const abs = coef.abs();
      const sign = coef.sign() < 0 ? '-' : '+';
      const body = abs.eq(F.ONE) ? name : fmtNum(abs, { ascii: true }) + (name ? '·' : '') + name;
      parts.push({ sign: sign, body: body });
    }
    push(t.x, 'x');
    const ks = Object.keys(t.ys).map(Number).sort(function (a, b) { return a - b; });
    for (const k of ks) push(t.ys[k], paramName(k, opts));
    if (!t.c.isZero() || parts.length === 0) {
      const abs = t.c.abs();
      parts.push({ sign: t.c.sign() < 0 ? '-' : '+', body: fmtNum(abs, { ascii: true }) });
    }
    let s = '';
    parts.forEach(function (p, i) {
      if (i === 0) s += (p.sign === '-' ? (opts && opts.ascii ? '-' : '−') : '') + p.body;
      else s += (p.sign === '-' ? (opts && opts.ascii ? ' - ' : ' − ') : ' + ') + p.body;
    });
    return s;
  }

  function prec(n) {
    if (n.t === 'or') return 1;
    if (n.t === 'and') return 2;
    if (n.t === 'not') return 3;
    return 4;
  }

  function fmt(ast, opts) {
    opts = opts || {};
    const rel = opts.ascii ? REL_ASCII : REL_PRETTY;
    const AND = opts.ascii ? ' and ' : ' ∧ ';
    const OR = opts.ascii ? ' or ' : ' ∨ ';
    const NOT = opts.ascii ? 'not ' : '¬';
    const TOP = opts.ascii ? 'true' : '⊤';
    const BOT = opts.ascii ? 'false' : '⊥';

    function go(n, parentPrec) {
      let s;
      switch (n.t) {
        case 'true': s = TOP; break;
        case 'false': s = BOT; break;
        case 'atom': s = fmtTerm(n.left, opts) + ' ' + rel[n.rel] + ' ' + fmtTerm(n.right, opts); break;
        case 'not': {
          const inner = n.a;
          const needsParens = inner.t === 'atom' || (inner.t === 'and' && inner.chain);
          s = NOT + (needsParens ? '(' + go(inner, 0) + ')' : go(inner, 3));
          break;
        }
        case 'and':
          if (n.chain) {
            s = fmtTerm(n.chainTerms[0], opts);
            for (let i = 0; i < n.chainRels.length; i++) s += ' ' + rel[n.chainRels[i]] + ' ' + fmtTerm(n.chainTerms[i + 1], opts);
          } else {
            s = n.xs.map(function (c) { return go(c, 2); }).join(AND);
          }
          break;
        case 'or': s = n.xs.map(function (c) { return go(c, 1); }).join(OR); break;
        default: throw new Error('unbekannter Knoten ' + n.t);
      }
      const p = n.t === 'and' && n.chain ? 4 : prec(n);
      return p < parentPrec ? '(' + s + ')' : s;
    }
    return go(ast, 0);
  }

  function key(ast) { return fmt(ast, { ascii: true }); }

  // ---------- Konstruktoren für abgeleitete Formeln ----------

  function mkAnd(xs) {
    const flat = [];
    for (const a of xs) {
      if (a.t === 'true') continue;
      if (a.t === 'false') return { t: 'false' };
      if (a.t === 'and' && !a.chain) flat.push.apply(flat, a.xs);
      else flat.push(a);
    }
    if (flat.length === 0) return { t: 'true' };
    if (flat.length === 1) return flat[0];
    return { t: 'and', xs: flat };
  }
  function mkOr(xs) {
    const flat = [];
    for (const a of xs) {
      if (a.t === 'false') continue;
      if (a.t === 'true') return { t: 'true' };
      if (a.t === 'or') flat.push.apply(flat, a.xs);
      else flat.push(a);
    }
    if (flat.length === 0) return { t: 'false' };
    if (flat.length === 1) return flat[0];
    return { t: 'or', xs: flat };
  }
  function mkNot(a) {
    if (a.t === 'true') return { t: 'false' };
    if (a.t === 'false') return { t: 'true' };
    if (a.t === 'not') return a.a;
    return { t: 'not', a: a };
  }

  // Parameter y_i → y_{i+shift} umbenennen (für direkte Produkte).
  function shiftParams(ast, shift) {
    function shiftTerm(t) {
      const r = { x: t.x, ys: {}, c: t.c, sym: t.sym };
      for (const k in t.ys) r.ys[Number(k) + shift] = t.ys[k];
      return r;
    }
    function go(n) {
      switch (n.t) {
        case 'true': case 'false': return { t: n.t };
        case 'atom': {
          const r = { t: 'atom', rel: n.rel, left: shiftTerm(n.left), right: shiftTerm(n.right) };
          if (n.eqSide) {
            const s = { kind: n.eqSide.kind, name: n.eqSide.name, term: shiftTerm(n.eqSide.term) };
            if (n.eqSide.idx !== undefined) s.idx = n.eqSide.idx + shift;
            r.eqSide = s;
          }
          return r;
        }
        case 'not': return { t: 'not', a: go(n.a) };
        case 'and': {
          const r = { t: 'and', xs: n.xs.map(go) };
          if (n.chain) { r.chain = true; r.chainRels = n.chainRels; r.chainTerms = n.chainTerms.map(shiftTerm); }
          return r;
        }
        case 'or': return { t: 'or', xs: n.xs.map(go) };
      }
      throw new Error('unbekannter Knoten');
    }
    return go(ast);
  }

  root.Formula = {
    parse: parse, fmt: fmt, key: key, sub: sub, fmtTerm: fmtTerm, fmtNum: fmtNum,
    collectParams: collectParams, collectConstants: collectConstants, walk: walk,
    mkAnd: mkAnd, mkOr: mkOr, mkNot: mkNot, shiftParams: shiftParams,
    lin: lin, linX: linX, linY: linY, linConst: linConst, linSym: linSym,
    linAdd: linAdd, linSub: linSub, linScale: linScale, linNeg: linNeg, linKey: linKey,
    TRUE: { t: 'true' }, FALSE: { t: 'false' }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
