// ActorIndex (I-6a): slot-id -> entity-handle reverse map for the 256 objlist NPCs.
// Populated by loadActors as it spawns NPC entities; consumed by loadRegion's
// INVEN/EQUIP branch, which reads each item's GetAssoc (= NPC slot ID, stable
// across regions per seg_1184.c:1389-1390 — only CONTAINED is index-rewritten,
// INVEN/EQUIP keep their on-disk slot ID) and looks up the holder entity.
//
// "Slot 0..0xFF" matches source's NPC range — `objlist.actors[i].id` IS the slot
// ID. NPCs without LOCXYZ status (objNumber === 0 or off-map) aren't entities and
// aren't in this map; INVEN/EQUIP items referencing them are dropped with a warn.

export class ActorIndex {
  constructor() { this.bySlot = new Map(); }
  set(slotId, handle) { this.bySlot.set(slotId, handle); }
  get(slotId) { return this.bySlot.get(slotId); }
  has(slotId) { return this.bySlot.has(slotId); }
}
