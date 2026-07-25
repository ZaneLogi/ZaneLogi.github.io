// lemmings/demos/scenarios.js
//
// Demo fixtures for the locomotion gallery: a set of tiny, single-behavior
// "stages", each isolating ONE lemming↔terrain interaction so it can be watched
// in a small window. These are demo data, not engine code — they live in demos/,
// build straight into the src/ substrate buffers, and drive the src/ simulation.
//
// Each scenario paints a small terrain arrangement (and, for the hazard stages, a
// trigger region in the object map), then spawns a walker that exercises the
// behavior. Non-hazard stages are bounded by walls so the lemming paces forever;
// hazard/fall stages end in removal and the gallery respawns the walker.

import { ACTION } from '../src/lemming.js';
import { EFFECT } from '../src/object_map.js';

/** @typedef {import('../src/terrain.js').Terrain} Terrain */
/** @typedef {import('../src/object_map.js').ObjectMap} ObjectMap */
/** @typedef {import('../src/simulation.js').Simulation} Simulation */

/**
 * One gallery stage.
 * @typedef {Object} Scenario
 * @property {string} id short identifier
 * @property {string} title panel heading
 * @property {string} hint one-line description of the behavior shown
 * @property {{x: number, y: number, w: number, h: number}} view world rect to display
 * @property {(terrain: Terrain, objectMap: ObjectMap) => void} build paint the stage's terrain + triggers
 * @property {(sim: Simulation) => void} spawn add the walker(s) for one run
 * @property {boolean} [showTriggers] overlay the object-map trigger regions (hazard stages)
 */

const FLOOR = 128;   // common floor top (world y); floors run down to the world bottom

// ─── perpetual pacing stages (walls both sides — the lemming never leaves) ────

/** Flat floor between two walls: walk both ways + turn at an unclimbable wall. */
const pace = {
  id: 'pace', title: 'Pace', hint: 'walk both ways, turn at walls (§15.1)',
  view: { x: 0, y: 84, w: 112, h: 76 },
  build(terrain) {
    terrain.fillRect(0, FLOOR, 112, 32);      // floor
    terrain.fillRect(8, 96, 8, 32);           // left wall (32px — unclimbable)
    terrain.fillRect(96, 96, 8, 32);          // right wall
  },
  spawn(sim) { sim.addLemming(56, FLOOR, 1, ACTION.WALKING); },
};

/** A stepped mound: smooth walk-up (1–2px) going one way, walk-down the other. */
const steps = {
  id: 'steps', title: 'Step up / down', hint: 'rise/drop 1–2px → walk smoothly (§15.1)',
  view: { x: 0, y: 92, w: 120, h: 68 },
  build(terrain) {
    terrain.fillRect(0, FLOOR, 120, 32);      // base floor
    terrain.fillRect(4, 100, 6, 28);          // left wall
    terrain.fillRect(30, 126, 12, 34);        // +2
    terrain.fillRect(42, 124, 12, 36);        // +2
    terrain.fillRect(54, 122, 24, 38);        // plateau
    terrain.fillRect(78, 124, 12, 36);        // −2
    terrain.fillRect(90, 126, 12, 34);        // −2
    terrain.fillRect(110, 100, 6, 28);        // right wall
  },
  spawn(sim) { sim.addLemming(18, FLOOR, 1, ACTION.WALKING); },
};

/** A raised mesa: a 3–6px rise triggers the brief Jumping "hop" step-up (§15.2). */
const hop = {
  id: 'hop', title: 'Hop', hint: 'rise 3–6px → hop up (Jumping, §15.2)',
  view: { x: 0, y: 108, w: 112, h: 52 },
  build(terrain) {
    terrain.fillRect(0, FLOOR, 112, 32);      // floor
    terrain.fillRect(6, 118, 6, 10);          // left wall
    terrain.fillRect(40, 123, 32, 37);        // +5 mesa (hop up onto it)
    terrain.fillRect(94, 118, 6, 10);         // right wall
  },
  spawn(sim) { sim.addLemming(20, FLOOR, 1, ACTION.WALKING); },
};

// ─── fall stages (a drop; the walker eventually leaves and is respawned) ──────

/** Walk off a ledge, fall ≤60px, land safely and keep walking (§15.3). */
const softFall = {
  id: 'soft-fall', title: 'Soft fall', hint: 'fall ≤60px → survive & walk on (§15.3)',
  view: { x: 0, y: 84, w: 104, h: 84 },
  build(terrain) {
    terrain.fillRect(0, 96, 40, 64);          // pedestal (top y=96)
    terrain.fillRect(40, FLOOR, 50, 32);      // landing floor 32px below → safe fall
  },
  spawn(sim) { sim.addLemming(16, 96, 1, ACTION.WALKING); },
};

/** Walk off a tall pedestal, fall >60px, splat on landing — death (§15.3, §15.15). */
const splat = {
  id: 'splat', title: 'Splat', hint: 'fall >60px → splat (death, §15.15)',
  view: { x: 0, y: 28, w: 104, h: 132 },
  build(terrain) {
    terrain.fillRect(0, 40, 36, 120);         // tall pedestal (top y=40)
    terrain.fillRect(36, 152, 68, 8);         // floor ~112px below → fatal fall
  },
  spawn(sim) { sim.addLemming(16, 40, 1, ACTION.WALKING); },
};

// ─── object-terminal stages (walk into a trigger; §17) ───────────────────────

/** Walk into an EXIT trigger → Exiting → saved (§17, §15.18). */
const exit = {
  id: 'exit', title: 'Exit', hint: 'reach the exit → saved (§17, §15.18)',
  showTriggers: true,
  view: { x: 0, y: 96, w: 116, h: 64 },
  build(terrain, objectMap) {
    terrain.fillRect(0, FLOOR, 116, 32);
    terrain.fillRect(6, 108, 6, 20);          // left wall (bounce back if it turns)
    // EXIT region straddles the foot line (y=128) — the foot probe (§4.4) samples
    // objectMap at (x, y), so a trigger that sits only *above* the floor is missed.
    objectMap.paintRect(88, 122, 22, 14, EFFECT.EXIT);
  },
  spawn(sim) { sim.addLemming(20, FLOOR, 1, ACTION.WALKING); },
};

/** Walk into a WATER trigger → Drowning (§17, §15.16). */
const water = {
  id: 'water', title: 'Water', hint: 'walk into water → drown (§15.16)',
  showTriggers: true,
  view: { x: 0, y: 100, w: 120, h: 60 },
  build(terrain, objectMap) {
    terrain.fillRect(0, FLOOR, 120, 32);
    terrain.fillRect(6, 112, 6, 16);          // left wall
    objectMap.paintRect(64, 124, 44, 12, EFFECT.WATER);
  },
  spawn(sim) { sim.addLemming(20, FLOOR, 1, ACTION.WALKING); },
};

/** Walk onto a FIRE trigger → Vaporizing (§17, §15.17). */
const fire = {
  id: 'fire', title: 'Fire', hint: 'walk into fire → vaporize (§15.17)',
  showTriggers: true,
  view: { x: 0, y: 100, w: 120, h: 60 },
  build(terrain, objectMap) {
    terrain.fillRect(0, FLOOR, 120, 32);
    terrain.fillRect(6, 112, 6, 16);          // left wall
    objectMap.paintRect(66, 122, 32, 8, EFFECT.FIRE);
  },
  spawn(sim) { sim.addLemming(20, FLOOR, 1, ACTION.WALKING); },
};

/** @type {Scenario[]} the gallery, in display order. */
export const SCENARIOS = [pace, steps, hop, softFall, splat, exit, water, fire];
