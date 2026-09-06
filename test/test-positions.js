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

H.group('Bell-Zahlen');
H.eq('B₀ bis B₇', String([0, 1, 2, 3, 4, 5, 6, 7].map(P.bell)), '1,1,2,5,15,52,203,877');

H.group('Abbruchgründe sind unterscheidbar');
const cutDepth = P.explore(V, { maxDepth: 2 });
H.eq('Tiefengrenze: truncated', String(cutDepth.truncated), 'true');
H.eq('Tiefengrenze: aber keine Knotengrenze', String(cutDepth.nodeLimit), 'false');
const cutNodes = P.explore(V, { maxDepth: 12, maxNodes: 5 });
H.eq('Knotengrenze: nodeLimit', String(cutNodes.nodeLimit), 'true');

H.group('Ebenen (Plan 5.3: abacba und abacbc fallen zusammen)');
const expV3 = P.explore(V, { maxDepth: 3 });
const lvV = P.levels(expV3);
H.eq('Ebene 0 hat eine Position', String(lvV[0].length), '1');
H.eq('leeres Wort ist e₄', String(lvV[0][0].p), '0,0,0,1,0,0');
H.eq('Ebenen bis Tiefe 3', String(lvV.length), '4');
H.check('nie mehr Positionen als Wörter bis auf Umbenennung',
  lvV.every(function (level, k) { return level.length <= P.bell(k); }),
  String(lvV.map(function (l) { return l.length; })));

// Die Behauptung der Seite nachrechnen, nicht nur wiederholen: eine
// Selbstueberdeckung p ⊑ p' muss sich tatsaechlich pumpen lassen, und die als
// wachsend gemeldeten Koordinaten muessen beim zweiten Durchlauf echt groesser
// sein als beim ersten.
H.group('Pumpen: Selbstüberdeckungen sind echt');
for (const [name, A] of [['V', V], ['VAdouble', dbl], ['VAlastnew', lastnew]]) {
  const res = P.explore(A, { maxDepth: 5 });
  const inf = res.info;
  const pairs = P.coveringPairs(res, { limit: 8 });
  H.check(name + ': Überdeckung gefunden', pairs.length > 0, String(pairs.length) + ' Paare');
  for (const pr of pairs) {
    H.check(name + ': Vorfahr ⊑ Nachfahre', P.leq(pr.ancestor, pr.node),
      String(pr.ancestor) + ' ⊑ ' + String(pr.node));
    const once = P.pumpWord(inf, pr, 1);
    const twice = P.pumpWord(inf, pr, 2);
    H.check(name + ': Pumpwort existiert', !!once && !!twice, String(once) + ' / ' + String(twice));
    if (!once || !twice) continue;
    const p1 = P.positionBySimulation(A, inf, once);
    const p2 = P.positionBySimulation(A, inf, twice);
    H.check(name + ': einmal durchlaufen trifft die Position',
      String(p1) === String(pr.node), String(p1) + ' statt ' + String(pr.node));
    H.check(name + ': die Folge wächst monoton', P.leq(p1, p2),
      String(p1) + ' → ' + String(p2));

    // Die gemeldeten Koordinaten muessen wirklich unbeschraenkt sein, die
    // uebrigen wirklich beschraenkt: nach genuegend Runden duerfen nur noch die
    // gemeldeten weiterwachsen. R ist mit Abstand groesser als jede
    // Traegerperiode bei sechs Koordinaten.
    const R = 24, S = 40;
    const pR = P.positionBySimulation(A, inf, P.pumpWord(inf, pr, R));
    const pS = P.positionBySimulation(A, inf, P.pumpWord(inf, pr, S));
    const grew = [];
    for (let i = 0; i < pR.length; i++) if (pS[i] > pR[i]) grew.push(i);
    H.eq(name + ': unbeschränkte Koordinaten stimmen',
      String(grew), String(pr.unbounded));
  }
}

H.group('V bleibt akzeptierend, auch gepumpt');
{
  const res = P.explore(V, { maxDepth: 5 });
  for (const pr of P.coveringPairs(res, { limit: 8 })) {
    for (let k = 1; k <= 3; k++) {
      const w = P.pumpWord(res.info, pr, k);
      H.check('V akzeptiert ' + (w.length ? w.join('') : 'ε'),
        Au.simulate(V, w).accepted, 'V ist universell (Plan 5.5)');
    }
  }
}

// Reine Geometrie, deshalb ohne Browser pruefbar. Der Fall, der den Umbau
// ausgeloest hat: eine Kante zum Nachbarn derselben Ebene setzte oben am
// eigenen Kasten an und lief quer darueber hinweg.
H.group('Positionsgraph — wo eine Kante ansetzt');
{
  const PG = globalThis.PosGraph;
  const r1 = function (v) { return Math.round(v * 10) / 10; };
  const oben = { x: 0, y: 108, w: 70 };
  const links = { x: -58.2, y: 186, w: 138 };
  const rechts = { x: 77.2, y: 186, w: 92 };

  const quer = PG.edgeGeometry(rechts, links);
  H.eq('Querkante startet auf halber Hoehe', r1(quer.s.y), 186);
  H.eq('Querkante startet an der linken Kante', r1(quer.s.x), r1(77.2 - 46));
  H.eq('Querkante endet an der rechten Kante des Ziels', r1(quer.e.x), r1(-58.2 + 69 + 3));
  H.check('Querkante ist gebogen', quer.d.indexOf('Q') > 0, quer.d);
  // Nach unten, weil die geraden Kanten von oben in denselben Korridor laufen.
  H.check('Bogen der Querkante geht nach unten', quer.label.y > 186, String(quer.label.y));

  const runter = PG.edgeGeometry(oben, links);
  H.eq('Kante nach unten startet an der Unterkante', r1(runter.s.y), r1(108 + PG.BOX_H / 2));
  H.check('und faechert zum Ziel hin auf',
    runter.s.x < oben.x && runter.s.x > oben.x - oben.w / 2, String(runter.s.x));
  H.eq('Kante nach unten endet vor der Oberkante des Ziels',
    r1(runter.e.y), r1(186 - PG.BOX_H / 2 - 3));
  H.check('Kante nach unten ist gerade', runter.d.indexOf('Q') < 0, runter.d);

  const rauf = PG.edgeGeometry(rechts, oben);
  H.eq('Rueckkante startet an der Oberkante', r1(rauf.s.y), r1(186 - PG.BOX_H / 2));
  H.eq('Rueckkante endet unter dem Ziel', r1(rauf.e.y), r1(108 + PG.BOX_H / 2 + 3));
  H.check('Rueckkante ist gebogen', rauf.d.indexOf('Q') > 0, rauf.d);

  // Die Tokenzeichen bekommen im Bild eine eigene, mattere Farbe, also muessen
  // sie sich sauber vom Zustandsnamen trennen lassen.
  const teile = PG.splitTokens('q₀:■ q₁:●●');
  H.eq('Beschriftung zerfaellt in vier Stuecke', String(teile.length), '4');
  H.eq('erst der Name', teile[0].s + String(teile[0].tok), 'q₀:false');
  H.eq('dann das Tokenstueck', teile[1].s + String(teile[1].tok), '■true');
  H.eq('das letzte Stueck sind beide Punkte', teile[3].s + String(teile[3].tok), '●●true');
  H.eq('ohne Token bleibt ein Stueck', String(PG.splitTokens('(leer)').length), '1');
}

H.group('1-VA-Validierung lehnt Untaugliches ab');
const notVA = Au.parseDSL('theory reals\nstates q0\ninitial q0\naccepting q0\nq0 -> q0 : x < y');
H.eq('reelle Theorie abgelehnt', String(P.analyze(notVA).ok), 'false');
const incomplete = Au.parseDSL('theory equality\nstates q0 q1\ninitial q0\naccepting q1\nq0 -> q1 : x = y');
const iv = P.analyze(incomplete);
H.eq('unvollständig abgelehnt', String(iv.ok), 'false');
H.check('Grund genannt', iv.problems.some(function (s) { return /x ≠ y/.test(s); }), iv.problems.join('; '));

process.exit(H.report());
