// automaton.js — DSL-Parser, Simulation (Konfigurationsmengen), Entscheidungsverfahren
// und Operationen auf parametrisierten Automaten.
(function (root) {
  'use strict';

  // Meldungstexte: root.Msg uebersetzt, fehlt es (Modul ohne messages.js),
  // bleibt der deutsche Text aus dem Aufruf stehen.
  function M(key, fallback) {
    if (typeof root.Msg === 'function') return root.Msg.apply(null, arguments);
    return fallback;
  }

  const F = root.Fraction;
  const I = root.Intervals;
  const Fo = root.Formula;
  const TR = root.TheoryReal;
  const TE = root.TheoryEq;

  // ---------- DSL ----------
  //
  // Lexing ist positionsabhängig (Plan 2): Zustandsnamen nur in states/initial/accepting/
  // complement/pos und im Kopf einer Transitionszeile vor dem ersten ':'.

  const STATE_RE = /^[A-Za-z][A-Za-z0-9_']*$/;

  function splitStateNames(s) {
    // Whitespace-getrennt; Tupelnamen "(q0,r1)" enthalten keine Leerzeichen.
    return s.trim().length ? s.trim().split(/\s+/) : [];
  }

  function validStateName(n) {
    if (STATE_RE.test(n)) return true;
    if (n[0] === '(' && n[n.length - 1] === ')') {
      const inner = n.slice(1, -1);
      if (!inner.length) return false;
      return splitTuple(inner).every(validStateName);
    }
    return false;
  }

  // Zerlegt "q0,r1" bzw. "(q0,r0),p1" an Kommas der obersten Ebene.
  function splitTuple(s) {
    const out = [];
    let depth = 0, cur = '';
    for (const ch of s) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur);
    return out;
  }

  function ParseError(msg, line) {
    const e = new Error(msg);
    e.line = line;
    e.isParseError = true;
    return e;
  }

  function parseDSL(src) {
    const lines = String(src).split(/\r?\n/);
    const A = {
      theory: null, states: [], initial: null, accepting: [], complement: [],
      transitions: [], pos: {}, params: [], constants: []
    };
    const seenStates = new Set();
    const declaredStates = [];
    const pending = []; // Transitionszeilen, die erst nach der Theorie geparst werden

    for (let ln = 0; ln < lines.length; ln++) {
      const raw = lines[ln];
      const hash = raw.indexOf('#');
      const line = (hash >= 0 ? raw.slice(0, hash) : raw).trim();
      if (!line) continue;
      const m = /^(theory|states|initial|accepting|complement|pos)\b\s*(.*)$/.exec(line);
      if (m) {
        const kw = m[1], rest = m[2].trim();
        if (kw === 'theory') {
          if (rest !== 'reals' && rest !== 'equality') throw ParseError(M('msg.theory', 'theory muss "reals" oder "equality" sein'), ln + 1);
          A.theory = rest;
          continue;
        }
        if (kw === 'pos') {
          const parts = splitStateNames(rest);
          if (parts.length !== 3) throw ParseError(M('msg.pos', 'pos braucht Zustand, x und y'), ln + 1);
          A.pos[parts[0]] = { x: parseFloat(parts[1]), y: parseFloat(parts[2]) };
          continue;
        }
        const names = splitStateNames(rest);
        for (const n of names) if (!validStateName(n)) throw ParseError(M('msg.badState', 'Ungültiger Zustandsname "' + n + '"', n), ln + 1);
        if (kw === 'states') { for (const n of names) if (!seenStates.has(n)) { seenStates.add(n); declaredStates.push(n); } }
        else if (kw === 'initial') {
          if (names.length !== 1) throw ParseError(M('msg.initialOne', 'initial braucht genau einen Zustand'), ln + 1);
          A.initial = names[0];
        } else if (kw === 'accepting') A.accepting = A.accepting.concat(names);
        else if (kw === 'complement') A.complement = A.complement.concat(names);
        continue;
      }
      // Transitionszeile: alles vor dem ersten ':' ist der Kopf.
      const ci = line.indexOf(':');
      if (ci < 0) throw ParseError(M('msg.noColon', 'Zeile verstanden weder als Schlüsselwort noch als Transition (":" fehlt)'), ln + 1);
      const head = line.slice(0, ci).trim();
      const body = line.slice(ci + 1).trim();
      const hm = /^(.+?)\s*->\s*(.+)$/.exec(head);
      if (!hm) throw ParseError(M('msg.transHead', 'Transitionskopf muss "q -> q\'" sein'), ln + 1);
      const from = hm[1].trim(), to = hm[2].trim();
      if (!validStateName(from)) throw ParseError(M('msg.badState', 'Ungültiger Zustandsname "' + from + '"', from), ln + 1);
      if (!validStateName(to)) throw ParseError(M('msg.badState', 'Ungültiger Zustandsname "' + to + '"', to), ln + 1);
      pending.push({ from: from, to: to, src: body, line: ln + 1 });
    }

    if (!A.theory) A.theory = 'reals';
    const ctx = { theory: A.theory };

    const paramSet = new Set(), constSet = new Set();
    for (const t of pending) {
      let r;
      try { r = Fo.parse(t.src, ctx); }
      catch (e) { throw ParseError(M('msg.formula', 'Formel: ' + e.message, e.message), t.line); }
      t.ast = r.ast;
      r.params.forEach(function (p) { paramSet.add(p); });
      r.constants.forEach(function (c) { constSet.add(c); });
      A.transitions.push({ from: t.from, to: t.to, ast: t.ast, line: t.line });
    }
    A.params = Array.from(paramSet).sort(function (a, b) { return a - b; });
    A.constants = Array.from(constSet).sort();

    // Zustände: deklarierte zuerst, dann in Transitionen vorkommende.
    A.states = declaredStates.slice();
    for (const t of A.transitions) {
      for (const s of [t.from, t.to]) if (A.states.indexOf(s) < 0) A.states.push(s);
    }
    if (!A.initial) {
      if (!A.states.length) throw ParseError(M('msg.noStates', 'Automat ohne Zustände'), 1);
      A.initial = A.states[0];
    }
    if (A.states.indexOf(A.initial) < 0) A.states.push(A.initial);
    for (const s of A.accepting.concat(A.complement)) {
      if (A.states.indexOf(s) < 0) throw ParseError(M('msg.undeclared', 'Zustand "' + s + '" ist nicht deklariert', s), 1);
    }
    const accSet = new Set(A.accepting);
    for (const s of A.complement) if (accSet.has(s)) throw ParseError(M('msg.accAndComp', 'Zustand "' + s + '" ist akzeptierend und komplement-akzeptierend', s), 1);
    if (A.theory === 'reals' && A.params.length > 1) {
      throw ParseError(M('msg.oneParam', 'Die reelle Theorie ist in v1 auf einen Parameter beschränkt (gefunden: ' + A.params.length + ')', A.params.length), 1);
    }
    return A;
  }

  function toDSL(A) {
    const out = [];
    out.push('theory ' + A.theory);
    out.push('states ' + A.states.join(' '));
    out.push('initial ' + A.initial);
    if (A.accepting.length) out.push('accepting ' + A.accepting.join(' '));
    if (A.complement.length) out.push('complement ' + A.complement.join(' '));
    for (const t of A.transitions) {
      out.push(t.from + ' -> ' + t.to + ' : ' + Fo.fmt(t.ast, { ascii: true, numberedParams: A.params.length > 1 }));
    }
    for (const s of A.states) {
      if (A.pos[s]) out.push('pos ' + s + ' ' + A.pos[s].x + ' ' + A.pos[s].y);
    }
    return out.join('\n');
  }

  // ---------- Anzeige ----------

  function displayState(name) {
    if (name[0] === '(') {
      return '(' + splitTuple(name.slice(1, -1)).map(displayState).join(',') + ')';
    }
    const m = /^([A-Za-z_][A-Za-z_']*)(\d+)$/.exec(name);
    return m ? m[1] + Fo.sub(m[2]) : name;
  }

  function displayFormula(A, ast) {
    return Fo.fmt(ast, { numberedParams: A.params.length > 1 });
  }

  // Auto-Layout: BFS-Tiefe als Spalte, Reihenfolge des Auftretens als Zeile.
  function autoLayout(A) {
    const pos = {};
    const depth = new Map([[A.initial, 0]]);
    const queue = [A.initial];
    const order = [A.initial];
    while (queue.length) {
      const q = queue.shift();
      for (const t of A.transitions) {
        if (t.from !== q || depth.has(t.to)) continue;
        depth.set(t.to, depth.get(q) + 1);
        order.push(t.to);
        queue.push(t.to);
      }
    }
    for (const s of A.states) if (!depth.has(s)) { depth.set(s, 0); order.push(s); }
    const rowOf = new Map();
    for (const s of order) {
      const d = depth.get(s);
      const r = rowOf.has(d) ? rowOf.get(d) : 0;
      rowOf.set(d, r + 1);
      pos[s] = { x: d, y: r };
    }
    return pos;
  }

  function layoutOf(A) {
    const auto = autoLayout(A);
    const pos = {};
    for (const s of A.states) pos[s] = A.pos[s] || auto[s] || { x: 0, y: 0 };
    return pos;
  }

  // ---------- Wörter ----------

  function parseWord(A, src) {
    const s = String(src).trim();
    if (!s) return [];
    if (A.theory === 'reals') {
      return s.split(/[,\s]+/).filter(Boolean).map(function (p) { return F.fromString(p); });
    }
    if (/^[A-Za-z]+$/.test(s)) return s.split('');
    return s.split(/[,\s]+/).filter(Boolean);
  }

  function formatWord(A, w) {
    if (!w.length) return 'ε';
    if (A.theory === 'reals') return w.map(function (x) { return I.formatEndpoint(x); }).join(', ');
    return w.every(function (c) { return /^[A-Za-z]$/.test(c); }) ? w.join('') : w.join(', ');
  }

  // ---------- Theorie-Instanz ----------

  // Für die Simulation eines konkreten Wortes.
  function theoryForWord(A, word) {
    if (A.theory === 'reals') return new TR.RealTheory({ params: A.params });
    const L = [];
    for (const c of A.constants) if (L.indexOf(c) < 0) L.push(c);
    for (const a of word) if (L.indexOf(a) < 0) L.push(a);
    return new TE.ClassTheory(A.params.length ? A.params : [], L);
  }

  // Wortunabhängig (Projektion, Leerheit, Determinismus).
  function theoryAbstract(A) {
    if (A.theory === 'reals') return new TR.RealTheory({ params: A.params });
    return new TE.PartitionTheory(A.params, A.constants);
  }

  // ---------- Simulation (Plan 3) ----------

  function simulate(A, word) {
    const th = theoryForWord(A, word);
    const steps = [];
    let conf = new Map();
    conf.set(A.initial, th.top());
    steps.push({ letter: null, conf: cloneConf(conf) });

    for (const letter of word) {
      const next = new Map();
      for (const [q, S] of conf) {
        for (const t of A.transitions) {
          if (t.from !== q) continue;
          const S2 = th.restrict(S, t.ast, letter);
          if (th.isEmpty(S2)) continue;
          next.set(t.to, next.has(t.to) ? th.union(next.get(t.to), S2) : S2);
        }
      }
      conf = next;
      steps.push({ letter: letter, conf: cloneConf(conf) });
    }

    const accSets = A.accepting.map(function (q) { return conf.get(q); }).filter(Boolean);
    const cSets = A.complement.map(function (q) { return conf.get(q); }).filter(Boolean);
    const accS = accSets.reduce(function (a, b) { return th.union(a, b); }, th.bottom());
    const cS = cSets.reduce(function (a, b) { return th.union(a, b); }, th.bottom());

    return {
      theory: th, steps: steps, final: conf,
      acceptSet: accS, complementSet: cS,
      accepted: !th.isEmpty(accS),
      complementAccepted: !th.isEmpty(cS)
    };
  }

  function cloneConf(c) {
    const m = new Map();
    for (const [k, v] of c) m.set(k, v);
    return m;
  }

  // ---------- Läufe ohne Vereinigung (SDPA, Plan 4.7) ----------

  function runsOf(A, word) {
    const th = theoryForWord(A, word);
    let runs = [{ path: [], state: A.initial, S: th.top() }];
    for (const letter of word) {
      const next = [];
      for (const r of runs) {
        for (const t of A.transitions) {
          if (t.from !== r.state) continue;
          const S2 = th.restrict(r.S, t.ast, letter);
          if (th.isEmpty(S2)) continue;
          next.push({ path: r.path.concat([t]), state: t.to, S: S2 });
        }
      }
      runs = next;
    }
    return { theory: th, runs: runs };
  }

  // "Jedes Wort vollendet genau einen Lauf" (CIAA Def. SDPA). Ein Lauf ist vollendet,
  // wenn er das ganze Wort liest; das leere Wort vollendet genau den leeren Lauf.
  function isSDPAOnWord(A, word) {
    const r = runsOf(A, word);
    return { count: r.runs.length, ok: r.runs.length === 1, runs: r.runs, theory: r.theory };
  }

  // ---------- Erfüllbarkeit / Determinismus (Plan 4.4) ----------

  function satisfiable(A, ast) {
    const th = theoryAbstract(A);
    if (A.theory === 'reals') return th.satisfiable(ast);
    return th.satisfiable(ast);
  }

  function outgoing(A, q) { return A.transitions.filter(function (t) { return t.from === q; }); }

  function determinismCheck(A) {
    const problems = [];
    for (const q of A.states) {
      const outs = outgoing(A, q);
      for (let i = 0; i < outs.length; i++) {
        for (let j = i + 1; j < outs.length; j++) {
          const both = Fo.mkAnd([outs[i].ast, outs[j].ast]);
          if (satisfiable(A, both)) {
            problems.push({
              kind: 'overlap', state: q,
              detail: displayFormula(A, outs[i].ast) + ' und ' + displayFormula(A, outs[j].ast)
            });
          }
        }
      }
      const disj = outs.length ? Fo.mkOr(outs.map(function (t) { return t.ast; })) : Fo.FALSE;
      const gap = Fo.mkNot(disj);
      if (satisfiable(A, gap)) {
        problems.push({ kind: 'incomplete', state: q, detail: displayFormula(A, gap) });
      }
    }
    return {
      disjoint: !problems.some(function (p) { return p.kind === 'overlap'; }),
      complete: !problems.some(function (p) { return p.kind === 'incomplete'; }),
      problems: problems
    };
  }

  // ---------- Leerheit (Plan 4.4) ----------

  function emptinessCheck(A) {
    const th = theoryAbstract(A);
    const start = { state: A.initial, S: th.top(), path: [] };
    const visited = new Set([A.initial + '#' + th.key(start.S)]);
    const queue = [start];
    const accSet = new Set(A.accepting);
    while (queue.length) {
      const cur = queue.shift();
      if (accSet.has(cur.state)) {
        return { empty: false, witness: buildWitness(A, th, cur), path: cur.path };
      }
      for (const t of A.transitions) {
        if (t.from !== cur.state) continue;
        const S2 = th.intersect(cur.S, th.project(t.ast));
        if (th.isEmpty(S2)) continue;
        const k = t.to + '#' + th.key(S2);
        if (visited.has(k)) continue;
        visited.add(k);
        queue.push({ state: t.to, S: S2, path: cur.path.concat([t]) });
      }
    }
    return { empty: true, witness: null, path: null };
  }

  // Aus dem Pfad ein konkretes Wort bauen: μ* aus S fixieren, dann pro Transition ein x.
  function buildWitness(A, th, node) {
    const mu = th.witness(node.S);
    if (!mu) return null;
    const letters = [];
    for (const t of node.path) {
      const l = th.letterFor(t.ast, mu);
      if (l === null) return null;
      letters.push(typeof l === 'object' && l.sym ? l.sym : l);
    }
    return { word: letters, mu: mu.text, wordText: formatWord(A, letters) };
  }

  // ---------- Label-Vereinfachung und Erreichbarkeit (Plan 4.4) ----------

  function simplifyLabels(A) {
    const B = cloneAutomaton(A);
    const kept = [];
    for (const t of B.transitions) {
      if (!satisfiable(B, t.ast)) continue; // unerfüllbares Label: Transition weg
      t.ast = simplifyAst(B, t.ast);
      kept.push(t);
    }
    B.transitions = kept;
    return B;
  }

  // Konjunkte wegwerfen, die aus den übrigen folgen; ⊤-Konjunkte entfernen.
  function simplifyAst(A, ast) {
    if (ast.t === 'and' && !ast.chain) {
      let xs = ast.xs.map(function (c) { return simplifyAst(A, c); }).filter(function (c) { return c.t !== 'true'; });
      let changed = true;
      while (changed && xs.length > 1) {
        changed = false;
        for (let i = 0; i < xs.length; i++) {
          const rest = xs.slice(0, i).concat(xs.slice(i + 1));
          // rest ⇒ xs[i]? Dann ist xs[i] redundant.
          const test = Fo.mkAnd(rest.concat([Fo.mkNot(xs[i])]));
          if (!satisfiable(A, test)) { xs = rest; changed = true; break; }
        }
      }
      return Fo.mkAnd(xs);
    }
    if (ast.t === 'or') return Fo.mkOr(ast.xs.map(function (c) { return simplifyAst(A, c); }));
    if (ast.t === 'not') return Fo.mkNot(simplifyAst(A, ast.a));
    return ast;
  }

  function reachableStates(A) {
    const seen = new Set([A.initial]);
    const q = [A.initial];
    while (q.length) {
      const s = q.shift();
      for (const t of A.transitions) {
        if (t.from === s && !seen.has(t.to)) { seen.add(t.to); q.push(t.to); }
      }
    }
    return seen;
  }

  function removeUnreachable(A) {
    const keep = reachableStates(A);
    const B = cloneAutomaton(A);
    B.states = B.states.filter(function (s) { return keep.has(s); });
    B.accepting = B.accepting.filter(function (s) { return keep.has(s); });
    B.complement = B.complement.filter(function (s) { return keep.has(s); });
    B.transitions = B.transitions.filter(function (t) { return keep.has(t.from) && keep.has(t.to); });
    const pos = {};
    for (const s of B.states) if (A.pos[s]) pos[s] = A.pos[s];
    B.pos = pos;
    return B;
  }

  function cloneAutomaton(A) {
    return {
      theory: A.theory, states: A.states.slice(), initial: A.initial,
      accepting: A.accepting.slice(), complement: A.complement.slice(),
      transitions: A.transitions.map(function (t) { return { from: t.from, to: t.to, ast: t.ast, line: t.line }; }),
      pos: Object.assign({}, A.pos), params: A.params.slice(), constants: A.constants.slice()
    };
  }

  // ---------- Produkte (Plan 4.5) ----------

  function pairName(a, b) { return '(' + a + ',' + b + ')'; }

  // Gemeinsame Parameter: kein Umbenennen. mode wählt die akzeptierenden Mengen.
  function productRaw(A, B, opts) {
    opts = opts || {};
    const shift = opts.shiftB ? A.params.length : 0;
    requireSameTheory(A, B);
    const C = {
      theory: A.theory, states: [], initial: pairName(A.initial, B.initial),
      accepting: [], complement: [], transitions: [], pos: {},
      params: [], constants: []
    };
    for (const p of A.states) for (const q of B.states) C.states.push(pairName(p, q));
    for (const ta of A.transitions) {
      for (const tb of B.transitions) {
        const bAst = shift ? Fo.shiftParams(tb.ast, shift) : tb.ast;
        C.transitions.push({
          from: pairName(ta.from, tb.from),
          to: pairName(ta.to, tb.to),
          ast: Fo.mkAnd([ta.ast, bAst])
        });
      }
    }
    const paramSet = new Set(A.params);
    for (const p of B.params) paramSet.add(shift ? p + shift : p);
    C.params = Array.from(paramSet).sort(function (a, b) { return a - b; });
    const constSet = new Set(A.constants.concat(B.constants));
    C.constants = Array.from(constSet).sort();
    // Layout aus den Faktoren übernehmen, wenn beide Positionen haben.
    for (const p of A.states) for (const q of B.states) {
      if (A.pos[p] && B.pos[q]) C.pos[pairName(p, q)] = { x: A.pos[p].x * 3 + B.pos[q].x, y: A.pos[p].y * 3 + B.pos[q].y };
    }
    return C;
  }

  // Synchronisiertes Produkt mit der CFPA-Belegung aus CIAA Thm. constructcnf.
  function synchronizedProduct(A, B) {
    const C = productRaw(A, B, { shiftB: false });
    const FA = new Set(A.accepting), FB = new Set(B.accepting);
    for (const p of A.states) for (const q of B.states) {
      const n = pairName(p, q);
      if (FB.has(q)) { (FA.has(p) ? C.accepting : C.complement).push(n); }
      // sonst schwach
    }
    return C;
  }

  function intersectionProduct(A, B) {
    const C = productRaw(A, B, { shiftB: true });
    const FA = new Set(A.accepting), FB = new Set(B.accepting);
    for (const p of A.states) for (const q of B.states) {
      if (FA.has(p) && FB.has(q)) C.accepting.push(pairName(p, q));
    }
    return C;
  }

  function unionProduct(A, B) {
    const C = productRaw(A, B, { shiftB: true });
    const FA = new Set(A.accepting), FB = new Set(B.accepting);
    for (const p of A.states) for (const q of B.states) {
      if (FA.has(p) || FB.has(q)) C.accepting.push(pairName(p, q));
    }
    return C;
  }

  // Komplement einer CFPA: akzeptierend und komplement-akzeptierend tauschen.
  function complementCFPA(A) {
    const B = cloneAutomaton(A);
    const acc = B.accepting;
    B.accepting = B.complement;
    B.complement = acc;
    return B;
  }

  // Vervollständigen: schwacher Sink mit ⊤-Schleife für jede Lücke.
  function addSink(A, sinkName) {
    const B = cloneAutomaton(A);
    const name = sinkName || uniqueName(B.states, 'sink');
    let needed = false;
    for (const q of A.states) {
      const outs = outgoing(A, q);
      const disj = outs.length ? Fo.mkOr(outs.map(function (t) { return t.ast; })) : Fo.FALSE;
      const gap = Fo.mkNot(disj);
      if (!satisfiable(A, gap)) continue;
      needed = true;
      B.transitions.push({ from: q, to: name, ast: gap });
    }
    if (!needed) return B;
    B.states.push(name);
    B.transitions.push({ from: name, to: name, ast: Fo.TRUE });
    return B;
  }

  function uniqueName(states, base) {
    if (states.indexOf(base) < 0) return base;
    let i = 1;
    while (states.indexOf(base + i) >= 0) i++;
    return base + i;
  }

  // Größtes F_c (CIAA §3.1): q ∈ F_c ⇔ L(A) ∩ L(A[F := {q}]) = ∅.
  function largestFc(A) {
    if (A.theory !== 'equality') throw new Error(M('msg.fcEqOnly', 'Größtes F_c ist in v1 nur in der Gleichheitstheorie verfügbar (das direkte Produkt verdoppelt die reellen Parameter)'));
    const out = [];
    for (const q of A.states) {
      if (A.accepting.indexOf(q) >= 0) continue;
      const Aq = cloneAutomaton(A);
      Aq.accepting = [q];
      Aq.complement = [];
      const prod = intersectionProduct(A, Aq);
      if (emptinessCheck(prod).empty) out.push(q);
    }
    return out;
  }

  // ---------- Wortaufzählung (Plan 4.6) ----------

  // Kanonische Wörter über der Gleichheitstheorie: "restricted growth strings", zusätzlich
  // dürfen die Konstanten an jeder Stelle stehen. Vollständig bis zur Längenschranke.
  function enumerateEqualityWords(constants, maxLen) {
    const out = [[]];
    const letters = 'abcdefghijklmnopqrstuvwxyz'.split('').filter(function (c) { return constants.indexOf(c) < 0; });
    function rec(w, freshUsed) {
      if (w.length >= maxLen) return;
      const cands = constants.concat(letters.slice(0, freshUsed + 1));
      for (const c of cands) {
        const w2 = w.concat([c]);
        out.push(w2);
        const isNew = letters.indexOf(c) === freshUsed;
        rec(w2, isNew ? freshUsed + 1 : freshUsed);
      }
    }
    rec([], 0);
    return out;
  }

  const DEFAULT_GRID = ['0', '1/2', '1', '3/2', '2', '5/2', '3'];

  function enumerateRealWords(grid, maxLen) {
    const vals = (grid || DEFAULT_GRID).map(function (s) { return typeof s === 'string' ? F.fromString(s) : s; });
    const out = [[]];
    function rec(w) {
      if (w.length >= maxLen) return;
      for (const v of vals) { const w2 = w.concat([v]); out.push(w2); rec(w2); }
    }
    rec([]);
    return out;
  }

  function enumerateWords(A, opts) {
    opts = opts || {};
    const maxLen = opts.maxLen === undefined ? (A.theory === 'reals' ? 4 : 5) : opts.maxLen;
    if (A.theory === 'reals') return enumerateRealWords(opts.grid, maxLen);
    return enumerateEqualityWords(A.constants, maxLen);
  }

  // ---------- Beschränkte Checks (Plan 4.6) ----------

  function checkCFPAConsistency(A, opts) {
    const words = enumerateWords(A, opts);
    let conflicts = 0, gaps = 0, firstConflict = null, firstGap = null;
    for (const w of words) {
      const r = simulate(A, w);
      if (r.accepted && r.complementAccepted) {
        conflicts++;
        if (!firstConflict) firstConflict = { word: w, text: formatWord(A, w) };
      } else if (!r.accepted && !r.complementAccepted) {
        gaps++;
        if (!firstGap) firstGap = { word: w, text: formatWord(A, w) };
      }
    }
    return {
      checked: words.length, maxLen: opts && opts.maxLen,
      conflicts: conflicts, gaps: gaps,
      firstConflict: firstConflict, firstGap: firstGap,
      ok: conflicts === 0 && gaps === 0
    };
  }

  function checkUniversality(A, opts) {
    const words = enumerateWords(A, opts);
    for (const w of words) {
      const r = simulate(A, w);
      if (!r.accepted) return { universal: false, checked: words.length, witness: { word: w, text: formatWord(A, w) } };
    }
    return { universal: true, checked: words.length, witness: null };
  }

  // Zwei Automaten sind nur vergleichbar, wenn sie über derselben Struktur laufen.
  // Sonst landen Buchstaben der einen Theorie in der Auswertung der anderen.
  function requireSameTheory(A, B) {
    if (A.theory === B.theory) return;
    const en = typeof root.I18n !== 'undefined' && root.I18n.lang() === 'en';
    const name = en
      ? { reals: 'the reals', equality: 'equality' }
      : { reals: 'reelle Zahlen', equality: 'Gleichheit' };
    throw new Error(en
      ? 'A and B use different theories (' + name[A.theory] + ' against ' + name[B.theory] +
        '). They read different alphabets and are not comparable.'
      : 'A und B benutzen verschiedene Theorien (' + name[A.theory] + ' gegen ' +
        name[B.theory] + '). Sie lesen verschiedene Alphabete und sind nicht vergleichbar.');
  }

  // Für den Vergleich zweier Automaten müssen die Konstanten beider im Alphabet
  // vorkommen, sonst prüft die Aufzählung Wörter, die B gar nicht unterscheiden kann.
  function wordsForPair(A, B, opts) {
    if (A.theory === 'reals') return enumerateWords(A, opts);
    const consts = A.constants.slice();
    for (const c of B.constants) if (consts.indexOf(c) < 0) consts.push(c);
    consts.sort();
    const maxLen = (opts && opts.maxLen !== undefined) ? opts.maxLen : 5;
    return enumerateEqualityWords(consts, maxLen);
  }

  function checkEquivalence(A, B, opts) {
    requireSameTheory(A, B);
    const words = wordsForPair(A, B, opts);
    for (const w of words) {
      const ra = simulate(A, w), rb = simulate(B, w);
      if (ra.accepted !== rb.accepted) {
        return {
          equivalent: false, checked: words.length,
          witness: { word: w, text: formatWord(A, w), inA: ra.accepted, inB: rb.accepted }
        };
      }
    }
    return { equivalent: true, checked: words.length, witness: null };
  }

  // Skolem-Bedingung 3 (CIAA Def. skolem): für w ∈ L(A) und μ ∈ L(B_μ) muss w ∈ L(A_μ).
  // Verletzt ⇔ S_A ≠ ∅ und diff(S_B, S_A) ≠ ∅.
  function checkSkolem(A, B, opts) {
    requireSameTheory(A, B);
    for (const p of A.params) if (B.params.indexOf(p) < 0) {
      return { ok: false, reason: 'Bedingung 2 verletzt: Parameter y' + p + ' von A fehlt in B' };
    }
    // Die Parametermengen von A und B werden gleich dargestellt und direkt verglichen.
    // In der Gleichheitstheorie hängt die Darstellung an der Parameterliste und am
    // Alphabet; beides muss deshalb übereinstimmen, sonst vergleicht diff Tupel
    // verschiedener Länge und liefert stillschweigend Unsinn.
    if (A.theory === 'equality') {
      if (A.params.join(',') !== B.params.join(',')) {
        return { ok: false, reason: 'A und B müssen dieselben Parameter benutzen (A: ' +
          (A.params.map(function (p) { return 'y' + p; }).join(', ') || 'keine') + ', B: ' +
          (B.params.map(function (p) { return 'y' + p; }).join(', ') || 'keine') + ')' };
      }
      if (A.constants.join(',') !== B.constants.join(',')) {
        return { ok: false, reason: 'A und B müssen dieselben Konstanten benutzen (A: ' +
          (A.constants.join(' ') || 'keine') + ', B: ' + (B.constants.join(' ') || 'keine') + ')' };
      }
    }

    const words = wordsForPair(A, B, opts);
    for (const w of words) {
      const ra = simulate(A, w);
      if (!ra.accepted) continue;
      const rb = simulate(B, w);
      // Beide Simulationen haben nach den Prüfungen oben dieselbe Theorie-Instanz:
      // in der Gleichheitstheorie hängt sie nur vom Wort, den Parametern und den
      // Konstanten ab, in der reellen Theorie gibt es nichts zu unterscheiden.
      const th = ra.theory;
      const d = th.diff(rb.acceptSet, ra.acceptSet);
      if (!th.isEmpty(d)) {
        const mu = th.witness(d);
        return {
          ok: false, checked: words.length,
          witness: { word: w, text: formatWord(A, w), mu: mu && mu.text ? mu.text : null }
        };
      }
    }
    return { ok: true, checked: words.length, witness: null };
  }

  function checkSDPA(A, opts) {
    const words = enumerateWords(A, opts);
    for (const w of words) {
      const r = isSDPAOnWord(A, w);
      if (!r.ok) {
        return { ok: false, checked: words.length, witness: { word: w, text: formatWord(A, w), count: r.count } };
      }
    }
    return { ok: true, checked: words.length, witness: null };
  }

  root.Automaton = {
    parseDSL: parseDSL, toDSL: toDSL, cloneAutomaton: cloneAutomaton,
    displayState: displayState, displayFormula: displayFormula, splitTuple: splitTuple,
    autoLayout: autoLayout, layoutOf: layoutOf,
    parseWord: parseWord, formatWord: formatWord,
    theoryForWord: theoryForWord, theoryAbstract: theoryAbstract,
    simulate: simulate, runsOf: runsOf, isSDPAOnWord: isSDPAOnWord,
    satisfiable: satisfiable, determinismCheck: determinismCheck, emptinessCheck: emptinessCheck,
    simplifyLabels: simplifyLabels, removeUnreachable: removeUnreachable, reachableStates: reachableStates,
    synchronizedProduct: synchronizedProduct, intersectionProduct: intersectionProduct,
    unionProduct: unionProduct, complementCFPA: complementCFPA, addSink: addSink,
    largestFc: largestFc, outgoing: outgoing,
    enumerateWords: enumerateWords, enumerateEqualityWords: enumerateEqualityWords,
    enumerateRealWords: enumerateRealWords, DEFAULT_GRID: DEFAULT_GRID,
    requireSameTheory: requireSameTheory, wordsForPair: wordsForPair,
    checkCFPAConsistency: checkCFPAConsistency, checkUniversality: checkUniversality,
    checkEquivalence: checkEquivalence, checkSkolem: checkSkolem, checkSDPA: checkSDPA
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
