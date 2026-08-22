// seafox/src/core/avenger.js
//
// The avenger -- type 20 (design_spec § 13.9).
//
// **It cannot be killed, cannot be dodged, and cannot be earned.** The only way
// to avoid it is not to shoot the dolphin.
//
// It is created by exactly one thing: the dolphin's collision response, the one
// place in the game that creates an entity. One per dolphin shot, with **no cap
// anywhere** -- it sits outside the § 4.7.1 arithmetic that makes the caps sum
// to the array. That creation site is Chapter 14's, so nothing makes one yet;
// the handler below is complete.
//
// **It does not steer -- it re-copies the player's Y every tick**, so it is
// always exactly at the player's depth for its whole run. Reading it as an
// ordinary mover understates it: there is no lead to break and no gap to open.
//
// Its collision response declines damage with no type test at all, which also
// makes its silence marker unreachable (§ 7.4): the only silent type never gets
// the chance to be silent.

import { TYPE } from './types.js';

/** @type {number} § 2.7.2: step 4, period 1 -- 4 px per tick. */
const AVENGER_STEP = 4;

/** @type {number} § 13.9: it spawns off-screen left. */
export const AVENGER_SPAWN_X = 1;

/** @type {number} § 13.11: removed on passing here. */
const AVENGER_EXIT = 307;

/**
 * Create the avenger. Called only from the dolphin's collision response
 * (Chapter 14), which does not exist yet.
 * @param {Object} session
 * @returns {number} the new slot, or -1 if there is no player to key it to
 */
export function spawnAvenger(session) {
  const playerSlot = session.playerSlot;
  if (playerSlot === -1) return -1;

  const slot = session.entities.alloc(TYPE.AVENGER);
  const e = session.entities.slots[slot];
  e.x = AVENGER_SPAWN_X;
  e.y = session.entities.slots[playerSlot].y;   // the player's Y at this instant
  e.sprite = 'avenger';
  e.updatePeriod = 1;
  e.updateCountdown = 1;
  // No cap and no counter: § 4.7.1 puts this creation site outside the
  // arithmetic entirely, bounded by nothing.
  return slot;
}

/**
 * The avenger's update (§ 13.9).
 * @param {Object} session
 * @param {number} slot
 * @returns {void}
 */
export function updateAvenger(session, slot) {
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

  e.x += AVENGER_STEP;
  const playerSlot = session.playerSlot;
  if (playerSlot !== -1) e.y = session.entities.slots[playerSlot].y;

  if (e.x > AVENGER_EXIT) e.removalRequested = true;
  e.updateCountdown = e.updatePeriod;
}

/** @type {Object<number, Function>} for dispatch.js. */
export const AVENGER_HANDLERS = {
  [TYPE.AVENGER]: updateAvenger,
};
