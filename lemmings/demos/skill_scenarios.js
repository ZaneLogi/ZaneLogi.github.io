// lemmings/demos/skill_scenarios.js
//
// Demo fixtures for the per-skill stages (skill_stage.js). Each is a single, larger
// world purpose-built to show one skill reshaping terrain (or, for the blocker,
// turning other lemmings). The harness auto-assigns the skill to the returned
// primary lemming after a beat, and re-demonstrates on a loop.

import { ACTION } from '../src/lemming.js';
import { EFFECT } from '../src/object_map.js';
import { SKILL } from '../src/assignment.js';

/**
 * @typedef {Object} SkillScenario
 * @property {string} id
 * @property {string} title
 * @property {string} skill one of SKILL.*
 * @property {string} hint
 * @property {{x:number,y:number,w:number,h:number}} view
 * @property {(terrain: import('../src/terrain.js').Terrain, objectMap: import('../src/object_map.js').ObjectMap) => void} build
 * @property {(sim: import('../src/simulation.js').Simulation) => import('../src/lemming.js').Lemming} spawn returns the primary (auto-assigned) lemming
 * @property {number} [skillBudget]
 * @property {number} [autoAssignAfter] frames to walk before auto-assigning
 * @property {number} [loopFrames] frames after assignment before re-demonstrating
 */

/** Digger: tunnel straight down through a slab, break through, drop to the floor. */
const digger = {
  id: 'digger', title: 'Digger', skill: SKILL.DIGGER,
  hint: 'tunnels straight down (9px rows); breaks through into the cavity below (§15.10)',
  view: { x: 0, y: 60, w: 200, h: 100 }, autoAssignAfter: 6,
  build(terrain) {
    terrain.fillRect(0, 72, 200, 14);           // slab to dig through (y72..85)
    terrain.fillRect(0, 120, 200, 40);          // landing floor ~34px below (a survivable drop)
  },
  spawn(sim) { return sim.addLemming(64, 72, 1, ACTION.WALKING); },
};

/** Builder: lay a rising staircase, run out of bricks, shrug, walk on. */
const builder = {
  id: 'builder', title: 'Builder', skill: SKILL.BUILDER,
  hint: 'lays a 12-brick staircase up-and-forward; shrugs when out of bricks (§15.7)',
  view: { x: 0, y: 92, w: 210, h: 68 }, autoAssignAfter: 6,
  build(terrain) {
    terrain.fillRect(0, 130, 210, 30);          // floor
    terrain.fillRect(150, 96, 60, 64);          // a ledge/wall the staircase climbs toward
  },
  spawn(sim) { return sim.addLemming(28, 130, 1, ACTION.WALKING); },
};

/** Blocker: a placed blocker turns back two walkers, trapping them (§4.5, §15.11). */
const blocker = {
  id: 'blocker', title: 'Blocker', skill: SKILL.BLOCKER,
  hint: 'stands and turns back any lemming that touches its arms (§4.5)',
  view: { x: 0, y: 92, w: 220, h: 68 }, skillBudget: 3, autoAssignAfter: 6, loopFrames: 320,
  build(terrain) {
    terrain.fillRect(0, 124, 220, 36);          // floor
    terrain.fillRect(4, 96, 6, 28);             // left wall
    terrain.fillRect(210, 96, 6, 28);           // right wall
  },
  spawn(sim) {
    const block = sim.addLemming(110, 124, 1, ACTION.WALKING);  // becomes the blocker
    sim.addLemming(60, 124, 1, ACTION.WALKING);                 // walker bouncing on the left
    sim.addLemming(162, 124, -1, ACTION.WALKING);               // walker bouncing on the right
    return block;
  },
};

/** Basher: tunnel horizontally through a free-standing wall to the far side (§15.8). */
const basher = {
  id: 'basher', title: 'Basher', skill: SKILL.BASHER,
  hint: 'tunnels horizontally; stops at steel or when nothing is left ahead (§15.8)',
  view: { x: 40, y: 82, w: 190, h: 82 }, autoAssignAfter: 10,
  build(terrain, objectMap) {
    terrain.fillRect(40, 124, 200, 36);         // floor
    terrain.fillRect(110, 88, 26, 36);          // wall to bash through (x110..135)
    // a steel cap on the far part of the wall — the basher will stop before it
    terrain.fillRect(150, 88, 12, 36);
    objectMap.paintRect(150, 88, 12, 36, EFFECT.STEEL);
  },
  spawn(sim) { return sim.addLemming(98, 124, 1, ACTION.WALKING); },
};

/** Miner: tunnel diagonally down-and-forward through thick ground (§15.9). */
const miner = {
  id: 'miner', title: 'Miner', skill: SKILL.MINER,
  hint: 'tunnels diagonally downward; the mine mask carves the slope (§15.9)',
  view: { x: 0, y: 78, w: 220, h: 90 }, autoAssignAfter: 6,
  build(terrain) {
    terrain.fillRect(0, 92, 220, 68);           // thick ground to mine into
  },
  spawn(sim) { return sim.addLemming(46, 92, 1, ACTION.WALKING); },
};

/** @type {Record<string, SkillScenario>} */
export const SKILL_SCENARIOS = { digger, builder, blocker, basher, miner };
