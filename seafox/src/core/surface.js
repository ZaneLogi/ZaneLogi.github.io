// seafox/src/core/surface.js
//
// The three surface classes of design_spec § 13.6 -- merchant ship (9), hospital
// ship (8) and Destroyer (17).
//
// **All three ride lanes the player cannot reach** (§ 2.4.1) and have nothing to
// do but exist. The player's ceiling is row 50, twelve rows below the waterline
// and thirty-four below the lowest of these lanes, so the submarine itself can
// never touch any of them and exactly one weapon in the game can -- the vertical
// torpedo, since the horizontal one stops at row 45.
//
// Each is step 2 at a different period, and that is the whole difference in how
// they feel: 7 for the merchant, 3 for the hospital ship, 5 for the Destroyer,
// giving 0.29, 0.67 and 0.40 px per tick (§ 2.7.2). **Surface traffic is the
// slowest thing on screen because it is cargo, not threat.**
//
// The exits are not uniform -- 307 here, other numbers elsewhere -- and § 13.11
// is explicit that the differences are per class rather than transcription noise.

import { TYPE } from './types.js';
import { wake } from './trails.js';
import { releaseDepthCharge } from './depthcharge.js';

/** Periods, from § 2.7.1. Speed is step / period, never step (§ 2.7). */
export const SURFACE_PERIOD = { merchant: 7, hospitalShip: 3, destroyer: 5 };

/** @type {number} every surface class moves 2 px per update (§ 2.7.2). */
const SURFACE_STEP = 2;

/** @type {number} § 13.11: the right-travelling classes leave past here. */
const RIGHT_EXIT = 307;

/** @type {number} § 13.7.1: a Destroyer's countdown between drops, in its own updates. */
const DEPTH_CHARGE_RELOAD = 10;

/**
 * Merchant ship -- type 9 (§ 13.6.1).
 *
 * Step 2, period 7: **0.29 px per tick, the longest life of anything in the
 * game** at about 1,075 ticks on screen. Left to right, row 10, roster-driven.
 *
 * It is the only class whose score is mission-scaled and the only class that
 * counts toward the quota, and it carries its roster slot -- which is what lets
 * its death stamp the roster and decrement the kill counter (Chapter 14).
 *
 * @param {Object} session
 * @param {number} slot
 * @returns {void}
 */
export function updateMerchant(session, slot) {
  const e = session.entities.slots[slot];
  if (e.removalRequested) {
    // The roster record is deliberately NOT returned to available here.
    //
    // § 12.5 gives status exactly three values and only three transitions:
    // available -> in-flight at spawn, in-flight -> sunk by the collision
    // response, and all ten back to available at the start of every mission.
    // Nothing returns a record when its ship merely leaves the screen, and
    // "ten records, a quota of ten, ONE SPAWN EACH" says so directly.
    //
    // The consequence is severe and appears to be the design: a merchant that
    // crosses safely is gone for the mission, so a quota of ten against a roster
    // of ten means **every escape makes the mission unwinnable**. Returning the
    // record here would be inventing a fourth transition to soften that.
    session.entities.confirmRemoval(slot);
    return;
  }
  if (e.firstUpdate) {
    e.firstUpdate = false;
    e.updatePeriod = SURFACE_PERIOD.merchant;
    e.updateCountdown = e.updatePeriod;
    return;
  }
  e.x += SURFACE_STEP;
  wake(session, e, true);        // § 15.5: 7 px LEFT -- it travels right
  if (e.x > RIGHT_EXIT) e.removalRequested = true;
  e.updateCountdown = e.updatePeriod;
}

/**
 * Hospital ship -- type 8 (§ 13.6.2).
 *
 * Step 2, period 3 -- 0.67 px per tick, left to right, row 20. **Lethal on
 * contact, scores nothing, and cannot be sunk.**
 *
 * Its own damage path is unreachable, and that is worth stating because the
 * handler looks protective and is not: it exempts only the vertical torpedo and
 * the unused ship slots and takes damage from everything else -- but nothing
 * else can get to row 20. The one entity that can physically reach it is the one
 * type forbidden from harming it (Chapter 14).
 *
 * **This is the difficulty curve.** Its cap is the only knob that ramps
 * monotonically (§ 8.3), so each mission puts more unsinkable obstacles in the
 * layer between the player and the ships that must be sunk: the one class you
 * must not attack is also the one used to obstruct you.
 *
 * @param {Object} session
 * @param {number} slot
 * @returns {void}
 */
export function updateHospitalShip(session, slot) {
  const e = session.entities.slots[slot];
  if (e.removalRequested) {
    session.entities.confirmRemoval(slot);
    return;
  }
  if (e.firstUpdate) {
    e.firstUpdate = false;
    e.updatePeriod = SURFACE_PERIOD.hospitalShip;
    e.updateCountdown = e.updatePeriod;
    return;
  }
  e.x += SURFACE_STEP;
  wake(session, e, true);        // § 15.5: 7 px LEFT -- it travels right
  if (e.x > RIGHT_EXIT) e.removalRequested = true;
  e.updateCountdown = e.updatePeriod;
}

/**
 * Destroyer -- type 17 (§ 13.6.3).
 *
 * Step 2, period 5 -- 0.40 px per tick, **right to left**, row 30, crossing in
 * about 770 ticks. Killable and worth 150, but it does **not** count toward the
 * quota: only mission-scaled types do.
 *
 * It is the only type with no collision response of its own (§ 7.2) -- it names
 * the generic handler, which takes damage and scores and does nothing else.
 *
 * Its depth-charge release is gated three ways (§ 13.7.1), and the second gate
 * is a **screen-edge test, not aiming**: it may release anywhere on its run
 * except once it has reached the left edge.
 *
 * @param {Object} session
 * @param {number} slot
 * @returns {void}
 */
export function updateDestroyer(session, slot) {
  const e = session.entities.slots[slot];
  if (e.removalRequested) {
    session.entities.confirmRemoval(slot);
    return;
  }
  if (e.firstUpdate) {
    e.firstUpdate = false;
    e.updatePeriod = SURFACE_PERIOD.destroyer;
    e.updateCountdown = e.updatePeriod;
    // § 4.2's warning made concrete: the Destroyer does NOT keep its step in the
    // first scratch field the way most moving types do -- that field holds this
    // drop cadence, and its step of 2 is a constant. Reading scratch0 as a step
    // here gives 10 px per update, five times too fast.
    e.scratch0 = DEPTH_CHARGE_RELOAD;
    return;
  }

  e.x -= SURFACE_STEP;
  wake(session, e, false);       // § 15.5: 29 px RIGHT -- it travels left
  // § 13.11: the left-travelling classes leave when their 16-bit X passes below
  // zero, which is what detects the crossing.
  if (e.x <= 0) {
    e.removalRequested = true;
    e.updateCountdown = e.updatePeriod;
    return;
  }

  // Gate 3 of § 13.7.1: a per-Destroyer countdown of 10. The Destroyer's period
  // is 5, so the real cadence is 50 TICKS between drops from one Destroyer.
  // Reloaded only on a successful drop -- a blocked one retries (§ 12.2).
  if (e.scratch0 > 0) e.scratch0 -= 1;
  if (e.scratch0 === 0 && releaseDepthCharge(session, slot)) {
    e.scratch0 = DEPTH_CHARGE_RELOAD;
  }

  e.updateCountdown = e.updatePeriod;
}

/** @type {Object<number, Function>} the three handlers, for dispatch.js. */
export const SURFACE_HANDLERS = {
  [TYPE.MERCHANT_SHIP]: updateMerchant,
  [TYPE.HOSPITAL_SHIP]: updateHospitalShip,
  [TYPE.DESTROYER]: updateDestroyer,
};
