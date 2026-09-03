// theory-eq.js — Gleichheitstheorie (EPA/VA). Atome sind x = t und x ≠ t mit t Parameter
// oder Konstante; Parameter werden nie miteinander verglichen.
//
// Zwei Darstellungen von Parametermengen, die dieselbe Schnittstelle bedienen, aber
// nicht austauschbar sind (Plan 4.2):
//
//  * Klassen relativ zu L = Buchstaben(w) ∪ Konstanten. Ein Element ist ein Tupel
//    (i₁..i_k) mit i_j ∈ {0..|L|−1} oder FRESH. Nur für die Simulation eines festen Wortes
//    gültig, denn "frisch" ist relativ zu L.
//  * Partitionen von {y₁..y_k} ∪ C, Konstanten paarweise getrennt. Wortunabhängig und die
//    einzige zulässige Darstellung für project() und die Leerheitssuche.
(function (root) {
  'use strict';

  // Meldungstexte: root.Msg uebersetzt, fehlt es, bleibt der deutsche Text.
  function M(key, fallback) {
    if (typeof root.Msg === 'function') return root.Msg.apply(null, arguments);
    return fallback;
  }

  const Fo = root.Formula;
  const FRESH = -1;

  // ============ Darstellung 1: Klassen relativ zu L ============

  // params: sortierte Liste von Parameterindizes, alphabet: Liste von Symbolen (L).
  function ClassTheory(params, alphabet) {
    this.name = 'equality';
    this.params = params.slice();
    this.alphabet = alphabet.slice();
    this.index = new Map();
    this.alphabet.forEach(function (s, i) { this.index.set(s, i); }, this);
  }

  ClassTheory.prototype.allTuples = function () {
    const k = this.params.length;
    const vals = this.alphabet.map(function (_, i) { return i; }).concat([FRESH]);
    let acc = [[]];
    for (let j = 0; j < k; j++) {
      const next = [];
      for (const t of acc) for (const v of vals) next.push(t.concat([v]));
      acc = next;
    }
    return acc;
  };

  ClassTheory.prototype.top = function () { return this.allTuples(); };
  ClassTheory.prototype.bottom = function () { return []; };

  ClassTheory.prototype.tupleKey = function (t) { return t.join(','); };

  ClassTheory.prototype.key = function (S) {
    return S.map(this.tupleKey, this).sort().join('|');
  };
  ClassTheory.prototype.isEmpty = function (S) { return S.length === 0; };
  ClassTheory.prototype.equal = function (S, T) { return this.key(S) === this.key(T); };

  ClassTheory.prototype.intersect = function (S, T) {
    const ks = new Set(T.map(this.tupleKey, this));
    return S.filter(function (t) { return ks.has(this.tupleKey(t)); }, this);
  };
  ClassTheory.prototype.union = function (S, T) {
    const seen = new Set(), out = [];
    for (const t of S.concat(T)) {
      const k = this.tupleKey(t);
      if (!seen.has(k)) { seen.add(k); out.push(t); }
    }
    return out;
  };
  ClassTheory.prototype.diff = function (S, T) {
    const ks = new Set(T.map(this.tupleKey, this));
    return S.filter(function (t) { return !ks.has(this.tupleKey(t)); }, this);
  };

  // Wahrheitswert von φ(letter, μ) für die Klasse t.
  ClassTheory.prototype.evalAst = function (ast, letter, t) {
    switch (ast.t) {
      case 'true': return true;
      case 'false': return false;
      case 'not': return !this.evalAst(ast.a, letter, t);
      case 'and': return ast.xs.every(function (c) { return this.evalAst(c, letter, t); }, this);
      case 'or': return ast.xs.some(function (c) { return this.evalAst(c, letter, t); }, this);
      case 'atom': {
        const side = ast.eqSide;
        if (!side) throw new Error('Atom ohne eqSide in der Gleichheitstheorie');
        let equalVal;
        if (side.kind === 'const') {
          equalVal = (letter === side.name);
        } else {
          const j = this.params.indexOf(side.idx);
          if (j < 0) throw new Error('Parameter y' + side.idx + ' nicht deklariert');
          const li = this.index.has(letter) ? this.index.get(letter) : FRESH;
          // Ein frischer Parameter ist nie gleich einem Buchstaben von L; der Buchstabe
          // selbst liegt immer in L, weil L die Buchstaben des Wortes enthält.
          equalVal = (t[j] !== FRESH && t[j] === li);
        }
        return ast.rel === '=' ? equalVal : !equalVal;
      }
    }
    throw new Error('unbekannter Knoten ' + ast.t);
  };

  ClassTheory.prototype.restrict = function (S, ast, letter) {
    return S.filter(function (t) { return this.evalAst(ast, letter, t); }, this);
  };

  ClassTheory.prototype.formatTuple = function (t) {
    const parts = this.params.map(function (p, j) {
      const name = this.params.length === 1 ? 'y' : 'y' + Fo.sub(p);
      if (t[j] === FRESH) {
        return this.alphabet.length ? name + ' ∉ {' + this.alphabet.join(', ') + '}' : name + ' frisch';
      }
      return name + ' = ' + this.alphabet[t[j]];
    }, this);
    return parts.length === 1 ? parts[0] : '(' + parts.join(', ') + ')';
  };

  ClassTheory.prototype.format = function (S) {
    if (S.length === 0) return '∅';
    if (S.length === this.allTuples().length) return this.params.length === 1
      ? M('msg.yAny', 'y beliebig') : M('msg.any', 'beliebig');
    const xs = S.map(this.formatTuple, this);
    xs.sort();
    if (xs.length > 6) return xs.slice(0, 6).join('; ') + ' … (' + xs.length + ' Klassen)';
    return xs.join('; ');
  };

  ClassTheory.prototype.witness = function (S) {
    if (S.length === 0) return null;
    const t = S[0];
    // Ohne Parameter gibt es nichts zu belegen: kein Zeugentext, aber ein gültiger Wert.
    return { text: this.params.length ? this.formatTuple(t) : null, value: t };
  };

  ClassTheory.prototype.letterFor = function (ast, mu) {
    // Buchstabenkandidaten: L plus ein frisches Symbol.
    const cands = this.alphabet.concat([freshSymbol(this.alphabet)]);
    for (const c of cands) if (this.evalAst(ast, c, mu.value)) return c;
    return null;
  };

  ClassTheory.prototype.formatLetter = function (l) { return String(l); };

  function freshSymbol(alphabet) {
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    for (const c of letters) if (alphabet.indexOf(c) < 0) return c;
    let i = 1;
    for (;;) { const s = 'a' + i; if (alphabet.indexOf(s) < 0) return s; i++; }
  }

  // ============ Darstellung 2: Partitionen ============
  //
  // Ein Element von {y₁..y_k} ∪ C wird durch einen Block-Index dargestellt. Kanonische Form:
  // "restricted growth string" über den Elementen in fester Reihenfolge (erst Parameter,
  // dann Konstanten), mit der Nebenbedingung, dass keine zwei Konstanten denselben Block
  // teilen.

  function PartitionTheory(params, constants) {
    this.name = 'equality';
    this.params = params.slice();
    this.constants = constants.slice();
    this.elems = this.params.map(function (p) { return { kind: 'param', idx: p }; })
      .concat(this.constants.map(function (c) { return { kind: 'const', name: c }; }));
    this._all = null;
  }

  PartitionTheory.prototype.allPartitions = function () {
    if (this._all) return this._all;
    const n = this.elems.length;
    const kIsConst = this.elems.map(function (e) { return e.kind === 'const'; });
    const out = [];
    const cur = new Array(n);
    const self = this;
    (function rec(i, maxBlock) {
      if (i === n) { out.push(cur.slice()); return; }
      for (let b = 0; b <= maxBlock; b++) {
        // zwei Konstanten dürfen nie denselben Block teilen
        if (kIsConst[i]) {
          let clash = false;
          for (let j = 0; j < i; j++) if (kIsConst[j] && cur[j] === b) { clash = true; break; }
          if (clash) continue;
        }
        cur[i] = b;
        rec(i + 1, b === maxBlock ? maxBlock + 1 : maxBlock);
      }
    })(0, 0);
    this._all = out;
    return out;
  };

  PartitionTheory.prototype.top = function () { return this.allPartitions().slice(); };
  PartitionTheory.prototype.bottom = function () { return []; };
  PartitionTheory.prototype.pKey = function (p) { return p.join(','); };
  PartitionTheory.prototype.key = function (S) { return S.map(this.pKey, this).sort().join('|'); };
  PartitionTheory.prototype.isEmpty = function (S) { return S.length === 0; };
  PartitionTheory.prototype.equal = function (S, T) { return this.key(S) === this.key(T); };
  PartitionTheory.prototype.intersect = function (S, T) {
    const ks = new Set(T.map(this.pKey, this));
    return S.filter(function (p) { return ks.has(this.pKey(p)); }, this);
  };
  PartitionTheory.prototype.union = function (S, T) {
    const seen = new Set(), out = [];
    for (const p of S.concat(T)) { const k = this.pKey(p); if (!seen.has(k)) { seen.add(k); out.push(p); } }
    return out;
  };
  PartitionTheory.prototype.diff = function (S, T) {
    const ks = new Set(T.map(this.pKey, this));
    return S.filter(function (p) { return !ks.has(this.pKey(p)); }, this);
  };

  PartitionTheory.prototype.elemIndex = function (side) {
    if (side.kind === 'const') {
      const i = this.constants.indexOf(side.name);
      return i < 0 ? -1 : this.params.length + i;
    }
    return this.params.indexOf(side.idx);
  };

  // Wahrheitswert von φ(x, μ), wenn x im Block xBlock liegt (xBlock = -1: x ist frisch,
  // also in keinem Block der Partition).
  PartitionTheory.prototype.evalWithX = function (ast, p, xBlock) {
    switch (ast.t) {
      case 'true': return true;
      case 'false': return false;
      case 'not': return !this.evalWithX(ast.a, p, xBlock);
      case 'and': return ast.xs.every(function (c) { return this.evalWithX(c, p, xBlock); }, this);
      case 'or': return ast.xs.some(function (c) { return this.evalWithX(c, p, xBlock); }, this);
      case 'atom': {
        const i = this.elemIndex(ast.eqSide);
        if (i < 0) throw new Error('unbekanntes Element in der Formel');
        const equalVal = (xBlock >= 0 && p[i] === xBlock);
        return ast.rel === '=' ? equalVal : !equalVal;
      }
    }
    throw new Error('unbekannter Knoten');
  };

  // {μ | ∃x. φ(x, μ)}: x liegt in einem der Blöcke oder ist frisch.
  PartitionTheory.prototype.project = function (ast) {
    const out = [];
    for (const p of this.allPartitions()) {
      const blocks = new Set(p);
      let sat = this.evalWithX(ast, p, -1);
      if (!sat) for (const b of blocks) if (this.evalWithX(ast, p, b)) { sat = true; break; }
      if (sat) out.push(p);
    }
    return out;
  };

  PartitionTheory.prototype.satisfiable = function (ast) { return this.project(ast).length > 0; };

  PartitionTheory.prototype.restrict = function (S, ast, letter) {
    // Nur sinnvoll, wenn der Buchstabe eine Konstante oder frisch ist.
    const ci = this.constants.indexOf(letter);
    return S.filter(function (p) {
      return this.evalWithX(ast, p, ci >= 0 ? p[this.params.length + ci] : -1);
    }, this);
  };

  PartitionTheory.prototype.formatPartition = function (p) {
    const blocks = new Map();
    p.forEach(function (b, i) {
      if (!blocks.has(b)) blocks.set(b, []);
      blocks.get(b).push(this.elemName(i));
    }, this);
    const parts = [];
    for (const b of Array.from(blocks.keys()).sort(function (a, c) { return a - c; })) {
      const g = blocks.get(b);
      parts.push(g.length === 1 ? g[0] : '{' + g.join(' = ') + '}');
    }
    return parts.join(', ');
  };

  PartitionTheory.prototype.elemName = function (i) {
    const e = this.elems[i];
    if (e.kind === 'const') return e.name;
    return this.params.length === 1 ? 'y' : 'y' + Fo.sub(e.idx);
  };

  PartitionTheory.prototype.format = function (S) {
    if (S.length === 0) return '∅';
    if (S.length === this.allPartitions().length) return M('msg.any', 'beliebig');
    const xs = S.map(this.formatPartition, this);
    xs.sort();
    if (xs.length > 5) return xs.slice(0, 5).join('; ') + ' … (' + xs.length + ')';
    return xs.join('; ');
  };

  PartitionTheory.prototype.witness = function (S) {
    if (S.length === 0) return null;
    return { text: this.params.length ? this.formatPartition(S[0]) : null, value: S[0] };
  };

  // Übersetzung Partition → Klasse relativ zu einem Alphabet L (Plan 4.2): ein Block mit
  // Konstante c bekommt den Index von c, alle anderen sind frisch.
  PartitionTheory.prototype.toClassTuple = function (p, alphabet) {
    const blockConst = new Map();
    this.elems.forEach(function (e, i) {
      if (e.kind === 'const') blockConst.set(p[i], e.name);
    });
    return this.params.map(function (_, j) {
      const c = blockConst.get(p[j]);
      if (c === undefined) return FRESH;
      const i = alphabet.indexOf(c);
      return i < 0 ? FRESH : i;
    });
  };

  // Ein Buchstabe, der φ unter der Belegung p erfüllt: Konstante, ein Symbol für einen
  // Block ohne Konstante, oder ein Symbol ausserhalb aller Blöcke ("frisch").
  //
  // Der Rückgabewert nennt immer den Block mit, denn der Name allein trägt die Bedeutung
  // nicht: derselbe Buchstabe darf entlang eines Pfades nicht einmal "gleich y" und einmal
  // "ungleich y" heissen, und zwei verschiedene Blöcke dürfen nicht denselben Namen tragen.
  // Wer die Namen vergibt, muss über den ganzen Pfad Buch führen; deshalb liefert diese
  // Funktion nur den Block und überlässt die Benennung dem Aufrufer (siehe buildWitness).
  //   {block: b}   x liegt in Block b (enthält der Block eine Konstante, ist es ihr Name)
  //   {block: -1}  x liegt in keinem Block
  PartitionTheory.prototype.letterFor = function (ast, mu) {
    const p = mu.value;
    if (this.evalWithX(ast, p, -1)) return { block: -1 };
    for (let i = 0; i < this.constants.length; i++) {
      const b = p[this.params.length + i];
      if (this.evalWithX(ast, p, b)) return { block: b, name: this.constants[i] };
    }
    // Der Buchstabe muss dann mit Parametern zusammenfallen, ohne Konstante zu sein:
    // dafür gibt es keinen benennbaren Repräsentanten in C, also ein Symbol, das mit dem
    // Parameterwert identifiziert wird. Das kann nur passieren, wenn der Block keine
    // Konstante enthält; dann ist der Wert selbst beliebig wählbar.
    const blocks = Array.from(new Set(p));
    for (const b of blocks) {
      if (this.evalWithX(ast, p, b)) return { block: b };
    }
    return null;
  };

  // Ein Buchstabe aus letterFor ist hier nur ein Block, kein Name: benannt wird erst
  // beim Ausschreiben eines ganzen Pfades (buildWitness). Zum Anzeigen bleibt der Block.
  PartitionTheory.prototype.formatLetter = function (l) {
    if (typeof l === 'string') return l;
    if (l && l.name !== undefined) return l.name;
    return l && l.block >= 0 ? '[' + l.block + ']' : '∉';
  };

  root.TheoryEq = {
    ClassTheory: ClassTheory, PartitionTheory: PartitionTheory,
    FRESH: FRESH, freshSymbol: freshSymbol
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
