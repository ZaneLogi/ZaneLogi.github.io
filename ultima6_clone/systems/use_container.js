// systems/use_container.js
//
// I-container — USE-on-container. Open a chest/barrel/crate on the map and **spill its
// contents onto the ground tile** (source-faithful): the chest handler C_27A1_2BBC
// ("use chest", seg_27a1.c:1327) + the shared search/spill C_27A1_09A1 ("Searching
// here, you find …", seg_27a1.c:402). The inverse — MOVE/DROP an item onto an OPEN
// container puts it inside (C_27A1_00A9 + InsertObj CONTAINED) — lands in sub-step d
// (canInsertInto, imported by command_dispatch). See progress.md §"I-container scope".

import { ObjType, Position } from '../components/components.js';
import { setObjectFrame, inventoryOf, dropToMap } from '../world_loader.js';

// The USE-openable container types (the C_27A1_2BBC / C_27A1_09A1 set from the USE
// switch, seg_27a1.c:3030-3075): Chest (lockable + trappable) · Barrel · Crate.
export const CHEST = 0x062, BARREL = 0x0BA, CRATE = 0x0C0;
export const CONTAINER_TYPES = [CHEST, BARREL, CRATE];

// Chest frame model (C_27A1_2BBC): 1 = closed, 0 = open, 2 = key-locked, 3 = magically
// locked. Plain USE *toggles* closed(1)↔open(0); the spill (+ trap, sub-step c) fires on
// the closed→open transition. Barrel/crate carry no lock state — USE always searches.
const OPEN = 0, CLOSED = 1;

// Lock/trap pseudo-items, NOT loot: OBJ_150 "Charge" + OBJ_151 "Effect". Source's
// C_27A1_09A1 skips both when spilling (seg_27a1.c:440); the trap-detect (sub-step c)
// reads OBJ_151 before this filter.
const OBJ_CHARGE = 0x150, OBJ_EFFECT = 0x151;

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

// USE on a container (the dispatcher already re-picked the target object, so we only do
// the type-specific effect). Chest = open/close toggle then spill; barrel/crate = always
// search/spill. Sub-step c inserts the lock/trap handling before the chest open.
export function useContainer({ world, target, message, name }) {
  const objs = world.store(ObjType);
  const i = world.resolve(target.entity);
  if (i === -1) return;
  const objNum = objs.objNumber[i];
  if (objNum === CHEST) {
    if (objs.frame[i] === OPEN) {                  // open → close (no spill — source frame 0 plain-use)
      setObjectFrame(world, target.entity, CLOSED);
      message('You close the chest.');
      return;
    }
    setObjectFrame(world, target.entity, OPEN);    // closed (or locked — sub-step c) → open
    message('You open the chest.');                // source's "opened!" line, then the search:
    spillContents(world, target.entity, message, name);
  } else {                                          // barrel / crate: search, no frame toggle
    spillContents(world, target.entity, message, name);
  }
}
