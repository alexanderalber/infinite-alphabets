// playground.js — UI des PA-Playgrounds.
(function (root) {
  'use strict';

  const Au = window.Automaton;
  const Ex = window.Examples;
  const D = window.Draw;
  const Fo = window.Formula;
  const T = function () { return window.I18n; };

  const $ = function (id) { return document.getElementById(id); };

  const state = {
    A: null, B: null,          // geparste Automaten (oder null bei Fehler)
    which: 'A',                // welcher Automat groß gezeichnet wird
    sim: null,                 // Simulationsergebnis für den aktuellen Automaten
    step: 0
  };

  // ---------- Beispielauswahl ----------

  function fillExamples(sel, withEmpty) {
    if (withEmpty) sel.appendChild(new Option(T().t('pg.ex.empty'), ''));
    for (const e of Ex.all) {
      const o = new Option(Ex.title(e) + '  [' + e.source + ']', e.id);
      sel.appendChild(o);
    }
  }
  fillExamples($('exA'), false);
  fillExamples($('exB'), true);

  $('exA').addEventListener('change', function () {
    const e = Ex.byId(this.value);
    if (e) { $('dslA').value = e.dsl; refresh('A'); }
  });
  $('exB').addEventListener('change', function () {
    const e = Ex.byId(this.value);
    $('dslB').value = e ? e.dsl : '';
    refresh('B');
  });
  $('clearB').addEventListener('click', function () { $('dslB').value = ''; $('exB').value = ''; refresh('B'); });

  $('showA').addEventListener('click', function () { state.which = 'A'; redraw(); });
  $('showB').addEventListener('click', function () { state.which = 'B'; redraw(); });

  $('dslA').addEventListener('input', function () { $('exA').value = ''; refresh('A'); });
  $('dslB').addEventListener('input', function () { $('exB').value = ''; refresh('B'); });
  $('word').addEventListener('input', function () { runSimulation(); });

  // ---------- Parsen und Badges ----------

  function refresh(slot) {
    const src = $('dsl' + slot).value;
    const errEl = $('err' + slot), badgeEl = $('badges' + slot);
    errEl.textContent = '';
    badgeEl.innerHTML = '';
    if (!src.trim()) { state[slot] = null; if (slot === state.which) redraw(); return; }
    let A = null;
    try { A = Au.parseDSL(src); }
    catch (e) {
      state[slot] = null;
      errEl.textContent = (e.line ? T().f('pg.line', e.line) : '') + e.message;
      if (slot === state.which) redraw();
      return;
    }
    state[slot] = A;
    renderBadges(badgeEl, A);
    if (slot === state.which) redraw();
    if (slot === state.which) runSimulation();
  }

  function badge(text, cls) {
    const s = document.createElement('span');
    s.className = 'badge' + (cls ? ' ' + cls : '');
    s.textContent = text;
    return s;
  }

  function renderBadges(el, A) {
    el.appendChild(badge(T().t(A.theory === 'reals' ? 'pg.badge.reals' : 'pg.badge.equality')));
    el.appendChild(badge(T().f('pg.badge.params', A.params.length)));
    if (A.constants.length) el.appendChild(badge(T().f('pg.badge.constants', A.constants.join(' '))));
    el.appendChild(badge(T().f('pg.badge.size', A.states.length, A.transitions.length)));
    let det;
    try { det = Au.determinismCheck(A); }
    catch (e) { el.appendChild(badge(T().f('pg.badge.detErr', e.message), 'warn')); return; }
    if (det.disjoint && det.complete) el.appendChild(badge(T().t('pg.badge.det'), 'ok'));
    else {
      for (const p of det.problems.slice(0, 3)) {
        const t = T().f(p.kind === 'overlap' ? 'pg.det.overlap' : 'pg.det.incomplete',
          Au.displayState(p.state), p.detail);
        el.appendChild(badge(t, 'warn'));
      }
      if (det.problems.length > 3) el.appendChild(badge(T().f('pg.badge.more', det.problems.length - 3), 'warn'));
    }
  }

  // ---------- Graph ----------

  function currentAutomaton() { return state[state.which]; }

  function redraw() {
    updateGridVisibility();
    const A = currentAutomaton();
    $('graphWhich').textContent = state.which;
    const svg = $('graph');
    if (!A) { while (svg.firstChild) svg.removeChild(svg.firstChild); return; }
    const highlight = new Map();
    if (state.sim && state.sim.forAutomaton === A) {
      const conf = state.sim.steps[Math.min(state.step, state.sim.steps.length - 1)].conf;
      for (const [q, S] of conf) highlight.set(q, state.sim.theory.format(S));
    }
    D.render(svg, A, {
      highlight: highlight,
      onDrag: function (st, x, y) { writeBackPos(state.which, st, x, y); }
    });
  }

  // pos-Zeile in die DSL zurückschreiben (Plan 8.1).
  function writeBackPos(slot, st, x, y) {
    const ta = $('dsl' + slot);
    const lines = ta.value.split(/\r?\n/);
    const re = new RegExp('^\\s*pos\\s+' + st.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s');
    const newLine = 'pos ' + st + ' ' + x + ' ' + y;
    let found = false;
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) { lines[i] = newLine; found = true; break; }
    }
    if (!found) lines.push(newLine);
    const sel = ta.selectionStart;
    ta.value = lines.join('\n');
    ta.selectionStart = ta.selectionEnd = Math.min(sel, ta.value.length);
    // Nicht neu zeichnen: der Zustand sitzt schon an der neuen Stelle.
    try { state[slot] = Au.parseDSL(ta.value); } catch (e) { /* Fehler zeigt refresh */ }
  }

  // ---------- Simulation ----------

  function runSimulation() {
    const A = currentAutomaton();
    const out = $('verdict');
    const tbody = $('confTable').querySelector('tbody');
    tbody.innerHTML = '';
    out.innerHTML = '';
    state.sim = null;
    if (!A) { $('stepRange').max = 0; $('stepLabel').textContent = ''; return; }
    let word;
    try { word = Au.parseWord(A, $('word').value); }
    catch (e) { out.innerHTML = '<div class="verdict conflict">' + esc(T().f('pg.word.err', e.message)) + '</div>'; return; }

    const sim = Au.simulate(A, word);
    sim.forAutomaton = A;
    sim.word = word;
    state.sim = sim;
    state.step = Math.min(state.step, sim.steps.length - 1);
    $('stepRange').max = sim.steps.length - 1;
    $('stepRange').value = state.step;
    updateStepLabel();

    // Verdikt
    const parts = [];
    if (sim.accepted) {
      const mu = sim.theory.witness(sim.acceptSet);
      parts.push('<div class="verdict acc"><strong>' + T().t('pg.verdict.acc') + '</strong>' +
        (mu && mu.text ? esc(T().f('pg.verdict.with', mu.text)) : '') + '</div>');
    }
    if (sim.complementAccepted) {
      const q = A.complement.filter(function (s) { return sim.final.has(s); })[0];
      const mu = sim.theory.witness(sim.complementSet);
      parts.push('<div class="verdict comp"><strong>' + T().t('pg.verdict.comp') + '</strong>' +
        (q ? esc(T().f('pg.verdict.via', Au.displayState(q))) : '') +
        (mu && mu.text ? esc(T().f('pg.verdict.with', mu.text)) : '') + '</div>');
    }
    if (sim.accepted && sim.complementAccepted) {
      parts.push('<div class="verdict conflict">' + T().t('pg.verdict.conflict') + '</div>');
    }
    if (!sim.accepted && !sim.complementAccepted) {
      const lbl = T().t(A.complement.length ? 'pg.verdict.gap' : 'pg.verdict.rejected');
      parts.push('<div class="verdict ' + (A.complement.length ? 'conflict' : 'none') + '">' + lbl + '</div>');
    }
    out.innerHTML = parts.join('');

    // Tabelle
    sim.steps.forEach(function (s, i) {
      const tr = document.createElement('tr');
      const cells = [];
      cells.push(String(i));
      cells.push(i === 0 ? '—' : esc(sim.theory.formatLetter ? sim.theory.formatLetter(s.letter) : String(s.letter)));
      const confs = [];
      for (const [q, S] of s.conf) confs.push(Au.displayState(q) + ': ' + sim.theory.format(S));
      cells.push(confs.length ? esc(confs.join('   |   ')) : '<em>' + T().t('pg.conf.none') + '</em>');
      tr.innerHTML = '<td>' + cells[0] + '</td><td class="mono">' + cells[1] + '</td><td class="mono">' + cells[2] + '</td>';
      // Die Zeile setzt den Schritt, ist also anklickbar. Das steht in der
      // Klasse und nicht in einem inline-Style, damit der Zeiger und die
      // Hover-Fuellung aus app.css kommen wie bei jedem anderen Klickziel.
      tr.className = 'is-clickable' + (i === state.step ? ' active' : '');
      tr.addEventListener('click', function () { state.step = i; $('stepRange').value = i; updateStepLabel(); redraw(); markRow(); });
      tbody.appendChild(tr);
    });
    redraw();
  }

  function markRow() {
    const rows = $('confTable').querySelectorAll('tbody tr');
    rows.forEach(function (r, i) { r.classList.toggle('active', i === state.step); });
  }

  function updateStepLabel() {
    const sim = state.sim;
    if (!sim) { $('stepLabel').textContent = ''; return; }
    $('stepLabel').textContent = T().f('pg.step.label', state.step, sim.steps.length - 1);
  }

  function setStep(i) {
    if (!state.sim) return;
    state.step = Math.max(0, Math.min(i, state.sim.steps.length - 1));
    $('stepRange').value = state.step;
    updateStepLabel();
    redraw();
    markRow();
  }
  $('stepFirst').addEventListener('click', function () { setStep(0); });
  $('stepPrev').addEventListener('click', function () { setStep(state.step - 1); });
  $('stepNext').addEventListener('click', function () { setStep(state.step + 1); });
  $('stepAll').addEventListener('click', function () { setStep(state.sim ? state.sim.steps.length - 1 : 0); });
  $('stepRange').addEventListener('input', function () { setStep(parseInt(this.value, 10)); });

  // ---------- Operationen ----------

  document.querySelectorAll('[data-op]').forEach(function (btn) {
    btn.addEventListener('click', function () { doOperation(this.getAttribute('data-op')); });
  });

  function doOperation(op) {
    const note = $('opNote');
    note.textContent = '';
    const A = state.A, B = state.B;
    const target = $('opSlot').value;
    try {
      let R = null, msg = '';
      switch (op) {
        case 'sync': {
          need(A, 'A'); need(B, 'B');
          const det = Au.determinismCheck(A);
          R = Au.synchronizedProduct(A, B);
          R = Au.removeUnreachable(Au.simplifyLabels(R));
          msg = T().t('pg.op.msg.sync');
          if (!(det.disjoint && det.complete)) msg += T().t('pg.op.msg.syncWarn');
          msg += T().t('pg.op.msg.syncNote');
          break;
        }
        case 'inter': need(A, 'A'); need(B, 'B'); R = Au.intersectionProduct(A, B);
          msg = T().t('pg.op.msg.inter'); break;
        case 'union': need(A, 'A'); need(B, 'B'); R = Au.unionProduct(A, B);
          msg = T().t('pg.op.msg.union'); break;
        case 'complement': need(A, 'A'); R = Au.complementCFPA(A);
          msg = T().t('pg.op.msg.complement'); break;
        case 'sink': need(A, 'A'); R = Au.addSink(A);
          msg = T().t('pg.op.msg.sink'); break;
        case 'fc': {
          need(A, 'A');
          const fc = Au.largestFc(A);
          R = Au.cloneAutomaton(A);
          R.complement = fc;
          msg = T().f('pg.op.msg.fc', fc.map(Au.displayState).join(', '));
          break;
        }
        case 'simplify': need(A, 'A'); R = Au.simplifyLabels(A); msg = T().t('pg.op.msg.simplify'); break;
        case 'prune': need(A, 'A'); R = Au.removeUnreachable(A); msg = T().t('pg.op.msg.prune'); break;
      }
      if (!R) return;
      $('dsl' + target).value = Au.toDSL(R);
      $('ex' + target).value = '';
      refresh(target);
      state.which = target;
      redraw();
      note.textContent = msg;
    } catch (e) {
      note.textContent = T().f('pg.op.err', e.message);
    }
  }

  function need(A, name) { if (!A) throw new Error(T().f('pg.need', name)); }

  // ---------- Prüfungen ----------

  document.querySelectorAll('[data-check]').forEach(function (btn) {
    btn.addEventListener('click', function () { doCheck(this.getAttribute('data-check')); });
  });

  // Die drei Marken vor einem Ergebnis: exakt, beschraenkt geprueft, sonstiges.
  function tagOf(key) { return '<span class="tag">' + T().t(key) + '</span> '; }
  function exact() { return tagOf('pg.tag.exact'); }
  function upto(o, r) { return '<span class="tag">' + T().f('pg.tag.upto', o.maxLen, r.checked) + '</span> '; }

  function checkOpts() {
    const maxLen = parseInt($('maxLen').value, 10);
    const gridSrc = $('grid').value.trim();
    const grid = gridSrc ? gridSrc.split(/[,\s]+/).filter(Boolean) : Au.DEFAULT_GRID;
    return { maxLen: isNaN(maxLen) ? 4 : maxLen, grid: grid };
  }

  function out(html) {
    const d = document.createElement('div');
    d.className = 'result-line';
    d.innerHTML = html;
    $('checkOut').insertBefore(d, $('checkOut').firstChild);
    return d;
  }

  function witnessLink(text, word, A) {
    const span = '<span class="witness-link" data-word="' + esc(Au.formatWord(A, word)) + '">' + esc(text) + '</span>';
    return span;
  }

  $('checkOut').addEventListener('click', function (ev) {
    const t = ev.target;
    if (!t.classList.contains('witness-link')) return;
    const w = t.getAttribute('data-word');
    $('word').value = w === 'ε' ? '' : w;
    runSimulation();
  });

  function doCheck(kind) {
    const A = state.A, B = state.B;
    const o = checkOpts();
    try {
      switch (kind) {
        case 'empty': {
          need(A, 'A');
          const r = Au.emptinessCheck(A);
          if (r.empty) out(exact() + T().t('pg.res.empty'));
          else {
            const w = r.witness;
            out(exact() + T().t('pg.res.nonempty') +
              (w ? T().t('pg.res.witness') + witnessLink(w.wordText, w.word, A) +
                (w.mu ? esc(T().f('pg.verdict.with', w.mu)) : '') : '') + '.');
          }
          break;
        }
        case 'det': {
          need(A, 'A');
          const r = Au.determinismCheck(A);
          if (r.disjoint && r.complete) out(exact() + T().t('pg.res.det'));
          else {
            const lines = r.problems.map(function (p) {
              return esc(T().f(p.kind === 'overlap' ? 'pg.det.overlap' : 'pg.det.incomplete',
                Au.displayState(p.state), p.detail));
            });
            out(exact() + T().t('pg.res.notDet') + '<br>' + lines.join('<br>'));
          }
          break;
        }
        case 'cfpa': {
          need(A, 'A');
          if (!A.complement.length) { out(T().t('pg.res.noComplement')); break; }
          const r = Au.checkCFPAConsistency(A, o);
          const tag = upto(o, r);
          if (r.ok) out(tag + T().t('pg.res.cfpaOk'));
          else {
            const bits = [];
            if (r.firstConflict) bits.push(T().t('pg.res.cfpaConflict') + witnessLink(r.firstConflict.text, r.firstConflict.word, A));
            if (r.firstGap) bits.push(T().t('pg.res.cfpaGap') + witnessLink(r.firstGap.text, r.firstGap.word, A));
            out(tag + T().t('pg.res.cfpaBad') + bits.join(' · '));
          }
          break;
        }
        case 'sdpa': {
          need(A, 'A');
          const r = Au.checkSDPA(A, o);
          const tag = upto(o, r);
          if (r.ok) out(tag + T().t('pg.res.sdpaOk'));
          else out(tag + T().t('pg.res.sdpaBad') + witnessLink(r.witness.text, r.witness.word, A) +
            esc(T().f('pg.res.sdpaRuns', r.witness.count)));
          break;
        }
        case 'uni': {
          need(B, 'B');
          const r = Au.checkUniversality(B, o);
          const tag = upto(o, r);
          if (r.universal) out(tag + T().t('pg.res.uniOk'));
          else out(tag + T().t('pg.res.uniBad') + witnessLink(r.witness.text, r.witness.word, B));
          break;
        }
        case 'equiv': {
          need(A, 'A'); need(B, 'B');
          const r = Au.checkEquivalence(A, B, o);
          const tag = upto(o, r);
          if (r.equivalent) out(tag + T().t('pg.res.equivOk'));
          else out(tag + T().t('pg.res.equivBad') + witnessLink(r.witness.text, r.witness.word, A) +
            T().t(r.witness.inA ? 'pg.res.inAnotB' : 'pg.res.inBnotA'));
          break;
        }
        case 'skolem': {
          need(A, 'A'); need(B, 'B');
          const r = Au.checkSkolem(A, B, o);
          if (r.reason) { out(tagOf('pg.tag.syntactic') + esc(r.reason)); break; }
          const tag = upto(o, r);
          if (r.ok) out(tag + T().t('pg.res.skolemOk'));
          else out(tag + T().t('pg.res.skolemBad') + witnessLink(r.witness.text, r.witness.word, A) +
            (r.witness.mu ? esc(T().f('pg.verdict.with', r.witness.mu)) : ''));
          break;
        }
      }
    } catch (e) {
      out(tagOf('pg.tag.error') + esc(e.message));
    }
  }

  // ---------- Familien mit Parameter n ----------

  function bellNumber(n) {
    // Dreieck von Peirce
    let row = [1];
    for (let i = 1; i <= n; i++) {
      const next = [row[row.length - 1]];
      for (const x of row) next.push(next[next.length - 1] + x);
      row = next;
    }
    return row[0];
  }

  $('famN').addEventListener('input', function () { $('famNLabel').textContent = this.value; });

  document.querySelectorAll('[data-fam]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const n = parseInt($('famN').value, 10);
      const kind = this.getAttribute('data-fam');
      const target = $('opSlot').value;
      let note = '';
      if (kind === 'epa') {
        $('dsl' + target).value = Ex.epaFamily(n);
        note = T().f('pg.fam.epaNote', Fo.sub(n), n, n, bellNumber(n), n * bellNumber(n));
      } else {
        $('dsl' + target).value = Ex.cffsa(n);
        const dfa = Math.pow(2, n);
        note = T().f('pg.fam.cffsaNote', n, dfa, 3 * (n + 1) - 1);
      }
      $('ex' + target).value = '';
      refresh(target);
      state.which = target;
      redraw();
      $('famNote').textContent = note;
    });
  });

  // ---------- Teilen ----------

  $('mkLink').addEventListener('click', function () {
    const btn = this;
    window.Share.encode({
      a: $('dslA').value,
      b: $('dslB').value.trim(),
      w: $('word').value.trim()
    }).then(function (hash) {
      const url = location.origin + location.pathname + '#' + hash;
      history.replaceState(null, '', '#' + hash);
      const out = $('linkOut');
      out.innerHTML = '';
      const field = document.createElement('input');
      field.type = 'text';
      field.readOnly = true;
      field.value = url;
      field.addEventListener('focus', function () { this.select(); });
      out.appendChild(field);
      const info = document.createElement('span');
      info.className = 'hint';
      info.textContent = T().f('pg.share.chars', url.length);
      out.appendChild(info);
      field.select();
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(function () {
          const old = btn.textContent;
          btn.textContent = T().t('pg.share.copied');
          setTimeout(function () { btn.textContent = old; }, 1200);
        }).catch(function () {});
      }
    }).catch(function (e) {
      $('linkOut').textContent = T().f('pg.share.failed', e.message);
    });
  });

  $('mkTikz').addEventListener('click', function () {
    const A = currentAutomaton();
    const ta = $('tikzOut');
    if (!A) { ta.style.display = 'none'; return; }
    ta.value = window.Tikz.exportTikz(A, { title: 'Slot ' + state.which });
    ta.style.display = '';
    ta.select();
    if (navigator.clipboard) navigator.clipboard.writeText(ta.value).catch(function () {});
  });

  // Liefert true, wenn aus dem Hash geladen wurde.
  function loadFromHash() {
    return window.Share.decode(location.hash).then(function (fields) {
      if (!fields) return false;
      $('dslA').value = fields.a;
      $('dslB').value = fields.b || '';
      $('word').value = fields.w || '';
      syncExampleSelect('A');
      syncExampleSelect('B');
      return true;
    }).catch(function () { return false; });
  }

  // Das Dropdown auf das Beispiel stellen, dessen DSL im Editor steht, sonst leeren.
  function syncExampleSelect(slot) {
    const src = $('dsl' + slot).value.trim();
    let id = '';
    for (const e of Ex.all) if (e.dsl.trim() === src) { id = e.id; break; }
    $('ex' + slot).value = id;
  }

  // ---------- Theorieabhängige UI ----------

  function updateGridVisibility() {
    const A = currentAutomaton();
    $('gridRow').style.display = (A && A.theory === 'equality') ? 'none' : '';
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // ---------- Start ----------

  // Ein von Hand geänderter oder aus der History zurückgeholter Hash lädt neu.
  // Der eigene replaceState in mkLink setzt hier nichts in Gang, weil er kein
  // hashchange auslöst.
  window.addEventListener('hashchange', function () {
    loadFromHash().then(function (ok) { if (ok) start(); });
  });

  loadFromHash().then(function (fromHash) {
    if (!fromHash) {
      $('dslA').value = Ex.byId('C3').dsl;
      $('exA').value = 'C3';
      $('dslB').value = Ex.byId('A3').dsl;
      $('exB').value = 'A3';
      $('word').value = '1, 1/2, 8/5';
    }
    start();
  });

  function start() {
    refresh('A');
    refresh('B');
    runSimulation();
  }

  // Sprachwechsel: das statische Markup erledigt site-chrome.js, alles hier
  // Erzeugte muss neu gebaut werden. Die Auswahl in den Dropdowns wird
  // festgehalten und wieder gesetzt, weil sie beim Neubefuellen verloren geht.
  // Die Ergebnisliste der Pruefungen wird geleert statt uebersetzt: sie ist ein
  // Protokoll vergangener Klicks, und ein halb uebersetztes Protokoll waere
  // schlechter als ein leeres.
  root.__onLang = function () {
    const selA = $('exA').value, selB = $('exB').value;
    $('exA').innerHTML = '';
    $('exB').innerHTML = '';
    fillExamples($('exA'), false);
    fillExamples($('exB'), true);
    $('exA').value = selA;
    $('exB').value = selB;
    $('checkOut').innerHTML = '';
    $('opNote').textContent = '';
    $('famNote').textContent = '';
    start();
  };
})(globalThis);
