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
import { Position, PartyMember } from '../components/components.js';
import { SpatialIndex } from '../resources/spatial_index.js';
import { hatchAroundAvatar, cullAroundAvatar } from './egg.js';

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

// Teleport the whole party to (nx, ny, nz) — the shared "hard cut" relocate behind
// BOTH the USE-ladder level change (I-19d, C_101C_089E's tail) and moongate travel
// (I-moongate, GateTravel C_101C_0A3A / PartyTeleport C_101C_0828). Switches the
// active level first (so the dungeon objblk loads + the active-z filter follows),
// then snaps the avatar + every PartyMember onto the destination cell and re-forms
// the formation with MoveFollowers; recenters the camera. HARD CUT — no
// PartyEnter/PartyExit choreography (the active-z filter hides the party on the old
// level; MoveFollowers spreads them on the new one). Stack-then-spread reuses the
// party pass-through (followers walk through each other). ctx threads the
// avatar/camera/follow context the command dispatch owns (avatarRef/recenter/
// moveFollowers). No-op if the avatar handle is stale.
export function teleportParty(world, nx, ny, nz, { avatarRef, recenter, moveFollowers } = {}) {
  const ai = avatarRef?.handle !== undefined ? world.resolve(avatarRef.handle) : -1;
  if (ai === -1) return;
  const pos = world.store(Position);

  setActiveLevel(world, nz);                               // switch level + fire the dungeon-object load (I-19c)
  const spatial = world.getResource(SpatialIndex);

  // Move the avatar.
  spatial.remove(pos.x[ai], pos.y[ai], avatarRef.handle);
  pos.x[ai] = nx; pos.y[ai] = ny; pos.z[ai] = nz;
  spatial.insertAtHead(nx, ny, avatarRef.handle);

  // Move the rest of the party onto the avatar's cell on the new level (hard cut).
  for (const id of world.query(PartyMember)) {
    const h = world.handleOf(id);
    if (h === avatarRef.handle) continue;
    spatial.remove(pos.x[id], pos.y[id], h);
    pos.x[id] = nx; pos.y[id] = ny; pos.z[id] = nz;
    spatial.insertAtHead(nx, ny, h);
  }
  if (moveFollowers) moveFollowers(avatarRef.handle, 1);   // tighten into formation around the avatar
  if (recenter) recenter(nx, ny);                          // camera follows to the destination
  spatial.dirty = true;                                    // force a render rebuild

  // I-egg (c): a teleport / PartyEnter force-hatches the WHOLE destination area (source's
  // seg_101C.c:315 ForceHatching=1; the ladder + both moongate networks all land here), so
  // arriving by gate/ladder populates the new area's eggs regardless of proximity.
  hatchAroundAvatar(world, nx, ny, nz, { forceHatch: true });
  // I-egg (e): and reap whatever we left at the SOURCE — every spawn from the old area is now
  // beyond the cull ring from the destination, so it (and its re-armable/one-shot egg) is culled.
  cullAroundAvatar(world, nx, ny, nz);
}
