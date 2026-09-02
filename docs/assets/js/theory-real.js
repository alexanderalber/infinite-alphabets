// theory-real.js — Theorie der reellen Zahlen mit linearen Atomen und genau einem Parameter y.
// Parametermengen S ⊆ ℝ sind Intervallmengen über Q (intervals.js).
(function (root) {
  'use strict';

  const F = root.Fraction;
  const I = root.Intervals;
  const Fo = root.Formula;

  const FLIP = { '<': '>', '<=': '>=', '>': '<', '>=': '<=', '=': '=', '!=': '!=' };

  // Ein Atom als a·x + b·y + c REL 0.
  function atomCoeffs(atom) {
    const d = Fo.linSub(atom.left, atom.right);
    if (d.sym) throw new Error('Symbolische Konstanten gibt es in der reellen Theorie nicht');
    const ks = Object.keys(d.ys).map(Number);
    for (const k of ks) if (k !== 1) throw new Error('Diese Theorie kennt nur einen Parameter y (gefunden y' + k + ')');
    return { a: d.x, b: d.ys[1] || F.ZERO, c: d.c, rel: atom.rel };
  }

  // Lösungsmenge in der Variablen v von `coefV·v REL −rest`, rest ist eine Zahl.
  function solveLinear(coefV, rest, rel) {
    if (coefV.isZero()) {
      const s = rest.sign(); // rest REL 0
      const truth = evalRel(s, rel);
      return truth ? I.full() : I.EMPTY;
    }
    const r = rest.neg().div(coefV);
    const useRel = coefV.sign() < 0 ? FLIP[rel] : rel;
    return I.fromRel(useRel, r);
  }

  function evalRel(sign, rel) {
    switch (rel) {
      case '<': return sign < 0;
      case '<=': return sign <= 0;
      case '=': return sign === 0;
      case '!=': return sign !== 0;
      case '>=': return sign >= 0;
      case '>': return sign > 0;
    }
    throw new Error('rel?');
  }

  // {y | φ(letter, y)} — x wird durch den Buchstaben ersetzt.
  function solveY(ast, letter) {
    switch (ast.t) {
      case 'true': return I.full();
      case 'false': return I.EMPTY;
      case 'not': return I.complement(solveY(ast.a, letter));
      case 'and': return ast.xs.reduce(function (acc, c) { return I.intersect(acc, solveY(c, letter)); }, I.full());
      case 'or': return ast.xs.reduce(function (acc, c) { return I.union(acc, solveY(c, letter)); }, I.EMPTY);
      case 'atom': {
        const k = atomCoeffs(ast);
        return solveLinear(k.b, k.a.mul(letter).add(k.c), k.rel);
      }
    }
    throw new Error('unbekannter Knoten ' + ast.t);
  }

  // {x | φ(x, yVal)} — y wird durch einen Wert ersetzt.
  function solveX(ast, yVal) {
    switch (ast.t) {
      case 'true': return I.full();
      case 'false': return I.EMPTY;
      case 'not': return I.complement(solveX(ast.a, yVal));
      case 'and': return ast.xs.reduce(function (acc, c) { return I.intersect(acc, solveX(c, yVal)); }, I.full());
      case 'or': return ast.xs.reduce(function (acc, c) { return I.union(acc, solveX(c, yVal)); }, I.EMPTY);
      case 'atom': {
        const k = atomCoeffs(ast);
        return solveLinear(k.a, k.b.mul(yVal).add(k.c), k.rel);
      }
    }
    throw new Error('unbekannter Knoten ' + ast.t);
  }

  // Kritische y-Werte: Schnittpunkte der Randgeraden x = −(b·y + c)/a und Nullstellen
  // der Atome ohne x. Zwischen zwei kritischen Werten ist die Ordnung aller Randpunkte
  // konstant, also auch die Frage, ob {x | φ(x,y)} leer ist.
  function criticalYs(ast) {
    const lines = []; // Randgeraden als x = m·y + n
    const pts = [];   // einzelne y-Werte
    Fo.walk(ast, function (n) {
      if (n.t !== 'atom') return;
      const k = atomCoeffs(n);
      if (!k.a.isZero()) {
        lines.push({ m: k.b.neg().div(k.a), n: k.c.neg().div(k.a) });
      } else if (!k.b.isZero()) {
        pts.push(k.c.neg().div(k.b));
      }
    });
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      for (let j = i + 1; j < lines.length; j++) {
        const dm = lines[i].m.sub(lines[j].m);
        if (dm.isZero()) continue; // parallel
        out.push(lines[j].n.sub(lines[i].n).div(dm));
      }
    }
    out.push.apply(out, pts);
    // deduplizieren und sortieren
    const seen = new Map();
    for (const v of out) seen.set(v.toString(), v);
    const arr = Array.from(seen.values());
    arr.sort(function (p, q) { return p.cmp(q); });
    return arr;
  }

  // Zellen einer eindimensionalen Zerlegung: Punkte und die offenen Intervalle dazwischen.
  function cells(ks) {
    const out = [];
    if (ks.length === 0) { out.push({ set: I.full(), sample: F.ZERO }); return out; }
    out.push({ set: [I.iv(null, false, ks[0], false)], sample: ks[0].sub(F.ONE) });
    for (let i = 0; i < ks.length; i++) {
      out.push({ set: I.point(ks[i]), sample: ks[i] });
      if (i + 1 < ks.length) {
        const mid = ks[i].add(ks[i + 1]).mul(new F(1n, 2n));
        out.push({ set: [I.iv(ks[i], false, ks[i + 1], false)], sample: mid });
      }
    }
    out.push({ set: [I.iv(ks[ks.length - 1], false, null, false)], sample: ks[ks.length - 1].add(F.ONE) });
    return out;
  }

  function project(ast) {
    const ks = criticalYs(ast);
    let acc = I.EMPTY;
    for (const cell of cells(ks)) {
      if (!I.isEmpty(solveX(ast, cell.sample))) acc = I.union(acc, cell.set);
    }
    return acc;
  }

  // {x | ∃y. φ(x,y)} — dieselbe Zerlegung, Rollen vertauscht.
  function projectX(ast) {
    const ks = criticalXs(ast);
    let acc = I.EMPTY;
    for (const cell of cells(ks)) {
      if (!I.isEmpty(solveY(ast, cell.sample))) acc = I.union(acc, cell.set);
    }
    return acc;
  }

  function criticalXs(ast) {
    const lines = [], pts = [];
    Fo.walk(ast, function (n) {
      if (n.t !== 'atom') return;
      const k = atomCoeffs(n);
      if (!k.b.isZero()) lines.push({ m: k.a.neg().div(k.b), n: k.c.neg().div(k.b) });
      else if (!k.a.isZero()) pts.push(k.c.neg().div(k.a));
    });
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      for (let j = i + 1; j < lines.length; j++) {
        const dm = lines[i].m.sub(lines[j].m);
        if (dm.isZero()) continue;
        out.push(lines[j].n.sub(lines[i].n).div(dm));
      }
    }
    out.push.apply(out, pts);
    const seen = new Map();
    for (const v of out) seen.set(v.toString(), v);
    const arr = Array.from(seen.values());
    arr.sort(function (p, q) { return p.cmp(q); });
    return arr;
  }

  function satisfiable(ast) { return !I.isEmpty(project(ast)); }

  // ---------- Theorie-Schnittstelle ----------

  function RealTheory(opts) {
    this.name = 'reals';
    this.params = (opts && opts.params) || [];
  }

  RealTheory.prototype.top = function () { return I.full(); };
  RealTheory.prototype.bottom = function () { return I.EMPTY; };
  RealTheory.prototype.restrict = function (S, ast, letter) { return I.intersect(S, solveY(ast, letter)); };
  RealTheory.prototype.project = function (ast) { return project(ast); };
  RealTheory.prototype.isEmpty = function (S) { return I.isEmpty(S); };
  RealTheory.prototype.intersect = function (S, T) { return I.intersect(S, T); };
  RealTheory.prototype.union = function (S, T) { return I.union(S, T); };
  RealTheory.prototype.diff = function (S, T) { return I.diff(S, T); };
  RealTheory.prototype.equal = function (S, T) { return I.equal(S, T); };
  RealTheory.prototype.key = function (S) { return I.key(S); };
  RealTheory.prototype.format = function (S) {
    return I.format(S, this.params.length > 1 ? 'y' + Fo.sub(1) : 'y');
  };
  // Ein konkretes μ als Text, z.B. "y = 3".
  RealTheory.prototype.witness = function (S) {
    const p = I.sample(S);
    return p === null ? null : { text: 'y = ' + I.formatEndpoint(p), value: p };
  };
  // Buchstabe, der φ unter μ = value erfüllt.
  RealTheory.prototype.letterFor = function (ast, mu) {
    const xs = solveX(ast, mu.value);
    const p = I.sample(xs);
    return p === null ? null : p;
  };
  RealTheory.prototype.satisfiable = function (ast) { return satisfiable(ast); };
  RealTheory.prototype.formatLetter = function (l) { return I.formatEndpoint(l); };

  root.TheoryReal = {
    RealTheory: RealTheory, solveY: solveY, solveX: solveX,
    project: project, projectX: projectX, satisfiable: satisfiable,
    criticalYs: criticalYs, atomCoeffs: atomCoeffs
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
