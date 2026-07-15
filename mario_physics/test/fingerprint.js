// ----------------------
// Physics fingerprint — a characterization harness
// ----------------------
// Drives the *real* per-tick pipeline (`World.update`: intent -> collide ->
// react -> present) through a fixed set of scenarios and reduces each to a hash
// plus a few readable scalars.
//
// It pins CURRENT behaviour, not CORRECT behaviour. Its only question is "did
// this change?" — which is what makes a restructure (inverting the loop, moving
// movement onto the type, hoisting gravity) verifiable as a no-op. It has no
// opinion on whether the physics is any good, and it will happily pin a bug.
//
// Every phase the loop touches is covered, not just the physics: `qblock_bump`
// exercises the react phase (TILES.onBump) and `anim_states` the present phase.
// A fingerprint that only covered intent+collide would go green while a
// restructure silently stopped dispatching block bumps.
//
// Deterministic: no rAF, no Date.now, no Math.random — it runs synchronously on
// load, so it still works when the preview tab is hidden.
//
// Caveat: Math.pow is not guaranteed bit-identical across JS engines, and the
// physics leans on it twice (friction^step, jumpLev^mod). Re-bless the baseline
// on the engine recorded in baseline.js.

import { Actor } from '../actor.js';
import { ACTOR_TYPES } from '../actor_types.js';
import { LevelMap } from '../level_map.js';
import { World } from '../world.js';
import { Animator } from '../animator.js';

const DT = 1 / 60;
const T = 32;

// FNV-1a, so a whole per-tick trace collapses to one comparable token. Values
// are stringified at full precision, so any drift at all changes the hash.
function hashTrace(values) {
  const s = values.join(',');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// A flat level: solid floor on the bottom row, empty above. `decorate` may drop
// extra tiles in.
function makeLevel(rows, cols, decorate) {
  const lv = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) row.push(r === rows - 1 ? 1 : 0);
    lv.push(row);
  }
  if (decorate) decorate(lv);
  return lv;
}

function spawn(level, x, y) {
  const map = new LevelMap(level, T);
  const world = new World(map);
  const actor = new Actor(ACTOR_TYPES.mario, x, y);
  world.addActor(actor, new Animator(ACTOR_TYPES.mario.sprites));
  return { world, actor, map };
}

// Drive one tick with a given player intent. Intent reaches an actor through its
// own `input` field, which only the `keyboard` controller reads.
function tick(world, actor, input) {
  actor.input = input;
  world.update(DT);
}

// Let the actor fall to the floor and come to rest before the scenario starts.
function settle(world, actor, n = 150) {
  for (let i = 0; i < n; i++) tick(world, actor, {});
}

const r3 = (v) => +v.toFixed(3);

// 1. Hold right 600 ticks, release, settle 300.
//    Accel -> friction equilibrium (top speed is emergent) -> glide stop.
function runAndSettle() {
  const { world, actor } = spawn(makeLevel(16, 400), 160, 0);
  settle(world, actor);
  const x0 = actor.x, vx = [], disp = [];
  for (let f = 0; f < 900; f++) {
    tick(world, actor, f < 600 ? { right: true } : {});
    vx.push(actor.vx);
    disp.push(actor.x - x0);
  }
  let stop = -1;
  for (let f = 600; f < 900; f++) if (vx[f] === 0) { stop = f - 600; break; }
  return {
    trace: [...vx, ...disp],
    scalars: {
      plateauVx: r3(Math.max(...vx)),
      distAtRelease: r3(disp[599]),
      distFinal: r3(disp[899]),
      ticksToStopAfterRelease: stop,
    },
  };
}

// 2. Hold right 600, reverse to left 300, release 150.
//    Momentum overshoot, skid, turnaround.
function runReverseSettle() {
  const { world, actor } = spawn(makeLevel(16, 600), 2000, 0);
  settle(world, actor);
  const x0 = actor.x, vx = [], disp = [];
  let skidTicks = 0;
  for (let f = 0; f < 1050; f++) {
    const input = f < 600 ? { right: true } : f < 900 ? { left: true } : {};
    tick(world, actor, input);
    vx.push(actor.vx);
    disp.push(actor.x - x0);
    if (actor.isSkidding) skidTicks++;
  }
  let turn = -1;
  for (let f = 600; f < 1050; f++) if (vx[f] <= 0) { turn = f; break; }
  const peak = Math.max(...disp);
  return {
    trace: [...vx, ...disp],
    scalars: {
      peakDist: r3(peak),
      peakTick: disp.indexOf(peak),
      turnaroundTick: turn,
      skidTicks,
      leftVxAtEnd: r3(vx[899]),
      distFinal: r3(disp[1049]),
    },
  };
}

// 3. Jump height as a function of the tick the button is released.
//    Pins the accumulating-thrust curve and its variable-height window.
function jumpReleaseSweep() {
  const peaks = [], landTicks = [], trace = [];
  for (const release of [2, 4, 8, 14, 22, 999]) {
    const { world, actor } = spawn(makeLevel(20, 20), 160, 0);
    settle(world, actor);
    const y0 = actor.y;
    let peak = 0, land = -1, airborne = false;
    for (let f = 0; f < 200; f++) {
      tick(world, actor, { jump: f < release });
      const h = y0 - actor.y;
      peak = Math.max(peak, h);
      trace.push(h);
      if (!actor.contacts.ground) airborne = true;
      if (airborne && actor.contacts.ground) { land = f; break; }
    }
    peaks.push(r3(peak));
    landTicks.push(land);
  }
  return { trace, scalars: { peaks, landTicks } };
}

// 4. Free fall from height: gravity ramp -> terminal-velocity clamp -> land.
function terminalFall() {
  const { world, actor } = spawn(makeLevel(32, 12), 160, 0);
  const y0 = actor.y, vy = [], dist = [];
  let land = -1;
  for (let f = 0; f < 220; f++) {
    tick(world, actor, {});
    vy.push(actor.vy);
    dist.push(actor.y - y0);
    if (actor.contacts.ground) { land = f; break; }
  }
  return {
    trace: [...vy, ...dist],
    scalars: {
      terminalTick: vy.findIndex((v) => v >= 8),
      terminalVy: r3(Math.max(...vy)),
      landTick: land,
      fallDist: r3(dist[dist.length - 1]),
    },
  };
}

// 5. Hold right through a long fall: air control runs the same horizontal model
//    as the ground, and the two axes evolve independently.
function airControl() {
  const { world, actor } = spawn(makeLevel(70, 60), 64, 0);
  const vx = [], vy = [];
  let land = -1;
  for (let f = 0; f < 400; f++) {
    tick(world, actor, { right: true });
    vx.push(actor.vx);
    vy.push(actor.vy);
    if (actor.contacts.ground && f > 2) { land = f; break; }
  }
  return {
    trace: [...vx, ...vy],
    scalars: {
      airVxAtTick100: r3(vx[100]),
      airVxMax: r3(Math.max(...vx)),
      terminalVy: r3(Math.max(...vy)),
      landTick: land,
    },
  };
}

// 6. Hold right + run: doubled accel overshoots the equilibrium, so this is the
//    one case actually pinned by the maxSpeed clamp.
function sprint() {
  const { world, actor } = spawn(makeLevel(16, 600), 160, 0);
  settle(world, actor);
  const x0 = actor.x, vx = [], disp = [];
  for (let f = 0; f < 240; f++) {
    tick(world, actor, { right: true, run: true });
    vx.push(actor.vx);
    disp.push(actor.x - x0);
  }
  let clamp = -1;
  for (let f = 0; f < 240; f++) if (vx[f] >= 5.4) { clamp = f; break; }
  return {
    trace: [...vx, ...disp],
    scalars: {
      plateauVx: r3(Math.max(...vx)),
      clampTick: clamp,
      distAtEnd: r3(disp[239]),
    },
  };
}

// 7. REACT phase. Head-bump a ? block: the resolver reports `bumped`, the world
//    dispatches TILES[3].onBump, which starts the hop and spends the block (3 -> 5).
function qBlockBump() {
  const level = makeLevel(16, 20, (lv) => { lv[10][2] = 3; });
  // Spawn BELOW the block (row 10 spans y 320..352), or the actor falls onto its
  // roof during settle and jumps from there, never bumping it from underneath.
  const { world, actor, map } = spawn(level, 64, 400);
  settle(world, actor);
  const tileBefore = map.tileData[10][2];
  const trace = [];
  let bumpTick = -1, hopSeen = false;
  for (let f = 0; f < 90; f++) {
    tick(world, actor, { jump: true });
    trace.push(r3(actor.y), map.tileData[10][2]);
    if (bumpTick < 0 && actor.contacts.ceiling) bumpTick = f;
    if (world.bumps.has('2,10')) hopSeen = true;
  }
  return {
    trace,
    scalars: { tileBefore, tileAfter: map.tileData[10][2], bumpTick, hopSeen },
  };
}

// 8. PRESENT phase. The animation state derived each tick across a scripted run.
function animStates() {
  const { world, actor } = spawn(makeLevel(16, 400), 160, 0);
  settle(world, actor);
  const script = [
    [{}, 20],                          // idle
    [{ right: true }, 60],             // walk
    [{ right: true, run: true }, 120], // run
    [{ left: true }, 8],               // skid
    [{ jump: true, right: true }, 20], // jump
    [{ right: true }, 60],             // fall, then land
  ];
  const trace = [];
  for (const [input, n] of script) {
    for (let i = 0; i < n; i++) {
      tick(world, actor, input);
      trace.push(actor.currentState);
    }
  }
  return {
    trace,
    scalars: { statesSeen: [...new Set(trace)], finalState: actor.currentState },
  };
}

// 9. A second actor, driven by a computed controller rather than a keyboard.
//    Proves the reactive class: it walks at a constant speed and turns around on
//    contact, using no senses at all — `contacts.left/right` is enough. Also
//    proves a non-player actor never sees the player's input (it is given none).
function goombaWalks() {
  // A pen: floor on the bottom row, and out-of-bounds counts as solid, so the
  // walker turns at both ends of a 10-tile strip.
  const map = new LevelMap(makeLevel(16, 10), T);
  const world = new World(map);
  const g = new Actor(ACTOR_TYPES.goomba, 160, 0);
  world.addActor(g, new Animator(ACTOR_TYPES.goomba.sprites));

  const x = [], facing = [];
  let turns = 0, prevFacing = g.facing;
  for (let f = 0; f < 900; f++) {
    world.update(DT);
    x.push(g.x);
    facing.push(g.facing);
    if (g.facing !== prevFacing) turns++;
    prevFacing = g.facing;
  }
  return {
    trace: [...x, ...facing],
    scalars: {
      turns,
      minX: r3(Math.min(...x)),
      maxX: r3(Math.max(...x)),
      speed: r3(Math.abs(g.vx)),
      state: g.currentState,
      restsOnFloor: g.contacts.ground,
    },
  };
}

const SCENARIOS = {
  run_and_settle: runAndSettle,
  run_reverse_settle: runReverseSettle,
  jump_release_sweep: jumpReleaseSweep,
  terminal_fall: terminalFall,
  air_control: airControl,
  sprint: sprint,
  qblock_bump: qBlockBump,
  anim_states: animStates,
  goomba_walks: goombaWalks,
};

/** Run every scenario; return { name: { hash, scalars } }. */
export function fingerprint() {
  const out = {};
  for (const name of Object.keys(SCENARIOS)) {
    const { trace, scalars } = SCENARIOS[name]();
    out[name] = { hash: hashTrace(trace), scalars };
  }
  return out;
}
