// I-5a structural checks for assets/schedule.js. Real schedule file is loaded
// from IndexedDB (the BYO-data store) — drop your u6 data via the main page
// first (the dropzone there persists it). Open tests/test_schedule.html through
// the dev server.
import { decodeSchedule, AiAction } from '../assets/schedule.js';
import { U6DB } from '../u6db.js';

const results = [];
let pass = 0, fail = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  if (ok) pass++; else fail++;
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

function render(headline, headlineOk) {
  const summary = `${pass} passed, ${fail} failed`;
  console.log(`\n=== I-5a schedule: ${summary} ===`);
  if (typeof document === 'undefined') return;
  const el = document.getElementById('out');
  if (!el) return;
  el.innerHTML =
    `<h2 class="${headlineOk ? 'pass' : 'fail'}">${headline}</h2>` +
    results.map(r => {
      const cls = r.ok ? 'pass' : 'fail';
      const mark = r.ok ? '✓' : '✗';
      return `<div class="${cls}">${mark} ${r.name}${r.detail ? ` <span class="detail">${r.detail}</span>` : ''}</div>`;
    }).join('');
}

const bytes = await U6DB.get('schedule');
if (!bytes) {
  render(
    'schedule not in IndexedDB — drop your U6 data files into the main page first (index.html), then reload this page',
    false
  );
  window.__I5A_RESULT__ = { pass: 0, fail: 0, results: [], missing: true };
} else {
  // --- size + pointer-table structure ---
  check('file ≥ 514 bytes (pointer table fits)', bytes.byteLength >= 514, `size=${bytes.byteLength}`);

  let s;
  try {
    s = decodeSchedule(bytes);
    check('decodeSchedule returns without throwing', true);
  } catch (e) {
    check('decodeSchedule returns without throwing', false, e.message);
    render(`I-5a schedule: parse failed — ${pass} passed, ${fail} failed`, false);
    window.__I5A_RESULT__ = { pass, fail, results };
    throw e;
  }

  const { pointers, slots, byNpc, totalSlots } = s;

  check('pointers length === 257', pointers.length === 257);
  check('byNpc length === 256', byNpc.length === 256);
  check('pointers[0] === 0 (NPC 0 starts at slot 0)', pointers[0] === 0, `pointers[0]=${pointers[0]}`);

  check('totalSlots === pointers[256]', totalSlots === pointers[256], `totalSlots=${totalSlots}`);
  check('totalSlots × 5 + 514 ≤ file length', totalSlots * 5 + 514 <= bytes.byteLength,
    `${totalSlots * 5 + 514} vs ${bytes.byteLength}`);
  check('slots array length === totalSlots', slots.length === totalSlots);

  // --- pointer monotonicity (non-strict: a "no-schedule" NPC may have
  // pointers[n] past totalSlots, encoding an empty range. Allowed iff the
  // range clamps to empty within [0..totalSlots]). ---
  let monotonic = true;
  let firstBadAt = -1;
  for (let i = 1; i < 257; i++) {
    const a = Math.min(pointers[i - 1], totalSlots);
    const b = Math.min(pointers[i], totalSlots);
    if (b < a) { monotonic = false; firstBadAt = i; break; }
  }
  check('pointers monotonic after clamp-to-totalSlots', monotonic,
    monotonic ? null : `pointers[${firstBadAt - 1}]=${pointers[firstBadAt - 1]}, pointers[${firstBadAt}]=${pointers[firstBadAt]}`);

  // --- per-NPC partition matches pointers (clamped) ---
  let perNpcShapeOk = true;
  let sum = 0;
  for (let n = 0; n < 256; n++) {
    sum += byNpc[n].length;
    const expected = Math.max(0, Math.min(pointers[n + 1], totalSlots) - Math.min(pointers[n], totalSlots));
    if (byNpc[n].length !== expected) perNpcShapeOk = false;
  }
  check('Σ byNpc[n].length === totalSlots', sum === totalSlots, `sum=${sum}`);
  check('byNpc[n].length === clamped(pointers[n+1] - pointers[n]) for all n', perNpcShapeOk);

  // --- slot field ranges (hour 0..23, day 0..7, x/y 0..1023, z 0..15) ---
  let badHour = 0, badDay = 0, badX = 0, badY = 0, badZ = 0;
  for (const sl of slots) {
    if (sl.hour > 23) badHour++;
    if (sl.day > 7) badDay++;
    if (sl.x > 1023) badX++;
    if (sl.y > 1023) badY++;
    if (sl.z > 15) badZ++;
  }
  check('all slot hours ∈ 0..23', badHour === 0, badHour ? `${badHour} bad` : null);
  check('all slot days ∈ 0..7', badDay === 0, badDay ? `${badDay} bad` : null);
  check('all slot x ∈ 0..1023', badX === 0, badX ? `${badX} bad` : null);
  check('all slot y ∈ 0..1023', badY === 0, badY ? `${badY} bad` : null);
  check('all slot z ∈ 0..15', badZ === 0, badZ ? `${badZ} bad` : null);

  // --- action-code sanity: most should land in the AiAction schedule-tier set ---
  const known = new Set(Object.values(AiAction));
  const actionCounts = new Map();
  let unknownActions = 0;
  for (const sl of slots) {
    actionCounts.set(sl.action, (actionCounts.get(sl.action) ?? 0) + 1);
    if (!known.has(sl.action)) unknownActions++;
  }
  check('every slot action is a known AiAction', unknownActions === 0,
    unknownActions ? `${unknownActions} slots with unknown action codes` : null);

  // --- spot check: some NPCs have schedules; not all 256 are empty ---
  const npcsWithSlots = byNpc.filter(s => s.length > 0).length;
  check('some NPCs have schedules (npcsWithSlots > 0)', npcsWithSlots > 0, `npcsWithSlots=${npcsWithSlots}`);

  // --- info: action distribution (not a check, just a console dump) ---
  const dist = [...actionCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([code, n]) => {
      const name = Object.entries(AiAction).find(([, v]) => v === code)?.[0] ?? '???';
      return `${name}(0x${code.toString(16)})=${n}`;
    })
    .join('  ');
  console.log(`action distribution: ${dist}`);
  console.log(`NPCs with schedules: ${npcsWithSlots}/256`);
  console.log(`total slots: ${totalSlots}`);

  render(`I-5a schedule: ${pass} passed, ${fail} failed (${totalSlots} slots, ${npcsWithSlots} scheduled NPCs)`, fail === 0);
  window.__I5A_RESULT__ = { pass, fail, results, totalSlots, npcsWithSlots, actionCounts: dist };
}
