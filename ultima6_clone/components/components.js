// Component definitions (shared descriptor singletons — import these everywhere so
// registration and queries use the same object). Grows by family as steps land.

import { defineComponent } from '../ecs/world.js';

export const Position = defineComponent('Position', { x: Int16Array, y: Int16Array, z: Uint8Array });
export const Renderable = defineComponent('Renderable', { tileId: Uint16Array });

// World-object / NPC data (I-2). ObjType is the object's type identity (resolves its
// tile via basetile, and drives interaction later); Status is the packed ObjStatus
// byte; Amount is stack quantity + quality. Actor is a tag for the 256 NPC slots.
export const ObjType = defineComponent('ObjType', { objNumber: Uint16Array, frame: Uint8Array });
export const Status = defineComponent('Status', { bits: Uint8Array });
export const Amount = defineComponent('Amount', { quantity: Uint8Array, quality: Uint8Array });
export const Actor = defineComponent('Actor');

// Schedule (I-5): NPCs with at least one slot in the SCHEDULE file. npcId is the
// objlist slot index (0..255) — the same index used as Schedules.byNpc[npcId].
// NPCs without any schedule slots are not tagged.
export const Schedule = defineComponent('Schedule', { npcId: Uint8Array });

// Containment (I-6): NPCs carry inventory, chests/barrels hold contents. Source's
// CoordUse byte encodes three off-map relationships (CONTAINED=0x08, INVEN=0x10,
// EQUIP=0x18 = INVEN|CONTAINED); INVEN/EQUIP land in I-6a, CONTAINED in I-6b.
//   Container        — tag for any entity that may hold others (set idempotently
//                      on holders as items resolve; absence = "not a container").
//   ContainedIn      — points the item at its holder. holder is a full handle
//                      (Float64Array — handles can reach 2^53; see ecs/world.js
//                      makeHandle); equipped distinguishes EQUIP (worn) from
//                      INVEN (carried), per the 0x08 bit set on EQUIP=0x18.
// Contained items intentionally carry NO Position component, so query(Position)
// and the SpatialIndex skip them — they exist only as graph nodes off their holder.
export const Container = defineComponent('Container');
export const ContainedIn = defineComponent('ContainedIn', { holder: Float64Array, equipped: Uint8Array });
