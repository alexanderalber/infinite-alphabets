// langmap.js: die Sprachkarte, alle Woerter bis zu einer Laenge, eines je Kachel.
//
// Die beschraenkten Pruefungen zaehlen dieselben Woerter schon auf, behalten aber
// nur das erste Gegenbeispiel. Hier bleibt das ganze Ergebnis stehen: pro Wort
// eine Kachel, gefaerbt danach, wer es akzeptiert. Aus "A und B unterscheiden
// sich, Zeuge aab" wird ein Bild davon, *wie* sehr sie sich unterscheiden.
//
// Die Beschriftung bleibt die vorgeschriebene: das ist die Sprache bis Laenge n,
// nicht die Sprache. Wer eine Kachel sieht, sieht ein exaktes Einzelergebnis;
// wer die leere Flaeche darum sieht, sieht nichts ueber laengere Woerter.
//
// Ohne Slot B hat die Karte zwei Klassen (akzeptiert, verworfen), mit Slot B
// vier (beide, nur A, nur B, keiner).
(function (root) {
  'use strict';

  const Au = root.Automaton;

  // Obergrenzen, damit ein Klick nicht minutenlang rechnet. Das reelle Gitter
  // waechst mit der Wortlaenge exponentiell: sieben Gitterwerte und Laenge 4
  // sind schon 2801 Woerter, und jedes davon wird zweimal simuliert.
  const MAX_WORDS = 4000;
  const MAX_PER_ROW = 2048;

  function classify(A, B, opts) {
    opts = opts || {};
    const maxWords = opts.maxWords || MAX_WORDS;
    const maxPerRow = opts.maxPerRow || MAX_PER_ROW;
    if (B) Au.requireSameTheory(A, B);

    // Nach Laenge sortieren, bevor gekuerzt wird: die Aufzaehlung laeuft in
    // Tiefensuche, ein abgeschnittener Praefix davon waere eine willkuerliche
    // Auswahl. Nach Laenge sortiert sind die kurzen Zeilen vollstaendig und nur
    // die letzte ist angeschnitten.
    const all = (B ? Au.wordsForPair(A, B, opts) : Au.enumerateWords(A, opts)).slice();
    all.sort(function (u, v) { return u.length - v.length; });
    const total = all.length;
    const words = total > maxWords ? all.slice(0, maxWords) : all;

    const counts = { both: 0, a: 0, b: 0, none: 0, acc: 0, rej: 0, diff: 0 };
    const byLen = new Map();
    let shown = 0;

    for (const w of words) {
      const inA = Au.simulate(A, w).accepted;
      const inB = B ? Au.simulate(B, w).accepted : false;
      let cls;
      if (B) {
        cls = inA ? (inB ? 'both' : 'a') : (inB ? 'b' : 'none');
        counts[cls]++;
        if (cls === 'a' || cls === 'b') counts.diff++;
      } else {
        cls = inA ? 'acc' : 'rej';
        counts[cls]++;
      }
      if (!byLen.has(w.length)) byLen.set(w.length, []);
      const row = byLen.get(w.length);
      if (row.length < maxPerRow) {
        row.push({ word: w, text: Au.formatWord(A, w), cls: cls });
        shown++;
      }
    }

    const lens = Array.from(byLen.keys()).sort(function (p, q) { return p - q; });
    const rows = lens.map(function (n) {
      const cells = byLen.get(n);
      const full = words.filter(function (w) { return w.length === n; }).length;
      return { len: n, cells: cells, count: full, truncated: cells.length < full };
    });

    return {
      hasB: !!B, rows: rows, counts: counts,
      checked: words.length, total: total, shown: shown,
      truncated: words.length < total,
      maxLen: opts.maxLen
    };
  }

  root.LangMap = { classify: classify, MAX_WORDS: MAX_WORDS, MAX_PER_ROW: MAX_PER_ROW };
})(typeof globalThis !== 'undefined' ? globalThis : this);
