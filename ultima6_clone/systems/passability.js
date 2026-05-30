// Passability primitive — canStandAt(world, x, y, {actorId}). Pure function, NOT
// a scheduler-registered system. Both I-5 (NPC path step) and I-6 (avatar input)
// call this when deciding whether a single tile move is legal.
//
// Mirrors C_1E0F_000F (seg_1E0F.c:66-235), source's "can this object stand at
// (x,y)?" predicate. Source switches internally on the actor's monster class
// (walks / swims / flies / amphibian / ethereal); this port currently only
// implements the WALKS branch — the visible-progress trajectory through I-9 is
// all walks-class, so swim/fly/ethereal are deferred until a caller actually
// needs them (boats → swim; combat → fly + ethereal). The body grows by adding
// `if (swims) ...` / `if (flies) ...` arms inside; callers don't change.
//
// Deferred (each owns a later step):
//   - swim branch + OBJ_19E/F skiff/raft check     (boats, post-I-6)
//   - fly / ethereal branches                       (combat / monster AI)
//   - party-member pass-through (D_17B2)           (no avatar party yet)
//   - sacred-quest gate (OBJ_1A0 + VarInt['Q'-0x37]) (no quest flags yet)
//   - fence directional pass (TERRAIN_FLAG_80/40/20/10 on object's TerrainType)
//   - damage-tile flag (TERRAIN_FLAG_08 + D_17A9)  (no combat / hazard system)
//   - 5-type NPC-furniture overlap exception list (no sit/eat-at-furniture yet)
//
// See research_npc_ai.md §"Movement legality" for the full source predicate.

import { TileRegistry } from '../resources/tile_registry.js';
import { SpatialIndex } from '../resources/spatial_index.js';
import { MapLevel } from '../resources/map_level.js';
import { Renderable, Actor } from '../components/components.js';
import { forEachOccupiedCell } from './tile_footprint.js';

// Can the actor stand at (x, y)? actorId (entity handle, optional) excludes
// the actor itself from the per-cell scan so it doesn't block its own
// destination. Currently walks-class only; signature is source-shaped so the
// swim/fly/ethereal branches grow inside without touching callers.
export function canStandAt(world, x, y, { actorId } = {}) {
  const reg = world.getResource(TileRegistry);
  const spatial = world.getResource(SpatialIndex);
  const mapLevel = world.getResource(MapLevel);
  const rend = world.store(Renderable);

  // 1. Base terrain. Walkers can't enter an impassable terrain tile unless an
  //    object on that cell wins via Breakthrough (seg_1E0F.c:88,
  //    `bp_10 && !(terrainFlags & TERRAIN_FLAG_02)`).
  let blocked = reg.isTerrainImpassable(mapLevel.tileAt(x, y));

  // 2. Object iteration. Our SpatialIndex stores each entity at its anchor cell
  //    only (anchor = SE corner of multi-tile objects, per U6 convention). A 2x2
  //    footprint reaches NW from its anchor, so the four candidate anchors whose
  //    footprint COULD cover (x,y) are (x,y), (x+1,y), (x,y+1), (x+1,y+1). For
  //    each candidate, ask forEachOccupiedCell whether its footprint actually
  //    lands on (x,y), and if so, pick up the per-cell tile id to flag-check.
  //
  //    Source's FindLoc/NextLoc walks the (x,y) chain head→tail (newest-insert
  //    first; render docs §"Painter's algorithm" + world_render_system.js:68
  //    derive this from ShowObject). Our ents[] is in load order (oldest at 0),
  //    so iterate REVERSE to match the source scan order — only matters for the
  //    Breakthrough short-circuit's interaction with a stack at the same cell.
  for (let dy = 0; dy <= 1; dy++) {
    for (let dx = 0; dx <= 1; dx++) {
      const ents = spatial.at(x + dx, y + dy);
      if (!ents) continue;
      for (let k = ents.length - 1; k >= 0; k--) {
        const handle = ents[k];
        if (actorId !== undefined && handle === actorId) continue;
        const id = world.resolve(handle);
        if (id === -1) continue;

        // Per-cell tile id at (x,y) for THIS entity's footprint, if it covers
        // (x,y) at all. -1 = footprint misses (x,y), skip the entity.
        let tile = -1;
        forEachOccupiedCell(reg, rend.tileId[id], x + dx, y + dy, (t, col, row) => {
          if (col === x && row === y) tile = t;
        });
        if (tile === -1) continue;

        // Breakthrough — the object grants pass (overrides terrain block).
        // Short-circuit the scan UNLESS IsTileIgnore is also set on the same
        // tile (seg_1E0F.c:142-146:
        //   `if(bp_10 && IsTileBr(bp_0a)) { retVal=1; if(!IsTileIg(bp_0a)) break; }`).
        if (reg.isBreakthrough(tile)) {
          blocked = false;
          if (!reg.isTileIgnore(tile)) return true;
          continue;
        }

        // Object's TerrainType bit 02 — the per-frame "this tile blocks walkers"
        // (closed-door frame, wall section, table). Open-door frames lack the bit
        // and fall through to non-blocking. seg_1E0F.c:162-164.
        if (reg.isTerrainImpassable(tile)) blocked = true;

        // NPCs always block (c_04ed: `if(i < 0x100 && i) ... keepFind=retVal=0; break;`).
        // The 5-type furniture exception list is dropped — none of those overlap
        // types are in scope until SIT/EAT/PLAY worktypes land.
        if (world.has(handle, Actor)) return false;
      }
    }
  }

  return !blocked;
}
