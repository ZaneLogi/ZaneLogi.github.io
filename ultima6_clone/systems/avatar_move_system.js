// Avatar movement (I-8a) — the active party member steps one cell per keypress.
//
// Source: C_1E0F_1B0E /*[advance]*/ (seg_1E0F.c:811-936), reached from the
// CMD_80 command (seg_0A33.c:1202) whose AdvanceDir the input layer sets from
// the arrow/numpad keys (seg_0C9C.c:1069-1076). The avatar is 8-directional;
// a failed legality check is a no-op "bump" (no MoveObj), matching source's
// D_17AE path. Movement reuses the shared single-step move kernel:
//   canStandAt (I-4, = C_1E0F_000F)  — is the destination legal?
//   SpatialIndex.insertAtHead (I-7, = MoveObj chain-head splice) — runtime move.
// Facing-on-step is C_1E0F_0664 + MACRO_A (below). Party-follow (MoveFollowers)
// is I-8c; NPC pathfinding is I-9. See progress.md §"I-8 scope".
//
// Direction encoding matches source (DirIncrX/Y at seg_0903.c:20-21):
//   0=N 1=NE 2=E 3=SE 4=S 5=SW 6=W 7=NW  (clockwise from north; y grows south).

import { TurnClock } from '../ecs/world.js';
import { Position, ObjType, Renderable } from '../components/components.js';
import { SpatialIndex } from '../resources/spatial_index.js';
import { TileRegistry } from '../resources/tile_registry.js';
import { canStandAt } from './passability.js';
import { walkStep } from './humanoid_anim.js';
import { stepCostAt, PLAYER_STEP_MS, BASE_COST } from './move_economy.js';

export const DIR_DX = [0, 1, 1, 1, 0, -1, -1, -1];   // DirIncrX (seg_0903.c:20)
export const DIR_DY = [-1, -1, 0, 1, 1, 1, 0, -1];   // DirIncrY (seg_0903.c:21)

// Keyboard → 8-direction. Arrow keys give the 4 cardinals; the numpad gives the
// full 8 (NumLock-independent via e.code), the same split source's keymap uses.
// Exported (with dirFromKeyEvent) so MOVE's stage-2 push-direction pick
// (command_dispatch, I-10i) shares ONE keyboard→direction map with avatar movement.
export const KEY_DIR = { ArrowUp: 0, ArrowRight: 2, ArrowDown: 4, ArrowLeft: 6 };
export const CODE_DIR = {
  Numpad8: 0, Numpad9: 1, Numpad6: 2, Numpad3: 3,
  Numpad2: 4, Numpad1: 5, Numpad4: 6, Numpad7: 7,
};

// One keydown → direction (0..7) or -1. e.code (numpad, full 8-dir) takes priority
// over e.key (arrows, 4 cardinals), matching the split above.
export function dirFromKeyEvent(e) {
  return (e.code in CODE_DIR) ? CODE_DIR[e.code]
       : (e.key in KEY_DIR)  ? KEY_DIR[e.key]
       : -1;
}

// How long after the LAST movement input the avatar holds its stride pose before
// relaxing to stand. This is the idle-detection delay only — independent of the
// TurnClock heartbeat (which keeps its own interval to drive the world clock). The
// settle still happens on an idle turn; this just requires the idle to have lasted
// at least this long. Tune to taste.
const IDLE_SETTLE_MS = 500;

// Wire the keydown handler and return the per-turn move system.
//   avatarRef.handle — the active member's entity handle (Party[0] at I-8a).
//   onMove(x, y)     — called after a successful step (camera recenter + party follow).
//   onIdle()         — called on an idle turn once idle past IDLE_SETTLE_MS (party settle).
//   isBlocked()      — true when input should be ignored (e.g. a modal is open).
// A keypress sets the pending direction and commits a TurnClock action so the
// sim runs this frame; the move system consumes at most one step per turn.
export function installAvatarMovement(world, { avatarRef, onMove, onIdle, isBlocked } = {}) {
  let pendingDir = -1;
  let walking = false;                  // avatar walk-cycle state (source IsWalking flag)
  let lastInputAt = -Infinity;          // performance.now() of the last movement input
  let nextStepAt = -Infinity;           // I-14c: terrain cooldown gate (next allowed step time)

  // The avatar's tile = baseTile[objNumber] + frame; objNumber is stable, so cache
  // its base once. For humanoid sprites (the Avatar is OBJ_19A) the frame packs
  // facing in the high bits and a 3-step walk cycle in the low 2 bits.
  const reg = world.getResource(TileRegistry);
  const i0 = world.resolve(avatarRef.handle);
  const objNumber = i0 !== -1 ? world.store(ObjType).objNumber[i0] : 0;
  const baseTile = reg && reg.baseTile ? reg.baseTile.objToTile[objNumber] : 0;

  window.addEventListener('keydown', (e) => {
    if (isBlocked && isBlocked()) return;
    const dir = dirFromKeyEvent(e);
    if (dir === -1) return;
    e.preventDefault();                 // arrows would otherwise scroll the page
    pendingDir = dir;
    lastInputAt = performance.now();    // reset the idle-settle timer on any move input (incl. a bump)
    world.getResource(TurnClock).commitAction();   // player action → fire a turn now
  });

  return function avatarMoveSystem() {
    const i = world.resolve(avatarRef.handle);
    if (i === -1) return;               // avatar entity gone (shouldn't happen at I-8a)

    // Idle turn (no pending step): once the party has been idle past IDLE_SETTLE_MS,
    // settle its walk cycles back to stand (onIdle → settleParty; the avatar is just
    // slot 0, settled uniformly with the followers). Source's idle-animation pass
    // (seg_0A33.c:121-133) does the same — leg-out frame → stand, facing preserved.
    // This runs ONLY on idle turns, never on a move turn, so it can't fight the walk
    // cycle the move branch advances (the turn type is source's command-vs-idle
    // mutual exclusion); the IDLE_SETTLE_MS gate lets the party hold its stride pose
    // briefly rather than snapping on the first 100 ms heartbeat. (Source's 1/64
    // stand→random fidget at :126-128 is dropped as cosmetic; settle only.)
    if (pendingDir === -1) {
      if ((performance.now() - lastInputAt) < IDLE_SETTLE_MS) return;
      if (onIdle) onIdle();
      return;
    }

    // I-14c: terrain cooldown — rate-limit SUSTAINED movement (fixed-brisk on open ground,
    // slower through costly terrain) with NO input lag. Standing leaves nextStepAt in the
    // past, so the first step after any pause is instant; while the cooldown runs we keep
    // the pending dir and wait (the turn still ran the NPC/clock systems). Independent of
    // WORLD_SPEED — the player stays responsive even when the ambient world is slowed.
    if (performance.now() < nextStepAt) return;

    const dir = pendingDir;
    pendingDir = -1;

    const pos = world.store(Position);
    const spatial = world.getResource(SpatialIndex);
    const ox = pos.x[i], oy = pos.y[i];
    const nx = (ox + DIR_DX[dir]) & 0x3ff;   // overworld wrap; source masks & 0x3ff
    const ny = (oy + DIR_DY[dir]) & 0x3ff;

    // Bump: no move, no turn — source faces (C_1E0F_0664) only on a successful step.
    // The avatar is the active leader, so it walks THROUGH its followers (party
    // pass-through); only walls / non-party NPCs / objects stop it.
    if (!canStandAt(world, nx, ny, { actorId: avatarRef.handle, asPartyMember: true, leaderHandle: avatarRef.handle })) return;

    spatial.remove(ox, oy, avatarRef.handle);
    pos.x[i] = nx;
    pos.y[i] = ny;
    spatial.insertAtHead(nx, ny, avatarRef.handle);   // runtime move → chain head (MoveObj)

    // Facing-on-step (C_1E0F_0664): turn to face the move direction (8→4) and
    // advance the walk cycle. Shared with MoveFollowers via humanoid_anim.
    const ot = world.store(ObjType);
    const stepped = walkStep(ot.frame[i], dir, walking);
    walking = stepped.walking;
    ot.frame[i] = stepped.frame;
    world.store(Renderable).tileId[i] = baseTile + stepped.frame;

    // I-14c: arm the cooldown from the cell just entered (cost to leave it next step) —
    // PLAYER_STEP_MS on open ground, stretched by terrain. So wading into swamp slows the
    // sustained pace, but the FIRST step in is never gated (this fires only after a step).
    nextStepAt = performance.now() + PLAYER_STEP_MS * stepCostAt(world, nx, ny, pos.z[i]) / BASE_COST;

    if (onMove) onMove(nx, ny);
  };
}
