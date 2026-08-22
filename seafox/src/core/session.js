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
import { createDemoState } from './demo.js';
import { createConvoyState } from './convoy.js';
import { PLAYER_BOUNDS, DEMO_START, spawnPlayer } from './player.js';

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

    /**
     * **The one input seam** (§ 19.1): every source of control reaches the
     * simulation as this pair, each axis one of -2, 0 or +2. It has exactly
     * three writers -- the keyboard table, the analogue axes and the demo's
     * bounce -- and only one is active at a time. Nothing downstream knows which
     * wrote it, and that is the whole mechanism by which one engine serves both
     * the attract demo and a played game.
     *
     * It lives here rather than on the entity because § 4.2 gives the entity
     * record no velocity field: motion is decided fresh each update.
     * @type {{vx: number, vy: number}}
     */
    this.input = { vx: 0, vy: 0 };

    /**
     * The player's clamps (§ 2.5). A copy, not the shared constant, because the
     * fly-in relaxes minX to 0 and the outro raises maxX to 306 (§ 11).
     * @type {{minX: number, maxX: number, minY: number, maxY: number}}
     */
    this.playerBounds = Object.assign({}, PLAYER_BOUNDS);

    /**
     * § 13.1: raised when the player spawns, and cleared by the player's OWN
     * handler when a removal is requested. Nothing else writes it, which is why
     * death reaches § 11.2's guard one tick after the hit.
     * @type {boolean}
     */
    this.playerAlive = false;

    /** @type {Object} the attract submarine's state (§ 10.5.1). */
    this.demo = createDemoState();

    /**
     * The shared convoy block of § 16.5. The dolphin and the clam read the
     * payload's position from here rather than from its record, which is what
     * lets them derive their positions with no slot index passing between them.
     * @type {Object}
     */
    this.convoy = createConvoyState();

    /**
     * Supply runs so far this mission, incremented TWICE per resupply -- once
     * when the submarine spawns and once when it releases (§ 13.8.3). It takes
     * the values 2, 4, 6 ... against a threshold of 3, so the first resupply of
     * a mission is clam-free and every later one is contested.
     * @type {number}
     */
    this.resupplyCount = 0;

    /** @type {number} § 13.2: the horizontal torpedo's 6-tick cooldown. */
    this.horizontalCooldown = 0;
  }

  /**
   * Put the title screen into its running state: an empty list and the demo
   * submarine at § 20.4's start position, stationary.
   *
   * The player is allocated first, so it takes slot 0 -- and because it is never
   * freed during a round, the swap-with-last of § 4.6 cannot move another entity
   * into that slot. `playerSlot` below relies on that and asserts it.
   * @returns {void}
   */
  startDemo() {
    this.mission = 0;
    this.applyRung();
    this.resetLists();
    this.demo = createDemoState();
    this.convoy = createConvoyState();
    this.resupplyCount = 0;
    this.horizontalCooldown = 0;
    this.playerBounds = Object.assign({}, PLAYER_BOUNDS);
    spawnPlayer(this, DEMO_START.x, DEMO_START.y);
  }

  /**
   * The player's slot, or -1 when there is none.
   *
   * Not cached: a slot is an index (§ 4.1) and swap-with-last moves entities
   * between them, so a stored index would be a stale handle. In practice the
   * player is always slot 0 during a round -- it is allocated into an empty list
   * and never freed until the outro -- and this returns that without assuming it.
   * @returns {number}
   */
  get playerSlot() {
    for (let i = 0; i < this.entities.liveCount; i++) {
      if (this.entities.slots[i].type === 0) return i;
    }
    return -1;
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
    // § 13.8.3: reset once per mission, which is what makes the clam's ramp a
    // per-mission escalation rather than a per-session one.
    this.resupplyCount = 0;
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
