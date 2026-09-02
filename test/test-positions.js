// test-positions.js — Positionen, Nachfolgermatrizen und Erkundung (Plan 5, 7).
'use strict';
const H = require('./harness');
H.loadAll();

const Au = globalThis.Automaton;
const Ex = globalThis.Examples;
const P = globalThis.Positions;

const V = Au.parseDSL(Ex.byId('V').dsl);
const info = P.analyze(V);

H.group('V — Wohlgeformtheit');
H.eq('ist 1-VA', String(info.ok), 'true');
H.eq('Y', String(info.Y.map(function (i) { return i + 1; })), '2,2,3');
H.eq('Z', String(info.Z.map(function (i) { return i + 1; })), '2,3,2');

const mats = P.matrices(info);

H.group('V — Matrizen (ATVA Ex. position)');
function rows(M) { return M.map(function (r) { return r.join(''); }).join('/'); }
H.eq('M', rows(mats.M), '000000/101000/010000/000000/000101/000010');
H.eq('B', rows(mats.B), '000000/000110/000001/000000/000000/000000');
H.eq('v¹', String(mats.v[0]), '0,0,0,0,0,0');
H.eq('v²', String(mats.v[1]), '0,1,-1,0,0,0');
H.eq('v³', String(mats.v[2]), '0,-1,1,0,0,0');

H.group('V — Positionen via Simulation');
function pos(word) { return P.positionBySimulation(V, info, word.split('')); }
H.eq('abacb', String(pos('abacb')), '0,1,2,0,1,0');
H.eq('abacba', String(pos('abacba')), '0,1,2,0,0,1');
H.eq('abacbd', String(pos('abacbd')), '0,3,1,0,0,1');
H.eq('abacbc = abacba', String(pos('abacbc')), String(pos('abacba')));
H.eq('leeres Wort = e_{n+1}', String(P.positionBySimulation(V, info, [])), '0,0,0,1,0,0');
H.eq('Anfangsposition', String(P.initialPosition(info)), '0,0,0,1,0,0');

H.group('V — Positionen via Matrizen');
function tokenState(prefix, a) {
  let s = info.initial;
  for (const b of prefix) s = (b === a) ? info.Y[s] : info.Z[s];
  return s;
}
function viaMatrices(word) {
  let p = P.initialPosition(info);
  const seen = [];
  for (let k = 0; k < word.length; k++) {
    const a = word[k];
    if (seen.indexOf(a) < 0) { seen.push(a); p = P.successorNew(info, mats, p); }
    else p = P.successorKnown(info, mats, p, tokenState(word.slice(0, k), a));
  }
  return p;
}
H.eq('abacb', String(viaMatrices('abacb'.split(''))), '0,1,2,0,1,0');
H.eq('abacba', String(viaMatrices('abacba'.split(''))), '0,1,2,0,0,1');
H.eq('abacbd', String(viaMatrices('abacbd'.split(''))), '0,3,1,0,0,1');

H.group('Simulation = Matrizen auf zufälligen 1-VA');
// Deterministischer Pseudozufall, damit Fehlschläge reproduzierbar sind.
let seed = 20260902;
function rnd(n) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; }
function randomVA(n) {
  const lines = ['theory equality'];
  const states = [];
  for (let i = 0; i < n; i++) states.push('q' + i);
  lines.push('states ' + states.join(' '));
  lines.push('initial q0');
  const acc = states.filter(function () { return rnd(2) === 0; });
  if (acc.length) lines.push('accepting ' + acc.join(' '));
  for (let i = 0; i < n; i++) {
    lines.push('q' + i + ' -> q' + rnd(n) + ' : x = y');
    lines.push('q' + i + ' -> q' + rnd(n) + ' : x != y');
  }
  return Au.parseDSL(lines.join('\n'));
}
let mismatches = 0, cases = 0;
for (let trial = 0; trial < 40; trial++) {
  const n = 2 + rnd(4);
  const A = randomVA(n);
  const inf = P.analyze(A);
  if (!inf.ok) { H.check('zufälliger Automat ist 1-VA', false, inf.problems.join('; ')); continue; }
  const ms = P.matrices(inf);
  for (let w = 0; w < 6; w++) {
    const len = rnd(7);
    const word = [];
    const alpha = 'abcd';
    for (let k = 0; k < len; k++) word.push(alpha[rnd(alpha.length)]);
    // via Matrizen
    let p = P.initialPosition(inf);
    const seen = [];
    for (let k = 0; k < word.length; k++) {
      const a = word[k];
      if (seen.indexOf(a) < 0) { seen.push(a); p = P.successorNew(inf, ms, p); }
      else {
        let s = inf.initial;
        for (const b of word.slice(0, k)) s = (b === a) ? inf.Y[s] : inf.Z[s];
        p = P.successorKnown(inf, ms, p, s);
      }
    }
    const q = P.positionBySimulation(A, inf, word);
    cases++;
    if (String(p) !== String(q)) {
      mismatches++;
      H.check('Position stimmt für ' + word.join(''), false, String(p) + ' vs ' + String(q));
    }
  }
}
H.check('alle zufälligen Fälle stimmen (' + cases + ')', mismatches === 0, mismatches + ' Abweichungen');

H.group('Position und Mitgliedschaft stimmen überein');
// w ∈ L(A) ⇔ ein Eintrag zu einem akzeptierenden Zustand ist > 0.
for (const id of Ex.vaIds) {
  const A = Au.parseDSL(Ex.byId(id).dsl);
  const inf = P.analyze(A);
  let bad = 0;
  for (const w of Au.enumerateEqualityWords([], 5)) {
    const p = P.positionBySimulation(A, inf, w);
    const viaPos = P.isAccepting(inf, p);
    const viaSim = Au.simulate(A, w).accepted;
    if (viaPos !== viaSim) bad++;
  }
  H.eq(id + ': Position ⇔ Simulation', String(bad), '0');
}

H.group('Erkundung');
const expV = P.explore(V, { maxDepth: 8 });
H.eq('V: keine nicht-akzeptierende Position bis Länge 8', String(expV.universalSoFar), 'true');
H.check('V: Positionsmenge wächst', expV.count > 5, 'nur ' + expV.count + ' Knoten');

const dbl = Au.parseDSL(Ex.byId('VAdouble').dsl);
const expD = P.explore(dbl, { maxDepth: 4 });
H.eq('doppelter Buchstabe: Gegenbeispiel gefunden', String(expD.universalSoFar), 'false');
H.eq('Zeuge bei Länge 0', String(expD.witness.depth), '0');

const lastnew = Au.parseDSL(Ex.byId('VAlastnew').dsl);
const expL = P.explore(lastnew, { maxDepth: 4 });
H.eq('letzter Buchstabe neu: nicht universell', String(expL.universalSoFar), 'false');
H.check('Zeuge wird nicht akzeptiert',
  !Au.simulate(lastnew, expL.witness.word).accepted,
  'Zeuge: ' + expL.witness.word.join(''));

H.group('Zeugenwörter sind echt');
for (const [A, exp] of [[dbl, expD], [lastnew, expL]]) {
  if (!exp.witness) continue;
  const p = P.positionBySimulation(A, P.analyze(A), exp.witness.word);
  H.eq('Zeugenposition stimmt', String(p), String(exp.witness.p));
}

H.group('1-VA-Validierung lehnt Untaugliches ab');
const notVA = Au.parseDSL('theory reals\nstates q0\ninitial q0\naccepting q0\nq0 -> q0 : x < y');
H.eq('reelle Theorie abgelehnt', String(P.analyze(notVA).ok), 'false');
const incomplete = Au.parseDSL('theory equality\nstates q0 q1\ninitial q0\naccepting q1\nq0 -> q1 : x = y');
const iv = P.analyze(incomplete);
H.eq('unvollständig abgelehnt', String(iv.ok), 'false');
H.check('Grund genannt', iv.problems.some(function (s) { return /x ≠ y/.test(s); }), iv.problems.join('; '));

process.exit(H.report());
