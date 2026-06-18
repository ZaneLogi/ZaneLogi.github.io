// World loader — the dissolved ObjManager. Turns U6 world data into ECS entities:
//   - loadActors:  the 256 objlist NPC slots -> Actor entities (global; NPCs are
//                  eager-resident, per architecture_ecs.md §7). Also populates
//                  ActorIndex (slot-id -> handle) for I-6 containment lookups.
//   - loadRegion:  one OBJBLK region's world objects -> entities (demand-loaded,
//                  idempotent + cached via SpatialIndex.loadedRegions). Two-pass:
//                  pass 1 spawns all entities and records in-file index -> handle;
//                  pass 2 fixes up CONTAINED ContainedIn via that map. INVEN/EQUIP
//                  resolve through ActorIndex in pass 1 (NPC slot ID, stable).
// LOCXYZ records get Position + Renderable + ObjType + Status + (Amount/Actor) and
// land in the SpatialIndex. INVEN/EQUIP/CONTAINED items get the same components
// *minus Position* (off-map) plus ContainedIn{holder, equipped}; the holder gets
// the Container tag idempotently. Source's deserialize at seg_1184.c:1389-1390
// runs one pass and reads _6000[parent_idx] under the assumption that parents
// come earlier on disk; the two-pass shape here makes that assumption explicit
// (and survives any same-pass reordering the source happens to tolerate).

import { U6DB } from './u6db.js';
import { decodeObjblk, CoordUse } from './assets/objblk.js';
import { Camera } from './resources/camera.js';
import { TileRegistry } from './resources/tile_registry.js';
import { SpatialIndex } from './resources/spatial_index.js';
import { MapLevel } from './resources/map_level.js';
import { Schedules } from './resources/schedules.js';
import { ActorIndex } from './resources/actor_index.js';
import { Position, Renderable, ObjType, Status, Amount, Actor, Schedule, Container, ContainedIn, PartyMember, AIMode, Destination, Alignment, MoveSpeed } from './components/components.js';
import { AI_COMMAND, AI_FOLLOW, AI_SCHEDULE } from './systems/ai_modes.js';
import { OBJ_BLUE_GATE } from './assets/moon_tables.js';

const LOCXYZ = CoordUse.LOCXYZ;

// World region grid: 8x8 regions of 128x128 tiles. id = col + row*8 (col=x>>7, row=y>>7).
export function regionId(col, row) { return (col & 7) + ((row & 7) << 3); }
export function objblkName(id) {
  return `objblk${String.fromCharCode(97 + (id & 7))}${String.fromCharCode(97 + ((id >> 3) & 7))}`;
}

// Region ids overlapping the visible viewport (camera world-pixels -> tiles -> regions).
export function regionsInView(cam, canvas, tileSize) {
  const x0 = Math.floor(cam.worldX / tileSize), y0 = Math.floor(cam.worldY / tileSize);
  const x1 = x0 + Math.ceil(canvas.width / tileSize), y1 = y0 + Math.ceil(canvas.height / tileSize);
  const ids = new Set();
  for (let ry = y0 >> 7; ry <= y1 >> 7; ry++)
    for (let rx = x0 >> 7; rx <= x1 >> 7; rx++)
      ids.add(regionId(rx, ry));
  return ids;
}

function spawnFromRecord(world, reg, spatial, rec, isActor, zOverride) {
  const e = world.create();
  world.add(e, Position, { x: rec.x, y: rec.y, z: zOverride ?? rec.z });
  world.add(e, ObjType, { objNumber: rec.objNumber, frame: rec.frame, origObjNumber: rec.objNumber });
  world.add(e, Status, { bits: rec.status });
  world.add(e, Renderable, { tileId: reg.tileForObject(rec.objNumber, rec.frame) });
  if (isActor) world.add(e, Actor, { npcId: rec.id });
  else world.add(e, Amount, { quantity: rec.quantity, quality: rec.quality });
  spatial.insert(rec.x, rec.y, e);
  return e;
}

// Spawn an off-map item entity (no Position / SpatialIndex entry). Common to
// INVEN, EQUIP, and CONTAINED — they differ only in how the holder is resolved.
// query(Position) and the renderer skip these naturally.
function spawnOffMapItem(world, reg, rec) {
  const e = world.create();
  world.add(e, ObjType, { objNumber: rec.objNumber, frame: rec.frame, origObjNumber: rec.objNumber });
  world.add(e, Status, { bits: rec.status });
  world.add(e, Amount, { quantity: rec.quantity, quality: rec.quality });
  world.add(e, Renderable, { tileId: reg.tileForObject(rec.objNumber, rec.frame) });
  return e;
}

// Attach a contained item to its holder. Idempotently marks the holder Container.
// equipped is meaningful only for EQUIP (CoordUse=0x18) — INVEN and CONTAINED
// pass 0. EQUIP can only target an NPC holder; CONTAINED targets an object.
function attachToHolder(world, itemHandle, holderHandle, equipped) {
  world.add(itemHandle, ContainedIn, { holder: holderHandle, equipped: equipped ? 1 : 0 });
  if (!world.has(holderHandle, Container)) world.add(holderHandle, Container);
}

// Load one OBJBLK region. Two-pass to resolve CONTAINED's in-file index → handle:
//   Pass 1: spawn every record (LOCXYZ + INVEN/EQUIP + CONTAINED-without-holder),
//           record handle by in-file index. INVEN/EQUIP attach to NPC holders
//           via ActorIndex during this pass (NPC handles are already global).
//   Pass 2: walk again, attach each CONTAINED item to its parent via the
//           in-file-index → handle map.
// Returns { objects, items, contained }. Idempotent + cached per region id.
export async function loadRegion(world, id) {
  const spatial = world.getResource(SpatialIndex);
  if (spatial.loadedRegions.has(id)) return { objects: 0, items: 0, contained: 0 };
  spatial.loadedRegions.add(id);                 // mark before await: guards concurrent calls
  const bytes = await U6DB.get(objblkName(id));
  if (!bytes) return { objects: 0, items: 0, contained: 0 };
  return spawnObjblkRecords(world, decodeObjblk(bytes), objblkName(id));   // surface: z from each record
}

// Dungeon OBJBLK file for level 1..5: objblkai..objblkei (one file per level).
export function dungeonObjblkName(level) { return `objblk${String.fromCharCode(96 + level)}i`; }

// Load a dungeon LEVEL's world objects (I-19c). One OBJBLK file per level, so EVERY
// LOCXYZ object in it belongs to that level — z is forced to `level` (the file's
// packed pos.z is single-valued; off-map INVEN/EQUIP/CONTAINED items ignore z).
// Cached in loadedDungeons (load-once + resident — the no-region-unload rule), and
// fire-and-forget from setActiveLevel: objects pop in when the async decode lands
// (spatial.insert flags a render rebuild). Returns { objects, items, contained }.
export async function loadDungeonLevel(world, level) {
  if (level < 1 || level > 5) return { objects: 0, items: 0, contained: 0 };
  const spatial = world.getResource(SpatialIndex);
  if (spatial.loadedDungeons.has(level)) return { objects: 0, items: 0, contained: 0 };
  spatial.loadedDungeons.add(level);             // mark before await: guards concurrent entries
  const name = dungeonObjblkName(level);
  const bytes = await U6DB.get(name);
  if (!bytes) return { objects: 0, items: 0, contained: 0 };
  return spawnObjblkRecords(world, decodeObjblk(bytes), name, level);
}

// Two-pass spawn of one OBJBLK file's records (shared by surface loadRegion +
// dungeon loadDungeonLevel). `levelZ` (dungeon only) forces LOCXYZ objects onto that
// level; omit it on the surface to use each record's own packed z.
//   Pass 1: spawn every record (LOCXYZ + INVEN/EQUIP + CONTAINED-without-holder),
//           record handle by in-file index. INVEN/EQUIP attach to NPC holders
//           (ActorIndex — NPCs are global) in this pass.
//   Pass 2: attach each CONTAINED item to its parent via the in-file-index → handle map.
function spawnObjblkRecords(world, records, label, levelZ) {
  const reg = world.getResource(TileRegistry);
  const spatial = world.getResource(SpatialIndex);
  const actorIndex = world.getResource(ActorIndex);
  const handleByInFileIdx = new Array(records.length);
  let objects = 0, items = 0, contained = 0;

  // Pass 1 — spawn entities, record handles.
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    if (rec.coordUse === LOCXYZ) {
      // Blue moongates (OBJ_055) are derived runtime state — spawnBlueGates reconstructs
      // them from D_2C74 + moon phase, so they're never authored map data. Skip any a
      // played-save's objblk carries: the spawn-reconcile can't dedupe two gates on one
      // cell, so a loaded gate beside the reconstructed one would persist as a duplicate.
      // Red gates (OBJ_054) ARE genuine single-use objects — keep them. research_moongate.md §4.
      if (rec.objNumber === OBJ_BLUE_GATE) continue;
      handleByInFileIdx[i] = spawnFromRecord(world, reg, spatial, rec, false, levelZ);
      objects++;
    } else if (rec.coordUse === CoordUse.INVEN || rec.coordUse === CoordUse.EQUIP) {
      const holder = actorIndex?.get(rec.assoc);
      if (holder === undefined) continue;        // owner NPC absent (off-map / empty slot)
      const e = spawnOffMapItem(world, reg, rec);
      attachToHolder(world, e, holder, rec.coordUse === CoordUse.EQUIP);
      handleByInFileIdx[i] = e;
      items++;
    } else if (rec.coordUse === CoordUse.CONTAINED) {
      handleByInFileIdx[i] = spawnOffMapItem(world, reg, rec);   // ContainedIn attached in pass 2
    }
  }

  // Pass 2 — resolve CONTAINED via in-file index → handle.
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    if (rec.coordUse !== CoordUse.CONTAINED) continue;
    const itemHandle = handleByInFileIdx[i];
    const holderHandle = handleByInFileIdx[rec.assoc];
    if (holderHandle === undefined) {
      console.warn(`CONTAINED record ${i} in ${label}: parent in-file idx ${rec.assoc} has no spawned entity — dropping`);
      world.destroy(itemHandle);
      continue;
    }
    attachToHolder(world, itemHandle, holderHandle, false);
    contained++;
  }
  return { objects, items, contained };
}

// Load all on-map NPCs from the decoded objlist. NPCs are global (one objlist file),
// so this runs once at startup, independent of the viewport. Tags NPCs that have
// schedule data (I-5c) with the Schedule component carrying their objlist slot id.
// Also populates ActorIndex so I-6's INVEN/EQUIP path can resolve owner NPC by slot.
// Returns { actors, scheduled } counts.
export function loadActors(world, objlist) {
  const reg = world.getResource(TileRegistry);
  const spatial = world.getResource(SpatialIndex);
  const schedules = world.getResource(Schedules);
  const actorIndex = world.getResource(ActorIndex);
  // I-8b: slot id -> 0-based party position (Avatar = 0), for PartyMember tagging.
  const partyIndexBySlot = new Map();
  for (let p = 0; p < objlist.partySize; p++) partyIndexBySlot.set(objlist.party[p], p);
  let actors = 0, scheduled = 0, party = 0;
  for (const a of objlist.actors) {
    if (a.objNumber === 0 || (a.status & 0x18) !== LOCXYZ) continue;   // empty slot or off-map
    const e = spawnFromRecord(world, reg, spatial, a, true);
    actorIndex?.set(a.id, e);
    world.add(e, Alignment, { value: a.npcStatus & 0x60 });   // I-11a: carry NPCStatus alignment (else dropped)
    world.add(e, MoveSpeed, { dexterity: a.dexterity, credit: 0 });   // I-14: DEXTE-paced accumulator state
    const isParty = partyIndexBySlot.has(a.id);
    if (schedules?.hasSchedule(a.id)) {
      world.add(e, Schedule, { npcId: a.id });
      scheduled++;
    }
    if (isParty) {
      const slot = partyIndexBySlot.get(a.id);
      world.add(e, PartyMember, { slotIndex: slot });
      // Party AIMode keeps these OUT of the NPC tick (which only ticks 0x81..0x86);
      // the avatar (slot 0) + companions move via player input / MoveFollowers (I-8).
      world.add(e, AIMode, { mode: slot === 0 ? AI_COMMAND : AI_FOLLOW });
      party++;
    } else if (schedules?.hasSchedule(a.id)) {
      // Scheduled non-party NPC: drive it via the I-9 pathfinding state machine.
      // Starts AI_SCHEDULE (awaiting the first hour-trigger); Destination is filled
      // by the schedule system when a slot fires.
      world.add(e, AIMode, { mode: AI_SCHEDULE });
      world.add(e, Destination, { x: a.x, y: a.y, z: a.z });
    }
    // Unscheduled non-party NPCs get no AIMode -> never ticked (they hold position).
    actors++;
  }
  return { actors, scheduled, party };
}

// Runtime object-mutation primitive (I-10c+). Set an object's frame and refresh
// its render tile to match — the shared path every USE effect (door/crank toggle,
// later lever/lantern) and any other frame change goes through, mirroring source's
// SetFrame. No SpatialIndex change (the object stays in its cell). Passability
// follows for free: door open/closed is per-frame tile flags, not a special case,
// and canStandAt reads the live tileId (research_map_render / I-4 passability).
export function setObjectFrame(world, handle, frame) {
  const i = world.resolve(handle);
  if (i === -1) return;
  const reg = world.getResource(TileRegistry);
  const objs = world.store(ObjType);
  const rend = world.store(Renderable);
  objs.frame[i] = frame;
  rend.tileId[i] = reg.tileForObject(objs.objNumber[i], frame);
}

// --- Runtime map-object primitives (I-10d+) -------------------------------------
// add / delete / query world objects at runtime, mirroring source's AddObj /
// DeleteObj / SearchArea. Shared by the USE quality-linked controls (lever→
// portcullis, switch→electric-field, crank→drawbridge) and later GET/DROP.

// Spawn a world object at (x,y,z) and splice it at the cell's chain HEAD (runtime
// add = AddMapObj head-splice, the I-7 mutation discipline). Mirrors source AddObj
// + ClrLocal (status 0 = not LOCAL/temporary). Returns the new handle.
export function addMapObject(world, { objNumber, frame, x, y, z = 0, quality = 0, quantity = 1, status = 0 }) {
  const reg = world.getResource(TileRegistry);
  const spatial = world.getResource(SpatialIndex);
  const e = world.create();
  world.add(e, Position, { x, y, z });
  world.add(e, ObjType, { objNumber, frame, origObjNumber: objNumber });
  world.add(e, Status, { bits: status });
  world.add(e, Amount, { quantity, quality });
  world.add(e, Renderable, { tileId: reg.tileForObject(objNumber, frame) });
  spatial.insertAtHead(x, y, e);
  return e;
}

// Remove a world object (mirrors source DeleteObj): unlink from its cell, destroy
// the entity. No-op if the handle is stale or off-map.
export function deleteMapObject(world, handle) {
  const i = world.resolve(handle);
  if (i === -1 || !world.has(handle, Position)) return;
  const pos = world.store(Position);
  world.getResource(SpatialIndex).remove(pos.x[i], pos.y[i], handle);
  world.destroy(handle);
}

// Move an on-map (LOCXYZ) object into a holder's inventory — source's
// InsertObj(obj, holder, INVEN) for GET's non-stack path (C_27A1_18F5:882). Unlinks
// the entity from the map (spatial + Position) and attaches it as
// ContainedIn{holder, equipped:0}; Renderable/Amount stay (the inspector icon + qty).
// Stack MERGING (source's GiveObj) is deferred — a got stack becomes one INVEN entity.
// Returns false if the handle is stale.
export function moveToInventory(world, itemHandle, holderHandle) {
  const i = world.resolve(itemHandle);
  if (i === -1) return false;
  if (world.has(itemHandle, Position)) {
    const pos = world.store(Position);
    world.getResource(SpatialIndex).remove(pos.x[i], pos.y[i], itemHandle);
    world.remove(itemHandle, Position);            // off-map now — the renderer skips it
  }
  attachToHolder(world, itemHandle, holderHandle, false);   // INVEN (not equipped)
  return true;
}

// Create a fresh item directly in a holder's pack — source's GiveObj (insert a NEW obj as
// INVEN). The off-map analog of addMapObject: same component set minus Position, attached as
// a ContainedIn child. Stack-merge into an existing same-type stack is deferred (a new stack
// per call, as for GET). Used by Create Food (I-spellbook). Returns the new item handle.
export function giveToInventory(world, holderHandle, { objNumber, frame = 0, quality = 0, quantity = 1, status = 0 }) {
  const reg = world.getResource(TileRegistry);
  const e = world.create();
  world.add(e, ObjType, { objNumber, frame, origObjNumber: objNumber });
  world.add(e, Status, { bits: status });
  world.add(e, Amount, { quantity, quality });
  world.add(e, Renderable, { tileId: reg.tileForObject(objNumber, frame) });
  attachToHolder(world, e, holderHandle, false);
  return e;
}

// Toggle an inventory item between worn (EQUIP) and carried (INVEN) — source's InsertObj
// EQUIP/INVEN coord-use flip (C_155D ready/unready). The item stays in the holder's inventory;
// only ContainedIn.equipped changes (the I-18h split key + the snapshot persists it). No-op if
// the handle is stale or the item isn't contained. I-18j.
export function setEquipped(world, itemHandle, equipped) {
  const i = world.resolve(itemHandle);
  if (i === -1 || !world.has(itemHandle, ContainedIn)) return false;
  world.store(ContainedIn).equipped[i] = equipped ? 1 : 0;
  return true;
}

// Ready an item onto a holder as EQUIP (worn) — source's InsertObj(item, di, EQUIP) in the Ready
// path (C_155D_144B:581), where `di` is the item's OUTERMOST holder (the party member). Re-parents
// the item to `holderHandle` + marks it equipped, so readying an item nested in a bag pulls it out
// onto the member (the bagged-equip case the source UI never reaches but the function handles).
// No-op if the handle is stale. I-18j/B.
export function readyItem(world, itemHandle, holderHandle) {
  if (world.resolve(itemHandle) === -1) return false;
  attachToHolder(world, itemHandle, holderHandle, true);
  return true;
}

// Drop an inventory item onto a map cell — the inverse of moveToInventory (source's
// DROP placement, C_27A1_14DA: MoveObj the item to the cell). Strips ContainedIn,
// adds Position{x,y,z}, and head-splices into the SpatialIndex (the I-7 mutation
// discipline = AddMapObj/MoveObj order). Renderable/Amount carry over. Returns false
// if the handle is stale. (Source SetOkToGet — anti-theft — is moot until karma lands.)
export function dropToMap(world, itemHandle, x, y, z = 0) {
  const i = world.resolve(itemHandle);
  if (i === -1) return false;
  if (world.has(itemHandle, ContainedIn)) world.remove(itemHandle, ContainedIn);
  world.add(itemHandle, Position, { x, y, z });
  world.getResource(SpatialIndex).insertAtHead(x, y, itemHandle);
  return true;
}

// Relocate an on-map (LOCXYZ) object to another cell — source's MoveObj(obj, x, y, z).
// Used by MOVE's push (I-10i) and reusable by any runtime relocate. Same chain-head
// discipline as the avatar step (avatar_move_system): spatial.remove → update Position
// → insertAtHead. No-op (returns false) on a stale handle or an off-map item (an
// inventory item has no Position — put it on the map via dropToMap instead). z carries
// over unless overridden.
export function moveMapObject(world, handle, x, y, z) {
  const i = world.resolve(handle);
  if (i === -1 || !world.has(handle, Position)) return false;
  const pos = world.store(Position);
  const spatial = world.getResource(SpatialIndex);
  spatial.remove(pos.x[i], pos.y[i], handle);
  pos.x[i] = x; pos.y[i] = y;
  if (z !== undefined) pos.z[i] = z;
  spatial.insertAtHead(x, y, handle);
  return true;
}

// All on-map objects of a given type, optionally filtered by quality (source's
// SearchArea + type/quality test, e.g. C_27A1_433D / C_27A1_4479). Returns handles.
//
// `near` imposes source's LEVEL bound — and only that. The quality-linked controls
// (lever/switch) call SearchArea(0,0,0x3ff,0x3ff) + NextArea (seg_1184.c:369/345):
// walk the resident Link[] chain and keep each LOCXYZ object on `z == MapZ`. The bbox
// is the WHOLE MAP, so source applies NO distance restriction — a lever toggles EVERY
// same-quality marker on its level, however far away (a portcullis and its lever can sit
// at opposite ends of a dungeon). Pass `near = {x, y, z}` (the control's cell) to apply
// that `z == near.z` filter; only `z` is read (x/y kept for call-site symmetry). Omit
// `near` for a cross-level global scan.
//
// Deviation note: source's resident set is only the loaded area (DOS streaming evicts the
// rest), so a lever never sees same-quality objects in an UN-loaded dungeon/castle. The
// clone never unloads, so every same-quality marker on a z-level co-resides. U6 authors
// each level's objblk with distinct control qualities, so a lever still hits exactly its
// own gate(s); only if two dungeons on one z-level ever reused a quality would a lever
// toggle the other's (off-screen) gate — tighten to a per-dungeon bbox if that surfaces.
// (Earlier the clone clamped this to a ±20 box around the lever, which wrongly stranded
// any gate >20 tiles from its lever — non-faithful; removed.)
export function findObjectsByTypeQuality(world, objNumber, quality, near = null) {
  const objs = world.store(ObjType), amts = world.store(Amount);
  const pos = near ? world.store(Position) : null;
  const out = [];
  // near → query(ObjType, Position) yields only on-map entities (the LOCXYZ analog;
  // CONTAINED/INVEN/EQUIP items have no Position, like source's GetCoordUse filter).
  for (const id of (near ? world.query(ObjType, Position) : world.query(ObjType))) {
    if (objs.objNumber[id] !== objNumber) continue;
    if (quality !== undefined && amts.quality[id] !== quality) continue;
    if (near && pos.z[id] !== near.z) continue;   // NextArea's z == MapZ; bbox is the whole map → no distance box
    out.push(world.handleOf(id));
  }
  return out;
}

// First object of a given type at (x,y), or null (a spatial __SearchTypeAt analog).
export function objAtCell(world, x, y, objNumber) {
  const ents = world.getResource(SpatialIndex).at(x, y);
  if (!ents) return null;
  const objs = world.store(ObjType);
  for (const h of ents) {
    const i = world.resolve(h);
    if (i !== -1 && objs.objNumber[i] === objNumber) return h;
  }
  return null;
}

// Is an actor (NPC / party member) standing at (x,y)? Source's occupancy gate uses
// the actor/world-object index split (object index < 0x100 == an actor); the ECS
// analog is "any entity here with the Actor component" (C_27A1_3E9A).
export function actorAtCell(world, x, y) {
  const ents = world.getResource(SpatialIndex).at(x, y);
  if (!ents) return false;
  for (const h of ents) if (world.has(h, Actor)) return true;
  return false;
}

// I-6a inspection helper. Walk query(ContainedIn), match by holder handle, return
// { entity, objNumber, frame, quantity, quality, equipped } for each item. Linear
// scan — fine for inventories of single-digit-to-low-dozens size; if inventories
// grow large we'd add a parallel holder -> children index, but the inspector
// (I-7) won't need it for ordinary NPCs.
export function inventoryOf(world, holderHandle) {
  const cs = world.store(ContainedIn);
  const objs = world.store(ObjType);
  const amounts = world.store(Amount);
  const items = [];
  for (const id of world.query(ContainedIn)) {
    if (cs.holder[id] !== holderHandle) continue;
    items.push({
      handle: world.handleOf(id),
      objNumber: objs.objNumber[id],
      frame: objs.frame[id],
      quantity: amounts.quantity[id],
      quality: amounts.quality[id],
      equipped: !!cs.equipped[id],
    });
  }
  return items;
}

// Demand-load every OBJBLK region overlapping the current viewport. Returns
// { objects, items, contained } summed across regions (LOCXYZ + INVEN/EQUIP + CONTAINED).
export async function ensureRegionsInView(world, cam, canvas, tileSize) {
  let objects = 0, items = 0, contained = 0;
  for (const id of regionsInView(cam, canvas, tileSize)) {
    const r = await loadRegion(world, id);
    objects += r.objects; items += r.items; contained += r.contained;
  }
  return { objects, items, contained };
}

// Camera-driven streaming render-system: each frame, fire-and-forget load of any
// in-view region not yet resident. loadRegion is idempotent (marks the region
// loaded synchronously), so a region is triggered once; its objects pop in when the
// async decode lands and SpatialIndex.insert flags a render rebuild.
export function makeStreamingSystem(canvas, tileSize) {
  return (world) => {
    if (world.getResource(MapLevel).level !== 0) return;   // I-19c: surface regions stream only on the overworld; a dungeon loads whole-level on entry
    const spatial = world.getResource(SpatialIndex);
    for (const id of regionsInView(world.getResource(Camera), canvas, tileSize))
      if (!spatial.loadedRegions.has(id)) loadRegion(world, id);
  };
}
