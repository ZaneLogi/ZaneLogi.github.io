// NPC AI behaviors (I-17) — the active per-turn worktype handlers that turn the MOVING
// schedule worktypes from idle leaf states (where I-16 atDestination parks an arrived NPC)
// into live behaviors. The clone analog of the worktype cases in source's per-mode
// dispatcher C_1E0F_3E6A (seg_1E0F.c:1733-1848):
//   a — WANDER / GRAZE   C_1E0F_37DB  (random cardinal drift)
//   b — LOITER / FARM    C_1E0F_33C4  (geom-random drift toward the slot)   [added I-17b]
//   c — GUARD pacing     dispatcher :1820-1834 (march the guard axis, reverse on a block) [I-17c]
//
// All ride on npcStep (the I-14 single-step kernel = source's TryStraightMove); none uses
// the I-15 drunk-walk tryMoveTo (that backs AI_BRAWL/CONVERSE/THIEF, deferred by design).
//
// Probability × accumulator contract (progress.md §"I-17 scope"). Source rate-limits these
// twice: the move-point economy grants the turn (DEXTE-paced), and a per-turn die (1/8 for
// wander/loiter, 1/2 for guard) then decides whether the turn produces a STEP or an idle —
// where source's idle path ALSO spends move points. The clone's I-14 accumulator reproduces
// the first limiter; these handlers reproduce the second. So a handler only ROLLS the die +
// attempts a step, and the tick spends the cell's stepCost on EVERY outcome (the contract),
// which is why a high-DEXTE NPC that keeps rolling idle can't bank beats into a burst. Each
// handler returns one of:
//   'step'    — rolled a move and npcStep succeeded
//   'blocked' — rolled a move but npcStep failed (cell impassable / occupied)
//   'idle'    — rolled the no-move branch (or had no valid target)
// all three consume the same credit at the tick.

import { Position, ObjType } from '../components/components.js';
import { npcStep } from './npc_path.js';
import { isHumanoid } from './humanoid_anim.js';
import * as AI from './ai_modes.js';

// Default RNG: a uniform integer in [a, b]. Injectable (the handlers' last arg) so tests can
// drive source's OSI_rand calls deterministically. Same convention as drunk_walk.randInt.
export function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

// WANDER / GRAZE — C_1E0F_37DB (seg_1E0F.c:1558-1574). 1/8 chance to take one step in a
// random cardinal (OSI_rand(0,3)<<1 = N/E/S/W); otherwise idle. The 1/4 IsPlrControl
// "drift toward the player" arm (:1561-1567) is dropped — it needs NPC charm / player
// control, which the clone doesn't have. The gentle Britannian townsfolk / grazing-animal
// drift; facing/animation are handled inside npcStep (setDirection, per object type).
export function wander(world, handle, rand = randInt) {
  if (rand(0, 7) !== 0) return 'idle';
  const dir = rand(0, 3) << 1;
  return npcStep(world, handle, dir, 1) !== null ? 'step' : 'blocked';
}

// LOITER / FARM — C_1E0F_33C4 (seg_1E0F.c:1448-1462). 1/8 chance to take ONE biased-random
// step toward the schedule slot (sx,sy); otherwise idle. The bias uses the geometric-random
// offset C_1E0F_31C7 — so the drift wobbles toward the slot rather than beelining. Source:
// delta = GetPos − slot; pick the axis by |dy|−|dx| < geom, then the sign by geom > delta
// (which resolves to "step toward the slot, jittered"). Wrap-aware on the toroidal 1024
// overworld (source's raw subtract is exact only off-seam; loiter slots are local, so it
// matches in practice). facing/animation handled inside npcStep.
export function loiter(world, handle, sx, sy, rand = randInt) {
  if (rand(0, 7) !== 0) return 'idle';
  const i = world.resolve(handle);
  if (i === -1) return 'idle';
  const pos = world.store(Position);
  const dx = wrapDelta(pos.x[i] - sx);
  const dy = wrapDelta(pos.y[i] - sy);
  const dir = (Math.abs(dy) - Math.abs(dx) < geomRand(rand))
    ? (geomRand(rand) > dx ? 2 : 6)    // horizontal axis: E if slot is east of us, else W
    : (geomRand(rand) > dy ? 4 : 0);   // vertical axis:   S if slot is south of us, else N
  return npcStep(world, handle, dir, 1) !== null ? 'step' : 'blocked';
}

// C_1E0F_31C7 (seg_1E0F.c:1391-1398) — geometric-random ± offset: count consecutive heads
// (si = run length) until the first tails, then a random sign. Favors small offsets (P(|si|=n)
// halves each step). The cap (31) defensively bounds a pathological injected RNG; source has
// none (real OSI_rand terminates a.s.) and 2^-31 makes the cap invisible.
function geomRand(rand) {
  let si = 0;
  while (rand(0, 1) && si < 31) si++;
  return rand(0, 1) ? -si : si;
}

// Signed shortest delta on the wrapped 1024-cell overworld axis (drunk_walk.wrapDelta).
function wrapDelta(d) { d &= 0x3ff; return d > 512 ? d - 1024 : d; }

// GUARD pacing — dispatcher arm seg_1E0F.c:1820-1834 (AI_0F/10/GUARD_N..W). 50% idle; else
// march: ON the home post (current cell == slot) along the guard axis ((mode−AI_GUARD_N)<<1 =
// the guard cardinal); OFF the post, continue the current facing (read from the sprite frame —
// the clone keeps facing frame-encoded, consuming the I-9g/I-16 "a later GUARD step reads
// facing from frame>>2" hook). On a block, reverse (dir^4) and step the other way, so the
// guard paces up-and-down and turns around at the ends. facing/animation via npcStep.
export function guardPace(world, handle, mode, sx, sy, rand = randInt) {
  if (rand(0, 1) === 0) return 'idle';
  const i = world.resolve(handle);
  if (i === -1) return 'idle';
  const pos = world.store(Position);
  const onPost = pos.x[i] === sx && pos.y[i] === sy;
  const dir = onPost ? ((mode - AI.AI_GUARD_N) << 1) : facingDir8(world, i);
  if (npcStep(world, handle, dir, 1) !== null) return 'step';
  if (npcStep(world, handle, dir ^ 4, 1) !== null) return 'step';   // blocked → reverse & step
  return 'blocked';
}

// Current facing as an 8-dir cardinal, read from the humanoid sprite frame (facing =
// (frame>>2)&3). Source reads GetDirection (a logical facing field); the clone encodes facing
// in the frame (kept I-9g deviation). Non-humanoid guards (none in the shipped schedules)
// fall back to N — a benign default; their frame layout isn't the humanoid facing<<2 form.
function facingDir8(world, i) {
  const ot = world.store(ObjType);
  if (isHumanoid(ot.objNumber[i])) return ((ot.frame[i] >> 2) & 3) << 1;
  return 0;
}

// Dispatch an active worktype to its handler (the clone analog of the worktype switch arms
// of C_1E0F_3E6A). `dest` is the Destination store, `i` the entity row (for the slot xyz the
// drift/guard handlers need). Returns the handler's outcome string; the tick spends stepCost
// on the result. Only modes AI.isActiveWorktype(mode) covers reach here (the tick gate).
export function dispatchWorktype(world, handle, mode, dest, i, rand = randInt) {
  if (mode === AI.AI_WANDER || mode === AI.AI_GRAZE) return wander(world, handle, rand);
  if (mode === AI.AI_LOITER || mode === AI.AI_FARM) return loiter(world, handle, dest.x[i], dest.y[i], rand);
  if (mode >= AI.AI_GUARD_N && mode <= AI.AI_GUARD_W) return guardPace(world, handle, mode, dest.x[i], dest.y[i], rand);
  return 'idle';
}
