// positions-core.js — Positionen von 1-VA (ATVA §5): Tokens, Nachfolgermatrizen, BFS.
//
// Eine Position ist ein Vektor s ∈ ℕ^{2n}:
//   s[i]     (i < n)  Anzahl verschiedener Buchstaben a mit: der Lauf für μ(y) = a endet in q_i
//   s[n+i]            1 gdw. der Lauf für frisches μ(y) in q_i endet (genau ein Eintrag ist 1)
(function (root) {
  'use strict';

  // Meldungstexte: root.Msg uebersetzt, fehlt es (Modul ohne messages.js),
  // bleibt der deutsche Text aus dem Aufruf stehen.
  function M(key, fallback) {
    if (typeof root.Msg === 'function') return root.Msg.apply(null, arguments);
    return fallback;
  }

  const Fo = root.Formula;
  const Au = root.Automaton;
  const TE = root.TheoryEq;

  // Prüft die 1-VA-Wohlgeformtheit (Plan 5.1) und berechnet Y und Z.
  function analyze(A) {
    const problems = [];
    if (A.theory !== 'equality') problems.push('Theorie muss "equality" sein');
    if (A.constants.length) problems.push('Konstanten sind in einem 1-VA nicht erlaubt: ' + A.constants.join(', '));
    if (A.params.length > 1) problems.push('Ein 1-VA hat genau einen Parameter, gefunden: ' + A.params.length);

    const n = A.states.length;
    const Y = new Array(n).fill(-1);
    const Z = new Array(n).fill(-1);
    const idx = new Map();
    A.states.forEach(function (q, i) { idx.set(q, i); });

    if (!problems.length) {
      // Formeln über dem einzigen Atom x = y sind Funktionen eines Booleschen Werts:
      // je eine Auswertung unter x = y und unter x ≠ y genügt (Plan 5.1).
      for (let i = 0; i < n; i++) {
        const q = A.states[i];
        const outs = Au.outgoing(A, q);
        const yT = outs.filter(function (t) { return evalUnder(t.ast, true); });
        const zT = outs.filter(function (t) { return evalUnder(t.ast, false); });
        if (yT.length !== 1) problems.push('Zustand ' + Au.displayState(q) + ': ' + yT.length + ' Transitionen sind unter x = y wahr (genau 1 nötig)');
        if (zT.length !== 1) problems.push('Zustand ' + Au.displayState(q) + ': ' + zT.length + ' Transitionen sind unter x ≠ y wahr (genau 1 nötig)');
        if (yT.length === 1) Y[i] = idx.get(yT[0].to);
        if (zT.length === 1) Z[i] = idx.get(zT[0].to);
      }
    }
    return {
      ok: problems.length === 0, problems: problems,
      n: n, states: A.states.slice(), Y: Y, Z: Z,
      accepting: A.states.map(function (q) { return A.accepting.indexOf(q) >= 0; }),
      initial: idx.get(A.initial)
    };
  }

  // Wahrheitswert einer Formel, wenn das Atom x = y den Wert xEqY hat.
  function evalUnder(ast, xEqY) {
    switch (ast.t) {
      case 'true': return true;
      case 'false': return false;
      case 'not': return !evalUnder(ast.a, xEqY);
      case 'and': return ast.xs.every(function (c) { return evalUnder(c, xEqY); });
      case 'or': return ast.xs.some(function (c) { return evalUnder(c, xEqY); });
      case 'atom': {
        if (!ast.eqSide || ast.eqSide.kind !== 'param') throw new Error(M('msg.vaOnlyParam', '1-VA: nur Atome über dem Parameter y'));
        return ast.rel === '=' ? xEqY : !xEqY;
      }
    }
    throw new Error('unbekannter Knoten');
  }

  // ---------- Matrizen (Plan 5.2 / ATVA Thm. successor) ----------

  function zeros(r, c) {
    const m = [];
    for (let i = 0; i < r; i++) m.push(new Array(c).fill(0));
    return m;
  }

  // Z und Y auf Indizes 1..2n erweitern: Z(n+j) = n + Z(j).
  function extend(f, n) {
    const g = new Array(2 * n);
    for (let j = 0; j < n; j++) { g[j] = f[j]; g[n + j] = n + f[j]; }
    return g;
  }

  function matrices(info) {
    const n = info.n;
    const Ze = extend(info.Z, n), Ye = extend(info.Y, n);
    const M = zeros(2 * n, 2 * n);
    for (let j = 0; j < 2 * n; j++) M[Ze[j]][j] = 1;   // Spalte j ist e_{Z(j)}
    const B = zeros(2 * n, 2 * n);
    for (let j = 0; j < n; j++) B[Ye[j]][n + j] = 1;   // eckiges Token in q_j erzeugt rundes in Y(q_j)
    const v = [];
    for (let i = 0; i < n; i++) {
      const vi = new Array(2 * n).fill(0);
      vi[Ye[i]] += 1;
      vi[Ze[i]] -= 1;
      v.push(vi);
    }
    return { M: M, B: B, v: v, Ze: Ze, Ye: Ye };
  }

  function matVec(M, p) {
    const out = new Array(M.length).fill(0);
    for (let i = 0; i < M.length; i++) {
      let s = 0;
      for (let j = 0; j < p.length; j++) if (M[i][j]) s += M[i][j] * p[j];
      out[i] = s;
    }
    return out;
  }

  function addVec(a, b) { return a.map(function (x, i) { return x + b[i]; }); }

  function initialPosition(info) {
    const p = new Array(2 * info.n).fill(0);
    p[info.n + info.initial] = 1; // eckiges Token im Initialzustand
    return p;
  }

  // π_i: bekannter Buchstabe, dessen Token in q_i sitzt. Erlaubt nur, wenn p[i] > 0.
  function successorKnown(info, mats, p, i) {
    if (p[i] <= 0) throw new Error(M('msg.noRoundToken', 'In q' + (i + 1) + ' sitzt kein rundes Token', i + 1));
    return addVec(matVec(mats.M, p), mats.v[i]);
  }

  // π₀: neuer Buchstabe.
  function successorNew(info, mats, p) {
    const MB = mats.M.map(function (row, i) { return row.map(function (x, j) { return x + mats.B[i][j]; }); });
    return matVec(MB, p);
  }

  function isAccepting(info, p) {
    for (let i = 0; i < info.n; i++) {
      if (!info.accepting[i]) continue;
      if (p[i] > 0 || p[info.n + i] > 0) return true;
    }
    return false;
  }

  // Position direkt aus der Simulation (Plan 5.3: Selbsttest gegen die Matrixformel).
  function positionBySimulation(A, info, word) {
    const letters = [];
    for (const a of word) if (letters.indexOf(a) < 0) letters.push(a);
    const p = new Array(2 * info.n).fill(0);
    const idx = new Map();
    info.states.forEach(function (q, i) { idx.set(q, i); });

    // Der Automat ist deterministisch per Belegung: pro μ genau ein Lauf.
    for (const a of letters) {
      let s = info.initial;
      for (const b of word) s = (b === a) ? info.Y[s] : info.Z[s];
      p[s] += 1;
    }
    let s = info.initial;
    for (let k = 0; k < word.length; k++) s = info.Z[s]; // frisches μ ist nie gleich einem Buchstaben
    p[info.n + s] = 1;
    return p;
  }

  // ---------- Erkundung (Plan 5.4) ----------

  function key(p) { return p.join(','); }

  function explore(A, opts) {
    opts = opts || {};
    const maxDepth = opts.maxDepth === undefined ? 6 : opts.maxDepth;
    const maxNodes = opts.maxNodes === undefined ? 2000 : opts.maxNodes;
    const info = analyze(A);
    if (!info.ok) return { ok: false, problems: info.problems };
    const mats = matrices(info);

    const start = initialPosition(info);
    const nodes = new Map(); // key → {p, depth, word, parent, via}
    const root = { p: start, depth: 0, word: [], parent: null, via: null };
    nodes.set(key(start), root);
    const queue = [root];
    const edges = [];
    let witness = null;
    let truncated = false;

    if (!isAccepting(info, start)) witness = root;

    while (queue.length) {
      const cur = queue.shift();
      if (cur.depth >= maxDepth) { truncated = true; continue; }
      if (nodes.size >= maxNodes) { truncated = true; break; }

      const succs = [];
      // π₀: neuer Buchstabe
      succs.push({ p: successorNew(info, mats, cur.p), via: '0', letter: nextFreshLetter(cur.word) });
      // π_i für jeden Zustand mit rundem Token
      for (let i = 0; i < info.n; i++) {
        if (cur.p[i] <= 0) continue;
        const letter = someLetterIn(info, cur.word, i);
        if (letter === null) continue;
        succs.push({ p: successorKnown(info, mats, cur.p, i), via: String(i + 1), letter: letter });
      }

      for (const s of succs) {
        const k = key(s.p);
        edges.push({ from: key(cur.p), to: k, via: s.via });
        if (nodes.has(k)) continue;
        const node = { p: s.p, depth: cur.depth + 1, word: cur.word.concat([s.letter]), parent: cur, via: s.via };
        nodes.set(k, node);
        if (!witness && !isAccepting(info, s.p)) witness = node;
        queue.push(node);
      }
    }

    return {
      ok: true, info: info, mats: mats,
      nodes: Array.from(nodes.values()), edges: edges,
      count: nodes.size, maxDepth: maxDepth, truncated: truncated,
      universalSoFar: witness === null,
      witness: witness ? { word: witness.word, p: witness.p, depth: witness.depth } : null
    };
  }

  function nextFreshLetter(word) {
    const used = new Set(word);
    for (const c of 'abcdefghijklmnopqrstuvwxyz') if (!used.has(c)) return c;
    let i = 1;
    for (;;) { const s = 'a' + i; if (!used.has(s)) return s; i++; }
  }

  // Irgendein Buchstabe des Wortes, dessen Token in q_i sitzt.
  function someLetterIn(info, word, i) {
    const seen = [];
    for (const a of word) if (seen.indexOf(a) < 0) seen.push(a);
    for (const a of seen) {
      let s = info.initial;
      for (const b of word) s = (b === a) ? info.Y[s] : info.Z[s];
      if (s === i) return a;
    }
    return null;
  }

  // Kompakte Anzeige einer Position: "q₂:● q₃:●●■"
  function formatPosition(info, p) {
    const parts = [];
    for (let i = 0; i < info.n; i++) {
      let s = '';
      for (let k = 0; k < p[i]; k++) s += '●';
      if (p[info.n + i]) s += '■';
      if (s) parts.push(Au.displayState(info.states[i]) + ':' + s);
    }
    return parts.length ? parts.join(' ') : '(leer)';
  }

  root.Positions = {
    analyze: analyze, matrices: matrices, matVec: matVec, addVec: addVec,
    initialPosition: initialPosition, successorKnown: successorKnown, successorNew: successorNew,
    isAccepting: isAccepting, positionBySimulation: positionBySimulation,
    explore: explore, key: key, formatPosition: formatPosition,
    nextFreshLetter: nextFreshLetter, someLetterIn: someLetterIn, evalUnder: evalUnder
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
