// shot.js — Screenshot einer Seite in headless Chrome, zum Ansehen des Layouts.
// Aufruf: node test/shot.js [seite.html] [ausgabe.png]
// Ohne Argumente: playground.html, nach dem Klick auf "Link erzeugen".
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9444;
const page = process.argv[2] || 'playground.html';
const outFile = process.argv[3] || path.join(os.tmpdir(), 'ia-shot.png');

function findChrome() {
  const cands = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  return null;
}

function wsConnect(url) {
  return new Promise(function (resolve, reject) {
    const u = new URL(url);
    const key = crypto.randomBytes(16).toString('base64');
    const req = http.request({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search,
      headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13' }
    });
    req.on('upgrade', function (res, socket) { socket.setNoDelay(true); resolve(makeWs(socket)); });
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
    send: function (o) { socket.write(encodeFrame(Buffer.from(JSON.stringify(o), 'utf8'))); },
    onMessage: function (h) { handlers.push(h); },
    close: function () { try { socket.destroy(); } catch (e) {} }
  };
}

function decodeFrame(b) {
  if (b.length < 2) return null;
  const opcode = b[0] & 0x0f;
  let len = b[1] & 0x7f, off = 2;
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

function serve() {
  return new Promise(function (resolve) {
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
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
  if (!chrome) { console.log('Kein Chrome gefunden.'); return 1; }
  const { srv, port } = await serve();
  const userDir = path.join(os.tmpdir(), 'ia-shot-' + process.pid);
  const proc = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--window-size=1600,1200',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + userDir, 'about:blank'
  ], { stdio: 'ignore' });

  let version = null;
  for (let i = 0; i < 60 && !version; i++) {
    try { version = await getJSON('http://127.0.0.1:' + PORT + '/json/version'); }
    catch (e) { await wait(250); }
  }
  if (!version) { proc.kill(); srv.close(); throw new Error('Debug-Port kam nicht hoch'); }

  const ws = await wsConnect(version.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.onMessage(function (m) { if (m.id !== undefined && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  function send(method, params, sessionId) {
    const i = ++id;
    return new Promise(function (resolve, reject) {
      pending.set(i, function (m) { m.error ? reject(new Error(method + ': ' + m.error.message)) : resolve(m.result); });
      ws.send({ id: i, method: method, params: params || {}, sessionId: sessionId });
    });
  }

  const t = await send('Target.createTarget', { url: 'about:blank' });
  const s = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
  const sid = s.sessionId;
  await send('Runtime.enable', {}, sid);
  await send('Page.enable', {}, sid);
  await send('Emulation.setDeviceMetricsOverride',
    { width: 1600, height: 1200, deviceScaleFactor: 1, mobile: false }, sid);
  await send('Page.navigate', { url: 'http://127.0.0.1:' + port + '/' + page }, sid);
  await wait(1500);

  // Optional: eigenen Ausdruck auswerten und sein Ergebnis ausgeben. Damit
  // lassen sich Fragen an die fertig gerenderte Seite stellen, die kein Bild
  // beantwortet, etwa nach den Kontrastwerten. Der Ausdruck laeuft vor allen
  // anderen Schaltern, das Bild entsteht danach trotzdem.
  const jsArg = process.argv.find(function (a) { return a.indexOf('--js=') === 0; });
  if (jsArg) {
    const r = await send('Runtime.evaluate', {
      expression: jsArg.slice(5), awaitPromise: true, returnByValue: true
    }, sid);
    if (r.exceptionDetails) console.log('Fehler: ' + r.exceptionDetails.text);
    else console.log(JSON.stringify(r.result.value, null, 1));
    await wait(200);
  }

  // Optional: vor dem Screenshot einen Knopf klicken, z.B. --click=equiv
  const clickArg = process.argv.find(function (a) { return a.indexOf('--click=') === 0; });
  if (clickArg) {
    const what = clickArg.slice(8);
    await send('Runtime.evaluate', {
      expression: "document.querySelector('[data-check=\"" + what + "\"]').click()",
      awaitPromise: true
    }, sid);
    await wait(600);
  } else if (process.argv.some(function (a) { return a === '--epa'; })) {
    // Der Fall aus dem Bugreport: EPA-Familie mit n = 5 in Slot B, dazu ein Wort,
    // das in der Gleichheitstheorie hunderte Klassen erzeugt.
    await send('Runtime.evaluate', {
      expression: "(function(){document.getElementById('famN').value=5;"
        + "document.getElementById('opSlot').value='B';"
        + "document.querySelector('[data-fam=\"epa\"]').click();"
        + "var w=document.getElementById('word');w.value='1, 1/2, 8/5';"
        + "w.dispatchEvent(new Event('input'));"
        + "document.getElementById('stepAll').click();})()",
      awaitPromise: true
    }, sid);
    await wait(800);
  } else if (process.argv.some(function (a) { return a === '--map'; })) {
    // Die beiden neuen Flaechen zusammen: y auf dem Zahlenstrahl festgehalten
    // und die Sprachkarte gerechnet.
    await send('Runtime.evaluate', {
      expression: "(function(){"
        + "var s=document.getElementById('numberLine'),r=s.getBoundingClientRect();"
        + "s.dispatchEvent(new PointerEvent('pointerdown',"
        + "{clientX:r.left+r.width*0.62,clientY:r.top+r.height*0.5,bubbles:true}));"
        + "document.getElementById('mkMap').click();})()",
      awaitPromise: true
    }, sid);
    await wait(1200);
  } else if (process.argv.some(function (a) { return a === '--info'; })) {
    await send('Runtime.evaluate', {
      expression: "document.querySelectorAll('.info-btn')[4].click()", awaitPromise: true
    }, sid);
    await wait(400);
  } else if (process.argv.some(function (a) { return a === '--open-details'; })) {
    // Alle <details> aufklappen: so ist im Bild zu sehen, ob das Layout dabei springt.
    await send('Runtime.evaluate', {
      expression: "document.querySelectorAll('details').forEach(function(d){d.open=true;})",
      awaitPromise: true
    }, sid);
    await wait(400);
  } else if (page.indexOf('playground.html') === 0) {
    await send('Runtime.evaluate', {
      expression: "document.getElementById('mkLink').click()", awaitPromise: true
    }, sid);
    await wait(600);
  }

  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, sid);
  fs.writeFileSync(outFile, Buffer.from(shot.data, 'base64'));
  console.log('Screenshot: ' + outFile);

  ws.close();
  proc.kill();
  srv.close();
  try { fs.rmSync(userDir, { recursive: true, force: true }); } catch (e) {}
  return 0;
}

main().then(function (c) { process.exit(c); }, function (e) { console.error(e.message); process.exit(1); });
