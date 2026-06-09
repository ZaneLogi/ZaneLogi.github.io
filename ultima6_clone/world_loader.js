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
import { Schedules } from './resources/schedules.js';
import { ActorIndex } from './resources/actor_index.js';
import { Position, Renderable, ObjType, Status, Amount, Actor, Schedule, Container, ContainedIn, PartyMember, AIMode, Destination } from './components/components.js';
import { AI_COMMAND, AI_FOLLOW, AI_SCHEDULE } from './systems/ai_modes.js';

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

function spawnFromRecord(world, reg, spatial, rec, isActor) {
  const e = world.create();
  world.add(e, Position, { x: rec.x, y: rec.y, z: rec.z });
  world.add(e, ObjType, { objNumber: rec.objNumber, frame: rec.frame });
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
  world.add(e, ObjType, { objNumber: rec.objNumber, frame: rec.frame });
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
  const reg = world.getResource(TileRegistry);
  const actorIndex = world.getResource(ActorIndex);
  const records = decodeObjblk(bytes);
  const handleByInFileIdx = new Array(records.length);
  let objects = 0, items = 0, contained = 0;

  // Pass 1 — spawn entities, record handles.
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    if (rec.coordUse === LOCXYZ) {
      handleByInFileIdx[i] = spawnFromRecord(world, reg, spatial, rec, false);
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
      console.warn(`CONTAINED record ${i} in ${objblkName(id)}: parent in-file idx ${rec.assoc} has no spawned entity — dropping`);
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
    const spatial = world.getResource(SpatialIndex);
    for (const id of regionsInView(world.getResource(Camera), canvas, tileSize))
      if (!spatial.loadedRegions.has(id)) loadRegion(world, id);
  };
}
