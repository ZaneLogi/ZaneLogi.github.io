// systems/use_container.js
//
// I-container — USE-on-container. Open a chest/barrel/crate on the map and **spill its
// contents onto the ground tile** (source-faithful): the chest handler C_27A1_2BBC
// ("use chest", seg_27a1.c:1327) + the shared search/spill C_27A1_09A1 ("Searching
// here, you find …", seg_27a1.c:402). The inverse — MOVE/DROP an item onto an OPEN
// container puts it inside (C_27A1_00A9 + InsertObj CONTAINED) — lands in sub-step d
// (canInsertInto, imported by command_dispatch). See progress.md §"I-container scope".

import { ObjType } from '../components/components.js';
import { setObjectFrame } from '../world_loader.js';

// The USE-openable container types (the C_27A1_2BBC / C_27A1_09A1 set from the USE
// switch, seg_27a1.c:3030-3075): Chest (lockable + trappable) · Barrel · Crate.
export const CHEST = 0x062, BARREL = 0x0BA, CRATE = 0x0C0;
export const CONTAINER_TYPES = [CHEST, BARREL, CRATE];

// Chest frame model (C_27A1_2BBC): 1 = closed, 0 = open, 2 = key-locked, 3 = magically
// locked. Plain USE *toggles* closed(1)↔open(0); the spill (+ trap, sub-step c) fires on
// the closed→open transition. Barrel/crate carry no lock state — USE always searches.
const OPEN = 0, CLOSED = 1;

// USE on a container (the dispatcher already re-picked the target object, so we only do
// the type-specific effect). Chest = open/close toggle; barrel/crate = always search.
// Sub-step a: the frame toggle + placeholder messages. Sub-step b swaps the placeholders
// for the real spill; sub-step c adds the lock/trap handling before the open.
export function useContainer({ world, target, message }) {
  const objs = world.store(ObjType);
  const i = world.resolve(target.entity);
  if (i === -1) return;
  const objNum = objs.objNumber[i];
  if (objNum === CHEST) {
    if (objs.frame[i] === OPEN) {                  // open → close
      setObjectFrame(world, target.entity, CLOSED);
      message('You close the chest.');
      return;
    }
    setObjectFrame(world, target.entity, OPEN);    // closed (or locked — sub-step c) → open
    message('You open the chest.');                // spill: sub-step b
  } else {                                          // barrel / crate: search, no frame toggle
    message('Searching here, you find nothing.');   // spill: sub-step b
  }
}
