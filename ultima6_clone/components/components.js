// Component definitions (shared descriptor singletons — import these everywhere so
// registration and queries use the same object). Grows by family as steps land.

import { defineComponent } from '../ecs/world.js';

export const Position = defineComponent('Position', { x: Int16Array, y: Int16Array, z: Uint8Array });
export const Renderable = defineComponent('Renderable', { tileId: Uint16Array });

// World-object / NPC data (I-2). ObjType is the object's type identity (resolves its
// tile via basetile, and drives interaction later); Status is the packed ObjStatus
// byte; Amount is stack quantity + quality. Actor is a tag for the 256 NPC slots.
// origObjNumber mirrors source's OrigShapeType (seg_1E0F.c): saved at load = objNumber,
// restored on wakeup / pose-exit so pose worktypes (SLEEP → OBJ_092 sprite; PLAY →
// OBJ_188 instrument sprite) don't permanently change the NPC's identity.
export const ObjType = defineComponent('ObjType', { objNumber: Uint16Array, frame: Uint8Array, origObjNumber: Uint16Array });
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

// MoveSpeed (I-14): per-actor movement-speed state for the DEXTE-paced accumulator
// (the modern-rewrite of source's MovePts/DEXTE economy — see progress.md §"I-14 scope").
// `dexterity` is the source dexterity stat (objlist 0x0a00, 1..30), used as a SPEED METER:
// rate(dexterity) (systems/move_economy.js) maps it into a calibrated tiles/sec band.
// `credit` is the continuous accumulator (a moveCredit pool, fractional → Float32): each
// heartbeat it gains rate × WORLD_SPEED × elapsed, and an NPC steps one tile when it
// reaches the tile's stepCost. Carried onto every loaded Actor at loadActors. NOT source's
// saved MovePts byte (unused under the accumulator).
export const MoveSpeed = defineComponent('MoveSpeed', { dexterity: Uint8Array, credit: Float32Array });

// Alignment (I-11a): the per-NPC moral alignment — NEUTRAL(0) / EVIL(0x20) / GOOD(0x40)
// / CHAOTIC(0x60), bits 0x60 of source's per-NPC NPCStatus byte (u6.h:115-121). The
// clone carries it from objlist at load (loadActors: value = npcStatus & 0x60) into this
// component rather than the dropped NPCStatus byte; LOAD-ONLY until its mutators (party
// join/leave in I-13, charm/combat later) land. First in-scope reader: the TALK
// evil/chaotic gate (I-11c). See docs/research_save_load.md §"NPCStatus decomposition".
export const Alignment = defineComponent('Alignment', { value: Uint8Array });

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

// Spawned (I-egg b): tag for egg-hatched temporary creatures (and their multi-tile parts).
// The clone's stand-in for source's temporary-monster pool (object slots 0xe0-0xff, always
// LOCAL — research_egg.md §5): the clone has no fixed table, so a tag marks "this creature
// was hatched, not authored." Two readers: the cull pass (I-egg e) reaps tagged creatures
// that drift past the cull radius (the C_1184_19AA stream-out behaviour, §9.1), and
// passability blocks them (a spawned monster occupies its cell like an Actor does — but it's
// NOT an objlist Actor, so it carries no npcId and never lands in ActorIndex). Persisted by
// the generic snapshot (gracefully absent in pre-egg saves → no SNAPSHOT_VERSION bump, same
// as MoonGates / loadedDungeons). `body` links a multi-tile part to its head entity's save-id
// `body` (a handle ref → snapshot-remapped) links a multi-tile PART to its head entity; 0 =
// "I am a standalone creature / the head". `ox`/`oy` (set on parts in d-visual) are the part's
// fixed offset from the head — the part-follow pass keeps part.pos = head.pos + (ox,oy) so a
// moving multi-tile creature (e.g. a grazing cow) drags its parts; the head excludes its own
// parts from canStandAt via `body === actorId`, so it never self-blocks.
export const Spawned = defineComponent('Spawned', { body: Float64Array, ox: Int8Array, oy: Int8Array });
