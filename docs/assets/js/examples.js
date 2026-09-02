// examples.js — Beispielkatalog aus beiden Papern (Plan 6).
(function (root) {
  'use strict';

  const EX = [];
  function add(id, title, source, note, dsl, tags) {
    EX.push({ id: id, title: title, source: source, note: note, dsl: dsl.trim(), tags: tags || [] });
  }

  // ---------------- CIAA ----------------

  add('A1', 'A₁ — nicht komplementierbar', 'CIAA, Fig. 1a',
    'Unsortierte Wörter: irgendwo steht ein Buchstabe, der später unterboten wird.', `
theory reals
states q0 q1 q2
initial q0
accepting q2
q0 -> q0 : true
q0 -> q1 : x = y
q1 -> q2 : x < y
q2 -> q2 : true
pos q0 0 0
pos q1 1 0
pos q2 2 0
`, ['ciaa']);

  add('A2', 'A₂ — letzter Buchstabe ist strikt der größte', 'CIAA, Fig. 2a',
    'Alle Buchstaben vor dem letzten sind kleiner als y, der letzte ist y.', `
theory reals
states q0 q1
initial q0
accepting q1
q0 -> q0 : x < y
q0 -> q1 : x = y
pos q0 0 0
pos q1 1 0
`, ['ciaa', 'atva']);

  add('A2p', "A₂' — A₂ deterministisch per Belegung", 'CIAA, Fig. 4a',
    'Vervollständigung von A₂: q₂ fängt alles ab, was größer als y ist.', `
theory reals
states q0 q1 q2
initial q0
accepting q1
q0 -> q0 : x < y
q0 -> q1 : x = y
q0 -> q2 : x > y
q1 -> q2 : true
q2 -> q2 : true
pos q0 0 0
pos q1 1 0
pos q2 1 1
`, ['ciaa']);

  add('A3', 'A₃ — alle Buchstaben in einem Intervall der Länge 1', 'CIAA, Fig. 3',
    'Ein Zustand, eine Schleife: y ≤ x ≤ y+1.', `
theory reals
states q0
initial q0
accepting q0
q0 -> q0 : y <= x <= y+1
pos q0 0 0
`, ['ciaa']);

  add('A3p', "A₃' — A₃ deterministisch per Belegung", 'CIAA, Fig. 3b',
    'A₃ mit schwachem Auffangzustand q₁.', `
theory reals
states q0 q1
initial q0
accepting q0
q0 -> q0 : y <= x <= y+1
q0 -> q1 : x < y or x > y+1
q1 -> q1 : true
pos q0 0 0
pos q1 1 0
`, ['ciaa']);

  add('C3', 'C₃ — CFPA für L(A₃)', 'CIAA, Fig. 3c',
    'y muss das Minimum des Wortes sein; p₃ erkennt das Komplement.', `
theory reals
states p0 p1 p2 p3
initial p0
accepting p0 p1
complement p3
p0 -> p0 : y < x <= y+1
p0 -> p1 : x = y
p0 -> p2 : x > y+1
p1 -> p1 : y <= x <= y+1
p1 -> p3 : x > y+1
p2 -> p2 : x > y
p2 -> p3 : x = y
p3 -> p3 : x >= y
pos p0 0 0
pos p1 2 0
pos p2 0 1
pos p3 2 1
`, ['ciaa', 'cfpa']);

  add('D', 'D — SDPA: erster und letzter Buchstabe stimmen überein', 'CIAA, Fig. 6',
    'Stark deterministisch. F_c = Q ∖ F, weil SDPA keine schwachen Zustände haben; ' +
    'q₀ gehört dazu, weil das leere Wort den leeren Lauf in q₀ vollendet.', `
theory reals
states q0 q1 q2
initial q0
accepting q1
complement q0 q2
q0 -> q1 : x = y
q1 -> q1 : x = y
q1 -> q2 : x != y
q2 -> q2 : x != y
q2 -> q1 : x = y
pos q0 0 0
pos q1 1 0
pos q2 2 0
`, ['ciaa', 'sdpa']);

  add('B', "B — Skolem-Automat für A₂'", 'CIAA, Fig. 4b',
    'Universell; akzeptiert w mit μ genau dann, wenn y der letzte Buchstabe ist (oder w leer).', `
theory reals
states r0 r1
initial r0
accepting r0
r0 -> r0 : x = y
r0 -> r1 : x != y
r1 -> r1 : x != y
r1 -> r0 : x = y
pos r0 0 0
pos r1 1 0
`, ['ciaa', 'skolem']);

  add('A2pB', "A₂' ⊗ B — synchronisiertes Produkt", 'CIAA, Fig. 5',
    'Erwartetes Ergebnis der Produktoperation nach Vereinfachung und Entfernen von (q₁,r₁).', `
theory reals
states (q0,r0) (q0,r1) (q1,r0) (q2,r0) (q2,r1)
initial (q0,r0)
accepting (q1,r0)
complement (q0,r0) (q2,r0)
(q0,r0) -> (q0,r1) : x < y
(q0,r0) -> (q1,r0) : x = y
(q0,r0) -> (q2,r1) : x > y
(q0,r1) -> (q0,r1) : x < y
(q0,r1) -> (q1,r0) : x = y
(q0,r1) -> (q2,r1) : x > y
(q1,r0) -> (q2,r1) : x != y
(q1,r0) -> (q2,r0) : x = y
(q2,r0) -> (q2,r0) : x = y
(q2,r0) -> (q2,r1) : x != y
(q2,r1) -> (q2,r1) : x != y
(q2,r1) -> (q2,r0) : x = y
pos (q0,r0) 0 0
pos (q0,r1) 0 1
pos (q1,r0) 1 0
pos (q2,r0) 2 0
pos (q2,r1) 2 1
`, ['ciaa', 'cfpa']);

  add('CFFSA2', 'Endlicher Automat als CFPA (n = 2)', 'CIAA, Fig. 7',
    'Der n-te Buchstabe von hinten ist ein b, hier n = 2, über den Konstanten a und b. ' +
    'Der minimale DFA hat 2ⁿ⁺¹ Zustände, die CFPA-Form O(n). Die beiden Nebenspuren fangen ' +
    'die Wörter ab, deren n-ter Buchstabe von hinten ein a ist, und die zu kurzen Wörter. ' +
    's₁ ist unerreichbar, s₀ übernimmt seine Rolle.', `
theory equality
states s0 q0 q1 q2 p0 p1 p2 s1 s2
initial s0
accepting q2
complement s0 p2 s1 s2
s0 -> q0 : x = a or x = b
s0 -> q1 : x = b
s0 -> p0 : x = a or x = b
s0 -> p1 : x = a
s0 -> s2 : x = a or x = b
q0 -> q0 : x = a or x = b
q0 -> q1 : x = b
q1 -> q2 : x = a or x = b
p0 -> p0 : x = a or x = b
p0 -> p1 : x = a
p1 -> p2 : x = a or x = b
s1 -> s2 : x = a or x = b
`, ['ciaa', 'fsa']);

  // ---------------- ATVA ----------------

  add('V', 'V — universelles 1-VA', 'ATVA, Ex. "position"',
    'Absichtlich universell. Paritätsargument: der erste Buchstabe führt nach q₂, danach hält ' +
    'y in q₂ und q₃, z wechselt zwischen ihnen.', `
theory equality
states q1 q2 q3
initial q1
accepting q1 q2
q1 -> q2 : x = y
q1 -> q2 : x != y
q2 -> q2 : x = y
q2 -> q3 : x != y
q3 -> q3 : x = y
q3 -> q2 : x != y
pos q1 0 0
pos q2 1 0
pos q3 2 0
`, ['atva', 'va']);

  add('VAdouble', 'Ein Buchstabe kommt doppelt vor', 'ATVA, Fig. 1',
    'Nicht universell: jedes Wort mit lauter verschiedenen Buchstaben ist ein Zeuge.', `
theory equality
states q0 q1 q2
initial q0
accepting q2
q0 -> q0 : x != y
q0 -> q1 : x = y
q1 -> q1 : x != y
q1 -> q2 : x = y
q2 -> q2 : true
pos q0 0 0
pos q1 1 0
pos q2 2 0
`, ['atva', 'va']);

  add('VAlastnew', 'Letzter Buchstabe kommt vorher nicht vor', 'ATVA, §1',
    'Registerautomaten können diese Sprache nicht. Nicht universell, Zeuge: aa oder ε.', `
theory equality
states q0 q1 q2
initial q0
accepting q1
q0 -> q0 : x != y
q0 -> q1 : x = y
q1 -> q2 : x = y
q1 -> q2 : x != y
q2 -> q2 : true
pos q0 0 0
pos q1 1 0
pos q2 2 0
`, ['atva', 'va']);

  add('EPA2', 'A₂ (EPA-Familie, n = 2)', 'ATVA, Fig. 3',
    'Potenzen eines Wortes der Länge n. Die Schranke aus dem Theorem ist n·Bₙ.', `
theory equality
states q0 q1
initial q0
accepting q0
q0 -> q1 : x = y1
q1 -> q0 : x = y2
pos q0 0 0
pos q1 1 0
`, ['atva', 'epa']);

  // Programmatische Familien.

  // EPA-Familie A_n: Zyklus q0 → q1 → … → q_{n-1} → q0 mit x = y_i.
  function epaFamily(n) {
    const lines = ['theory equality'];
    const states = [];
    for (let i = 0; i < n; i++) states.push('q' + i);
    lines.push('states ' + states.join(' '));
    lines.push('initial q0');
    lines.push('accepting q0');
    for (let i = 0; i < n; i++) {
      lines.push('q' + i + ' -> q' + ((i + 1) % n) + ' : x = y' + (i + 1));
    }
    for (let i = 0; i < n; i++) lines.push('pos q' + i + ' ' + i + ' 0');
    return lines.join('\n');
  }

  // CIAA Fig. 7 fuer beliebiges n: drei Spuren q, p, s mit je n+1 Zustaenden.
  // Sprache: der n-te Buchstabe von hinten ist ein b, also (a+b)*b(a+b)^{n-1}.
  // Der Startzustand s0 uebernimmt die Rolle der drei epsilon-Kanten der Abbildung
  // und damit auch die von s1, das dadurch unerreichbar wird und entfaellt.
  function cffsa(n) {
    const AB = 'x = a or x = b';
    const lines = ['theory equality'];
    const q = [], p = [], sTrack = [];
    for (let i = 0; i <= n; i++) { q.push('q' + i); p.push('p' + i); }
    // s-Spur: s1..sn zaehlt die Woerter mit weniger als n Buchstaben ab; s1 faellt weg.
    for (let i = 2; i <= n; i++) sTrack.push('s' + i);
    const states = ['s0'].concat(q, p, sTrack);
    lines.push('states ' + states.join(' '));
    lines.push('initial s0');
    lines.push('accepting q' + n);
    lines.push('complement ' + ['s0', 'p' + n].concat(sTrack).join(' '));

    // s0 vereinigt die Ausgaenge von q0, p0 und s1.
    lines.push('s0 -> q0 : ' + AB);
    lines.push('s0 -> q1 : x = b');
    lines.push('s0 -> p0 : ' + AB);
    lines.push('s0 -> p1 : x = a');
    if (n >= 2) lines.push('s0 -> s2 : ' + AB);

    lines.push('q0 -> q0 : ' + AB);
    lines.push('q0 -> q1 : x = b');
    for (let i = 1; i < n; i++) lines.push('q' + i + ' -> q' + (i + 1) + ' : ' + AB);

    lines.push('p0 -> p0 : ' + AB);
    lines.push('p0 -> p1 : x = a');
    for (let i = 1; i < n; i++) lines.push('p' + i + ' -> p' + (i + 1) + ' : ' + AB);

    for (let i = 2; i < n; i++) lines.push('s' + i + ' -> s' + (i + 1) + ' : ' + AB);

    lines.push('pos s0 0 1');
    for (let i = 0; i <= n; i++) { lines.push('pos q' + i + ' ' + (i + 1) + ' 0'); }
    for (let i = 0; i <= n; i++) { lines.push('pos p' + i + ' ' + (i + 1) + ' 2'); }
    for (let i = 2; i <= n; i++) lines.push('pos s' + i + ' ' + i + ' 1');
    return lines.join('\n');
  }

  function byId(id) {
    for (const e of EX) if (e.id === id) return e;
    return null;
  }

  root.Examples = {
    all: EX, byId: byId,
    epaFamily: epaFamily, cffsa: cffsa,
    // Für die Positions-Seite relevante 1-VA.
    vaIds: ['V', 'VAdouble', 'VAlastnew']
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
