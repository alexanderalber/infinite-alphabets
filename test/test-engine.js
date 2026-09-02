// test-engine.js — Testfälle aus Plan 7 (Simulation, Leerheit, Determinismus, Produkte).
'use strict';
const H = require('./harness');
H.loadAll();

const F = globalThis.Fraction;
const I = globalThis.Intervals;
const Fo = globalThis.Formula;
const Au = globalThis.Automaton;
const Ex = globalThis.Examples;
const TR = globalThis.TheoryReal;

function load(id) { return Au.parseDSL(Ex.byId(id).dsl); }
function run(A, wordSrc) { return Au.simulate(A, Au.parseWord(A, wordSrc)); }
function setOf(r, q) {
  const S = r.final.get(q);
  return S === undefined ? '∅' : r.theory.format(S);
}

H.group('project (reelle Theorie)');
function proj(src) {
  const p = Fo.parse(src, { theory: 'reals' });
  return I.format(TR.project(p.ast), 'y');
}
H.eq('x < y ∧ x > y+1', proj('x < y and x > y+1'), '∅');
H.eq('y ≤ x ≤ y+1', proj('y <= x <= y+1'), 'y beliebig');
H.eq('x = y ∧ x ≠ y', proj('x = y and x != y'), '∅');
H.eq('(x=y ∧ y>2) ∨ (x<0 ∧ y=1)', proj('(x = y and y > 2) or (x < 0 and y = 1)'), 'y = 1 ∨ y > 2');
H.eq('x = y', proj('x = y'), 'y beliebig');
H.eq('x = y ∧ x = y+1', proj('x = y and x = y+1'), '∅');

H.group('A₂');
const A2 = load('A2');
let r = run(A2, '1, 2, 3');
H.eq('1,2,3 akzeptiert', String(r.accepted), 'true');
H.eq('1,2,3 S(q1)', setOf(r, 'q1'), 'y = 3');
r = run(A2, '3, 2, 1');
H.eq('3,2,1 nicht akzeptiert', String(r.accepted), 'false');
// Plan 7 erwartet hier "alle S leer nach Buchstabe 2". Das gilt fuer A2 nicht: q0 hat die
// Schleife x < y ohne obere Schranke, also ueberlebt y > 3 das ganze Wort. Tot ist nur der
// akzeptierende Zweig, und zwar ab Buchstabe 2.
H.eq('3,2,1: q1 stirbt ab Buchstabe 2', String(r.steps[2].conf.has('q1')), 'false');
H.eq('3,2,1: q0 behaelt y > 3', setOf({ final: r.steps[3].conf, theory: r.theory }, 'q0'), 'y > 3');
H.eq('1,3,3 nicht akzeptiert', String(run(A2, '1, 3, 3').accepted), 'false');
r = run(A2, '');
H.eq('leer nicht akzeptiert', String(r.accepted), 'false');
H.eq('leer S(q0) = ℝ', setOf(r, 'q0'), 'y beliebig');

H.group('A₁');
const A1 = load('A1');
r = run(A1, '1, 3, 2');
H.eq('1,3,2 akzeptiert', String(r.accepted), 'true');
H.eq('1,3,2 S(q2)', setOf(r, 'q2'), 'y = 3');
H.eq('1,2,3 nicht akzeptiert', String(run(A1, '1, 2, 3').accepted), 'false');

H.group('A₃');
const A3 = load('A3');
r = run(A3, '1/5, 11/10, 1/2');
H.eq('akzeptiert', String(r.accepted), 'true');
H.eq('S(q0) = [1/10, 1/5]', setOf(r, 'q0'), '1/10 ≤ y ≤ 1/5');
H.eq('0, 3/2 nicht akzeptiert', String(run(A3, '0, 3/2').accepted), 'false');
H.eq('leer akzeptiert', String(run(A3, '').accepted), 'true');

H.group('C₃');
const C3 = load('C3');
r = run(C3, '0, 2');
H.eq('0,2 komplement-akzeptiert', String(r.complementAccepted), 'true');
H.eq('0,2 S(p3)', setOf(r, 'p3'), 'y = 0');
H.eq('0,1/2 akzeptiert', String(run(C3, '0, 1/2').accepted), 'true');
H.eq('2,0 komplement-akzeptiert', String(run(C3, '2, 0').complementAccepted), 'true');
r = run(C3, '1, 1/2, 8/5');
H.eq('1,1/2,8/5 komplement-akzeptiert', String(r.complementAccepted), 'true');
H.eq('1,1/2,8/5 S(p3)', setOf(r, 'p3'), 'y = 1/2');

H.group('C₃ gegen A₃ auf Gitterwörtern');
const gridOpts = { maxLen: 4, grid: ['0', '1/2', '1', '3/2', '2', '5/2', '3'] };
const cons = Au.checkCFPAConsistency(C3, gridOpts);
H.eq('XOR-Konsistenz', String(cons.ok), 'true');
const equiv = Au.checkEquivalence(C3, A3, gridOpts);
H.eq('äquivalent zu A₃', String(equiv.equivalent), 'true');
H.check('genügend Wörter geprüft', cons.checked > 2000, 'nur ' + cons.checked);

H.group('D (SDPA)');
const D = load('D');
r = run(D, '1, 2, 1');
H.eq('1,2,1 akzeptiert', String(r.accepted), 'true');
H.eq('1,2,1 S(q1)', setOf(r, 'q1'), 'y = 1');
H.eq('1,2,1 genau ein Lauf', String(Au.isSDPAOnWord(D, Au.parseWord(D, '1,2,1')).count), '1');
r = run(D, '1, 2');
H.eq('1,2 nicht akzeptiert', String(r.accepted), 'false');
H.eq('1,2 komplement-akzeptiert via q2', String(r.complementAccepted), 'true');
H.eq('leeres Wort: genau der leere Lauf', String(Au.isSDPAOnWord(D, []).count), '1');
const sd = Au.checkSDPA(D, gridOpts);
H.eq('SDPA auf Gitterwörtern', String(sd.ok), 'true');

H.group('B (Skolem-Automat)');
const B = load('B');
const uni = Au.checkUniversality(B, gridOpts);
H.eq('universell auf Gitterwörtern', String(uni.universal), 'true');
H.eq('leeres Wort: S(r0) = ℝ', setOf(run(B, ''), 'r0'), 'y beliebig');
H.eq('1,2,3: S(r0) = {3}', setOf(run(B, '1,2,3'), 'r0'), 'y = 3');

H.group("Skolem-Bedingung A₂' / B");
const A2p = load('A2p');
const sk = Au.checkSkolem(A2p, B, gridOpts);
H.eq('keine Verletzung', String(sk.ok), 'true');

H.group('Determinismus');
const dA2p = Au.determinismCheck(A2p);
H.eq("A₂' disjunkt", String(dA2p.disjoint), 'true');
H.eq("A₂' vollständig", String(dA2p.complete), 'true');
const dA2 = Au.determinismCheck(A2);
H.eq('A₂ disjunkt', String(dA2.disjoint), 'true');
H.eq('A₂ unvollständig', String(dA2.complete), 'false');
H.eq('A₂ unvollständig in q0 und q1',
  dA2.problems.filter(function (p) { return p.kind === 'incomplete'; }).map(function (p) { return p.state; }).sort().join(','),
  'q0,q1');
const dA1 = Au.determinismCheck(A1);
H.eq('A₁ nicht disjunkt', String(dA1.disjoint), 'false');
H.eq('A₁ Überlappung in q0',
  dA1.problems.filter(function (p) { return p.kind === 'overlap'; })[0].state, 'q0');

H.group('Leerheit');
const emptyA2 = Au.emptinessCheck(A2);
H.eq('A₂ nichtleer', String(emptyA2.empty), 'false');
H.eq('A₂ Zeuge Länge 1', String(emptyA2.witness.word.length), '1');
H.check('A₂ Zeuge wird akzeptiert', Au.simulate(A2, emptyA2.witness.word).accepted, emptyA2.witness.wordText);
const leer = Au.parseDSL('theory reals\nstates q0 q1\ninitial q0\naccepting q1\nq0 -> q1 : x < y and x > y');
H.eq('unerfüllbares Label ⇒ leer', String(Au.emptinessCheck(leer).empty), 'true');

H.group('Produkt A₂\' ⊗ B');
let prod = Au.synchronizedProduct(A2p, B);
prod = Au.removeUnreachable(Au.simplifyLabels(prod));
const expect = Au.parseDSL(Ex.byId('A2pB').dsl);
H.eq('Zustandszahl', String(prod.states.length), String(expect.states.length));
H.eq('Transitionszahl', String(prod.transitions.length), String(expect.transitions.length));
function sig(A) {
  return A.transitions.map(function (t) {
    return t.from + '->' + t.to + ':' + Fo.fmt(t.ast, { ascii: true });
  }).sort().join('\n');
}
H.eq('Transitionen identisch', sig(prod), sig(expect));
H.eq('akzeptierend', prod.accepting.slice().sort().join(','), expect.accepting.slice().sort().join(','));
H.eq('komplement-akzeptierend', prod.complement.slice().sort().join(','), expect.complement.slice().sort().join(','));

H.group('EPA (Gleichheitstheorie)');
const E2 = load('EPA2');
H.eq('abab akzeptiert', String(run(E2, 'abab').accepted), 'true');
H.eq('abab Klasse', setOf(run(E2, 'abab'), 'q0'), '(y₁ = a, y₂ = b)');
H.eq('aa akzeptiert', String(run(E2, 'aa').accepted), 'true');
H.eq('aa Klasse', setOf(run(E2, 'aa'), 'q0'), '(y₁ = a, y₂ = a)');
H.eq('aba nicht akzeptiert', String(run(E2, 'aba').accepted), 'false');
H.eq('leeres Wort akzeptiert', String(run(E2, '').accepted), 'true');

H.group('Gleichheitstheorie: Leerheit und Partitionen');
H.eq('EPA₂ nichtleer', String(Au.emptinessCheck(E2).empty), 'false');
const double = load('VAdouble');
H.eq('doppelter Buchstabe nichtleer', String(Au.emptinessCheck(double).empty), 'false');
const dblWit = Au.emptinessCheck(double).witness;
H.check('Zeuge wird akzeptiert', Au.simulate(double, dblWit.word).accepted, dblWit.wordText + ' / ' + dblWit.mu);

H.group('Vervollständigen und Komplement');
const A3sink = Au.addSink(A3);
H.eq('A₃ + Sink hat 2 Zustände', String(A3sink.states.length), '2');
H.eq('A₃ + Sink ist vollständig', String(Au.determinismCheck(A3sink).complete), 'true');
H.eq('A₃ + Sink äquivalent zu A₃', String(Au.checkEquivalence(A3sink, A3, gridOpts).equivalent), 'true');
const C3c = Au.complementCFPA(C3);
H.eq('Komplement tauscht F und F_c', C3c.accepting.join(',') + '|' + C3c.complement.join(','), 'p3|p0,p1');

H.group('Wortaufzählung');
const eqw = Au.enumerateEqualityWords([], 5);
H.eq('Σ Bell(n) für n ≤ 5', String(eqw.length), String(1 + 1 + 2 + 5 + 15 + 52));
const eqwc = Au.enumerateEqualityWords(['a', 'b'], 3);
// Pro Position: die beiden Konstanten plus der naechste noch unbenutzte frische Buchstabe;
// die Zahl der frischen waechst mit jedem neu eingefuehrten Buchstaben.
H.eq('mit 2 Konstanten, Länge ≤ 3', String(eqwc.length), String(countEqWords(2, 3)));

function countEqWords(nConst, maxLen) {
  let total = 0;
  (function rec(len, fresh) {
    total++;
    if (len >= maxLen) return;
    for (let i = 0; i < nConst; i++) rec(len + 1, fresh);
    rec(len + 1, fresh + 1); // der naechste frische Buchstabe
    for (let i = 0; i < fresh; i++) rec(len + 1, fresh); // schon benutzte frische
  })(0, 0);
  return total;
}

H.group('Universalität in der Gleichheitstheorie');
const uniDouble = Au.checkUniversality(double, { maxLen: 4 });
H.eq('doppelter Buchstabe nicht universell', String(uniDouble.universal), 'false');
H.eq('Zeuge ist das leere Wort', uniDouble.witness.text, 'ε');
const V = load('V');
const uniV = Au.checkUniversality(V, { maxLen: 6 });
H.eq('V universell bis Länge 6', String(uniV.universal), 'true');

H.group('Operationen mit zwei Automaten lehnen Unvergleichbares ab');
const epa = Au.parseDSL(Ex.epaFamily(2));   // Gleichheit
function rejects(name, fn) {
  let msg = '';
  try { const r = fn(); msg = (r && r.reason) || 'kein Fehler'; }
  catch (e) { msg = e.message; }
  H.check(name, /verschiedene Theorien/.test(msg), msg);
}
rejects('A ≡ B', function () { return Au.checkEquivalence(epa, B, { maxLen: 3 }); });
rejects('Skolem', function () { return Au.checkSkolem(epa, B, { maxLen: 3 }); });
rejects('synchronisiertes Produkt', function () { return Au.synchronizedProduct(epa, B); });
rejects('Schnitt', function () { return Au.intersectionProduct(epa, B); });
rejects('Vereinigung', function () { return Au.unionProduct(epa, B); });

// Gleiche Theorie, aber unterschiedliche Konstanten: der Skolem-Vergleich waere sonst
// ein Vergleich von Klassentupeln verschiedener Bedeutung.
const konstA = Au.parseDSL('theory equality\nstates s0\ninitial s0\naccepting s0\ns0 -> s0 : x = a');
const konstB = Au.parseDSL('theory equality\nstates t0\ninitial t0\naccepting t0\nt0 -> t0 : x = b');
H.check('Skolem verlangt gleiche Konstanten',
  /dieselben Konstanten/.test(Au.checkSkolem(konstA, konstB, { maxLen: 3 }).reason || ''),
  JSON.stringify(Au.checkSkolem(konstA, konstB, { maxLen: 3 })));
const paramA = Au.parseDSL('theory equality\nstates s0 s1\ninitial s0\naccepting s1\ns0 -> s1 : x = y1');
const paramB = Au.parseDSL('theory equality\nstates t0 t1\ninitial t0\naccepting t1\nt0 -> t1 : x = y1\nt1 -> t1 : x = y2');
H.check('Skolem verlangt gleiche Parameter',
  /dieselben Parameter/.test(Au.checkSkolem(paramA, paramB, { maxLen: 3 }).reason || ''),
  JSON.stringify(Au.checkSkolem(paramA, paramB, { maxLen: 3 })));

// Die Wortaufzählung für ein Paar kennt die Konstanten beider Automaten.
const pairWords = Au.wordsForPair(konstA, konstB, { maxLen: 2 });
H.check('Aufzählung enthält beide Konstanten',
  pairWords.some(function (w) { return w.join('') === 'a'; }) &&
  pairWords.some(function (w) { return w.join('') === 'b'; }),
  pairWords.map(function (w) { return w.join('') || 'ε'; }).join(' '));
// Und damit findet die Äquivalenzprüfung den Unterschied.
const konstEq = Au.checkEquivalence(konstA, konstB, { maxLen: 2 });
H.eq('unterschiedliche Konstanten ⇒ nicht äquivalent', String(konstEq.equivalent), 'false');

H.group('Größtes F_c (Gleichheitstheorie)');
const lastnew = load('VAlastnew');
const fc = Au.largestFc(lastnew);
H.check('F_c berechnet', Array.isArray(fc), String(fc));

process.exit(H.report());
