// messages.js: Meldungen aus der Engine (Parser, Formeln, Positionen).
//
// Getrennt von strings.js, weil diese Texte aus Modulen kommen, die auch unter
// Node laufen: die Tests laden automaton.js ohne eine Seite drumherum. Deshalb
// ist Deutsch hier der Rueckfall und nicht Englisch, und M() funktioniert auch,
// wenn weder I18n noch diese Tabelle geladen sind (dann kommt der deutsche Text
// aus dem Aufruf selbst).
//
// Aufrufform in der Engine: M('key', arg1, arg2) mit dem deutschen Text als
// Vorlage im Schluessel. Die Engine bleibt damit ohne Abhaengigkeit lauffaehig.
(function (root) {
  'use strict';

  const EN = {
    'msg.theory': 'theory must be "reals" or "equality"',
    'msg.pos': 'pos needs a state, x and y',
    'msg.badState': 'Invalid state name "{0}"',
    'msg.initialOne': 'initial needs exactly one state',
    'msg.noColon': 'line understood neither as a keyword nor as a transition (":" missing)',
    'msg.transHead': 'transition head must be "q -> q\'"',
    'msg.formula': 'Formula: {0}',
    'msg.noStates': 'automaton without states',
    'msg.undeclared': 'state "{0}" is not declared',
    'msg.accAndComp': 'state "{0}" is accepting and complement-accepting',
    'msg.oneParam': 'the real theory is limited to one parameter in v1 (found: {0})',
    'msg.fcEqOnly': 'largest F_c is available in v1 only in the equality theory (the direct product doubles the real parameters)',
    'msg.diffTheories': 'A and B use different theories ({0} against {1})',
    'msg.constNoArith': 'constant {0} cannot be computed with',
    'msg.constNoScale': 'constant {0} cannot be scaled',
    'msg.badChar': 'unexpected character "{0}" at position {1}',
    'msg.expected': 'expected "{0}", found "{1}"',
    'msg.relExpected': 'relation expected (e.g. x < y)',
    'msg.eqOnlyRel': 'in the equality theory only = and ≠ are allowed',
    'msg.xEqX': 'x = x is pointless',
    'msg.atomNeedsX': 'an atom must contain x (comparisons without x are not allowed in v1)',
    'msg.eqNoArith': 'no arithmetic is allowed in the equality theory',
    'msg.eqOnlyTerms': 'in the equality theory only x, parameters and constants are allowed',
    'msg.nonlinear': 'linear terms only: product of two variables',
    'msg.divZero': 'division only by a number other than 0',
    'msg.paramIndex': 'parameter index must be ≥ 1: {0}',
    'msg.unknownIdent': 'unknown identifier "{0}" (in the real theory there are only x, y_i and numbers)',
    'msg.termExpected': 'term expected, found "{0}"',
    'msg.trailing': 'unexpected "{0}" after the formula',
    'msg.unknownNode': 'unknown node {0}',
    'msg.vaOnlyParam': '1-VA: only atoms over the parameter y',
    'msg.noRoundToken': 'no round token sits in q{0}',
    // Parametermenge ist ganz Theta. Drei Schluessel, weil der Satzbau
    // unterschiedlich ist: mit Variablenname davor, ohne, und als Zusatz
    // hinter einem Variablennamen.
    'msg.yAny': 'y arbitrary',
    'msg.any': 'arbitrary',
    'msg.anyWord': 'arbitrary'
  };

  // Liefert den Text zum Schluessel in der aktuellen Sprache, mit {0}, {1}, ...
  // gefuellt. Ohne geladene Sprache oder unbekannten Schluessel kommt fallback.
  function M(key, fallback) {
    const args = Array.prototype.slice.call(arguments, 2);
    const lang = root.I18n ? root.I18n.lang() : 'de';
    const s = (lang === 'en' && EN[key]) ? EN[key] : fallback;
    return String(s).replace(/\{(\d+)\}/g, function (m, i) {
      return args[+i] === undefined ? m : String(args[+i]);
    });
  }

  root.Msg = M;
})(typeof globalThis !== 'undefined' ? globalThis : this);
