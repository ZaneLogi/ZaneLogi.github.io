// systems/use_ladder.js (I-19d)
//
// USE a ladder (OBJ_131) → change level. Port of seg_101C.c C_101C_089E
// (/*enter dungeon/use ladder*/). The player USEs an adjacent ladder; the whole
// party moves to the linked cell on the next level.
//
// Source sequence (seg_101C.c:325-366):
//   1. z_incr: DOWN (+1) by default; UP (-1) only when already in a dungeon AND
//      (at the deepest level 5, OR the ladder's frame is the "up" variant, frame 1).
//      So a surface ladder/hole always goes down; a dungeon up-ladder goes up.
//   2. Land on the ladder's own cell (MapX = GetX(obj), MapY = GetY(obj)).
//   3. MapZ += z_incr, then RESCALE x/y across the level-size change:
//        surface→dungeon (newZ==1, down): compress /4  ((v>>2)&0xf8)+(v&7)
//        dungeon→surface (newZ==0, up):   expand  *4  ((v<<2)&0x3e0)+(v&7)
//                                          + the ladder's quality bits pick the
//                                          surface sub-cell (8/16 px offsets).
//        dungeon↔dungeon: no rescale (both 256-wide) — land on the ladder cell.
//   4. Reload the level's regions/objects + recompose.
//
// Clone deviations (research_level_change.md §4/§6):
//   - HARD CUT: no PartyEnter/PartyExit choreography. The party teleports to the
//     destination — the active-z filter (I-19b) makes them vanish from the old
//     level, MoveFollowers re-forms them on the new one.
//   - The D_2CC3 "not in solo mode" gate (seg_27a1.c:3098) is skipped: the clone
//     has no solo/party-split mode.
//   - Combat (InCombat → COMBAT_breakOff) + lighting recompute are deferred.
//
// The avatar/camera/follow context isn't available at registration time, so this
// handler reads it from the USE dispatch ctx (command_dispatch threads avatarRef,
// recenter, moveFollowers into every USE handler call).

import { setActiveLevel } from './level_change.js';
import { Position, ObjType, Amount, PartyMember } from '../components/components.js';
import { SpatialIndex } from '../resources/spatial_index.js';

export function useLadder({ world, target, message, avatarRef, recenter, moveFollowers }) {
  const pos = world.store(Position);
  const objs = world.store(ObjType);
  const li = world.resolve(target.entity);
  if (li === -1) return;
  const ladderX = pos.x[li], ladderY = pos.y[li];
  const ladderFrame = objs.frame[li];
  const quality = world.store(Amount).quality[li];

  const ai = avatarRef?.handle !== undefined ? world.resolve(avatarRef.handle) : -1;
  if (ai === -1) return;
  const curZ = pos.z[ai];                                  // = MapZ

  // z_incr (seg_101C.c:331-334).
  const zIncr = (curZ && (curZ === 5 || ladderFrame === 1)) ? -1 : 1;
  const nz = curZ + zIncr;
  let nx = ladderX, ny = ladderY;                          // land on the ladder cell (:335-336)

  if (nz === 1 && zIncr === 1) {                           // surface → dungeon: /4 (:340-341)
    nx = ((ladderX >> 2) & 0xf8) + (ladderX & 7);
    ny = ((ladderY >> 2) & 0xf8) + (ladderY & 7);
  } else if (nz === 0 && zIncr === -1) {                   // dungeon → surface: *4 + quality (:343-352)
    nx = ((ladderX << 2) & 0x3e0) + (ladderX & 7);
    ny = ((ladderY << 2) & 0x3e0) + (ladderY & 7);
    if (quality & 1) nx += 8;
    if (quality & 2) nx += 0x10;
    if (quality & 4) ny += 8;
    if (quality & 8) ny += 0x10;
  }
  // dungeon ↔ dungeon: nx/ny stay on the ladder cell (no rescale).

  setActiveLevel(world, nz);                               // switch level + fire the dungeon-object load (I-19c)

  const spatial = world.getResource(SpatialIndex);

  // Move the avatar to the destination.
  spatial.remove(pos.x[ai], pos.y[ai], avatarRef.handle);
  pos.x[ai] = nx; pos.y[ai] = ny; pos.z[ai] = nz;
  spatial.insertAtHead(nx, ny, avatarRef.handle);

  // Move the rest of the party onto the avatar's cell on the new level (hard cut);
  // MoveFollowers then spreads them into formation. Stack-then-spread reuses the
  // party pass-through (canStandAt) — followers walk through each other.
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

  message(zIncr < 0 ? 'You climb up.' : 'You climb down.');
}
