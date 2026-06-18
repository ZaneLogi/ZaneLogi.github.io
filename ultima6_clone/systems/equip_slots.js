// systems/equip_slots.js (I-18g)
//
// Equipment-slot model for the I-18g/h/i equipped-equipment view — the de-scoped
// paperdoll (a labeled slot list, not source's body-positioned doll). Ports the
// slot machinery WITHOUT the visual doll:
//   - equipSlotForTile = STAT_GetEquipSlot (seg_155D.c:129) — an item's tile -> slot.
//   - buildEquipment   = the Equipment[8] assignment loop (C_155D_07E0, seg_155D.c:219)
//     — places each EQUIPped item in its slot with the collision rules.
// SLOT_* ids + the 8 user-facing labels are GAME.EXE's (u6.h:290-297). TIL_* are
// absolute tile ids (tile.h: `TIL_NNN == 0xNNN`), so they port as hex literals.

// Slot ids — the storage order of Equipment[8] (u6.h:290-297).
export const SLOT = Object.freeze({ HEAD: 0, NECK: 1, RHND: 2, RFNG: 3, CHST: 4, LHND: 5, LFNG: 6, FEET: 7 });
// Transient classifier results, resolved to a real slot by the builder (u6.h:298-299).
const SLOT_2HND = 8, SLOT_RING = 9;

// GAME.EXE's SLOT_* words, indexed by slot id (chosen over Nuvie's Body/Hand/Arm —
// these distinguish the two hands + two fingers explicitly, clearer in a list).
export const SLOT_LABEL = Object.freeze(['Head', 'Neck', 'Right Hand', 'Right Finger', 'Chest', 'Left Hand', 'Left Finger', 'Feet']);
// Top-to-bottom display order for the slot list (head -> feet; weapon hand before shield).
export const SLOT_ORDER = Object.freeze([SLOT.HEAD, SLOT.NECK, SLOT.CHST, SLOT.RHND, SLOT.LHND, SLOT.RFNG, SLOT.LFNG, SLOT.FEET]);

// A two-handed weapon occupies RHND and BLOCKS LHND; the builder marks the empty hand
// with this sentinel so the view can show "(two-handed)" (source stores Equipment[LHND]=1).
export const BLOCKED = Object.freeze({ blocked: true });

// One-handed weapons (-> SLOT_RHND): the 33-entry D_07DD[] table (seg_155D.c:121).
const RHND_TILES = new Set([
  0x220, 0x221, 0x223, 0x224, 0x225, 0x226, 0x227, 0x22a,
  0x22f, 0x230, 0x238, 0x254, 0x256, 0x255, 0x259, 0x262,
  0x263, 0x264, 0x270, 0x271, 0x272, 0x273, 0x274, 0x275,
  0x279, 0x27d, 0x27e, 0x27f, 0x280, 0x281, 0x2a2, 0x2a3,
  0x2b9,
]);

// STAT_GetEquipSlot (seg_155D.c:129) — an item's current tile -> slot, or -1 (not
// equippable). The if-chain ORDER is source-faithful: 0x219 hits NECK before CHST.
export function equipSlotForTile(tile) {
  if (tile === 0x21a || tile === 0x21b) return SLOT.FEET;
  if (tile === 0x258 || (tile >= 0x37d && tile <= 0x37f)) return SLOT_RING;
  if (tile === 0x219 || (tile >= 0x250 && tile <= 0x252) || tile === 0x217 || tile === 0x101) return SLOT.NECK;
  if (tile >= 0x200 && tile <= 0x207) return SLOT.HEAD;
  if ((tile >= 0x210 && tile <= 0x216) || tile === 0x218 || tile === 0x219 || tile === 0x28c || tile === 0x28e || tile === 0x29d || tile === 0x257) return SLOT.CHST;
  if (tile === 0x228 || tile === 0x229 || tile === 0x231 || tile === 0x235 || (tile >= 0x22b && tile <= 0x22e)) return SLOT_2HND;
  if ((tile >= 0x208 && tile <= 0x20f) || tile === 0x222) return SLOT.LHND;
  if (RHND_TILES.has(tile)) return SLOT.RHND;
  return -1;
}

// Build the 8-slot equipment array from a holder's EQUIPped items. Mirrors C_155D_07E0's
// assignment loop (seg_155D.c:219): classify each item, then resolve collisions —
//   two-handed -> RHND + block LHND;  a second one-hander -> spill RHND<->LHND;
//   ring -> first free finger (RFNG then LFNG).
// Returns Array(8) indexed by SLOT.*; each cell = item | BLOCKED | null.
export function buildEquipment(equippedItems, reg) {
  const eq = new Array(8).fill(null);
  for (const item of equippedItems) {
    let slot = equipSlotForTile(reg.tileForObject(item.objNumber, item.frame));
    if (slot < 0) continue;                                       // not equippable (defensive)
    if (slot === SLOT_2HND) { slot = SLOT.RHND; eq[SLOT.LHND] = BLOCKED; }
    else if (slot === SLOT.RHND && eq[SLOT.RHND]) slot = SLOT.LHND;
    else if (slot === SLOT.LHND && eq[SLOT.LHND]) slot = SLOT.RHND;
    else if (slot === SLOT_RING) slot = eq[SLOT.RFNG] ? SLOT.LFNG : SLOT.RFNG;
    eq[slot] = item;
  }
  return eq;
}

// The ready-time slot resolution (C_155D_144B, seg_155D.c:549-568): map a classified slot
// (incl. the transient SLOT_2HND / SLOT_RING) to its target slot given the CURRENT 8-slot
// array `eq`. The caller then checks `eq[target]` for the "No place to put!" refuse — BLOCKED
// counts as occupied (truthy), so a two-handed weapon's blocked off-hand correctly refuses.
export function resolveReadySlot(slot, eq) {
  if (slot === SLOT_2HND) return !eq[SLOT.RHND] ? SLOT.RHND : (!eq[SLOT.LHND] ? SLOT.LHND : SLOT.RHND);
  if (slot === SLOT.RHND && eq[SLOT.RHND] && !eq[SLOT.LHND]) return SLOT.LHND;
  if (slot === SLOT.LHND && eq[SLOT.LHND] && !eq[SLOT.RHND]) return SLOT.RHND;
  if (slot === SLOT_RING) return eq[SLOT.RFNG] ? SLOT.LFNG : SLOT.RFNG;
  return slot;
}
