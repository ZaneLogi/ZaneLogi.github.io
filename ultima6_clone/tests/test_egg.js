// In-memory verification for the egg subsystem (I-egg). Sub-step a: data + decode +
// the world read path — pure logic, no U6 data / no rendering. Open tests/test_egg.html
// via the dev server; results log to console + page. Grows per sub-step (a -> b/c/d-visual/e/f).
//
// Decode anchors are the real factory-data eggs verified live (research_egg.md §7/§8):
// throne (307,350) qual=2/quan=100 + OBJ_16B embryo qual=8/quan=3/status=0x28; the
// night egg (307,360) qual=21; the chaotic qual=4 and neutral qual=1 eggs.

import { World } from '../ecs/world.js';
import { SpatialIndex } from '../resources/spatial_index.js';
import { MapLevel } from '../resources/map_level.js';
import { TileRegistry } from '../resources/tile_registry.js';
import { WorldClock } from '../resources/world_clock.js';
import { canStandAt } from '../systems/passability.js';
import { Position, Renderable, ObjType, Status, Amount, Actor, PartyMember, Container, ContainedIn, AIMode, Alignment, MoveSpeed, Destination, Spawned } from '../components/components.js';
import { AI_MOTIONLESS, AI_GRAZE } from '../systems/ai_modes.js';
import {
  decodeEgg, decodeEmbryo, readEgg, findEggs, isEgg, hatchEgg, spawnCreature, scatterCell,
  buildMultiTileBody, installEggPartFollowSystem, isMultiTileHead, hatchAroundAvatar, cullAroundAvatar,
  shouldPacifyGargoyles, resetShaminoWarning,
  OBJ_EGG, OBJ_16A, OBJ_16B, OBJ_19B, OBJ_176, OBJ_19D, OBJ_16D, OBJ_16E, OBJ_1A9, OBJ_1AA, OBJ_AMULET_SUBMISSION,
  ST_LOCAL, ST_OWNED, ST_HATCHED, ST_INVISIBLE, ST_MUTANT,
  ALIGN_NEUTRAL, ALIGN_EVIL, ALIGN_GOOD, ALIGN_CHAOTIC,
  TIME_ANYTIME, TIME_DAY, TIME_NIGHT,
} from '../systems/egg.js';

const results = [];
let pass = 0, fail = 0;
function check(name, cond) {
  const ok = !!cond;
  if (ok) pass++; else fail++;
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
}

// ── decodeEgg: time gate (Qual / 10) ──────────────────────────────────────
{
  check('time: qual 2 -> anytime',  decodeEgg(2, 100).timeGate === TIME_ANYTIME);
  check('time: qual 1 -> anytime',  decodeEgg(1, 100).timeGate === TIME_ANYTIME);
  check('time: qual 11 -> DAY',     decodeEgg(11, 100).timeGate === TIME_DAY);
  check('time: qual 21 -> NIGHT (the (307,360) night egg)', decodeEgg(21, 66).timeGate === TIME_NIGHT);
  check('time: qual 25 -> NIGHT',   decodeEgg(25, 100).timeGate === TIME_NIGHT);
}

// ── decodeEgg: alignment override (Qual % 10), applied only when != 0 ──────
{
  check('align: qual 0 -> no override (null, keep class default)', decodeEgg(0, 50).alignmentOverride === null);
  check('align: qual 10 -> no override (d=0)',                     decodeEgg(10, 50).alignmentOverride === null);
  check('align: qual 1 -> explicit NEUTRAL (0x00, NOT null)',      decodeEgg(1, 100).alignmentOverride === ALIGN_NEUTRAL);
  check('align: qual 2 -> EVIL (throne egg)',                      decodeEgg(2, 100).alignmentOverride === ALIGN_EVIL);
  check('align: qual 3 -> GOOD',                                   decodeEgg(3, 100).alignmentOverride === ALIGN_GOOD);
  check('align: qual 4 -> CHAOTIC (the qual=4 eggs)',              decodeEgg(4, 50).alignmentOverride === ALIGN_CHAOTIC);
  check('align: qual 21 -> NEUTRAL (night + d=1)',                 decodeEgg(21, 66).alignmentOverride === ALIGN_NEUTRAL);
  // d=1 is an explicit override (0x00) but still "has an override" vs d=0 (null) — they differ.
  check('align: d=1 (qual 1) differs from d=0 (qual 0)',
    decodeEgg(1, 100).alignmentOverride !== decodeEgg(0, 100).alignmentOverride);
}

// ── decodeEgg: hatch chance + exact-count flag (Quan) ──────────────────────
{
  const e100 = decodeEgg(2, 100), e66 = decodeEgg(21, 66), e50 = decodeEgg(4, 50);
  check('quan: 100 -> hatchChance 100 + exactCounts true', e100.hatchChance === 100 && e100.exactCounts === true);
  check('quan: 66  -> hatchChance 66  + exactCounts false', e66.hatchChance === 66 && e66.exactCounts === false);
  check('quan: 50  -> hatchChance 50  + exactCounts false', e50.hatchChance === 50 && e50.exactCounts === false);
  check('decodeEgg echoes raw qual/quan', e100.qual === 2 && e100.quan === 100);
}

// ── decodeEmbryo: count / AI mode / mutant ────────────────────────────────
{
  // Throne gargoyle: OBJ_16B, qual=8 (AI_ASSAULT), quan=3, status 0x28 (LOCAL|CONTAINED, not MUTANT).
  const g = decodeEmbryo(0x16B, 8, 3, 0x28);
  check('embryo: throne gargoyle count 3',        g.count === 3);
  check('embryo: throne gargoyle aiMode 8 (raw)', g.aiMode === 8);
  check('embryo: throne gargoyle NOT mutant (0x40 clear in 0x28)', g.mutant === false);
  check('embryo: objNumber echoed',               g.objNumber === 0x16B);
  // MUTANT bit set -> two-headed.
  check('embryo: status with 0x40 -> mutant true', decodeEmbryo(0x16B, 8, 1, ST_MUTANT | ST_LOCAL).mutant === true);
  // AI mode is carried verbatim regardless of value (no gating, §9.1 pt 5).
  check('embryo: arbitrary aiMode carried raw', decodeEmbryo(0x176, 0x0c, 2, 0).aiMode === 0x0c);
}

// ── readEgg + findEggs + isEgg: the world read path ───────────────────────
function buildEggWorld() {
  const world = new World(256)
    .registerComponent(Position).registerComponent(Renderable).registerComponent(ObjType)
    .registerComponent(Status).registerComponent(Amount)
    .registerComponent(Container).registerComponent(ContainedIn);
  world.setResource(new SpatialIndex(256));
  return world;
}
function makeEgg(world, { x, y, z = 0, qual, quan, status = 0 }) {
  const e = world.create();
  world.add(e, Position, { x, y, z });
  world.add(e, ObjType, { objNumber: OBJ_EGG, frame: 0, origObjNumber: OBJ_EGG });
  world.add(e, Status, { bits: status });
  world.add(e, Amount, { quantity: quan, quality: qual });
  world.getResource(SpatialIndex).insert(x, y, e);
  return e;
}
function addEmbryo(world, eggHandle, { objNumber, qual, quan, status }) {
  const e = world.create();
  world.add(e, ObjType, { objNumber, frame: 0, origObjNumber: objNumber });
  world.add(e, Status, { bits: status });
  world.add(e, Amount, { quantity: quan, quality: qual });
  world.add(e, ContainedIn, { holder: eggHandle, equipped: 0 });
  if (!world.has(eggHandle, Container)) world.add(eggHandle, Container);
  return e;
}

// Rebuild the live throne egg (307,350): LOCAL, un-hatched, qual=2/quan=100, one OBJ_16B embryo.
{
  const world = buildEggWorld();
  const egg = makeEgg(world, { x: 307, y: 350, qual: 2, quan: 100, status: ST_LOCAL });
  addEmbryo(world, egg, { objNumber: 0x16B, qual: 8, quan: 3, status: ST_LOCAL | 0x08 });   // 0x28
  const t = readEgg(world, egg);
  check('readEgg: throne decodes EVIL/anytime/100%/exact',
    t.alignmentOverride === ALIGN_EVIL && t.timeGate === TIME_ANYTIME && t.hatchChance === 100 && t.exactCounts === true);
  check('readEgg: throne is LOCAL, un-hatched, not invisible',
    t.local === true && t.hatched === false && t.invisible === false);
  check('readEgg: throne has one gargoyle embryo (3 x OBJ_16B, AI 8)',
    t.embryos.length === 1 && t.embryos[0].objNumber === 0x16B && t.embryos[0].count === 3 && t.embryos[0].aiMode === 8);
  check('isEgg: the throne handle is an egg', isEgg(world, egg) === true);
}

// A hatched egg ends up HATCHED|LOCAL|INVISIBLE = 0x62 (research_egg.md §1/§8 played-save state).
{
  const world = buildEggWorld();
  const egg = makeEgg(world, { x: 307, y: 350, qual: 2, quan: 100, status: ST_HATCHED | ST_LOCAL | ST_INVISIBLE });
  const t = readEgg(world, egg);
  check('readEgg: status 0x62 -> hatched + local + invisible',
    t.status === 0x62 && t.hatched === true && t.local === true && t.invisible === true);
}

// Multiple embryos in one egg are all read.
{
  const world = buildEggWorld();
  const egg = makeEgg(world, { x: 10, y: 10, qual: 0, quan: 50, status: 0 });
  addEmbryo(world, egg, { objNumber: 0x176, qual: 0x0c, quan: 1, status: ST_MUTANT });   // mutant hydra
  addEmbryo(world, egg, { objNumber: 0x16B, qual: 8, quan: 2, status: 0x08 });
  const t = readEgg(world, egg);
  check('readEgg: two embryos read', t.embryos.length === 2);
  check('readEgg: no-override egg keeps class default (alignmentOverride null)', t.alignmentOverride === null);
  check('readEgg: mutant embryo flagged', t.embryos.some(em => em.objNumber === 0x176 && em.mutant === true));
  check('readEgg: non-mutant embryo not flagged', t.embryos.some(em => em.objNumber === 0x16B && em.mutant === false));
}

// findEggs + level filter + non-egg rejection.
{
  const world = buildEggWorld();
  const e0 = makeEgg(world, { x: 1, y: 1, z: 0, qual: 1, quan: 100 });
  makeEgg(world, { x: 2, y: 2, z: 0, qual: 4, quan: 50 });
  makeEgg(world, { x: 3, y: 3, z: 5, qual: 11, quan: 100 });   // dungeon level 5
  // a non-egg on-map object must NOT be returned
  const ne = world.create();
  world.add(ne, Position, { x: 4, y: 4, z: 0 });
  world.add(ne, ObjType, { objNumber: 0x131, frame: 0, origObjNumber: 0x131 });   // a ladder, not an egg
  world.add(ne, Status, { bits: 0 });
  world.add(ne, Amount, { quantity: 1, quality: 0 });
  world.getResource(SpatialIndex).insert(4, 4, ne);

  check('findEggs: finds all 3 eggs (no filter)', findEggs(world).length === 3);
  check('findEggs: z=0 filter -> 2 surface eggs', findEggs(world, { z: 0 }).length === 2);
  check('findEggs: z=5 filter -> 1 dungeon egg', findEggs(world, { z: 5 }).length === 1);
  check('isEgg: a ladder is not an egg', isEgg(world, world.handleOf(world.resolve(ne))) === false);
  check('readEgg: on a non-egg handle returns null', readEgg(world, world.handleOf(world.resolve(ne))) === null);
  check('readEgg: on a stale handle returns null', readEgg(world, 999999) === null);
}

// ── (b) hatch core: gates, roll, embryo loop, placement, latch ────────────
// A fuller world for the hatch path: spawnCreature→addMapObject needs TileRegistry, and
// scatter→canStandAt needs TileRegistry + MapLevel. Stub both to all-passable open ground.
function buildHatchWorld(timeH = 12) {
  // Actor is registered (unused by the hatch path itself) so canStandAt's world.has(h, Actor)
  // is valid — its component is imported via passability and must exist in the world.
  const world = new World(512)
    .registerComponent(Position).registerComponent(Renderable).registerComponent(ObjType)
    .registerComponent(Status).registerComponent(Amount).registerComponent(Actor).registerComponent(PartyMember)
    .registerComponent(Container).registerComponent(ContainedIn)
    .registerComponent(AIMode).registerComponent(Destination)
    .registerComponent(Alignment).registerComponent(MoveSpeed).registerComponent(Spawned);
  world.setResource(new SpatialIndex(1024));
  const ml = new MapLevel(null, 0); ml.tileAt = () => 0;            // all-passable stub terrain
  world.setResource(ml);
  world.setResource(new WorldClock({ Time_H: timeH, Time_M: 0, Date_D: 4 }));
  const passable = {
    isForeground: () => false, isBackground: () => false, isDoubleHeight: () => false,
    isDoubleWidth: () => false, isBreakthrough: () => false, isTileIgnore: () => false,
    isTerrainImpassable: () => false, terrainCost: () => 0,
  };
  world.setResource(new TileRegistry({ tiles: { getTilePixels: () => null }, flags: passable, palette: null, baseTile: { tileFor: (o) => o } }));
  return world;
}

function makeEggIn(world, { x, y, z = 0, qual, quan, status = 0 }) {
  const e = world.create();
  world.add(e, Position, { x, y, z });
  world.add(e, ObjType, { objNumber: OBJ_EGG, frame: 0, origObjNumber: OBJ_EGG });
  world.add(e, Status, { bits: status });
  world.add(e, Amount, { quantity: quan, quality: qual });
  world.getResource(SpatialIndex).insert(x, y, e);
  return e;
}
function addEmbryoIn(world, eggHandle, { objNumber, qual, quan, status }) {
  const e = world.create();
  world.add(e, ObjType, { objNumber, frame: 0, origObjNumber: objNumber });
  world.add(e, Status, { bits: status });
  world.add(e, Amount, { quantity: quan, quality: qual });
  world.add(e, ContainedIn, { holder: eggHandle, equipped: 0 });
  if (!world.has(eggHandle, Container)) world.add(eggHandle, Container);
  return e;
}
// Deterministic RNG: hatch roll returns `roll`; scatter offsets sweep distinct cells along a
// row; any other range returns its low bound.
function seqRand(roll = 1) {
  let n = 0;
  return (a, b) => {
    if (a === 1 && b === 100) return roll;
    if (a === -3 && b === 3) { const v = (n % 2 === 0) ? Math.min(1 + (n >> 1), 3) : 0; n++; return v; }
    return a;
  };
}

// Throne ambush: LOCAL egg, Quan=100 (always rolls, exact count), one OBJ_16B Quan=3/Qual=8.
{
  const world = buildHatchWorld(12);
  const egg = makeEggIn(world, { x: 307, y: 350, qual: 2, quan: 100, status: ST_LOCAL });
  addEmbryoIn(world, egg, { objNumber: OBJ_16B, qual: 8, quan: 3, status: ST_LOCAL | 0x08 });
  const r = hatchEgg(world, egg, { rand: seqRand(1) });
  check('hatch(throne): rolled + latched', r.rolled === true && r.latched === true);
  check('hatch(throne): spawned exactly 3', r.spawns.length === 3);
  const obj = world.store(ObjType), am = world.store(AIMode), al = world.store(Alignment), pos = world.store(Position);
  const idxs = r.spawns.map(h => world.resolve(h));
  check('hatch(throne): all 3 are OBJ_16B', idxs.every(i => obj.objNumber[i] === OBJ_16B));
  check('hatch(throne): all AI mode 8 (AI_ASSAULT, from embryo Qual)', idxs.every(i => am.mode[i] === 8));
  check('hatch(throne): all EVIL (egg Qual%10=2 override)', idxs.every(i => al.value[i] === ALIGN_EVIL));
  check('hatch(throne): all tagged Spawned', r.spawns.every(h => world.has(h, Spawned)));
  check('hatch(throne): all have MoveSpeed + Destination', r.spawns.every(h => world.has(h, MoveSpeed) && world.has(h, Destination)));
  check('hatch(throne): firstborn sits on the egg cell (307,350)', idxs.some(i => pos.x[i] === 307 && pos.y[i] === 350));
  check('hatch(throne): the 3 land on distinct cells', new Set(idxs.map(i => pos.x[i] + ',' + pos.y[i])).size === 3);
  check('hatch(throne): all within ±3 of the egg', idxs.every(i => Math.abs(pos.x[i] - 307) <= 3 && Math.abs(pos.y[i] - 350) <= 3));
  // egg latched to HATCHED|LOCAL|INVISIBLE = 0x62, and is now "hatched"
  check('hatch(throne): egg latched 0x62 (HATCHED|LOCAL|INVISIBLE)', world.store(Status).bits[world.resolve(egg)] === 0x62);
  check('hatch(throne): readEgg now reports hatched', readEgg(world, egg).hatched === true);
}

// A spawned creature blocks canStandAt (occupancy via the Spawned tag).
{
  const world = buildHatchWorld(12);
  const c = spawnCreature(world, { objNumber: OBJ_16B, x: 100, y: 100, z: 0, aiMode: 8, alignment: ALIGN_EVIL });
  check('occupancy: a spawned creature blocks its cell', canStandAt(world, 100, 100, {}) === false);
  check('occupancy: an empty adjacent cell is free', canStandAt(world, 101, 100, {}) === true);
  check('occupancy: the creature itself is excluded (actorId)', canStandAt(world, 100, 100, { actorId: c }) === true);
  check('occupancy: status is LOCAL|OWNED (source AddMonster)', world.store(Status).bits[world.resolve(c)] === (ST_LOCAL | ST_OWNED));
}

// Re-hatch gate: an already-HATCHED egg spawns nothing but still latches (no double-hatch).
{
  const world = buildHatchWorld(12);
  const egg = makeEggIn(world, { x: 10, y: 10, qual: 2, quan: 100, status: ST_LOCAL | ST_HATCHED });
  addEmbryoIn(world, egg, { objNumber: OBJ_16B, qual: 8, quan: 3, status: ST_LOCAL | 0x08 });
  const r = hatchEgg(world, egg, { rand: seqRand(1) });
  check('re-hatch: already-hatched egg spawns nothing', r.spawns.length === 0 && r.alreadyHatched === true);
  check('re-hatch: still reports latched', r.latched === true);
}

// Hatch roll: a <100% egg with a failing roll spawns nothing but STILL latches (source-faithful).
{
  const world = buildHatchWorld(12);
  const egg = makeEggIn(world, { x: 20, y: 20, qual: 0, quan: 50, status: 0 });
  addEmbryoIn(world, egg, { objNumber: OBJ_16B, qual: 8, quan: 2, status: 0x08 });
  const rFail = hatchEgg(world, egg, { rand: () => 51 });   // 51 > 50 → roll fails
  check('roll: failed roll spawns nothing', rFail.rolled === false && rFail.spawns.length === 0);
  check('roll: failed roll STILL latches HATCHED (no re-roll until re-armed)',
    (world.store(Status).bits[world.resolve(egg)] & ST_HATCHED) !== 0);
}
// Hatch roll: a <100% egg with a passing roll randomizes the count (rand(1,count)).
{
  const world = buildHatchWorld(12);
  const egg = makeEggIn(world, { x: 30, y: 30, qual: 0, quan: 50, status: 0 });
  addEmbryoIn(world, egg, { objNumber: OBJ_16B, qual: 8, quan: 4, status: 0x08 });
  // rand: (1,100)->10 (<=50, rolls), (1,4)->1 (count reduced to 1), (-3,3)->0
  const r = hatchEgg(world, egg, { rand: (a, b) => (a === 1 && b === 100) ? 10 : (a === 1 && b === 4) ? 1 : 0 });
  check('roll: <100% egg reduces count to rand(1,count)=1', r.rolled === true && r.spawns.length === 1);
  check('roll: no-override egg (Qual%10=0) keeps NEUTRAL placeholder',
    world.store(Alignment).value[world.resolve(r.spawns[0])] === ALIGN_NEUTRAL);
}

// Day/night gates: day egg out of window doesn't hatch OR latch; in window it does.
{
  const night = buildHatchWorld(2);    // 02:00
  const dayEgg = makeEggIn(night, { x: 40, y: 40, qual: 11, quan: 100, status: 0 });   // Qual/10=1 DAY
  addEmbryoIn(night, dayEgg, { objNumber: OBJ_16B, qual: 8, quan: 1, status: 0x08 });
  const r1 = hatchEgg(night, dayEgg, { rand: seqRand(1) });
  check('gate: DAY egg at 02:00 does NOT hatch', r1.rolled === false && r1.spawns.length === 0);
  check('gate: DAY egg out of window does NOT latch (stays armed)',
    (night.store(Status).bits[night.resolve(dayEgg)] & ST_HATCHED) === 0 && r1.reason === 'not-day');

  const day = buildHatchWorld(12);     // 12:00
  const dayEgg2 = makeEggIn(day, { x: 41, y: 41, qual: 11, quan: 100, status: 0 });
  addEmbryoIn(day, dayEgg2, { objNumber: OBJ_16B, qual: 8, quan: 1, status: 0x08 });
  check('gate: DAY egg at noon hatches', hatchEgg(day, dayEgg2, { rand: seqRand(1) }).spawns.length === 1);
}
{
  const day = buildHatchWorld(12);     // 12:00 — night egg should NOT hatch
  const nightEgg = makeEggIn(day, { x: 50, y: 50, qual: 21, quan: 100, status: 0 });   // Qual/10=2 NIGHT
  addEmbryoIn(day, nightEgg, { objNumber: OBJ_16B, qual: 8, quan: 1, status: 0x08 });
  const r = hatchEgg(day, nightEgg, { rand: seqRand(1) });
  check('gate: NIGHT egg at noon does NOT hatch or latch', r.rolled === false && r.reason === 'not-night');

  const night = buildHatchWorld(23);   // 23:00 — night egg hatches
  const nightEgg2 = makeEggIn(night, { x: 51, y: 51, qual: 21, quan: 100, status: 0 });
  addEmbryoIn(night, nightEgg2, { objNumber: OBJ_16B, qual: 8, quan: 1, status: 0x08 });
  check('gate: NIGHT egg at 23:00 hatches', hatchEgg(night, nightEgg2, { rand: seqRand(1) }).spawns.length === 1);
}

// Armageddon gate: nothing hatches or latches.
{
  const world = buildHatchWorld(12);
  const egg = makeEggIn(world, { x: 60, y: 60, qual: 2, quan: 100, status: ST_LOCAL });
  addEmbryoIn(world, egg, { objNumber: OBJ_16B, qual: 8, quan: 3, status: ST_LOCAL | 0x08 });
  const r = hatchEgg(world, egg, { rand: seqRand(1), armageddon: true });
  check('gate: Armageddon → no hatch, no latch', r.spawns.length === 0 &&
    (world.store(Status).bits[world.resolve(egg)] & ST_HATCHED) === 0 && r.reason === 'armageddon');
}

// Gargoyle pacification path (the f param): forceGarglGraze → gargoyle embryo hatches AI_GRAZE.
{
  const world = buildHatchWorld(12);
  const egg = makeEggIn(world, { x: 70, y: 70, qual: 2, quan: 100, status: ST_LOCAL });
  addEmbryoIn(world, egg, { objNumber: OBJ_16B, qual: 8, quan: 1, status: ST_LOCAL | 0x08 });
  const r = hatchEgg(world, egg, { rand: seqRand(1), forceGarglGraze: true });
  check('pacify: forceGarglGraze → gargoyle hatches AI_GRAZE (not the embryo Qual 8)',
    world.store(AIMode).mode[world.resolve(r.spawns[0])] === AI_GRAZE);
}

// Simple spawn (embryo objNumber < OBJ_156): a plain map object, no AI, not Spawned-tagged.
{
  const world = buildHatchWorld(12);
  const egg = makeEggIn(world, { x: 80, y: 80, qual: 0, quan: 100, status: 0 });
  addEmbryoIn(world, egg, { objNumber: 0x0C0, qual: 0, quan: 1, status: 0x08 });   // 0xC0 < 0x156 → simple
  const r = hatchEgg(world, egg, { rand: seqRand(1) });
  check('simple: a sub-OBJ_156 embryo spawns a plain object', r.spawns.length === 1);
  check('simple: it is NOT AI-stamped (no AIMode)', !world.has(r.spawns[0], AIMode));
  check('simple: it is NOT Spawned-tagged (map-object pool, not culled)', !world.has(r.spawns[0], Spawned));
}

// scatterCell: respects the on-screen rejection when onScreenNotOk.
{
  const world = buildHatchWorld(12);
  // isOnScreen rejects everything → no placement possible → null
  const none = scatterCell(world, 100, 100, 0, { rand: seqRand(1), onScreenNotOk: true, isOnScreen: () => true });
  check('scatter: onScreenNotOk + all-on-screen → null (unplaceable)', none === null);
  // isOnScreen rejects nothing → a cell within ±3 is returned
  const cell = scatterCell(world, 100, 100, 0, { rand: seqRand(1), onScreenNotOk: true, isOnScreen: () => false });
  check('scatter: a free off-screen cell is found within ±3',
    cell !== null && Math.abs(cell.x - 100) <= 3 && Math.abs(cell.y - 100) <= 3);
}

// ── (d-visual) multi-tile bodies: geometry, integration, follow, self-block ──
const partsOf = (world, head) => {
  const sp = world.store(Spawned), obj = world.store(ObjType), pos = world.store(Position);
  const out = [];
  for (const i of world.query(Spawned, Position)) if (sp.body[i] === head)
    out.push({ obj: obj.objNumber[i], frame: obj.frame[i], x: pos.x[i], y: pos.y[i], ox: sp.ox[i], oy: sp.oy[i] });
  return out;
};

// isMultiTileHead classification
{
  check('classify: dragon/hydra/serpent/vine are multi-tile', [OBJ_19B, OBJ_176, OBJ_19D, OBJ_16D].every(isMultiTileHead));
  check('classify: winged gargoyle is multi-tile (single 2x2 entity)', isMultiTileHead(OBJ_16A) === true);
  check('classify: two-part (>=0x1AA) is multi-tile', isMultiTileHead(0x1AC) === true && isMultiTileHead(OBJ_1AA) === true);
  check('classify: a plain gargoyle (OBJ_16B) is NOT multi-tile', isMultiTileHead(OBJ_16B) === false);
}

// Dragon: head frame 0 + 4 parts (N head8 / S tail16 / W wing24 / E wing32).
{
  const world = buildHatchWorld(12);
  const head = spawnCreature(world, { objNumber: OBJ_19B, x: 50, y: 50, z: 0, aiMode: 8, alignment: ALIGN_EVIL });
  const parts = buildMultiTileBody(world, head, OBJ_19B, 50, 50, 0, false, 0);
  check('dragon: head frame set to 0', world.store(ObjType).frame[world.resolve(head)] === 0);
  check('dragon: 4 parts built', parts.length === 4);
  const p = partsOf(world, head);
  const at = (x, y) => p.find(q => q.x === x && q.y === y);
  check('dragon: head part N at (50,49) frame 0x08', at(50, 49) && at(50, 49).frame === 0x08);
  check('dragon: tail part S at (50,51) frame 0x10', at(50, 51) && at(50, 51).frame === 0x10);
  check('dragon: L wing W at (49,50) frame 0x18', at(49, 50) && at(49, 50).frame === 0x18);
  check('dragon: R wing E at (51,50) frame 0x20', at(51, 50) && at(51, 50).frame === 0x20);
  check('dragon: every part is OBJ_19B + linked to the head', p.every(q => q.obj === OBJ_19B));
  check('dragon: offsets recorded for follow', at(50, 49).oy === -1 && at(51, 50).ox === 1);
}

// Hydra: body + 8 OBJ_1A9 heads (frames 0..7) at the 8 surrounding cells.
{
  const world = buildHatchWorld(12);
  const head = spawnCreature(world, { objNumber: OBJ_176, x: 60, y: 60, z: 0, aiMode: 8, alignment: ALIGN_EVIL });
  const parts = buildMultiTileBody(world, head, OBJ_176, 60, 60, 0, false, 0);
  check('hydra: 8 head parts', parts.length === 8);
  const p = partsOf(world, head);
  check('hydra: all parts are OBJ_1A9', p.every(q => q.obj === OBJ_1A9));
  check('hydra: frames 0..7 all present', new Set(p.map(q => q.frame)).size === 8 && Math.max(...p.map(q => q.frame)) === 7);
  check('hydra: parts ring the body (none on the body cell)', !p.some(q => q.x === 60 && q.y === 60));
  check('hydra: 8 distinct cells', new Set(p.map(q => q.x + ',' + q.y)).size === 8);
}

// Two-part: body frame 6 + one east part (frame 0xe; frame 2 if mutant).
{
  const world = buildHatchWorld(12);
  const cow = spawnCreature(world, { objNumber: 0x1AC, x: 70, y: 70, z: 0, aiMode: AI_GRAZE, alignment: ALIGN_NEUTRAL });
  buildMultiTileBody(world, cow, 0x1AC, 70, 70, 0, false, 0);
  check('two-part: body frame set to 6', world.store(ObjType).frame[world.resolve(cow)] === 6);
  const p = partsOf(world, cow);
  check('two-part: one east part at (71,70) frame 0xe', p.length === 1 && p[0].x === 71 && p[0].y === 70 && p[0].frame === 0xe);
  const world2 = buildHatchWorld(12);
  const mut = spawnCreature(world2, { objNumber: 0x1AC, x: 70, y: 70, z: 0, aiMode: 8, alignment: ALIGN_NEUTRAL });
  buildMultiTileBody(world2, mut, 0x1AC, 70, 70, 0, true, 0);
  check('two-part: mutant east part uses frame 2', partsOf(world2, mut)[0].frame === 2);
}

// Winged gargoyle: single 2x2 entity, frame 0x13, NO parts.
{
  const world = buildHatchWorld(12);
  const wg = spawnCreature(world, { objNumber: OBJ_16A, x: 80, y: 80, z: 0, aiMode: 8, alignment: ALIGN_EVIL });
  const parts = buildMultiTileBody(world, wg, OBJ_16A, 80, 80, 0, false, 0);
  check('winged gargoyle: frame set to 0x13', world.store(ObjType).frame[world.resolve(wg)] === 0x13);
  check('winged gargoyle: NO separate parts (single footprint-sprite)', parts.length === 0);
}

// Tangle vine: vine + 4 OBJ_16E tentacles at the cardinals (N/E/S/W).
{
  const world = buildHatchWorld(12);
  const vine = spawnCreature(world, { objNumber: OBJ_16D, x: 90, y: 90, z: 0, aiMode: 0xe, alignment: ALIGN_NEUTRAL });
  const parts = buildMultiTileBody(world, vine, OBJ_16D, 90, 90, 0, false, 0);
  check('vine: 4 tentacles', parts.length === 4);
  const p = partsOf(world, vine);
  check('vine: all tentacles OBJ_16E', p.every(q => q.obj === OBJ_16E));
  check('vine: at the 4 cardinals', ['90,89', '91,90', '90,91', '89,90'].every(k => p.some(q => q.x + ',' + q.y === k)));
}

// Silver serpent: head + (Quan+1) segments; last segment gets a tail frame.
{
  const world = buildHatchWorld(12);
  const s = spawnCreature(world, { objNumber: OBJ_19D, x: 40, y: 40, z: 0, aiMode: 8, alignment: ALIGN_EVIL });
  const parts = buildMultiTileBody(world, s, OBJ_19D, 40, 40, 0, false, 3);   // embryoQuan=3 → 4 segments
  check('serpent: 4 segments (Quan+1)', parts.length === 4);
  const p = partsOf(world, s);
  check('serpent: last segment carries a tail frame (0x1/3/5/7)', p.some(q => [0x1, 0x3, 0x5, 0x7].includes(q.frame)));
  check('serpent: a curl segment carries a curve frame (0xA-0xD)', p.some(q => [0xA, 0xB, 0xC, 0xD].includes(q.frame)));
}

// Integration: a dragon egg hatches 1 head + 4 parts = 5 spawns, all linked.
{
  const world = buildHatchWorld(12);
  const egg = makeEggIn(world, { x: 100, y: 100, qual: 2, quan: 100, status: ST_LOCAL });
  addEmbryoIn(world, egg, { objNumber: OBJ_19B, qual: 8, quan: 1, status: ST_LOCAL | 0x08 });
  const r = hatchEgg(world, egg, { rand: seqRand(1) });
  check('integrate(dragon): 5 spawns (head + 4 parts)', r.spawns.length === 5);
  const head = r.spawns.find(h => !world.store(Spawned).body[world.resolve(h)]);
  check('integrate(dragon): exactly one is a head (body=0)', head !== undefined);
  check('integrate(dragon): the other 4 link to that head', partsOf(world, head).length === 4);
}

// Firstborn is once-per-EGG, not per-embryo: with two embryos, only the first embryo's first
// monster sits on the egg cell; the second embryo's first monster scatters (seg_2E2D.c:247).
{
  const world = buildHatchWorld(12);
  const egg = makeEggIn(world, { x: 200, y: 200, qual: 2, quan: 100, status: ST_LOCAL });
  addEmbryoIn(world, egg, { objNumber: OBJ_16B, qual: 8, quan: 1, status: ST_LOCAL | 0x08 });   // embryo A
  addEmbryoIn(world, egg, { objNumber: OBJ_16B, qual: 8, quan: 1, status: ST_LOCAL | 0x08 });   // embryo B
  const r = hatchEgg(world, egg, { rand: seqRand(1) });
  const pos = world.store(Position);
  const onEgg = r.spawns.filter(h => { const i = world.resolve(h); return pos.x[i] === 200 && pos.y[i] === 200; });
  check('firstborn: 2 embryos spawn 2 monsters', r.spawns.length === 2);
  check('firstborn: exactly ONE sits on the egg cell (not both)', onEgg.length === 1);
}

// Part-follow: when the head moves, parts track it the next follow tick.
{
  const world = buildHatchWorld(12);
  const cow = spawnCreature(world, { objNumber: 0x1AC, x: 30, y: 30, z: 0, aiMode: AI_GRAZE, alignment: ALIGN_NEUTRAL });
  buildMultiTileBody(world, cow, 0x1AC, 30, 30, 0, false, 0);
  const follow = installEggPartFollowSystem(world);
  const pos = world.store(Position), spatial = world.getResource(SpatialIndex);
  const hi = world.resolve(cow);
  check('follow: east part starts at (31,30)', partsOf(world, cow)[0].x === 31);
  // move the head west to (29,30)
  spatial.remove(pos.x[hi], pos.y[hi], cow); pos.x[hi] = 29; spatial.insertAtHead(29, 30, cow);
  follow();
  check('follow: east part tracked to (30,30) = head+offset', partsOf(world, cow)[0].x === 30 && partsOf(world, cow)[0].y === 30);
}

// Self-block exclusion: a head can step into its own part's cell; others are blocked.
{
  const world = buildHatchWorld(12);
  const cow = spawnCreature(world, { objNumber: 0x1AC, x: 20, y: 20, z: 0, aiMode: AI_GRAZE, alignment: ALIGN_NEUTRAL });
  buildMultiTileBody(world, cow, 0x1AC, 20, 20, 0, false, 0);   // east part at (21,20)
  check('self-block: the head may move onto its own part cell (21,20)', canStandAt(world, 21, 20, { actorId: cow }) === true);
  check('self-block: another actor is blocked by the part', canStandAt(world, 21, 20, {}) === false);
  check('self-block: the part also blocks the head\'s NON-owned neighbour cell rule holds (body cell blocks others)', canStandAt(world, 20, 20, {}) === false);
}

// ── (c) avatar-keyed hatch trigger: proximity / LOCAL / force / level gates ──
const hatchedBit = (world, h) => (world.store(Status).bits[world.resolve(h)] & ST_HATCHED) !== 0;
function placeEgg(world, x, y, z, { qual = 2, quan = 100, local = false } = {}) {
  const egg = makeEggIn(world, { x, y, z, qual, quan, status: local ? ST_LOCAL : 0 });
  addEmbryoIn(world, egg, { objNumber: OBJ_16B, qual: 8, quan: 1, status: (local ? ST_LOCAL : 0) | 0x08 });   // 1 monster → no scatter
  return egg;
}
// gates: near=5, scan=20. Off-screen non-LOCAL hatches; on-screen non-LOCAL waits; LOCAL bypasses;
// beyond-scan never hatches.
{
  const world = buildHatchWorld(12);
  const AX = 500, AY = 500;
  const A = placeEgg(world, AX + 10, AY, 0);                 // dist 10 > near → off-screen → hatch
  const B = placeEgg(world, AX + 2, AY, 0);                  // dist 2 <= near, non-LOCAL → wait
  const C = placeEgg(world, AX + 2, AY + 1, 0, { local: true });   // dist 2, LOCAL → bypass → hatch
  const D = placeEgg(world, AX + 30, AY, 0);                 // dist 30 > scan → outside area → no hatch
  const r = hatchAroundAvatar(world, AX, AY, 0, { rand: seqRand(1), nearRadius: 5, scanRadius: 20 });
  check('trigger: off-screen non-LOCAL egg hatches', hatchedBit(world, A));
  check('trigger: on-screen non-LOCAL egg does NOT hatch (waits off-screen)', !hatchedBit(world, B));
  check('trigger: on-screen LOCAL egg hatches (proximity bypass)', hatchedBit(world, C));
  check('trigger: egg beyond scanRadius does NOT hatch', !hatchedBit(world, D));
  check('trigger: reports 2 hatched (A + C)', r.hatched === 2);
}
// forceHatch (teleport path): an on-screen non-LOCAL egg hatches regardless of proximity.
{
  const world = buildHatchWorld(12);
  const B = placeEgg(world, 502, 500, 0);                    // dist 2 — would normally wait
  hatchAroundAvatar(world, 500, 500, 0, { rand: seqRand(1), nearRadius: 5, scanRadius: 20, forceHatch: true });
  check('trigger: forceHatch hatches an on-screen egg', hatchedBit(world, B));
}
// Level filter: only the avatar's level hatches.
{
  const world = buildHatchWorld(12);
  const surf = placeEgg(world, 510, 500, 0);                 // z=0, off-screen
  const dung = placeEgg(world, 510, 500, 5);                 // z=5 (different level), same xy
  hatchAroundAvatar(world, 500, 500, 0, { rand: seqRand(1), nearRadius: 5, scanRadius: 20 });
  check('trigger: surface egg (z=0) hatches when avatar is on z=0', hatchedBit(world, surf));
  check('trigger: dungeon egg (z=5) is untouched on z=0', !hatchedBit(world, dung));
}
// Idempotent: a second pass hatches nothing new (eggs latched; re-arm is sub-step e).
{
  const world = buildHatchWorld(12);
  placeEgg(world, 510, 500, 0);
  const r1 = hatchAroundAvatar(world, 500, 500, 0, { rand: seqRand(1), nearRadius: 5, scanRadius: 20 });
  const r2 = hatchAroundAvatar(world, 500, 500, 0, { rand: seqRand(1), nearRadius: 5, scanRadius: 20 });
  check('trigger: first pass hatches, second pass is a no-op (latched)', r1.hatched === 1 && r2.hatched === 0);
}
check('trigger: shouldPacifyGargoyles stub is false until sub-step f', shouldPacifyGargoyles(buildHatchWorld()) === false);

// ── (e) cull + re-arm: the avatar-keyed lifetime pass ─────────────────────
const alive = (world, h) => world.resolve(h) !== -1;
// Creatures: beyond cullRadius reaped, within kept; permanent NPCs (no Spawned) never touched.
{
  const world = buildHatchWorld(12);
  const near = spawnCreature(world, { objNumber: OBJ_16B, x: 505, y: 500, z: 0, aiMode: 8, alignment: ALIGN_EVIL });   // dist 5
  const far = spawnCreature(world, { objNumber: OBJ_16B, x: 525, y: 500, z: 0, aiMode: 8, alignment: ALIGN_EVIL });    // dist 25
  // a permanent NPC (Actor, NOT Spawned) far away — must never be culled
  const npc = world.create();
  world.add(npc, Position, { x: 530, y: 500, z: 0 }); world.add(npc, ObjType, { objNumber: 0x100, frame: 0, origObjNumber: 0x100 });
  world.add(npc, Status, { bits: 0 }); world.add(npc, Amount, { quantity: 1, quality: 0 }); world.add(npc, Actor, { npcId: 50 });
  world.getResource(SpatialIndex).insert(530, 500, npc);
  const r = cullAroundAvatar(world, 500, 500, 0, { nearRadius: 5, cullRadius: 20 });
  check('cull: a spawn within cullRadius survives', alive(world, near));
  check('cull: a spawn beyond cullRadius is reaped', !alive(world, far));
  check('cull: a permanent NPC (no Spawned tag) is NEVER culled', alive(world, npc));
  check('cull: reports 1 culled', r.culled === 1);
}
// Multi-tile parts cull WITH their head.
{
  const world = buildHatchWorld(12);
  const head = spawnCreature(world, { objNumber: OBJ_19B, x: 525, y: 500, z: 0, aiMode: 8, alignment: ALIGN_EVIL });   // dist 25
  const parts = buildMultiTileBody(world, head, OBJ_19B, 525, 500, 0, false, 0);
  cullAroundAvatar(world, 500, 500, 0, { nearRadius: 5, cullRadius: 20 });
  check('cull: a far dragon head is reaped', !alive(world, head));
  check('cull: its 4 parts are reaped WITH the head', parts.every(p => !alive(world, p)));
}
// Orphaned part (head already gone) is reaped regardless of distance.
{
  const world = buildHatchWorld(12);
  const head = spawnCreature(world, { objNumber: 0x1AC, x: 505, y: 500, z: 0, aiMode: 8, alignment: ALIGN_NEUTRAL });
  const parts = buildMultiTileBody(world, head, 0x1AC, 505, 500, 0, false, 0);   // 1 east part, near the avatar
  const { deleteMapObject } = await import('../world_loader.js');
  deleteMapObject(world, head);          // head dies (combat, later) — leaves an orphan part
  cullAroundAvatar(world, 500, 500, 0, { nearRadius: 5, cullRadius: 20 });
  check('cull: an orphaned part (head gone) is reaped even within cullRadius', !alive(world, parts[0]));
}
// Eggs: LOCAL deleted, non-LOCAL hatched re-armed, non-LOCAL un-hatched + in-range untouched.
{
  const world = buildHatchWorld(12);
  const localEgg = makeEggIn(world, { x: 526, y: 500, qual: 2, quan: 100, status: ST_LOCAL | ST_HATCHED | ST_INVISIBLE });   // dist 26
  const respawnEgg = makeEggIn(world, { x: 527, y: 500, qual: 2, quan: 100, status: ST_HATCHED | ST_INVISIBLE });            // dist 27, non-LOCAL
  const unhatchedFar = makeEggIn(world, { x: 528, y: 500, qual: 2, quan: 100, status: 0 });                                  // dist 28, never hatched
  const nearEgg = makeEggIn(world, { x: 502, y: 500, qual: 2, quan: 100, status: ST_HATCHED });                             // dist 2, in range
  const r = cullAroundAvatar(world, 500, 500, 0, { nearRadius: 5, cullRadius: 20 });
  check('cull: a far LOCAL egg is DELETED (one-shot)', !alive(world, localEgg) && r.deletedEggs === 1);
  check('cull: a far non-LOCAL hatched egg is RE-ARMED (HATCHED cleared)',
    alive(world, respawnEgg) && (world.store(Status).bits[world.resolve(respawnEgg)] & ST_HATCHED) === 0);
  check('cull: re-arm keeps INVISIBLE (source ClrHatched clears only HATCHED)',
    (world.store(Status).bits[world.resolve(respawnEgg)] & ST_INVISIBLE) !== 0);
  check('cull: a far un-hatched non-LOCAL egg is untouched', alive(world, unhatchedFar) && world.store(Status).bits[world.resolve(unhatchedFar)] === 0);
  check('cull: an in-range hatched egg is NOT re-armed', (world.store(Status).bits[world.resolve(nearEgg)] & ST_HATCHED) !== 0);
  check('cull: reports 1 re-armed', r.rearmed === 1);
}
// Round trip: hatch → leave (cull re-arms) → return (re-hatches a fresh pack).
{
  const world = buildHatchWorld(12);
  const egg = placeEgg(world, 600, 600, 0);   // non-LOCAL, 1 gargoyle embryo
  hatchAroundAvatar(world, 595, 600, 0, { rand: seqRand(1), nearRadius: 2, scanRadius: 8, cullRadius: 12 });   // dist 5 → off-screen → hatch
  check('respawn: first approach hatches', (world.store(Status).bits[world.resolve(egg)] & ST_HATCHED) !== 0);
  cullAroundAvatar(world, 660, 660, 0, { nearRadius: 2, cullRadius: 12 });   // walk far away → re-arm
  check('respawn: leaving re-arms the egg', (world.store(Status).bits[world.resolve(egg)] & ST_HATCHED) === 0);
  const r2 = hatchAroundAvatar(world, 595, 600, 0, { rand: seqRand(1), nearRadius: 2, scanRadius: 8, cullRadius: 12 });   // return
  check('respawn: returning re-hatches a fresh pack', r2.hatched === 1);
}

// ── (f) pacification + Shamino's warning ──────────────────────────────────
function addPartyMember(world, slot, objNumber, x, y) {
  const e = world.create();
  world.add(e, Position, { x, y, z: 0 }); world.add(e, ObjType, { objNumber, frame: 0, origObjNumber: objNumber });
  world.add(e, Status, { bits: 0 }); world.add(e, Amount, { quantity: 1, quality: 0 });
  world.add(e, Actor, { npcId: 10 + slot }); world.add(e, PartyMember, { slotIndex: slot });
  world.getResource(SpatialIndex).insert(x, y, e);
  return e;
}
function giveItem(world, holder, objNumber) {
  const e = world.create();
  world.add(e, ObjType, { objNumber, frame: 0, origObjNumber: objNumber });
  world.add(e, Status, { bits: 0 }); world.add(e, Amount, { quantity: 1, quality: 0 });
  world.add(e, ContainedIn, { holder, equipped: 0 });
  if (!world.has(holder, Container)) world.add(holder, Container);
  return e;
}
// Pacification scan: gargoyle-in-party OR Amulet of Submission → pacify.
{
  const w1 = buildHatchWorld(12); addPartyMember(w1, 0, 0x141, 50, 50);   // avatar (not a gargoyle)
  check('pacify: no gargoyle, no amulet → false', shouldPacifyGargoyles(w1) === false);

  const w2 = buildHatchWorld(12); addPartyMember(w2, 0, 0x141, 50, 50); addPartyMember(w2, 1, OBJ_16B, 51, 50);   // a gargoyle joins
  check('pacify: a gargoyle party member → true', shouldPacifyGargoyles(w2) === true);

  const w3 = buildHatchWorld(12); const a3 = addPartyMember(w3, 0, 0x141, 50, 50); giveItem(w3, a3, OBJ_AMULET_SUBMISSION);
  check('pacify: Amulet of Submission carried → true', shouldPacifyGargoyles(w3) === true);

  const w4 = buildHatchWorld(12); const a4 = addPartyMember(w4, 0, 0x141, 50, 50);
  const bag = giveItem(w4, a4, 0x83);   // a bag in the avatar's inventory
  giveItem(w4, bag, OBJ_AMULET_SUBMISSION);   // amulet nested INSIDE the bag
  check('pacify: amulet nested in a carried bag → true (chain walk)', shouldPacifyGargoyles(w4) === true);
}
// Auto-pacify integration: a gargoyle in the party makes a gargoyle egg hatch AI_GRAZE via the scan.
{
  const world = buildHatchWorld(12); addPartyMember(world, 1, OBJ_16B, 51, 50);   // gargoyle ally
  const egg = makeEggIn(world, { x: 200, y: 200, qual: 2, quan: 100, status: ST_LOCAL });
  addEmbryoIn(world, egg, { objNumber: OBJ_16B, qual: 8, quan: 1, status: ST_LOCAL | 0x08 });
  // forceGarglGraze defaults to shouldPacifyGargoyles(world) inside hatchAroundAvatar
  hatchAroundAvatar(world, 200, 200, 0, { rand: seqRand(1), nearRadius: 5, scanRadius: 20 });
  const g = [...world.query(Spawned, Position)].find(i => world.store(ObjType).objNumber[i] === OBJ_16B && world.has(world.handleOf(i), Spawned) && !world.store(Spawned).body[i]);
  check('pacify: gargoyle hatches AI_GRAZE when a gargoyle is in the party', world.store(AIMode).mode[g] === AI_GRAZE);
}
// Is_ATKPLR (atkplr flag): EVIL non-LOCAL → true; LOCAL → false; NEUTRAL → false.
{
  const world = buildHatchWorld(12);
  const evil = makeEggIn(world, { x: 10, y: 10, qual: 2, quan: 100, status: 0 });          // EVIL (Qual%10=2), non-LOCAL
  addEmbryoIn(world, evil, { objNumber: OBJ_16B, qual: 8, quan: 1, status: 0x08 });
  check('atkplr: EVIL non-LOCAL egg arms the warning', hatchEgg(world, evil, { rand: seqRand(1) }).atkplr === true);

  const world2 = buildHatchWorld(12);
  const evilLocal = makeEggIn(world2, { x: 10, y: 10, qual: 2, quan: 100, status: ST_LOCAL });   // EVIL but LOCAL
  addEmbryoIn(world2, evilLocal, { objNumber: OBJ_16B, qual: 8, quan: 1, status: ST_LOCAL | 0x08 });
  check('atkplr: a LOCAL egg never arms the warning', hatchEgg(world2, evilLocal, { rand: seqRand(1) }).atkplr === false);

  const world3 = buildHatchWorld(12);
  const neutral = makeEggIn(world3, { x: 10, y: 10, qual: 1, quan: 100, status: 0 });        // NEUTRAL (Qual%10=1)
  addEmbryoIn(world3, neutral, { objNumber: OBJ_16B, qual: 8, quan: 1, status: 0x08 });
  check('atkplr: a NEUTRAL-override egg does not arm the warning', hatchEgg(world3, neutral, { rand: seqRand(1) }).atkplr === false);
}
// Shamino's warning: fires once when Shamino (slot 3) is near a hostile non-LOCAL hatch.
{
  resetShaminoWarning();
  const world = buildHatchWorld(12);
  addPartyMember(world, 3, 0x142, 500, 500);   // Shamino at slot 3, on the avatar's cell (within 6)
  const egg = makeEggIn(world, { x: 510, y: 500, qual: 2, quan: 100, status: 0 });   // EVIL, non-LOCAL, dist 10 (off-screen)
  addEmbryoIn(world, egg, { objNumber: OBJ_16B, qual: 8, quan: 1, status: 0x08 });
  const msgs = [];
  // rand: roll(1,100)->1, scatter(-3,3)->0, warning(0,3)->2 (non-zero → fires)
  const warnRand = (a, b) => (a === 1 && b === 100) ? 1 : (a === 0 && b === 3) ? 2 : 0;
  hatchAroundAvatar(world, 500, 500, 0, { rand: warnRand, nearRadius: 5, scanRadius: 20, message: (m) => msgs.push(m) });
  check('shamino: warning fires with Shamino near + hostile non-LOCAL hatch', msgs.length === 1 && /approaching from the east/.test(msgs[0]));
  // second call: gated (once per session)
  const egg2 = makeEggIn(world, { x: 500, y: 510, qual: 2, quan: 100, status: 0 });
  addEmbryoIn(world, egg2, { objNumber: OBJ_16B, qual: 8, quan: 1, status: 0x08 });
  hatchAroundAvatar(world, 500, 500, 0, { rand: warnRand, nearRadius: 5, scanRadius: 20, message: (m) => msgs.push(m) });
  check('shamino: warning is once-per-session (no second message)', msgs.length === 1);
}
// No Shamino in the party → no warning.
{
  resetShaminoWarning();
  const world = buildHatchWorld(12);   // no slot-3 member
  const egg = makeEggIn(world, { x: 510, y: 500, qual: 2, quan: 100, status: 0 });
  addEmbryoIn(world, egg, { objNumber: OBJ_16B, qual: 8, quan: 1, status: 0x08 });
  const msgs = [];
  hatchAroundAvatar(world, 500, 500, 0, { rand: (a, b) => (a === 1 && b === 100) ? 1 : (a === 0 && b === 3) ? 2 : 0, nearRadius: 5, scanRadius: 20, message: (m) => msgs.push(m) });
  check('shamino: no warning when Shamino is not in the party', msgs.length === 0);
}
resetShaminoWarning();   // leave the module flag clean for any later run

// ── report ────────────────────────────────────────────────────────────────
const out = document.getElementById('out');
out.innerHTML = `<h2>egg subsystem (I-egg a+b+c+d-visual+e+f) — ${fail === 0 ? '<span class="pass">ALL PASS</span>' : `<span class="fail">${fail} FAIL</span>`} (${pass}/${pass + fail})</h2>` +
  results.map(r => `<div class="${r.ok ? 'pass' : 'fail'}">${r.ok ? 'PASS' : 'FAIL'}  ${r.name}</div>`).join('');
console.log(`egg: ${pass}/${pass + fail} pass`);
