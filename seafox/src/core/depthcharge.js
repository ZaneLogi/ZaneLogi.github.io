// seafox/src/core/depthcharge.js
//
// The depth charge -- type 18 (design_spec § 13.7).
//
// Period 1: it runs every tick, unlike its parent, which runs one tick in five.
//
// **The fuse is the player's depth at the moment of release**, sampled once and
// never updated (§ 13.7.2). Its handler then does nothing but sink toward that
// depth and detonate on arrival -- so **diving after the release defeats it, and
// holding depth does not**. That one sentence is the whole tactical content of
// the Destroyer.
//
// Detonation raises the same flag a hit raises, so a charge that reaches the
// player's depth and a charge that is shot die by exactly the same path
// (§ 13.7.6).

import { TYPE, CLASS } from './types.js';
import { splash, bubble } from './trails.js';
import { playSound, SOUND } from './sound.js';

/** @type {number} § 13.7.3: the arc index starts here and steps down by 4. */
const ARC_START = 28;

/**
 * The arc (§ 13.7.3), indexed by `arcIndex / 4 - 1` so index 28 is the last
 * entry. Seven ticks: **+13 px across and +4 down**, ending at row 35.
 *
 * Five steps of pure horizontal travel, then the fall begins and steepens -- a
 * thrown parabola, the trajectory of something rolled off the stern of a moving
 * ship rather than dropped.
 *
 * The final step's **dX of +1 is the one odd horizontal step in the game whose
 * effect a player can see** -- not on the arc itself, which renders white at
 * either parity, but on what it lands on: it puts the charge on an odd column,
 * and that fixes the hue of the sinking form it swaps to on the very next tick
 * (§ 6.5). Drop the +1 and the charge sinks in the other colour of its pair.
 *
 * @type {{dx: number, dy: number}[]}
 */
const ARC = [
  { dx: 1, dy: 3 },     // index 4  -- the last step, and the odd one
  { dx: 2, dy: 1 },     // index 8
  { dx: 2, dy: 0 },     // index 12
  { dx: 2, dy: 0 },     // index 16
  { dx: 2, dy: 0 },     // index 20
  { dx: 2, dy: 0 },     // index 24
  { dx: 2, dy: 0 },     // index 28 -- the first
];

/** @type {number} the row the arc ends on, where the charge enters the water. */
export const WATER_ROW = 35;

/** @type {number} § 13.7.5: sinking speed, 2 px per tick straight down. */
const SINK_STEP = 2;

/** @type {number} § 13.7.5: a bubble every this many ticks. */
const BUBBLE_PERIOD = 4;

/** § 13.11: removed if the wander carries it outside this span. */
const SINK_BOUNDS = { minX: 24, maxX: 307 };

/**
 * Release a depth charge from a Destroyer (§ 13.7.1). Three gates, in order.
 *
 * Gate 1 is **zero in mission 1** (§ 8.2), so a mission-1 Destroyer crosses the
 * screen and drops nothing -- which means a player meets the depth charge in the
 * title-screen demo before ever meeting it in a game.
 *
 * @param {Object} session
 * @param {number} parentSlot the Destroyer's slot
 * @returns {boolean} whether a charge was released, so the caller knows whether
 *   to reload its countdown -- a failed gate must NOT reload (§ 12.2)
 */
export function releaseDepthCharge(session, parentSlot) {
  const parent = session.entities.slots[parentSlot];

  // 1. The global live count against the mission cap.
  if (session.entities.counts[CLASS.DEPTH_CHARGE] >= session.caps[CLASS.DEPTH_CHARGE]) {
    return false;
  }
  // 2. The Destroyer must not yet have reached the left screen edge. This is a
  //    SCREEN-EDGE TEST, NOT AIMING -- it may release anywhere else on its run.
  if (parent.x <= 28) return false;

  const slot = session.entities.alloc(TYPE.DEPTH_CHARGE);
  const e = session.entities.slots[slot];
  e.x = parent.x + 18;                    // row 31, from a hull on row 30
  e.y = parent.y + 1;
  e.sprite = 'chargeArcing';
  e.updatePeriod = 1;
  e.updateCountdown = 1;

  e.scratch0 = ARC_START;                 // arc index, steps down by 4
  // The fuse: the player's Y at THIS moment, and never updated again.
  const playerSlot = session.playerSlot;
  e.scratch1 = playerSlot === -1 ? 0 : session.entities.slots[playerSlot].y;
  // Two generator draws, in this order (§ 13.7.3): the lateral wander direction
  // and the wander period. Both are SEEDED AT DROP TIME and the period is not
  // re-drawn -- § 13.7.5 reloads the countdown from the seeded value, so a
  // charge takes exactly two draws in its whole life. Re-drawing per wander
  // would consume the shared generator differently and shift every later random
  // decision in the game (§ 5.6).
  //
  // OPEN: § 13.7.3 says the period is "2-16 ticks" without giving the
  // arithmetic, and 15 values does not fit the `base + (draw & 15)` idiom the
  // spawners use. `2 + (draw & 14)` hits both stated endpoints and is even
  // throughout; the draw COUNT is the same whichever reading is right, so no
  // generator position depends on this. Flagged rather than silently chosen.
  //
  // The direction samples bit 1, not bit 0: § 5.4 makes bit 0 the one bit that
  // carries nothing forward, and § 8.4 pins the game's only specified coin flip
  // to bit 1 for exactly that reason.
  e.scratch2 = ((session.rng.step() >> 1) & 1) ? 2 : -2;
  e.scratch3 = 2 + (session.rng.step() & 14);   // the period, seeded once
  e.animLastFrame = e.scratch3;                 // the countdown to the next wander
  session.entities.countSpawn(TYPE.DEPTH_CHARGE);
  return true;
}

/**
 * The depth charge's update (§ 13.7).
 * @param {Object} session
 * @param {number} slot
 * @returns {void}
 */
export function updateDepthCharge(session, slot) {
  const e = session.entities.slots[slot];

  if (e.removalRequested) {
    session.entities.confirmRemoval(slot);
    return;
  }
  if (e.firstUpdate) {
    e.firstUpdate = false;
    e.updateCountdown = e.updatePeriod;
    return;
  }

  if (e.scratch0 > 0) arcStep(session, e);
  else sinkStep(session, e);

  // § 13.7.2: the fuse test runs on EVERY tick including the arc, but the
  // release row of 31 is always above any reachable fuse depth -- the player is
  // clamped to 50-175 -- so it can only ever fire during the sink.
  if (e.y >= e.scratch1) detonate(e);

  e.updateCountdown = e.updatePeriod;
}

/**
 * One step of the thrown arc (§ 13.7.3), and the water entry that ends it.
 * @param {Object} session
 * @param {Object} e an Entity
 * @returns {void}
 */
function arcStep(session, e) {
  const step = ARC[(e.scratch0 / 4) - 1];
  e.x += step.dx;
  e.y += step.dy;
  e.scratch0 -= 4;

  if (e.scratch0 === 0) {
    // § 13.7.4, once: the sprite swaps to the sinking form, three spray dots go
    // up, the splash sound is queued and the bubble counter is set to 4.
    e.sprite = 'chargeSinking';
    // § 15.6: three dots thrown UPWARD, not backward. The splash sound is
    // queued immediately behind them (§ 18.6, sound 0) -- the only sound this
    // entity makes before it dies, and note it is a different sound from the
    // one its death emits (sound 6, from the type's row).
    splash(session, e.x + 3, e.y);
    playSound(session, SOUND.SPLASH);
    e.animFrame = BUBBLE_PERIOD;          // the bubble counter
  }
}

/**
 * Sinking (§ 13.7.5): 2 px per tick straight down, with a lateral wander once
 * every wander-period ticks -- so its horizontal step is zero on most ticks.
 *
 * This type spends the two animation fields on counters rather than on frames,
 * which § 4.2 permits: `animFrame` is the bubble counter and `animLastFrame` the
 * wander countdown. Both are re-purposed by the death sequence when it starts,
 * and by then neither is needed.
 *
 * From row 35 to a fuse depth of 50 is 8 ticks; to 175 it is 70.
 * @param {Object} session
 * @param {Object} e an Entity
 * @returns {void}
 */
function sinkStep(session, e) {
  e.y += SINK_STEP;

  e.animLastFrame -= 1;
  if (e.animLastFrame <= 0) {
    e.x += e.scratch2;
    e.animLastFrame = e.scratch3;       // reload from the seeded period, no draw
  }

  e.animFrame -= 1;
  if (e.animFrame <= 0) {
    e.animFrame = BUBBLE_PERIOD;
    bubble(session, e.x + 3, e.y);        // § 15.5, every 4 ticks
  }

  if (e.x < SINK_BOUNDS.minX || e.x > SINK_BOUNDS.maxX) e.removalRequested = true;
}

/**
 * Reaching the fuse depth (§ 13.7.6). This raises the same flag a hit raises, so
 * a charge that arrives and a charge that is shot die by exactly the same path.
 * @param {Object} e an Entity
 * @returns {void}
 */
function detonate(e) {
  e.stateChangePending = true;
}
