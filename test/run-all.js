// run-all.js — alle Testsuiten nacheinander. Mit dem Run-Button ausführbar, ohne Argumente.
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');

const suites = ['test-basics.js', 'test-engine.js', 'test-positions.js', 'test-pages.js'];
let failed = 0;

for (const s of suites) {
  console.log('\n=== ' + s + ' ===');
  const r = spawnSync(process.execPath, [path.join(__dirname, s)], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
}

console.log('\n' + (failed ? failed + ' Suite(n) fehlgeschlagen.' : 'Alle Suiten bestanden.'));
process.exit(failed ? 1 : 0);
