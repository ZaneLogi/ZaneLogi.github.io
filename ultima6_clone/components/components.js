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
// Actor — tag for the 256 objlist NPC slots. Carries the objlist slot id
// (the same id used as ActorIndex key + Schedule.npcId). Used by the
// inspector + future systems to look up the NPC's per-slot record
// (party-membership check, name, AI state).
export const Actor = defineComponent('Actor', { npcId: Uint8Array });

// Schedule (I-5): NPCs with at least one slot in the SCHEDULE file. npcId is the
// objlist slot index (0..255) — the same index used as Schedules.byNpc[npcId].
// NPCs without any schedule slots are not tagged.
export const Schedule = defineComponent('Schedule', { npcId: Uint8Array });

// AIMode (I-9): the NPCMode byte (ai.h / systems/ai_modes.js) driving the pathfinding
// state machine — AI_SCHEDULE -> AI_FINDPATH -> AI_ONPATH -> (AI_84/85/86) -> worktype.
// The per-NPC path itself (the direction array + cursor) lives in the Paths resource,
// keyed by handle, not here (variable-length data doesn't fit the SoA store).
export const AIMode = defineComponent('AIMode', { mode: Uint8Array });

// Destination (I-9d): the xyz an NPC in AI_FINDPATH is heading toward — its current
// active schedule slot. Set by the schedule system on an hour-trigger (the ECS analog
// of source's SchedIndex pointing at the active Schedule[] entry); read by the NPC
// tick to build/re-plan a path, and by doOnPath to tell "arrived" from "ran out".
// `action` is the slot's worktype (an AI_* code >= 0x87) applied on arrival by
// __AtDestination (I-9g) — what the NPC does once it reaches the slot (stand facing a
// direction, guard, sit/eat/sleep). Defaults 0 (AI_MOTIONLESS) until a slot fires.
export const Destination = defineComponent('Destination', { x: Int16Array, y: Int16Array, z: Uint8Array, action: Uint8Array });

// PartyMember (I-8b): the player's party — Avatar + companions. slotIndex is the
// 0-based position in source's Party[] array (Avatar = slot 0; no distinct avatar
// marker — source treats the Avatar as just Party[0]). Membership IS this
// component: world.query(PartyMember) sorted by slotIndex is the canonical member
// list (MoveFollowers walks it at I-8c). Tagged at loadActors for any actor whose
// objlist slot id appears in objlist.party[]. Singleton party state (active member,
// follow/solo mode) lives in the Party resource, not here.
export const PartyMember = defineComponent('PartyMember', { slotIndex: Uint8Array });

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
