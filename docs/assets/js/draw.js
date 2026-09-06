// draw.js — SVG-Rendering von Automaten: Zustände, Kanten, Labels, Tokens.
// Farbcodierung wie CIAA Fig. 3: akzeptierend hellrot mit Doppelkreis, komplement-
// akzeptierend hellblau, schwach gestrichelt (nur wenn complement gesetzt ist).
(function (root) {
  'use strict';

  const Au = root.Automaton;
  const NS = 'http://www.w3.org/2000/svg';

  const R = 24;            // Zustandsradius
  const GRID_X = 150;
  const GRID_Y = 110;
  const PAD = 78;   // Platz fuer Selbstschleifen an allen vier Seiten

  function el(name, attrs, text) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, String(attrs[k]));
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // Layout kommt aus automaton.js, weil es kein DOM braucht und auch im Test gebraucht wird.
  const autoLayout = Au.autoLayout;
  const layoutOf = Au.layoutOf;

  function stateKind(A, q) {
    const hasC = A.complement.length > 0;
    if (A.accepting.indexOf(q) >= 0) return 'accepting';
    if (A.complement.indexOf(q) >= 0) return 'complement';
    return hasC ? 'weak' : 'plain';
  }

  // Transitionen zwischen demselben Paar zu einem Label zusammenfassen.
  function groupTransitions(A) {
    const map = new Map();
    for (const t of A.transitions) {
      const k = t.from + ' ' + t.to;
      if (!map.has(k)) map.set(k, { from: t.from, to: t.to, asts: [] });
      map.get(k).asts.push(t.ast);
    }
    return Array.from(map.values());
  }

  // opts: {highlight: Map state → Text, tokens: Map state → {round:[Buchstaben], square:bool},
  //        onDrag: fn(state, x, y), scale: number}
  function render(svg, A, opts) {
    opts = opts || {};
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const pos = layoutOf(A);
    const px = {};
    let maxX = 0, maxY = 0;
    for (const s of A.states) {
      px[s] = { x: PAD + pos[s].x * GRID_X, y: PAD + pos[s].y * GRID_Y };
      maxX = Math.max(maxX, px[s].x);
      maxY = Math.max(maxY, px[s].y);
    }
    const W = maxX + PAD, Hh = maxY + PAD;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + Hh);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    const defs = el('defs');
    for (const [id, color] of [['arrow', 'var(--edge)'], ['arrow-hot', 'var(--hot)']]) {
      const marker = el('marker', {
        id: id, viewBox: '0 0 10 10', refX: 9, refY: 5,
        markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse'
      });
      marker.appendChild(el('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: color }));
      defs.appendChild(marker);
    }
    svg.appendChild(defs);

    const gEdges = el('g', { class: 'edges' });
    const gLabels = el('g', { class: 'edge-labels' });
    const gStates = el('g', { class: 'states' });
    svg.appendChild(gEdges); svg.appendChild(gLabels); svg.appendChild(gStates);

    const groups = groupTransitions(A);
    const pairSeen = new Set();
    for (const g of groups) pairSeen.add(g.from + ' ' + g.to);

    for (const g of groups) {
      const label = g.asts.map(function (a) { return Au.displayFormula(A, a); }).join('\n');
      if (g.from === g.to) {
        // Der Schleife soll ausweichen, was in der Nähe liegt: andere Zustände und
        // die Mitten der Kanten, die diesen Zustand berühren.
        const avoid = [];
        for (const s of A.states) if (s !== g.from) avoid.push(px[s]);
        for (const h of groups) {
          if (h.from === h.to) continue;
          if (h.from !== g.from && h.to !== g.from) continue;
          avoid.push({ x: (px[h.from].x + px[h.to].x) / 2, y: (px[h.from].y + px[h.to].y) / 2 });
        }
        drawSelfLoop(gEdges, gLabels, px[g.from], label, loopDirection(g.from, px, avoid));
      } else {
        const back = pairSeen.has(g.to + ' ' + g.from);
        drawEdge(gEdges, gLabels, px[g.from], px[g.to], label, back, opts);
      }
    }

    for (const s of A.states) {
      const kind = stateKind(A, s);
      const p = px[s];
      const g = el('g', { class: 'state state-' + kind, 'data-state': s, transform: 'translate(' + p.x + ',' + p.y + ')' });
      const hot = opts.highlight && opts.highlight.has(s);
      if (hot) g.setAttribute('class', g.getAttribute('class') + ' hot');
      g.appendChild(el('circle', { r: R, class: 'state-body' }));
      if (kind === 'accepting') g.appendChild(el('circle', { r: R - 4, class: 'state-inner' }));
      if (s === A.initial) {
        g.appendChild(el('path', { d: 'M ' + (-R - 22) + ' 0 L ' + (-R - 3) + ' 0', class: 'init-arrow', 'marker-end': 'url(#arrow)' }));
      }
      g.appendChild(el('text', { class: 'state-label', 'text-anchor': 'middle', dy: '0.35em' }, Au.displayState(s)));
      if (hot) {
        const txt = opts.highlight.get(s);
        if (txt) {
          // Die Parametermenge kann sehr lang werden (Hunderte Klassen in der
          // Gleichheitstheorie). Ungekuerzt bestimmt sie die Breite der viewBox,
          // der Automat schrumpft daneben zur Linie. Also gekuerzt und auf
          // mehrere Zeilen: die vollstaendige Menge steht in der Tabelle unter
          // dem Graphen, hier genuegt der Anfang als Wiedererkennung.
          setLabelLines(g, clampSet(txt), R + 16);
        }
      }
      if (opts.tokens && opts.tokens.has(s)) {
        drawTokens(g, opts.tokens.get(s));
      }
      if (opts.onDrag) {
        g.style.cursor = 'grab';
        makeDraggable(g, svg, s, px, opts);
      }
      gStates.appendChild(g);
    }

    // Die viewBox nach dem tatsächlichen Inhalt richten: Labels und Schleifen sind
    // breiter als das Raster und würden sonst am Rand abgeschnitten.
    fitViewBox(svg, W, Hh);
    return { px: px, width: W, height: Hh };
  }

  // Zoomgrenzen. Ohne sie skaliert ein SVG mit width:100% jeden Inhalt auf die
  // Spaltenbreite: ein Automat mit zwei Zustaenden wird riesig, einer mit
  // fuenfzehn unlesbar klein. Der Zoom ist Anzeigebreite geteilt durch
  // viewBox-Breite und wird auf dieses Fenster geklemmt; was dann nicht mehr
  // hineinpasst, bekommt in .graph-wrap Scrollbalken.
  const ZOOM_MIN = 0.55;
  const ZOOM_MAX = 1.15;

  function fitViewBox(svg, W, Hh) {
    let bb = null;
    try { bb = svg.getBBox(); } catch (e) { /* unsichtbares SVG */ }
    const m = 8;
    let vw = W, vh = Hh, vx = 0, vy = 0;
    if (bb && bb.width && bb.height) {
      vx = bb.x - m; vy = bb.y - m;
      vw = bb.width + 2 * m; vh = bb.height + 2 * m;
    }
    svg.setAttribute('viewBox', vx + ' ' + vy + ' ' + vw + ' ' + vh);
    clampZoom(svg, vw, vh);
  }

  // Die verfuegbare Breite ist die des Elternelements, nicht die des SVG selbst:
  // dessen Breite setzen wir hier gerade. Ohne Layout (Node-Test, verstecktes
  // Panel) ist clientWidth 0, dann bleiben die Attribute weg und das SVG
  // verhaelt sich wie vorher.
  function clampZoom(svg, vw, vh) {
    const parent = svg.parentNode;
    const avail = parent && parent.clientWidth ? parent.clientWidth : 0;
    if (!avail || !vw) { svg.removeAttribute('width'); svg.removeAttribute('height'); return; }
    let zoom = avail / vw;
    if (zoom < ZOOM_MIN) zoom = ZOOM_MIN;
    if (zoom > ZOOM_MAX) zoom = ZOOM_MAX;
    svg.setAttribute('width', Math.round(vw * zoom));
    svg.setAttribute('height', Math.round(vh * zoom));
  }

  // Kuerzt eine Parametermenge auf hoechstens SET_MAX Zeichen und bricht sie in
  // Zeilen von hoechstens SET_COLS Zeichen um. Geschnitten wird an Trennern
  // (Semikolon, Komma) statt mitten in einer Belegung, damit das Ergebnis lesbar
  // bleibt statt nur kurz zu sein.
  const SET_MAX = 76;
  const SET_COLS = 30;

  function clampSet(txt) {
    let s = String(txt);
    if (s.length > SET_MAX) {
      let cut = -1;
      for (const sep of ['; ', ', ']) {
        const i = s.lastIndexOf(sep, SET_MAX);
        if (i > cut) cut = i;
      }
      s = (cut > 12 ? s.slice(0, cut) : s.slice(0, SET_MAX)) + ' …';
    }
    const lines = [];
    let rest = s;
    while (rest.length > SET_COLS) {
      let cut = rest.lastIndexOf(' ', SET_COLS);
      if (cut < 10) cut = SET_COLS;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut).replace(/^\s+/, '');
    }
    if (rest) lines.push(rest);
    return lines;
  }

  function setLabelLines(g, lines, y0) {
    const lineH = 12;
    lines.forEach(function (ln, i) {
      g.appendChild(el('text', {
        class: 'state-set', 'text-anchor': 'middle', y: y0 + i * lineH
      }, ln));
    });
  }

  function drawTokens(g, tok) {
    const items = [];
    for (const a of (tok.round || [])) items.push({ kind: 'round', letter: a });
    if (tok.square) items.push({ kind: 'square' });
    const n = items.length;
    if (!n) return;
    const step = 18;
    const y = R + 20;
    const x0 = -((n - 1) * step) / 2;
    items.forEach(function (it, i) {
      const x = x0 + i * step;
      const tg = el('g', { class: 'token token-' + it.kind, transform: 'translate(' + x + ',' + y + ')' });
      if (it.kind === 'round') {
        tg.appendChild(el('circle', { r: 8 }));
        tg.appendChild(el('text', { 'text-anchor': 'middle', dy: '0.35em', class: 'token-letter' }, it.letter));
      } else {
        tg.appendChild(el('rect', { x: -8, y: -8, width: 16, height: 16, rx: 2 }));
      }
      g.appendChild(tg);
    });
  }

  // Selbstschleife oben, unten, links oder rechts, je nachdem wo Platz ist.
  // dir: {dx, dy} zeigt vom Zustand weg in die Richtung der Schleife.
  function drawSelfLoop(gE, gL, p, label, dir) {
    const dx = dir.dx, dy = dir.dy;
    // Punkte auf dem Kreisrand, leicht seitlich der Schleifenachse
    const px = -dy, py = dx;                       // senkrecht zur Schleifenrichtung
    const a = { x: p.x + px * 14 + dx * (R - 8), y: p.y + py * 14 + dy * (R - 8) };
    const b = { x: p.x - px * 14 + dx * (R - 8), y: p.y - py * 14 + dy * (R - 8) };
    const c1 = { x: p.x + px * 44 + dx * (R + 46), y: p.y + py * 44 + dy * (R + 46) };
    const c2 = { x: p.x - px * 44 + dx * (R + 46), y: p.y - py * 44 + dy * (R + 46) };
    const d = 'M ' + a.x + ' ' + a.y + ' C ' + c1.x + ' ' + c1.y + ', ' + c2.x + ' ' + c2.y + ', ' + b.x + ' ' + b.y;
    gE.appendChild(el('path', { d: d, class: 'edge', 'marker-end': 'url(#arrow)' }));
    placeLabel(gL, p.x + dx * (R + 36), p.y + dy * (R + 36), label);
  }

  // Richtung der Selbstschleife: oben, solange dort nichts im Weg ist. Sonst die
  // erste Richtung in fester Reihenfolge, deren Umgebung frei bleibt. Die Reihenfolge
  // sorgt dafür, dass sich das Bild bei kleinen Layoutänderungen nicht umsortiert.
  function loopDirection(state, px, neighbours) {
    const cands = [
      { dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }
    ];
    const p = px[state];
    const CLEAR = 62; // Radius, den die Schleife für sich braucht
    for (const c of cands) {
      const t = { x: p.x + c.dx * (R + 40), y: p.y + c.dy * (R + 40) };
      let free = true;
      for (const q of neighbours) {
        if (Math.hypot(q.x - t.x, q.y - t.y) < CLEAR) { free = false; break; }
      }
      if (free) return c;
    }
    return cands[0];
  }

  function drawEdge(gE, gL, a, b, label, curved, opts) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    // Bogen: senkrechter Versatz, damit Gegenkanten sich nicht überdecken.
    const bend = curved ? 26 : 0;
    const mx = (a.x + b.x) / 2 - uy * bend;
    const my = (a.y + b.y) / 2 + ux * bend;
    // Start und Ende auf dem Kreisrand
    const s = pointToward(a, { x: mx, y: my }, R + 2);
    const e = pointToward(b, { x: mx, y: my }, R + 6);
    const d = 'M ' + s.x + ' ' + s.y + ' Q ' + mx + ' ' + my + ' ' + e.x + ' ' + e.y;
    gE.appendChild(el('path', { d: d, class: 'edge', 'marker-end': 'url(#arrow)' }));
    // Label am Scheitel der Quadratik, senkrecht zur Kante weggeschoben, damit es
    // weder auf der Linie noch auf einer Selbstschleife des Zielzustands liegt.
    const lx = 0.25 * s.x + 0.5 * mx + 0.25 * e.x;
    const ly = 0.25 * s.y + 0.5 * my + 0.25 * e.y;
    const off = 13;
    // Bei überwiegend senkrechten Kanten nach rechts, sonst nach oben.
    const vertical = Math.abs(uy) > Math.abs(ux);
    placeLabel(gL, lx + (vertical ? off : 0), ly + (vertical ? 0 : -off), label);
  }

  function pointToward(c, t, r) {
    const dx = t.x - c.x, dy = t.y - c.y;
    const l = Math.hypot(dx, dy) || 1;
    return { x: c.x + (dx / l) * r, y: c.y + (dy / l) * r };
  }

  // Label mit weißer Hinterlegung, mehrzeilig.
  function placeLabel(g, x, y, text) {
    const lines = String(text).split('\n');
    const g2 = el('g', { class: 'edge-label' });
    const lineH = 15;
    const y0 = y - ((lines.length - 1) * lineH) / 2;
    const rect = el('rect', { class: 'label-bg', rx: 3 });
    g2.appendChild(rect);
    const texts = [];
    lines.forEach(function (ln, i) {
      const t = el('text', { 'text-anchor': 'middle', x: x, y: y0 + i * lineH, dy: '0.35em' }, ln);
      g2.appendChild(t);
      texts.push(t);
    });
    g.appendChild(g2);
    // Hintergrund erst nach dem Einfügen messen
    try {
      const bb = g2.getBBox();
      rect.setAttribute('x', bb.x - 3);
      rect.setAttribute('y', bb.y - 2);
      rect.setAttribute('width', bb.width + 6);
      rect.setAttribute('height', bb.height + 4);
    } catch (e) { /* getBBox schlägt fehl, wenn das SVG nicht sichtbar ist */ }
  }

  function makeDraggable(g, svg, state, px, opts) {
    let dragging = false, startPt = null, orig = null;
    g.addEventListener('pointerdown', function (ev) {
      dragging = true;
      g.setPointerCapture(ev.pointerId);
      startPt = svgPoint(svg, ev);
      orig = { x: px[state].x, y: px[state].y };
      g.style.cursor = 'grabbing';
      ev.preventDefault();
    });
    g.addEventListener('pointermove', function (ev) {
      if (!dragging) return;
      const p = svgPoint(svg, ev);
      const nx = orig.x + (p.x - startPt.x);
      const ny = orig.y + (p.y - startPt.y);
      g.setAttribute('transform', 'translate(' + nx + ',' + ny + ')');
      px[state] = { x: nx, y: ny };
    });
    g.addEventListener('pointerup', function (ev) {
      if (!dragging) return;
      dragging = false;
      g.style.cursor = 'grab';
      const gx = Math.round(((px[state].x - PAD) / GRID_X) * 2) / 2;
      const gy = Math.round(((px[state].y - PAD) / GRID_Y) * 2) / 2;
      // Auf das halbe Raster einrasten, bevor der Aufrufer die pos-Zeile
      // schreibt: sonst steht der Kreis an der Pixelstelle, an der die Maus
      // losgelassen wurde, waehrend die DSL schon den gerundeten Wert hat, und
      // beim naechsten Zeichnen springt er sichtbar dorthin.
      px[state] = { x: PAD + gx * GRID_X, y: PAD + gy * GRID_Y };
      g.setAttribute('transform', 'translate(' + px[state].x + ',' + px[state].y + ')');
      opts.onDrag(state, gx, gy);
    });
  }

  function svgPoint(svg, ev) {
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX; pt.y = ev.clientY;
    const m = svg.getScreenCTM();
    return m ? pt.matrixTransform(m.inverse()) : { x: ev.clientX, y: ev.clientY };
  }

  // fitViewBox gehoert mit nach draussen, damit der Positionsgraph dieselbe
  // Zoomklemmung benutzt und nicht eine zweite mit anderen Grenzen bekommt.
  root.Draw = {
    render: render, autoLayout: autoLayout, layoutOf: layoutOf, el: el,
    fitViewBox: fitViewBox, R: R, GRID_X: GRID_X, GRID_Y: GRID_Y, PAD: PAD
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
