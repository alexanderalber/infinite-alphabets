// test-views.js: Zahlenstrahl und Sprachkarte, beides ohne DOM.
//
// Geprueft wird nur das Rechnende: Ausschnitt, Teilstriche, Einrasten, die
// Ablesung unter einem festen y, und die Einteilung der Woerter. Das Zeichnen
// selbst pruefen die Seitentests in test-pages.js.
//
// Die beiden Kreuzproben sind die eigentlichen Testfaelle: die Sprachkarte muss
// dasselbe sagen wie checkEquivalence und checkUniversality, die schon vorher
// da waren. Wo sie auseinandergehen, ist einer von beiden falsch.
'use strict';
const H = require('./harness');
H.loadAll();

const F = globalThis.Fraction;
const Au = globalThis.Automaton;
const Ex = globalThis.Examples;
const NL = globalThis.NumberLine;
const LM = globalThis.LangMap;

function load(id) { return Au.parseDSL(Ex.byId(id).dsl); }
function run(A, wordSrc) {
  const sim = Au.simulate(A, Au.parseWord(A, wordSrc));
  sim.word = Au.parseWord(A, wordSrc);
  return sim;
}
function f(n, d) { return new F(BigInt(n), BigInt(d === undefined ? 1 : d)); }

// ---------------- Ausschnitt und Teilstriche ----------------

H.group('Zahlenstrahl: Ausschnitt');

const leer = NL.axisRange([]);
H.eq('leere Werteliste gibt ein neutrales Fenster',
  leer.lo.toString() + '..' + leer.hi.toString(), '-1..3');

const r1 = NL.axisRange([f(1), f(2)]);
H.eq('ein Viertel Rand links', r1.lo.toString(), '3/4');
H.eq('ein Viertel Rand rechts', r1.hi.toString(), '9/4');

const r2 = NL.axisRange([f(5), f(5)]);
H.eq('ein einziger Wert bekommt Platz nach beiden Seiten', r2.lo.toString() + '..' + r2.hi.toString(), '4..6');

H.eq('Teilstrichabstand bei Spanne 3/2', NL.tickStep(f(3, 2)).toString(), '1/2');
H.eq('Teilstrichabstand bei Spanne 100', NL.tickStep(f(100)).toString(), '20');
H.eq('Teilstriche im Ausschnitt', NL.ticks(f(3, 4), f(9, 4), f(1, 2)).map(String).join(' '), '1 3/2 2');

H.group('Zahlenstrahl: Marke');

H.eq('Pixelmitte trifft die Mitte des Ausschnitts',
  NL.valueAt(0.5, f(0), f(4), f(1, 2)).toString(), '2');
H.eq('dazwischen wird auf das Raster gerundet',
  NL.valueAt(0.3, f(0), f(4), f(1, 2)).toString(), '1');
// Die Mitte des Ausschnitts ist hier 5/4 und liegt nicht auf dem Raster: das
// Raster zaehlt von 0 aus, nicht vom linken Rand.
H.eq('das Raster liegt absolut, nicht relativ zum Ausschnitt',
  NL.valueAt(0.5, f(1, 4), f(9, 4), f(1, 2)).toString(), '3/2');
H.eq('links vom Rand wird geklemmt', NL.valueAt(-0.3, f(0), f(4), f(1, 2)).toString(), '0');
H.eq('rechts vom Rand wird geklemmt', NL.valueAt(1.7, f(0), f(4), f(1, 2)).toString(), '4');
H.eq('ein Raster ueber den Rand rueckt einwaerts',
  NL.valueAt(1, f(0), f(9, 4), f(1, 2)).toString(), '2');
// Der Fall aus dem Test von Hand: beim Wort 1, 1/2, 8/5 liessen sich 1/2 und 1
// anklicken, 8/5 nie. Beide ersten liegen auf dem Raster von einem Achtel
// Teilstrichabstand, 8/5 liegt zwischen zwei Rasterpunkten und war von beiden
// weiter weg als die Fangweite. Es wird deshalb zuerst gefangen und erst dann
// gerastert, und gefangen wird in Pixeln.
H.group('Zahlenstrahl: Klick trifft jeden Buchstaben');
const wort = [f(1), f(1, 2), f(8, 5)];
const mKlick = NL.model(
  Au.parseDSL(['theory reals', 'states q0', 'initial q0', 'accepting q0', 'q0 -> q0 : true'].join('\n')),
  { word: wort, acceptSet: [], complementSet: [] });
for (const v of wort) {
  H.eq('Klick auf ' + v + ' trifft ' + v,
    NL.pickValue(mKlick, NL.xOf(mKlick, v)).toString(), v.toString());
}
H.check('auch ein paar Pixel daneben faengt noch',
  NL.pickValue(mKlick, NL.xOf(mKlick, f(8, 5)) + 4).eq(f(8, 5)));
H.check('weit daneben faengt nicht mehr',
  !NL.pickValue(mKlick, NL.xOf(mKlick, f(8, 5)) + 30).eq(f(8, 5)));
H.check('und liefert dort einen Rasterwert',
  (function () {
    const v = NL.pickValue(mKlick, NL.xOf(mKlick, f(8, 5)) + 30);
    return v.div(mKlick.step.mul(f(1, 8))).den === 1n;
  })());

// ---------------- Ablesung unter festem y ----------------
//
// A₂ akzeptiert genau die Woerter, deren letzter Buchstabe y ist und deren
// uebrige Buchstaben kleiner sind. Zum Wort 1, 2 bleibt also genau y = 2.

H.group('Zahlenstrahl: A₂ auf dem Wort 1, 2');
const A2 = load('A2');
const sim2 = run(A2, '1, 2');

H.eq('Akzeptanzmenge', sim2.theory.format(sim2.acceptSet), 'y = 2');
H.check('unter y = 2 akzeptiert', NL.acceptedAt(sim2, f(2)));
H.check('unter y = 3 nicht akzeptiert', !NL.acceptedAt(sim2, f(3)));
H.eq('unter y = 2 steht das Wort in q1', NL.statesAt(sim2, 2, f(2)).join(','), 'q1');
H.eq('unter y = 3 laeuft es in q0 weiter', NL.statesAt(sim2, 2, f(3)).join(','), 'q0');
H.eq('vor dem ersten Schritt steht ueberall q0', NL.statesAt(sim2, 0, f(3, 2)).join(','), 'q0');
H.eq('unter y = 3/2 bleibt nichts uebrig', NL.statesAt(sim2, 2, f(3, 2)).join(','), '');

const fired = NL.firing(A2, sim2, 2, f(2));
H.eq('unter y = 2 feuert genau eine Transition im zweiten Schritt', String(fired.length), '1');
H.eq('und zwar die nach q1', fired.length ? fired[0].from + '->' + fired[0].to : '', 'q0->q1');
H.eq('unter y = 3 feuert die Schleife', NL.firing(A2, sim2, 2, f(3))
  .map(function (t) { return t.from + '->' + t.to; }).join(','), 'q0->q0');

H.eq('zwei Buchstaben, zwei Punkte', String(NL.lettersOf(sim2.word).length), '2');
const doppelt = NL.lettersOf([f(1), f(2), f(1)]);
H.eq('derselbe Buchstabe ist ein Punkt mit zwei Indizes',
  doppelt.map(function (l) { return l.value + ':' + l.indices.join('+'); }).join(' '), '1:1+3 2:2');

// Offene Grenze: hier haengt das Verdikt genau am Endpunkt.
H.group('Zahlenstrahl: offene Grenze');
const Aoffen = Au.parseDSL([
  'theory reals', 'states q0 q1', 'initial q0', 'accepting q1', 'q0 -> q1 : x < y'
].join('\n'));
const simOffen = run(Aoffen, '1');
H.eq('Akzeptanzmenge ist offen', simOffen.theory.format(simOffen.acceptSet), 'y > 1');
H.check('der Endpunkt selbst akzeptiert nicht', !NL.acceptedAt(simOffen, f(1)));
H.check('knapp darueber akzeptiert', NL.acceptedAt(simOffen, f(11, 10)));
H.eq('unendliche Enden liefern keinen Endpunkt',
  NL.endpointsOf(simOffen.acceptSet).map(String).join(','), '1');
H.check('die festgehaltene Marke bleibt im Bild', (function () {
  const m = NL.model(Aoffen, simOffen, [f(40)]);
  return m.hi.ge(f(40));
})());

// ---------------- Sprachkarte ----------------

H.group('Sprachkarte: Einteilung');
const A1 = load('A1'), A3 = load('A3'), A2p = load('A2p');

const solo = LM.classify(A3, null, { maxLen: 2 });
H.check('ohne Slot B nur zwei Klassen', solo.counts.acc + solo.counts.rej === solo.checked);
H.eq('die Zeilen sind nach Laenge sortiert',
  solo.rows.map(function (r) { return r.len; }).join(','), '0,1,2');
H.eq('das leere Wort ist die erste Zeile', String(solo.rows[0].cells.length), '1');
H.eq('und heisst epsilon', solo.rows[0].cells[0].text, 'ε');
H.check('jede Kachel traegt eine Klasse',
  solo.rows.every(function (r) { return r.cells.every(function (c) { return c.cls === 'acc' || c.cls === 'rej'; }); }));

const selbst = LM.classify(A3, A3, { maxLen: 2 });
H.eq('ein Automat gegen sich selbst unterscheidet sich nirgends', String(selbst.counts.diff), '0');
H.eq('und alles faellt in beide oder keinen',
  String(selbst.counts.both + selbst.counts.none), String(selbst.checked));

// Kreuzprobe gegen checkEquivalence: A₂ und A₂' beschreiben dieselbe Sprache
// (A₂' ist die Vervollstaendigung), A₁ und A₃ nicht.
H.group('Sprachkarte gegen checkEquivalence');
function agree(id1, id2, maxLen) {
  const X = load(id1), Y = load(id2);
  const o = { maxLen: maxLen };
  const eq = Au.checkEquivalence(X, Y, o).equivalent;
  const map = LM.classify(X, Y, o);
  return (eq && map.counts.diff === 0) || (!eq && map.counts.diff > 0);
}
H.check('A₂ gegen A₂′', agree('A2', 'A2p', 3));
H.check('A₁ gegen A₃', agree('A1', 'A3', 3));
H.check('A₃ gegen C₃', agree('A3', 'C3', 3));

const paar = LM.classify(load('A2'), A2p, { maxLen: 3 });
H.eq('gleiche Sprache heisst: keine Kachel nur fuer einen',
  paar.counts.a + '/' + paar.counts.b, '0/0');

// Kreuzprobe gegen checkUniversality: V ist universell, VAdouble nicht.
H.group('Sprachkarte gegen checkUniversality');
const V = load('V'), VD = load('VAdouble');
const mapV = LM.classify(V, null, { maxLen: 4 });
H.check('V akzeptiert jedes geprüfte Wort', mapV.counts.rej === 0);
H.check('und checkUniversality sagt dasselbe', Au.checkUniversality(V, { maxLen: 4 }).universal);
const mapVD = LM.classify(VD, null, { maxLen: 4 });
H.check('VAdouble verwirft welche', mapVD.counts.rej > 0);
H.check('und checkUniversality findet einen Zeugen',
  !Au.checkUniversality(VD, { maxLen: 4 }).universal);

H.group('Sprachkarte: Grenzen');
const klein = LM.classify(A3, null, { maxLen: 3, maxWords: 10 });
H.check('zu viele Woerter werden gemeldet', klein.truncated);
H.eq('und genau bis zur Grenze gerechnet', String(klein.checked), '10');
H.check('die kurzen Zeilen bleiben vollstaendig', klein.rows[0].cells.length === 1 && !klein.rows[0].truncated);
H.check('gekuerzte Zeilen sind als solche markiert',
  LM.classify(A3, null, { maxLen: 2, maxPerRow: 3 }).rows.some(function (r) { return r.truncated; }));

let mixed = '';
try { LM.classify(load('A2'), V, { maxLen: 1 }); }
catch (e) { mixed = e.message; }
H.check('verschiedene Theorien werden abgelehnt', /Theorien|theories/.test(mixed), mixed);

process.exit(H.report());
