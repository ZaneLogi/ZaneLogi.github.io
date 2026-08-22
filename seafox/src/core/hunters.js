// seafox/src/core/hunters.js
//
// The enemy submarine (3) and its two children -- the magnetic mine (4) and the
// enemy torpedo (19). Together they are the game's whole projectile threat
// (design_spec § 13.3, § 13.4, § 13.5).
//
// **The two children are opposites and are best read as a pair:** the mine is
// laid without aiming and then follows the player forever; the torpedo is aimed
// carefully, fired once, and never looks again. *The mine corrects, the torpedo
// commits.*
//
// § 2.7.1 warns these two are easy to transpose, because the submarine launches
// both and their spawn code sits back to back, and each carries the other's
// plausible-looking numbers. Taken from their own entries:
//
//   * the **mine** is the slow homing one -- step 2, **period 9**, 0.22 px per
//     tick, the slowest-moving object in the game;
//   * the **torpedo** is the fast blind one -- step 3, period 1, 3 px per tick,
//     the fastest thing in the game except the avenger.
//
// A mine that steps every tick is nine times too fast and turns the slowest
// threat in the game into one of the quickest.

import { TYPE, CLASS } from './types.js';

/** Enemy submarine (§ 13.3). */
const SUB_STEP = 2;
const SUB_VERTICAL_RELOAD = 3;            // one pixel every third tick
const SUB_EXIT = 308;

/** Magnetic mine (§ 13.4). */
const MINE_STEP = 2;
export const MINE_PERIOD = 9;             // NOT 1 -- see the header
const MINE_RELOAD = 25;
const MINE_EXIT = 310;

/** Enemy torpedo (§ 13.5). */
const TORPEDO_STEP = 3;
const TORPEDO_FIRST_SHOT = 5;             // seeded at the submarine's spawn
const TORPEDO_RELOAD = 80;                // only on a SUCCESSFUL shot
const TORPEDO_DRIFT_PERIOD = 4;
const TORPEDO_ROWS = { min: 42, max: 171 };

/**
 * Enemy submarine -- type 3 (§ 13.3). Step 2, period 1.
 *
 * **Horizontally it does not steer at all**: it crosses at a flat 2 px per tick
 * in the direction fixed at spawn and never turns. **Vertically it closes on the
 * player's depth** by one pixel every third tick -- 0.33 px per tick against 2
 * across -- and **stops dead when level** rather than oscillating.
 *
 * So it converges far more slowly than it crosses, and a submarine spawning far
 * from the player's depth may cross the whole screen without ever reaching it.
 * It is a threat that has to be given time. Reading it as fixed-depth traffic
 * makes the game substantially less dangerous than it is (§ 13.10).
 *
 * @param {Object} session
 * @param {number} slot
 * @returns {void}
 */
export function updateEnemySubmarine(session, slot) {
  const e = session.entities.slots[slot];
  if (e.removalRequested) {
    session.entities.confirmRemoval(slot);
    return;
  }
  if (e.firstUpdate) {
    e.firstUpdate = false;
    e.scratch1 = SUB_VERTICAL_RELOAD;
    e.scratch2 = MINE_RELOAD;
    e.scratch3 = TORPEDO_FIRST_SHOT;      // so it shoots almost at once
    e.updateCountdown = e.updatePeriod;
    return;
  }

  e.x += e.scratch0;                      // the direction fixed at spawn
  if (e.x > SUB_EXIT || e.x <= 0) {
    e.removalRequested = true;
    e.updateCountdown = e.updatePeriod;
    return;
  }

  const playerSlot = session.playerSlot;
  if (playerSlot !== -1) {
    const player = session.entities.slots[playerSlot];

    e.scratch1 -= 1;
    if (e.scratch1 <= 0) {
      e.scratch1 = SUB_VERTICAL_RELOAD;
      if (player.y < e.y) e.y -= 1;
      else if (player.y > e.y) e.y += 1;
      // else: level -- do nothing. It stops dead rather than oscillating.
    }

    // The mine has NO GATE: a bare timer, laid without aiming.
    e.scratch2 -= 1;
    if (e.scratch2 <= 0 && launchMine(session, slot)) e.scratch2 = MINE_RELOAD;

    if (e.scratch3 > 0) e.scratch3 -= 1;
    if (e.scratch3 === 0 && launchEnemyTorpedo(session, slot, player)) {
      e.scratch3 = TORPEDO_RELOAD;
    }
  }

  e.updateCountdown = e.updatePeriod;
}

/**
 * Lay a magnetic mine (§ 13.3). Launch point is the parent's X **+ 30** -- the
 * stern of a 35 px hull steering left, so it is dropped behind.
 * @param {Object} session
 * @param {number} parentSlot
 * @returns {boolean} whether one was laid; a blocked attempt must not reload
 */
function launchMine(session, parentSlot) {
  if (session.entities.counts[CLASS.MAGNETIC_MINE] >= session.caps[CLASS.MAGNETIC_MINE]) {
    return false;
  }
  const parent = session.entities.slots[parentSlot];
  const slot = session.entities.alloc(TYPE.MAGNETIC_MINE);
  const e = session.entities.slots[slot];
  e.x = parent.x + 30;
  e.y = parent.y;
  e.sprite = 'magneticMine';
  e.updatePeriod = MINE_PERIOD;
  e.updateCountdown = MINE_PERIOD;
  session.entities.countSpawn(TYPE.MAGNETIC_MINE);
  return true;
}

/**
 * Magnetic mine -- type 4 (§ 13.4). **Step 2, period 9 -- 0.22 px per tick.**
 *
 * It homes on the player in **both** axes for its entire life: every ninth tick
 * it steps ±2 toward the player's current position. That is a drift rather than
 * a chase, which is what makes it survivable and what makes it inescapable if
 * ignored -- it never stops coming and it never expires.
 *
 * **Once the player is dead it switches to a straight rightward +2 at period 1**,
 * so it becomes nine times faster at the moment it stops mattering.
 *
 * It is the one type that never expires on its own: its limit of 310 is beyond
 * the drawable range, and since it homes rather than crosses it will normally
 * never approach it (§ 13.11).
 *
 * @param {Object} session
 * @param {number} slot
 * @returns {void}
 */
export function updateMagneticMine(session, slot) {
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

  const playerSlot = session.playerSlot;
  if (playerSlot === -1 || !session.playerAlive) {
    e.updatePeriod = 1;                   // nine times faster, and no longer homing
    e.x += MINE_STEP;
  } else {
    const player = session.entities.slots[playerSlot];
    if (player.x < e.x) e.x -= MINE_STEP;
    else if (player.x > e.x) e.x += MINE_STEP;
    if (player.y < e.y) e.y -= MINE_STEP;
    else if (player.y > e.y) e.y += MINE_STEP;
  }

  if (e.x > MINE_EXIT) e.removalRequested = true;
  e.updateCountdown = e.updatePeriod;
}

/**
 * Fire an enemy torpedo (§ 13.5.1). Two gates remain here; the countdown that is
 * gate 1 is the caller's.
 *
 * Gate 3 is the interesting one. From mission 3 onward the submarine always
 * enters from the right and travels left, so *the submarine's X must be at or
 * past the player's* reads as **shoot only while the target is still ahead of
 * me** -- and a submarine that has already passed the player stops firing for
 * the rest of its run.
 *
 * @param {Object} session
 * @param {number} parentSlot
 * @param {Object} player the player entity
 * @returns {boolean} whether a torpedo was fired
 */
function launchEnemyTorpedo(session, parentSlot, player) {
  if (session.entities.counts[CLASS.ENEMY_TORPEDO] >= session.caps[CLASS.ENEMY_TORPEDO]) {
    return false;
  }
  const parent = session.entities.slots[parentSlot];
  if (parent.x < player.x) return false;                // the firing solution

  const slot = session.entities.alloc(TYPE.ENEMY_TORPEDO);
  const e = session.entities.slots[slot];
  e.x = parent.x - 8;                     // ahead of the bow, on the centreline
  e.y = parent.y + 3;
  e.sprite = 'enemyTorpedo';
  e.updatePeriod = 1;
  e.updateCountdown = 1;

  // § 13.5.2 -- aimed ONCE, at launch, and never written again for the rest of
  // the shot's life. The torpedo leads where the player WAS when it left the
  // tube; dodge after it is fired and it sails past.
  if (player.y < e.y) e.scratch0 = -1;
  else if (player.y > e.y) e.scratch0 = 1;
  else e.scratch0 = 0;
  e.scratch1 = TORPEDO_DRIFT_PERIOD;

  session.entities.countSpawn(TYPE.ENEMY_TORPEDO);
  return true;
}

/**
 * Enemy torpedo -- type 19 (§ 13.5.3). 3 px per tick leftward: thirteen times
 * the mine's speed and half again the player's.
 *
 * It expires when it runs off the left edge -- roughly 100 ticks from launch, so
 * a torpedo that misses is gone well inside its parent's 80-tick reload.
 * @param {Object} session
 * @param {number} slot
 * @returns {void}
 */
export function updateEnemyTorpedo(session, slot) {
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

  e.x -= TORPEDO_STEP;

  e.scratch1 -= 1;
  if (e.scratch1 <= 0) {
    e.scratch1 = TORPEDO_DRIFT_PERIOD;
    e.y += e.scratch0;                    // the drift chosen once, at launch
    if (e.y < TORPEDO_ROWS.min) e.y = TORPEDO_ROWS.min;
    if (e.y > TORPEDO_ROWS.max) e.y = TORPEDO_ROWS.max;
  }

  if (e.x <= 0) e.removalRequested = true;
  e.updateCountdown = e.updatePeriod;
}

/** @type {Object<number, Function>} the three handlers, for dispatch.js. */
export const HUNTER_HANDLERS = {
  [TYPE.ENEMY_SUBMARINE]: updateEnemySubmarine,
  [TYPE.MAGNETIC_MINE]: updateMagneticMine,
  [TYPE.ENEMY_TORPEDO]: updateEnemyTorpedo,
};
