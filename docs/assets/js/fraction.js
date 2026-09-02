// fraction.js — exakte rationale Zahlen auf BigInt-Basis.
// Kein Modulsystem: hängt sich an globalThis, damit es über file:// per <script> lädt.
(function (root) {
  'use strict';

  function bigAbs(a) { return a < 0n ? -a : a; }

  function gcd(a, b) {
    a = bigAbs(a); b = bigAbs(b);
    while (b) { const t = a % b; a = b; b = t; }
    return a;
  }

  // Invariante: den > 0, gcd(num, den) = 1.
  function Fraction(num, den) {
    if (!(this instanceof Fraction)) return new Fraction(num, den);
    let n = BigInt(num);
    let d = den === undefined ? 1n : BigInt(den);
    if (d === 0n) throw new Error('Fraction: Nenner 0');
    if (d < 0n) { n = -n; d = -d; }
    const g = gcd(n, d) || 1n;
    this.num = n / g;
    this.den = d / g;
  }

  Fraction.prototype.add = function (o) { return new Fraction(this.num * o.den + o.num * this.den, this.den * o.den); };
  Fraction.prototype.sub = function (o) { return new Fraction(this.num * o.den - o.num * this.den, this.den * o.den); };
  Fraction.prototype.mul = function (o) { return new Fraction(this.num * o.num, this.den * o.den); };
  Fraction.prototype.div = function (o) {
    if (o.num === 0n) throw new Error('Fraction: Division durch 0');
    return new Fraction(this.num * o.den, this.den * o.num);
  };
  Fraction.prototype.neg = function () { return new Fraction(-this.num, this.den); };
  Fraction.prototype.isZero = function () { return this.num === 0n; };
  Fraction.prototype.sign = function () { return this.num === 0n ? 0 : (this.num < 0n ? -1 : 1); };
  Fraction.prototype.cmp = function (o) {
    const l = this.num * o.den, r = o.num * this.den;
    return l < r ? -1 : (l > r ? 1 : 0);
  };
  Fraction.prototype.eq = function (o) { return this.cmp(o) === 0; };
  Fraction.prototype.lt = function (o) { return this.cmp(o) < 0; };
  Fraction.prototype.le = function (o) { return this.cmp(o) <= 0; };
  Fraction.prototype.gt = function (o) { return this.cmp(o) > 0; };
  Fraction.prototype.ge = function (o) { return this.cmp(o) >= 0; };
  Fraction.prototype.abs = function () { return this.num < 0n ? this.neg() : this; };
  Fraction.prototype.floor = function () {
    let q = this.num / this.den;
    if (this.num < 0n && q * this.den !== this.num) q -= 1n;
    return q;
  };
  Fraction.prototype.toNumber = function () { return Number(this.num) / Number(this.den); };

  Fraction.prototype.toString = function () {
    return this.den === 1n ? String(this.num) : String(this.num) + '/' + String(this.den);
  };

  // Dezimaldarstellung, falls der Nenner nur 2er- und 5er-Faktoren hat. Sonst null.
  Fraction.prototype.toDecimalString = function () {
    let d = this.den;
    while (d % 2n === 0n) d /= 2n;
    while (d % 5n === 0n) d /= 5n;
    if (d !== 1n) return null;
    if (this.den === 1n) return String(this.num);
    // Anzahl Nachkommastellen bestimmen: 10^k / den muss ganzzahlig sein.
    let k = 0, p = 1n;
    while (p % this.den !== 0n) { p *= 10n; k++; }
    const scaled = bigAbs(this.num) * (p / this.den);
    let s = String(scaled).padStart(k + 1, '0');
    s = s.slice(0, s.length - k) + '.' + s.slice(s.length - k);
    s = s.replace(/0+$/, '').replace(/\.$/, '');
    return (this.num < 0n ? '-' : '') + s;
  };

  // Akzeptiert "3", "-3", "1.25", "2/7", "-1/2", ".5"
  Fraction.fromString = function (s) {
    const t = String(s).trim().replace(/−/g, '-'); // Unicode-Minus
    let m = /^([+-]?\d+)\s*\/\s*([+-]?\d+)$/.exec(t);
    if (m) return new Fraction(BigInt(m[1]), BigInt(m[2]));
    m = /^([+-]?)(\d*)(?:\.(\d+))?$/.exec(t);
    if (m && (m[2] || m[3])) {
      const sign = m[1] === '-' ? -1n : 1n;
      const intPart = m[2] ? BigInt(m[2]) : 0n;
      const frac = m[3] || '';
      const den = 10n ** BigInt(frac.length);
      const num = intPart * den + (frac ? BigInt(frac) : 0n);
      return new Fraction(sign * num, den);
    }
    throw new Error('Keine Zahl: ' + s);
  };

  Fraction.of = function (n, d) { return new Fraction(n, d === undefined ? 1n : d); };
  Fraction.ZERO = new Fraction(0n, 1n);
  Fraction.ONE = new Fraction(1n, 1n);

  root.Fraction = Fraction;
})(typeof globalThis !== 'undefined' ? globalThis : this);
