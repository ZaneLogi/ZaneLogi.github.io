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
// SCAFFOLDING, and deliberately visible: fourteen of the fifteen created types
// have no handler yet. A `null` here means "not ported", and walk.js treats such
// an entity as INERT -- live, occupying its slot, but never updated and never
// counted down. The spawners already create five of them, so this is load-bearing
// today. tests/test_demo.js asserts exactly which types are inert, so the gap
// stays visible instead of quietly becoming permanent.
//
// It cannot overflow the array: the title-screen caps of § 8.2 bound the inert
// population at 13 against the 32 slots of § 4.1.

import { TYPE } from './types.js';
import { updatePlayer } from './player.js';

/**
 * Update handler per type, indexed by the type byte. `null` means the type is
 * not ported yet (see the header).
 * @type {(Array<((session: Object, slot: number) => void)|null>)}
 */
export const UPDATE_HANDLERS = (() => {
  /** @type {Array<((session: Object, slot: number) => void)|null>} */
  const table = new Array(21).fill(null);
  table[TYPE.PLAYER] = updatePlayer;
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
