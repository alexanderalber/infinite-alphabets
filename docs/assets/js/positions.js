// positions.js — UI der Positions-Seite: Token-Animation und Erkundung.
(function () {
  'use strict';

  const Au = window.Automaton;
  const Ex = window.Examples;
  const P = window.Positions;
  const D = window.Draw;
  const Fo = window.Formula;

  const $ = function (id) { return document.getElementById(id); };

  const state = {
    A: null, info: null, mats: null,
    word: [],          // bisher gelesene Buchstaben
    lastApplied: ''    // Text der zuletzt angewandten Abbildung
  };

  // ---------- Beispiele ----------

  const sel = $('ex');
  for (const id of Ex.vaIds) {
    const e = Ex.byId(id);
    sel.appendChild(new Option(e.title + '  [' + e.source + ']', e.id));
  }
  sel.addEventListener('change', function () {
    const e = Ex.byId(this.value);
    if (e) { $('dsl').value = e.dsl; reload(); }
  });
  $('dsl').addEventListener('input', function () { sel.value = ''; reload(); });

  // ---------- Laden und Validieren ----------

  function reload() {
    const errEl = $('err'), badgeEl = $('badges');
    errEl.textContent = '';
    badgeEl.innerHTML = '';
    state.A = null; state.info = null; state.mats = null;
    state.word = []; state.lastApplied = '';
    let A;
    try { A = Au.parseDSL($('dsl').value); }
    catch (e) { errEl.textContent = (e.line ? 'Zeile ' + e.line + ': ' : '') + e.message; renderAll(); return; }
    const info = P.analyze(A);
    badgeEl.appendChild(badge(A.states.length + ' Zustände'));
    if (!info.ok) {
      badgeEl.appendChild(badge('kein 1-VA', 'err'));
      errEl.textContent = info.problems.join('\n');
      renderAll();
      return;
    }
    badgeEl.appendChild(badge('gültiges 1-VA', 'ok'));
    badgeEl.appendChild(badge('akzeptierend: ' + (A.accepting.map(Au.displayState).join(', ') || 'keine')));
    state.A = A;
    state.info = info;
    state.mats = P.matrices(info);
    renderMatrices();
    renderAll();
  }

  function badge(text, cls) {
    const s = document.createElement('span');
    s.className = 'badge' + (cls ? ' ' + cls : '');
    s.textContent = text;
    return s;
  }

  // ---------- Tokens und Graph ----------

  // Für jeden Zustand: welche Buchstaben liegen dort, und liegt das eckige Token dort.
  function tokensOf() {
    const info = state.info;
    const map = new Map();
    if (!info) return map;
    const letters = [];
    for (const a of state.word) if (letters.indexOf(a) < 0) letters.push(a);
    for (const a of letters) {
      const s = tokenState(state.word, a);
      const q = info.states[s];
      if (!map.has(q)) map.set(q, { round: [], square: false });
      map.get(q).round.push(a);
    }
    let s = info.initial;
    for (let k = 0; k < state.word.length; k++) s = info.Z[s];
    const q = info.states[s];
    if (!map.has(q)) map.set(q, { round: [], square: false });
    map.get(q).square = true;
    return map;
  }

  function tokenState(word, a) {
    let s = state.info.initial;
    for (const b of word) s = (b === a) ? state.info.Y[s] : state.info.Z[s];
    return s;
  }

  function renderGraph() {
    const svg = $('graph');
    if (!state.A) { while (svg.firstChild) svg.removeChild(svg.firstChild); return; }
    D.render(svg, state.A, { tokens: tokensOf() });
  }

  // ---------- Buchstabenknöpfe ----------

  function renderButtons() {
    const box = $('letterButtons');
    box.innerHTML = '';
    if (!state.info) return;
    const letters = [];
    for (const a of state.word) if (letters.indexOf(a) < 0) letters.push(a);
    // Buchstaben nach dem Zustand ihres Tokens gruppieren: gleicher Zustand, gleicher Nachfolger.
    for (const a of letters) {
      const s = tokenState(state.word, a);
      const b = document.createElement('button');
      b.textContent = a;
      b.title = 'Token sitzt in ' + Au.displayState(state.info.states[s]) + ' — wendet π' + Fo.sub(s + 1) + ' an';
      b.addEventListener('click', function () { append(a); });
      box.appendChild(b);
    }
    const nb = document.createElement('button');
    nb.className = 'primary';
    const fresh = P.nextFreshLetter(state.word);
    nb.textContent = 'neuer Buchstabe (' + fresh + ')';
    nb.title = 'wendet π₀ an';
    nb.addEventListener('click', function () { append(fresh); });
    box.appendChild(nb);
  }

  function append(a) {
    const known = state.word.indexOf(a) >= 0;
    if (known) {
      const s = tokenState(state.word, a);
      state.lastApplied = 'π' + Fo.sub(s + 1) + '(p) = M·p + v' + sup(s + 1);
    } else {
      state.lastApplied = 'π₀(p) = (M + B)·p';
    }
    state.word.push(a);
    renderAll();
  }

  const SUP = { '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '0': '⁰' };
  function sup(n) { return String(n).split('').map(function (c) { return SUP[c] || c; }).join(''); }

  $('undo').addEventListener('click', function () {
    if (!state.word.length) return;
    state.word.pop();
    state.lastApplied = '';
    renderAll();
  });
  $('reset').addEventListener('click', function () {
    state.word = []; state.lastApplied = '';
    renderAll();
  });

  // ---------- Positionsvektor ----------

  function renderVector() {
    const box = $('vec');
    const applied = $('applied');
    const verdict = $('posVerdict');
    box.innerHTML = ''; applied.textContent = ''; verdict.innerHTML = '';
    if (!state.info) return;
    const p = P.positionBySimulation(state.A, state.info, state.word);
    const n = state.info.n;
    const upper = p.slice(0, n).join(', ');
    const lower = p.slice(n).join(', ');
    box.innerHTML = '(<span class="upper">' + upper + '</span> | <span class="lower">' + lower + '</span>)' +
      '<div class="hint">links: runde Tokens pro Zustand · rechts: das eckige Token</div>' +
      '<div class="hint">' + esc(P.formatPosition(state.info, p)) + '</div>';
    applied.textContent = state.lastApplied;
    const acc = P.isAccepting(state.info, p);
    verdict.innerHTML = '<div class="verdict ' + (acc ? 'acc' : 'none') + '">' +
      (acc ? 'akzeptierende Position: ' : 'nicht akzeptierend: ') +
      esc(Au.formatWord(state.A, state.word)) + (acc ? ' ∈ L(A)' : ' ∉ L(A)') + '</div>';
  }

  function renderWord() {
    $('wordDisplay').innerHTML = state.word.length
      ? esc(state.word.join('')) + '<span class="cursor">▏</span>'
      : '<span class="cursor">ε</span>';
  }

  function renderMatrices() {
    const box = $('matrices');
    box.innerHTML = '';
    if (!state.mats) return;
    const info = state.info, m = state.mats;
    box.appendChild(matTable('M (alle Tokens entlang z)', m.M));
    box.appendChild(matTable('B (eckiges Token spaltet ab)', m.B));
    const v = document.createElement('div');
    v.className = 'mono';
    v.style.marginTop = '0.5rem';
    v.innerHTML = m.v.map(function (vi, i) {
      return 'v' + sup(i + 1) + ' = (' + vi.join(', ') + ')';
    }).join('<br>');
    box.appendChild(v);
    const yz = document.createElement('div');
    yz.className = 'hint';
    yz.innerHTML = 'Y = ' + info.Y.map(function (t, i) {
      return Au.displayState(info.states[i]) + '→' + Au.displayState(info.states[t]);
    }).join(', ') + '<br>Z = ' + info.Z.map(function (t, i) {
      return Au.displayState(info.states[i]) + '→' + Au.displayState(info.states[t]);
    }).join(', ');
    box.appendChild(yz);
  }

  function matTable(title, M) {
    const wrap = document.createElement('div');
    const h = document.createElement('div');
    h.className = 'hint';
    h.style.marginTop = '0.5rem';
    h.textContent = title;
    wrap.appendChild(h);
    const t = document.createElement('table');
    t.className = 'matrix';
    for (const row of M) {
      const tr = document.createElement('tr');
      for (const x of row) {
        const td = document.createElement('td');
        td.textContent = String(x);
        if (x === 0) td.className = 'zero';
        tr.appendChild(td);
      }
      t.appendChild(tr);
    }
    wrap.appendChild(t);
    return wrap;
  }

  // ---------- Erkundung ----------

  $('explore').addEventListener('click', function () {
    const out = $('exploreOut');
    const tbody = $('posTable').querySelector('tbody');
    out.innerHTML = ''; tbody.innerHTML = '';
    if (!state.A) { out.innerHTML = '<div class="result-line">Kein gültiges 1-VA geladen.</div>'; return; }
    const d = parseInt($('depth').value, 10);
    const res = P.explore(state.A, { maxDepth: isNaN(d) ? 6 : d, maxNodes: 3000 });
    if (!res.ok) { out.innerHTML = '<div class="result-line">' + esc(res.problems.join('; ')) + '</div>'; return; }

    const tag = '<span class="tag">bis Länge ' + res.maxDepth + ', ' + res.count + ' Positionen' +
      (res.truncated ? ', abgebrochen' : '') + '</span> ';
    if (res.universalSoFar) {
      out.innerHTML = '<div class="result-line">' + tag +
        'keine nicht-akzeptierende Position gefunden. <strong>Das ist kein Beweis</strong> für Universalität: ' +
        'die Positionsmenge kann unendlich sein.</div>';
    } else {
      const w = res.witness;
      out.innerHTML = '<div class="result-line">' + tag +
        '<strong>nicht universell.</strong> Zeuge (exakt): <span class="witness-link" id="wlink">' +
        esc(w.word.length ? w.word.join('') : 'ε') + '</span> mit Position ' + esc(P.formatPosition(res.info, w.p)) + '</div>';
      const lnk = $('wlink');
      if (lnk) lnk.addEventListener('click', function () {
        state.word = w.word.slice();
        state.lastApplied = '';
        renderAll();
      });
    }

    const nodes = res.nodes.slice().sort(function (a, b) { return a.depth - b.depth; });
    for (const nd of nodes.slice(0, 300)) {
      const tr = document.createElement('tr');
      const acc = P.isAccepting(res.info, nd.p);
      tr.innerHTML = '<td>' + nd.depth + '</td>' +
        '<td class="mono">' + esc(P.formatPosition(res.info, nd.p)) + '</td>' +
        '<td class="mono">' + esc(nd.word.length ? nd.word.join('') : 'ε') + '</td>' +
        '<td>' + (acc ? '✓' : '✗') + '</td>';
      if (!acc) tr.style.background = '#fbeded';
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', function () {
        state.word = nd.word.slice();
        state.lastApplied = '';
        renderAll();
      });
      tbody.appendChild(tr);
    }
    if (nodes.length > 300) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="4" class="hint">… ' + (nodes.length - 300) + ' weitere</td>';
      tbody.appendChild(tr);
    }
  });

  // ---------- Rendern ----------

  function renderAll() {
    renderGraph();
    renderButtons();
    renderVector();
    renderWord();
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // ---------- Start ----------

  $('dsl').value = Ex.byId('V').dsl;
  sel.value = 'V';
  reload();
})();
