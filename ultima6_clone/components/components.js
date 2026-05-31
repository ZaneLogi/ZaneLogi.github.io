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
