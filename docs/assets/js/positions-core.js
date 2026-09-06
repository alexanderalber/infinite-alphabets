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
    // Zwei verschiedene Abbrueche: an der Tiefengrenze ist die letzte Ebene
    // vollstaendig und nur tiefere fehlen, an der Knotengrenze kann auch die
    // letzte Ebene Loecher haben.
    let truncated = false;
    let nodeLimit = false;

    if (!isAccepting(info, start)) witness = root;

    while (queue.length) {
      const cur = queue.shift();
      if (cur.depth >= maxDepth) { truncated = true; continue; }
      if (nodes.size >= maxNodes) { truncated = true; nodeLimit = true; break; }

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
      count: nodes.size, maxDepth: maxDepth, truncated: truncated, nodeLimit: nodeLimit,
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

  // ---------- Monotonie und Pumpen ----------
  //
  // Alle Nachfolger sind monoton in p: π₀ ist linear mit nichtnegativer Matrix,
  // π_i addiert den festen Vektor vⁱ, und der Waechter p[i] > 0 bleibt erhalten,
  // wenn p waechst. Ist also p' aus p erreichbar und komponentenweise groesser,
  // dann gilt f_v(p') ≥ f_v(p) = p': dieselbe Abbildungsfolge laesst sich
  // beliebig oft wiederholen und treibt die echt gewachsenen Koordinaten ueber
  // jede Schranke. Das ist eine exakte Aussage, keine beschraenkte Suche.

  function leq(a, b) {
    for (let i = 0; i < a.length; i++) if (a[i] > b[i]) return false;
    return true;
  }

  // Alle Selbstueberdeckungen auf den BFS-Pfaden: ein Vorfahr p, der von seinem
  // Nachfahren p' komponentenweise ueberboten wird.
  function coveringPairs(res, opts) {
    opts = opts || {};
    const limit = opts.limit === undefined ? 20 : opts.limit;
    const out = [];
    for (const node of res.nodes) {
      for (let anc = node.parent; anc; anc = anc.parent) {
        if (!leq(anc.p, node.p)) continue;
        const growing = [];
        for (let i = 0; i < node.p.length; i++) if (node.p[i] > anc.p[i]) growing.push(i);
        if (!growing.length) continue;
        const pair = {
          ancestor: anc.p, node: node.p, growing: growing,
          u: anc.word.slice(),                       // Wort bis zum Vorfahren
          v: node.word.slice(anc.word.length),       // die wiederholbare Schleife
          maps: mapsBetween(anc, node),              // '0' oder Zustandsindex, je Schritt
          path: pathBetween(anc, node)               // Positionsschluessel, fuer die Hervorhebung
        };
        pair.unbounded = unboundedCoords(res.mats, pair);
        out.push(pair);
        if (out.length >= limit) return out;
        break; // pro Knoten der naechstliegende Vorfahr genuegt
      }
    }
    return out;
  }

  // Die Folge der angewandten Abbildungen zwischen Vorfahr und Nachfahre.
  function mapsBetween(anc, node) {
    const seq = [];
    for (let cur = node; cur && cur !== anc; cur = cur.parent) seq.unshift(cur.via);
    return seq;
  }

  // Welche Koordinaten beim Wiederholen der Schleife wirklich ueber jede Schranke
  // wachsen. Nicht einfach die, in denen der Nachfahre groesser ist: die lineare
  // Anteil M_v der Schleife schiebt den Zuwachs weiter, das Positionssystem ist
  // ein Transfer-Netz. Es gilt p_{k+1} − p_k = M_v^k · d mit d = p' − p ≥ 0, also
  // waechst Koordinate i genau dann unbeschraenkt, wenn (M_v^k·d)[i] fuer
  // unendlich viele k positiv ist. Weil M_v nichtnegativ ist, haengt der Traeger
  // von M_v^k·d nur am Traeger von M_v^{k−1}·d: die Traegerfolge ist endlich und
  // damit letztlich periodisch, und die Antwort ist die Vereinigung der Traeger
  // im Zyklus. Das ist exakt, keine Iteration auf gut Glueck.
  function unboundedCoords(mats, pair) {
    const Mv = loopMatrix(mats, pair.maps);
    const d = pair.node.map(function (x, i) { return x - pair.ancestor[i]; });
    let S = d.map(function (x) { return x > 0 ? 1 : 0; });
    const seen = new Map();
    const seq = [];
    for (;;) {
      const k = S.join('');
      if (seen.has(k)) break;
      seen.set(k, seq.length);
      seq.push(S);
      S = matVec(Mv, S).map(function (x) { return x > 0 ? 1 : 0; });
    }
    const start = seen.get(S.join(''));
    const out = [];
    for (let i = 0; i < S.length; i++) {
      for (let k = start; k < seq.length; k++) {
        if (seq[k][i]) { out.push(i); break; }
      }
    }
    return out;
  }

  // Der lineare Anteil eines Schleifendurchlaufs: π₀ wirkt mit M + B, π_i mit M.
  function loopMatrix(mats, maps) {
    const n2 = mats.M.length;
    let out = null;
    for (const via of maps) {
      const step = via === '0'
        ? mats.M.map(function (row, i) { return row.map(function (x, j) { return x + mats.B[i][j]; }); })
        : mats.M;
      out = out === null ? step.map(function (r) { return r.slice(); }) : matMul(step, out);
    }
    if (out === null) { // leere Schleife kommt nicht vor, aber dann ist es die Identitaet
      out = zeros(n2, n2);
      for (let i = 0; i < n2; i++) out[i][i] = 1;
    }
    return out;
  }

  function matMul(A, B) {
    const out = zeros(A.length, B[0].length);
    for (let i = 0; i < A.length; i++) {
      for (let k = 0; k < B.length; k++) {
        if (!A[i][k]) continue;
        for (let j = 0; j < B[0].length; j++) out[i][j] += A[i][k] * B[k][j];
      }
    }
    return out;
  }

  function pathBetween(anc, node) {
    const keys = [];
    for (let cur = node; cur; cur = cur.parent) {
      keys.unshift(key(cur.p));
      if (cur === anc) break;
    }
    return keys;
  }

  // Die Abbildungsfolge maps ab dem Wort u als konkretes Wort realisieren, times mal.
  // Die Buchstaben muessen dabei neu gewaehlt werden: π_i braucht einen Buchstaben,
  // dessen Token gerade in q_i sitzt, und welcher das ist, haengt am schon
  // gelesenen Wort. Wegen der Monotonie gibt es ihn in jeder Runde.
  function pumpWord(info, pair, times) {
    const word = pair.u.slice();
    for (let k = 0; k < times; k++) {
      for (const via of pair.maps) {
        if (via === '0') { word.push(nextFreshLetter(word)); continue; }
        const i = parseInt(via, 10) - 1;
        const a = someLetterIn(info, word, i);
        if (a === null) return null; // kann nicht eintreten, aber lieber ehrlich als geraten
        word.push(a);
      }
    }
    return word;
  }

  // Knoten nach Wortlaenge gruppiert. Index k enthaelt die Positionen, die bei
  // Laenge k zum ersten Mal auftauchen.
  function levels(res) {
    const out = [];
    for (const node of res.nodes) {
      while (out.length <= node.depth) out.push([]);
      out[node.depth].push(node);
    }
    return out;
  }

  // Bell-Zahl B_k: Anzahl der Mengenpartitionen von k Elementen, also die Anzahl
  // der Woerter der Laenge k bis auf Umbenennung der Buchstaben. Ueber das
  // Bell-Dreieck, damit auch B₂₀ noch exakt bleibt (unter 2^53).
  function bell(k) {
    let row = [1];
    for (let i = 0; i < k; i++) {
      const next = [row[row.length - 1]];
      for (let j = 0; j < row.length; j++) next.push(next[j] + row[j]);
      row = next;
    }
    return row[0];
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
    coveringPairs: coveringPairs, pumpWord: pumpWord, levels: levels, bell: bell, leq: leq,
    unboundedCoords: unboundedCoords, loopMatrix: loopMatrix, matMul: matMul,
    nextFreshLetter: nextFreshLetter, someLetterIn: someLetterIn, evalUnder: evalUnder
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
