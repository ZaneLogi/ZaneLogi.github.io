// In-memory verification for the BOOK.DAT reader (I-book). Pure logic, no U6 data —
// synthetic byte arrays only (the real book.dat is BYO-data, never committed). Open
// tests/test_books.html via the dev server; results log to console + page.
//
// Format under test (resources/books.js, seg_27a1.c C_27A1_078F): a u16 little-endian
// offset table (entry q-1 → byte offset of book q's text), then NUL-terminated text.

import { Books } from '../resources/books.js';

const results = [];
let pass = 0, fail = 0;
function check(name, cond) {
  const ok = !!cond;
  if (ok) pass++; else fail++;
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
}

// Build a synthetic BOOK.DAT: a u16 offset table followed by NUL-terminated text blocks.
function makeBookDat(texts) {
  const enc = new TextEncoder();
  const blocks = texts.map(t => { const b = enc.encode(t); return new Uint8Array([...b, 0]); });
  const tableLen = texts.length * 2;
  let total = tableLen;
  const offs = [];
  for (const blk of blocks) { offs.push(total); total += blk.length; }
  const out = new Uint8Array(total);
  for (let i = 0; i < offs.length; i++) { out[i * 2] = offs[i] & 0xff; out[i * 2 + 1] = (offs[i] >> 8) & 0xff; }
  let p = tableLen;
  for (const blk of blocks) { out.set(blk, p); p += blk.length; }
  return out;
}

// ── offset-table parse + entry count ──────────────────────────────────────
{
  const b = new Books(makeBookDat(['The perpetual motion machine.', 'A monolith.', 'Dairy']));
  check('count = entries (firstOffset>>1)', b.count === 3);
  check('get(1) first entry',  b.get(1) === 'The perpetual motion machine.');
  check('get(2) second entry', b.get(2) === 'A monolith.');
  check('get(3) last entry',   b.get(3) === 'Dairy');
}

// ── quality is 1-based; out-of-range → null (mirrors the GetQual!=0 gate) ──
{
  const b = new Books(makeBookDat(['One', 'Two']));
  check('get(0) → null (quality 0 = unreadable)', b.get(0) === null);
  check('get(count+1) → null', b.get(3) === null);
  check('get(-1) → null', b.get(-1) === null);
  check('has(1) true',  b.has(1) === true);
  check('has(2) true',  b.has(2) === true);
  check('has(3) false', b.has(3) === false);
  check('has(0) false', b.has(0) === false);
}

// ── NUL terminates the text (trailing bytes after \0 are ignored) ─────────
{
  const b = new Books(makeBookDat(['Short', 'Much longer text with markup <runic> & a @keyword']));
  check('text stops at NUL (entry 1 not bleeding into entry 2)', b.get(1) === 'Short');
  check('markup left intact for the renderer', b.get(2) === 'Much longer text with markup <runic> & a @keyword');
}

// ── newlines (0x0A) survive the decode ────────────────────────────────────
{
  const b = new Books(makeBookDat(['line one\nline two\n\npara two']));
  check('newlines preserved', b.get(1) === 'line one\nline two\n\npara two');
}

// ── absent book.dat (OPTIONAL not dropped) → inert, no throws ─────────────
{
  const empty = new Books(undefined);
  check('no bytes → count 0',  empty.count === 0);
  check('no bytes → get null', empty.get(1) === null);
  check('no bytes → has false', empty.has(1) === false);
  const tiny = new Books(new Uint8Array([0]));   // < 2 bytes (no table)
  check('truncated (<2 bytes) → count 0', tiny.count === 0);
  check('truncated → get null', tiny.get(1) === null);
}

// ── report ────────────────────────────────────────────────────────────────
const out = document.getElementById('out');
out.innerHTML = `<h2>BOOK.DAT reader (I-book) — ${fail === 0 ? '<span class="pass">ALL PASS</span>' : `<span class="fail">${fail} FAIL</span>`} (${pass}/${pass + fail})</h2>` +
  results.map(r => `<div class="${r.ok ? 'pass' : 'fail'}">${r.ok ? 'PASS' : 'FAIL'}  ${r.name}</div>`).join('');
console.log(`books: ${pass}/${pass + fail} pass`);
