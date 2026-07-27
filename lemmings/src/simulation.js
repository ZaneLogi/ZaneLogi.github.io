// lemmings/src/simulation.js
//
// The frame pump (design_spec Chapter 12): holds the world (terrain buffer +
// object map), the lemming list, and the population counters, and advances them
// one frame at a time. Headless (§1.6) — no canvas, no wall-clock; the renderer is
// strictly downstream, reading this state after step() returns.
//
// step() runs the subset of the §12.1 phases the Phase-1 locomotion demo needs:
// advance the frame counter, then process every lemming in strict list order
// (§12.3) — advance its animation frame (§12.4), run its handler (Chapter 15),
// then object interaction (Chapter 17) if the handler asked. Spawn (§13) and the
// end check (§19) are available via addLemming / counters but not driven here.

import { Lemming, ACTION } from './lemming.js';
import { HANDLERS, SELF_ADVANCE } from './handlers.js';
import { objectInteraction } from './object_interaction.js';
import { advanceObject } from './interactive_object.js';
import { advanceFrame } from './animation.js';
import { assignSkill } from './assignment.js';

/** @typedef {import('./terrain.js').Terrain} Terrain */
/** @typedef {import('./object_map.js').ObjectMap} ObjectMap */

/**
 * The frame pump (Chapter 12): holds the world (terrain buffer + object map), the
 * lemming list, and the population counters, and advances them one frame at a time.
 * Headless (§1.6) — no canvas, no wall-clock; the renderer reads this state after
 * `step()` returns.
 */
export class Simulation {
  /**
   * @param {Terrain} terrain the collision-geometry pixel buffer (Chapter 3)
   * @param {ObjectMap} objectMap the trigger/steel grid (Chapter 4)
   * @param {Array<{animType:number, frameCount:number, startFrame:number, triggered:boolean, frame:number}>} [objects]
   *   the interactive-object runtime list (§17.2) — traps and other animated
   *   objects the trap value in the object map indexes. Empty on stages with none.
   */
  constructor(terrain, objectMap, objects = []) {
    this.terrain = terrain;
    this.objectMap = objectMap;
    /** @type {Array} interactive objects in placement order (§17.2) — trap runtime */
    this.objects = objects;
    /** @type {?import('./spawner.js').Spawner} the Chapter-13 spawner, or null for
     * directly-placed demos. When set, step() runs frame phases 3–4 (§12.1). */
    this.spawner = null;
    /** @type {Lemming[]} list order = spawn order; index is identity (§11.1, §12.3) */
    this.lemmings = [];
    this.frame = 0;
    // Population counters (§11.3): the invariant is out = released − removed.
    this.released = 0;
    this.out = 0;
    this.saved = 0;
    this.removed = 0;

    // ── Chapter 19 state (nuke, clock, end conditions & scoring). Everything here is
    // inert until configureLevel() / armNuke() turn it on, so the isolated demos —
    // which never call them — keep the exact phase-3–7 behaviour above. ──
    /** @type {boolean} whether phase-1 end conditions run (a scored level, §19.2) */
    this.endConditionsEnabled = false;
    /** @type {boolean} the level has finished (§19.5) — step() then does nothing */
    this.finished = false;
    /** @type {?object} the §19.6 result record, computed once at finish */
    this.result = null;
    /** @type {boolean} the last end was a time-up (§19.2) */
    this.timeUp = false;
    // Scoring inputs (§19.6): maxLemmings === the level's lemmingsCount (§11.3).
    this.maxLemmings = 0;
    this.rescueCount = 0;
    // The level clock (§19.1): frames → seconds at 17 frames/second (§2.7).
    this.clockEnabled = false;
    this.minutes = 0;
    this.seconds = 0;
    this.clockFrame = 0;
    // Nuke (§19.3): armed once, then marches one fuse/frame up the list.
    this.isNuking = false;
    this.nukeIndex = 0;
    /** @type {number} §19.2 explosion hold — end deferred while > 0; set 52 per explosion */
    this.particleFinishTimer = 0;
    /** @type {boolean} §12.5 pause gate — phases 3–8 frozen while true */
    this.paused = false;
    /** @type {number} §13.6 held release-rate change, applied at phase 2 */
    this.pendingRateDelta = 0;
    /** @type {Record<string,number>} §11.3 skill budgets, keyed by SKILL.* value */
    this.budget = {};
  }

  /**
   * Direct placement — what the isolated demo stages use (cleaner than waiting out
   * the frame-35 + countdown spawn timing). Appends to the end of the list, so list
   * order stays spawn order (§12.3). A spawned lemming starts Falling by default,
   * exactly as the entrance releases it (§13.5).
   * @param {number} x foot x
   * @param {number} y foot y
   * @param {number} [direction=1] +1 right, −1 left
   * @param {import('./lemming.js').Action} [action='falling'] initial action
   * @returns {Lemming} the created lemming
   */
  addLemming(x, y, direction = 1, action = ACTION.FALLING) {
    return this._append(new Lemming(x, y, direction, action));
  }

  /**
   * Attach a Chapter-13 spawner. Once attached, step() runs the opening timeline
   * (§13.1) and the release stream (§13.2–13.5) each frame instead of relying on
   * direct addLemming placement.
   * @param {import('./spawner.js').Spawner} spawner
   * @returns {void}
   */
  setSpawner(spawner) { this.spawner = spawner; }

  /**
   * Turn on the Chapter-19 level layer: end conditions, the clock, scoring inputs and
   * the skill budgets. Until this is called the sim is a bare frame pump (the isolated
   * demos depend on that). `maxLemmings` is the level's `lemmingsCount` (§11.3); the
   * clock is optional — a level with no limit passes `timeLimitMinutes = null`.
   * @param {{maxLemmings:number, rescueCount:number, timeLimitMinutes:?number,
   *          budget?:Record<string,number>}} cfg
   * @returns {void}
   */
  configureLevel({ maxLemmings, rescueCount, timeLimitMinutes = null, budget = {} }) {
    this.endConditionsEnabled = true;
    this.maxLemmings = maxLemmings;
    this.rescueCount = rescueCount;
    this.budget = { ...budget };
    if (timeLimitMinutes != null) {
      this.clockEnabled = true;
      this.minutes = timeLimitMinutes;
      this.seconds = 0;
      this.clockFrame = 0;
    }
  }

  /**
   * Phase-8 input (§12.1) — a held release-rate change, applied at phase 2 of the next
   * frame (§13.6). Accumulates, so repeated presses stack.
   * @param {number} delta +1 faster / −1 slower
   * @returns {void}
   */
  requestRateChange(delta) { this.pendingRateDelta += delta; }

  /**
   * Phase-8 input — set the pause gate (§12.5). While paused, phases 3–8 do not run; a
   * release-rate change (phase 2) still applies.
   * @param {boolean} paused
   * @returns {void}
   */
  setPaused(paused) { this.paused = paused; }

  /**
   * Phase-8 input — arm the nuke (§19.3). Idempotent: a running nuke cannot be re-armed
   * or un-armed. Arming stops the release stream (§19.4). The two-press safety is a
   * panel concern (§25); this is the single arm action the panel drives.
   * @returns {void}
   */
  armNuke() {
    if (this.isNuking) return;
    this.isNuking = true;
    this.nukeIndex = 0;
  }

  /**
   * Phase-8 input — apply a skill assignment (§18) to the lemming the panel's cursor
   * hit-test chose (§18.2). Spends the budget and applies the effect only if the
   * §18.4–18.6 preconditions hold; returns whether it succeeded.
   * @param {Lemming} lem the target lemming
   * @param {string} skill one of SKILL.*
   * @returns {boolean}
   */
  assign(lem, skill) {
    return assignSkill(lem, skill, { objectMap: this.objectMap, budget: this.budget });
  }

  /**
   * Append a lemming to the tail of the list (spawn order = list order, §12.3) and
   * move the population counters: released and out both +1 (§11.3). Shared by direct
   * placement (addLemming) and the spawner's release (§13.5).
   * @param {Lemming} lem
   * @returns {Lemming}
   */
  _append(lem) {
    lem.listIndex = this.lemmings.length;
    this.lemmings.push(lem);
    this.released += 1;
    this.out += 1;
    return lem;
  }

  /**
   * Advance one frame through the §12.1 phase order. Phase 1 (end check) runs first so
   * it reads the counters as the previous frame left them (§12.2 — the one-frame lag);
   * the pause gate (§12.5) freezes phases 3–8; the Chapter-19 phases (end check, clock,
   * nuke) stay inert until configureLevel() / armNuke() enable them, so the isolated
   * demos see the unchanged phase-3–7 pump.
   * @returns {void}
   */
  step() {
    // Phase 1 (§19.2, §12.2) — end check first, on the previous frame's counters. If it
    // finishes the level, no further phase runs this frame or ever after (§19.5).
    if (this._endCheck()) return;

    // Phase 2 (§13.6) — apply the player's held release-rate change. Runs before the
    // pause gate, so the rate can be adjusted while paused (§12.5).
    if (this.pendingRateDelta !== 0 && this.spawner) {
      this.spawner.adjustRate(this.pendingRateDelta);
      this.pendingRateDelta = 0;
    }

    // Pause gate (§12.5) — while paused, phases 3–8 do not run.
    if (this.paused) return;

    // Phase 3 (§12.1) — advance time: age the explosion-hold timer, bump the frame
    // counter, tick the level clock (§19.1), and run the spawner's scripted opening
    // (entrances open at frame 35, §13.1).
    if (this.particleFinishTimer > 0) this.particleFinishTimer -= 1;
    this.frame += 1;
    this._tickClock();
    if (this.spawner) this.spawner.advanceTime(this.frame);

    // Phase 4 (§13.2–13.5) — release one lemming, unless a nuke has stopped the stream
    // (§19.4). Appended BEFORE the lemming loop so §13.5 holds: the fresh lemming is
    // processed by phase 5 this same frame, at the list tail.
    if (this.spawner && !this.isNuking) {
      const spawned = this.spawner.step(this.released);
      if (spawned) this._append(spawned);
    }

    // Phase 5 — process every lemming, in strict list order (§12.3). Per-lemming
    // sub-order: particle timer → skip removed → fuse → handler → object interaction.
    for (const lem of this.lemmings) {
      // §12.3 step 1 — advance the post-explosion particle animation (runs even for
      // the removed, exploded lemming).
      if (lem.particleTimer > 0) lem.particleTimer -= 1;

      // §12.3 step 2 — a removed lemming does nothing further.
      if (lem.isRemoved) continue;

      // §12.3 step 3 — the bomber/nuke fuse: count down, and on reaching 0 transition
      // to Ohnoing (or straight to Exploding if airborne/floating/drowning), then skip
      // the rest of this lemming's processing this frame.
      if (lem.explosionTimer > 0) {
        lem.explosionTimer -= 1;
        if (lem.explosionTimer === 0) {
          const airborne = lem.action === ACTION.FALLING || lem.action === ACTION.FLOATING || lem.action === ACTION.DROWNING;
          lem.transition(airborne ? ACTION.EXPLODING : ACTION.OHNOING);
          continue;
        }
      }

      // §12.4 — advance the animation frame BEFORE the handler runs (§15.0), except
      // for self-advancing actions (digging) that manage `frame` themselves. A
      // transition inside the handler resets frame to 0, overriding this advance.
      if (!SELF_ADVANCE.has(lem.action)) {
        const adv = advanceFrame(lem.frame, { frames: lem.frames, loop: lem.loop });
        lem.frame = adv.frame;
        lem.endOfAnimation = adv.endOfAnimation;
      }

      // Run the current action's handler; it returns whether to check objects.
      const handler = HANDLERS[lem.action];
      const checkObjects = handler ? handler(lem, this.terrain, this.objectMap) : true;

      // §17 — object interaction at the new position, if the handler asked and the
      // lemming is still in play. Passes the interactive-object list so a trap
      // trigger (§17.4) can find and busy the trap the foot cell indexes.
      if (checkObjects && !lem.isRemoved) objectInteraction(lem, this.objectMap, this.objects);

      // Reconcile counters when a lemming leaves play. Removal (§15.19) decrements
      // out and increments removed; the exit path (§15.18) also counts a save; an
      // explosion (§15.14, `isExploded`) opens the §19.2 explosion hold so the end
      // check waits for the particle scatter to finish.
      if (lem.isRemoved) {
        this.out -= 1;
        this.removed += 1;
        if (lem.action === ACTION.EXITING) this.saved += 1;
        if (lem.isExploded) this.particleFinishTimer = 52;
      }
    }

    // Phase 6 (§19.3) — the nuke sequence: light the next lemming's fuse, one per frame.
    this._nukeAdvance();

    // Phase 7 (§17.5) — advance every interactive object's animation. For a trap
    // this is the re-arm: its frame advances only while triggered and clears the
    // flag on wrap, ending the busy window opened by the §17.4 trigger above.
    for (const obj of this.objects) advanceObject(obj);
  }

  /**
   * Phase 1 (§19.2) — test the four end conditions against the current counters, gated
   * by the explosion hold. On the first that holds, mark the level finished and compute
   * the result (§19.6). Returns whether the level is (now or already) finished, in which
   * case step() runs no further phases (§19.5). Inert until configureLevel().
   * @returns {boolean}
   */
  _endCheck() {
    if (!this.endConditionsEnabled) return false;
    if (this.finished) return true;
    if (this.particleFinishTimer > 0) return false;      // §19.2 — hold while explosions finish
    const timeUp = this.clockEnabled && this.minutes <= 0 && this.seconds <= 0;
    const allSaved = this.saved >= this.maxLemmings;      // §19.2 — everyone who counts saved
    const noneLeft = this.removed >= this.maxLemmings;    // §19.2 — no lemmings remain in play
    const nukeDone = this.isNuking && this.out === 0;     // §19.2 — a nuke has finished
    if (timeUp || allSaved || noneLeft || nukeDone) {
      this.finished = true;
      this.timeUp = timeUp;
      this.result = this._computeResult();
      return true;
    }
    return false;
  }

  /**
   * Phase 3 (§19.1) — one game-second every 17 frames (§2.7); borrow minutes, floored at
   * 0:00. Inert until configureLevel() sets a limit.
   * @returns {void}
   */
  _tickClock() {
    if (!this.clockEnabled) return;
    this.clockFrame += 1;
    if (this.clockFrame >= 17) {
      this.clockFrame = 0;
      if (this.seconds > 0) this.seconds -= 1;
      else if (this.minutes > 0) { this.minutes -= 1; this.seconds = 59; }
      // else already 0:00 — floored (§19.1)
    }
  }

  /**
   * Phase 6 (§19.3) — advance the nuke one step: skip removed lemmings, then light the
   * next lemming's fuse (`explosionTimer = 79`) unless it already has one or is
   * splatting/exploding. One fuse per frame ⇒ the staggered cascade. Inert until armed.
   * @returns {void}
   */
  _nukeAdvance() {
    if (!this.isNuking) return;
    while (this.nukeIndex < this.lemmings.length && this.lemmings[this.nukeIndex].isRemoved) {
      this.nukeIndex += 1;                                // skip the already-removed
    }
    if (this.nukeIndex >= this.lemmings.length) return;   // sequence done — all fuses lit
    const lem = this.lemmings[this.nukeIndex];
    if (lem.explosionTimer === 0 && lem.action !== ACTION.SPLATTING && lem.action !== ACTION.EXPLODING) {
      lem.explosionTimer = 79;                            // §19.3 / §15.13 — the 79-frame fuse
    }
    this.nukeIndex += 1;
  }

  /**
   * §19.6 — the verdict: two truncating-division percentages. done% is the saved count
   * over the denominator (normally `lemmingsCount`; the §19.7 nuke-glitch variant is not
   * implemented), target% the rescue requirement over `lemmingsCount`; `won` is done% ≥
   * target%. Carries the raw counts for the results screen (Chapter 23).
   * @returns {object}
   */
  _computeResult() {
    const lemmingsCount = this.maxLemmings;
    const targetPct = lemmingsCount > 0 ? Math.floor(this.rescueCount * 100 / lemmingsCount) : 0;
    const donePct = lemmingsCount > 0 ? Math.floor(this.saved * 100 / lemmingsCount) : 0;
    return {
      saved: this.saved, rescueCount: this.rescueCount, lemmingsCount,
      targetPct, donePct, won: donePct >= targetPct, timeUp: this.timeUp,
    };
  }

  /**
   * The lemmings still in play (for the renderer).
   * @returns {Lemming[]}
   */
  liveLemmings() { return this.lemmings.filter((l) => !l.isRemoved); }

  /**
   * The live-lemming count — the `out` counter (§11.3).
   * @returns {number}
   */
  liveCount() { return this.out; }

  /**
   * The level clock as a display string (§19.1, §22.3) — minutes-seconds, seconds
   * zero-padded to two digits.
   * @returns {string} e.g. "4-07"
   */
  clockString() { return `${this.minutes}-${String(this.seconds).padStart(2, '0')}`; }

  /**
   * The running saved proportion (§19.6 done%), for the panel's IN / home readout
   * (§22.3). Uses the same truncating division as the final verdict.
   * @returns {number} 0…100
   */
  savedPercent() { return this.maxLemmings > 0 ? Math.floor(this.saved * 100 / this.maxLemmings) : 0; }
}
