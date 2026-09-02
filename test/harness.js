// harness.js — winziger Test-Runner ohne Abhängigkeiten.
// Lädt die docs/assets/js-Dateien als klassische Skripte in den globalen Namensraum.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS_DIR = path.join(__dirname, '..', 'docs', 'assets', 'js');

// Reihenfolge wie in den HTML-Seiten.
const FILES = [
  'fraction.js', 'intervals.js', 'formula.js', 'theory-eq.js', 'theory-real.js',
  'automaton.js', 'examples.js', 'positions-core.js', 'tikz.js'
];

function loadAll() {
  for (const f of FILES) {
    const p = path.join(JS_DIR, f);
    if (!fs.existsSync(p)) continue;
    const code = fs.readFileSync(p, 'utf8');
    vm.runInThisContext(code, { filename: p });
  }
}

let passed = 0;
const failures = [];
let currentGroup = '';

function group(name) { currentGroup = name; }

function check(name, cond, detail) {
  if (cond) { passed++; return true; }
  failures.push({ group: currentGroup, name: name, detail: detail === undefined ? '' : String(detail) });
  return false;
}

function eq(name, actual, expected) {
  const a = String(actual), e = String(expected);
  return check(name, a === e, 'erwartet: ' + e + '\n        tatsächlich: ' + a);
}

function report() {
  const total = passed + failures.length;
  if (failures.length === 0) {
    console.log('\n' + passed + '/' + total + ' Tests bestanden.');
    return 0;
  }
  console.log('\nFehlgeschlagen (' + failures.length + ' von ' + total + '):');
  for (const f of failures) {
    console.log('  [' + f.group + '] ' + f.name);
    if (f.detail) console.log('        ' + f.detail.replace(/\n/g, '\n        '));
  }
  return 1;
}

module.exports = { loadAll, group, check, eq, report, get passed() { return passed; }, failures };
