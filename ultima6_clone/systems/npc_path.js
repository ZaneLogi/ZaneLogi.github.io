// NPC path-following (I-9c) — npcStep (the single-cell move kernel for an NPC) +
// doOnPath (walk one step of a built path). Ports __DoOnPath (C_1E0F_387D,
// seg_1E0F.c:1576-1608) over the per-NPC path stored in the Paths resource.
//
// The path is a plain 4-dir array (findPath, I-9b), one entry per cell — source's
// RLE repeat-count is already expanded, so there's no PathTries counter; the path
// cursor (`counter`) just indexes the array. The move-point spend (SubTerrainMov)
// and the MovePts=0 "wait a turn" are deferred (no move-point economy yet, I-9d/f);
// the escalation states AI_ONPATH->84->85->86 are kept so a blocked NPC still backs
// off and re-finds rather than spinning on a stuck step.

import { Position, Renderable, ObjType, AIMode, Destination } from '../components/components.js';
import { SpatialIndex } from '../resources/spatial_index.js';
import { TileRegistry } from '../resources/tile_registry.js';
import { Paths } from '../resources/paths.js';
import { canStandAt } from './passability.js';
import { walkStep, isHumanoid } from './humanoid_anim.js';
import { DIR_DX, DIR_DY } from './avatar_move_system.js';
import * as AI from './ai_modes.js';

// One NPC step in 8-dir `dir8`. Returns the new walking flag (true/false) if it
// moved, or null if the destination was blocked. Shared single-step kernel:
// canStandAt (with the humanoid door pass-through) + insertAtHead (MoveObj
// chain-head splice) + humanoid facing/walk. Mirrors TryStraightMove
// (seg_1E0F.c:1421) minus the move-point spend.
export function npcStep(world, handle, dir8, walking) {
  const i = world.resolve(handle);
  if (i === -1) return null;
  const pos = world.store(Position);
  const ot = world.store(ObjType);
  const rd = world.store(Renderable);
  const reg = world.getResource(TileRegistry);
  const spatial = world.getResource(SpatialIndex);

  const ox = pos.x[i], oy = pos.y[i];
  const nx = (ox + DIR_DX[dir8]) & 0x3ff;       // overworld wrap (source masks & 0x3ff)
  const ny = (oy + DIR_DY[dir8]) & 0x3ff;
  if (!canStandAt(world, nx, ny, { actorId: handle, asHumanoidNpc: true })) return null;

  spatial.remove(ox, oy, handle);
  pos.x[i] = nx; pos.y[i] = ny;
  spatial.insertAtHead(nx, ny, handle);          // runtime move -> chain head (MoveObj)

  // Source's TryStraightMove faces via C_1E0F_0664 (seg_1E0F.c:1439), which dispatches
  // by object type. We've only ported its humanoid arm, so animate humanoids; other NPC
  // families (gazer OBJ_162, animals, …) move without animating (a valid static sprite)
  // rather than getting mis-encoded humanoid frames — their per-type facing is deferred.
  if (!isHumanoid(ot.objNumber[i])) return walking;
  const stepped = walkStep(ot.frame[i], dir8, walking);   // face the move dir + cycle legs
  ot.frame[i] = stepped.frame;
  rd.tileId[i] = reg.baseTile.objToTile[ot.objNumber[i]] + stepped.frame;
  return stepped.walking;
}

// Walk one step of the NPC's current path. Returns a status string for the
// caller/tests: 'step' (moved), 'blocked' (couldn't, escalated), 'end' (path
// finished -> arrived or re-plan), 'idle' (no path / gone).
//
// __DoOnPath structure (seg_1E0F.c:1576-1608):
//   - cursor past the end  -> path done: at the goal => arrive; else re-plan (FINDPATH)
//   - step succeeds        -> advance cursor, AI_ONPATH
//   - step blocked         -> escalate ONPATH->84->85->86; at 86 abandon the path
export function doOnPath(world, handle) {
  const i = world.resolve(handle);
  if (i === -1) return 'idle';
  const paths = world.getResource(Paths);
  const am = world.store(AIMode);
  const path = paths.get(handle);
  if (!path) return 'idle';

  if (path.counter >= path.dirs.length) {
    paths.delete(handle);
    const pos = world.store(Position);
    // __DoOnPath end-of-path (seg_1E0F.c:1582-1587): within 1 tile of the goal
    // (COMBAT_getCathesus < 2) -> __AtDestination sets the worktype; else re-path.
    // For an edge-seek path goalX/goalY is the far slot (not the window edge it walked
    // to), so a path that ran out short of the goal re-plans (distance >> 1) and only
    // "arrives" once the slot itself is within reach.
    if (chebyshev(pos.x[i], pos.y[i], path.goalX, path.goalY) < 2) atDestination(world, handle);
    else am.mode[i] = AI.AI_FINDPATH;
    return 'end';
  }

  const dir8 = (path.dirs[path.counter] & 3) << 1;        // 4-dir -> 8-dir cardinal
  const walking = npcStep(world, handle, dir8, path.walking || false);
  if (walking !== null) {
    path.walking = walking;
    path.counter++;
    am.mode[i] = AI.AI_ONPATH;
    return 'step';
  }

  // Blocked: escalate so the NPC waits a tick and eventually re-finds rather than
  // hammering the same blocked cell. (Source also zeroes MovePts here to consume the
  // turn — deferred with the move-point economy.)
  const mode = am.mode[i];
  if (mode === AI.AI_ONPATH) am.mode[i] = AI.AI_84;
  else if (mode === AI.AI_84) am.mode[i] = AI.AI_85;
  else if (mode === AI.AI_85) { am.mode[i] = AI.AI_86; paths.delete(handle); }
  return 'blocked';
}

// Chebyshev distance on the wrapped 1024-cell overworld axis — source's
// COMBAT_getCathesus (the larger of |dx|,|dy|, the natural 8-dir step count). Wrap-aware
// so a goal across the x=0/y=0 map seam doesn't read as far.
function chebyshev(ax, ay, bx, by) {
  const dx = Math.min((ax - bx) & 0x3ff, (bx - ax) & 0x3ff);
  const dy = Math.min((ay - by) & 0x3ff, (by - ay) & 0x3ff);
  return Math.max(dx, dy);
}

// Off-screen teleport "near" radius (I-9h). Source's C_1E0F_291C suppresses the teleport
// when the NPC OR its slot is inside the 11x11 gameplay viewport (MapX/MapY +/-5). Our
// canvas shows far more than 11x11 (1024x640 = 64x40 cells, avatar-centered -> ~32x20
// visible half-extents), so a +/-5 box would pop NPCs the player can plainly see. We widen
// the box to a Chebyshev radius that comfortably exceeds the visible half-width (32) plus a
// scroll-in margin. Over-suppressing (a few far-but-not-that-far NPCs walk instead of
// teleporting) is harmless; under-suppressing would let a visible NPC pop. Same wider-canvas
// adaptation as the per-NPC pathfinding window. Revisit if the canvas size changes.
const TELEPORT_NEAR_RADIUS = 40;

// __off-area teleport (C_1E0F_291C, seg_1E0F.c:1181-1211) — place an NPC straight onto its
// scheduled slot and settle the worktype, INSTEAD of pathfinding. This is the "teleport-far"
// half of I-9h's walk-near/teleport-far gate: an NPC the player can't see has no reason to
// burn a path build walking to its post — it's just "where its schedule says when you
// arrive."
//
// Visibility guard (seg_1E0F.c:1188-1202): suppressed when the NPC OR the slot is within
// TELEPORT_NEAR_RADIUS of the avatar, so on-screen NPCs always walk (visible, animated).
// `allowVisible` is source's AllowNPCTeleport flag (set during rest / time-jumps, and by our
// unreachable-fallback) — a forced teleport that ignores the guard.
//
// Returns true if the NPC was placed on (or already sat on) its slot and settled, false if
// the guard suppressed it (caller should pathfind) or the slot cell is blocked (caller gives
// up till the next hour). Mirrors source minus the SubMov move-point spend (deferred) and the
// D_17A5 per-turn cap (the caller owns that counter).
export function tryTeleportToSlot(world, handle, avatarX, avatarY, allowVisible = false) {
  const i = world.resolve(handle);
  if (i === -1) return false;
  const pos = world.store(Position);
  const dest = world.store(Destination);
  const tx = dest.x[i], ty = dest.y[i], tz = dest.z[i];

  // Guard: don't teleport anything the player can see (NPC or its destination near the
  // avatar). Source checks the NPC first, then the slot — both must be far.
  if (!allowVisible &&
      (chebyshev(pos.x[i], pos.y[i], avatarX, avatarY) <= TELEPORT_NEAR_RADIUS ||
       chebyshev(tx, ty, avatarX, avatarY) <= TELEPORT_NEAR_RADIUS)) return false;

  // Already on the slot: no move (avoid needless chain churn), but still settle the worktype.
  if (pos.x[i] === tx && pos.y[i] === ty && pos.z[i] === tz) { atDestination(world, handle); return true; }

  // Clone-defensive: source assumes the authored slot is standable and MoveObjs unconditionally;
  // we validate so a teleport never lands an NPC on a wall/occupied cell. Blocked -> caller falls
  // back (pathfind, or AI_SCHEDULE wait).
  if (!canStandAt(world, tx, ty, { actorId: handle })) return false;

  const spatial = world.getResource(SpatialIndex);
  spatial.remove(pos.x[i], pos.y[i], handle);
  pos.x[i] = tx; pos.y[i] = ty; pos.z[i] = tz;
  spatial.insertAtHead(tx, ty, handle);     // runtime move -> chain head (MoveObj)
  atDestination(world, handle);             // __AtDestination — settle worktype + facing
  return true;
}

// __AtDestination (C_1E0F_2276, seg_1E0F.c:1002-1085) — runs when an NPC reaches the end
// of its path within 1 tile of the goal (doOnPath above), is already on its slot when the
// schedule fires (npc tick, empty path), or was snapped onto an otherwise-unreachable
// slot (npc tick, snapToSlot). Reads the worktype from the NPC's active schedule slot
// (Destination.action) and sets NPCMode to it; for STAND_*/GUARD_* it also faces the NPC
// the right way (a standing pose). If the NPC isn't actually on the slot, it reverts to
// AI_FINDPATH so it keeps walking the last step(s).
//
// I-9g scope: worktype mode + STAND/GUARD facing only. The pose/furniture worktypes
// (SLEEP / SIT / EAT / PLAY / RINGBELL — source finds the bed/chair/table/pull-chain via
// C_1E0F_2184 and swaps the sprite to the in-furniture pose) are DEFERRED: they set the
// mode and hold position (isAtDest forced true, matching source) but skip the sprite swap.
// The ongoing GUARD up-and-down pacing (the per-mode dispatcher C_1E0F_3E6A) is a separate
// later step — here GUARD just plants the NPC facing its post, like STAND.
export function atDestination(world, handle) {
  const i = world.resolve(handle);
  if (i === -1) return;
  const am = world.store(AIMode);
  const pos = world.store(Position);
  const dest = world.store(Destination);
  const ot = world.store(ObjType);
  const rd = world.store(Renderable);
  const reg = world.getResource(TileRegistry);

  const action = dest.action[i];
  // isAtDest: exactly on the scheduled slot. The stationary pose worktypes force it true
  // (the NPC settles wherever it stopped near the furniture); STAND/GUARD + the motion
  // worktypes keep the position check, so a not-quite-arrived NPC re-paths.
  let isAtDest = pos.x[i] === dest.x[i] && pos.y[i] === dest.y[i] && pos.z[i] === dest.z[i];

  am.mode[i] = action;

  if (action === AI.AI_SLEEP || action === AI.AI_SIT || action === AI.AI_PLAY ||
      action === AI.AI_EAT || action === AI.AI_RINGBELL) {
    isAtDest = true;                                 // pose worktypes hold position (sprite swap deferred)
  } else if (action >= AI.AI_STAND_N && action <= AI.AI_GUARD_W && isHumanoid(ot.objNumber[i])) {
    // Source: SetDirection + C_1E0F_0664 with dir8 ((action-AI_STAND_N)&3)<<1. C_1E0F_0664
    // dispatches by object type; we've ported only its humanoid arm, so only humanoids
    // face here (other families — gazer OBJ_162, animals — keep their sprite; per-type
    // facing deferred, same gate as npcStep). The clone encodes facing in the sprite frame
    // (frame = walkCycle + facing<<2), so face the worktype direction in the stand pose
    // (walk-cycle 1). No separate Direction field: a later GUARD-pacing step reads facing
    // back from frame>>2.
    const facing = (action - AI.AI_STAND_N) & 3;     // STAND/GUARD N/E/S/W -> 0/1/2/3
    ot.frame[i] = (facing << 2) | 1;
    rd.tileId[i] = reg.baseTile.objToTile[ot.objNumber[i]] + ot.frame[i];
  }

  if (!isAtDest) am.mode[i] = AI.AI_FINDPATH;         // short of the slot -> keep walking
}
