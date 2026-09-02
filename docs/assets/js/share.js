// share.js — kompakte Kodierung von Automaten und Wort für den URL-Hash.
//
// Format: '#z=' + base64url(deflate-raw(payload)), wobei payload die Felder durch
// Zeichen trennt, die in der DSL nicht vorkommen (U+001F als Feldtrenner).
// Das alte Klartextformat '#a=…&b=…&w=…' wird beim Laden weiterhin verstanden.
(function (root) {
  'use strict';

  const SEP = String.fromCharCode(31); // Unit Separator: kommt in der DSL nicht vor
  const hasCompression = typeof root.CompressionStream === 'function';

  function toBase64url(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromBase64url(str) {
    const s = str.replace(/-/g, '+').replace(/_/g, '/');
    const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
    const bin = atob(s + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function streamThrough(bytes, Ctor, format) {
    const stream = new Ctor(format);
    const writer = stream.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const chunks = [];
    const reader = stream.readable.getReader();
    for (;;) {
      const r = await reader.read();
      if (r.done) break;
      chunks.push(r.value);
    }
    let len = 0;
    for (const c of chunks) len += c.length;
    const out = new Uint8Array(len);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return out;
  }

  // fields: {a, b, w} — b und w dürfen leer sein.
  async function encode(fields) {
    const payload = [fields.a || '', fields.b || '', fields.w || ''].join(SEP);
    const bytes = new TextEncoder().encode(payload);
    if (!hasCompression) {
      // Ohne CompressionStream: unkomprimiert base64url, immer noch kürzer als
      // encodeURIComponent, weil dort jedes Sonderzeichen drei Zeichen kostet.
      return 'u=' + toBase64url(bytes);
    }
    const packed = await streamThrough(bytes, root.CompressionStream, 'deflate-raw');
    return 'z=' + toBase64url(packed);
  }

  async function decode(hash) {
    const h = String(hash).replace(/^#/, '');
    if (!h) return null;

    // Neues Format
    const m = /^([zu])=(.*)$/.exec(h);
    if (m) {
      let bytes = fromBase64url(m[2]);
      if (m[1] === 'z') {
        if (typeof root.DecompressionStream !== 'function') return null;
        bytes = await streamThrough(bytes, root.DecompressionStream, 'deflate-raw');
      }
      const parts = new TextDecoder().decode(bytes).split(SEP);
      if (!parts[0]) return null;
      return { a: parts[0], b: parts[1] || '', w: parts[2] || '' };
    }

    // Altes Klartextformat
    const params = {};
    for (const kv of h.split('&')) {
      const i = kv.indexOf('=');
      if (i > 0) {
        try { params[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); }
        catch (e) { return null; }
      }
    }
    if (!params.a) return null;
    return { a: params.a, b: params.b || '', w: params.w || '' };
  }

  root.Share = { encode: encode, decode: decode, SEP: SEP };
})(typeof globalThis !== 'undefined' ? globalThis : this);
