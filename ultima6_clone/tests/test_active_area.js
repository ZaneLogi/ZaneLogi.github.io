// I-5d unit tests for SpatialIndex.hasRegionAt — the active-area predicate
// used by the NPC schedule system. Pure: a fresh SpatialIndex with a known
// loadedRegions set, no IDB, no real data needed.
import { SpatialIndex } from '../resources/spatial_index.js';
import { regionId } from '../world_loader.js';

const results = [];
let pass = 0, fail = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  if (ok) pass++; else fail++;
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

// --- empty loadedRegions: every position is inactive ---
{
  const s = new SpatialIndex();
  check('empty: (0, 0) -> false', s.hasRegionAt(0, 0) === false);
  check('empty: (500, 500) -> false', s.hasRegionAt(500, 500) === false);
  check('empty: (1023, 1023) -> false', s.hasRegionAt(1023, 1023) === false);
}

// --- region (0, 0) loaded: covers tiles x in [0..127] AND y in [0..127] ---
{
  const s = new SpatialIndex();
  s.loadedRegions.add(regionId(0, 0));
  check('region (0,0) loaded: (0, 0) -> true', s.hasRegionAt(0, 0) === true);
  check('region (0,0) loaded: (127, 127) inside -> true', s.hasRegionAt(127, 127) === true);
  check('region (0,0) loaded: (128, 0) outside (col 1) -> false', s.hasRegionAt(128, 0) === false);
  check('region (0,0) loaded: (0, 128) outside (row 1) -> false', s.hasRegionAt(0, 128) === false);
  check('region (0,0) loaded: (128, 128) outside diagonal -> false', s.hasRegionAt(128, 128) === false);
}

// --- region (2, 3) loaded: covers x in [256..383], y in [384..511] ---
{
  const s = new SpatialIndex();
  s.loadedRegions.add(regionId(2, 3));
  check('region (2,3) loaded: (256, 384) inside -> true', s.hasRegionAt(256, 384) === true);
  check('region (2,3) loaded: (383, 511) inside (far corner) -> true', s.hasRegionAt(383, 511) === true);
  check('region (2,3) loaded: (255, 400) outside (col 1) -> false', s.hasRegionAt(255, 400) === false);
  check('region (2,3) loaded: (384, 400) outside (col 3) -> false', s.hasRegionAt(384, 400) === false);
  check('region (2,3) loaded: (300, 383) outside (row 2) -> false', s.hasRegionAt(300, 383) === false);
  check('region (2,3) loaded: (300, 512) outside (row 4) -> false', s.hasRegionAt(300, 512) === false);
}

// --- far corner region (7, 7) — id 63 ---
{
  const s = new SpatialIndex();
  s.loadedRegions.add(regionId(7, 7));
  check('region (7,7): id is 63', regionId(7, 7) === 63);
  check('region (7,7) loaded: (896, 896) inside -> true', s.hasRegionAt(896, 896) === true);
  check('region (7,7) loaded: (1023, 1023) inside (world edge) -> true', s.hasRegionAt(1023, 1023) === true);
  check('region (7,7) loaded: (895, 900) outside (col 6) -> false', s.hasRegionAt(895, 900) === false);
}

// --- multiple regions loaded (the realistic case as avatar explores) ---
{
  const s = new SpatialIndex();
  s.loadedRegions.add(regionId(0, 0));
  s.loadedRegions.add(regionId(2, 3));
  s.loadedRegions.add(regionId(7, 7));
  check('multi: (50, 50) in region (0,0) -> true', s.hasRegionAt(50, 50) === true);
  check('multi: (300, 400) in region (2,3) -> true', s.hasRegionAt(300, 400) === true);
  check('multi: (1000, 1000) in region (7,7) -> true', s.hasRegionAt(1000, 1000) === true);
  check('multi: (200, 200) in region (1,1) NOT loaded -> false', s.hasRegionAt(200, 200) === false);
  check('multi: (500, 500) in region (3,3) NOT loaded -> false', s.hasRegionAt(500, 500) === false);
}

// --- predicate matches the loader's regionId formula exactly ---
{
  const s = new SpatialIndex();
  // Spot-check every region id and confirm predicate matches loader's regionId.
  let allMatch = true, firstBadAt = null;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const fresh = new SpatialIndex();
      fresh.loadedRegions.add(regionId(col, row));
      // Probe a cell deep inside the region (col*128 + 64, row*128 + 64).
      const ok = fresh.hasRegionAt(col * 128 + 64, row * 128 + 64);
      if (!ok) { allMatch = false; firstBadAt = `(${col},${row})`; break; }
    }
    if (!allMatch) break;
  }
  check('predicate matches regionId across all 64 (col, row) pairs',
    allMatch, allMatch ? null : `first miss at ${firstBadAt}`);
}

// --- report ---
const summary = `${pass} passed, ${fail} failed`;
console.log(`\n=== I-5d hasRegionAt: ${summary} ===`);
if (typeof document !== 'undefined') {
  const el = document.getElementById('out');
  if (el) {
    el.innerHTML =
      `<h2 class="${fail ? 'fail' : 'pass'}">I-5d hasRegionAt: ${summary}</h2>` +
      results.map(r => {
        const cls = r.ok ? 'pass' : 'fail';
        const mark = r.ok ? '✓' : '✗';
        return `<div class="${cls}">${mark} ${r.name}${r.detail ? ` <span class="detail">${r.detail}</span>` : ''}</div>`;
      }).join('');
  }
}
window.__I5D_RESULT__ = { pass, fail, results };
