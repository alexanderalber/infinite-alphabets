// positions.js — UI der Positions-Seite: Token-Animation und Erkundung.
(function (root) {
  'use strict';

  const Au = window.Automaton;
  const Ex = window.Examples;
  const P = window.Positions;
  const D = window.Draw;
  const Fo = window.Formula;
  const T = function () { return window.I18n; };

  const $ = function (id) { return document.getElementById(id); };

  const state = {
    A: null, info: null, mats: null,
    word: [],          // bisher gelesene Buchstaben
    lastApplied: ''    // Text der zuletzt angewandten Abbildung
  };

  // ---------- Beispiele ----------

  const sel = $('ex');
  function fillExamples() {
    for (const id of Ex.vaIds) {
      const e = Ex.byId(id);
      sel.appendChild(new Option(Ex.title(e) + '  [' + e.source + ']', e.id));
    }
  }
  fillExamples();
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
    catch (e) { errEl.textContent = (e.line ? T().f('pg.line', e.line) : '') + e.message; renderAll(); return; }
    const info = P.analyze(A);
    badgeEl.appendChild(badge(T().f('pos.badge.states', A.states.length)));
    if (!info.ok) {
      badgeEl.appendChild(badge(T().t('pos.badge.notVA'), 'err'));
      errEl.textContent = info.problems.join('\n');
      renderAll();
      return;
    }
    badgeEl.appendChild(badge(T().t('pos.badge.isVA'), 'ok'));
    badgeEl.appendChild(badge(T().f('pos.badge.accepting',
      A.accepting.map(Au.displayState).join(', ') || T().t('pos.badge.none'))));
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
      b.title = T().f('pos.btn.title', Au.displayState(state.info.states[s]), Fo.sub(s + 1));
      b.addEventListener('click', function () { append(a); });
      box.appendChild(b);
    }
    const nb = document.createElement('button');
    nb.className = 'primary';
    const fresh = P.nextFreshLetter(state.word);
    nb.textContent = T().f('pos.btn.fresh', fresh);
    nb.title = T().t('pos.btn.freshTitle');
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
      '<div class="hint">' + T().t('pos.vec.legend') + '</div>' +
      '<div class="hint">' + esc(P.formatPosition(state.info, p)) + '</div>';
    applied.textContent = state.lastApplied;
    const acc = P.isAccepting(state.info, p);
    verdict.innerHTML = '<div class="verdict ' + (acc ? 'acc' : 'none') + '">' +
      T().t(acc ? 'pos.verdict.acc' : 'pos.verdict.rej') +
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
    box.appendChild(matTable(T().t('pos.mat.M'), m.M));
    box.appendChild(matTable(T().t('pos.mat.B'), m.B));
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
    if (!state.A) { out.innerHTML = '<div class="result-line">' + T().t('pos.explore.noVA') + '</div>'; return; }
    const d = parseInt($('depth').value, 10);
    const res = P.explore(state.A, { maxDepth: isNaN(d) ? 6 : d, maxNodes: 3000 });
    if (!res.ok) { out.innerHTML = '<div class="result-line">' + esc(res.problems.join('; ')) + '</div>'; return; }

    const tag = '<span class="tag">' + T().f('pos.explore.tag', res.maxDepth, res.count) +
      (res.truncated ? T().t('pos.explore.truncated') : '') + '</span> ';
    if (res.universalSoFar) {
      out.innerHTML = '<div class="result-line">' + tag +
        T().t('pos.explore.universal') + '</div>';
    } else {
      const w = res.witness;
      out.innerHTML = '<div class="result-line">' + tag +
        T().t('pos.explore.witness') + '<span class="witness-link" id="wlink">' +
        esc(w.word.length ? w.word.join('') : 'ε') + '</span>' +
        esc(T().f('pos.explore.withPos', P.formatPosition(res.info, w.p))) + '</div>';
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
      tr.className = 'is-clickable';
      if (!acc) tr.style.background = 'var(--tool-danger-bg)';
      tr.addEventListener('click', function () {
        state.word = nd.word.slice();
        state.lastApplied = '';
        renderAll();
      });
      tbody.appendChild(tr);
    }
    if (nodes.length > 300) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="4" class="hint">' + T().f('pos.explore.more', nodes.length - 300) + '</td>';
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

  // Sprachwechsel: die Beispielnamen im Dropdown und alles dynamisch Erzeugte
  // neu aufbauen. Die Erkundungsausgabe wird geleert statt uebersetzt, weil sie
  // das Protokoll eines vergangenen Klicks ist.
  root.__onLang = function () {
    const cur = sel.value;
    sel.innerHTML = '';
    fillExamples();
    sel.value = cur;
    $('exploreOut').innerHTML = '';
    $('posTable').querySelector('tbody').innerHTML = '';
    reload();
  };

  $('dsl').value = Ex.byId('V').dsl;
  sel.value = 'V';
  reload();
})(globalThis);
