// In-memory verification for USE-on-container (I-container) — the spill (C_27A1_09A1),
// lock/trap (C_27A1_2BBC / C_27A1_28A3 / C_27A1_2D8E), and insert (C_27A1_00A9) logic in
// systems/use_container.js. Pure logic, no U6 data / no rendering. Open
// tests/test_container.html via the dev server; results log to console + page.

import { World } from '../ecs/world.js';
import { SpatialIndex } from '../resources/spatial_index.js';
import { MapLevel } from '../resources/map_level.js';
import { TileRegistry } from '../resources/tile_registry.js';
import { Position, Renderable, ObjType, Status, Amount, Actor, PartyMember, ContainedIn, Container } from '../components/components.js';
import { inventoryOf } from '../world_loader.js';
import { useContainer, canInsertInto, containerAtCell, CHEST, BARREL, CRATE } from '../systems/use_container.js';

const results = [];
let pass = 0, fail = 0;
function check(name, cond) {
  const ok = !!cond;
  if (ok) pass++; else fail++;
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
}

const KEY = 0x040, LOCKPICK = 0x03F, CHARGE = 0x150, EFFECT = 0x151, SPELL_16 = 0x16;
const SPELLBOOK = 0x039, DEAD_BODY = 0x153, BACKPACK = 0x063, BAG = 0x0BC, BASKET = 0x0BF, VORTEX = 0x03E;

function buildWorld() {
  const world = new World(256)
    .registerComponent(Position).registerComponent(Renderable).registerComponent(ObjType)
    .registerComponent(Status).registerComponent(Amount).registerComponent(Actor)
    .registerComponent(PartyMember).registerComponent(ContainedIn).registerComponent(Container);
  world.setResource(new SpatialIndex(256));
  world.setResource(new MapLevel(null, 0));
  world.setResource(new TileRegistry({ baseTile: { tileFor: () => 0 } }));
  return world;
}
// A container on the map (Container-tagged, like attachToHolder does at load).
function placeContainer(world, { obj, frame = 0, x = 50, y = 50, quality = 0 }) {
  const e = world.create();
  world.add(e, Position, { x, y, z: 0 });
  world.add(e, ObjType, { objNumber: obj, frame });
  world.add(e, Status, { bits: 0 });
  world.add(e, Amount, { quantity: 1, quality });
  world.add(e, Renderable, { tileId: 0 });
  world.add(e, Container);
  world.getResource(SpatialIndex).insertAtHead(x, y, e);
  return world.handleOf(world.resolve(e));
}
// A contained child of `holder` (no Position — it's off-map). `bag` tags it Container.
function addContained(world, holder, { obj, quality = 0, bag = false }) {
  const e = world.create();
  world.add(e, ObjType, { objNumber: obj, frame: 0 });
  world.add(e, Amount, { quantity: 1, quality });
  world.add(e, Renderable, { tileId: 0 });
  world.add(e, ContainedIn, { holder, equipped: 0 });
  if (bag) world.add(e, Container);
  return world.handleOf(world.resolve(e));
}
// An on-map item (the thing being moved/dropped).
function placeItem(world, { obj, x = 60, y = 60 }) {
  const e = world.create();
  world.add(e, Position, { x, y, z: 0 });
  world.add(e, ObjType, { objNumber: obj, frame: 0 });
  world.add(e, Amount, { quantity: 1, quality: 0 });
  world.add(e, Renderable, { tileId: 0 });
  world.getResource(SpatialIndex).insertAtHead(x, y, e);
  return world.handleOf(world.resolve(e));
}
function placeMember(world, { x = 50, y = 50, slot = 0 }) {
  const e = world.create();
  world.add(e, Position, { x, y, z: 0 });
  world.add(e, ObjType, { objNumber: 0x141, frame: 0 });
  world.add(e, PartyMember, { slotIndex: slot });
  world.add(e, Actor, { npcId: slot });
  world.getResource(SpatialIndex).insertAtHead(x, y, e);
  return world.handleOf(world.resolve(e));
}
const NAMES = { 0xA0: 'a sword', 0xA1: 'a shield', 0xA2: 'a key' };
const nameStub = (world) => (h) => NAMES[world.store(ObjType).objNumber[world.resolve(h)]] || 'a thing';
function use(world, container) {
  const msgs = [];
  useContainer({ world, target: { entity: container }, message: (m) => msgs.push(m), name: nameStub(world) });
  return msgs;
}
// Did `item` spill onto the container's cell (now on-map at that cell)?
function onCell(world, item, x, y) {
  const i = world.resolve(item);
  return i !== -1 && world.has(item, Position) && world.store(Position).x[i] === x && world.store(Position).y[i] === y;
}

// ── spill: loot to the ground, OBJ_150 filtered + kept, the "a, b and c" join ──
{
  const world = buildWorld();
  const chest = placeContainer(world, { obj: CHEST, frame: 1, x: 50, y: 50 });
  const a = addContained(world, chest, { obj: 0xA0 });
  const b = addContained(world, chest, { obj: 0xA1 });
  const lock = addContained(world, chest, { obj: CHARGE });   // OBJ_150 — filtered, kept inside
  const msgs = use(world, chest);
  check('spill: chest closed→open (frame 1→0)', world.store(ObjType).frame[world.resolve(chest)] === 0);
  check('spill: loot a + b land on the chest cell', onCell(world, a, 50, 50) && onCell(world, b, 50, 50));
  check('spill: OBJ_150 stays contained (not spilled)', !world.has(lock, Position) && inventoryOf(world, chest).length === 1);
  check('spill: message joins "a and b"', msgs.includes('Searching here, you find a sword and a shield.'));
}
// ── empty container → "nothing"; three-item join "a, b and c" ──
{
  const world = buildWorld();
  const empty = placeContainer(world, { obj: BARREL, x: 10, y: 10 });
  check('spill: empty barrel → "nothing"', use(world, empty).includes('Searching here, you find nothing.'));
  const crate = placeContainer(world, { obj: CRATE, x: 20, y: 20 });
  addContained(world, crate, { obj: 0xA0 }); addContained(world, crate, { obj: 0xA1 }); addContained(world, crate, { obj: 0xA2 });
  check('spill: three-item join "a, b and c"', use(world, crate).includes('Searching here, you find a sword, a shield and a key.'));
}
// ── toggle: open chest closes (no spill) ──
{
  const world = buildWorld();
  const chest = placeContainer(world, { obj: CHEST, frame: 0, x: 30, y: 30 });
  addContained(world, chest, { obj: 0xA0 });
  const msgs = use(world, chest);
  check('toggle: open chest USE → closes (frame 0→1)', world.store(ObjType).frame[world.resolve(chest)] === 1);
  check('toggle: closing does NOT spill', msgs.includes('You close the chest.') && inventoryOf(world, chest).length === 1);
}
// ── lock: force-open with no key (key-locked + magic-locked) ──
{
  const world = buildWorld();
  placeMember(world, {});                                       // empty-handed party
  const keyLocked = placeContainer(world, { obj: CHEST, frame: 2, x: 40, y: 40, quality: 5 });
  check('lock: key-locked, no key → "force the chest open"', use(world, keyLocked).includes('You force the chest open.'));
  check('lock: forced chest still opens (frame→0)', world.store(ObjType).frame[world.resolve(keyLocked)] === 0);
  const magic = placeContainer(world, { obj: CHEST, frame: 3, x: 41, y: 41, quality: 0 });
  check('lock: magic-locked → "force the chest open"', use(world, magic).includes('You force the chest open.'));
}
// ── lock: a matching key in party inventory opens cleanly ──
{
  const world = buildWorld();
  const m = placeMember(world, {});
  addContained(world, m, { obj: KEY, quality: 5 });             // key quality 5 matches the lock
  const chest = placeContainer(world, { obj: CHEST, frame: 2, x: 40, y: 40, quality: 5 });
  check('lock: matching key → "unlock the chest"', use(world, chest).includes('You unlock the chest.'));
}
// ── lock: a key nested in a bag still unlocks (recursive party scan) ──
{
  const world = buildWorld();
  const m = placeMember(world, {});
  const bag = addContained(world, m, { obj: BAG, bag: true });
  addContained(world, bag, { obj: KEY, quality: 7 });           // key buried in a backpack
  const chest = placeContainer(world, { obj: CHEST, frame: 2, x: 40, y: 40, quality: 7 });
  check('lock: key nested in a bag still unlocks', use(world, chest).includes('You unlock the chest.'));
}
// ── lock: a lockpick opens a quality-0 lock; a key does NOT ──
{
  const world = buildWorld();
  const m = placeMember(world, {});
  addContained(world, m, { obj: LOCKPICK });
  const q0 = placeContainer(world, { obj: CHEST, frame: 2, x: 40, y: 40, quality: 0 });
  check('lock: lockpick opens a quality-0 lock', use(world, q0).includes('You unlock the chest.'));

  const world2 = buildWorld();
  const m2 = placeMember(world2, {});
  addContained(world2, m2, { obj: KEY, quality: 5 });           // a key, but the lock is quality 0
  const q0b = placeContainer(world2, { obj: CHEST, frame: 2, x: 40, y: 40, quality: 0 });
  check('lock: a key does NOT open a quality-0 lock (force)', use(world2, q0b).includes('You force the chest open.'));
}
// ── trap: springs + consumes the marker; no damage; orthogonal to the key ──
{
  const world = buildWorld();
  const m = placeMember(world, {});
  addContained(world, m, { obj: KEY, quality: 5 });
  const chest = placeContainer(world, { obj: CHEST, frame: 2, x: 40, y: 40, quality: 5 });
  const trap = addContained(world, chest, { obj: EFFECT, quality: SPELL_16 });
  const loot = addContained(world, chest, { obj: 0xA0 });
  const msgs = use(world, chest);
  check('trap: "You spring a trap!" on open', msgs.includes('You spring a trap!'));
  check('trap: marker consumed (destroyed)', world.resolve(trap) === -1);
  check('trap: orthogonal to unlock (both messages)', msgs.includes('You unlock the chest.') && msgs.includes('You spring a trap!'));
  check('trap: loot still spills (trap not in loot list)', onCell(world, loot, 40, 40));
}

// ── insert (canInsertInto / containerAtCell, C_27A1_00A9) ──
{
  const world = buildWorld();
  const item = placeItem(world, { obj: 0xA0, x: 60, y: 60 });
  const openChest = placeContainer(world, { obj: CHEST, frame: 0, x: 50, y: 50 });
  const closedChest = placeContainer(world, { obj: CHEST, frame: 1, x: 51, y: 51 });
  const bag = placeContainer(world, { obj: BAG, x: 52, y: 52 });
  const backpack = placeContainer(world, { obj: BACKPACK, x: 53, y: 53 });
  const basket = placeContainer(world, { obj: BASKET, x: 54, y: 54 });
  const vortex = placeContainer(world, { obj: VORTEX, x: 55, y: 55 });
  const spellbook = placeContainer(world, { obj: SPELLBOOK, x: 56, y: 56 });
  const deadbody = placeContainer(world, { obj: DEAD_BODY, x: 57, y: 57 });
  const aCrate = placeItem(world, { obj: CRATE, x: 61, y: 61 });

  check('insert: OPEN chest accepts a normal item', canInsertInto(world, openChest, item) === true);
  check('insert: CLOSED chest rejects (must be open)', canInsertInto(world, closedChest, item) === false);
  check('insert: bag / backpack / basket always accept', canInsertInto(world, bag, item) && canInsertInto(world, backpack, item) && canInsertInto(world, basket, item));
  check('insert: vortex cube accepts', canInsertInto(world, vortex, item) === true);
  check('insert: spellbook + dead body reject (lootable, not drop-targets)', canInsertInto(world, spellbook, item) === false && canInsertInto(world, deadbody, item) === false);
  check('insert: no nesting a chest/crate into a container', canInsertInto(world, bag, aCrate) === false);
  check('insert: self-insert rejected', canInsertInto(world, bag, bag) === false);
  check('insert: containerAtCell finds the open chest at its cell', containerAtCell(world, 50, 50, item) === openChest);
  check('insert: containerAtCell ignores a closed chest', containerAtCell(world, 51, 51, item) === null);
}

// ── report ──
const summary = `${pass} passed, ${fail} failed`;
console.log(`\n=== I-container: ${summary} ===`);
if (typeof document !== 'undefined') {
  const el = document.getElementById('out');
  if (el) {
    el.innerHTML =
      `<h2 class="${fail ? 'fail' : 'pass'}">I-container: ${summary}</h2>` +
      results.map(r => `<div class="${r.ok ? 'pass' : 'fail'}">${r.ok ? '✓' : '✗'} ${r.name}</div>`).join('');
  }
}
window.__CONTAINER_RESULT__ = { pass, fail, results };
