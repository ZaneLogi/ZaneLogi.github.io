// In-memory verification for I-4a flag accessors + I-4c canStandAt predicate. Pure
// bit-mask lookups (I-4a) and a synthetic world fixture (I-4c) — no U6 data needed.
// Open tests/test_passability.html via the dev server; results log to console + page.
import { TileFlags } from '../assets/tile_flags.js';
import { TileRegistry } from '../resources/tile_registry.js';
import { World } from '../ecs/world.js';
import { SpatialIndex } from '../resources/spatial_index.js';
import { MapLevel } from '../resources/map_level.js';
import { Position, Renderable, Actor } from '../components/components.js';
import { canStandAt } from '../systems/passability.js';

const results = [];
let pass = 0, fail = 0;
function check(name, cond) {
  const ok = !!cond;
  if (ok) pass++; else fail++;
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
}

// Synthetic tileflag table. Real file is 0x1C00 bytes (TerrainType@0, TileFlag@0x800,
// TypeWeight@0x1000 [0x400b, unused here], D_B3EF@0x1400; seg_0903.c:229-232).
// Entries are 0 by default; set known bits at known tile IDs to exercise each accessor.
const TILE_COUNT = 2048;
const data = new Uint8Array(0x1C00);

// TerrainType plane (offset 0x0000): TERRAIN_FLAG_01..08 per u6.h:181-187
data[10] = 0x01;  // tile 10 = wet
data[11] = 0x02;  // tile 11 = impassable
data[12] = 0x04;  // tile 12 = wall
data[13] = 0x08;  // tile 13 = damage
data[14] = 0x01 | 0x02;  // tile 14 = wet + impassable (e.g. deep water)

// TileFlag plane (offset 0x0800): foreground / double-V / double-H
data[0x0800 + 20] = 0x10;  // tile 20 = foreground
data[0x0800 + 21] = 0x40;  // tile 21 = double-V
data[0x0800 + 22] = 0x80;  // tile 22 = double-H
data[0x0800 + 23] = 0xC0;  // tile 23 = 2x2 (both)

// D_B3EF plane (offset 0x1400): breakthrough / ignore / background
data[0x1400 + 30] = 0x04;  // tile 30 = breakthrough
data[0x1400 + 31] = 0x10;  // tile 31 = ignore-only
data[0x1400 + 32] = 0x20;  // tile 32 = background
data[0x1400 + 33] = 0x04 | 0x10;  // tile 33 = breakthrough + ignore

const flags = new TileFlags(data);

// --- TerrainType accessors ---
check('isTerrainWet(10) = true',         flags.isTerrainWet(10) === true);
check('isTerrainWet(11) = false',        flags.isTerrainWet(11) === false);
check('isTerrainImpassable(11) = true',  flags.isTerrainImpassable(11) === true);
check('isTerrainImpassable(10) = false', flags.isTerrainImpassable(10) === false);
check('isTerrainWall(12) = true',        flags.isTerrainWall(12) === true);
check('isTerrainWall(11) = false',       flags.isTerrainWall(11) === false);
check('isTerrainDamage(13) = true',      flags.isTerrainDamage(13) === true);
check('isTerrainDamage(10) = false',     flags.isTerrainDamage(10) === false);
check('combined wet+impass (14): wet',   flags.isTerrainWet(14) === true);
check('combined wet+impass (14): impass', flags.isTerrainImpassable(14) === true);
check('all-zero (0): no terrain flags', !flags.isTerrainWet(0) && !flags.isTerrainImpassable(0) && !flags.isTerrainWall(0) && !flags.isTerrainDamage(0));

// --- TileFlag accessors (already existed; sanity-check they still read right plane) ---
check('isForeground(20) = true',   flags.isForeground(20) === true);
check('isDoubleHeight(21) = true', flags.isDoubleHeight(21) === true);
check('isDoubleWidth(22) = true',  flags.isDoubleWidth(22) === true);
check('2x2 anchor (23): both Hi+W', flags.isDoubleHeight(23) === true && flags.isDoubleWidth(23) === true);

// --- D_B3EF accessors ---
check('isBreakthrough(30) = true',     flags.isBreakthrough(30) === true);
check('isBreakthrough(31) = false',    flags.isBreakthrough(31) === false);
check('isTileIgnore(31) = true',       flags.isTileIgnore(31) === true);
check('isTileIgnore(30) = false',      flags.isTileIgnore(30) === false);
check('isBackground(32) = true',       flags.isBackground(32) === true);
check('isBackground(30) = false',      flags.isBackground(30) === false);
check('breakthrough+ignore (33): both', flags.isBreakthrough(33) === true && flags.isTileIgnore(33) === true);

// --- TileRegistry surfaces them all (one-line passthroughs) ---
const reg = new TileRegistry({ tiles: null, flags, palette: new Uint8Array(0) });
check('reg.isTerrainImpassable(11)',  reg.isTerrainImpassable(11) === true);
check('reg.isTerrainWet(10)',         reg.isTerrainWet(10) === true);
check('reg.isTerrainWall(12)',        reg.isTerrainWall(12) === true);
check('reg.isTerrainDamage(13)',      reg.isTerrainDamage(13) === true);
check('reg.isTileIgnore(31)',         reg.isTileIgnore(31) === true);
check('reg.isBreakthrough(30)',       reg.isBreakthrough(30) === true);

// --- plane isolation: setting a bit in plane A must not bleed into plane B ---
{
  const d2 = new Uint8Array(0x1C00);
  d2[40] = 0xFF;  // all TerrainType bits on tile 40
  const f2 = new TileFlags(d2);
  check('TerrainType bits do not bleed into TileFlag plane',
    !f2.isForeground(40) && !f2.isDoubleHeight(40) && !f2.isDoubleWidth(40));
  check('TerrainType bits do not bleed into D_B3EF plane',
    !f2.isBreakthrough(40) && !f2.isTileIgnore(40) && !f2.isBackground(40));
}

// --- boundary: tile 2047 (last) reads from the correct plane offset ---
{
  const d3 = new Uint8Array(0x1C00);
  d3[0x1400 + 2047] = 0x04;  // last tile, breakthrough on D_B3EF plane
  const f3 = new TileFlags(d3);
  check('last tile (2047) D_B3EF accessor', f3.isBreakthrough(2047) === true);
  check('last tile (2047) other planes empty', !f3.isForeground(2047) && !f3.isTerrainImpassable(2047));
}

// ============================================================================
// I-4c — canStandAt predicate
// ============================================================================
// Synthetic world fixtures exercise the walks-class subset of C_1E0F_000F:
// terrain check, per-cell object iteration via SpatialIndex (with 2x2 footprint
// expansion), Breakthrough/Ignore short-circuit, object-tile impassable bit,
// NPC always-blocks, skip-self.

// Build a minimal world with a stubbed MapLevel + populated SpatialIndex + tiles
// whose flags are set per `tileFlags` (per-plane bits, see I-4a section above).
function setupTestWorld({ terrainAt = {}, entities = [], tileFlags = {} } = {}) {
  const data = new Uint8Array(0x1C00);
  for (const [tile, planes] of Object.entries(tileFlags)) {
    const t = Number(tile);
    if (planes.terrain) data[0x0000 + t] = planes.terrain;  // TerrainType
    if (planes.tile)    data[0x0800 + t] = planes.tile;     // TileFlag
    if (planes.flag2)   data[0x1400 + t] = planes.flag2;    // D_B3EF
  }
  const reg = new TileRegistry({ tiles: null, flags: new TileFlags(data), palette: new Uint8Array(0) });

  // Stub MapLevel — just `tileAt(x,y)`. Object.create(MapLevel.prototype) keeps
  // `instance.constructor === MapLevel` so World.setResource keys it under MapLevel.
  const mapLevel = Object.create(MapLevel.prototype);
  mapLevel.tileAt = (x, y) => terrainAt[`${x},${y}`] ?? 0;   // tile 0 = no flags = passable

  const world = new World(1024)
    .registerComponent(Position)
    .registerComponent(Renderable)
    .registerComponent(Actor);

  const spatial = new SpatialIndex(1024);
  world.setResource(reg);
  world.setResource(spatial);
  world.setResource(mapLevel);

  const handles = [];
  for (const e of entities) {
    const h = world.create();
    world.add(h, Position, { x: e.x, y: e.y, z: 0 });
    world.add(h, Renderable, { tileId: e.tile });
    if (e.actor) world.add(h, Actor);
    spatial.insert(e.x, e.y, h);
    handles.push(h);
  }
  return { world, handles };
}

// --- empty cell ---
{
  const { world } = setupTestWorld();
  check('canStandAt: empty grass cell passes', canStandAt(world, 5, 5) === true);
}

// --- impassable terrain blocks ---
{
  const { world } = setupTestWorld({
    terrainAt: { '5,5': 101 },
    tileFlags: { 101: { terrain: 0x02 } },
  });
  check('canStandAt: impassable terrain blocks', canStandAt(world, 5, 5) === false);
}

// --- breakthrough object on impassable terrain overrides → pass ---
{
  const { world } = setupTestWorld({
    terrainAt: { '5,5': 101 },
    tileFlags: {
      101: { terrain: 0x02 },   // water-like
      300: { flag2: 0x04 },     // breakthrough (e.g. a plank / ladder)
    },
    entities: [{ x: 5, y: 5, tile: 300 }],
  });
  check('canStandAt: breakthrough overrides impassable terrain', canStandAt(world, 5, 5) === true);
}

// --- impassable object on passable terrain blocks ---
{
  const { world } = setupTestWorld({
    tileFlags: { 200: { terrain: 0x02 } },   // e.g. table
    entities: [{ x: 5, y: 5, tile: 200 }],
  });
  check('canStandAt: impassable object blocks', canStandAt(world, 5, 5) === false);
}

// --- door open/closed via per-frame tile flags ---
{
  const { world } = setupTestWorld({
    tileFlags: { 210: { terrain: 0x02 } },   // closed-door frame: impassable
    entities: [{ x: 5, y: 5, tile: 210 }],
  });
  check('canStandAt: closed door blocks', canStandAt(world, 5, 5) === false);
}
{
  const { world } = setupTestWorld({
    tileFlags: { 218: {} },                  // open-door frame: no flags
    entities: [{ x: 5, y: 5, tile: 218 }],
  });
  check('canStandAt: open door passes', canStandAt(world, 5, 5) === true);
}

// --- NPC always blocks (Actor tag) ---
{
  const { world } = setupTestWorld({
    entities: [{ x: 5, y: 5, tile: 0, actor: true }],
  });
  check('canStandAt: NPC blocks', canStandAt(world, 5, 5) === false);
}

// --- skip self: actorId at (5,5) doesn't block its own destination ---
{
  const { world, handles } = setupTestWorld({
    entities: [{ x: 5, y: 5, tile: 0, actor: true }],
  });
  check('canStandAt: actorId skips self', canStandAt(world, 5, 5, { actorId: handles[0] }) === true);
}

// --- 2x2 anchor at (6,6) covers (5,5), (6,5), (5,6), (6,6); each blocks ---
{
  const { world } = setupTestWorld({
    tileFlags: {
      410: { terrain: 0x02, tile: 0x40 | 0x80 },  // anchor: doubleV+doubleH
      409: { terrain: 0x02 },                       // W extension (tile-1)
      408: { terrain: 0x02 },                       // N extension (tile-2)
      407: { terrain: 0x02 },                       // NW extension (tile-3)
    },
    entities: [{ x: 6, y: 6, tile: 410 }],
  });
  check('canStandAt: 2x2 anchor blocks itself (6,6)',     canStandAt(world, 6, 6) === false);
  check('canStandAt: 2x2 anchor blocks W cell (5,6)',     canStandAt(world, 5, 6) === false);
  check('canStandAt: 2x2 anchor blocks N cell (6,5)',     canStandAt(world, 6, 5) === false);
  check('canStandAt: 2x2 anchor blocks NW cell (5,5)',    canStandAt(world, 5, 5) === false);
  check('canStandAt: 2x2 anchor does NOT touch (4,6)',    canStandAt(world, 4, 6) === true);
  check('canStandAt: 2x2 anchor does NOT touch (7,6)',    canStandAt(world, 7, 6) === true);
  check('canStandAt: 2x2 anchor does NOT touch (6,7)',    canStandAt(world, 6, 7) === true);
  check('canStandAt: 2x2 anchor does NOT touch (5,4)',    canStandAt(world, 5, 4) === true);
}

// --- Breakthrough + Ignore: scan continues; an NPC on the same cell still blocks ---
{
  const { world } = setupTestWorld({
    tileFlags: { 300: { flag2: 0x04 | 0x10 } },   // Breakthrough + Ignore
    entities: [
      { x: 5, y: 5, tile: 300 },                    // Breakthrough (loaded first)
      { x: 5, y: 5, tile: 0, actor: true },         // NPC      (loaded second, scanned first)
    ],
  });
  check('canStandAt: Breakthrough+Ignore + NPC → NPC still blocks', canStandAt(world, 5, 5) === false);
}

// --- Breakthrough WITHOUT Ignore short-circuits: a later blocker is not seen ---
{
  // Scan order: REVERSE of load order. Load NPC FIRST so it's scanned LAST.
  // Load Breakthrough (no Ignore) SECOND so it's scanned FIRST and short-circuits.
  const { world } = setupTestWorld({
    tileFlags: { 300: { flag2: 0x04 } },           // Breakthrough only
    entities: [
      { x: 5, y: 5, tile: 0, actor: true },         // NPC      (loaded first, scanned LAST)
      { x: 5, y: 5, tile: 300 },                    // Breakthrough (loaded last, scanned FIRST)
    ],
  });
  check('canStandAt: Breakthrough w/o Ignore short-circuits past later NPC', canStandAt(world, 5, 5) === true);
}

// --- multiple actors at neighbour cells don't bleed into (x,y) ---
{
  const { world } = setupTestWorld({
    entities: [
      { x: 6, y: 6, tile: 0, actor: true },         // NPC at (6,6), 1-tile
      { x: 5, y: 6, tile: 0, actor: true },         // NPC at (5,6), 1-tile
    ],
  });
  check('canStandAt: neighbour NPCs do not block (5,5)', canStandAt(world, 5, 5) === true);
}

// --- report ---
const summary = `${pass} passed, ${fail} failed`;
console.log(`\n=== I-4 passability: ${summary} ===`);
if (typeof document !== 'undefined') {
  const el = document.getElementById('out');
  if (el) {
    el.innerHTML =
      `<h2 class="${fail ? 'fail' : 'pass'}">I-4 passability: ${summary}</h2>` +
      results.map(r => `<div class="${r.ok ? 'pass' : 'fail'}">${r.ok ? '✓' : '✗'} ${r.name}</div>`).join('');
  }
}
window.__I4_RESULT__ = { pass, fail, results };
