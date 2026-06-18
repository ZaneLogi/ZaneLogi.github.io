// In-memory verification for the DEXTE-paced move economy (I-14). Pure logic — no
// rendering, no game data. Open tests/test_move_economy.html through the dev server,
// or run headless with node. Covers I-14a (rate calibration); extended by later
// sub-steps (accumulator tick, stepCost).
import { rate, BASE_COST, REF_DEX, REF_TILES_PER_SEC, DEX_FLOOR } from '../systems/move_economy.js';

const results = [];
let pass = 0, fail = 0;
function check(name, cond) {
  const ok = !!cond;
  if (ok) pass++; else fail++;
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
}
// floats: compare with a small tolerance
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
// tiles/sec an actor of this dexterity makes on a given step cost at a world speed
const tilesPerSec = (dex, ws = 1, cost = BASE_COST) => (1000 * rate(dex, ws)) / cost;

// --- the calibration anchor: reference DEX on open ground = REF_TILES_PER_SEC ---
check(`rate: DEX ${REF_DEX} on base terrain = ${REF_TILES_PER_SEC} tiles/s`,
  near(tilesPerSec(REF_DEX), REF_TILES_PER_SEC));

// --- DEX is a linear speed meter above the floor ---
check('rate: DEX 30 is twice DEX 15 (linear)', near(rate(30, 1), 2 * rate(15, 1)));
check('rate: DEX 30 on base terrain = 5 tiles/s', near(tilesPerSec(30), 5.0));

// --- floor: anything at/below DEX_FLOOR moves at the floor speed (no crawl) ---
check('rate: DEX 1 floored to DEX_FLOOR', near(rate(1, 1), rate(DEX_FLOOR, 1)));
check('rate: DEX 0 floored to DEX_FLOOR', near(rate(0, 1), rate(DEX_FLOOR, 1)));
check(`rate: floor speed = ${DEX_FLOOR}/${REF_DEX} of reference`,
  near(tilesPerSec(DEX_FLOOR), REF_TILES_PER_SEC * DEX_FLOOR / REF_DEX));

// --- WORLD_SPEED master scalar: linear, and 0 freezes ---
check('rate: WORLD_SPEED 2 doubles the rate', near(rate(15, 2), 2 * rate(15, 1)));
check('rate: WORLD_SPEED 0 freezes (rate 0)', rate(30, 0) === 0);

// --- monotonic above the floor ---
check('rate: monotonic increasing above the floor', rate(10, 1) < rate(20, 1) && rate(20, 1) < rate(30, 1));

// --- terrain: a costlier tile slows the actor proportionally (cost is the denominator) ---
check('rate: doubling step cost halves tiles/s', near(tilesPerSec(15, 1, 2 * BASE_COST), REF_TILES_PER_SEC / 2));

// --- report ---
const summary = `${pass} passed, ${fail} failed`;
console.log(`\n=== I-14 move economy: ${summary} ===`);
if (typeof document !== 'undefined') {
  const el = document.getElementById('out');
  if (el) {
    el.innerHTML =
      `<h2 class="${fail ? 'fail' : 'pass'}">I-14 move economy: ${summary}</h2>` +
      results.map(r => `<div class="${r.ok ? 'pass' : 'fail'}">${r.ok ? '✓' : '✗'} ${r.name}</div>`).join('');
  }
}
if (typeof window !== 'undefined') window.__I14_RESULT__ = { pass, fail, results };
