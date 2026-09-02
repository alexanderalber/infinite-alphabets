// test-basics.js — Brüche, Intervallmengen, Formelparser.
'use strict';
const H = require('./harness');
H.loadAll();

const F = globalThis.Fraction;
const I = globalThis.Intervals;
const Fo = globalThis.Formula;

H.group('Fraction');
H.eq('kürzen', new F(6n, 4n).toString(), '3/2');
H.eq('negativer Nenner', new F(1n, -2n).toString(), '-1/2');
H.eq('ganzzahlig', new F(-6n, 3n).toString(), '-2');
H.eq('fromString dezimal', F.fromString('1.25').toString(), '5/4');
H.eq('fromString bruch', F.fromString('2/7').toString(), '2/7');
H.eq('fromString negativ', F.fromString('-3').toString(), '-3');
H.eq('fromString unicode-minus', F.fromString('−1.5').toString(), '-3/2');
H.eq('add', F.fromString('1/3').add(F.fromString('1/6')).toString(), '1/2');
H.eq('sub', F.fromString('1/3').sub(F.fromString('1/2')).toString(), '-1/6');
H.eq('mul', F.fromString('2/3').mul(F.fromString('3/4')).toString(), '1/2');
H.eq('div', F.fromString('1/2').div(F.fromString('1/4')).toString(), '2');
H.eq('cmp', String(F.fromString('1/3').cmp(F.fromString('1/2'))), '-1');
H.eq('floor positiv', String(F.fromString('7/2').floor()), '3');
H.eq('floor negativ', String(F.fromString('-7/2').floor()), '-4');
H.eq('decimal 1/4', F.fromString('1/4').toDecimalString(), '0.25');
H.eq('decimal 1/3', String(F.fromString('1/3').toDecimalString()), 'null');

H.group('Intervals');
const f = function (s) { return F.fromString(s); };
H.eq('(−∞,3) ∪ [3,∞) = ℝ',
  I.key(I.union([I.iv(null, false, f('3'), false)], [I.iv(f('3'), true, null, false)])),
  I.key(I.full()));
H.eq('[1,2] ∪ (2,3] = [1,3]',
  I.key(I.union([I.iv(f('1'), true, f('2'), true)], [I.iv(f('2'), false, f('3'), true)])),
  '[1,3]');
H.eq('[1,2) ∪ (2,3] bleibt zweiteilig',
  I.key(I.union([I.iv(f('1'), true, f('2'), false)], [I.iv(f('2'), false, f('3'), true)])),
  '[1,2)|(2,3]');
H.eq('complement([1,2) ∪ {3})',
  I.key(I.complement(I.union([I.iv(f('1'), true, f('2'), false)], I.point(f('3'))))),
  '(-inf,1)|[2,3)|(3,+inf)');
H.eq('complement(ℝ) = ∅', I.key(I.complement(I.full())), '');
H.eq('complement(∅) = ℝ', I.key(I.complement(I.EMPTY)), I.key(I.full()));
H.eq('Schnitt disjunkt leer',
  String(I.isEmpty(I.intersect([I.iv(f('0'), true, f('1'), false)], [I.iv(f('1'), true, f('2'), true)]))),
  'true');
H.eq('Punktschnitt',
  I.key(I.intersect([I.iv(f('0'), true, f('1'), true)], [I.iv(f('1'), true, f('2'), true)])),
  '[1,1]');
H.eq('diff', I.key(I.diff(I.full(), I.point(f('2')))), '(-inf,2)|(2,+inf)');
H.eq('format Punkt', I.format(I.point(f('3')), 'y'), 'y = 3');
H.eq('format ungleich', I.format(I.diff(I.full(), I.point(f('2'))), 'y'), 'y ≠ 2');
H.eq('format Intervall', I.format([I.iv(f('3'), false, f('4'), true)], 'y'), '3 < y ≤ 4');
H.eq('format ℝ', I.format(I.full(), 'y'), 'y beliebig');
H.eq('format ∅', I.format(I.EMPTY, 'y'), '∅');
H.eq('sample in (1,2)', I.sample([I.iv(f('1'), false, f('2'), false)]).toString(), '3/2');
H.eq('sample in [2,5]', I.sample([I.iv(f('2'), true, f('5'), true)]).toString(), '2');
H.eq('sample ℝ', I.sample(I.full()).toString(), '0');
H.eq('sample Punkt', I.sample(I.point(f('7/3'))).toString(), '7/3');

H.group('Formula-Parser');
function pp(src, theory) {
  return Fo.fmt(Fo.parse(src, { theory: theory || 'reals' }).ast);
}
H.eq('einfach', pp('x<y'), 'x < y');
H.eq('ascii-relationen', pp('x != y'), 'x ≠ y');
H.eq('le', pp('x <= y'), 'x ≤ y');
H.eq('kette', pp('y <= x <= y+1'), 'y ≤ x ≤ y + 1');
H.eq('and/or ascii', pp('x < y or x > y+1'), 'x < y ∨ x > y + 1');
H.eq('unicode', pp('x ≤ y ∧ ¬(x = y)'), 'x ≤ y ∧ ¬(x = y)');
H.eq('true', pp('true'), '⊤');
H.eq('parameter index', pp('x = y2'), 'x = y₂');
H.eq('koeffizient', pp('2*x - 1/2 = y'), '2·x − 1/2 = y');
H.eq('negation vor kette', pp('not y <= x <= y+1'), '¬(y ≤ x ≤ y + 1)');
H.eq('minus y', pp('x = -y'), 'x = −y');
H.eq('klammern', pp('(x < y or x = y) and x != 3'), '(x < y ∨ x = y) ∧ x ≠ 3');
H.eq('gleichheit konstante', pp('x = a or x = b', 'equality'), 'x = a ∨ x = b');
H.eq('roundtrip ascii', Fo.fmt(Fo.parse('y <= x <= y+1').ast, { ascii: true }), 'y <= x <= y + 1');

let err = '';
try { pp('x < y', 'equality'); } catch (e) { err = 'ja'; }
H.eq('equality verbietet <', err, 'ja');
err = '';
try { pp('y1 = y2', 'equality'); } catch (e) { err = 'ja'; }
H.eq('equality verbietet param=param', err, 'ja');

H.eq('collectParams', String(Fo.collectParams(Fo.parse('x = y1 or x < y3').ast)), '1,3');
H.eq('collectConstants', String(Fo.collectConstants(Fo.parse('x = a or x = b', { theory: 'equality' }).ast)), 'a,b');

process.exit(H.report());
