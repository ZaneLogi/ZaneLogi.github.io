// seafox/src/core/session.js
//
// Session state (design_spec § 10.3) and the joint reset of § 4.8.
//
// **There is no mode variable.** The mission counter IS the mode flag (§ 10.1):
// zero means the title screen, 1 to 5 are the missions, and it has exactly two
// writers -- the title screen sets it to zero, and starting a game increments
// it. So starting a game is a single increment: the transition out of attract
// mode and the advance to mission 1 are one operation, not two. An
// implementation with an AttractMode class and a GameMode class has already
// diverged, because it now has two things to keep in step that were never
// separate.
//
// Eighteen sites read the counter and they do two different jobs -- twelve ask
// "is this the title screen?" and suspend one rule each, six ask "which mission
// is this?" for ordinary scaling. Conflating them is the usual way this goes
// wrong, so the two questions have separate accessors below.

import { EntityList } from './entities.js';
import { Rng } from './rng.js';
import { capsFor } from './difficulty.js';
import { createSpawnerState, resetRoster, KILL_QUOTA } from './spawners.js';

/** @type {number} § 10.3: the game begins with three and gains no more, ever. */
export const STARTING_SPARE_SUBS = 3;

/**
 * Everything the simulation carries between ticks.
 *
 * The generator is created once here and **never reseeded** (§ 5.1) -- not
 * between rounds, not between missions, not between games. Neither are the
 * spawner cooldowns (§ 12.3). Those two facts together are what make the opening
 * of the first demo after a cold start exactly reproducible, which is what
 * Oracle 2 asserts.
 */
export class Session {
  constructor() {
    /** @type {Rng} the one generator (§ 5.1). Never reseeded. */
    this.rng = new Rng();
    /** @type {EntityList} the 32 slots (Chapter 4). */
    this.entities = new EntityList();
    /** @type {Object} spawner cooldowns and the roster. Cooldowns never reset. */
    this.spawners = createSpawnerState();

    /** @type {number} 0 = title screen, 1-5 = the mission number (§ 10.1). */
    this.mission = 0;
    /** @type {boolean} set while a round is playing, cleared for the outro. */
    this.roundLive = false;
    /** @type {number} decremented when a sub launches, NEVER incremented. */
    this.spareSubs = STARTING_SPARE_SUBS;
    /** @type {boolean} a life was lost -- replay rather than advance. */
    this.replayMission = false;
    /** @type {boolean} the subs ran out, or mission 5 was cleared. */
    this.gameOver = false;
    /** @type {boolean} the round ended with empty tanks. */
    this.ranDry = false;
    /** @type {boolean} set by the title screen's start input. */
    this.startRequested = false;
    /** @type {string} which input scheme this session uses (Chapter 19). */
    this.controller = '';

    /** @type {number} merchants still to sink this mission (§ 12.5, § 8.5). */
    this.killCounter = KILL_QUOTA;
    /** @type {number} ticks elapsed. Not game state -- the oracles read it. */
    this.tick = 0;
    /** @type {Object<string, number>} the caps of the current rung (Chapter 8). */
    this.caps = capsFor(this.mission);
  }

  /**
   * "Is this the title screen?" -- the question twelve sites ask, each
   * suspending one rule (§ 10.5.2).
   * @returns {boolean}
   */
  get isTitleScreen() {
    return this.mission === 0;
  }

  /**
   * Apply the difficulty rung for the current mission counter (Chapter 8).
   * @returns {void}
   */
  applyRung() {
    this.caps = capsFor(this.mission);
  }

  /**
   * Start a game, or advance to the next mission: **a single increment**
   * (§ 10.1, § 10.4). This is also the attract-to-game transition.
   * @returns {void}
   */
  nextMission() {
    this.mission += 1;
    this.applyRung();
    resetRoster(this.spawners);
    this.killCounter = KILL_QUOTA;
  }

  /**
   * The joint reset of § 4.8: every live entity, every effect, the live count,
   * the effect count and all the class counters clear **together**.
   *
   * Clearing the list without the counters, or the reverse, lets a counter drift
   * permanently out of step with the array -- the same failure as collapsing
   * two-phase removal, arriving by a different route.
   *
   * The effects list of Chapter 15 does not exist yet and joins this call when
   * it does. The spawner cooldowns are deliberately NOT reset (§ 12.3).
   * @returns {void}
   */
  resetLists() {
    this.entities.reset();
  }
}
