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

// Set the active level. Entering a dungeon (z != 0) kicks off that level's object load
// (I-19c — load-once + resident; the surface streamer handles level 0). The load is ASYNC,
// so we RETURN its Promise (a dungeon) or null (surface / no load), letting a caller defer
// work until the objects actually land — e.g. teleportParty's force-hatch, which must run
// AFTER the eggs exist or it no-ops on an empty level. (No caller uses the old `prev` return.)
export function setActiveLevel(world, z) {
  const map = world.getResource(MapLevel);
  map.level = z;
  return z !== 0 ? loadDungeonLevel(world, z) : null;
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

  const loaded = setActiveLevel(world, nz);                // switch level + fire the dungeon-object load (I-19c); Promise for a dungeon, null for surface
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

  // I-egg (c/e): force-hatch the WHOLE destination area (source's seg_101C.c:315 ForceHatching=1;
  // the ladder + both moongate networks all land here) + cull the source's spawns. The dungeon
  // object load is ASYNC (setActiveLevel → loadDungeonLevel, un-awaited), so for a dungeon we DEFER
  // this until the objects land — otherwise the force-hatch runs before the eggs exist and the
  // whole freshly-entered level descends UN-hatched (the bug: dungeon eggs never spawn on a fresh
  // descent — they sit at status 0, then the off-screen gate keeps suppressing them while you
  // explore nearby). Surface / already-loaded (loaded === null / resolved) runs next-tick or sync.
  const populate = () => {
    hatchAroundAvatar(world, nx, ny, nz, { forceHatch: true });
    cullAroundAvatar(world, nx, ny, nz);
  };
  if (loaded) loaded.then(populate); else populate();
}
