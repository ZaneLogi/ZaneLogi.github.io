// seafox/src/core/dispatch.js
//
// The dispatch table of design_spec § 7.2: an entity's type byte resolves into a
// static table of behaviour, consulted every tick and on every contact.
//
// § 7.2 gives the table three columns -- update handler, collision response and
// score. Only the update column exists here. The other two arrive when Chapter 14
// and Chapter 16 give them readers, rather than shipping now as placeholders
// nobody consults.
//
// **Where several types name the same handler, that sharing is the design**
// (§ 7.2) and is normative: it is what lets the seven merchant type numbers cost
// nothing extra, and it is why the six unused slots of § 7.5 can be kept inert
// rather than deleted.
//
// Every type with a creation site now has a handler. The six that remain `null`
// are the unused merchant slots of § 7.5 -- byte-identical to type 9 in both
// tables and produced by nothing in the game. **Keep them.** Deleting them is
// safe today and unsafe later: Chapter 14's shared merchant response exempts a
// RANGE of types that stops short of 12, so a reused type 12 would be able to
// destroy another merchant. Preserving the slots keeps that latent inconsistency
// inert rather than turning it into a bug the first time someone reuses a number.
//
// walk.js still treats a null handler as inert, which is now unreachable in play
// and remains as the guard that makes § 7.5's slots harmless.

import { TYPE } from './types.js';
import { updatePlayer } from './player.js';
import { SURFACE_HANDLERS } from './surface.js';
import { CONVOY_HANDLERS } from './convoy.js';
import { HUNTER_HANDLERS } from './hunters.js';
import { WEAPON_HANDLERS } from './weapons.js';
import { AVENGER_HANDLERS } from './avenger.js';
import { updateDepthCharge } from './depthcharge.js';

/**
 * Update handler per type, indexed by the type byte. `null` means the type is
 * not ported yet (see the header).
 * @type {(Array<((session: Object, slot: number) => void)|null>)}
 */
export const UPDATE_HANDLERS = (() => {
  /** @type {Array<((session: Object, slot: number) => void)|null>} */
  const table = new Array(21).fill(null);
  table[TYPE.PLAYER] = updatePlayer;
  table[TYPE.DEPTH_CHARGE] = updateDepthCharge;
  for (const group of [SURFACE_HANDLERS, CONVOY_HANDLERS, HUNTER_HANDLERS,
                       WEAPON_HANDLERS, AVENGER_HANDLERS]) {
    for (const type of Object.keys(group)) table[Number(type)] = group[type];
  }
  return table;
})();

/**
 * @param {number} type
 * @returns {((session: Object, slot: number) => void)|null} the type's update
 *   handler, or null while the type is unported
 */
export function updateHandlerFor(type) {
  return UPDATE_HANDLERS[type] || null;
}

/**
 * Which type numbers have no update handler yet. Exported so a test can assert
 * the list rather than let it drift silently.
 * @returns {number[]} type numbers, ascending
 */
export function unportedTypes() {
  /** @type {number[]} */
  const out = [];
  for (let t = 0; t < UPDATE_HANDLERS.length; t++) {
    if (UPDATE_HANDLERS[t] === null) out.push(t);
  }
  return out;
}
