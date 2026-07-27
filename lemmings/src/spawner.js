// lemmings/src/spawner.js
//
// The spawner (design_spec Chapter 13) — the opening timeline and the steady stream
// of lemmings from the entrances. Fills frame phases 3–4 (§12.1). Pure integer
// counters, no randomness (§1.6): the same level + release-rate inputs produce the
// same lemming at the same frame from the same entrance, every time.
//
// This is engine code, not demo code. The Simulation drives it (simulation.js);
// the ENTRANCES and level counts are level data — a real level supplies them via
// the importer (Chapter 6), a synthetic demo authors them directly. The mechanism
// is identical either way.

import { Lemming, ACTION } from './lemming.js';

/** @typedef {{x: number, y: number}} Entrance an entrance object's stored top-left (§13.5) */

// §13.1 — the entrances open at this absolute frame; before it, no release and the
// countdown does not move. (Frames 15/34/55 are sound-only, Chapter 24.)
export const ENTRANCES_OPEN_FRAME = 35;

// §13.2 — the release countdown's level-start value; the first lemming appears this
// many frames after the entrances open (⇒ frame 35 + 20 = 55).
export const INITIAL_COUNTDOWN = 20;

/**
 * §13.3 — frames between releases as a function of the current release rate.
 * Integer division truncates, so rates 98 and 99 give the same interval (4).
 * @param {number} rate 1..99
 * @returns {number} interval in frames (99→4 fastest, 50→28, 1→53 slowest)
 */
export function releaseInterval(rate) {
  return Math.floor((99 - rate) / 2) + 4;
}

/**
 * §13.4 — the four-slot entrance-rotation table chosen once at level start from the
 * entrance count. Releases always index it by `released mod 4`, whatever the count.
 * @param {number} entranceCount how many entrances the level has
 * @returns {number[]} four entrance indices
 */
export function orderTable(entranceCount) {
  if (entranceCount === 2) return [0, 1, 0, 1];   // ABAB
  if (entranceCount === 3) return [0, 1, 2, 1];   // ABCB — the 2nd releases twice as often
  if (entranceCount === 4) return [0, 1, 2, 3];   // ABCD
  return [0, 0, 0, 0];                             // 1, or >4 ⇒ all from the first (AAAA)
}

/**
 * The spawner: holds Chapter 13's global state (§11.3 — `entrancesOpened`,
 * `nextSpawnCountdown`, `currentReleaseRate`, `maxLemmings`) and advances phases 3–4
 * each frame. Constructed once per level; reset by rebuilding.
 */
export class Spawner {
  /**
   * @param {{
   *   entrances: Entrance[],
   *   maxLemmings: number,
   *   releaseRate: number,
   *   floorRate?: number,
   *   initialCountdown?: number,
   *   intervalOverride?: number|null,
   * }} config
   *   `floorRate` is the level's own rate — the §13.6 floor the player can't go below
   *   (defaults to `releaseRate`). `intervalOverride`, when set, replaces the §13.3
   *   formula with a fixed interval (synthetic — a demo knob, not a real level value).
   */
  constructor(config) {
    /** @type {Entrance[]} */
    this.entrances = config.entrances;
    /** @type {number} how many lemmings this level releases in total (§11.3) */
    this.maxLemmings = config.maxLemmings;
    /** @type {number} the §13.6 floor — the level's own release rate */
    this.floorRate = config.floorRate ?? config.releaseRate;
    /** @type {number} live release rate, clamped to [floorRate, 99] */
    this.rate = clampRate(config.releaseRate, this.floorRate);
    /** @type {number|null} a synthetic fixed interval, or null to derive from rate */
    this.intervalOverride = config.intervalOverride ?? null;
    /** @type {number} §13.2 — frames until the next release; starts at 20 */
    this.countdown = config.initialCountdown ?? INITIAL_COUNTDOWN;
    /** @type {boolean} §13.1 — set true at frame 35 */
    this.entrancesOpened = false;
    /** @type {number[]} §13.4 — the rotation table, fixed at construction */
    this.order = orderTable(this.entrances.length);
  }

  /**
   * §13.3 — the interval to use for the next release: the synthetic override if set,
   * else the formula from the current rate. Recomputed at each release, so a rate
   * change takes effect from the next release onward (§13.6).
   * @returns {number}
   */
  interval() {
    return this.intervalOverride != null ? this.intervalOverride : releaseInterval(this.rate);
  }

  /**
   * §13.6 (frame phase 2) — apply a held release-rate change, clamped to
   * [floorRate, 99]. The level's own rate is the floor: the player can raise the
   * rate to 99 or lower it back to the designer's value, never below.
   * @param {number} delta +1 to speed up, −1 to slow down
   * @returns {void}
   */
  adjustRate(delta) {
    this.rate = clampRate(this.rate + delta, this.floorRate);
  }

  /**
   * §13.1 (frame phase 3) — open the entrances at frame 35. Idempotent.
   * @param {number} frame the current absolute frame (§2.6)
   * @returns {void}
   */
  advanceTime(frame) {
    if (!this.entrancesOpened && frame >= ENTRANCES_OPEN_FRAME) this.entrancesOpened = true;
  }

  /**
   * §13.2 / §13.4–13.5 (frame phase 4) — run the release countdown and, when it hits
   * 0, reset the interval and release one lemming (unless the level is full, §13.7).
   * Decrement-then-test is normative. Returns the new lemming to append, or null.
   *
   * The decrement runs on EVERY frame the entrances are open, INCLUDING frame 35
   * itself — phase 3 opens them before this phase-4 call in the same frame (§12.1).
   * So with countdown 20 the first lemming is released on frame **54**: frame 35 is
   * decrement #1, and the twenty counts span frames 35..54 (§13.2).
   * @param {number} released how many lemmings have been released so far (§11.3)
   * @returns {Lemming|null}
   */
  step(released) {
    if (!this.entrancesOpened) return null;    // §13.1 — countdown frozen until open

    this.countdown -= 1;                        // §13.2 — decrement first…
    if (this.countdown !== 0) return null;     // …release only when it reaches exactly 0
    this.countdown = this.interval();          // reset for the next release (§13.3)

    if (released >= this.maxLemmings) return null;   // §13.7 — level full, stream stops

    const e = this.entrances[this.order[released % 4]];             // §13.4 — whose turn
    return new Lemming(e.x + 24, e.y + 14, 1, ACTION.FALLING);      // §13.5 — the released lemming
  }
}

/** Clamp a release rate to the §13.6 window [floor, 99]. */
function clampRate(rate, floor) {
  return Math.max(floor, Math.min(99, rate));
}
