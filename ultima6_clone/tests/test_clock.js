// In-memory verification for WorldClock (I-3a). No rendering — pure logic.
// Open tests/test_clock.html through the dev server; results log to console + page.
import { WorldClock } from '../resources/world_clock.js';

const results = [];
let pass = 0, fail = 0;
function check(name, cond) {
  const ok = !!cond;
  if (ok) pass++; else fail++;
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
}

// --- initial state ---
{
  const c = new WorldClock();
  check('default: 09:00, Year 161 M01 D01', c.Time_H === 9 && c.Time_M === 0 && c.Date_Y === 161 && c.Date_M === 1 && c.Date_D === 1);
  check('default: D_2C55 = 7 (full day at 09:00)', c.D_2C55 === 7);
}

// --- basic minute advance, no hour-bump ---
{
  const c = new WorldClock({ Time_H: 9, Time_M: 0 });
  c.advance(30);
  check('advance(30) from 09:00 -> 09:30', c.Time_H === 9 && c.Time_M === 30);
}

// --- minute rollover into next hour ---
{
  const c = new WorldClock({ Time_H: 9, Time_M: 45 });
  c.advance(30);
  check('advance(30) from 09:45 -> 10:15', c.Time_H === 10 && c.Time_M === 15);
}

// --- hour rollover into next day ---
{
  const c = new WorldClock({ Time_H: 23, Time_M: 30, Date_D: 1 });
  c.advance(60);
  check('advance(60) from 23:30 D1 -> 00:30 D2', c.Time_H === 0 && c.Time_M === 30 && c.Date_D === 2);
}

// --- day rollover into next month (28 days/month per seg_0A33.c:866) ---
{
  const c = new WorldClock({ Time_H: 23, Time_M: 30, Date_D: 28, Date_M: 1 });
  c.advance(60);
  check('advance(60) from 23:30 D28 M1 -> 00:30 D1 M2', c.Time_H === 0 && c.Date_D === 1 && c.Date_M === 2);
}

// --- month rollover into next year ---
{
  const c = new WorldClock({ Time_H: 23, Time_M: 30, Date_D: 28, Date_M: 12, Date_Y: 161 });
  c.advance(60);
  check('advance(60) from 23:30 D28 M12 Y161 -> 00:30 D1 M1 Y162',
    c.Time_H === 0 && c.Date_D === 1 && c.Date_M === 1 && c.Date_Y === 162);
}

// --- dawn ramp: 5:00..5:59 produces D_2C55 = 1..6 in 10-minute steps ---
{
  const c = new WorldClock({ Time_H: 4, Time_M: 59 });
  check('04:59 -> D_2C55 = 0 (pre-dawn)', c.D_2C55 === 0);
  c.advance(1);
  check('05:00 -> D_2C55 = 1', c.Time_H === 5 && c.Time_M === 0 && c.D_2C55 === 1);
  const seen = [c.D_2C55];
  for (let i = 0; i < 5; i++) { c.advance(10); seen.push(c.D_2C55); }
  check('05:00, 05:10, ..., 05:50 -> D_2C55 = 1..6', seen.join(',') === '1,2,3,4,5,6');
  c.advance(10);
  check('06:00 -> D_2C55 = 7 (full day)', c.Time_H === 6 && c.D_2C55 === 7);
}

// --- dusk ramp: 19:00..19:59 produces D_2C55 = 6..1 in 10-minute steps ---
{
  const c = new WorldClock({ Time_H: 18, Time_M: 59 });
  check('18:59 -> D_2C55 = 7 (still day)', c.D_2C55 === 7);
  c.advance(1);
  check('19:00 -> D_2C55 = 6 (dusk start)', c.Time_H === 19 && c.Time_M === 0 && c.D_2C55 === 6);
  const seen = [c.D_2C55];
  for (let i = 0; i < 5; i++) { c.advance(10); seen.push(c.D_2C55); }
  check('19:00, 19:10, ..., 19:50 -> D_2C55 = 6..1', seen.join(',') === '6,5,4,3,2,1');
  c.advance(10);
  check('20:00 -> D_2C55 = 0 (full dark)', c.Time_H === 20 && c.D_2C55 === 0);
}

// --- hourly hook count + ordering ---
{
  const c = new WorldClock({ Time_H: 9, Time_M: 0 });
  let count = 0;
  c.onHour(() => count++);
  c.advance(30);
  check('no hooks across sub-hour advance', count === 0);
  c.advance(30);
  check('1 hook at 09:30 + 30 -> 10:00', count === 1);
  c.advance(180);
  check('3 more hooks across 3-hour advance (total 4)', count === 4);
}

// --- hook sees the post-cascade state (date already rolled) ---
{
  const c = new WorldClock({ Time_H: 23, Time_M: 30, Date_D: 28, Date_M: 12, Date_Y: 161 });
  let observed = null;
  c.onHour(clk => { observed = { H: clk.Time_H, D: clk.Date_D, M: clk.Date_M, Y: clk.Date_Y }; });
  c.advance(60);
  check('hook sees rolled date (00:?? D1 M1 Y162)',
    observed && observed.H === 0 && observed.D === 1 && observed.M === 1 && observed.Y === 162);
}

// --- multiple hooks fire in registration order, each call passes the clock ---
{
  const c = new WorldClock({ Time_H: 9, Time_M: 30 });
  const order = [];
  c.onHour(() => order.push('a'));
  c.onHour(() => order.push('b'));
  c.advance(60);
  check('two hooks fire in registration order', order.join(',') === 'a,b');
}

// --- report ---
const summary = `${pass} passed, ${fail} failed`;
console.log(`\n=== I-3a WorldClock: ${summary} ===`);
if (typeof document !== 'undefined') {
  const el = document.getElementById('out');
  if (el) {
    el.innerHTML =
      `<h2 class="${fail ? 'fail' : 'pass'}">I-3a WorldClock: ${summary}</h2>` +
      results.map(r => `<div class="${r.ok ? 'pass' : 'fail'}">${r.ok ? '✓' : '✗'} ${r.name}</div>`).join('');
  }
}
window.__I3A_RESULT__ = { pass, fail, results };
