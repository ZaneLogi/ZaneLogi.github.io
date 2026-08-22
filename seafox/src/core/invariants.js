// seafox/src/core/invariants.js
//
// The continuously-checkable invariants of design_spec § 20.6. Cheap enough to
// call on every tick while developing, and each catches a class of error the
// four oracles would only find indirectly.
//
// § 20.9 leaves it free whether these ship in release builds. They live in
// `core/` rather than in `tests/` because they read only core state and because
// the oracles are not their only caller -- a development build calling them per
// tick is exactly what § 20.6 describes.
//
// **The class-counter invariant earns its place.** A collapsed two-phase
// removal (§ 4.5) produces no visible symptom until a class silently stops
// spawning for the rest of the session, which is close to undiagnosable from
// play. Nothing else in the game will tell you.
//
// The rest of § 20.6's list -- effects count, BCD nibbles, the sound queue
// advancing by exactly one pair, the stencil holding only live slot values --
// joins this file as those subsystems arrive.

import { MAX_ENTITIES } from './entities.js';
import { CLASS } from './types.js';

/**
 * Check the entity list against § 20.6.
 * @param {import('./entities.js').EntityList} el
 * @returns {string[]} one message per violation; empty when the list is sound
 */
export function checkEntityInvariants(el) {
  /** @type {string[]} */
  const bad = [];

  if (el.liveCount < 0 || el.liveCount > MAX_ENTITIES) {
    bad.push('liveCount out of range: ' + el.liveCount);
  }
  for (let i = 0; i < el.liveCount; i++) {
    if (!el.slots[i].active) bad.push('hole in the dense array at slot ' + i);
  }
  for (let i = el.liveCount; i < MAX_ENTITIES; i++) {
    if (el.slots[i].active) bad.push('live entity past liveCount at slot ' + i);
  }
  for (const cls of Object.values(CLASS)) {
    const actual = el.populationOf(cls);
    if (el.counts[cls] !== actual) {
      bad.push(cls + ' counter ' + el.counts[cls] + ' but population ' + actual);
    }
  }
  return bad;
}

/**
 * Every invariant currently implemented, for a whole session.
 * @param {Object} session
 * @returns {string[]} one message per violation
 */
export function checkSessionInvariants(session) {
  return checkEntityInvariants(session.entities);
}
