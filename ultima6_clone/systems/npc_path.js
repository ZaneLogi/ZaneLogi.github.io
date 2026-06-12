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

import { Position, Renderable, ObjType, AIMode, Destination, Actor } from '../components/components.js';
import { SpatialIndex } from '../resources/spatial_index.js';
import { TileRegistry } from '../resources/tile_registry.js';
import { Paths } from '../resources/paths.js';
import { Viewport } from '../resources/viewport.js';
import { canStandAt } from './passability.js';
import { walkStep, isHumanoid, faceDir } from './humanoid_anim.js';
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
  // I-14e door-phasing fix: only HUMANOID NPCs walk through a closed-unlocked door (source
  // gates this on the MONSTER_4000 class via GetMonsterClass, C_1E0F_000F:199-207). The
  // clone has no monster-class table (D_3522_0242 is hardcoded C, not game data), so we use
  // the same sprite-family isHumanoid proxy the animation arm already uses — non-humanoids
  // (gazer, animals) are now correctly blocked by closed doors instead of phasing them. (Was
  // `asHumanoidNpc: true` for every NPC.) Port D_3522_0242 here if real classes ever matter.
  if (!canStandAt(world, nx, ny, { actorId: handle, asHumanoidNpc: isHumanoid(ot.objNumber[i]) })) return null;

  spatial.remove(ox, oy, handle);
  pos.x[i] = nx; pos.y[i] = ny;
  spatial.insertAtHead(nx, ny, handle);          // runtime move -> chain head (MoveObj)

  // Source's TryStraightMove faces via C_1E0F_0664 (seg_1E0F.c:1439), dispatching by
  // object type. setDirection is now the full port (I-16c); types without a walking state
  // return null, so we fall back to the incoming flag for those.
  const newWalking = setDirection(world, handle, dir8, walking || false);
  return newWalking !== null ? newWalking : (walking || false);
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

  // Blocked. CLONE-ONLY step-aside (not in source — source has no NPC detour/swap and just
  // waits the blocker out, §5.1; the clone's auto-advance heartbeat makes a frozen stand-off
  // visible, so on the FIRST block we actively unstick an ACTOR blocker). If the next cell is
  // held by another actor, ask it to step aside, then re-plan BOTH (its old cell is now free).
  // Only on the first block (AI_ONPATH); a static block, a boxed-in blocker, or any later
  // block falls through to source's faithful 84/85/86 grace-wait.
  const mode = am.mode[i];
  if (mode === AI.AI_ONPATH) {
    const pos = world.store(Position);
    const dir8 = (path.dirs[path.counter] & 3) << 1;
    const nx = (pos.x[i] + DIR_DX[dir8]) & 0x3ff;
    const ny = (pos.y[i] + DIR_DY[dir8]) & 0x3ff;
    const blocker = actorHandleAt(world, nx, ny, handle);
    const asideDir = blocker !== null ? requestStepAside(world, blocker, dir8) : -1;
    if (asideDir !== -1) {
      // Blocker vacated → re-plan THIS NPC from here. The blocker's follow-up depends on what it
      // was doing:
      //   - MID-JOURNEY (pathfinding tier 0x81..0x86) → AI_FINDPATH: re-find toward its OWN goal,
      //     away from the contested cell.
      //   - SETTLE-IN-PLACE worktype (STAND/SIT/SLEEP/EAT/PLAY/RINGBELL) → STAND UP (I-17d): set
      //     mode AI_STAND facing the shove + a plain stand pose (undoing any SLEEP/PLAY sprite
      //     swap), leaving its Destination (slot + original worktype) intact. It walks back and
      //     re-poses once the slot clears (the return-to-post branch in npc_tick_system). NOT
      //     re-pathed here — the immediate walk-back caused a push↔return loop; the clear-slot
      //     gate breaks it. (Standing up also fixes the visual: no frozen mid-stride / no sit
      //     pose stranded on empty floor.)
      //   - anything else (WANDER/LOITER/FARM/GUARD/party/SCHEDULE) → left to its own handler.
      const bi = world.resolve(blocker);
      if (bi !== -1) {
        if (am.mode[bi] >= AI.AI_FINDPATH && am.mode[bi] <= AI.AI_86) {
          am.mode[bi] = AI.AI_FINDPATH;
        } else if (AI.isSettleInPlace(am.mode[bi])) {
          const ot = world.store(ObjType);
          ot.objNumber[bi] = ot.origObjNumber[bi];          // undo SLEEP/PLAY sprite swap (no-op otherwise)
          am.mode[bi] = AI.AI_STAND_N + (asideDir >> 1);    // stand, facing the shove direction
          setDirection(world, blocker, asideDir, null);     // arrival arm → plain stand frame + tileId
        }
      }
      am.mode[i] = AI.AI_FINDPATH;
      paths.delete(handle);
      return 'aside';
    }
  }
  // Source-faithful escalation: wait a tick, eventually re-find rather than hammering the
  // same blocked cell. (Source also zeroes MovePts here to consume the turn — the I-14
  // accumulator consumes it at the tick.)
  if (mode === AI.AI_ONPATH) am.mode[i] = AI.AI_84;
  else if (mode === AI.AI_84) am.mode[i] = AI.AI_85;
  else if (mode === AI.AI_85) { am.mode[i] = AI.AI_86; paths.delete(handle); }
  return 'blocked';
}

// Is there another actor (≠ self) standing at (x,y)? Returns its handle, or null. (The
// SpatialIndex cell chain — same actor-occupancy test as world_loader.actorAtCell, but
// returns the handle so the caller can act on the blocker.) Exported for the I-17d
// return-to-post slot-clear check in npc_tick_system.
export function actorHandleAt(world, x, y, selfHandle) {
  const ents = world.getResource(SpatialIndex).at(x, y);
  if (!ents) return null;
  for (const h of ents) {
    if (h === selfHandle) continue;
    if (world.has(h, Actor) && world.resolve(h) !== -1) return h;
  }
  return null;
}

// CLONE-ONLY courtesy move: the blocker steps ONE cell PERPENDICULAR to the mover's travel
// axis — out of the lane it needs. `moverDir8` is the (cardinal) direction the blocked NPC
// was trying to go: an E/W mover pushes the blocker N or S; an N/S mover pushes it E or W (so
// it clears the exact row/column the mover walks). Perpendicular-ONLY: if both sideways cells
// are blocked there's genuinely no room to make way (a 1-wide corridor), so return false and
// let the faithful 84/85/86 wait handle it — never shove the blocker forward/backward (that
// leapfrogs or doesn't clear the lane). Returns the cardinal dir it moved (0/2/4/6), or -1 if it
// couldn't make way. A reactive "free" step (not accumulator-gated); source has no such
// mechanism. (Tries the first open side; a same-axis bias is harmless — could randomise later.)
function requestStepAside(world, blockerHandle, moverDir8) {
  const perp = (moverDir8 === 2 || moverDir8 === 6) ? [0, 4] : [2, 6];   // E/W → N,S ; N/S → E,W
  for (const d of perp) if (npcStep(world, blockerHandle, d, false) !== null) return d;   // the dir it moved
  return -1;                                                                              // couldn't make way
}

// Chebyshev distance on the wrapped 1024-cell overworld axis — source's
// COMBAT_getCathesus (the larger of |dx|,|dy|, the natural 8-dir step count). Wrap-aware
// so a goal across the x=0/y=0 map seam doesn't read as far.
export function chebyshev(ax, ay, bx, by) {
  const dx = Math.min((ax - bx) & 0x3ff, (bx - ax) & 0x3ff);
  const dy = Math.min((ay - by) & 0x3ff, (by - ay) & 0x3ff);
  return Math.max(dx, dy);
}

// Off-screen teleport "near" radius (I-9h). Source's C_1E0F_291C suppresses the teleport
// when the NPC OR its slot is inside the 11x11 gameplay viewport (MapX/MapY +/-5). Our
// canvas shows far more than 11x11, so a +/-5 box would pop NPCs the player can plainly see;
// we widen it to a Chebyshev radius exceeding the visible half-extent plus a scroll-in
// margin. Since render-to-fit (resources/viewport.js) makes the visible extent VARY with the
// window, the live radius comes from the Viewport resource (`nearRadius`, viewport-derived).
// This constant is the fallback when no Viewport is registered (the unit tests) and equals
// the value the old fixed 64x40 canvas used. Over-suppressing (a far-but-not-that-far NPC
// walks instead of teleporting) is harmless; under-suppressing would let a visible NPC pop.
export const TELEPORT_NEAR_RADIUS = 40;

// __off-area teleport (C_1E0F_291C, seg_1E0F.c:1181-1211) — place an NPC straight onto its
// scheduled slot and settle the worktype, INSTEAD of pathfinding. This is the "teleport-far"
// half of I-9h's walk-near/teleport-far gate: an NPC the player can't see has no reason to
// burn a path build walking to its post — it's just "where its schedule says when you
// arrive."
//
// Visibility guard (seg_1E0F.c:1188-1202): suppressed when the NPC OR the slot is within
// nearRadius of the VIEW CENTER (`viewX,viewY`, passed by the caller = the camera's center
// tile), so on-screen NPCs always walk (visible, animated). The caller centers on the camera
// rather than the avatar because the clone can drag-pan the view off the avatar (a modern-UX
// feature source lacks); the two coincide until the player pans. `allowVisible` is source's
// AllowNPCTeleport flag (set during rest / time-jumps, and by our unreachable-fallback) — a
// forced teleport that ignores the guard.
//
// Returns true if the NPC was placed on (or already sat on) its slot and settled, false if
// the guard suppressed it (caller should pathfind) or the slot cell is blocked (caller gives
// up till the next hour). Mirrors source minus the SubMov move-point spend (deferred) and the
// D_17A5 per-turn cap (the caller owns that counter).
export function tryTeleportToSlot(world, handle, viewX, viewY, allowVisible = false) {
  const i = world.resolve(handle);
  if (i === -1) return false;
  const pos = world.store(Position);
  const dest = world.store(Destination);
  const tx = dest.x[i], ty = dest.y[i], tz = dest.z[i];

  // Guard: don't teleport anything the player can see (NPC or its destination within
  // nearRadius of the view center). Source checks the NPC first, then the slot — both must
  // be far. The radius tracks the live viewport (render-to-fit), falling back to the constant
  // for tests.
  const nearRadius = world.getResource(Viewport)?.nearRadius ?? TELEPORT_NEAR_RADIUS;
  if (!allowVisible &&
      (chebyshev(pos.x[i], pos.y[i], viewX, viewY) <= nearRadius ||
       chebyshev(tx, ty, viewX, viewY) <= nearRadius)) return false;

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

// C_1E0F_2125 port — scan the 4 orthogonal neighbors of (x,y) for a plate (OBJ_077).
// Returns si+1 (1=N, 3=E, 5=S, 7=W) or 0 if no plate found. The +1 encoding lets callers
// distinguish "found north" from "not found" while carrying the direction in one value.
function findPlateDir(world, x, y) {
  const spatial = world.getResource(SpatialIndex);
  const objs = world.store(ObjType);
  for (let si = 0; si < 8; si += 2) {
    const nx = (x + DIR_DX[si]) & 0x3ff;
    const ny = (y + DIR_DY[si]) & 0x3ff;
    const cell = spatial.at(nx, ny);
    if (!cell) continue;
    for (const h of cell) {
      const idx = world.resolve(h);
      if (idx !== -1 && objs.objNumber[idx] === 0x077) return si + 1;
    }
  }
  return 0;
}

// D_0658 (seg_1184.c:13) — the NPC's tile offset within a multi-tile furniture footprint,
// set by the most recent findPropAtCell scan (0 = the object's own anchor cell). The chair
// and bed predicates test `frame - D_0658`; the SLEEP handler reads it for the bed sub-frame.
// Mirrors source's global: set by FindLoc/NextLoc, read by the immediately-following caller.
let propD0658 = 0;

// C_1E0F_2184 + FindLoc/NextLoc (seg_1184.c:211-291) port — find a prop of the given type
// whose footprint covers the NPC's cell (x,y). A single-tile prop sits on the own cell
// (D_0658=0); a multi-tile prop's ANCHOR is down/right of the cells it visually covers, so we
// also scan loc_right (x+1,y, double-H → D_0658=1), loc_down (x,y+1, double-V → D_0658 =
// double-H?2:1) and loc_dn_rt (x+1,y+1, 2×2 → D_0658=3). This is what lets an NPC sit on a
// 2-wide throne (OBJ_147): the throne anchor is one cell east, frame-D_0658==2 selects the
// seat half. propType: 0=chair (OBJ_0FC, or OBJ_147 throne where frame-D_0658==2), 1=bed
// (OBJ_0A3 frame-D_0658 0/6), 3=pullchain (OBJ_1A3). Returns the handle (sets propD0658) or null.
function findPropAtCell(world, x, y, propType) {
  const spatial = world.getResource(SpatialIndex);
  const objs = world.store(ObjType);
  const reg = world.getResource(TileRegistry);
  const tf = reg.flags;
  const base = reg.baseTile.objToTile;

  // {dx,dy}: cell to scan relative to (x,y); gate(tile): the multi-tile flag an anchor there
  // must carry for its footprint to reach back over (x,y). Own cell has no gate. (seg_1184.c:234-266)
  const CELLS = [
    { dx: 0, dy: 0, gate: null },                                                      // own cell
    { dx: 1, dy: 0, gate: tile => tf.isDoubleWidth(tile) },                            // loc_right
    { dx: 0, dy: 1, gate: tile => tf.isDoubleHeight(tile) },                           // loc_down
    { dx: 1, dy: 1, gate: tile => tf.isDoubleWidth(tile) && tf.isDoubleHeight(tile) }, // loc_dn_rt
  ];

  for (const c of CELLS) {
    const ents = spatial.at((x + c.dx) & 0x3ff, (y + c.dy) & 0x3ff);
    if (!ents) continue;
    for (const h of ents) {
      const idx = world.resolve(h);
      if (idx === -1) continue;
      const type = objs.objNumber[idx];
      const frame = objs.frame[idx];
      const tile = base[type] + frame;
      if (c.gate && !c.gate(tile)) continue;
      // D_0658: 0 on the own cell; 3 for a 2×2 anchor; for loc_down, 2 when also double-H else 1; else 1.
      const d = (c.dx === 0 && c.dy === 0) ? 0
              : (c.dx === 1 && c.dy === 1) ? 3
              : (c.dy === 1) ? (tf.isDoubleWidth(tile) ? 2 : 1)
              : 1;
      let match = false;
      if (propType === 0) match = type === 0x0FC || (type === 0x147 && frame - d === 2);
      else if (propType === 1) match = type === 0x0A3 && (frame - d === 0 || frame - d === 6);
      else if (propType === 3) match = type === 0x1A3;
      if (match) { propD0658 = d; return h; }
    }
  }
  propD0658 = 0;
  return null;
}

// 2-frame family types (seg_1E0F.c:341-377): frame = walk-bit + (facing<<1).
function isTwoFrameFamily(t) {
  return t === 0x15A || t === 0x15C || t === 0x15D || t === 0x15E || t === 0x15F ||
         t === 0x156 || t === 0x166 || t === 0x169 || t === 0x188 ||
         (t >= 0x16F && t <= 0x174) || t >= 0x1AA;
}

// C_1E0F_0664 full port — set frame/facing for an NPC at its current cell.
// dir8: desired facing (0=N,2=E,4=S,6=W for cardinals). walking=null = arrival
// (snap to stand/sit); walking=bool = walk-step (advance cycle). Returns the new
// walking flag (null if the type has no walking state — caller preserves its own).
function setDirection(world, handle, dir8, walking = null) {
  const i = world.resolve(handle);
  if (i === -1) return null;
  const ot = world.store(ObjType);
  const rd = world.store(Renderable);
  const reg = world.getResource(TileRegistry);
  const pos = world.store(Position);
  const type = ot.objNumber[i];
  let frame = ot.frame[i];
  let newWalking = null;

  if (isHumanoid(type)) {
    // Chair-override: sit pose (cycle 3) facing the chair's direction.
    // OBJ_0FC: use chair.frame (its own facing); OBJ_147 (bench): always face S (dir=2).
    const chairH = findPropAtCell(world, pos.x[i], pos.y[i], 0 /*CHAIR*/);
    if (chairH !== null) {
      const ci = world.resolve(chairH);
      const dirFram = ot.objNumber[ci] === 0x147 ? 2 : ot.frame[ci];
      frame = (dirFram << 2) | 3;   // seg_1E0F.c:297-302
    } else if (walking === null) {
      const facing = faceDir(frame >> 2, dir8);
      frame = (facing << 2) | 1;
    } else {
      const stepped = walkStep(frame, dir8, walking);
      frame = stepped.frame;
      newWalking = stepped.walking;
    }
  } else if (type === 0x162 || type === 0x167 || type === 0x19E || type === 0x184) {
    // Gazer: frame IS the 4-dir facing directly — seg_1E0F.c:411-413
    frame = faceDir(frame, dir8);
  } else if (type === 0x16A) {
    // 12 frames/dir (horse-like): walk cycle uses frames 3,7,11 within each 12-block.
    // Arrival: snap to 7 (mid-stride). Step: 7→11(SetWalking)→7→3(ClrWalking)→7→…
    const dirFram = faceDir(Math.floor(frame / 12), dir8);
    if (walking === null) {
      frame = 7 + dirFram * 12;
    } else {
      const walkCyc = frame % 12;
      newWalking = walking;
      let wc;
      switch (walkCyc) {
        case 3:  newWalking = false; wc = 7;  break;
        case 7:  wc = walking ? 3 : 11;       break;
        case 11: newWalking = true;  wc = 7;  break;
        default: wc = 7;
      }
      frame = wc + dirFram * 12;
    }
  } else if (type === 0x164) {
    frame = Math.floor(Math.random() * 3);   // seg_1E0F.c:327-328
  } else if (type === 0x16B) {
    // 3 frames/dir: same walk-cycle pattern as humanoid but frame = cycle + dir*3.
    const dirFram = faceDir(Math.floor(frame / 3), dir8);
    if (walking === null) {
      frame = 1 + dirFram * 3;
    } else {
      const walkCyc = frame % 3;
      newWalking = walking;
      let wc;
      switch (walkCyc) {
        case 0: newWalking = false; wc = 1; break;
        case 1: wc = walking ? 0 : 2;      break;
        case 2: newWalking = true;  wc = 1; break;
        default: wc = 1;
      }
      frame = wc + dirFram * 3;
    }
  } else if (isTwoFrameFamily(type)) {
    // 2 frames/dir: frame = walk-bit + (facing<<1). Arrival: bit=1; step: toggle.
    const dirFram = faceDir(frame >> 1, dir8);
    const walkBit = (walking === null) ? 1 : ((frame & 1) ^ 1);
    frame = walkBit + (dirFram << 1);
  }
  // else: unrecognised type (OBJ_19C serpent, OBJ_19B, OBJ_1A8 cyclops, …) — leave frame.

  ot.frame[i] = frame;
  rd.tileId[i] = reg.baseTile.objToTile[type] + frame;
  return newWalking;
}

// __AtDestination (C_1E0F_2276, seg_1E0F.c:1002-1085) — runs when an NPC reaches its
// scheduled slot (doOnPath end-of-path), is already there when the schedule fires, or
// was snapped onto the slot (tryTeleportToSlot). Sets NPCMode to the worktype and applies
// the per-worktype sprite + facing for the furniture pose worktypes.
//
// I-16b scope: setDirection (C_1E0F_0664) humanoid arm with chair-override (sit-pose cycle 3
// facing the chair's direction) wired into SIT/EAT/STAND/GUARD. Non-humanoid arms (gazer,
// 2-frame family, OBJ_16A/16B) and npcStep non-humanoid facing are I-16c. GUARD pacing later.
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
  const x = pos.x[i], y = pos.y[i];
  // isAtDest: exactly on the scheduled slot. Pose worktypes (SLEEP/SIT/EAT/PLAY/RINGBELL)
  // force it true — the NPC settles wherever it stopped near the furniture.
  let isAtDest = x === dest.x[i] && y === dest.y[i] && pos.z[i] === dest.z[i];

  am.mode[i] = action;

  if (action === AI.AI_SLEEP) {
    isAtDest = true;
    if (isHumanoid(ot.origObjNumber[i])) {
      // Source: SetAsleep + C_1E0F_2184(1=BED) → OBJ_092 sleeping sprite aligned to the bed.
      // Bed frame 0 = head-N (NPC frame 0); bed frame 6 = rotated 180° (NPC frame 1).
      const bedH = findPropAtCell(world, x, y, 1 /*BED*/);
      ot.objNumber[i] = 0x092;
      ot.frame[i] = (bedH !== null && (ot.frame[world.resolve(bedH)] - propD0658) !== 0) ? 1 : 0;
      rd.tileId[i] = reg.baseTile.objToTile[0x092] + ot.frame[i];
    }
  } else {
    // Restore original sprite (source: ClrAsleep + ObjShapeType[objNum] = OrigShapeType[objNum]).
    // Guards with !== so a non-sleeping NPC (already correct) skips the tileId update.
    if (ot.objNumber[i] !== ot.origObjNumber[i]) {
      ot.objNumber[i] = ot.origObjNumber[i];
      rd.tileId[i] = reg.baseTile.objToTile[ot.objNumber[i]] + ot.frame[i];
    }

    if (action === AI.AI_SIT) {
      isAtDest = true;
      // Source: C_1E0F_2184(0=CHAIR) → if found → C_1E0F_0664(objNum, 0).
      // setDirection finds the chair and switches to the sit pose (cycle 3) facing the
      // chair's own direction; no chair → stand unchanged (setDirection returns early).
      if (findPropAtCell(world, x, y, 0 /*CHAIR*/) !== null)
        setDirection(world, handle, 0);
    } else if (action === AI.AI_PLAY) {
      isAtDest = true;
      if (isHumanoid(ot.objNumber[i])) {
        // Source: C_1E0F_2184(0=CHAIR) → SetFrame(chair, 2) + C_1E0F_0664(S) + ObjShapeType=OBJ_188 frame 4.
        // C_1E0F_0664 here is overwritten immediately by SetFrame(objNum,4), so skip setDirection.
        const chairH = findPropAtCell(world, x, y, 0 /*CHAIR*/);
        if (chairH !== null) {
          const ci = world.resolve(chairH);
          ot.frame[ci] = 2;
          rd.tileId[ci] = reg.baseTile.objToTile[ot.objNumber[ci]] + 2;
          ot.objNumber[i] = 0x188;
          ot.frame[i] = 4;
          rd.tileId[i] = reg.baseTile.objToTile[0x188] + 4;
        }
      }
    } else if (action === AI.AI_EAT) {
      isAtDest = true;
      if (isHumanoid(ot.objNumber[i])) {
        // Source: C_1E0F_2125 (plate dir) → SetFrame(chair, plateDir>>1) + C_1E0F_0664(plateDir-1).
        // Chair frame is updated BEFORE setDirection so the chair-override picks up the plate-facing
        // direction. If no plate: C_1E0F_0664(4) = face S (or sit-S if chair found at cell).
        const plateDir = findPlateDir(world, x, y);
        if (plateDir > 0) {
          const chairH = findPropAtCell(world, x, y, 0 /*CHAIR*/);
          if (chairH !== null) {
            const ci = world.resolve(chairH);
            const cf = plateDir >> 1;   // 0=N,1=E,2=S,3=W
            ot.frame[ci] = cf;
            rd.tileId[ci] = reg.baseTile.objToTile[ot.objNumber[ci]] + cf;
          }
          setDirection(world, handle, plateDir - 1);
        } else {
          setDirection(world, handle, 4);
        }
      }
    } else if (action === AI.AI_RINGBELL) {
      isAtDest = true;   // bell animation (C_1E0F_2BEA series) deferred to I-17
    } else if (action >= AI.AI_STAND_N && action <= AI.AI_GUARD_W) {
      // Source: SetDirection + C_1E0F_0664. Non-humanoid arms deferred to I-16c.
      const dir8 = ((action - AI.AI_STAND_N) & 3) << 1;
      setDirection(world, handle, dir8);
    }
  }

  if (!isAtDest) am.mode[i] = AI.AI_FINDPATH;
}
