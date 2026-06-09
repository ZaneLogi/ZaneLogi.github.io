// In-memory verification for the drunk-walk primitive (I-15): tryDiagMove (I-15a) +
// tryMoveTo (I-15b). Pure synthetic fixtures, no U6 data. Open tests/test_drunk_walk.html
// via the dev server; results log to console + page.

import { TileFlags } from '../assets/tile_flags.js';
import { TileRegistry } from '../resources/tile_registry.js';
import { World } from '../ecs/world.js';
import { SpatialIndex } from '../resources/spatial_index.js';
import { MapLevel } from '../resources/map_level.js';
import { Position, Renderable, ObjType, Actor } from '../components/components.js';
import { tryDiagMove, tryMoveTo } from '../systems/drunk_walk.js';

const results = [];
let pass = 0, fail = 0;
function check(name, cond) {
  const ok = !!cond;
  if (ok) pass++; else fail++;
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
}

// Minimal world: tile 99 = impassable terrain; `walls` = list of [x,y] cells made solid.
// One actor NPC at `npc` (humanoid 0x19a by default).
function setup({ walls = [], npc = { x: 10, y: 10, obj: 0x19a } } = {}) {
  const data = new Uint8Array(0x1C00);
  data[0x0000 + 99] = 0x02;                                  // TerrainType bit 0x02 = impassable
  const reg = new TileRegistry({ tiles: null, flags: new TileFlags(data), palette: new Uint8Array(0) });
  reg.baseTile = { objToTile: new Uint16Array(0x400) };
  const wallSet = new Set(walls.map(([x, y]) => `${x},${y}`));
  const mapLevel = Object.create(MapLevel.prototype);
  mapLevel.tileAt = (x, y) => (wallSet.has(`${x},${y}`) ? 99 : 0);
  const world = new World(256)
    .registerComponent(Position).registerComponent(Renderable)
    .registerComponent(ObjType).registerComponent(Actor);
  const spatial = new SpatialIndex(256);
  world.setResource(reg); world.setResource(spatial); world.setResource(mapLevel);
  const h = world.create();
  world.add(h, Position, { x: npc.x, y: npc.y, z: 0 });
  world.add(h, ObjType, { objNumber: npc.obj, frame: 0 });
  world.add(h, Renderable, { tileId: 0 });
  world.add(h, Actor, { npcId: 0 });
  spatial.insert(npc.x, npc.y, h);
  return { world, h, pos: world.store(Position), i: world.resolve(h) };
}

// dir components for a NE move: h_dir = E(2), v_dir = N(0) → diagonal NE, target (11,9).
const E = 2, N = 0;

// ── all clear → steps diagonally ──
{
  const { world, h, pos, i } = setup();
  const r = tryDiagMove(world, h, E, N, false);
  check('tryDiagMove: clear NE → moves to (11,9)', r !== null && pos.x[i] === 11 && pos.y[i] === 9);
}
// ── diagonal target blocked → no move ──
{
  const { world, h, pos, i } = setup({ walls: [[11, 9]] });   // wall ON the diagonal target
  const r = tryDiagMove(world, h, E, N, false);
  check('tryDiagMove: blocked diagonal target → null', r === null);
  check('tryDiagMove: blocked diagonal target → did not move', pos.x[i] === 10 && pos.y[i] === 10);
}
// ── corner-cut prevention: both orthogonal neighbours blocked, target clear → no squeeze ──
{
  const { world, h, pos, i } = setup({ walls: [[11, 10], [10, 9]] });   // both orthogonals solid
  const r = tryDiagMove(world, h, E, N, false);
  check('tryDiagMove: corner between two walls → null (no squeeze) even with clear target', r === null);
  check('tryDiagMove: corner-cut → did not move', pos.x[i] === 10 && pos.y[i] === 10);
}
// ── one orthogonal clear + clear target → steps (slides past the single corner) ──
{
  const { world, h, pos, i } = setup({ walls: [[11, 10]] });   // only the horizontal neighbour solid
  const r = tryDiagMove(world, h, E, N, false);
  check('tryDiagMove: one orthogonal clear → moves diagonally', r !== null && pos.x[i] === 11 && pos.y[i] === 9);
}
// ── diagonal direction combine: SW (h=W,v=S) and the N+W→NW special case land right ──
{
  const { world, h, pos, i } = setup();
  tryDiagMove(world, h, 6 /*W*/, 4 /*S*/, false);
  check('tryDiagMove: SW combine → (9,11)', pos.x[i] === 9 && pos.y[i] === 11);
}
{
  const { world, h, pos, i } = setup();
  tryDiagMove(world, h, 6 /*W*/, 0 /*N*/, false);     // N+W special case → NW
  check('tryDiagMove: NW (N+W special case) → (9,9)', pos.x[i] === 9 && pos.y[i] === 9);
}

// ── tryMoveTo: greedy approach toward a far target → one step along the primary axis ──
{
  const { world, h, pos, i } = setup();
  const r = tryMoveTo(world, h, 15, 10, false, () => 0);
  check('tryMoveTo: far east target → one step east (11,10)', r !== null && pos.x[i] === 11 && pos.y[i] === 10);
}
// ── tryMoveTo: primary straight blocked → diagonal detour ──
{
  const { world, h, pos, i } = setup({ walls: [[11, 10]] });   // wall due east
  const r = tryMoveTo(world, h, 13, 10, false, () => 0);        // rand→S → detour SE
  check('tryMoveTo: blocked straight east → diagonal detour SE (11,11)', r !== null && pos.x[i] === 11 && pos.y[i] === 11);
}
// ── tryMoveTo: reverse step fires when forward is all blocked AND rand picks it ──
{
  // target ENE (12,9): primary = horizontal E; block E + the NE corner & N → only reverse(S) open
  const { world, h, pos, i } = setup({ walls: [[11, 10], [10, 9]] });
  const r = tryMoveTo(world, h, 12, 9, false, () => 0);         // rand 0 → take the reverse
  check('tryMoveTo: forward all blocked + rand → reverse step S (10,11)', r !== null && pos.x[i] === 10 && pos.y[i] === 11);
}
// ── tryMoveTo: reverse skipped when rand says so → no move ──
{
  const { world, h, pos, i } = setup({ walls: [[11, 10], [10, 9]] });
  const r = tryMoveTo(world, h, 12, 9, false, () => 1);         // rand 1 → skip the reverse
  check('tryMoveTo: forward all blocked + rand skips reverse → no move', r === null && pos.x[i] === 10 && pos.y[i] === 10);
}
// ── tryMoveTo: already at the target → no-op ──
{
  const { world, h } = setup();
  check('tryMoveTo: already at target → null', tryMoveTo(world, h, 10, 10, false, () => 0) === null);
}
// ── tryMoveTo: wrap-aware on the toroidal axis ──
{
  const { world, h, pos, i } = setup({ npc: { x: 0, y: 10, obj: 0x19a } });
  tryMoveTo(world, h, 1023, 10, false, () => 0);               // 1023 = one step WEST of 0 (wrap)
  check('tryMoveTo: wrap-aware → steps west across the seam to 1023', pos.x[i] === 1023 && pos.y[i] === 10);
}

// --- report ---
const summary = `${pass} passed, ${fail} failed`;
console.log(`\n=== I-15 drunk-walk: ${summary} ===`);
if (typeof document !== 'undefined') {
  const el = document.getElementById('out');
  if (el) {
    el.innerHTML =
      `<h2 class="${fail ? 'fail' : 'pass'}">I-15 drunk-walk: ${summary}</h2>` +
      results.map(r => `<div class="${r.ok ? 'pass' : 'fail'}">${r.ok ? '✓' : '✗'} ${r.name}</div>`).join('');
  }
}
if (typeof window !== 'undefined') window.__I15_RESULT__ = { pass, fail, results };
