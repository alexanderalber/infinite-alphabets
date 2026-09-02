// intervals.js — Mengen reeller Zahlen als endliche Vereinigung von Intervallen mit
// rationalen Endpunkten. Endpunkte: Fraction, oder null für −∞ (lo) bzw. +∞ (hi).
// Ein Intervall ist {lo, loClosed, hi, hiClosed}; unendliche Enden sind immer offen.
// Eine Menge ist eine sortierte Liste disjunkter, sich nicht berührender Intervalle.
(function (root) {
  'use strict';

  // Meldungstexte: root.Msg uebersetzt, fehlt es, bleibt der deutsche Text.
  function M(key, fallback) {
    if (typeof root.Msg === 'function') return root.Msg.apply(null, arguments);
    return fallback;
  }

  const F = root.Fraction;
  const NEG_INF = null;
  const POS_INF = null;

  function iv(lo, loClosed, hi, hiClosed) {
    return {
      lo: lo, loClosed: lo === null ? false : !!loClosed,
      hi: hi, hiClosed: hi === null ? false : !!hiClosed
    };
  }

  // Vergleich zweier unterer Grenzen: -Infinity < alles.
  function cmpLo(a, b) {
    if (a.lo === null && b.lo === null) return a.loClosed === b.loClosed ? 0 : 0;
    if (a.lo === null) return -1;
    if (b.lo === null) return 1;
    const c = a.lo.cmp(b.lo);
    if (c !== 0) return c;
    // gleicher Wert: geschlossen beginnt früher
    if (a.loClosed === b.loClosed) return 0;
    return a.loClosed ? -1 : 1;
  }

  function cmpHi(a, b) {
    if (a.hi === null && b.hi === null) return 0;
    if (a.hi === null) return 1;
    if (b.hi === null) return -1;
    const c = a.hi.cmp(b.hi);
    if (c !== 0) return c;
    if (a.hiClosed === b.hiClosed) return 0;
    return a.hiClosed ? 1 : -1;
  }

  function isValid(i) {
    if (i.lo === null || i.hi === null) return true;
    const c = i.lo.cmp(i.hi);
    if (c < 0) return true;
    if (c > 0) return false;
    return i.loClosed && i.hiClosed; // [p,p] ist der Punkt p
  }

  // Sortieren, leere wegwerfen, überlappende oder berührende verschmelzen.
  // (−∞,3) ∪ [3,∞) = ℝ, [1,2] ∪ (2,3] = [1,3], aber [1,2) ∪ (2,3] bleibt zweiteilig.
  function normalize(list) {
    const xs = list.filter(isValid).slice();
    xs.sort(cmpLo);
    const out = [];
    for (const cur of xs) {
      if (out.length === 0) { out.push(iv(cur.lo, cur.loClosed, cur.hi, cur.hiClosed)); continue; }
      const last = out[out.length - 1];
      if (touchesOrOverlaps(last, cur)) {
        if (cmpHi(cur, last) > 0) { last.hi = cur.hi; last.hiClosed = cur.hiClosed; }
        else if (cur.hi !== null && last.hi !== null && cur.hi.eq(last.hi) && cur.hiClosed) last.hiClosed = true;
      } else {
        out.push(iv(cur.lo, cur.loClosed, cur.hi, cur.hiClosed));
      }
    }
    return out;
  }

  // a beginnt nicht nach b (Sortierung). Berühren heißt: die Lücke zwischen ihnen ist leer.
  function touchesOrOverlaps(a, b) {
    if (a.hi === null) return true;
    if (b.lo === null) return true;
    const c = a.hi.cmp(b.lo);
    if (c > 0) return true;
    if (c < 0) return false;
    return a.hiClosed || b.loClosed; // (…,3) ∪ [3,…) berührt sich, (…,3) ∪ (3,…) nicht
  }

  const EMPTY = [];
  function full() { return [iv(null, false, null, false)]; }
  function point(p) { return [iv(p, true, p, true)]; }
  function isEmpty(s) { return s.length === 0; }
  function isFull(s) { return s.length === 1 && s[0].lo === null && s[0].hi === null; }

  function intersect(a, b) {
    const out = [];
    let i = 0, j = 0;
    while (i < a.length && j < b.length) {
      const x = a[i], y = b[j];
      const lo = cmpLo(x, y) >= 0 ? x : y;
      const hi = cmpHi(x, y) <= 0 ? x : y;
      const cand = iv(lo.lo, lo.loClosed, hi.hi, hi.hiClosed);
      if (isValid(cand)) out.push(cand);
      if (cmpHi(x, y) < 0) i++; else j++;
    }
    return out;
  }

  function complement(s) {
    const out = [];
    let curLo = null, curLoClosed = false;
    for (const i of s) {
      if (i.lo !== null) {
        const cand = iv(curLo, curLoClosed, i.lo, !i.loClosed);
        if (isValid(cand)) out.push(cand);
      }
      if (i.hi === null) return normalize(out);
      curLo = i.hi; curLoClosed = !i.hiClosed;
    }
    const tail = iv(curLo, curLoClosed, null, false);
    if (isValid(tail)) out.push(tail);
    return normalize(out);
  }

  function union(a, b) { return normalize(a.concat(b)); }
  function diff(a, b) { return intersect(a, complement(b)); }

  function equal(a, b) { return key(a) === key(b); }

  function key(s) {
    return s.map(function (i) {
      return (i.loClosed ? '[' : '(') +
        (i.lo === null ? '-inf' : i.lo.toString()) + ',' +
        (i.hi === null ? '+inf' : i.hi.toString()) +
        (i.hiClosed ? ']' : ')');
    }).join('|');
  }

  function contains(s, p) {
    for (const i of s) {
      if (i.lo !== null) {
        const c = i.lo.cmp(p);
        if (c > 0) continue;
        if (c === 0 && !i.loClosed) continue;
      }
      if (i.hi !== null) {
        const c = i.hi.cmp(p);
        if (c < 0) continue;
        if (c === 0 && !i.hiClosed) continue;
      }
      return true;
    }
    return false;
  }

  // Halbebenen und Punkte aus einem normalisierten Atom `REL 0` für die Variable:
  // rel ist einer von '<','<=','=','!=','>=','>' und bezieht sich auf `v rel r`.
  function fromRel(rel, r) {
    switch (rel) {
      case '<': return [iv(null, false, r, false)];
      case '<=': return [iv(null, false, r, true)];
      case '>': return [iv(r, false, null, false)];
      case '>=': return [iv(r, true, null, false)];
      case '=': return point(r);
      case '!=': return complement(point(r));
      default: throw new Error('unbekannte Relation ' + rel);
    }
  }

  // Ein bevorzugt "schöner" Repräsentant: ganzzahlig, sonst halbzahlig, sonst irgendeiner.
  function sample(s) {
    if (isEmpty(s)) return null;
    for (const i of s) {
      if (i.lo !== null && i.hi !== null && i.lo.eq(i.hi)) continue; // Punkte später
      const c = niceInside(i);
      if (c) return c;
    }
    // reine Punkte
    for (const i of s) if (i.lo !== null) return i.lo;
    return F.ZERO;
  }

  function niceInside(i) {
    if (i.lo === null && i.hi === null) return F.ZERO;
    if (i.lo === null) {
      const h = i.hi.floor();
      return new F(i.hiClosed ? h : (new F(h, 1n).eq(i.hi) ? h - 1n : h), 1n);
    }
    if (i.hi === null) {
      const l = i.lo.floor();
      const cand = new F(l + 1n, 1n);
      return (i.loClosed && new F(l, 1n).eq(i.lo)) ? i.lo : cand;
    }
    // beschränkt: Ganzzahl im Inneren suchen, sonst Mittelpunkt
    const lo = i.lo, hi = i.hi;
    let k = lo.floor();
    for (let t = 0; t < 3; t++) {
      const c = new F(k + BigInt(t), 1n);
      if (contains([i], c)) return c;
    }
    const half = new F(1n, 2n);
    const mid = lo.add(hi).mul(half);
    if (contains([i], mid)) return mid;
    if (i.loClosed) return lo;
    if (i.hiClosed) return hi;
    return mid;
  }

  function formatEndpoint(p, neg) {
    if (p === null) return neg ? '−∞' : '+∞';
    const d = p.toDecimalString();
    const s = (d !== null && d.length < p.toString().length - 1) ? d : p.toString();
    return s.replace(/^-/, '−');
  }

  // Lesbare Darstellung mit dem Variablennamen v, z.B. "y = 3", "3 < y ≤ 4", "y ≠ 2".
  function format(s, v) {
    v = v || 'y';
    if (isEmpty(s)) return '∅';
    if (isFull(s)) return v + ' ' + M('msg.anyWord', 'beliebig');
    const c = complement(s);
    if (c.length > 0 && c.every(function (i) { return i.lo !== null && i.hi !== null && i.lo.eq(i.hi); })) {
      const pts = c.map(function (i) { return formatEndpoint(i.lo); });
      return v + ' ≠ ' + (pts.length === 1 ? pts[0] : '{' + pts.join(', ') + '}');
    }
    const parts = s.map(function (i) { return formatInterval(i, v); });
    return parts.join(' ∨ ');
  }

  function formatInterval(i, v) {
    if (i.lo !== null && i.hi !== null && i.lo.eq(i.hi)) return v + ' = ' + formatEndpoint(i.lo);
    if (i.lo === null && i.hi === null) return v + ' ' + M('msg.anyWord', 'beliebig');
    if (i.lo === null) return v + (i.hiClosed ? ' ≤ ' : ' < ') + formatEndpoint(i.hi);
    if (i.hi === null) return v + (i.loClosed ? ' ≥ ' : ' > ') + formatEndpoint(i.lo);
    return formatEndpoint(i.lo) + (i.loClosed ? ' ≤ ' : ' < ') + v + (i.hiClosed ? ' ≤ ' : ' < ') + formatEndpoint(i.hi);
  }

  root.Intervals = {
    iv: iv, normalize: normalize, EMPTY: EMPTY, full: full, point: point,
    isEmpty: isEmpty, isFull: isFull, intersect: intersect, union: union,
    complement: complement, diff: diff, equal: equal, key: key, contains: contains,
    fromRel: fromRel, sample: sample, format: format, formatInterval: formatInterval,
    formatEndpoint: formatEndpoint
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
