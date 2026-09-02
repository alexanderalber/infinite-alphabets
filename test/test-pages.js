// test-pages.js — laedt die HTML-Seiten in headless Chrome und prueft, dass sie ohne
// Konsolenfehler starten und die erwarteten Inhalte rendern.
// Kein npm-Paket: das DevTools-Protokoll wird direkt ueber WebSocket gesprochen.
'use strict';
const { spawn, execSync } = require('child_process');
const http = require('http');
const crypto = require('crypto');
const net = require('net');
const path = require('path');
const fs = require('fs');

const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9333;

function findChrome() {
  const cands = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  return null;
}

// --- minimaler WebSocket-Client (nur was das DevTools-Protokoll braucht) ---
function wsConnect(url) {
  return new Promise(function (resolve, reject) {
    const u = new URL(url);
    const key = crypto.randomBytes(16).toString('base64');
    const req = http.request({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search,
      headers: {
        Connection: 'Upgrade', Upgrade: 'websocket',
        'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13'
      }
    });
    req.on('upgrade', function (res, socket) {
      socket.setNoDelay(true);
      resolve(makeWs(socket));
    });
    req.on('error', reject);
    req.end();
  });
}

function makeWs(socket) {
  const handlers = [];
  let buf = Buffer.alloc(0);
  socket.on('data', function (chunk) {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      const frame = decodeFrame(buf);
      if (!frame) break;
      buf = buf.slice(frame.total);
      if (frame.opcode === 1) {
        let msg;
        try { msg = JSON.parse(frame.payload.toString('utf8')); } catch (e) { continue; }
        handlers.forEach(function (h) { h(msg); });
      }
    }
  });
  return {
    send: function (obj) { socket.write(encodeFrame(Buffer.from(JSON.stringify(obj), 'utf8'))); },
    onMessage: function (h) { handlers.push(h); },
    close: function () { try { socket.destroy(); } catch (e) {} }
  };
}

function decodeFrame(b) {
  if (b.length < 2) return null;
  const opcode = b[0] & 0x0f;
  let len = b[1] & 0x7f;
  let off = 2;
  if (len === 126) { if (b.length < 4) return null; len = b.readUInt16BE(2); off = 4; }
  else if (len === 127) { if (b.length < 10) return null; len = Number(b.readBigUInt64BE(2)); off = 10; }
  if (b.length < off + len) return null;
  return { opcode: opcode, payload: b.slice(off, off + len), total: off + len };
}

function encodeFrame(payload) {
  const mask = crypto.randomBytes(4);
  const len = payload.length;
  let header;
  if (len < 126) { header = Buffer.alloc(2); header[1] = 0x80 | len; }
  else if (len < 65536) { header = Buffer.alloc(4); header[1] = 0x80 | 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[1] = 0x80 | 127; header.writeBigUInt64BE(BigInt(len), 2); }
  header[0] = 0x81;
  const masked = Buffer.alloc(len);
  for (let i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i % 4];
  return Buffer.concat([header, mask, masked]);
}

// --- statischer Dateiserver fuer docs/ ---
function serve() {
  return new Promise(function (resolve) {
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
    const srv = http.createServer(function (req, res) {
      const p = path.join(DOCS, decodeURIComponent(req.url.split('?')[0].split('#')[0]));
      if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
      res.end(fs.readFileSync(p));
    });
    srv.listen(0, '127.0.0.1', function () { resolve({ srv: srv, port: srv.address().port }); });
  });
}

function getJSON(url) {
  return new Promise(function (resolve, reject) {
    http.get(url, function (res) {
      let d = '';
      res.on('data', function (c) { d += c; });
      res.on('end', function () { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function main() {
  const chrome = findChrome();
  if (!chrome) { console.log('Kein Chrome gefunden, Seitentests uebersprungen.'); return 0; }

  const { srv, port } = await serve();
  const userDir = path.join(require('os').tmpdir(), 'ia-chrome-' + process.pid);
  const proc = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + userDir, 'about:blank'
  ], { stdio: 'ignore' });

  let version = null;
  for (let i = 0; i < 60 && !version; i++) {
    try { version = await getJSON('http://127.0.0.1:' + PORT + '/json/version'); }
    catch (e) { await wait(250); }
  }
  if (!version) { proc.kill(); srv.close(); throw new Error('Chrome hat den Debug-Port nicht geoeffnet'); }

  const failures = [];
  let passed = 0;
  function check(name, cond, detail) {
    if (cond) { passed++; return; }
    failures.push(name + (detail ? ' — ' + detail : ''));
  }

  const ws = await wsConnect(version.webSocketDebuggerUrl);
  let msgId = 0;
  const pending = new Map();
  const events = [];
  ws.onMessage(function (m) {
    if (m.id !== undefined && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method) events.push(m);
  });
  function send(method, params, sessionId) {
    const id = ++msgId;
    return new Promise(function (resolve, reject) {
      pending.set(id, function (m) { m.error ? reject(new Error(method + ': ' + m.error.message)) : resolve(m.result); });
      ws.send({ id: id, method: method, params: params || {}, sessionId: sessionId });
    });
  }

  const base = 'http://127.0.0.1:' + port + '/';

  for (const page of ['index.html', 'playground.html', 'positions.html', 'semantics.html']) {
    const t = await send('Target.createTarget', { url: 'about:blank' });
    const s = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
    const sid = s.sessionId;
    const logs = [];
    ws.onMessage(function (m) {
      if (m.sessionId !== sid) return;
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') logs.push(m.params.entry.text);
      if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails;
        logs.push((d.exception && d.exception.description) || d.text);
      }
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        logs.push(m.params.args.map(function (a) { return a.description || a.value; }).join(' '));
      }
    });
    await send('Runtime.enable', {}, sid);
    await send('Log.enable', {}, sid);
    await send('Page.enable', {}, sid);
    // Die Erwartungen unten pruefen die deutschen Texte, also wird die Sprache
    // explizit gesetzt. Ohne den Parameter waere die Seite englisch (Standard).
    await send('Page.navigate', { url: base + page + '?lang=de' }, sid);
    await wait(1400);

    async function evaluate(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sid);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' +
        ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || ''));
      return r.result.value;
    }

    check(page + ': keine Konsolenfehler beim Laden', logs.length === 0, logs.join(' | '));
    const logsAtLoad = logs.length;

    if (page === 'playground.html') {
      const st = await evaluate(`(function(){
        return {
          states: document.querySelectorAll('#graph .state').length,
          edges: document.querySelectorAll('#graph .edge').length,
          rows: document.querySelectorAll('#confTable tbody tr').length,
          verdict: document.getElementById('verdict').textContent.trim(),
          badges: document.getElementById('badgesA').textContent,
          errA: document.getElementById('errA').textContent,
          exCount: document.getElementById('exA').options.length
        };
      })()`);
      check('playground: C₃ hat 4 Zustaende', st.states === 4, 'gezeichnet: ' + st.states);
      check('playground: alle 8 Kanten von C3 gezeichnet', st.edges === 8, 'gezeichnet: ' + st.edges);
      check('playground: Simulationstabelle', st.rows === 4, 'Zeilen: ' + st.rows);
      check('playground: komplement-akzeptiert', /komplement-akzeptiert/.test(st.verdict), st.verdict);
      check('playground: kein Parse-Fehler', st.errA === '', st.errA);
      check('playground: Beispiele geladen', st.exCount >= 10, String(st.exCount));

      // Produktoperation durchklicken
      const prod = await evaluate(`(function(){
        document.getElementById('dslA').value = Examples.byId('A2p').dsl;
        document.getElementById('dslA').dispatchEvent(new Event('input'));
        document.getElementById('dslB').value = Examples.byId('B').dsl;
        document.getElementById('dslB').dispatchEvent(new Event('input'));
        document.querySelector('[data-op="sync"]').click();
        return {
          dsl: document.getElementById('dslB').value,
          note: document.getElementById('opNote').textContent,
          states: document.querySelectorAll('#graph .state').length
        };
      })()`);
      check('playground: Produkt hat 5 Zustaende', prod.states === 5, 'gezeichnet: ' + prod.states + ' / ' + prod.note);
      check('playground: Produkt-DSL enthaelt Tupelzustaende', /\(q0,r0\)/.test(prod.dsl), prod.dsl.slice(0, 120));

      // Familien-Slider und TikZ-Export
      // Die Familien schreiben in ihr eigenes Ziel (famSlot), nicht in das der
      // Operationen. Der Test stellt es ausdruecklich, statt sich auf den
      // Vorgabewert zu verlassen.
      const famC = await evaluate(`(function(){
        document.getElementById('famSlot').value = 'B';
        document.getElementById('famN').value = '3';
        document.getElementById('famN').dispatchEvent(new Event('input'));
        document.querySelector('[data-fam="cffsa"]').click();
        return { dsl: document.getElementById('dslB').value,
                 note: document.getElementById('famNote').textContent,
                 states: document.querySelectorAll('#graph .state').length,
                 label: document.getElementById('famNLabel').textContent };
      })()`);
      check('playground: Slider-Label folgt', famC.label === '3', famC.label);
      check('playground: cffsa(3) erzeugt', /q3/.test(famC.dsl), famC.dsl.slice(0, 80));
      check('playground: DFA-Groesse genannt', /8 Zust/.test(famC.note), famC.note);
      check('playground: cffsa(3) hat 11 Zustaende', famC.states === 11, String(famC.states));

      const famE = await evaluate(`(function(){
        document.querySelector('[data-fam="epa"]').click();
        return { dsl: document.getElementById('dslB').value,
                 note: document.getElementById('famNote').textContent,
                 states: document.querySelectorAll('#graph .state').length };
      })()`);
      check('playground: epaFamily(3) erzeugt', /x = y3/.test(famE.dsl), famE.dsl.slice(0, 120));
      check('playground: Bell-Schranke genannt', /3·5 = 15/.test(famE.note), famE.note);
      check('playground: EPA-Familie mit 3 Zustaenden gezeichnet', famE.states === 3, String(famE.states));

      const tikz = await evaluate(`(function(){
        document.getElementById('dslA').value = Examples.byId('C3').dsl;
        document.getElementById('dslA').dispatchEvent(new Event('input'));
        document.getElementById('showA').click();
        document.getElementById('mkTikz').click();
        return document.getElementById('tikzOut').value;
      })()`);
      check('playground: TikZ enthaelt tikzpicture', /\\begin\{tikzpicture\}/.test(tikz), tikz.slice(0, 120));
      check('playground: TikZ enthaelt alle 4 Zustaende', (tikz.match(/\\node\[/g) || []).length === 4, tikz.slice(0, 300));

      // Teilen: Kodierung, Laenge und Roundtrip ueber einen echten Reload
      const share = await evaluate(`(async function(){
        document.getElementById('dslA').value = Examples.byId('C3').dsl;
        document.getElementById('dslA').dispatchEvent(new Event('input'));
        document.getElementById('dslB').value = Examples.byId('A3').dsl;
        document.getElementById('dslB').dispatchEvent(new Event('input'));
        document.getElementById('word').value = '1, 1/2, 8/5';
        document.getElementById('word').dispatchEvent(new Event('input'));
        document.getElementById('mkLink').click();
        await new Promise(function(r){ setTimeout(r, 300); });
        const field = document.querySelector('#linkOut input');
        const plainLen = ('a=' + encodeURIComponent(document.getElementById('dslA').value) +
          '&b=' + encodeURIComponent(document.getElementById('dslB').value)).length;
        const panel = document.getElementById('linkOut').getBoundingClientRect();
        const parent = document.getElementById('linkOut').parentElement.getBoundingClientRect();
        return { url: field ? field.value : '', hash: location.hash, plainLen: plainLen,
                 fits: panel.right <= parent.right + 1 };
      })()`);
      check('playground: Link erzeugt', /#z=/.test(share.url), share.url.slice(0, 80));
      check('playground: Link deutlich kuerzer als der Klartext',
        share.url.length < share.plainLen / 2,
        share.url.length + ' Zeichen gegen ' + share.plainLen + ' im Klartextformat');
      check('playground: Link bleibt im Panel', share.fits, 'laeuft ueber den Rand');
      check('playground: Hash gesetzt', share.hash.indexOf('#z=') === 0, share.hash.slice(0, 40));

      // Reload mit dem Hash: dieselben Automaten und dasselbe Wort kommen zurueck.
      await send('Page.navigate', { url: base + page + '?lang=de' + share.hash }, sid);
      await wait(1200);
      const back = await evaluate(`(function(){
        return { a: document.getElementById('dslA').value,
                 b: document.getElementById('dslB').value,
                 w: document.getElementById('word').value,
                 states: document.querySelectorAll('#graph .state').length,
                 rows: document.querySelectorAll('#confTable tbody tr').length };
      })()`);
      check('playground: A kommt zurueck', /p0 -> p0/.test(back.a), back.a.slice(0, 60));
      check('playground: B kommt zurueck', /y <= x <= y\+1/.test(back.b), back.b.slice(0, 60));
      check('playground: Wort kommt zurueck', back.w === '1, 1/2, 8/5', back.w);
      check('playground: Graph nach Reload gezeichnet', back.states === 4, String(back.states));
      check('playground: Simulation nach Reload gelaufen', back.rows === 4, String(back.rows));

      // Automat ohne Parameter: das Verdikt darf kein leeres "mit ()" zeigen,
      // und der Graph darf am Rand nichts abschneiden.
      const noParams = await evaluate(`(function(){
        document.getElementById('dslA').value = Examples.byId('CFFSA2').dsl;
        document.getElementById('dslA').dispatchEvent(new Event('input'));
        document.getElementById('word').value = 'ba';
        document.getElementById('word').dispatchEvent(new Event('input'));
        const svg = document.getElementById('graph');
        const vb = svg.getAttribute('viewBox').split(' ').map(Number);
        const bb = svg.getBBox();
        return { verdict: document.getElementById('verdict').textContent.trim(),
                 exA: document.getElementById('exA').value,
                 fits: bb.x >= vb[0] - 0.5 && bb.y >= vb[1] - 0.5 &&
                       bb.x + bb.width <= vb[0] + vb[2] + 0.5 &&
                       bb.y + bb.height <= vb[1] + vb[3] + 0.5 };
      })()`);
      check('playground: kein leeres "mit ()" im Verdikt', !/mit \(\)/.test(noParams.verdict), noParams.verdict);
      check('playground: Verdikt trotzdem gesetzt', /akzeptiert/.test(noParams.verdict), noParams.verdict);
      check('playground: Graph passt in die viewBox', noParams.fits, 'Inhalt ragt heraus');

      // Automaten verschiedener Theorien vergleichen: verstaendliche Meldung statt
      // eines BigInt-Fehlers aus dem Inneren der Rechnung.
      const mixed = await evaluate(`(function(){
        document.getElementById('dslA').value = Examples.epaFamily(2);
        document.getElementById('dslA').dispatchEvent(new Event('input'));
        document.getElementById('dslB').value = Examples.byId('B').dsl;
        document.getElementById('dslB').dispatchEvent(new Event('input'));
        document.getElementById('checkOut').innerHTML = '';
        document.querySelector('[data-check="equiv"]').click();
        document.querySelector('[data-check="skolem"]').click();
        const txt = document.getElementById('checkOut').textContent;
        document.querySelector('[data-op="sync"]').click();
        return { checks: txt, op: document.getElementById('opNote').textContent };
      })()`);
      check('playground: kein BigInt-Fehler bei gemischten Theorien',
        !/BigInt/.test(mixed.checks), mixed.checks.slice(0, 200));
      check('playground: Meldung nennt die Theorien',
        /verschiedene Theorien/.test(mixed.checks), mixed.checks.slice(0, 200));
      check('playground: auch das Produkt lehnt sauber ab',
        /verschiedene Theorien/.test(mixed.op), mixed.op.slice(0, 200));

      // Beim Laden aus dem Hash soll das Dropdown das erkannte Beispiel zeigen.
      const hashSel = await evaluate(`(async function(){
        const hash = await Share.encode({ a: Examples.byId('CFFSA2').dsl, b: '', w: 'ba' });
        location.hash = hash;
        await new Promise(function(r){ setTimeout(r, 400); });
        return { exA: document.getElementById('exA').value,
                 exB: document.getElementById('exB').value };
      })()`);
      check('playground: Dropdown folgt dem Hash', hashSel.exA === 'CFFSA2', hashSel.exA);
      check('playground: leerer Slot B zeigt kein Beispiel', hashSel.exB === '', hashSel.exB);

      // Alte Klartext-Links muessen weiter funktionieren. Chrome navigiert bei reiner
      // Hash-Aenderung nicht neu, deshalb wird der Hash im laufenden Tab gesetzt:
      // das prueft zugleich den hashchange-Pfad.
      const legacyDsl = 'theory reals\nstates q0 q1\ninitial q0\naccepting q1\nq0 -> q1 : x = y';
      const legacy = await evaluate(`(async function(){
        location.hash = 'a=' + encodeURIComponent(${JSON.stringify(legacyDsl)}) + '&w=5';
        await new Promise(function(r){ setTimeout(r, 400); });
        return { a: document.getElementById('dslA').value, w: document.getElementById('word').value,
                 states: document.querySelectorAll('#graph .state').length };
      })()`);
      check('playground: altes Linkformat wird verstanden', /q0 -> q1/.test(legacy.a), legacy.a.slice(0, 60));
      check('playground: altes Format mit Wort', legacy.w === '5', legacy.w);
      check('playground: altes Format zeichnet', legacy.states === 2, String(legacy.states));

      // Zurueck zum Ausgangszustand fuer die folgenden Pruefungen.
      await send('Page.navigate', { url: base + page + '?lang=de' }, sid);
      await wait(1200);

      // Pruefung durchklicken
      const chk = await evaluate(`(function(){
        document.getElementById('dslA').value = Examples.byId('C3').dsl;
        document.getElementById('dslA').dispatchEvent(new Event('input'));
        document.getElementById('maxLen').value = '3';
        document.querySelector('[data-check="empty"]').click();
        document.querySelector('[data-check="cfpa"]').click();
        return document.getElementById('checkOut').textContent;
      })()`);
      check('playground: Leerheit gemeldet', /nichtleer/.test(chk), chk.slice(0, 200));
      check('playground: CFPA-Pruefung gemeldet', /Gegenbeispiel|kein Gegenbeispiel/.test(chk), chk.slice(0, 200));
    }

    if (page === 'positions.html') {
      const st = await evaluate(`(function(){
        return {
          states: document.querySelectorAll('#graph .state').length,
          squares: document.querySelectorAll('#graph .token-square').length,
          badges: document.getElementById('badges').textContent,
          vec: document.getElementById('vec').textContent,
          buttons: document.getElementById('letterButtons').children.length
        };
      })()`);
      check('positions: V hat 3 Zustaende', st.states === 3, String(st.states));
      check('positions: eckiges Token sichtbar', st.squares === 1, String(st.squares));
      check('positions: als 1-VA erkannt', /gültiges 1-VA/.test(st.badges), st.badges);
      check('positions: Startvektor', /0, 0, 0/.test(st.vec.replace(/\s+/g, ' ')), st.vec.slice(0, 60));
      check('positions: nur der Neu-Knopf am Anfang', st.buttons === 1, String(st.buttons));

      // abacb tippen
      const after = await evaluate(`(function(){
        function click(txt){
          const bs = Array.from(document.getElementById('letterButtons').children);
          const b = bs.find(function(x){ return x.textContent === txt || /neuer Buchstabe/.test(x.textContent); });
          b.click();
        }
        click('neu'); // a
        click('neu'); // b
        Array.from(document.getElementById('letterButtons').children).find(function(x){return x.textContent==='a';}).click();
        click('neu'); // c
        Array.from(document.getElementById('letterButtons').children).find(function(x){return x.textContent==='b';}).click();
        return {
          word: document.getElementById('wordDisplay').textContent,
          vec: document.getElementById('vec').textContent,
          round: document.querySelectorAll('#graph .token-round').length,
          applied: document.getElementById('applied').textContent
        };
      })()`);
      check('positions: Wort abacb', /abacb/.test(after.word), after.word);
      check('positions: Position (0,1,2 | 0,1,0)', /0, 1, 2/.test(after.vec.replace(/\s+/g, ' ')), after.vec.slice(0, 60));
      check('positions: drei runde Tokens', after.round === 3, String(after.round));
      check('positions: angewandte Abbildung angezeigt', /π/.test(after.applied), after.applied);

      // Erkundung
      const exp = await evaluate(`(function(){
        document.getElementById('depth').value = '6';
        document.getElementById('explore').click();
        return {
          out: document.getElementById('exploreOut').textContent,
          rows: document.querySelectorAll('#posTable tbody tr').length
        };
      })()`);
      check('positions: Erkundung liefert Positionen', exp.rows > 3, String(exp.rows));
      check('positions: V ohne Gegenbeispiel', /keine nicht-akzeptierende Position/.test(exp.out), exp.out.slice(0, 160));

      const dbl = await evaluate(`(function(){
        document.getElementById('dsl').value = Examples.byId('VAdouble').dsl;
        document.getElementById('dsl').dispatchEvent(new Event('input'));
        document.getElementById('depth').value = '4';
        document.getElementById('explore').click();
        return document.getElementById('exploreOut').textContent;
      })()`);
      check('positions: doppelter Buchstabe nicht universell', /nicht universell/.test(dbl), dbl.slice(0, 160));
    }

    if (page === 'index.html' || page === 'semantics.html') {
      const links = await evaluate(`Array.from(document.querySelectorAll('a[href]')).map(function(a){return a.getAttribute('href');})`);
      const missing = links.filter(function (h) {
        return !/^https?:/.test(h) && !fs.existsSync;
      });
      const bad = [];
      for (const h of links) {
        if (/^https?:|^#/.test(h)) continue;
        if (!fs.existsSync(path.join(DOCS, h))) bad.push(h);
      }
      check(page + ': alle internen Links existieren', bad.length === 0, bad.join(', '));
    }

    // ---------- Chrome: Sprache und Themes ----------
    // Jede Seite traegt beide Umschalter, also wird beides auf jeder Seite geprueft.

    // Englisch ist der Standard: ohne ?lang= und ohne gemerkte Wahl muss die
    // Seite englisch kommen. Der Speicher wird geleert, weil die Navigation
    // oben mit ?lang=de gelaufen ist und die Wahl bewusst gemerkt wird.
    await evaluate('localStorage.removeItem("lang"); localStorage.removeItem("theme")');
    await send('Page.navigate', { url: base + page }, sid);
    await wait(900);
    const enDefault = await evaluate(`(function(){
      return {
        lang: document.documentElement.lang,
        nav: document.querySelector('header.site nav a').textContent,
        active: (document.querySelector('.lang-seg.active') || {}).textContent || '',
        untranslated: Array.from(document.querySelectorAll('[data-i18n], [data-i18n-html]'))
          .filter(function(e){ return !e.textContent.trim(); }).length,
        keyLeak: /\b(idx|pg|pos|sem|nav)\.[a-z]/i.test(document.body.textContent)
      };
    })()`);
    check(page + ': Englisch ist Standard', enDefault.lang === 'en', enDefault.lang);
    check(page + ': EN-Segment aktiv', enDefault.active === 'EN', enDefault.active);
    check(page + ': kein leeres i18n-Element', enDefault.untranslated === 0, String(enDefault.untranslated));
    // Ein fehlender Schluessel wuerde als "pg.foo" im Text stehen statt als Satz.
    check(page + ': kein Schluessel im Text sichtbar', !enDefault.keyLeak, 'Schluessel sichtbar');

    // Deutsche Reste in der englischen Fassung. Der Fall ist real aufgetreten:
    // 'y beliebig' kam aus den Theoriemodulen und stand mitten im Graphen.
    // Geprueft werden Woerter, die im Englischen nicht vorkommen; Eigennamen
    // (Ruemmer) und die Fachbegriffe der Paper sind ausgenommen.
    const german = await evaluate(`(function(){
      const txt = document.body.innerText;
      const bad = [];
      const words = ['beliebig', 'Zustand', 'Buchstabe', 'akzeptiert', 'gefunden',
        'Laenge', 'Fehler', 'unvollst', 'Schritt', 'Zeuge', 'Wörter'];
      words.forEach(function(w){ if (txt.indexOf(w) >= 0) bad.push(w); });
      if (/[äöüß]/.test(txt.replace(/Rümmer/g, ''))) bad.push('Umlaut');
      return bad;
    })()`);
    check(page + ': keine deutschen Reste in der englischen Fassung',
      german.length === 0, german.join(', '));

    // Umschalten auf Deutsch: der Text aendert sich, lang und Segment ziehen mit.
    const toDe = await evaluate(`(function(){
      const before = document.querySelector('header.site nav a').textContent;
      document.querySelector('.lang-seg[data-lang="de"]').click();
      return new Promise(function(res){ setTimeout(function(){
        res({
          before: before,
          lang: document.documentElement.lang,
          active: (document.querySelector('.lang-seg.active') || {}).textContent || '',
          stored: localStorage.getItem('lang'),
          url: location.search
        });
      }, 600); });
    })()`);
    check(page + ': Wechsel auf DE setzt lang', toDe.lang === 'de', toDe.lang);
    check(page + ': DE-Segment aktiv', toDe.active === 'DE', toDe.active);
    check(page + ': Sprache gemerkt', toDe.stored === 'de', String(toDe.stored));
    check(page + ': Sprache in der URL', /lang=de/.test(toDe.url), toDe.url);

    // Die drei Skins. Grau ist ein dunkler Skin, data-theme muss dark bleiben.
    const themes = await evaluate(`(function(){
      const out = [];
      const seq = ['light', 'grey', 'dark'];
      let i = 0;
      function step(res){
        if (i >= seq.length) { res(out); return; }
        const v = seq[i++];
        document.querySelector('.theme-seg[data-theme-set="' + v + '"]').click();
        setTimeout(function(){
          const cs = getComputedStyle(document.documentElement);
          out.push({
            want: v,
            skin: document.documentElement.dataset.skin,
            theme: document.documentElement.dataset.theme,
            stored: localStorage.getItem('theme'),
            emph: cs.getPropertyValue('--tool-emph').trim(),
            border: cs.getPropertyValue('--tool-border').trim(),
            active: (document.querySelector('.theme-seg.active') || {}).getAttribute('data-theme-set')
          });
          step(res);
        }, 500);
      }
      return new Promise(step);
    })()`);
    const byName = {};
    themes.forEach(function (t) { byName[t.want] = t; });
    check(page + ': drei Skins geschaltet', themes.length === 3, String(themes.length));
    themes.forEach(function (t) {
      check(page + ': Skin ' + t.want + ' gesetzt', t.skin === t.want, t.skin);
      check(page + ': Skin ' + t.want + ' aktiv markiert', t.active === t.want, String(t.active));
      check(page + ': Skin ' + t.want + ' gemerkt', t.stored === t.want, String(t.stored));
    });
    // Die Polaritaet: hell ist hell, grau und dunkel sind dunkel.
    check(page + ': hell hat Polaritaet light', byName.light && byName.light.theme === 'light',
      byName.light && byName.light.theme);
    check(page + ': grau ist ein dunkler Skin', byName.grey && byName.grey.theme === 'dark',
      byName.grey && byName.grey.theme);
    // Jeder Skin muss eine eigene Leiter setzen, sonst greift der Block nicht.
    check(page + ': hell und dunkel haben verschiedene Textfarben',
      byName.light && byName.dark && byName.light.emph !== byName.dark.emph,
      byName.light && byName.light.emph);
    // Im grauen Skin traegt der Rahmen die Struktur, er ist weiss.
    check(page + ': grauer Skin hat weissen Rahmen',
      byName.grey && /^#f{3,6}$|^rgb\(255, 255, 255\)$/i.test(byName.grey.border),
      byName.grey && byName.grey.border);

    // Fehler, die erst durch die Klicks oben ausgeloest wurden.
    check(page + ': keine Konsolenfehler bei der Bedienung',
      logs.length === logsAtLoad, logs.slice(logsAtLoad).join(' | '));

    await send('Target.closeTarget', { targetId: t.targetId });
  }

  ws.close();
  proc.kill();
  srv.close();
  try { fs.rmSync(userDir, { recursive: true, force: true }); } catch (e) {}

  if (failures.length) {
    console.log('\nSeitentests fehlgeschlagen (' + failures.length + ' von ' + (passed + failures.length) + '):');
    for (const f of failures) console.log('  ' + f);
    return 1;
  }
  console.log('\n' + passed + '/' + passed + ' Seitentests bestanden.');
  return 0;
}

main().then(function (code) { process.exit(code); }, function (e) {
  console.error('Seitentests abgebrochen: ' + e.message);
  process.exit(1);
});
