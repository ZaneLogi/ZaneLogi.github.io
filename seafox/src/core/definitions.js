// seafox/src/core/definitions.js
//
// The definition table of design_spec § 7.4 -- the second of Chapter 7's two
// tables -- and the death sequence it drives.
//
// **Keep the split.** § 7.1 puts behaviour in one table and death-data in the
// other because they have different lifetimes and different readers: the
// dispatch table is consulted every tick, this one only when an entity dies.
// Merging them produces a wide row that is mostly empty for most types.
//
// Reading the table as a whole says more than any row does:
//
//   * **First = last = 0 means no death animation.** The player, the enemy
//     submarine, the supply submarine, the dolphin, the clam and the avenger
//     simply vanish; the first three of those still emit debris.
//   * **The player's twelve-particle burst is the largest in the game** --
//     against seven for a submarine and five for a ship -- and it is the only
//     type with debris but no animation AND no re-anchor.
//   * **Nine of the eighteen sounds are death sounds**, assigned here by TYPE
//     rather than by event, which is why the three torpedoes share one and the
//     seven merchant slots share another.
//   * **The avenger is the only silent type**, and § 13.9 makes that marker
//     unreachable: nothing in the game can destroy it, so the one silent type
//     never gets the chance to be silent.
//
// The hospital ship's row is inert: it carries a full death specification and
// Chapter 14 shows its damage path cannot be reached (§ 13.6.2).

import { TYPE } from './types.js';

/** @type {number} § 7.4: the avenger's sound field, not a sound number. */
export const SILENT = -1;

/** @type {number} § 2.7.1: death frames advance on this period, whatever the type. */
export const DEATH_FRAME_PERIOD = 4;

/**
 * One row per type (§ 7.4). `reanchorX`/`reanchorY` are SUBTRACTED once when the
 * death begins (§ 7.4.2).
 * @type {{reanchorX: number, reanchorY: number, firstFrame: number,
 *         lastFrame: number, debris: number, sound: number}[]}
 */
export const DEFINITIONS = (() => {
  /** @param {number} rx @param {number} ry @param {number} f @param {number} l
   *  @param {number} d @param {number} s
   *  @returns {{reanchorX: number, reanchorY: number, firstFrame: number,
   *             lastFrame: number, debris: number, sound: number}} */
  const row = (rx, ry, f, l, d, s) =>
    ({ reanchorX: rx, reanchorY: ry, firstFrame: f, lastFrame: l, debris: d, sound: s });

  const merchant = row(0, 0, 8, 11, 5, 4);
  const table = new Array(21);
  table[TYPE.PLAYER] = row(0, 0, 0, 0, 12, 13);
  table[TYPE.VERTICAL_TORPEDO] = row(4, 0, 3, 5, 0, 7);
  // The horizontal torpedo's 0/0 looks like an oversight in the original and is
  // REPRODUCED (§ 7.4.2): it is the same size as the other two torpedoes and
  // dies into the same wider burst, so its explosion sits low and right of the
  // shot while theirs are centred. Nothing in the game distinguishes it; the
  // value was simply never filled in, and it is observable.
  table[TYPE.HORIZONTAL_TORPEDO] = row(0, 0, 3, 5, 0, 7);
  table[TYPE.ENEMY_SUBMARINE] = row(0, 0, 0, 0, 7, 11);
  table[TYPE.MAGNETIC_MINE] = row(4, 4, 6, 7, 0, 6);
  table[TYPE.MERCHANT_UNUSED_5] = merchant;
  table[TYPE.MERCHANT_UNUSED_6] = merchant;
  table[TYPE.MERCHANT_UNUSED_7] = merchant;
  table[TYPE.HOSPITAL_SHIP] = row(0, 0, 0, 2, 5, 4);
  table[TYPE.MERCHANT_SHIP] = merchant;
  table[TYPE.MERCHANT_UNUSED_10] = merchant;
  table[TYPE.MERCHANT_UNUSED_11] = merchant;
  table[TYPE.MERCHANT_UNUSED_12] = merchant;
  table[TYPE.SUPPLY_SUBMARINE] = row(0, 0, 0, 0, 7, 12);
  table[TYPE.PAYLOAD] = row(2, 1, 3, 5, 0, 16);
  table[TYPE.DOLPHIN] = row(0, 0, 0, 0, 0, 14);
  table[TYPE.GIANT_CLAM] = row(0, 0, 0, 0, 0, 14);
  table[TYPE.DESTROYER] = row(0, 0, 0, 2, 5, 5);
  table[TYPE.DEPTH_CHARGE] = row(5, 5, 6, 7, 0, 6);
  table[TYPE.ENEMY_TORPEDO] = row(3, 0, 3, 5, 0, 7);
  table[TYPE.AVENGER] = row(0, 0, 0, 0, 0, SILENT);
  return table;
})();

/**
 * **One frame table, shared by every type** (§ 7.4.1). The first/last columns of
 * DEFINITIONS index into this.
 *
 * Each frame forces the entity's X to its parity, applied before the frame is
 * drawn. An explosion therefore cannot change colour as it plays, and a wreck's
 * colour does not depend on where the thing that died happened to be -- which,
 * with the palette flip fixed at 1 for every type, makes every death frame's
 * colour a property of the frame alone (§ 6.5).
 *
 * Frames 8-10 are the same three sinking-ship sprites as 0-2. The merchant needs
 * its own copy because it is the only type whose animation must end on a
 * floating score value.
 *
 * @type {{sprite: string|null, parity: number}[]}
 */
export const DEATH_FRAMES = [
  { sprite: 'sinkingShip1', parity: 0 },
  { sprite: 'sinkingShip2', parity: 0 },
  { sprite: 'sinkingShip3', parity: 0 },
  { sprite: 'burst1', parity: 1 },
  { sprite: 'burst2', parity: 1 },
  { sprite: 'burst3', parity: 1 },
  { sprite: 'tallColumn1', parity: 1 },
  { sprite: 'tallColumn2', parity: 1 },
  { sprite: 'sinkingShip1', parity: 0 },
  { sprite: 'sinkingShip2', parity: 0 },
  { sprite: 'sinkingShip3', parity: 0 },
  // Frame 11 carries NO sprite: it is special-cased into the merchant's floating
  // score value (§ 7.3.2), chosen by the same test that chooses the score. Only
  // a merchant kill reaches it, so it is unreachable until Chapter 14 gives
  // merchants a way to die and Chapter 16 gives the score its value.
  { sprite: null, parity: 1 },
];

/**
 * Begin an entity's death: the state-change step of § 9.4.
 *
 * Applied ONCE. The re-anchor is **subtracted**, not added -- pulling the anchor
 * up and left so the wider death block centres on what died (§ 7.4.2).
 *
 * @param {Object} session
 * @param {number} slot
 * @returns {void}
 */
export function beginDeath(session, slot) {
  const e = session.entities.slots[slot];
  const def = DEFINITIONS[e.type];

  e.stateChangePending = false;

  // Chapter 18: queue def.sound, unless it is SILENT. Chapter 15: emit
  // def.debris particles from the twelve-record template, taking the first n.
  // Neither is ported; both are read from the row above when they are.

  if (def.firstFrame === 0 && def.lastFrame === 0) {
    // No death animation -- the type simply vanishes (§ 7.4). Several of these
    // still emit debris, which is the only trace they leave.
    e.removalRequested = true;
    return;
  }

  e.x -= def.reanchorX;                   // SUBTRACTED, once (§ 7.4.2)
  e.y -= def.reanchorY;
  e.dying = true;
  e.paletteFlip = true;                   // fixed to 1 for every type (§ 7.4.1)
  e.animFrame = def.firstFrame;
  e.animLastFrame = def.lastFrame;
  e.updatePeriod = DEATH_FRAME_PERIOD;    // § 2.7.1: period 4, whatever the type
  e.updateCountdown = DEATH_FRAME_PERIOD;
  applyDeathFrame(e);
}

/**
 * Advance one death frame, and request removal once the counter passes the last
 * one (§ 7.4.1).
 * @param {Object} session
 * @param {number} slot
 * @returns {void}
 */
export function advanceDeath(session, slot) {
  const e = session.entities.slots[slot];
  e.animFrame += 1;
  if (e.animFrame > e.animLastFrame) {
    e.removalRequested = true;
    return;
  }
  applyDeathFrame(e);
  e.updateCountdown = e.updatePeriod;
}

/**
 * Put the entity on its current death frame, forcing the frame's X parity.
 * @param {Object} e an Entity
 * @returns {void}
 */
function applyDeathFrame(e) {
  const frame = DEATH_FRAMES[e.animFrame];
  if (frame.sprite !== null) e.sprite = frame.sprite;
  e.x = (e.x & ~1) | frame.parity;
}
