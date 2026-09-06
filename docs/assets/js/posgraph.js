// posgraph.js — Zeichnung des Erreichbarkeitsgraphen der Positionen (Plan 5.4).
//
// Ebenen nach Wortlaenge, Knoten in der kompakten Tokenschreibweise, Kanten
// beschriftet mit der angewandten Abbildung π₀ beziehungsweise π_i. Die Daten
// kommen unveraendert aus Positions.explore(); hier passiert nur Geometrie.
(function (root) {
  'use strict';

  const P = root.Positions;
  const D = root.Draw;

  const LEVEL_Y = 78;    // Abstand zweier Ebenen
  const GAP_X = 24;      // Abstand zweier Knoten derselben Ebene
  const BOX_H = 26;
  const CHAR_W = 7.6;    // Schaetzbreite eines Zeichens, reicht fuer die Kaesten
  const PAD_X = 12;
  const MARGIN = 30;

  // Ab hier wird nicht mehr gezeichnet: der Plan nennt etwa 60 Knoten als Grenze,
  // darueber ist die Tabelle das ehrlichere Bild.
  const MAX_NODES = 60;

  function labelOf(info, p) { return P.formatPosition(info, p); }

  function boxWidth(text) { return Math.max(46, text.length * CHAR_W + 2 * PAD_X); }

  // Layout ohne DOM: auch fuer den TikZ-Export und den Node-Test brauchbar.
  function layout(res) {
    const levels = P.levels(res);
    const nodes = new Map();   // key → {key, node, label, x, y, w}
    let width = 0;
    levels.forEach(function (level, depth) {
      const items = level.map(function (nd) {
        const label = labelOf(res.info, nd.p);
        return { key: P.key(nd.p), node: nd, label: label, w: boxWidth(label) };
      });
      let total = 0;
      for (const it of items) total += it.w;
      total += GAP_X * Math.max(0, items.length - 1);
      let x = -total / 2;
      for (const it of items) {
        it.x = x + it.w / 2;
        it.y = MARGIN + depth * LEVEL_Y;
        x += it.w + GAP_X;
        nodes.set(it.key, it);
      }
      width = Math.max(width, total);
    });

    // Mehrfachkanten zwischen demselben Paar zu einem Label zusammenfassen.
    const edges = new Map();
    for (const e of res.edges) {
      if (!nodes.has(e.from) || !nodes.has(e.to)) continue;
      const k = e.from + '→' + e.to;
      if (!edges.has(k)) edges.set(k, { from: e.from, to: e.to, vias: [] });
      const vias = edges.get(k).vias;
      if (vias.indexOf(e.via) < 0) vias.push(e.via);
    }

    return {
      nodes: Array.from(nodes.values()), byKey: nodes,
      edges: Array.from(edges.values()),
      width: width + 2 * MARGIN,
      height: MARGIN * 2 + Math.max(0, levels.length - 1) * LEVEL_Y + BOX_H
    };
  }

  function viaLabel(via) {
    return 'π' + (via === '0' ? '₀' : sub(parseInt(via, 10)));
  }

  const SUB = '₀₁₂₃₄₅₆₇₈₉';
  function sub(n) {
    return String(n).split('').map(function (c) { return SUB[+c] || c; }).join('');
  }

  // opts: {onPick: fn(node), highlight: Set von Positionsschluesseln}
  function render(svg, res, opts) {
    opts = opts || {};
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    if (!res || !res.ok) return null;
    if (res.nodes.length > (opts.max || MAX_NODES)) return null;

    const el = D.el;
    const L = layout(res);
    const hl = opts.highlight || new Set();

    const defs = el('defs');
    const marker = el('marker', {
      id: 'pg-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5,
      markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse'
    });
    marker.appendChild(el('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'var(--edge)' }));
    defs.appendChild(marker);
    svg.appendChild(defs);

    const gEdges = el('g', { class: 'pg-edges' });
    const gLabels = el('g', { class: 'pg-edge-labels' });
    const gNodes = el('g', { class: 'pg-nodes' });
    svg.appendChild(gEdges); svg.appendChild(gLabels); svg.appendChild(gNodes);

    for (const e of L.edges) {
      const a = L.byKey.get(e.from), b = L.byKey.get(e.to);
      const hot = hl.has(e.from) && hl.has(e.to);
      drawEdge(el, gEdges, gLabels, a, b, e.vias.map(viaLabel).join(', '), hot);
    }

    for (const it of L.nodes) {
      const acc = P.isAccepting(res.info, it.node.p);
      // Zwei Merkmale, nicht nur Farbe: im grauen Skin faellt die Fuellung weg.
      const cls = 'pg-node' + (acc ? '' : ' rej') + (hl.has(it.key) ? ' hl' : '') +
        (opts.onPick ? ' is-clickable' : '');
      const g = el('g', { class: cls, transform: 'translate(' + it.x + ',' + it.y + ')' });
      g.appendChild(el('rect', {
        x: -it.w / 2, y: -BOX_H / 2, width: it.w, height: BOX_H, rx: 4, class: 'pg-box'
      }));
      if (!acc) {
        g.appendChild(el('rect', {
          x: -it.w / 2 + 3, y: -BOX_H / 2 + 3, width: it.w - 6, height: BOX_H - 6,
          rx: 2, class: 'pg-box-inner'
        }));
      }
      g.appendChild(el('text', { 'text-anchor': 'middle', dy: '0.35em', class: 'pg-label' }, it.label));
      const title = el('title');
      title.textContent = (it.node.word.length ? it.node.word.join('') : 'ε');
      g.appendChild(title);
      if (opts.onPick) {
        g.addEventListener('click', function () { opts.onPick(it.node); });
      }
      gNodes.appendChild(g);
    }

    D.fitViewBox(svg, L.width, L.height);
    return L;
  }

  function drawEdge(el, gEdges, gLabels, a, b, label, hot) {
    const cls = 'pg-edge' + (hot ? ' hot' : '');
    if (a === b) {
      // Selbstschleife rechts neben dem Kasten.
      const x = a.x + a.w / 2, y = a.y;
      const d = 'M ' + x + ' ' + (y - 8) + ' C ' + (x + 34) + ' ' + (y - 26) + ' ' +
        (x + 34) + ' ' + (y + 26) + ' ' + x + ' ' + (y + 8);
      gEdges.appendChild(el('path', { d: d, class: cls, 'marker-end': 'url(#pg-arrow)' }));
      gLabels.appendChild(el('text', { x: x + 38, y: y + 4, class: 'pg-edge-label' }, label));
      return;
    }
    const down = b.y > a.y;
    const x1 = a.x, y1 = a.y + (down ? BOX_H / 2 : -BOX_H / 2);
    const x2 = b.x, y2 = b.y + (down ? -BOX_H / 2 - 2 : BOX_H / 2 + 2);
    // Rueck- und Querkanten biegen, damit sie nicht durch die Kaesten laufen.
    const bend = (b.y === a.y || !down) ? 26 : 0;
    const mx = (x1 + x2) / 2 + bend, my = (y1 + y2) / 2;
    const d = bend
      ? 'M ' + x1 + ' ' + y1 + ' Q ' + (mx + bend) + ' ' + my + ' ' + x2 + ' ' + y2
      : 'M ' + x1 + ' ' + y1 + ' L ' + x2 + ' ' + y2;
    gEdges.appendChild(el('path', { d: d, class: cls, 'marker-end': 'url(#pg-arrow)' }));
    gLabels.appendChild(el('text', {
      x: mx + (bend ? 8 : 6), y: my, class: 'pg-edge-label'
    }, label));
  }

  root.PosGraph = { render: render, layout: layout, viaLabel: viaLabel, MAX_NODES: MAX_NODES, BOX_H: BOX_H };
})(typeof globalThis !== 'undefined' ? globalThis : this);
