// Level change (I-19) — switch the ACTIVE map level (overworld 0 / dungeons 1..5).
//
// The "active level" is MapLevel.level. Everything that needs the current level
// reads it: terrain render (MapLevel.tileAt dispatches), the camera wrap
// (camera_system), the avatar move wrap (avatar_move_system), and the entity
// z-filter (I-19b). setActiveLevel is the single mutation point; the USE-ladder
// handler (I-19d, port of seg_101C.c C_101C_089E) drives it together with the
// avatar reposition + the per-level object load (I-19c).

import { MapLevel } from '../resources/map_level.js';
import { loadDungeonLevel } from '../world_loader.js';

// Set the active level. Returns the previous level (so callers can detect a no-op).
// Entering a dungeon (z != 0) fire-and-forget loads that level's objects (I-19c) —
// load-once + resident; the surface streamer handles level 0.
export function setActiveLevel(world, z) {
  const map = world.getResource(MapLevel);
  const prev = map.level;
  map.level = z;
  if (z !== 0) loadDungeonLevel(world, z);
  return prev;
}
