// Generic ECS world snapshot — serialize every live entity's components + the mutable
// singleton resources (+ the mutable `objlist` NPC-record/global state the conversation
// system mutates outside the ECS) to a plain JSON-able object, and restore them onto a
// freshly-built world. This is the clone's save format: per docs/research_save_load.md
// ("the format is throwaway; the state set is the deliverable") the artifacts stay the
// static baseline (tiles/map/schedule/objlist/objblk) and this carries ONLY the mutable
// game state.
//
// Generic over the ECS: entities come from world.query() (no-arg = every live id),
// components from the components.js catalog filtered by world.isRegistered() — so a
// component added by a future subsystem is captured automatically once it's registered.
// Entity references (raw handles) can't survive a reload, so the convention is
// **a Float64Array component field is an entity-handle reference** (only
// ContainedIn.holder today; see components.js makeHandle note); such fields serialize
// as the referent's dense save-id and remap to the new handle on load.
//
// Deletion needs no tombstones: a destroyed object is simply absent from the dump, and
// because restore re-marks the saved loadedRegions, pristine objblk is never re-read to
// resurrect it (research_save_load.md §"Object deletion"; rests on no-region-unload).

import * as Components from '../../components/components.js';
import { OBJ_BLUE_GATE } from '../../assets/moon_tables.js';
import { SpatialIndex } from '../../resources/spatial_index.js';
import { ActorIndex } from '../../resources/actor_index.js';
import { WorldClock } from '../../resources/world_clock.js';
import { Party } from '../../resources/party.js';
import { MoonGates } from '../../resources/moon_gates.js';

// Save-format version. restoreWorld REJECTS any snapshot whose version != this, so a stale
// save fails cleanly instead of silently mis-restoring. Bump on EVERY persisted-schema change:
// a new saved component field, a new SAVED_RESOURCES field, a renamed/removed/retyped field.
//
// No migration framework lives in the clone (deliberate — Zane 2026-06-10): the format is
// throwaway and upgrading an old save is one-off transform work, not maintained code. When an
// old save must load on a newer build, ask Claude to migrate it: given the changelog below,
// Claude derives the version delta, patches the plain JSON, and bumps its `version`. THE RULE:
// every bump MUST append a one-line "what changed (+ how to migrate)" entry here, or that delta
// becomes unrecoverable and the on-demand migration breaks.
//
// Schema changelog (oldest first):
//   v1 → v2  (I-16a)  added ObjType.origObjNumber. Migrate: set origObjNumber = objNumber on
//                     every entity's ObjType. A v1 save predates the pose-sprite swaps, so its
//                     objNumber is always the real body — this fill is exact + lossless.
export const SNAPSHOT_VERSION = 2;

// The mutable singleton resources that count as save state (research_save_load.md
// §"Implications"). Everything else is static (TileRegistry/MapLevel/Schedules/Commands
// — from artifacts) or transient (Paths/SpatialIndex/ActorIndex/MessageLog/UIStack/
// Viewport — rebuilt on load). WorldSpeed + Camera are deliberately NOT here: the boot
// owns them (dev_hud re-applies the speed slider; startRender recenters the camera on the
// avatar), so persisting them would be dead weight that's overwritten on the next load.
// MoonGates.D_2C74 is the only persisted moongate state — burying relocates a blue
// endpoint, so the 8x3 array must survive a reload (the moon PHASES are derived,
// recomputed from the clock on load, so they're not saved). Like I-19's loadedDungeons,
// this is GRACEFULLY ABSENT in a pre-moongate save: serialize skips it if the resource
// is missing, restore's `!data` guard leaves the freshly-seeded canonical network in
// place — so no SNAPSHOT_VERSION bump is needed (an old save just re-seeds the defaults).
const SAVED_RESOURCES = [
  { cls: WorldClock, fields: ['Time_H', 'Time_M', 'Date_D', 'Date_M', 'Date_Y', 'D_2C55'] },
  { cls: Party,      fields: ['activeIndex', 'mode'] },
  { cls: MoonGates,  fields: ['D_2C74'] },
];

// Every registered component descriptor, in catalog (declaration) order. A def is the
// { name, fields } object returned by defineComponent.
function registeredComponentDefs(world) {
  return Object.values(Components).filter(
    (d) => d && typeof d === 'object' && typeof d.name === 'string' && d.fields && world.isRegistered(d),
  );
}

// Is this component field an entity-handle reference? Convention: handles need 53-bit
// range, so handle-carrying fields are declared Float64Array (components.js).
function isRefField(def, field) { return def.fields[field] === Float64Array; }

// --- serialize ------------------------------------------------------------
// world -> plain JSON-able object. `opts.artifactStamp` (optional) marks which data
// files the save was made against, checked on import for a mismatch warning.
//
// Entity ordering: on-map entities are emitted in SpatialIndex cell-chain order (so
// re-inserting them in save-id order on restore reproduces each cell's head/tail order,
// which cell-pick depends on — research_world_data.md); off-map entities (contained
// items, no Position) follow in query order (their order is immaterial — looked up by
// holder). save-id == index in the entities array.
export function serializeWorld(world, opts = {}) {
  const defs = registeredComponentDefs(world);
  const spatial = world.getResource(SpatialIndex);

  // Blue moongates (OBJ_055) are derived runtime state: spawnBlueGates rebuilds them from
  // the persisted D_2C74 + moon phase on load, so they're omitted from the dump (else a saved
  // gate would be both restored AND reconstructed). NO SNAPSHOT_VERSION bump: the persisted
  // state SET is unchanged (D_2C74 still carries the network), an old save's serialized gates
  // still restore + reconcile cleanly, and a new save's absent gates are rebuilt from D_2C74
  // even by old code. research_moongate.md §4.
  const objStore = world.store(Components.ObjType);
  const isBlueGate = (i) => world.has(world.handleOf(i), Components.ObjType) && objStore.objNumber[i] === OBJ_BLUE_GATE;

  const indices = [];
  const seen = new Set();
  if (spatial) {
    for (const arr of spatial.cells.values())
      for (const h of arr) {
        const i = world.resolve(h);
        if (i !== -1 && !seen.has(i) && !isBlueGate(i)) { seen.add(i); indices.push(i); }
      }
  }
  for (const i of world.query()) if (!seen.has(i) && !isBlueGate(i)) { seen.add(i); indices.push(i); }

  const indexToSaveId = new Map();
  indices.forEach((i, saveId) => indexToSaveId.set(i, saveId));

  const entities = indices.map((i) => {
    const h = world.handleOf(i);
    const comps = {};
    for (const def of defs) {
      if (!world.has(h, def)) continue;
      const store = world.store(def);
      const rec = {};
      for (const field of Object.keys(def.fields)) {
        if (isRefField(def, field)) {
          const refIndex = world.resolve(store[field][i]);     // raw handle -> live index
          rec[field] = refIndex === -1 ? -1 : (indexToSaveId.get(refIndex) ?? -1);
        } else {
          rec[field] = store[field][i];
        }
      }
      comps[def.name] = rec;
    }
    return { comps };
  });

  const resources = {};
  for (const { cls, fields } of SAVED_RESOURCES) {
    const inst = world.getResource(cls);
    if (!inst) continue;
    const rec = {};
    for (const f of fields) rec[f] = inst[f];
    resources[cls.name] = rec;
  }

  const out = {
    version: SNAPSHOT_VERSION,
    artifacts: opts.artifactStamp ?? null,
    entities,
    resources,
    loadedRegions: spatial ? [...spatial.loadedRegions] : [],
    loadedDungeons: spatial ? [...spatial.loadedDungeons] : [],   // I-19f: dungeon levels whose objblk is loaded
  };

  // The decoded `objlist` is the NPC-record + global save state that the conversation
  // system mutates IN PLACE (talk flags, trained stats, karma — conversation_system.js),
  // and that party join/leave will mutate later. It is NOT an ECS resource and is
  // re-decoded pristine each boot, so it must be snapshotted explicitly or talk results
  // (e.g. passing Lord British's questions) are lost on reload. Full objlist = source's
  // role for the `objlist` savegame file (research_save_load.md).
  if (opts.objlist) {
    out.objlist = {
      actors: opts.objlist.actors.map((a) => ({ ...a })),
      globals: { ...opts.objlist.globals },
      party: [...opts.objlist.party],
      partySize: opts.objlist.partySize,
    };
  }
  return out;
}

// --- restore --------------------------------------------------------------
// Recreate the snapshot onto a FRESH world (no entities yet; components + resources
// already registered, per main.js boot). Runs in place of loadActors: the full
// snapshot is authoritative, and its loadedRegions gate loadRegion so the pristine
// objblk never overwrites mutations or resurrects deletions.
export function restoreWorld(world, snapshot, opts = {}) {
  if (!snapshot || snapshot.version !== SNAPSHOT_VERSION) {
    throw new Error(`snapshot version ${snapshot && snapshot.version} != expected ${SNAPSHOT_VERSION}`);
  }
  const defs = registeredComponentDefs(world);
  const byName = new Map(defs.map((d) => [d.name, d]));
  const { Actor, Position } = Components;

  // Pass 1: create every entity, add its components with non-ref field values.
  // Ref fields are deferred — they need every entity's freshly-allocated handle first.
  const saveIdToHandle = new Array(snapshot.entities.length);
  const pendingRefs = [];   // { saveId, def, field, refSaveId }
  snapshot.entities.forEach((ent, saveId) => {
    const h = world.create();
    saveIdToHandle[saveId] = h;
    for (const [name, rec] of Object.entries(ent.comps)) {
      const def = byName.get(name);
      if (!def) { console.warn(`restore: unknown component '${name}' — skipped`); continue; }
      const values = {};
      for (const field of Object.keys(def.fields)) {
        if (isRefField(def, field)) pendingRefs.push({ saveId, def, field, refSaveId: rec[field] });
        else if (field in rec) values[field] = rec[field];
      }
      world.add(h, def, values);   // ref field left at default 0 until pass 2
    }
  });

  // Pass 2: rewrite ref fields save-id -> new handle.
  for (const { saveId, def, field, refSaveId } of pendingRefs) {
    const ownerIdx = world.resolve(saveIdToHandle[saveId]);
    if (ownerIdx === -1) continue;
    const refHandle = refSaveId >= 0 ? saveIdToHandle[refSaveId] : 0;
    if (refSaveId >= 0 && refHandle === undefined) console.warn(`restore: dangling ref save-id ${refSaveId}`);
    world.store(def)[field][ownerIdx] = refHandle || 0;
  }

  // Rebuild the derived indexes from the restored entities.
  const actorIndex = world.getResource(ActorIndex);
  if (actorIndex && world.isRegistered(Actor)) {
    const a = world.store(Actor);
    for (const i of world.query(Actor)) actorIndex.set(a.npcId[i], world.handleOf(i));
  }
  const spatial = world.getResource(SpatialIndex);
  if (spatial && world.isRegistered(Position)) {
    const p = world.store(Position);
    // Insert in save-id order; on-map entities were emitted in cell-chain order, so
    // tail-append reproduces each cell's head/tail order (cell-pick fidelity).
    for (const h of saveIdToHandle) {
      const i = world.resolve(h);
      if (i === -1 || !world.has(h, Position)) continue;
      spatial.insert(p.x[i], p.y[i], h);
    }
    spatial.loadedRegions = new Set(snapshot.loadedRegions);
    // I-19f: restore the loaded-dungeon set so a later setActiveLevel/ladder neither re-loads
    // a visited level (duplicating objects) nor resurrects deletions (same role loadedRegions
    // plays for the surface), while an UNvisited level still loads on first entry. Persisted,
    // not derived from entity z — a dungeon NPC at z=2 doesn't mean level 2's objblk was loaded.
    // `|| []` keeps pre-I-19 saves (no field) loadable without a SNAPSHOT_VERSION bump.
    spatial.loadedDungeons = new Set(snapshot.loadedDungeons || []);
    spatial.dirty = true;
  }

  // Restore the whitelisted resources onto their existing instances.
  for (const { cls, fields } of SAVED_RESOURCES) {
    const data = snapshot.resources[cls.name];
    const inst = world.getResource(cls);
    if (!data || !inst) continue;
    for (const f of fields) if (f in data) inst[f] = data[f];
  }

  // Re-apply the saved objlist onto the freshly-decoded one IN PLACE (so the references
  // already held by the conversation host + window.__U6 see it): talk flags, trained
  // stats, karma, party roster. Without this, conversation results are lost on reload.
  if (snapshot.objlist && opts.objlist) {
    const src = snapshot.objlist, dst = opts.objlist;
    if (Array.isArray(src.actors)) src.actors.forEach((rec, i) => { if (dst.actors[i]) Object.assign(dst.actors[i], rec); });
    if (src.globals) Object.assign(dst.globals, src.globals);
    if (Array.isArray(src.party)) { dst.party.length = 0; dst.party.push(...src.party); }
    if (typeof src.partySize === 'number') dst.partySize = src.partySize;
  }
}
