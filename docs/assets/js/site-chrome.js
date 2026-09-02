// site-chrome.js — Theme- und Sprachumschalter, portiert aus site-nav.js von alber.me.
//
// Unterschiede zur Vorlage, alle aus den Repo-Regeln:
//   - kein React: die Sprache wird ueber eine i18n-Tabelle und data-i18n-Attribute
//     gesetzt, nicht ueber ein Re-Render. Seiten registrieren window.__onLang(lang)
//     fuer alles, was dynamisch erzeugt wird.
//   - relative Pfade, damit die Seite ueber file:// laeuft.
//   - IIFE an globalThis, keine ES-Module.
//
// Zwei Attribute, nicht eins. data-skin traegt, was der Nutzer gewaehlt hat
// (light, dark, grey), data-theme nur die Polaritaet (light oder dark). Grau ist
// ein dunkler Skin, erbt also die dunkle Leiter und ueberschreibt ab da; Code,
// der auf data-theme verzweigt, liest weiter einen Wert, den er versteht.
(function (root) {
  'use strict';

  var el = document.documentElement;
  var POLARITY = { light: 'light', dark: 'dark', grey: 'dark' };
  var THEME_DEFAULT = 'dark';
  var LANG_DEFAULT = 'en';

  function still() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  // ---------------------------------------------------------------- Sprache

  // Der aktuelle Sprachcode. Module lesen ihn ueber I18n.lang(), damit sie nicht
  // auf eine Variable zeigen, die beim Umschalten ersetzt wird.
  var LANG = LANG_DEFAULT;

  function resolveLang() {
    var p = new URLSearchParams(location.search).get('lang');
    if (p === 'en' || p === 'de') { store('lang', p); return p; }
    var s = load('lang');
    return (s === 'de' || s === 'en') ? s : LANG_DEFAULT;
  }

  // Uebersetzt einen Schluessel. Fehlt er, kommt der Schluessel selbst zurueck:
  // das faellt im UI auf, statt still leer zu bleiben.
  function t(key) {
    var tab = root.STRINGS && root.STRINGS[LANG];
    if (tab && typeof tab[key] === 'string') return tab[key];
    var en = root.STRINGS && root.STRINGS.en;
    if (en && typeof en[key] === 'string') return en[key];
    return key;
  }

  // Vorlage fuellen: t('x {0} y', a, b). Platzhalter sind {0}, {1}, ... Ein
  // literales {{0}} bleibt als {0} stehen, damit Mengenklammern moeglich sind.
  function f(key) {
    var args = Array.prototype.slice.call(arguments, 1);
    return t(key).replace(/\{(\d+)\}/g, function (m, i) {
      return args[+i] === undefined ? m : String(args[+i]);
    });
  }

  // Statisches Markup: jedes Element mit data-i18n bekommt seinen Text, jedes
  // mit data-i18n-attr="<attr>:<key>" das benannte Attribut.
  function applyStatic() {
    document.querySelectorAll('[data-i18n]').forEach(function (e) {
      e.textContent = t(e.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-html]').forEach(function (e) {
      e.innerHTML = t(e.getAttribute('data-i18n-html'));
    });
    document.querySelectorAll('[data-i18n-attr]').forEach(function (e) {
      e.getAttribute('data-i18n-attr').split(';').forEach(function (pair) {
        var i = pair.indexOf(':');
        if (i < 0) return;
        e.setAttribute(pair.slice(0, i).trim(), t(pair.slice(i + 1).trim()));
      });
    });
    var ti = document.querySelector('title[data-i18n]');
    if (ti) document.title = t(ti.getAttribute('data-i18n'));
  }

  function applyLang(lang) {
    LANG = lang;
    el.lang = lang;
    applyStatic();
    // Offene Info-Overlays schliessen: ihr Inhalt wird erst beim Oeffnen aus der
    // Tabelle geholt, ein offenes Overlay bliebe sonst in der alten Sprache stehen.
    if (typeof closeAllInfo === 'function') closeAllInfo();
    // Alles, was die Seite selbst erzeugt (Tabellen, Graphen, Meldungen), baut
    // sich hier neu auf. Ohne Hook bleibt nur das statische Markup uebersetzt.
    if (typeof root.__onLang === 'function') root.__onLang(lang);
  }

  // -------------------------------------------------- Kanal-Split-Animation
  //
  // Aus site-nav.js uebernommen: der Sprachwechsel als Post-Effekt auf der
  // fertigen Seite. Eine View Transition liefert alte und neue Seite als zwei
  // Texturen; die alte laeuft durch einen SVG-Filter, der den Rotkanal in die
  // eine und Gruen/Blau in die andere Richtung schiebt, die neue wischt darueber.
  //
  // Die Verschiebung liegt nicht auf der ganzen Textur, sondern auf einem Band,
  // und das Band wandert mit der Wischkante. Ein Filter weiss nicht, wo die Kante
  // gerade ist, also traegt jeder Filter sein eigenes Band und die Keyframes
  // schalten sie durch. filter interpoliert ohnehin diskret zwischen zwei url(),
  // ein Sprung ist also alles, was ein Keyframe kann.
  var SPLIT_PX = 10;               // px Kanalversatz im Band
  var BAND = 0.1;                  // halbe Bandhoehe in Viewporthoehen
  var BLUR = 100;                  // px Weichzeichnung der Bandkanten
  var STEPS = 20;                  // Positionen, durch die das Band laeuft
  var TRAVEL = [-0.12, 1.12];      // Start und Ende, in Einheiten der mask-position

  // Das Band ist ein geflutetes Rechteck in eigener Subregion, weich gezeichnet.
  // Nicht feImage: das holt sein Bild asynchron, und bis es da ist, rendert das
  // gefilterte Element gar nicht. feFlood braucht nichts von aussen.
  // Die Subregion des Blurs muss angegeben werden, sonst wird die Weichheit an
  // genau den Kanten abgeschnitten, die sie weich machen soll.
  function bandDefs(c, pad) {
    var top = c - BAND, bot = c + BAND;
    var y = Math.min(1, Math.max(0, top)), h = Math.min(1, Math.max(0, bot)) - y;
    if (h <= 0) return '<feFlood flood-opacity="0" result="band"/>';
    var by = Math.max(0, y - pad), bh = Math.min(1 - by, h + 2 * pad);
    return '<feFlood flood-color="#fff" flood-opacity="1" x="-5%" width="110%"' +
      ' y="' + (y * 100).toFixed(2) + '%" height="' + (h * 100).toFixed(2) + '%" result="raw"/>' +
      '<feGaussianBlur in="raw" stdDeviation="' + BLUR + '"' +
      ' x="-5%" width="110%" y="' + (by * 100).toFixed(2) + '%"' +
      ' height="' + (bh * 100).toFixed(2) + '%" result="band"/>';
  }

  function buildFilters() {
    if (document.getElementById('lang-split-defs')) return;
    var i, svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'lang-split-defs';
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';

    // Jeder Schritt ist eine volle Auswertung des Filters pro Textur, die Arbeit
    // waechst also mit Schritten mal Geraetepixeln. Volle Aufloesung bis etwa
    // 1440p, darueber runter bis auf zehn Schritte.
    var dpr = window.devicePixelRatio || 1;
    var area = (window.innerWidth || 1200) * (window.innerHeight || 800) * dpr * dpr;
    var steps = Math.max(10, Math.min(STEPS, Math.round(STEPS * 4.2e6 / area)));
    var pad = Math.min(0.4, 3 * BLUR / (window.innerHeight || 800));

    var defs = '', d = SPLIT_PX;
    for (i = 0; i < steps; i++) {
      var c = TRAVEL[0] + (TRAVEL[1] - TRAVEL[0]) * (i + 0.5) / steps;
      // Zwei Kopien mit disjunkten Kanaelen, per screen wieder zusammengelegt:
      // wo ein Operand in einem Kanal 0 ist, gibt screen den anderen unveraendert
      // zurueck, das setzt also zusammen statt aufzuhellen. In sRGB, sonst
      // verschoebe der Umweg ueber lineares Licht jede Farbe der Seite.
      defs += '<filter id="lang-wave-' + i + '" x="-5%" y="0%" width="110%" height="100%"' +
        ' color-interpolation-filters="sRGB">' +
        bandDefs(c, pad) +
        '<feOffset in="SourceGraphic" dx="' + d + '" dy="0" result="a"/>' +
        '<feOffset in="SourceGraphic" dx="' + (-d) + '" dy="0" result="b"/>' +
        '<feColorMatrix in="a" type="matrix" result="ar" values="' +
          '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"/>' +
        '<feColorMatrix in="b" type="matrix" result="bgb" values="' +
          '0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0"/>' +
        '<feBlend in="ar" in2="bgb" mode="screen" result="split"/>' +
        '<feComposite in="split" in2="band" operator="in" result="inband"/>' +
        '<feComposite in="SourceGraphic" in2="band" operator="out" result="whole"/>' +
        '<feMerge><feMergeNode in="whole"/><feMergeNode in="inband"/></feMerge>' +
        '</filter>';
    }
    svg.innerHTML = defs;
    document.body.appendChild(svg);

    // Der passende Lauf: ein Keyframe pro Bandposition, gleichmaessig verteilt,
    // damit das Band im selben Tempo wandert wie die Wischkante. Steht hier und
    // nicht in app.css, weil es sich mit STEPS aendert.
    var kf = '';
    for (i = 0; i < steps; i++) {
      kf += (100 * i / steps).toFixed(2) + '%{filter:url(#lang-wave-' + i + ')}';
    }
    kf += '100%{filter:none}';
    var st = document.createElement('style');
    st.textContent = '@keyframes lang-vt-wave{' + kf + '}';
    document.head.appendChild(st);
  }

  // ---------------------------------------------------------------- Umschalter

  function initTheme() {
    var cur = el.dataset.skin || el.dataset.theme;
    var segs = document.querySelectorAll('.theme-seg');
    var mark = function (v) {
      segs.forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-theme-set') === v); });
    };
    mark(cur);
    segs.forEach(function (btn) {
      btn.onclick = function () {
        var v = btn.getAttribute('data-theme-set');
        if (v === cur) return;
        store('theme', v);
        var url = new URL(location.href);
        if (v === THEME_DEFAULT) url.searchParams.delete('theme'); else url.searchParams.set('theme', v);
        var apply = function () {
          el.dataset.skin = v;
          el.dataset.theme = POLARITY[v] || 'dark';
          el.style.colorScheme = el.dataset.theme;
          cur = v;
          mark(v);
        };
        // file:// vertraegt kein replaceState mit Query, also nur wenn es geht.
        try { history.replaceState(null, '', url.href); } catch (e) {}
        if (!still() && document.startViewTransition) {
          // GPU-Kreuzblende zweier Seitentexturen. Der .theme-morph-Fallback
          // animiert stattdessen jedes einzelne Element.
          document.startViewTransition(function () {
            apply();
            window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: v } }));
          });
        } else {
          if (!still()) el.classList.add('theme-morph');
          apply();
          window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: v } }));
          setTimeout(function () { el.classList.remove('theme-morph'); }, 600);
        }
      };
    });
  }

  function initLang() {
    var segs = document.querySelectorAll('.lang-seg[data-lang]');
    var mark = function (v) {
      segs.forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-lang') === v); });
    };
    mark(LANG);
    segs.forEach(function (btn) {
      btn.onclick = function () {
        var lang = btn.getAttribute('data-lang');
        if (lang === LANG) return;
        store('lang', lang);
        var url = new URL(location.href);
        if (lang === LANG_DEFAULT) url.searchParams.delete('lang'); else url.searchParams.set('lang', lang);
        try { history.replaceState(null, '', url.href); } catch (e) {}
        var swap = function () { applyLang(lang); mark(lang); };
        if (!still() && document.startViewTransition) {
          buildFilters();
          el.classList.add('lang-vt');   // trennt die Regeln vom Theme-Sweep
          var vt = document.startViewTransition(function () { swap(); });
          var clear = function () { el.classList.remove('lang-vt'); };
          if (vt && vt.finished && vt.finished.then) vt.finished.then(clear, clear);
          else setTimeout(clear, 1200);
        } else {
          swap();
        }
      };
    });
  }

  // ------------------------------------------------------------ Info-Overlays
  //
  // Jedes Panel mit data-info="<schluessel>" bekommt oben rechts ein kleines i,
  // das den Text unter diesem Schluessel als Overlay zeigt. Damit steht die
  // Erklaerung dort, wo die Funktion bedient wird, statt in einem eigenen Panel
  // daneben, und sie kostet nichts, solange niemand sie aufruft.
  //
  // Der Knopf wird hier erzeugt und nicht in jede Seite geschrieben: er ist
  // Chrome, kein Inhalt, und muss beim Sprachwechsel ohnehin durch dieselbe
  // Hand. Ein <button> mit aria-expanded, weil das i eine Aktion ist und keine
  // Anzeige; die Affordanzregel bleibt gewahrt, weil es ein Kreis mit Rahmen
  // ist und keine vierte Kastenform.
  function buildInfo() {
    document.querySelectorAll('[data-info]').forEach(function (panel) {
      if (panel.querySelector(':scope > .info-btn')) return;
      var key = panel.getAttribute('data-info');
      var btn = document.createElement('button');
      btn.className = 'info-btn';
      btn.type = 'button';
      btn.textContent = 'i';
      btn.setAttribute('aria-expanded', 'false');
      var box = document.createElement('div');
      box.className = 'info-box';
      box.hidden = true;
      panel.appendChild(btn);
      panel.appendChild(box);
      // Position relativ zum Panel, sonst sitzt das i im Textfluss.
      if (getComputedStyle(panel).position === 'static') panel.style.position = 'relative';
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var open = box.hidden;
        closeAllInfo();
        if (open) {
          box.innerHTML = t(key);
          box.hidden = false;
          btn.setAttribute('aria-expanded', 'true');
        }
      });
      box.addEventListener('click', function (ev) { ev.stopPropagation(); });
    });
  }

  function closeAllInfo() {
    document.querySelectorAll('.info-box').forEach(function (b) { b.hidden = true; });
    document.querySelectorAll('.info-btn').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
  }

  document.addEventListener('click', closeAllInfo);
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') closeAllInfo(); });

  // Die Sprache steht schon vor dem ersten Paint fest (Einzeiler im <head>),
  // uebersetzt wird, sobald das Markup da ist.
  LANG = resolveLang();

  function boot() {
    applyLang(LANG);
    buildInfo();
    initTheme();
    initLang();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  root.I18n = {
    t: t,
    f: f,
    lang: function () { return LANG; },
    apply: applyStatic
  };
})(globalThis);
