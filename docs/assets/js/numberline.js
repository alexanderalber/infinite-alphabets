// numberline.js: der Zahlenstrahl zur reellen Theorie.
//
// In der reellen Theorie ist ein Wort eine Folge von Punkten auf R und der
// Parameter y eine einzelne Marke darauf. Genau das zeigt diese Datei: die
// Buchstaben als Punkte, die Akzeptanzmenge als Band darunter und y als
// ziehbare Marke. Wer die Marke bewegt, sieht das Verdikt kippen, sobald sie
// eine Bandgrenze ueberquert.
//
// Alles Rationale bleibt Fraction. Gleitkomma kommt nur fuer Pixel vor: die
// Umrechnung Wert -> x und zurueck, und die Wahl der Teilstriche. Der Rueckweg
// quantisiert sofort wieder auf einen Bruch, damit die Marke ein exakter Wert
// ist und nicht ein gerundeter.
//
// Die Semantik ist keine neue: statesAt und firing lesen nur die Mengen ab, die
// automaton.simulate ohnehin gerechnet hat. Ein Zustand ist unter y = mu aktiv,
// wenn mu in seiner Parametermenge liegt; eine Transition feuert, wenn ihr
// Quellzustand aktiv ist und mu die Formel unter dem gelesenen Buchstaben
// erfuellt. Beides ist exakt.
(function (root) {
  'use strict';

  const F = root.Fraction;
  const I = root.Intervals;
  const TR = root.TheoryReal;

  const NS = 'http://www.w3.org/2000/svg';

  // Geometrie in viewBox-Einheiten.
  const W = 560, X0 = 62, X1 = 540;
  const Y_IDX = 18, Y_LET = 30, Y_AXIS = 46, Y_TICK = 51, Y_TLAB = 63;
  const Y_BAND0 = 74, BAND_H = 15, BAND_GAP = 5;

  const GRID_DIV = 8;  // Rasterweite beim Ziehen: ein Achtel Teilstrichabstand

  // ---------- Modell (ohne DOM, testbar) ----------

  function isReals(A) { return !!A && A.theory === 'reals'; }

  // Buchstaben zusammenfassen: derselbe Wert an mehreren Stellen ist ein Punkt
  // mit mehreren Indizes, sonst laegen die Beschriftungen uebereinander.
  function lettersOf(word) {
    const out = [];
    for (let i = 0; i < word.length; i++) {
      let e = null;
      for (const c of out) if (c.value.eq(word[i])) { e = c; break; }
      if (!e) { e = { value: word[i], indices: [] }; out.push(e); }
      e.indices.push(i + 1);
    }
    out.sort(function (a, b) { return a.value.cmp(b.value); });
    return out;
  }

  function endpointsOf(set) {
    const out = [];
    for (const i of set || []) {
      if (i.lo !== null) out.push(i.lo);
      if (i.hi !== null) out.push(i.hi);
    }
    return out;
  }

  // Sichtbarer Ausschnitt: alles Interessante plus ein Viertel Rand. Ohne jeden
  // endlichen Wert (leeres Wort, Automat ohne Konstanten) ein neutrales Fenster.
  function axisRange(vals) {
    if (!vals || !vals.length) return { lo: new F(-1n), hi: new F(3n) };
    let lo = vals[0], hi = vals[0];
    for (const v of vals) { if (v.lt(lo)) lo = v; if (v.gt(hi)) hi = v; }
    if (lo.eq(hi)) return { lo: lo.sub(F.ONE), hi: hi.add(F.ONE) };
    const pad = hi.sub(lo).mul(new F(1n, 4n));
    return { lo: lo.sub(pad), hi: hi.add(pad) };
  }

  // Abstand der Teilstriche: die kleinste Zahl der Form 1, 2, 5 mal Zehnerpotenz,
  // die den Ausschnitt in hoechstens etwa sieben Abschnitte teilt.
  function tickStep(span) {
    const raw = span.toNumber() / 7;
    for (let k = -3; k <= 9; k++) {
      const p = k >= 0 ? new F(10n ** BigInt(k), 1n) : new F(1n, 10n ** BigInt(-k));
      for (const m of [1n, 2n, 5n]) {
        const c = p.mul(new F(m, 1n));
        if (c.toNumber() >= raw) return c;
      }
    }
    return F.ONE;
  }

  function ticks(lo, hi, step) {
    const q = lo.div(step);
    let k = q.floor();
    if (new F(k, 1n).mul(step).lt(lo)) k += 1n;
    const out = [];
    for (let i = 0; i < 60; i++) {
      const v = new F(k + BigInt(i), 1n).mul(step);
      if (v.gt(hi)) break;
      out.push(v);
    }
    return out;
  }

  // Das ganze Bild in Werten, bevor irgendetwas Pixel wird. extra nimmt Werte
  // auf, die sichtbar bleiben muessen, auch wenn nichts sie sonst erzwingt: die
  // festgehaltene Marke bleibt so im Bild, wenn ein neues Wort den Ausschnitt
  // verschiebt. Sonst filterte ein unsichtbares y den Graphen weiter.
  function model(A, sim, extra) {
    const letters = lettersOf((sim && sim.word) || []);
    const accept = (sim && sim.acceptSet) || [];
    const hasComp = !!(A && A.complement.length);
    const comp = hasComp ? ((sim && sim.complementSet) || []) : null;
    const vals = letters.map(function (l) { return l.value; })
      .concat(endpointsOf(accept))
      .concat(hasComp ? endpointsOf(comp) : [])
      .concat(extra || []);
    const r = axisRange(vals);
    const step = tickStep(r.hi.sub(r.lo));
    return {
      letters: letters, accept: accept, comp: comp, hasComp: hasComp,
      lo: r.lo, hi: r.hi, step: step, ticks: ticks(r.lo, r.hi, step)
    };
  }

  // Zustaende, die unter y = mu im Schritt i erreichbar sind.
  function statesAt(sim, i, mu) {
    const out = [];
    if (!sim) return out;
    const conf = sim.steps[Math.max(0, Math.min(i, sim.steps.length - 1))].conf;
    for (const [q, S] of conf) if (I.contains(S, mu)) out.push(q);
    return out;
  }

  // Transitionen, die den Schritt i unter y = mu moeglich machen (i >= 1).
  function firing(A, sim, i, mu) {
    const out = [];
    if (!sim || i < 1 || i >= sim.steps.length) return out;
    const prev = statesAt(sim, i - 1, mu);
    const letter = sim.steps[i].letter;
    for (const t of A.transitions) {
      if (prev.indexOf(t.from) < 0) continue;
      if (I.contains(TR.solveY(t.ast, letter), mu)) out.push(t);
    }
    return out;
  }

  function acceptedAt(sim, mu) { return !!sim && I.contains(sim.acceptSet, mu); }
  function complementAt(sim, mu) { return !!sim && I.contains(sim.complementSet, mu); }

  // Pixelanteil -> Bruch, gerastert auf Vielfache von grid. Das Raster liegt
  // absolut und nicht relativ zum Ausschnitt, damit 0, 1/2 und 1 immer darauf
  // liegen. Ohne Raster ist jede Mausposition ein exakter, aber unlesbarer
  // Bruch: 1933/1600 steht dann als Belegung da, wo 19/16 gemeint war.
  function valueAt(frac, lo, hi, grid) {
    const g = grid || F.ONE;
    const t = Math.max(0, Math.min(1, frac));
    const raw = lo.toNumber() + t * hi.sub(lo).toNumber();
    let k = BigInt(Math.round(raw / g.toNumber()));
    let v = new F(k, 1n).mul(g);
    // Runden kann ueber den Rand hinausschiessen; dann das Raster einwaerts.
    if (v.lt(lo)) { k += 1n; v = new F(k, 1n).mul(g); }
    if (v.gt(hi)) { k -= 1n; v = new F(k, 1n).mul(g); }
    return v;
  }

  // Auf einen der Kandidaten einrasten, wenn einer nah genug liegt. Ohne das
  // waere genau der interessante Fall unerreichbar: die Bandgrenze selbst, an
  // der sich offen und geschlossen unterscheiden.
  function snap(v, cands, tol) {
    let best = null, bd = null;
    for (const c of cands || []) {
      const d = c.sub(v).abs();
      if (d.gt(tol)) continue;
      if (bd === null || d.lt(bd)) { bd = d; best = c; }
    }
    return best === null ? v : best;
  }

  function snapCandidates(m) {
    return m.letters.map(function (l) { return l.value; })
      .concat(endpointsOf(m.accept))
      .concat(m.hasComp ? endpointsOf(m.comp) : [])
      .concat(m.ticks);
  }

  // ---------- Zeichnen ----------

  function el(name, attrs, text) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, String(attrs[k]));
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // Die Stelle im Wort als Subskript, wie die Paper es setzen.
  function indexLabel(i) {
    return root.Formula ? root.Formula.sub(i) : String(i);
  }

  function heightOf(m) {
    return Y_BAND0 + BAND_H + (m.hasComp ? BAND_GAP + BAND_H : 0) + 20;
  }

  // opts: {mu, labels: {accept, complement, mu, empty}, onPick: fn(Fraction)}
  function render(svg, m, opts) {
    opts = opts || {};
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const H = heightOf(m);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    const span = m.hi.sub(m.lo);
    const x = function (v) { return X0 + v.sub(m.lo).toNumber() / span.toNumber() * (X1 - X0); };
    const labels = opts.labels || {};

    // Achse und Teilstriche
    svg.appendChild(el('line', { x1: X0, y1: Y_AXIS, x2: X1, y2: Y_AXIS, class: 'nl-axis' }));
    for (const t of m.ticks) {
      const px = x(t);
      svg.appendChild(el('line', { x1: px, y1: Y_AXIS, x2: px, y2: Y_TICK, class: 'nl-tick' }));
      svg.appendChild(el('text', { x: px, y: Y_TLAB, class: 'nl-tick-label', 'text-anchor': 'middle' },
        I.formatEndpoint(t)));
    }

    // Buchstaben des Wortes. Beschriftet wird die Stelle im Wort, nicht der
    // Wert: der steht schon an der Achse. Als Subskript, weil eine gewoehnliche
    // Ziffer ueber dem Punkt wie ein zweiter Achsenwert aussaehe.
    for (const l of m.letters) {
      const px = x(l.value);
      svg.appendChild(el('line', { x1: px, y1: Y_LET, x2: px, y2: Y_AXIS, class: 'nl-stem' }));
      const dot = el('circle', { cx: px, cy: Y_LET, r: 4.2, class: 'nl-letter' });
      dot.appendChild(el('title', {}, I.formatEndpoint(l.value)));
      svg.appendChild(dot);
      svg.appendChild(el('text', { x: px, y: Y_IDX, class: 'nl-letter-label', 'text-anchor': 'middle' },
        l.indices.map(indexLabel).join(',')));
    }

    // Baender: akzeptierend, darunter komplement-akzeptierend
    let y = Y_BAND0;
    drawBand(svg, m, x, y, m.accept, 'acc', labels.accept || 'accept', labels.empty || '∅');
    let bottom = y + BAND_H;
    if (m.hasComp) {
      y += BAND_H + BAND_GAP;
      drawBand(svg, m, x, y, m.comp, 'comp', labels.complement || 'co-accept', labels.empty || '∅');
      bottom = y + BAND_H;
    }

    // Die Marke
    if (opts.mu) {
      const px = x(opts.mu);
      const inside = opts.mu.ge(m.lo) && opts.mu.le(m.hi);
      if (inside) {
        const g = el('g', { class: 'nl-mu' });
        g.appendChild(el('path', { d: 'M' + (px - 5) + ' 6 L' + (px + 5) + ' 6 L' + px + ' 14 Z', class: 'nl-mu-head' }));
        g.appendChild(el('line', { x1: px, y1: 12, x2: px, y2: bottom + 2, class: 'nl-mu-line' }));
        g.appendChild(el('text', {
          x: Math.max(X0, Math.min(X1, px)), y: H - 6, class: 'nl-mu-label', 'text-anchor': 'middle'
        }, (labels.mu || 'y') + ' = ' + I.formatEndpoint(opts.mu)));
        svg.appendChild(g);
      }
    }

    if (opts.onPick) {
      svg.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, class: 'nl-hit' }));
      attach(svg, m, opts.onPick);
    }
    return svg;
  }

  // Ein Band ist ein Rechteck je Intervall. Die Enden tragen einen Punkt:
  // gefuellt heisst geschlossen, hohl heisst offen. Ohne diesen Unterschied
  // saehen [1,2] und [1,2) gleich aus, und genau daran haengt hier das Verdikt.
  function drawBand(svg, m, x, y, set, cls, label, emptyLabel) {
    const g = el('g', { class: 'nl-band nl-band-' + cls });
    g.appendChild(el('rect', { x: X0, y: y, width: X1 - X0, height: BAND_H, class: 'nl-band-bed' }));
    g.appendChild(el('text', { x: X0 - 6, y: y + BAND_H - 4, class: 'nl-band-label', 'text-anchor': 'end' }, label));
    const mid = y + BAND_H / 2;
    let drawn = 0;
    for (const iv of set || []) {
      const aInside = iv.lo !== null && iv.lo.ge(m.lo) && iv.lo.le(m.hi);
      const bInside = iv.hi !== null && iv.hi.ge(m.lo) && iv.hi.le(m.hi);
      const a = iv.lo === null || iv.lo.lt(m.lo) ? m.lo : iv.lo;
      const b = iv.hi === null || iv.hi.gt(m.hi) ? m.hi : iv.hi;
      if (a.gt(b)) continue;
      drawn++;
      const xa = x(a), xb = x(b);
      // Ein Punktintervall [p,p] hat Breite 0. Es bekommt nur seinen Punkt und
      // kein Rechteck: zwei Endmarken an derselben Stelle uebereinander und ein
      // Zwei-Pixel-Streifen dazwischen sind nicht zu lesen.
      if (iv.lo !== null && iv.hi !== null && iv.lo.eq(iv.hi)) {
        if (aInside) g.appendChild(endMark(xa, mid, true));
        continue;
      }
      g.appendChild(el('rect', {
        x: xa, y: y + 1.5, width: Math.max(2, xb - xa), height: BAND_H - 3, class: 'nl-band-fill'
      }));
      if (aInside) g.appendChild(endMark(xa, mid, iv.loClosed));
      if (bInside) g.appendChild(endMark(xb, mid, iv.hiClosed));
    }
    if (!drawn) {
      g.appendChild(el('text', { x: (X0 + X1) / 2, y: mid + 3.5, class: 'nl-band-empty', 'text-anchor': 'middle' },
        emptyLabel));
    }
    svg.appendChild(g);
  }

  function endMark(px, py, closed) {
    return el('circle', { cx: px, cy: py, r: 3, class: 'nl-end' + (closed ? ' closed' : ' open') });
  }

  // Die Zeiger haengen am SVG selbst, nicht an den Kindern: das Zeichnen wirft
  // die Kinder bei jeder Bewegung weg, ein Pointer-Capture auf einem entfernten
  // Element bricht den Zug ab. Das SVG bleibt, also wird genau einmal verdrahtet
  // und das Modell danach nur noch ausgetauscht.
  function attach(svg, m, onPick) {
    svg.__nl = { m: m, onPick: onPick };
    if (svg.__nlWired) return;
    svg.__nlWired = true;
    let dragging = false;

    const pick = function (ev) {
      const ctx = svg.__nl;
      if (!ctx) return;
      const p = svgPoint(svg, ev);
      const frac = (p.x - X0) / (X1 - X0);
      const mm = ctx.m;
      const raw = valueAt(frac, mm.lo, mm.hi, mm.step.mul(new F(1n, BigInt(GRID_DIV))));
      const tol = mm.hi.sub(mm.lo).mul(new F(1n, 80n));
      ctx.onPick(snap(raw, snapCandidates(mm), tol));
    };

    svg.addEventListener('pointerdown', function (ev) {
      dragging = true;
      try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* ohne Capture geht es auch */ }
      pick(ev);
      ev.preventDefault();
    });
    svg.addEventListener('pointermove', function (ev) { if (dragging) pick(ev); });
    svg.addEventListener('pointerup', function () { dragging = false; });
    svg.addEventListener('pointercancel', function () { dragging = false; });
  }

  function svgPoint(svg, ev) {
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX; pt.y = ev.clientY;
    const mtx = svg.getScreenCTM();
    return mtx ? pt.matrixTransform(mtx.inverse()) : { x: ev.clientX, y: ev.clientY };
  }

  root.NumberLine = {
    isReals: isReals, lettersOf: lettersOf, endpointsOf: endpointsOf,
    axisRange: axisRange, tickStep: tickStep, ticks: ticks, model: model,
    statesAt: statesAt, firing: firing, acceptedAt: acceptedAt, complementAt: complementAt,
    valueAt: valueAt, snap: snap, snapCandidates: snapCandidates,
    render: render, heightOf: heightOf, W: W, X0: X0, X1: X1, GRID_DIV: GRID_DIV
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
