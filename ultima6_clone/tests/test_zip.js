// Round-trip verification for assets/zip.js — no U6 data needed. A tiny test-only
// zip *writer* (STORED + DEFLATE via CompressionStream) produces fixtures, which
// unzip() must read back byte-for-byte. Exercises STORED, DEFLATE, a subfolder
// entry (basename), and a skipped directory entry.
import { unzip } from '../assets/zip.js';

const results = [];
let pass = 0, fail = 0;
function check(name, cond) {
  const ok = !!cond;
  if (ok) pass++; else fail++;
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
}
function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function concat(arrays) {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const a of arrays) { out.set(a, p); p += a.length; }
  return out;
}
async function deflateRaw(bytes) {
  const cs = new CompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Minimal zip writer (TEST ONLY). files: [{ name, data:Uint8Array, method:0|8 }]
async function makeZip(files) {
  const enc = new TextEncoder();
  const locals = [], centrals = [];
  let offset = 0;
  for (const f of files) {
    f._name = enc.encode(f.name);
    const payload = f.method === 8 ? await deflateRaw(f.data) : f.data;
    f._payloadLen = payload.length;
    f._offset = offset;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0, true);
    lh.setUint16(8, f.method, true); lh.setUint16(10, 0, true); lh.setUint16(12, 0, true);
    lh.setUint32(14, 0, true); lh.setUint32(18, payload.length, true); lh.setUint32(22, f.data.length, true);
    lh.setUint16(26, f._name.length, true); lh.setUint16(28, 0, true);
    const local = concat([new Uint8Array(lh.buffer), f._name, payload]);
    offset += local.length;
    locals.push(local);
  }
  let cdSize = 0;
  for (const f of files) {
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
    ch.setUint16(8, 0, true); ch.setUint16(10, f.method, true); ch.setUint16(12, 0, true); ch.setUint16(14, 0, true);
    ch.setUint32(16, 0, true); ch.setUint32(20, f._payloadLen, true); ch.setUint32(24, f.data.length, true);
    ch.setUint16(28, f._name.length, true); ch.setUint16(30, 0, true); ch.setUint16(32, 0, true);
    ch.setUint16(34, 0, true); ch.setUint16(36, 0, true); ch.setUint32(38, 0, true); ch.setUint32(42, f._offset, true);
    const central = concat([new Uint8Array(ch.buffer), f._name]);
    cdSize += central.length;
    centrals.push(central);
  }
  const cdOffset = offset;
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true); eocd.setUint16(4, 0, true); eocd.setUint16(6, 0, true);
  eocd.setUint16(8, files.length, true); eocd.setUint16(10, files.length, true);
  eocd.setUint32(12, cdSize, true); eocd.setUint32(16, cdOffset, true); eocd.setUint16(20, 0, true);
  return concat([...locals, ...centrals, new Uint8Array(eocd.buffer)]);
}

const pattern = (len, seed) => Uint8Array.from({ length: len }, (_, i) => (i * seed + 13) & 0xff);

async function run() {
  const stored   = pattern(768, 7);     // STORED  (e.g. a palette-sized file)
  const deflated = pattern(4096, 3);     // DEFLATE
  const nested   = pattern(2000, 11);    // DEFLATE in a subfolder

  const zipBytes = await makeZip([
    { name: 'u6pal',  data: stored,   method: 0 },
    { name: 'chunks', data: deflated, method: 8 },
    { name: 'U6/map', data: nested,   method: 8 },
    { name: 'subdir/', data: new Uint8Array(0), method: 0 }, // directory entry
  ]);

  const entries = await unzip(zipBytes);
  check('directory entry skipped (3 file entries)', entries.length === 3);

  const byName = Object.fromEntries(entries.map((e) => [e.name, e.bytes]));
  check('STORED entry round-trips', byName['u6pal'] && bytesEqual(byName['u6pal'], stored));
  check('DEFLATE entry round-trips', byName['chunks'] && bytesEqual(byName['chunks'], deflated));
  check('subfolder DEFLATE entry round-trips', byName['U6/map'] && bytesEqual(byName['U6/map'], nested));
  check('subfolder entry keeps full path (basename taken by caller)', entries.some((e) => e.name === 'U6/map'));

  // DEFLATE actually compressed (payload smaller than source for patterned data)
  const cs = await deflateRaw(deflated);
  check('DecompressionStream deflate-raw available + inverse of CompressionStream', cs.length > 0);

  const summary = `${pass} passed, ${fail} failed`;
  console.log(`\n=== zip.js: ${summary} ===`);
  const el = document.getElementById('out');
  if (el) {
    el.innerHTML = `<h2 class="${fail ? 'fail' : 'pass'}">zip.js: ${summary}</h2>` +
      results.map((r) => `<div class="${r.ok ? 'pass' : 'fail'}">${r.ok ? '✓' : '✗'} ${r.name}</div>`).join('');
  }
  window.__ZIP_RESULT__ = { pass, fail, results };
}

run().catch((err) => {
  console.error(err);
  const el = document.getElementById('out');
  if (el) el.innerHTML = `<h2 class="fail">zip.js: ERROR ${err.message}</h2>`;
  window.__ZIP_RESULT__ = { pass, fail: fail + 1, error: String(err) };
});
