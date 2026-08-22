// seafox/src/core/player.js
//
// The player -- type 0 (design_spec § 13.1) -- and the clamps of § 2.5.
//
// **The player is an ordinary entity in the ordinary array.** What makes it the
// player is narrow: a handful of code writes two velocity bytes, and everything
// downstream is generic. That seam is the entire mechanism by which one engine
// serves both the attract demo and a played game (§ 19.1) -- nothing below knows
// or cares whether the keyboard, a gamepad or the demo's bounce wrote the pair.
//
// The velocity pair lives on the SESSION, not on the entity: § 4.2 states the
// entity record has no velocity field, and § 19.1 makes the pair a single seam
// with exactly three writers, one active at a time.
//
// **The clamps live inside this handler, so they run every second tick**, not
// every tick. That is what gives the title-screen demo its half-speed cadence
// (§ 2.7.3) and it is what Oracle 3 (§ 20.4) measures.

import { TYPE } from './types.js';

/** @type {number} § 13.1: the player acts on one tick in two. */
export const PLAYER_PERIOD = 2;

/**
 * The player's clamps (§ 2.5). Whichever clamp is hit **zeroes that axis's
 * velocity** -- the sub stops against a wall rather than sliding along it.
 *
 * `maxX` is raised to 306 during the outro, which is how the sub leaves the
 * screen, and `minX` is relaxed to 0 during the mission fly-in (§ 11). Both live
 * on the session so those two sequences can move them.
 * @type {{minX: number, maxX: number, minY: number, maxY: number}}
 */
export const PLAYER_BOUNDS = { minX: 28, maxX: 280, minY: 50, maxY: 175 };

/** @type {{x: number, y: number}} § 11.1.1: a fresh submarine launches here. */
export const PLAYER_START = { x: 100, y: 100 };

/**
 * Where the demo's submarine begins (§ 20.4). Not the same as PLAYER_START:
 * the demo sub starts against the left clamp and low in the water, which is why
 * § 20.4's first interval differs from its steady state on both axes.
 * @type {{x: number, y: number}}
 */
export const DEMO_START = { x: 28, y: 160 };

/**
 * Create the player entity (§ 13.1): sprite, palette flip set, period 2, and the
 * alive flag raised.
 * @param {Object} session
 * @param {number} x
 * @param {number} y
 * @returns {number} the slot, which is 0 whenever the list was reset first
 */
export function spawnPlayer(session, x, y) {
  const slot = session.entities.alloc(TYPE.PLAYER);
  const e = session.entities.slots[slot];
  e.x = x;
  e.y = y;
  e.sprite = 'playerSubmarine';
  e.paletteFlip = true;
  e.updatePeriod = PLAYER_PERIOD;
  session.playerAlive = true;
  session.input.vx = 0;                   // § 10.5.1: spawned stationary
  session.input.vy = 0;
  return slot;
}

/**
 * The player's update, in the order § 13.1 gives it.
 * @param {Object} session
 * @param {number} slot
 * @returns {void}
 */
export function updatePlayer(session, slot) {
  const e = session.entities.slots[slot];

  // 1. Removal requested? Clear the alive flag -- THAT IS THE WHOLE OF DYING.
  //    Nothing else in the game writes this flag, which is why death reaches
  //    § 11.2's guard one tick after the hit that caused it.
  if (e.removalRequested) {
    session.playerAlive = false;
    e.removalRequested = false;
    e.removalConfirmed = true;
    return;
  }

  // 2. First update? Clear the flag, draw, DO NOT MOVE.
  if (e.firstUpdate) {
    e.firstUpdate = false;
    e.updateCountdown = e.updatePeriod;
    return;
  }

  // 3. Burn fuel -- gated on BOTH the round being live and a mission running
  //    (§ 16.2). The second gate is suspension 6 of § 10.5.2: the demo never
  //    runs dry. Chapter 16 is not ported; the gate is written out so the
  //    condition is not rediscovered as a single test later.
  if (session.roundLive && session.mission !== 0) {
    // burnFuel(session) -- § 16.2, 10 per 9 PLAYER UPDATES, which is 18 ticks
  }

  // 4. Move by the current velocity pair.
  e.x += session.input.vx;
  e.y += session.input.vy;

  // 5. Apply four clamps (§ 2.5), each zeroing its own axis.
  //
  //    STRICT inequalities. § 2.5 says only "whichever clamp is hit zeroes that
  //    axis's velocity", which does not distinguish `>` from `>=`; Oracle 3 does.
  //    Landing exactly on a bound leaves the velocity alone and the sub bounces
  //    on the following update instead -- with `>=` the horizontal bounces come
  //    out at 254 / 506 / 758 rather than § 20.4's 256 / 510 / 764.
  const b = session.playerBounds;
  if (e.x < b.minX) { e.x = b.minX; session.input.vx = 0; }
  if (e.x > b.maxX) { e.x = b.maxX; session.input.vx = 0; }
  if (e.y < b.minY) { e.y = b.minY; session.input.vy = 0; }
  if (e.y > b.maxY) { e.y = b.maxY; session.input.vy = 0; }

  // 6. Force X even, draw, reload the countdown.
  //
  //    § 2.5 makes the player's X parity normative: it spawns even and every
  //    step is +/-2, so this is a no-op in play -- but Chapter 13 has an object
  //    that spawns at a fixed offset from the player and depends on the parity,
  //    so the guarantee is enforced rather than assumed.
  e.x &= ~1;
  e.updateCountdown = e.updatePeriod;
}
