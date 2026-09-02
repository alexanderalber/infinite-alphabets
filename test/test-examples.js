// test-examples.js — jedes Beispiel des Katalogs parst, simuliert und verhaelt sich
// wie im Paper beschrieben. Deckt auch die programmatischen Familien ab.
'use strict';
const H = require('./harness');
H.loadAll();

const Au = globalThis.Automaton;
const Ex = globalThis.Examples;
const P = globalThis.Positions;

H.group('Katalog: alles parst und laesst sich zeichnen');
for (const e of Ex.all) {
  let A = null;
  try { A = Au.parseDSL(e.dsl); }
  catch (err) { H.check(e.id + ' parst', false, (err.line ? 'Zeile ' + err.line + ': ' : '') + err.message); continue; }
  H.check(e.id + ' parst', true);
  // Roundtrip: erzeugte DSL parst wieder zum selben Automaten.
  let B = null;
  try { B = Au.parseDSL(Au.toDSL(A)); }
  catch (err) { H.check(e.id + ' Roundtrip', false, err.message); continue; }
  H.eq(e.id + ' Roundtrip: Zustaende', B.states.join(','), A.states.join(','));
  H.eq(e.id + ' Roundtrip: Transitionen', String(B.transitions.length), String(A.transitions.length));
  // accepting und complement sind disjunkt (parseDSL erzwingt das, hier als Sicherung)
  const acc = new Set(A.accepting);
  H.check(e.id + ': F und F_c disjunkt', !A.complement.some(function (s) { return acc.has(s); }));
  // Leerheit terminiert
  let empt;
  try { empt = Au.emptinessCheck(A); H.check(e.id + ': Leerheit terminiert', true); }
  catch (err) { H.check(e.id + ': Leerheit terminiert', false, err.message); }
  if (empt && !empt.empty && empt.witness) {
    H.check(e.id + ': Leerheits-Zeuge wird akzeptiert',
      Au.simulate(A, empt.witness.word).accepted,
      empt.witness.wordText + ' mit ' + empt.witness.mu);
  }
}

H.group('A₁ ist nicht komplementierbar, aber nichtleer');
const A1 = Au.parseDSL(Ex.byId('A1').dsl);
H.eq('nichtleer', String(Au.emptinessCheck(A1).empty), 'false');
H.eq('1,3,2 akzeptiert', String(Au.simulate(A1, Au.parseWord(A1, '1,3,2')).accepted), 'true');
H.eq('3,2,1 akzeptiert (unsortiert)', String(Au.simulate(A1, Au.parseWord(A1, '3,2,1')).accepted), 'true');
H.eq('1,2,3 nicht akzeptiert (sortiert)', String(Au.simulate(A1, Au.parseWord(A1, '1,2,3')).accepted), 'false');

H.group("A₃' verhaelt sich wie A₃");
const A3 = Au.parseDSL(Ex.byId('A3').dsl);
const A3p = Au.parseDSL(Ex.byId('A3p').dsl);
const gridOpts = { maxLen: 4, grid: ['0', '1/2', '1', '3/2', '2', '5/2', '3'] };
H.eq('aequivalent', String(Au.checkEquivalence(A3, A3p, gridOpts).equivalent), 'true');
const dA3p = Au.determinismCheck(A3p);
H.eq("A₃' deterministisch per Belegung", String(dA3p.disjoint && dA3p.complete), 'true');

H.group('A₂pB als Beispiel geladen verhaelt sich wie das Produkt');
const A2p = Au.parseDSL(Ex.byId('A2p').dsl);
const Bsk = Au.parseDSL(Ex.byId('B').dsl);
const prodEx = Au.parseDSL(Ex.byId('A2pB').dsl);
const prodComputed = Au.removeUnreachable(Au.simplifyLabels(Au.synchronizedProduct(A2p, Bsk)));
H.eq('Beispiel = berechnetes Produkt (akzeptierte Woerter)',
  String(Au.checkEquivalence(prodEx, prodComputed, gridOpts).equivalent), 'true');
H.eq('Produkt akzeptiert dieselben Woerter wie A₂',
  String(Au.checkEquivalence(prodEx, Au.parseDSL(Ex.byId('A2').dsl), gridOpts).equivalent), 'true');
// CIAA Thm.: das Produkt ist eine CFPA fuer L(A₂'), also XOR-konsistent.
const consProd = Au.checkCFPAConsistency(prodEx, gridOpts);
H.eq('Produkt ist XOR-konsistent auf Gitterwoertern', String(consProd.ok), 'true');

H.group('CFFSA: der n-te Buchstabe von hinten ist ein b');
// Sprachdefinition aus der Bildunterschrift von CIAA Fig. 7.
function inLanguage(word, n) {
  if (word.length < n) return false;
  return word[word.length - n] === 'b';
}
for (const n of [1, 2, 3]) {
  const A = Au.parseDSL(Ex.cffsa(n));
  // 3(n+1) Zustaende laut Paper, minus das unerreichbare s1, das s0 ersetzt.
  H.check('cffsa(' + n + ') hat 3(n+1) − 1 Zustaende', A.states.length === 3 * (n + 1) - 1,
    A.states.length + ' Zustaende: ' + A.states.join(' '));
  let bad = 0, badWord = '';
  for (const w of Au.enumerateEqualityWords(['a', 'b'], n + 3)) {
    // Nur Woerter ueber {a,b}: andere Buchstaben hat die Sprache nicht.
    if (w.some(function (c) { return c !== 'a' && c !== 'b'; })) continue;
    const acc = Au.simulate(A, w).accepted;
    if (acc !== inLanguage(w, n)) { bad++; if (!badWord) badWord = w.join('') || 'ε'; }
  }
  H.eq('cffsa(' + n + '): n-ter Buchstabe von hinten ist b', String(bad), '0');
  if (bad) H.check('erstes Gegenbeispiel', false, badWord);
}
// Das eingebaute Beispiel fuer n = 2 stimmt mit der Familie ueberein.
H.eq('Beispiel CFFSA2 = cffsa(2)',
  String(Au.checkEquivalence(Au.parseDSL(Ex.byId('CFFSA2').dsl), Au.parseDSL(Ex.cffsa(2)), { maxLen: 5 }).equivalent),
  'true');

H.group('EPA-Familie: Potenzen eines Wortes der Laenge n');
for (const n of [1, 2, 3, 4]) {
  const A = Au.parseDSL(Ex.epaFamily(n));
  H.eq('A_' + n + ' hat n Zustaende', String(A.states.length), String(n));
  H.eq('A_' + n + ' hat n Parameter', String(A.params.length), String(n));
  let bad = 0, badWord = '';
  for (const w of Au.enumerateEqualityWords([], 6)) {
    const acc = Au.simulate(A, w).accepted;
    // w ∈ L(A_n) ⇔ |w| ist ein Vielfaches von n und w ist die Potenz seines Praefixes
    // der Laenge n.
    let want = (w.length % n === 0);
    if (want) {
      for (let i = n; i < w.length && want; i++) if (w[i] !== w[i - n]) want = false;
    }
    if (acc !== want) { bad++; if (!badWord) badWord = (w.join('') || 'ε'); }
  }
  H.eq('A_' + n + ' erkennt Potenzen', String(bad), '0');
  if (bad) H.check('erstes Gegenbeispiel A_' + n, false, badWord);
}
// Das eingebaute Beispiel EPA2 stimmt mit epaFamily(2) ueberein.
H.eq('EPA2 = epaFamily(2)',
  String(Au.checkEquivalence(Au.parseDSL(Ex.byId('EPA2').dsl), Au.parseDSL(Ex.epaFamily(2)), { maxLen: 5 }).equivalent),
  'true');

H.group('1-VA-Beispiele: Sprache stimmt mit der Beschreibung');
const dbl = Au.parseDSL(Ex.byId('VAdouble').dsl);
let bad = 0;
for (const w of Au.enumerateEqualityWords([], 6)) {
  const acc = Au.simulate(dbl, w).accepted;
  const want = new Set(w).size < w.length; // ein Buchstabe kommt doppelt vor
  if (acc !== want) bad++;
}
H.eq('doppelter Buchstabe', String(bad), '0');

const lastnew = Au.parseDSL(Ex.byId('VAlastnew').dsl);
bad = 0;
for (const w of Au.enumerateEqualityWords([], 6)) {
  const acc = Au.simulate(lastnew, w).accepted;
  // "Letzter Buchstabe kommt vorher nicht vor", das leere Wort nicht.
  const want = w.length > 0 && w.slice(0, -1).indexOf(w[w.length - 1]) < 0;
  if (acc !== want) bad++;
}
H.eq('letzter Buchstabe neu', String(bad), '0');

H.group('V ist universell (Paritaetsargument)');
const V = Au.parseDSL(Ex.byId('V').dsl);
bad = 0;
for (const w of Au.enumerateEqualityWords([], 7)) {
  if (!Au.simulate(V, w).accepted) bad++;
}
H.eq('V akzeptiert alle Woerter bis Laenge 7', String(bad), '0');
// Und ueber die Positionen, was der schnellere Weg ist.
H.eq('V: Erkundung bis Tiefe 10 ohne Gegenbeispiel',
  String(P.explore(V, { maxDepth: 10, maxNodes: 5000 }).universalSoFar), 'true');

H.group('D ist ein SDPA und erkennt erster = letzter Buchstabe');
const D = Au.parseDSL(Ex.byId('D').dsl);
bad = 0;
for (const w of Au.enumerateRealWords(['0', '1', '2'], 4)) {
  const acc = Au.simulate(D, w).accepted;
  const want = w.length > 0 && w[0].eq(w[w.length - 1]);
  if (acc !== want) bad++;
}
H.eq('Sprache stimmt', String(bad), '0');
// SDPA sind CFPA ohne schwache Zustaende: XOR-Konsistenz muss gelten.
H.eq('XOR-konsistent', String(Au.checkCFPAConsistency(D, { maxLen: 4, grid: ['0', '1', '2'] }).ok), 'true');
H.eq('leeres Wort: komplement-akzeptiert via q0',
  String(Au.simulate(D, []).complementAccepted), 'true');

process.exit(H.report());
