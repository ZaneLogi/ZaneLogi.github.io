// In-memory verification for dungeon/cave entry (I-19g) — the walk-onto-a-hole
// trigger (checkDungeonEntry = the C_1E0F_184D dungeon/cave branch) + the shared
// C_101C_089E level-change core (enterLevelChange), both in systems/use_ladder.js.
// Pure logic, no U6 data / no rendering. Open tests/test_dungeon_entry.html via the
// dev server; results log to console + page.

import { World } from '../ecs/world.js';
import { SpatialIndex } from '../resources/spatial_index.js';
import { WorldClock } from '../resources/world_clock.js';
import { MoonGates } from '../resources/moon_gates.js';
import { MapLevel } from '../resources/map_level.js';
import { TileRegistry } from '../resources/tile_registry.js';
import { Position, Renderable, ObjType, Status, Amount, Actor, PartyMember, ContainedIn, Container } from '../components/components.js';
import { checkDungeonEntry, enterLevelChange } from '../systems/use_ladder.js';

const results = [];
let pass = 0, fail = 0;
function check(name, cond) {
  const ok = !!cond;
  if (ok) pass++; else fail++;
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
}

// Minimal runtime world (mirrors test_moongate.js buildRuntimeWorld): the resources
// teleportParty + the egg hatch/cull it calls need, nothing more.
function buildWorld() {
  const world = new World(256)
    .registerComponent(Position).registerComponent(Renderable).registerComponent(ObjType)
    .registerComponent(Status).registerComponent(Amount).registerComponent(Actor)
    .registerComponent(PartyMember).registerComponent(ContainedIn).registerComponent(Container);
  world.setResource(new SpatialIndex(256));
  world.setResource(new MapLevel(null, 0));
  world.setResource(new WorldClock({ Time_H: 12, Time_M: 0, Date_D: 4 }));
  world.setResource(new MoonGates());
  world.setResource(new TileRegistry({ baseTile: { tileFor: () => 0 } }));
  return world;
}
function placeAvatar(world, x, y, z) {
  const avatar = world.create();
  world.add(avatar, Position, { x, y, z });
  world.add(avatar, ObjType, { objNumber: 0x141, frame: 0 });    // the avatar party-leader tile
  world.getResource(SpatialIndex).insertAtHead(x, y, avatar);
  world.getResource(MapLevel).level = z;
  return { handle: avatar };
}
function placeObj(world, { obj, frame = 0, x, y, z = 0, quality = 0 }) {
  const e = world.create();
  world.add(e, Position, { x, y, z });
  world.add(e, ObjType, { objNumber: obj, frame });
  world.add(e, Amount, { quantity: 1, quality });
  world.getResource(SpatialIndex).insertAtHead(x, y, e);
  return e;
}
const ctx = (avatarRef) => ({ avatarRef, recenter: () => {}, moveFollowers: () => {}, message: () => {} });

// ── walk onto a dungeon hole (OBJ_146) → descend to z1, coords compressed /4 ──
{
  const world = buildWorld();
  world.getResource(SpatialIndex).loadedDungeons.add(1);     // skip the U6DB objblk load (data-less test)
  const avatarRef = placeAvatar(world, 284, 657, 0);          // Destard's real surface entrance
  placeObj(world, { obj: 0x146, frame: 5, x: 284, y: 657, quality: 3 });   // the Destard hole
  const entered = checkDungeonEntry(world, ctx(avatarRef));
  const pos = world.store(Position), ai = world.resolve(avatarRef.handle);
  check('walk-in: stepping onto an OBJ_146 hole enters (returns true)', entered === true);
  check('walk-in: descends to dungeon level z=1', pos.z[ai] === 1);
  // surface→dungeon compress ((v>>2)&0xf8)+(v&7): 284→68, 657→161.
  check('walk-in: surface coords compressed /4 (284,657)→(68,161)', pos.x[ai] === 68 && pos.y[ai] === 161);
  check('walk-in: active level switched to 1', world.getResource(MapLevel).level === 1);
}

// ── OBJ_134 (the Ant Mound mouth) is recognized too ──
{
  const world = buildWorld();
  world.getResource(SpatialIndex).loadedDungeons.add(1);
  const avatarRef = placeAvatar(world, 100, 100, 0);
  placeObj(world, { obj: 0x134, frame: 0, x: 100, y: 100, quality: 13 });
  const entered = checkDungeonEntry(world, ctx(avatarRef));
  const pos = world.store(Position), ai = world.resolve(avatarRef.handle);
  check('walk-in: OBJ_134 (cave) also triggers entry to z=1', entered === true && pos.z[ai] === 1);
}

// ── no hole on the avatar's cell → no entry, party unmoved ──
{
  const world = buildWorld();
  const avatarRef = placeAvatar(world, 50, 50, 0);
  placeObj(world, { obj: 0x100, x: 50, y: 50 });             // some non-entrance object
  const entered = checkDungeonEntry(world, ctx(avatarRef));
  const pos = world.store(Position), ai = world.resolve(avatarRef.handle);
  check('walk-in: a non-entrance object does not trigger (returns false)', entered === false);
  check('walk-in: party stays put + on the surface', pos.x[ai] === 50 && pos.y[ai] === 50 && pos.z[ai] === 0);
}

// ── enterLevelChange up: dungeon→surface expands *4 + quality sub-cell offset ──
{
  const world = buildWorld();
  const avatarRef = placeAvatar(world, 68, 161, 1);          // in a dungeon at z1
  // an up-ladder (OBJ_131 frame 1), quality 3 (bits 0,1 → +8, +0x10 on x)
  const ladder = placeObj(world, { obj: 0x131, frame: 1, x: 68, y: 161, z: 1, quality: 3 });
  const dir = enterLevelChange(world, world.resolve(ladder), ctx(avatarRef));   // callers pass a resolved index
  const pos = world.store(Position), ai = world.resolve(avatarRef.handle);
  // expand ((v<<2)&0x3e0)+(v&7): 68→260, 161→641; quality 3 → +8+16 on x → 284.
  check('ladder-up: OBJ_131 frame 1 climbs up (dir = -1)', dir === -1);
  check('ladder-up: dungeon→surface expands *4 + quality (68,161,q3)→(284,641,z0)',
    pos.x[ai] === 284 && pos.y[ai] === 641 && pos.z[ai] === 0);
}

// ── enterLevelChange dungeon↔dungeon: no rescale, land on the ladder cell ──
{
  const world = buildWorld();
  world.getResource(SpatialIndex).loadedDungeons.add(3);
  const avatarRef = placeAvatar(world, 120, 90, 2);
  const ladder = placeObj(world, { obj: 0x131, frame: 0, x: 120, y: 90, z: 2 });   // frame 0 = down
  const dir = enterLevelChange(world, world.resolve(ladder), ctx(avatarRef));   // callers pass a resolved index
  const pos = world.store(Position), ai = world.resolve(avatarRef.handle);
  check('ladder-down: dungeon→deeper descends (dir = +1) to z3', dir === 1 && pos.z[ai] === 3);
  check('ladder-down: dungeon↔dungeon keeps the ladder cell (no rescale)', pos.x[ai] === 120 && pos.y[ai] === 90);
}

// ── REGRESSION (cross-level alias): a dungeon avatar must NOT trigger on a SURFACE hole
//    sharing its (x,y). The single no-unload SpatialIndex co-resides every level at one
//    (x,y) bucket; source scans FindLoc(MapX,MapY,MapZ) — level-filtered. Without the z
//    guard a dungeon avatar over Spider Cave's (92,250) warped off-level. ──
{
  const world = buildWorld();
  const avatarRef = placeAvatar(world, 92, 250, 1);                              // inside a dungeon (z1)
  placeObj(world, { obj: 0x146, frame: 5, x: 92, y: 250, z: 0, quality: 15 });   // a SURFACE cave at the same (x,y)
  const entered = checkDungeonEntry(world, ctx(avatarRef));
  const pos = world.store(Position), ai = world.resolve(avatarRef.handle);
  check('cross-level: a surface hole under a dungeon avatar does NOT trigger', entered === false);
  check('cross-level: party stays on its dungeon level (no warp)', pos.x[ai] === 92 && pos.y[ai] === 250 && pos.z[ai] === 1);
}

// ── a SAME-level in-dungeon hole still triggers (the z guard doesn't break legit holes) ──
{
  const world = buildWorld();
  world.getResource(SpatialIndex).loadedDungeons.add(3);
  const avatarRef = placeAvatar(world, 92, 250, 2);
  placeObj(world, { obj: 0x146, frame: 0, x: 92, y: 250, z: 2, quality: 4 });    // a hole on the avatar's OWN level
  const entered = checkDungeonEntry(world, ctx(avatarRef));
  const pos = world.store(Position), ai = world.resolve(avatarRef.handle);
  check('same-level: an in-dungeon hole still triggers, descends z2→z3', entered === true && pos.z[ai] === 3);
}

// ── report ──
const summary = `${pass} passed, ${fail} failed`;
console.log(`\n=== I-19g dungeon-entry: ${summary} ===`);
if (typeof document !== 'undefined') {
  const el = document.getElementById('out');
  if (el) {
    el.innerHTML =
      `<h2 class="${fail ? 'fail' : 'pass'}">I-19g dungeon-entry: ${summary}</h2>` +
      results.map(r => `<div class="${r.ok ? 'pass' : 'fail'}">${r.ok ? '✓' : '✗'} ${r.name}</div>`).join('');
  }
}
window.__DUNGEON_ENTRY_RESULT__ = { pass, fail, results };
