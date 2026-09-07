// test-tikz-latex.js — der tikz-Export wird wirklich uebersetzt, nicht nur nach
// Textmustern abgeklopft. Die Menge der Bilder, die die Seiten erzeugen koennen,
// ist endlich und klein, also wird sie hier systematisch abgefahren: jedes
// Beispiel des Katalogs, beide Familien ueber den ganzen Schieberegler, jede
// Operation des Playgrounds auf jedem davon (unaer auf allen, binaer auf allen
// Paaren des Katalogs) und der Positionsgraph jedes 1-VA in jeder Tiefe.
//
// Nur eine echte Uebersetzung findet die Fehlerklasse, um die es geht: Quelltext,
// der gueltig aussieht, den LaTeX aber teilweise verwirft, sodass im Bild etwas
// fehlt. Zwei Faelle sind so aufgefallen, ein Stilname, der einen eingebauten
// tikz-Schluessel ueberdeckt, und ein zweistelliger Index als doppeltes Subskript.
//
// Ohne pdflatex im Pfad ueberspringt sich die Suite, wie die Seitentests ohne Chrome.
'use strict';
const H = require('./harness');
H.loadAll();

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const Au = globalThis.Automaton;
const Ex = globalThis.Examples;
const P = globalThis.Positions;
const PG = globalThis.PosGraph;
const Tz = globalThis.Tikz;

// Der Schieberegler der Familien laeuft in playground.html von 1 bis 5.
const FAM_MAX = 5;
// Tiefen, die die Positionsseite im Feld anbietet; 6 ist die Voreinstellung.
const POS_DEPTH_MAX = 6;
// Groessere Bilder entstehen nur aus Produkten von Produkten und waeren als
// Abbildung ohnehin unbrauchbar; sie kosten nur Uebersetzungszeit.
const MAX_STATES = 80;

function hasPdflatex() {
  const r = spawnSync('pdflatex', ['--version'], { encoding: 'utf8', shell: true });
  return !r.error && r.status === 0;
}

if (!hasPdflatex()) {
  console.log('Kein pdflatex gefunden, LaTeX-Tests uebersprungen.');
  process.exit(0);
}

// ---------- Korpus aufbauen ----------

H.group('TikZ nach LaTeX: Korpus entsteht');

const catalog = [];
for (const e of Ex.all) {
  try { catalog.push([e.id, Au.parseDSL(e.dsl)]); H.check(e.id + ': parst', true); }
  catch (err) { H.check(e.id + ': parst', false, err.message); }
}
const families = [];
for (let n = 1; n <= FAM_MAX; n++) {
  try { families.push(['EPA(' + n + ')', Au.parseDSL(Ex.epaFamily(n))]); H.check('epaFamily(' + n + ') parst', true); }
  catch (err) { H.check('epaFamily(' + n + ') parst', false, err.message); }
  try { families.push(['CFFSA(' + n + ')', Au.parseDSL(Ex.cffsa(n))]); H.check('cffsa(' + n + ') parst', true); }
  catch (err) { H.check('cffsa(' + n + ') parst', false, err.message); }
}
const base = catalog.concat(families);

const parts = [];
let skipped = 0;

// Die Praeambel des Testdokuments wird nicht hier festgelegt, sondern aus den
// Exporten gelesen: jeder Export nennt als Kommentar, was er braucht. Damit
// prueft der Lauf genau die Angabe, die der Nutzer beim Einfuegen befolgt.
// Faellt dort eine Bibliothek weg, kennt tikz die Schluessel nicht mehr und die
// Uebersetzung meldet es, statt still ein unvollstaendiges Bild zu liefern.
const pkgs = new Set();
const libs = new Set();

function collectPreamble(title, tex) {
  const p = tex.match(/^%\s+\\usepackage\{([^}]*)\}$/gm) || [];
  const l = tex.match(/^%\s+\\usetikzlibrary\{([^}]*)\}$/gm) || [];
  for (const m of p) pkgs.add(m.replace(/.*\{|\}.*/g, ''));
  for (const m of l) for (const one of m.replace(/.*\{|\}.*/g, '').split(',')) libs.add(one.trim());
  return p.length > 0;
}

function addAutomaton(title, A) {
  if (A.states.length > MAX_STATES) { skipped++; return; }
  let tex;
  try { tex = Tz.exportTikz(A, { title: title }); }
  catch (err) { H.check(title + ': exportiert', false, err.message); return; }
  collectPreamble(title, tex);
  parts.push('\\section*{' + title.replace(/[_&%#]/g, '\\$&') + '}\n' + tex);
}

for (const [id, A] of base) addAutomaton(id, A);

// Die Operationen des Playgrounds, in derselben Reihenfolge wie die Knoepfe.
const UNARY = [
  ['complement', Au.complementCFPA],
  ['sink', Au.addSink],
  ['fc', function (A) { const R = Au.cloneAutomaton(A); R.complement = Au.largestFc(A); return R; }],
  ['simplify', Au.simplifyLabels],
  ['prune', Au.removeUnreachable]
];
for (const [id, A] of base) {
  for (const [name, fn] of UNARY) {
    let R;
    // Nicht jede Operation ist auf jedem Automaten definiert; das ist kein Fehler
    // des Exports, sondern eine Meldung, die der Playground selbst anzeigt.
    try { R = fn(A); } catch (err) { continue; }
    addAutomaton(id + ' ' + name, R);
  }
}

const BINARY = [
  ['sync', function (A, B) { return Au.removeUnreachable(Au.simplifyLabels(Au.synchronizedProduct(A, B))); }],
  ['inter', Au.intersectionProduct],
  ['union', Au.unionProduct]
];
for (const [ia, A] of catalog) {
  for (const [ib, B] of catalog) {
    for (const [name, fn] of BINARY) {
      let R;
      try { R = fn(A, B); } catch (err) { continue; }
      addAutomaton(ia + ' ' + name + ' ' + ib, R);
    }
  }
}

let posCount = 0;
for (const [id, A] of base) {
  for (let d = 1; d <= POS_DEPTH_MAX; d++) {
    let res;
    try { res = P.explore(A, { maxDepth: d, maxNodes: 200 }); } catch (err) { continue; }
    if (!res || !res.ok) continue;   // kein 1-VA, die Seite zeigt hier eine Begruendung
    let tex;
    try { tex = Tz.exportPositionGraph(res, PG.layout(res), { title: id }); }
    catch (err) { H.check(id + ' Tiefe ' + d + ': Positionsgraph exportiert', false, err.message); continue; }
    if (posCount === 0) {
      H.check('Positionsgraph nennt seine Praeambel', collectPreamble(id, tex), tex.slice(0, 200));
    } else {
      collectPreamble(id, tex);
    }
    parts.push('\\section*{' + id.replace(/[_&%#]/g, '\\$&') + ', Positionen, Tiefe ' + d + '}\n' + tex);
    posCount++;
  }
}

H.check('Positionsgraphen im Korpus', posCount >= 3 * POS_DEPTH_MAX, String(posCount));
H.check('Korpus hat die erwartete Groessenordnung', parts.length > 300, String(parts.length));
console.log('   ' + parts.length + ' Bilder (' + posCount + ' Positionsgraphen, ' +
  skipped + ' wegen Groesse ausgelassen)');

// ---------- Uebersetzen ----------

// Die Automaten nennen automata und arrows, der Positionsgraph amssymb. Nichts
// davon wird hier ergaenzt: was nicht im Export steht, fehlt auch im Testlauf.
H.check('Automatenexport nennt die automata-Bibliothek', libs.has('automata'), Array.from(libs).join(','));
H.check('Positionsexport nennt amssymb', pkgs.has('amssymb'), Array.from(pkgs).join(','));

const doc = [
  '\\documentclass{article}',
  '\\usepackage[a1paper,margin=1cm]{geometry}'
].concat(
  Array.from(pkgs).map(function (p) { return '\\usepackage{' + p + '}'; }),
  libs.size ? ['\\usetikzlibrary{' + Array.from(libs).join(',') + '}'] : [],
  ['\\begin{document}', parts.join('\n\n\\bigskip\n\n'), '\\end{document}']
).join('\n');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ia-tikz-'));
const src = path.join(dir, 'all.tex');
fs.writeFileSync(src, doc, 'utf8');

H.group('TikZ nach LaTeX: Uebersetzung');
const r = spawnSync('pdflatex', ['-interaction=nonstopmode', 'all.tex'],
  { cwd: dir, encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024 });
const log = (r.stdout || '') + (r.stderr || '');

// Jede Zeile, die mit "! " beginnt, ist ein TeX-Fehler. pgfkeys meldet einen
// falsch benutzten Schluessel genau so und zeichnet den Knoten trotzdem, nur ohne
// Rahmen: deshalb ist das hier die entscheidende Pruefung, nicht der Exitcode.
const errs = log.split(/\r?\n/).filter(function (l) { return /^! /.test(l); });
H.check('LaTeX uebersetzt den ganzen Korpus fehlerfrei', errs.length === 0,
  errs.length + ' Fehler:\n' + errs.slice(0, 6).join('\n') + '\n(Quelle bleibt liegen: ' + src + ')');
const pdf = path.join(dir, 'all.pdf');
H.check('PDF ist entstanden', fs.existsSync(pdf), 'in ' + dir);

// Ueberlappende Knoten meldet pgf als "node center instead of a point on node
// border". Das ist eine Layout-, keine Exportfrage, und tritt heute nur bei
// Produktautomaten auf, deren Auto-Layout zwei Zustaende aufeinanderlegt. Hier
// steht nur die Zahl, damit ein Sprung nach oben auffaellt.
const centers = (log.match(/Returning node center/g) || []).length;
console.log('   pgf-Warnungen zu ueberlappenden Knoten: ' + centers);

if (errs.length === 0 && fs.existsSync(pdf)) fs.rmSync(dir, { recursive: true, force: true });

process.exit(H.report());
