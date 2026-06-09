// Drunk-walk movement (I-15) — the pathfinding-LESS "head roughly toward a target, nudge
// around the obstacle right in front of you" primitive. Ports source's TryMoveTo
// (C_1E0F_35A7) + __TryDiagMove (C_1E0F_3470). This is the move kernel for chase/flee and
// the follower "trail toward the party" behavior — NOT the bucket-Dijkstra path-follow
// (npc_path.js doOnPath). It only ever probes one or two neighbour cells per call
// (U6_NPC_排程與移動邏輯.md §4.3: "the only ACTIVE detour"); it does not plan a route.
//
// Built on npcStep (the single-cell move kernel = source's TryStraightMove, minus the
// move-point spend — under I-14 the accumulator gates+spends at the tick level, so these
// primitives just attempt the move and report success, exactly like npcStep). No live
// consumer yet: NPC AI behaviors (I-17) and combat will drive these; for now it's a tested
// primitive + a dev hook (I-15c).

import { Position, ObjType } from '../components/components.js';
import { canStandAt } from './passability.js';
import { isHumanoid } from './humanoid_anim.js';
import { npcStep } from './npc_path.js';
import { DIR_DX, DIR_DY } from './avatar_move_system.js';

// 8-dir codes: 0=N 1=NE 2=E 3=SE 4=S 5=SW 6=W 7=NW (DirIncrX/Y, seg_0903.c:20-21). The
// drunk-walk works in axis components: h_dir ∈ {2=E, 6=W}, v_dir ∈ {0=N, 4=S}.

// Combine an horizontal + vertical component into the diagonal between them
// (__TryDiagMove: `dir = (v_dir + h_dir) >> 1`, with the N+W wrap special-cased to NW).
function diagOf(hDir, vDir) {
  return (vDir === 0 && hDir === 6) ? 7 : (vDir + hDir) >> 1;
}

// __TryDiagMove (C_1E0F_3470) — try to step DIAGONALLY (between h_dir and v_dir) with
// corner-clearance: only move if the diagonal target is standable AND at least one of the
// two orthogonal cells you'd "pass" is standable too (so an NPC never squeezes diagonally
// between two solid corners). Returns npcStep's result (the walking flag) on success, or
// null if it couldn't move. The diagonal-target standability is checked inside npcStep; the
// corner-clearance is the extra gate here.
//
// (Source toggles D_17B2 — party pass-through — on only for the two clearance probes; the
// clone uses plain canStandAt for both, a harmless deviation until a party member drunk-
// walks. Move-point spend is the caller/tick's job under I-14, so it's omitted here.)
export function tryDiagMove(world, handle, hDir, vDir, walking) {
  const i = world.resolve(handle);
  if (i === -1) return null;
  const pos = world.store(Position);
  const ot = world.store(ObjType);
  const opts = { actorId: handle, asHumanoidNpc: isHumanoid(ot.objNumber[i]) };

  const dir = diagOf(hDir, vDir);
  const cx = pos.x[i], cy = pos.y[i];
  const nx = (cx + DIR_DX[dir]) & 0x3ff;
  const ny = (cy + DIR_DY[dir]) & 0x3ff;

  // Corner-clearance: the horizontal neighbour (new_x, cur_y) OR the vertical neighbour
  // (cur_x, new_y) must be standable (seg_1E0F.c:1480-1482).
  const hClear = canStandAt(world, nx, cy, opts);
  const vClear = canStandAt(world, cx, ny, opts);
  if (!hClear && !vClear) return null;

  // Diagonal target itself is checked + the move done by npcStep (= TryStraightMove).
  return npcStep(world, handle, dir, walking);
}

// Default RNG: a uniform integer in [a, b]. Injectable (tryMoveTo's last arg) so tests can
// drive the random tie-breaks deterministically. (Plain Math.random — fine in app code.)
export function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

// TryMoveTo (C_1E0F_35A7) — take ONE greedy step toward (targetX, targetY), nudging around a
// single blocker; NOT a route plan. Picks a primary axis (the larger delta, with a random
// tie-break + a distance-weighted random for far targets), then walks the fallback chain:
//   primary-straight → diagonal (corner-cleared) → other-straight → reverse-other (50% rand)
// Returns npcStep's walking flag on the first success, or null if every attempt was blocked.
// Wrap-aware on the toroidal 1024 overworld. Move-point spend is the caller/tick's job
// (I-14); AI_IMMOBILE / no-target gating is the caller's too — here a zero delta just no-ops.
export function tryMoveTo(world, handle, targetX, targetY, walking, rand = randInt) {
  const i = world.resolve(handle);
  if (i === -1) return null;
  const pos = world.store(Position);
  const dx = wrapDelta(targetX - pos.x[i]);
  const dy = wrapDelta(targetY - pos.y[i]);
  if (dx === 0 && dy === 0) return null;

  // Axis components toward the target (random pick when an axis delta is 0).
  const hDir = dx === 0 ? (rand(0, 1) ? 2 : 6) : (dx < 0 ? 6 : 2);
  const vDir = dy === 0 ? (rand(0, 1) ? 0 : 4) : (dy < 0 ? 0 : 4);
  const adx = Math.abs(dx), ady = Math.abs(dy);

  // Primary axis = the larger delta. Close in (both < 4): vertical-first iff |dy| is the
  // bigger (ties random). Far: distance-weighted random so the bias scales with the deltas.
  const isVMove = (adx < 4 && ady < 4)
    ? (adx < ady || (adx === ady && !!rand(0, 1)))
    : (rand(1, adx + ady) > adx);

  const straight = (dir) => npcStep(world, handle, dir, walking);
  const diag = () => tryDiagMove(world, handle, hDir, vDir, walking);

  // Fallback chain (seg_1E0F.c:1532-1551). The reverse step is tried only ~50% of the time
  // (source's `OSI_rand(0,1) || !TryStraightMove(..^4)` short-circuit).
  const [first, third, rev] = isVMove ? [vDir, hDir, hDir ^ 4] : [hDir, vDir, vDir ^ 4];
  let r = straight(first);
  if (r === null) r = diag();
  if (r === null) r = straight(third);
  if (r === null && rand(0, 1) === 0) r = straight(rev);
  return r;
}

// Signed shortest delta on the wrapped 1024-cell overworld axis (so a chase across the
// x=0 / y=0 map seam reads as "1 step", not "1023").
function wrapDelta(d) {
  d &= 0x3ff;
  return d > 512 ? d - 1024 : d;
}
