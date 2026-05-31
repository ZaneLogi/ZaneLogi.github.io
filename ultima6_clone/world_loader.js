// World loader — the dissolved ObjManager. Turns U6 world data into ECS entities:
//   - loadActors:  the 256 objlist NPC slots -> Actor entities (global; NPCs are
//                  eager-resident, per architecture_ecs.md §7).
//   - loadRegion:  one OBJBLK region's world objects -> entities (demand-loaded,
//                  idempotent + cached via SpatialIndex.loadedRegions).
// Both create Position + ObjType + Status + (Amount) + Renderable components and
// insert into the SpatialIndex. Containment (CONTAINED/INVEN/EQUIP) is deferred —
// only on-map (LOCXYZ) objects/NPCs become entities for now.

import { U6DB } from './u6db.js';
import { decodeObjblk } from './assets/objblk.js';
import { Camera } from './resources/camera.js';
import { TileRegistry } from './resources/tile_registry.js';
import { SpatialIndex } from './resources/spatial_index.js';
import { Schedules } from './resources/schedules.js';
import { Position, Renderable, ObjType, Status, Amount, Actor, Schedule } from './components/components.js';

const LOCXYZ = 0x00;   // ObjStatus coord-use bits 0x18 == 0 => object lives at (x,y,z)

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
  if (isActor) world.add(e, Actor);
  else world.add(e, Amount, { quantity: rec.quantity, quality: rec.quality });
  spatial.insert(rec.x, rec.y, e);
  return e;
}

// Load one OBJBLK region's on-map objects. Idempotent + cached. Returns spawn count.
export async function loadRegion(world, id) {
  const spatial = world.getResource(SpatialIndex);
  if (spatial.loadedRegions.has(id)) return 0;
  spatial.loadedRegions.add(id);                 // mark before await: guards concurrent calls
  const bytes = await U6DB.get(objblkName(id));
  if (!bytes) return 0;
  const reg = world.getResource(TileRegistry);
  let n = 0;
  for (const rec of decodeObjblk(bytes)) {
    if (rec.coordUse !== LOCXYZ) continue;        // skip contained/inventory (deferred)
    spawnFromRecord(world, reg, spatial, rec, false);
    n++;
  }
  return n;
}

// Load all on-map NPCs from the decoded objlist. NPCs are global (one objlist file),
// so this runs once at startup, independent of the viewport. Tags NPCs that have
// schedule data (I-5c) with the Schedule component carrying their objlist slot id.
// Returns { actors, scheduled } counts.
export function loadActors(world, objlist) {
  const reg = world.getResource(TileRegistry);
  const spatial = world.getResource(SpatialIndex);
  const schedules = world.getResource(Schedules);
  let actors = 0, scheduled = 0;
  for (const a of objlist.actors) {
    if (a.objNumber === 0 || (a.status & 0x18) !== LOCXYZ) continue;   // empty slot or off-map
    const e = spawnFromRecord(world, reg, spatial, a, true);
    if (schedules?.hasSchedule(a.id)) {
      world.add(e, Schedule, { npcId: a.id });
      scheduled++;
    }
    actors++;
  }
  return { actors, scheduled };
}

// Demand-load every OBJBLK region overlapping the current viewport. Returns total spawned.
export async function ensureRegionsInView(world, cam, canvas, tileSize) {
  let total = 0;
  for (const id of regionsInView(cam, canvas, tileSize)) total += await loadRegion(world, id);
  return total;
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
