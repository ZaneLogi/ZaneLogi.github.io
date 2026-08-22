// seafox/src/core/weapons.js
//
// The player's two torpedoes -- types 1 and 2 (design_spec § 13.2), and the
// firing sites that create them.
//
// **They share a magazine and a death, and nothing else.** The differences are
// what make one weapon offensive and the other defensive, and the division is
// the shape of the whole game (§ 1.2):
//
//   * **Only the vertical torpedo can reach a target.** The surface lanes sit at
//     rows 10, 20 and 30; the player is clamped to 50-175 and can never rise to
//     them, so one weapon scores and the other cannot.
//   * **The horizontal one is clamped to rows 45-178** and misses the lowest
//     surface lane by five pixels. It exists to clear threats at the player's
//     own depth, not to score.
//
// The vertical torpedo has **no cooldown at all** -- its cap of 1 in flight is
// what paces it, which is rate of fire expressed as a population limit rather
// than as a timer (§ 4.7). The horizontal one carries both.

import { TYPE, CLASS } from './types.js';
import { trailDot, trailBlob } from './trails.js';

/** Vertical torpedo -- type 1 (§ 13.2). Step -1, period 1: the only step of 1. */
const VERTICAL = {
  step: -1,
  period: 1,
  offsetX: 9,
  offsetY: -7,
  topExit: 7,
  bottomExit: 179,
};

/** Horizontal torpedo -- type 2. Step +4, period 2 -- halved to 2 px per tick. */
const HORIZONTAL = {
  step: 4,
  period: 2,
  offsetX: 28,
  offsetY: 3,
  cooldown: 6,
  driftUpdates: 5,                        // 5 updates = 10 ticks
  minRow: 45,
  maxRow: 178,
  exitX: 308,
  refuseBeyondX: 304,
};

/**
 * Fire the vertical torpedo (§ 13.2), attempted every tick by the demo.
 *
 * The magazine and the empty-magazine sound are **suspended on the title
 * screen** (§ 10.5.2 rule 2): the ammunition path is skipped entirely, so the
 * demo gets free shots and no empty sound.
 *
 * @param {Object} session
 * @returns {boolean} whether a torpedo was launched
 */
export function fireVerticalTorpedo(session) {
  if (session.entities.counts[CLASS.VERTICAL_TORPEDO] >= session.caps[CLASS.VERTICAL_TORPEDO]) {
    return false;
  }
  const playerSlot = session.playerSlot;
  if (playerSlot === -1 || !session.playerAlive) return false;
  const player = session.entities.slots[playerSlot];

  // Chapter 16: outside the demo this spends one from the shared magazine of 30,
  // and firing on empty makes a distinct sound instead of firing.

  const slot = session.entities.alloc(TYPE.VERTICAL_TORPEDO);
  const e = session.entities.slots[slot];
  e.x = player.x + VERTICAL.offsetX;
  e.y = player.y + VERTICAL.offsetY;
  e.sprite = 'torpedoRising';
  e.updatePeriod = VERTICAL.period;
  e.updateCountdown = VERTICAL.period;
  e.scratch0 = VERTICAL.step;             // -1 rising; a hospital ship flips it
  session.entities.countSpawn(TYPE.VERTICAL_TORPEDO);
  return true;
}

/**
 * Fire the horizontal torpedo (§ 13.2).
 * @param {Object} session
 * @returns {boolean} whether a torpedo was launched
 */
export function fireHorizontalTorpedo(session) {
  if (session.horizontalCooldown > 0) return false;
  if (session.entities.counts[CLASS.HORIZONTAL_TORPEDO]
      >= session.caps[CLASS.HORIZONTAL_TORPEDO]) {
    return false;
  }
  const playerSlot = session.playerSlot;
  if (playerSlot === -1 || !session.playerAlive) return false;
  const player = session.entities.slots[playerSlot];
  if (player.x > HORIZONTAL.refuseBeyondX) return false;

  const slot = session.entities.alloc(TYPE.HORIZONTAL_TORPEDO);
  const e = session.entities.slots[slot];
  e.x = player.x + HORIZONTAL.offsetX;
  e.y = player.y + HORIZONTAL.offsetY;
  e.sprite = 'torpedoHorizontal';
  e.paletteFlip = true;
  e.updatePeriod = HORIZONTAL.period;
  e.updateCountdown = HORIZONTAL.period;
  e.scratch1 = HORIZONTAL.driftUpdates;
  e.scratch2 = 1;                         // the drift's sign, +/-1 in Y
  e.scratch3 = 1;                         // trail toggle, seeded to mark at once
  session.entities.countSpawn(TYPE.HORIZONTAL_TORPEDO);
  session.horizontalCooldown = HORIZONTAL.cooldown;
  return true;
}

/**
 * Vertical torpedo -- type 1 (§ 13.2). Step -1, period 1: **1 px per tick
 * upward, the only step of 1 in the game.**
 *
 * A hospital ship deflects it (§ 13.6.2) -- negating this step, snapping it
 * below the hull and swapping the sprite to the descending form. That path is
 * Chapter 14's, and it matters: a descending torpedo becomes lethal to the
 * player, because the player treats its own vertical torpedo as harmless only
 * while it is travelling upward. **Fire straight up beneath a hospital ship and
 * the shot comes back and kills you.**
 *
 * @param {Object} session
 * @param {number} slot
 * @returns {void}
 */
export function updateVerticalTorpedo(session, slot) {
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

  e.y += e.scratch0;

  // § 15.7: a counter, every 4th tick. The offset puts the mark BEHIND the shot,
  // so it flips with the shot when a hospital ship reverses it (§ 13.6.2).
  e.scratch3 += 1;
  if (e.scratch3 >= 4) {
    e.scratch3 = 0;
    trailDot(session, e.x + 1, e.y + (e.scratch0 < 0 ? 7 : -1));
  }

  if (e.y < VERTICAL.topExit || e.y >= VERTICAL.bottomExit) e.removalRequested = true;
  e.updateCountdown = e.updatePeriod;
}

/**
 * Horizontal torpedo -- type 2 (§ 13.2). Step +4, period 2 -- **2 px per tick.**
 *
 * It is the trap in § 2.7.2's table: it carries the largest step of any weapon
 * and is still slower than the enemy torpedo, because its period halves it.
 *
 * @param {Object} session
 * @param {number} slot
 * @returns {void}
 */
export function updateHorizontalTorpedo(session, slot) {
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

  e.x += HORIZONTAL.step;

  // +/-1 in Y every 5 UPDATES, which is 10 ticks -- the divider again.
  e.scratch1 -= 1;
  if (e.scratch1 <= 0) {
    e.scratch1 = HORIZONTAL.driftUpdates;
    e.y += e.scratch2;
    if (e.y < HORIZONTAL.minRow) e.y = HORIZONTAL.minRow;
    if (e.y > HORIZONTAL.maxRow) e.y = HORIZONTAL.maxRow;
  }

  // § 15.7: a toggle, every 2nd tick -- **from the first**, so the player's
  // horizontal torpedo lays a mark on the very tick it is fired. The enemy's
  // toggle is seeded to the opposite value and waits a tick.
  e.scratch3 ^= 1;
  if (e.scratch3 === 0) trailBlob(session, e.x, e.y + 1);

  if (e.x > HORIZONTAL.exitX) e.removalRequested = true;
  e.updateCountdown = e.updatePeriod;
}

/** @type {Object<number, Function>} the two handlers, for dispatch.js. */
export const WEAPON_HANDLERS = {
  [TYPE.VERTICAL_TORPEDO]: updateVerticalTorpedo,
  [TYPE.HORIZONTAL_TORPEDO]: updateHorizontalTorpedo,
};
