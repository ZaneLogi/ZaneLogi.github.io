// systems/use_container.js
//
// I-container — USE-on-container. Open a chest/barrel/crate on the map and **spill its
// contents onto the ground tile** (source-faithful): the chest handler C_27A1_2BBC
// ("use chest", seg_27a1.c:1327) + the shared search/spill C_27A1_09A1 ("Searching
// here, you find …", seg_27a1.c:402). The inverse — MOVE/DROP an item onto an OPEN
// container puts it inside (C_27A1_00A9 + InsertObj CONTAINED) — lands in sub-step d
// (canInsertInto, imported by command_dispatch). See progress.md §"I-container scope".

import { ObjType, Position, Amount, Container, PartyMember } from '../components/components.js';
import { setObjectFrame, inventoryOf, dropToMap } from '../world_loader.js';
import { SpatialIndex } from '../resources/spatial_index.js';

// The USE-openable container types (the C_27A1_2BBC / C_27A1_09A1 set from the USE
// switch, seg_27a1.c:3030-3075): Chest (lockable + trappable) · Barrel · Crate.
export const CHEST = 0x062, BARREL = 0x0BA, CRATE = 0x0C0;
export const CONTAINER_TYPES = [CHEST, BARREL, CRATE];

// Insert-accepting container types — source's C_27A1_00A9 / D_1C00 set MINUS the two it
// excludes as drop-targets (Spellbook 0x039 + Dead Body 0x153, which are lootable but you
// can't put items INTO them). Backpack/Bag/Basket always accept; the search-containers
// (chest/barrel/crate) accept only when OPEN (frame 0); the Vortex Cube accepts.
const BACKPACK = 0x063, BAG = 0x0BC, BASKET = 0x0BF, VORTEX_CUBE = 0x03E;
const INSERT_CONTAINERS = new Set([BACKPACK, BAG, BASKET, CHEST, BARREL, CRATE, VORTEX_CUBE]);
const OPEN_GATED = new Set([CHEST, BARREL, CRATE]);     // must be OPEN (frame 0) to accept
const SEARCH_CONTAINERS = new Set([CHEST, BARREL, CRATE]); // can't be NESTED into another container

// Chest frame model (C_27A1_2BBC): 1 = closed, 0 = open, 2 = key-locked, 3 = magically
// locked. Plain USE *toggles* closed(1)↔open(0); the spill (+ trap) fires on the
// closed→open transition. Barrel/crate carry no lock state — USE always searches.
const OPEN = 0, CLOSED = 1, KEY_LOCKED = 2, MAGIC_LOCKED = 3;

// Lock/trap pseudo-items, NOT loot: OBJ_150 "Charge" + OBJ_151 "Effect". Source's
// C_27A1_09A1 skips both when spilling (seg_27a1.c:440); the trap-detect reads OBJ_151
// of quality SPELL_16 (FindInvType, C_27A1_2BBC:1341) before this filter.
const OBJ_CHARGE = 0x150, OBJ_EFFECT = 0x151, SPELL_16 = 0x16;
// Key (OBJ_040) / lockpick (OBJ_03F) — the C_27A1_2D8E unlock items.
const OBJ_KEY = 0x040, OBJ_LOCKPICK = 0x03F;

// Join item names the way source's C_27A1_09A1 does: "a, b and c" (", " between, " and "
// before the last), or "nothing" when empty.
function joinList(names) {
  if (names.length === 0) return 'nothing';
  if (names.length === 1) return names[0];
  return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}

// Port of C_27A1_09A1 ("Searching here, you find …"): dropToMap each non-pseudo contained
// item onto the container's own cell (dropToMap = source's InsertObj-to-ground: strips
// ContainedIn, adds Position, spatial-indexes), then announce the loot. `nameOf(handle)`
// resolves an article-prefixed display name (threaded from command_dispatch).
export function spillContents(world, containerHandle, message, nameOf) {
  const pos = world.store(Position);
  const ci = world.resolve(containerHandle);
  const x = pos.x[ci], y = pos.y[ci], z = pos.z[ci];
  const loot = inventoryOf(world, containerHandle)
    .filter((it) => it.objNumber !== OBJ_CHARGE && it.objNumber !== OBJ_EFFECT);
  const names = loot.map((it) => nameOf(it.handle));         // name before the move (handles survive dropToMap)
  for (const it of loot) dropToMap(world, it.handle, x, y, z);
  message('Searching here, you find ' + joinList(names) + '.');
}

// Every item a party member carries, recursing into carried bags (the inventory_picker.js
// Container-gate recursion) — so a key tucked in a backpack still counts.
function* carriedItems(world, holder) {
  for (const it of inventoryOf(world, holder)) {
    yield it;
    if (world.has(it.handle, Container)) yield* carriedItems(world, it.handle);
  }
}

// Does the party hold the key/lockpick for this chest? Source's C_27A1_2D8E rule
// (seg_27a1.c:1410-1427): a key OBJ_040 whose quality matches the chest's *nonzero* lock
// quality, OR a lockpick OBJ_03F on a quality-0 lock. We auto-scan the whole party
// (recursively) instead of making the player USE-key-on-chest; the lockpick break-chance
// (C_27A1_2D34) is deferred — the scan never breaks the pick.
function hasUnlockKey(world, chestHandle) {
  const lockQual = world.store(Amount).quality[world.resolve(chestHandle)];
  for (const id of world.query(PartyMember)) {
    for (const it of carriedItems(world, world.handleOf(id))) {
      if (it.objNumber === OBJ_KEY && lockQual !== 0 && it.quality === lockQual) return true;
      if (it.objNumber === OBJ_LOCKPICK && lockQual === 0) return true;
    }
  }
  return false;
}

// Trap = a contained OBJ_151 ("Effect") of quality SPELL_16 (C_27A1_2BBC:1341). On open
// it springs (C_27A1_28A3): we print + consume the marker (DeleteObj, :1274) but apply NO
// damage — the Acid/Poison/Bomb/Gas effects need the combat subsystem (deferred). The
// marker has no Position (it's contained), so it's destroyed directly, not via
// deleteMapObject. Returns true if a trap sprang.
function springTrapIfAny(world, chestHandle, message) {
  const trap = inventoryOf(world, chestHandle).find(
    (it) => it.objNumber === OBJ_EFFECT && it.quality === SPELL_16);
  if (!trap) return false;
  world.destroy(trap.handle);
  message('You spring a trap!');
  return true;
}

// USE on a container (the dispatcher already re-picked the target object, so we only do
// the type-specific effect). Chest = open/close toggle then spill; barrel/crate = always
// search/spill. Sub-step c inserts the lock/trap handling before the chest open.
export function useContainer({ world, target, message, name }) {
  const objs = world.store(ObjType);
  const i = world.resolve(target.entity);
  if (i === -1) return;
  const objNum = objs.objNumber[i];
  if (objNum === CHEST) {
    const frame = objs.frame[i];
    if (frame === OPEN) {                           // open → close (no spill — source frame 0 plain-use)
      setObjectFrame(world, target.entity, CLOSED);
      message('You close the chest.');
      return;
    }
    // closed (1) / key-locked (2) / magic-locked (3) → open. Source REFUSES a locked chest
    // on plain USE; the clone force-opens (the door lock-bypass spirit) UNLESS the party
    // holds the matching key. Magic-locked always forces (no magic-unlock until I-spellbook).
    if (frame === KEY_LOCKED) {
      message(hasUnlockKey(world, target.entity) ? 'You unlock the chest.' : 'You force the chest open.');
    } else if (frame === MAGIC_LOCKED) {
      message('You force the chest open.');
    } else {
      message('You open the chest.');
    }
    springTrapIfAny(world, target.entity, message); // trap springs on any open (keyed or forced); no damage
    setObjectFrame(world, target.entity, OPEN);
    spillContents(world, target.entity, message, name);
  } else {                                          // barrel / crate: search, no frame toggle
    spillContents(world, target.entity, message, name);
  }
}

// --- sub-step d: the inverse — put an item INTO a container -----------------------------
// Port of C_27A1_00A9 (seg_27a1.c:51): can `itemHandle` be inserted into the container
// `containerHandle`? True iff the container is an insert-accepting type, an OPEN_GATED
// container (chest/barrel/crate) is actually open, and the item isn't itself a
// chest/barrel/crate (no nesting those). Weight (source's bp_0e < 0xff) is the mover's
// gate — the MOVE/DROP handlers already refuse fixed/255-weight objects upstream.
export function canInsertInto(world, containerHandle, itemHandle) {
  const ci = world.resolve(containerHandle), ii = world.resolve(itemHandle);
  if (ci === -1 || ii === -1 || ci === ii) return false;
  const objs = world.store(ObjType);
  const cType = objs.objNumber[ci];
  if (!INSERT_CONTAINERS.has(cType)) return false;
  if (OPEN_GATED.has(cType) && objs.frame[ci] !== OPEN) return false;
  if (SEARCH_CONTAINERS.has(objs.objNumber[ii])) return false;
  return true;
}

// The first accepting container at (x,y) for `itemHandle`, or null — source's FindLoc +
// C_27A1_00A9 test at the push/drop destination cell. Used by MOVE-push + DROP.
export function containerAtCell(world, x, y, itemHandle) {
  const ents = world.getResource(SpatialIndex).at(x, y);
  if (!ents) return null;
  for (const h of ents) if (canInsertInto(world, h, itemHandle)) return h;
  return null;
}
