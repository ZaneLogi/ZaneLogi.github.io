// In-memory verification for the moongate subsystem (I-moongate). Pure logic, no U6
// data / no rendering. Open tests/test_moongate.html via the dev server; results log
// to console + page. Grows per sub-step (a -> e/g/h).

import { World } from '../ecs/world.js';
import { SpatialIndex } from '../resources/spatial_index.js';
import { ActorIndex } from '../resources/actor_index.js';
import { WorldClock } from '../resources/world_clock.js';
import { Party } from '../resources/party.js';
import { MoonGates } from '../resources/moon_gates.js';
import { MapLevel } from '../resources/map_level.js';
import { TileRegistry } from '../resources/tile_registry.js';
import { installMoonPhaseSystem } from '../systems/moon_phase_system.js';
import { spawnBlueGates, checkGateEntry, gateTravel, useMoonstone, clearMoonstoneSlot, castDi, useOrb } from '../systems/moongate_runtime.js';
import { D_2C74_DEFAULTS, D_036A, OBJ_BLUE_GATE, SHRINE_OF_SPIRITUALITY } from '../assets/moon_tables.js';
import { addMapObject, objAtCell } from '../world_loader.js';
import { computeSkyScene, isEclipseDay } from '../view/moongate_hud.js';
import { Position, Renderable, ObjType, Status, Amount, Actor, PartyMember, ContainedIn, Container } from '../components/components.js';
import { serializeWorld, restoreWorld } from '../systems/persistence/snapshot.js';

const results = [];
let pass = 0, fail = 0;
function check(name, cond) {
  const ok = !!cond;
  if (ok) pass++; else fail++;
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
}

// ── (a) Data + MoonGates resource ────────────────────────────────────────

// Seed = the compiled D_2C4A.c constants, deep-copied (mutable, not the frozen table).
{
  const mg = new MoonGates();
  check('seed: D_2C74 has 8 endpoints', mg.D_2C74.length === 8);
  check('seed: slot 0 = (0x3A7,0x106,0)',
    mg.D_2C74[0][0] === 0x3A7 && mg.D_2C74[0][1] === 0x106 && mg.D_2C74[0][2] === 0);
  check('seed: slot 6 is the z=1 dungeon endpoint (0x017,0x016,1)',
    mg.D_2C74[6][0] === 0x017 && mg.D_2C74[6][1] === 0x016 && mg.D_2C74[6][2] === 1);
  check('seed: matches the frozen defaults exactly',
    JSON.stringify(mg.D_2C74) === JSON.stringify(D_2C74_DEFAULTS));
  mg.D_2C74[0][0] = 999;
  check('seed: row is a mutable copy (does not alias the frozen table)', D_2C74_DEFAULTS[0][0] === 0x3A7);
}

// Phase recompute (seg_0A33.c:907-910). The doc's verified anchor: day 4 / hr 8 -> 6/4/6/6.
{
  const mg = new MoonGates();
  mg.recomputePhases({ Date_D: 4, Time_H: 8 });
  check('phase: day4/hr8 -> Trammel slot 6 phase 4', mg.trammelSlot === 6 && mg.trammelPhase === 4);
  check('phase: day4/hr8 -> Felucca slot 6 phase 6', mg.feluccaSlot === 6 && mg.feluccaPhase === 6);
}
// Cross-check the formula across a spread of clock times, including a negative-phase case
// (small slot + late hour) — JS `%` must match C's truncated modulo (both keep the sign).
{
  const mg = new MoonGates();
  let allMatch = true;
  for (let day = 1; day <= 28; day++)
    for (let hr = 0; hr < 24; hr++) {
      mg.recomputePhases({ Date_D: day, Time_H: hr });
      const d = D_036A[day - 1];
      const tP = (d[0] * 3 + 18 - hr) % 24, fP = (d[1] * 3 + 20 - hr) % 24;
      if (mg.trammelSlot !== d[0] || mg.trammelPhase !== tP ||
          mg.feluccaSlot !== d[1] || mg.feluccaPhase !== fP) allMatch = false;
    }
  check('phase: formula matches across all 28x24 day/hour combinations', allMatch);
  // day 1 (slot 0) at hour 23 -> (0+18-23)%24 = -5 (C-truncated; JS agrees).
  mg.recomputePhases({ Date_D: 1, Time_H: 23 });
  check('phase: negative phase reachable + kept raw (-5 at day1/hr23)', mg.trammelPhase === -5);
}

// Helpers: isSlotActive / anyMoonUp.
{
  const mg = new MoonGates();
  check('isSlotActive: a seeded surface slot is active', mg.isSlotActive(0) === true);
  mg.D_2C74[2] = [0, 0, 0];
  check('isSlotActive: an all-zero slot is inactive', mg.isSlotActive(2) === false);
  mg.trammelPhase = 4; mg.feluccaPhase = 20;
  check('anyMoonUp: one moon up (phase 4) -> true', mg.anyMoonUp() === true);
  mg.trammelPhase = 15; mg.feluccaPhase = 23;
  check('anyMoonUp: both moons down (>=15) -> false', mg.anyMoonUp() === false);
}

// ── (a) Persistence: D_2C74 round-trips; graceful absence on an old save ──
function buildWorld() {
  const world = new World(256)
    .registerComponent(Position).registerComponent(Renderable).registerComponent(ObjType)
    .registerComponent(Status).registerComponent(Amount).registerComponent(Actor);
  world.setResource(new SpatialIndex(256));
  world.setResource(new ActorIndex());
  world.setResource(new WorldClock());
  world.setResource(new Party());
  world.setResource(new MoonGates());
  return world;
}
{
  const A = buildWorld();
  A.getResource(MoonGates).D_2C74[3] = [0x111, 0x222, 0];   // a "buried"/relocated endpoint
  const snap = serializeWorld(A);
  check('persist: snapshot carries the MoonGates resource', !!snap.resources.MoonGates);
  const B = buildWorld();
  restoreWorld(B, snap);
  const d3 = B.getResource(MoonGates).D_2C74[3];
  check('persist: relocated slot 3 survives serialize->restore',
    d3[0] === 0x111 && d3[1] === 0x222 && d3[2] === 0);
  check('persist: an untouched slot still matches the default',
    B.getResource(MoonGates).D_2C74[0][0] === 0x3A7);
}
{
  // A pre-moongate save (no MoonGates in resources) restores gracefully: the fresh
  // world keeps its seeded canonical network (no throw, no version bump).
  const A = buildWorld();
  const snap = serializeWorld(A);
  delete snap.resources.MoonGates;                         // simulate an old save
  const B = buildWorld();
  B.getResource(MoonGates).D_2C74[5] = [0x999, 0x999, 0];  // pre-restore local state
  let threw = false;
  try { restoreWorld(B, snap); } catch (e) { threw = true; }
  check('persist: old save without MoonGates restores without throwing', !threw);
  check('persist: old save leaves the seeded network in place (graceful absence)',
    B.getResource(MoonGates).D_2C74[5][0] === 0x999);
}

// ── (b) Phase clock: onHour recompute + initial sync ─────────────────────
{
  const world = buildWorld();
  world.getResource(WorldClock).Time_H = 8;
  world.getResource(WorldClock).Date_D = 4;
  // Before install, phases sit at the constructor default (0).
  check('phase-clock: phases default to 0 before install', world.getResource(MoonGates).trammelPhase === 0);
  installMoonPhaseSystem(world);
  const mg = world.getResource(MoonGates);
  check('phase-clock: initial sync recomputes at install (day4/hr8 -> 6/4/6/6)',
    mg.trammelSlot === 6 && mg.trammelPhase === 4 && mg.feluccaSlot === 6 && mg.feluccaPhase === 6);
  // Advance across an hour boundary -> the onHour hook recomputes.
  world.getResource(WorldClock).advance(60);   // 08:00 -> 09:00
  check('phase-clock: onHour recompute after +1h (day4/hr9)',
    mg.trammelSlot === 6 && mg.trammelPhase === ((6 * 3 + 18 - 9) % 24) &&
    mg.feluccaPhase === ((6 * 3 + 20 - 9) % 24));
  // A sub-hour advance does NOT recompute (no hour rollover).
  const before = mg.trammelPhase;
  world.getResource(WorldClock).advance(30);    // 09:00 -> 09:30, no rollover
  check('phase-clock: sub-hour advance does not recompute', mg.trammelPhase === before);
}

// ── (c) Blue-gate runtime: spawn-reconcile, entry tiebreak, GateTravel ────
// A world with the moongate runtime's deps. Stub TileRegistry (tileForObject only needs
// baseTile.tileFor). The avatar is a bare Position+ObjType entity (handle in avatarRef).
function buildRuntimeWorld() {
  const world = new World(256)
    .registerComponent(Position).registerComponent(Renderable).registerComponent(ObjType)
    .registerComponent(Status).registerComponent(Amount).registerComponent(Actor)
    .registerComponent(PartyMember).registerComponent(ContainedIn).registerComponent(Container);
  world.setResource(new SpatialIndex(256));
  world.setResource(new MapLevel(null, 0));
  world.setResource(new WorldClock({ Time_H: 12, Time_M: 0, Date_D: 4 }));
  world.setResource(new MoonGates());
  world.setResource(new TileRegistry({ baseTile: { tileFor: () => 0 } }));
  const avatar = world.create();
  world.add(avatar, Position, { x: 50, y: 50, z: 0 });
  world.add(avatar, ObjType, { objNumber: 0x141, frame: 0 });
  world.getResource(SpatialIndex).insertAtHead(50, 50, avatar);
  return { world, avatarRef: { handle: avatar } };
}
function countGatesAtZ(world, z) {
  const objs = world.store(ObjType), pos = world.store(Position);
  let n = 0;
  for (const i of world.query(ObjType, Position))
    if (objs.objNumber[i] === OBJ_BLUE_GATE && pos.z[i] === z) n++;
  return n;
}
{
  // Surface: a moon up -> a gate at each active z=0 slot (7 of 8; slot 6 is z=1).
  const { world } = buildRuntimeWorld();
  const mg = world.getResource(MoonGates);
  mg.trammelPhase = 4; mg.feluccaPhase = 6;   // both up
  spawnBlueGates(world);
  check('blue-spawn: 7 surface gates (slot 6 is the z=1 dungeon endpoint)', countGatesAtZ(world, 0) === 7);
  check('blue-spawn: a gate sits at slot 0 (0x3A7,0x106)', objAtCell(world, 0x3A7, 0x106, OBJ_BLUE_GATE) !== null);
  check('blue-spawn: no gate at the z=1 slot 6 while on the surface', objAtCell(world, 0x017, 0x016, OBJ_BLUE_GATE) === null);
  // Idempotent: a second reconcile doesn't duplicate.
  spawnBlueGates(world);
  check('blue-spawn: reconcile is idempotent (still 7)', countGatesAtZ(world, 0) === 7);
}
{
  // Both moons down -> all gates removed.
  const { world } = buildRuntimeWorld();
  const mg = world.getResource(MoonGates);
  mg.trammelPhase = 4; mg.feluccaPhase = 6;
  spawnBlueGates(world);
  mg.trammelPhase = 18; mg.feluccaPhase = 20;   // both down (>=15)
  spawnBlueGates(world);
  check('blue-spawn: both moons down -> 0 gates', countGatesAtZ(world, 0) === 0);
}
{
  // Dungeon level: only slot 6's z=1 gate.
  const { world } = buildRuntimeWorld();
  const mg = world.getResource(MoonGates);
  mg.trammelPhase = 4; mg.feluccaPhase = 6;
  world.getResource(MapLevel).level = 1;
  spawnBlueGates(world);
  check('blue-spawn: on level 1, only slot 6 gate (0x017,0x016)',
    countGatesAtZ(world, 1) === 1 && objAtCell(world, 0x017, 0x016, OBJ_BLUE_GATE) !== null);
}
{
  // Reconcile: relocate slot 0 -> gate moves; clear slot 1 -> gate gone; no junk at (0,0).
  const { world } = buildRuntimeWorld();
  const mg = world.getResource(MoonGates);
  mg.trammelPhase = 4; mg.feluccaPhase = 6;
  spawnBlueGates(world);
  mg.D_2C74[0] = [0x055, 0x055, 0];            // relocate slot 0
  mg.D_2C74[1] = [0, 0, 0];                     // clear slot 1 (picked up)
  spawnBlueGates(world);
  check('blue-spawn: relocated slot 0 gate at new cell', objAtCell(world, 0x055, 0x055, OBJ_BLUE_GATE) !== null);
  check('blue-spawn: stray gate at slot 0 old cell removed', objAtCell(world, 0x3A7, 0x106, OBJ_BLUE_GATE) === null);
  check('blue-spawn: cleared slot leaves no junk gate at (0,0)', objAtCell(world, 0, 0, OBJ_BLUE_GATE) === null);
  check('blue-spawn: cleared slot 1 has no gate (0x1F7,0x166)', objAtCell(world, 0x1F7, 0x166, OBJ_BLUE_GATE) === null);
}
{
  // Entry tiebreak: avatar steps onto slot 0's gate; Trammel "fuller" (phase 7) wins ->
  // travel to D_2C74[trammelSlot]. All dests forced to z=0 so teleportParty stays on the
  // surface (no dungeon objblk load in a data-less test).
  const { world, avatarRef } = buildRuntimeWorld();
  const mg = world.getResource(MoonGates);
  for (const r of mg.D_2C74) r[2] = 0;          // flatten slot 6 to z=0 for this test
  mg.trammelSlot = 3; mg.trammelPhase = 7;       // Trammel exactly full -> wins
  mg.feluccaSlot = 5; mg.feluccaPhase = 0;
  spawnBlueGates(world);
  // Move the avatar onto slot 0's gate cell, then fire the post-move entry check.
  const pos = world.store(Position), spatial = world.getResource(SpatialIndex);
  spatial.remove(50, 50, avatarRef.handle);
  pos.x[world.resolve(avatarRef.handle)] = 0x3A7; pos.y[world.resolve(avatarRef.handle)] = 0x106;
  spatial.insertAtHead(0x3A7, 0x106, avatarRef.handle);
  checkGateEntry(world, { avatarRef });
  const ai = world.resolve(avatarRef.handle);
  check('blue-entry: Trammel (phase 7) wins -> party at D_2C74[3] (0x127,0x026)',
    pos.x[ai] === 0x127 && pos.y[ai] === 0x026);
}
{
  // Midnight override: 00:00-00:09 on a gate -> Shrine of Spirituality (0x18,0x1d,1).
  const { world, avatarRef } = buildRuntimeWorld();
  world.getResource(SpatialIndex).loadedDungeons.add(1);   // skip the U6DB objblk load (data-less test)
  const mg = world.getResource(MoonGates);
  for (const r of mg.D_2C74) r[2] = 0;
  mg.trammelPhase = 4; mg.feluccaPhase = 6;
  world.getResource(WorldClock).Time_H = 0; world.getResource(WorldClock).Time_M = 5;
  spawnBlueGates(world);
  const pos = world.store(Position), spatial = world.getResource(SpatialIndex);
  spatial.remove(50, 50, avatarRef.handle);
  pos.x[world.resolve(avatarRef.handle)] = 0x3A7; pos.y[world.resolve(avatarRef.handle)] = 0x106;
  spatial.insertAtHead(0x3A7, 0x106, avatarRef.handle);
  checkGateEntry(world, { avatarRef });
  const ai = world.resolve(avatarRef.handle);
  const [sx, sy, sz] = SHRINE_OF_SPIRITUALITY;
  check('blue-entry: 00:05 override -> Shrine of Spirituality',
    pos.x[ai] === sx && pos.y[ai] === sy && pos.z[ai] === sz);
}
{
  // GateTravel to an unburied (all-zero) slot -> party stays put.
  const { world, avatarRef } = buildRuntimeWorld();
  const mg = world.getResource(MoonGates);
  mg.D_2C74[2] = [0, 0, 0];
  const pos = world.store(Position), ai = world.resolve(avatarRef.handle);
  const x0 = pos.x[ai], y0 = pos.y[ai];
  gateTravel(world, 2, { avatarRef });
  check('blue-travel: unburied slot leaves the party put', pos.x[ai] === x0 && pos.y[ai] === y0);
}

// ── (d) Bury / relocate (USE moonstone) + GET clears the slot ────────────
{
  // Bury on buryable terrain: stone frame 4 adjacent -> D_2C74[4] = avatar cell, stone
  // moved there, gate spawned there.
  const { world, avatarRef } = buildRuntimeWorld();
  world.getResource(MapLevel).tileAt = () => 0x002;   // buryable (TIL_002)
  const mg = world.getResource(MoonGates);
  mg.trammelPhase = 4; mg.feluccaPhase = 6;           // a moon up
  const stone = addMapObject(world, { objNumber: 0x049, frame: 4, x: 51, y: 50, z: 0 });
  useMoonstone({ world, target: { entity: stone }, message: () => {}, avatarRef });
  const d = mg.D_2C74[4], sp = world.store(Position), si = world.resolve(stone);
  check('bury: D_2C74[4] set to the avatar cell (50,50,0)', d[0] === 50 && d[1] === 50 && d[2] === 0);
  check('bury: stone moved to the avatar cell', sp.x[si] === 50 && sp.y[si] === 50);
  check('bury: a blue gate now sits at the buried cell', objAtCell(world, 50, 50, OBJ_BLUE_GATE) !== null);
}
{
  // Non-buryable terrain refuses; D_2C74 unchanged.
  const { world, avatarRef } = buildRuntimeWorld();
  world.getResource(MapLevel).tileAt = () => 0x100;   // not buryable
  const mg = world.getResource(MoonGates);
  const before = JSON.stringify(mg.D_2C74[4]);
  const stone = addMapObject(world, { objNumber: 0x049, frame: 4, x: 51, y: 50, z: 0 });
  let msg = '';
  useMoonstone({ world, target: { entity: stone }, message: (m) => { msg = m; }, avatarRef });
  check('bury: non-buryable terrain refuses + leaves D_2C74 untouched',
    msg === 'Cannot be buried here!' && JSON.stringify(mg.D_2C74[4]) === before);
}
{
  // Bury a HELD moonstone (USE from inventory): no Position -> dropToMap at the avatar's
  // feet (the faithful inventory-USE bury). frame 5.
  const { world, avatarRef } = buildRuntimeWorld();
  world.getResource(MapLevel).tileAt = () => 0x002;   // buryable
  const mg = world.getResource(MoonGates);
  mg.trammelPhase = 4; mg.feluccaPhase = 6;
  const stone = world.create();
  world.add(stone, ObjType, { objNumber: 0x049, frame: 5, origObjNumber: 0x049 });
  world.add(stone, Status, { bits: 0 });
  world.add(stone, Amount, { quantity: 1, quality: 0 });
  world.add(stone, ContainedIn, { holder: avatarRef.handle, equipped: 0 });   // held, off-map
  useMoonstone({ world, target: { entity: stone }, message: () => {}, avatarRef });
  const sp = world.store(Position), si = world.resolve(stone);
  check('bury(held): off-map stone dropped onto the avatar cell (50,50)',
    world.has(stone, Position) && sp.x[si] === 50 && sp.y[si] === 50);
  check('bury(held): D_2C74[5] set to the avatar cell', mg.D_2C74[5][0] === 50 && mg.D_2C74[5][1] === 50);
  check('bury(held): blue gate spawned at the buried cell', objAtCell(world, 50, 50, OBJ_BLUE_GATE) !== null);
}
{
  // GET clears the slot: the endpoint's gate disappears.
  const { world } = buildRuntimeWorld();
  const mg = world.getResource(MoonGates);
  mg.trammelPhase = 4; mg.feluccaPhase = 6;
  spawnBlueGates(world);
  check('get-clear: slot 0 gate exists pre-clear', objAtCell(world, 0x3A7, 0x106, OBJ_BLUE_GATE) !== null);
  clearMoonstoneSlot(world, 0);
  check('get-clear: D_2C74[0] zeroed', mg.D_2C74[0][0] === 0 && mg.D_2C74[0][1] === 0 && mg.D_2C74[0][2] === 0);
  check('get-clear: slot 0 gate removed', objAtCell(world, 0x3A7, 0x106, OBJ_BLUE_GATE) === null);
}

// ── (h) Sky scene composition (sun/backdrops/cave + moons + eclipse) ─────
const moonsUp = { trammelSlot: 6, trammelPhase: 4, feluccaSlot: 2, feluccaPhase: 6 };
const raw = (ops) => ops.filter(o => o.tile !== undefined);
const moonOps = (ops) => ops.filter(o => o.obj === 0x049);
const sunOp = (ops) => ops.find(o => o.tile === 0x169 || o.tile === 0x16A || o.tile === 0x16B);
{
  // Daytime outside: 9 sky-base + 1 sun (TIL_16A) at x=(19-12)<<3=56,y=0 + 2 moons + 9 mountain.
  const ops = computeSkyScene(0, { Time_H: 12, Date_D: 4, Date_M: 7 }, moonsUp);
  check('sky: 9 sky-base tiles (TIL_19B)', ops.filter(o => o.tile === 0x19B).length === 9);
  check('sky: 9 mountain tiles (TIL_160..168)', ops.filter(o => o.tile >= 0x160 && o.tile <= 0x168).length === 9);
  const sun = sunOp(ops);
  check('sky: daytime sun = TIL_16A at zenith (x56,y0)', sun && sun.tile === 0x16A && sun.x === 56 && sun.y === 0);
  check('sky: two moon glyphs present', moonOps(ops).length === 2);
  const tm = moonOps(ops).find(o => o.frame === 6);
  check('sky: Trammel moon glyph = OBJ_049 frame 6 at x=ph<<3 (32), y=D_2BFA[4]=2',
    tm && tm.x === (4 << 3) && tm.y === 2);
}
{
  // Dawn (05:00): sun = TIL_169 at x=(19-5)<<3=112, y=D_2BFA[14]=10.
  const sun = sunOp(computeSkyScene(0, { Time_H: 5, Date_D: 4, Date_M: 7 }, moonsUp));
  check('sky: dawn sun = TIL_169 at horizon (x112,y10)', sun && sun.tile === 0x169 && sun.x === 112 && sun.y === 10);
}
{
  // Night (02:00, H<5): no sun; moons still present.
  const ops = computeSkyScene(0, { Time_H: 2, Date_D: 4, Date_M: 7 }, moonsUp);
  check('sky: night (02:00) has no sun', sunOp(ops) === undefined);
  check('sky: night still shows moons', moonOps(ops).length === 2);
}
{
  // A down moon (phase > 14) is hidden.
  const ops = computeSkyScene(0, { Time_H: 12, Date_D: 4, Date_M: 7 }, { trammelSlot: 1, trammelPhase: 4, feluccaSlot: 2, feluccaPhase: 18 });
  check('sky: a phase>14 moon is hidden (only 1 moon shown)', moonOps(ops).length === 1);
}
{
  // Eclipse day (D1, M%3==0): sun = TIL_16B, moons hidden.
  check('sky: isEclipseDay(D1 M3) true', isEclipseDay({ Date_D: 1, Date_M: 3 }) === true);
  check('sky: isEclipseDay(D4 M7) false', isEclipseDay({ Date_D: 4, Date_M: 7 }) === false);
  const ops = computeSkyScene(0, { Time_H: 12, Date_D: 1, Date_M: 3 }, moonsUp);
  check('sky: eclipse sun = TIL_16B', sunOp(ops) && sunOp(ops).tile === 0x16B);
  check('sky: eclipse hides both moons', moonOps(ops).length === 0);
}
{
  // Cave (level 2): TIL_174 at 0, 7x TIL_175, TIL_176 at 128; no sun/moons/sky-base.
  const ops = computeSkyScene(2, { Time_H: 12, Date_D: 4, Date_M: 7 }, moonsUp);
  check('sky-cave: edges TIL_174 (x0) + TIL_176 (x128)',
    ops.some(o => o.tile === 0x174 && o.x === 0) && ops.some(o => o.tile === 0x176 && o.x === 128));
  check('sky-cave: 7 mid cave tiles (TIL_175)', ops.filter(o => o.tile === 0x175).length === 7);
  check('sky-cave: no sun, no moons, no sky-base underground',
    sunOp(ops) === undefined && moonOps(ops).length === 0 && !ops.some(o => o.tile === 0x19B));
}
{
  // Gargoyle realm (level 5) renders the outdoor scene like the surface.
  const ops = computeSkyScene(5, { Time_H: 12, Date_D: 4, Date_M: 7 }, moonsUp);
  check('sky: level 5 (gargoyle realm) is outdoor (has sky-base + sun)',
    ops.filter(o => o.tile === 0x19B).length === 9 && sunOp(ops) !== undefined);
}

// ── (e) Red gate / Orb of the Moons ──────────────────────────────────────
import { D_171C, D_174E } from '../assets/moon_tables.js';
{
  // The 5x5 directional-pad index (castDi): dead cells + the directional mapping.
  check('castDi: own cell -> 0 (dead)', castDi(0, 0) === 0);
  check('castDi: horizontal neighbors -> 0 (dead)', castDi(1, 0) === 0 && castDi(-1, 0) === 0);
  check('castDi: (dx2,dy0) -> 15 (not dead, |dx|=2)', castDi(2, 0) === 15);
  check('castDi: NW corner (-2,-2) -> 1', castDi(-2, -2) === 1);
  check('castDi: SE corner (2,2) -> 25', castDi(2, 2) === 25);
  check('castDi: due north (0,-2) -> 3, due south (0,2) -> 23', castDi(0, -2) === 3 && castDi(0, 2) === 23);
}
{
  // Orb gate: TalkFlags[5] bit 5 unset -> refusal, no arm; set -> arms the cast cursor.
  let armed = 0, msg = '';
  const objlist = { actors: [] }; objlist.actors[5] = { talkFlags: 0 };
  useOrb({ message: (m) => { msg = m; }, avatarRef: {}, armOrbCast: () => armed++, objlist });
  check('orb: locked (TalkFlags[5] bit5 unset) -> refusal, no cast', msg.includes("can't figure out") && armed === 0);
  objlist.actors[5].talkFlags = 1 << 5;
  useOrb({ message: () => {}, avatarRef: {}, armOrbCast: () => armed++, objlist });
  check('orb: enabled (held) -> arms the cast cursor', armed === 1);
}
{
  // Orb on the GROUND -> "Not usable", no cast (source gates the cast on it NOT being
  // LOCXYZ: seg_27a1.c:3109-3112 -> D_0DDC[11]). Refuses even when TalkFlags is enabled.
  const { world } = buildRuntimeWorld();
  const orb = addMapObject(world, { objNumber: 0x057, frame: 0, x: 60, y: 60, z: 0 });   // on the map (has Position)
  const objlist = { actors: [] }; objlist.actors[5] = { talkFlags: 1 << 5 };
  let armed = 0, msg = '';
  useOrb({ world, target: { entity: orb }, message: (m) => { msg = m; }, avatarRef: {}, armOrbCast: () => armed++, objlist });
  check('orb: on the ground -> "Not usable", no cast', /not usable/i.test(msg) && armed === 0);
}
{
  // Red travel + single-use: step onto a red gate (Qual 4) -> teleport to D_171C[3] and
  // the source gate is consumed.
  const { world, avatarRef } = buildRuntimeWorld();
  const pos = world.store(Position), spatial = world.getResource(SpatialIndex);
  // place a red gate (quality 4) at (60,60); move the avatar onto it.
  addMapObject(world, { objNumber: 0x054, frame: 1, x: 60, y: 60, z: 0, quality: 4 });
  const ai = world.resolve(avatarRef.handle);
  spatial.remove(50, 50, avatarRef.handle);
  pos.x[ai] = 60; pos.y[ai] = 60;
  spatial.insertAtHead(60, 60, avatarRef.handle);
  checkGateEntry(world, { avatarRef });
  check('red-travel: Qual 4 -> party at D_171C[3]/D_174E[3] (0x1F7,0x166)',
    pos.x[ai] === D_171C[3] && pos.y[ai] === D_174E[3]);
  check('red-travel: single-use -> the source red gate is consumed', objAtCell(world, 60, 60, 0x054) === null);
}
{
  // A dead red gate (Qual 0): stays put but is still consumed.
  const { world, avatarRef } = buildRuntimeWorld();
  const pos = world.store(Position), spatial = world.getResource(SpatialIndex);
  addMapObject(world, { objNumber: 0x054, frame: 1, x: 60, y: 60, z: 0, quality: 0 });
  const ai = world.resolve(avatarRef.handle);
  spatial.remove(50, 50, avatarRef.handle);
  pos.x[ai] = 60; pos.y[ai] = 60;
  spatial.insertAtHead(60, 60, avatarRef.handle);
  checkGateEntry(world, { avatarRef });
  check('red-travel: dead gate (Qual 0) leaves the party put', pos.x[ai] === 60 && pos.y[ai] === 60);
  check('red-travel: dead gate is still consumed', objAtCell(world, 60, 60, 0x054) === null);
}

// ── report ───────────────────────────────────────────────────────────────
const summary = `${pass} passed, ${fail} failed`;
console.log(`\n=== I-moongate: ${summary} ===`);
if (typeof document !== 'undefined') {
  const el = document.getElementById('out');
  if (el) {
    el.innerHTML =
      `<h2 class="${fail ? 'fail' : 'pass'}">I-moongate: ${summary}</h2>` +
      results.map(r => `<div class="${r.ok ? 'pass' : 'fail'}">${r.ok ? '✓' : '✗'} ${r.name}</div>`).join('');
  }
}
window.__MOONGATE_RESULT__ = { pass, fail, results };
