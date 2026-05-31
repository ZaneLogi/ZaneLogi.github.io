// I-5b unit tests for resources/schedules.js. Pure — no IDB, no real schedule
// file required. The resolver's contract is small enough to exercise with
// hand-built byNpc stubs covering each branch of the source loop.
import { Schedules } from '../resources/schedules.js';

const results = [];
let pass = 0, fail = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  if (ok) pass++; else fail++;
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

// Build a Schedules-shaped object from a sparse map: { npcId: [slot, ...] }.
// Each slot needs hour/day/action/x/y/z; time is filled in from hour|day for
// realism but the resolver only reads hour/day.
function fake(npcMap) {
  const byNpc = new Array(256).fill(null).map(() => []);
  for (const [id, slots] of Object.entries(npcMap)) {
    byNpc[Number(id)] = slots.map(s => ({
      time: (s.day << 5) | s.hour,
      action: 0x90, x: 0, y: 0, z: 0,
      ...s,
    }));
  }
  return new Schedules({ byNpc, pointers: null, totalSlots: 0 });
}

// --- empty NPC ---
{
  const s = fake({});
  check('empty NPC returns null at any hour', s.resolveSlotAt(5, 9, 1) === null);
  check('hasSchedule(5) === false', s.hasSchedule(5) === false);
}

// --- single slot, any-day ---
{
  const s = fake({ 1: [{ hour: 9, day: 0, action: 0x91, x: 100, y: 200, z: 0 }] });
  const r = s.resolveSlotAt(1, 9, 1);
  check('single any-day slot matches at its hour',
    r && r.hour === 9 && r.day === 0 && r.action === 0x91 && r.x === 100 && r.slotIndex === 0);
  check('any-day slot matches on day 7 too', s.resolveSlotAt(1, 9, 7)?.x === 100);
  check('any-day slot does not match at other hour', s.resolveSlotAt(1, 10, 1) === null);
  check('hasSchedule(1) === true', s.hasSchedule(1) === true);
}

// --- day-specific slot ---
{
  const s = fake({ 2: [{ hour: 18, day: 3, action: 0x93, x: 1, y: 2, z: 0 }] });
  check('day-specific slot matches on its day', s.resolveSlotAt(2, 18, 3)?.action === 0x93);
  check('day-specific slot does not match on other day', s.resolveSlotAt(2, 18, 4) === null);
  check('day-specific slot does not match at other hour same day', s.resolveSlotAt(2, 19, 3) === null);
}

// --- no match at this hour (NPC has slots, but none at the queried hour) ---
{
  const s = fake({ 3: [
    { hour: 6,  day: 0, action: 0x90, x: 0, y: 0, z: 0 },
    { hour: 22, day: 0, action: 0x91, x: 0, y: 0, z: 0 },
  ]});
  check('no-match hour between transitions returns null', s.resolveSlotAt(3, 10, 1) === null);
  check('match at first transition (06:00)', s.resolveSlotAt(3, 6, 1)?.action === 0x90);
  check('match at second transition (22:00)', s.resolveSlotAt(3, 22, 1)?.action === 0x91);
}

// --- backward scan: latest-indexed match wins on duplicate (hour, day) ---
{
  const s = fake({ 4: [
    { hour: 9, day: 0, action: 0x90, x: 10, y: 0, z: 0 },
    { hour: 9, day: 0, action: 0x91, x: 20, y: 0, z: 0 },  // wins (later in array)
  ]});
  const r = s.resolveSlotAt(4, 9, 1);
  check('duplicate (hour, day): backward scan picks the higher-indexed slot',
    r && r.action === 0x91 && r.x === 20 && r.slotIndex === 1);
}

// --- day-specific takes precedence only when present; otherwise wildcard wins ---
{
  // Two slots same hour: a wildcard (day=0) AND a day-3 specific.
  // Source scans backward, so the later-indexed slot wins regardless of day-specificity.
  const s = fake({ 5: [
    { hour: 12, day: 0, action: 0x93, x: 1, y: 0, z: 0 },  // earlier index = wildcard "default"
    { hour: 12, day: 3, action: 0x94, x: 2, y: 0, z: 0 },  // later index = day-3 override
  ]});
  check('on day 3: day-specific later slot wins over earlier wildcard',
    s.resolveSlotAt(5, 12, 3)?.action === 0x94);
  // On day != 3, the day-3 slot is skipped; backward scan falls through to the wildcard.
  check('on day 4: wildcard slot is the fallback',
    s.resolveSlotAt(5, 12, 4)?.action === 0x93);
}

// --- slotIndex is the position within byNpc[npc], not the global Schedule offset ---
{
  const s = fake({ 6: [
    { hour: 6,  day: 0, action: 0x90, x: 0, y: 0, z: 0 },
    { hour: 12, day: 0, action: 0x93, x: 0, y: 0, z: 0 },
    { hour: 18, day: 0, action: 0x94, x: 0, y: 0, z: 0 },
    { hour: 22, day: 0, action: 0x91, x: 0, y: 0, z: 0 },
  ]});
  check('slotIndex of 06:00 slot is 0', s.resolveSlotAt(6, 6, 1)?.slotIndex === 0);
  check('slotIndex of 18:00 slot is 2', s.resolveSlotAt(6, 18, 1)?.slotIndex === 2);
  check('slotIndex of 22:00 slot is 3', s.resolveSlotAt(6, 22, 1)?.slotIndex === 3);
}

// --- dayOfWeek helper ---
{
  check('dayOfWeek(1) === 1', Schedules.dayOfWeek(1) === 1);
  check('dayOfWeek(7) === 7', Schedules.dayOfWeek(7) === 7);
  check('dayOfWeek(8) === 1 (wraps)', Schedules.dayOfWeek(8) === 1);
  check('dayOfWeek(14) === 7', Schedules.dayOfWeek(14) === 7);
  check('dayOfWeek(15) === 1', Schedules.dayOfWeek(15) === 1);
}

// --- purity: same input -> same output, no mutation ---
{
  const s = fake({ 7: [{ hour: 9, day: 0, action: 0x91, x: 5, y: 10, z: 0 }] });
  const a = s.resolveSlotAt(7, 9, 1);
  const b = s.resolveSlotAt(7, 9, 1);
  check('resolveSlotAt is idempotent (deep-equal returns on repeat call)',
    JSON.stringify(a) === JSON.stringify(b));
  // Source state preserved
  check('byNpc[7] still has 1 slot after lookups', s.byNpc[7].length === 1);
}

// --- report ---
const summary = `${pass} passed, ${fail} failed`;
console.log(`\n=== I-5b Schedules: ${summary} ===`);
if (typeof document !== 'undefined') {
  const el = document.getElementById('out');
  if (el) {
    el.innerHTML =
      `<h2 class="${fail ? 'fail' : 'pass'}">I-5b Schedules: ${summary}</h2>` +
      results.map(r => {
        const cls = r.ok ? 'pass' : 'fail';
        const mark = r.ok ? '✓' : '✗';
        return `<div class="${cls}">${mark} ${r.name}${r.detail ? ` <span class="detail">${r.detail}</span>` : ''}</div>`;
      }).join('');
  }
}
window.__I5B_RESULT__ = { pass, fail, results };
