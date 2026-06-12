// systems/cell_pick.js
//
// I-10b — the shared cell target resolver, generalized from main.js's I-7c
// inspectAtCell so the inspector hotkey AND the I-10 command dispatcher use one
// pick (instead of duplicating the logic per caller — the same DRY the source's
// shared targeting block achieves, research_game_loop.md).
//
// Source-faithful 3-tier pick — mkMouseSelection -> C_2337_08F1 (seg_2337.c:365)
// + COMBAT_canSee (seg_2337.c:340):
//   1. Gather candidates from the 4 SE-anchor cells (own + 3 neighbours whose
//      double-tile may extend back into (x,y)); source's NextLoc walks one chain
//      that already includes these.
//   2. Forward-iter spatial.at (chain-head order, matching source's FindLoc
//      first-walk).
//   3. IsTileIgnore tiles are DEPRIORITIZED, not skipped — kept as a fallback
//      (objNum_3) so an egg alone on a floor is still pickable.
//   4. NPCs win over objects (C_2337_08F1's second pass). Return
//      firstNpc ?? firstObj ?? firstIgObj.
//
// Returns the picked entity HANDLE (or null) — callers decide what to do with it.
//
// `forUse` = source's USE re-pick (C_27A1_0919): skip NPCs so USE targets the
// usable object, not an NPC standing on the cell.

import { SpatialIndex } from '../resources/spatial_index.js';
import { MapLevel } from '../resources/map_level.js';
import { Position, Renderable, Actor } from '../components/components.js';
import { forEachOccupiedCell } from './tile_footprint.js';

export function makePickAtCell(world, reg) {
  const rendStore = world.store(Renderable);
  const posStore = world.store(Position);
  return function pickAtCell(x, y, { forUse = false } = {}) {
    const spatial = world.getResource(SpatialIndex);
    const activeZ = world.getResource(MapLevel)?.level ?? 0;   // I-19b: only pick the active level's entities (?? 0 = no/stub MapLevel)
    let firstObj = null, firstNpc = null, firstIgObj = null;
    for (let dy = 0; dy <= 1; dy++) {
      for (let dx = 0; dx <= 1; dx++) {
        const ents = spatial.at(x + dx, y + dy);
        if (!ents) continue;
        for (const handle of ents) {
          const i = world.resolve(handle);
          if (i === -1) continue;
          if (posStore.z[i] !== activeZ) continue;   // I-19b: skip other-level entities
          let landedTile = -1;
          forEachOccupiedCell(reg, rendStore.tileId[i], x + dx, y + dy,
            (t, c, r) => { if (c === x && r === y) landedTile = t; });
          if (landedTile === -1) continue;
          if (world.has(handle, Actor)) {
            if (firstNpc === null) firstNpc = handle;
          } else if (reg.isTileIgnore(landedTile)) {
            if (firstIgObj === null) firstIgObj = handle;
          } else if (firstObj === null) {
            firstObj = handle;
          }
        }
      }
    }
    if (forUse) return firstObj ?? firstIgObj;        // C_27A1_0919: objects only, skip NPCs
    return firstNpc ?? firstObj ?? firstIgObj;
  };
}
