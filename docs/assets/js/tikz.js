// tikz.js — Export eines Automaten als tikz-Bild im Stil der Paper (tikz automata).
// Das Layout kommt aus dem Browser, also aus den pos-Zeilen bzw. dem Auto-Layout.
(function (root) {
  'use strict';

  const Au = root.Automaton;
  const Fo = root.Formula;

  // Unicode aus dem Pretty-Printer in LaTeX-Mathematik uebersetzen.
  const MATH = [
    ['≤', '\\leq'], ['≥', '\\geq'], ['≠', '\\neq'], ['∧', '\\land'], ['∨', '\\lor'],
    ['¬', '\\lnot'], ['⊤', '\\top'], ['⊥', '\\bot'], ['·', '\\cdot'], ['−', '-'],
    ['π', '\\pi'],
    ['₀', '_0'], ['₁', '_1'], ['₂', '_2'], ['₃', '_3'], ['₄', '_4'],
    ['₅', '_5'], ['₆', '_6'], ['₇', '_7'], ['₈', '_8'], ['₉', '_9']
  ];

  function toMath(s) {
    let out = String(s);
    for (const [u, l] of MATH) out = out.split(u).join(l);
    return out;
  }

  // Zustandsnamen: q0 → q_0, (q0,r1) → (q_0,r_1)
  function stateMath(name) {
    return toMath(Au.displayState(name));
  }

  // Ein eindeutiger, LaTeX-tauglicher Knotenname ohne Sonderzeichen.
  function nodeId(name) {
    return 'n' + String(name).replace(/[^A-Za-z0-9]/g, '_');
  }

  function classOf(A, q) {
    const hasC = A.complement.length > 0;
    if (A.accepting.indexOf(q) >= 0) return 'accepting,fill=red!30';
    if (A.complement.indexOf(q) >= 0) return 'fill=blue!30';
    return hasC ? 'dashed' : '';
  }

  // Richtung einer Selbstschleife und Kantenbiegung aus den Koordinaten ableiten.
  function loopDir(pos, q, all) {
    // Nach oben, es sei denn, direkt darueber liegt ein anderer Zustand.
    const p = pos[q];
    for (const r of Object.keys(pos)) {
      if (r === q) continue;
      if (Math.abs(pos[r].x - p.x) < 0.3 && pos[r].y < p.y) return 'below';
    }
    return 'above';
  }

  function exportTikz(A, opts) {
    opts = opts || {};
    const scale = opts.scale === undefined ? 2.2 : opts.scale;
    const pos = Au.layoutOf(A);
    const lines = [];
    lines.push('% ' + (opts.title || 'Automat') + ', erzeugt von infinite-alphabets');
    lines.push('\\begin{tikzpicture}[->, >=stealth\', auto, semithick, node distance=2.5cm]');
    lines.push('\\tikzstyle{every state}=[fill=white,draw=black,thick,text=black,scale=0.8]');

    for (const q of A.states) {
      const opt = ['state'];
      if (q === A.initial) opt.push('initial');
      const c = classOf(A, q);
      if (c) opt.push(c);
      // y nach oben in tikz, nach unten im SVG.
      const x = (pos[q].x * scale).toFixed(2);
      const y = (-pos[q].y * scale).toFixed(2);
      lines.push('\\node[' + opt.join(',') + '] (' + nodeId(q) + ') at (' + x + ',' + y + ') {$' + stateMath(q) + '$};');
    }

    lines.push('\\path');
    const groups = new Map();
    for (const t of A.transitions) {
      const k = t.from + ' ' + t.to;
      if (!groups.has(k)) groups.set(k, { from: t.from, to: t.to, asts: [] });
      groups.get(k).asts.push(t.ast);
    }
    const pairs = new Set(Array.from(groups.values()).map(function (g) { return g.from + ' ' + g.to; }));

    // Nach Quellzustand buendeln, damit das Ergebnis wie im Paper aussieht.
    const byFrom = new Map();
    for (const g of groups.values()) {
      if (!byFrom.has(g.from)) byFrom.set(g.from, []);
      byFrom.get(g.from).push(g);
    }
    for (const from of A.states) {
      const gs = byFrom.get(from);
      if (!gs) continue;
      lines.push('(' + nodeId(from) + ')');
      for (const g of gs) {
        const label = g.asts.map(function (a) { return '$' + toMath(Au.displayFormula(A, a)) + '$'; }).join(', ');
        if (g.from === g.to) {
          lines.push('    edge[loop ' + loopDir(pos, g.from) + '] node{' + label + '} ()');
        } else {
          const back = pairs.has(g.to + ' ' + g.from);
          lines.push('    edge' + (back ? '[bend left]' : '') + ' node{' + label + '} (' + nodeId(g.to) + ')');
        }
      }
    }
    lines.push(';');
    lines.push('\\end{tikzpicture}');
    return lines.join('\n');
  }

  // Der Erreichbarkeitsgraph der Positionen. Das Layout kommt aus PosGraph.layout,
  // also aus derselben Rechnung wie das Bild auf dem Schirm; hier wird nur in
  // tikz-Koordinaten umgerechnet (Pixel zu Zentimeter, y nach oben).
  const POS_MATH = [['●', '\\bullet'], ['■', '\\blacksquare'], [':', '{:}'], [' ', '\\;']];

  function posMath(label) {
    let s = toMath(label);
    for (const [u, l] of POS_MATH) s = s.split(u).join(l);
    return s;
  }

  function exportPositionGraph(res, L, opts) {
    opts = opts || {};
    const px = opts.unit === undefined ? 62 : opts.unit; // Pixel je Zentimeter
    const lines = [];
    lines.push('% ' + (opts.title || 'Positionsgraph') + ', erzeugt von infinite-alphabets');
    lines.push('\\begin{tikzpicture}[->, >=stealth\', auto, semithick]');
    lines.push('\\tikzstyle{pos}=[draw=black,thick,rounded corners=2pt,inner sep=3pt,fill=white]');

    for (const it of L.nodes) {
      const acc = root.Positions.isAccepting(res.info, it.node.p);
      const x = (it.x / px).toFixed(2);
      const y = (-it.y / px).toFixed(2);
      lines.push('\\node[pos' + (acc ? '' : ',double,fill=red!20') + '] (' + nodeId(it.key) +
        ') at (' + x + ',' + y + ') {$' + posMath(it.label) + '$};');
    }

    lines.push('\\path');
    for (const e of L.edges) {
      const label = e.vias.map(function (v) { return toMath(root.PosGraph.viaLabel(v)); }).join(', ');
      if (e.from === e.to) {
        lines.push('(' + nodeId(e.from) + ') edge[loop right] node{$' + label + '$} ()');
      } else {
        lines.push('(' + nodeId(e.from) + ') edge node{$' + label + '$} (' + nodeId(e.to) + ')');
      }
    }
    lines.push(';');
    lines.push('\\end{tikzpicture}');
    return lines.join('\n');
  }

  root.Tikz = {
    exportTikz: exportTikz, exportPositionGraph: exportPositionGraph,
    toMath: toMath, posMath: posMath, nodeId: nodeId
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
