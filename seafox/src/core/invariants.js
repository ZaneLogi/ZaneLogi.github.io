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
// The rest of § 20.6's list -- BCD nibbles and the sound queue advancing by
// exactly one pair -- joins this file as those subsystems arrive. The stencil
// carries its own check, in stencil.js, because it needs the buffer.

import { MAX_ENTITIES } from './entities.js';
import { MAX_EFFECTS } from './effects.js';
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
  return checkEntityInvariants(session.entities).concat(checkEffectInvariants(session.effects));
}

/**
 * § 20.6: the effects count never exceeds 32.
 *
 * Where the entity list would be corrupt if it overflowed, this one is merely
 * short: § 15.1 has it drop a creation silently when full. So the check is that
 * the bound is respected, not that nothing was ever refused.
 * @param {import('./effects.js').EffectList} list
 * @returns {string[]} one message per violation
 */
export function checkEffectInvariants(list) {
  /** @type {string[]} */
  const bad = [];
  if (list.liveCount < 0 || list.liveCount > MAX_EFFECTS) {
    bad.push('effect count out of range: ' + list.liveCount);
  }
  for (let i = 0; i < list.liveCount; i++) {
    if (!list.slots[i].active) bad.push('hole in the effects array at slot ' + i);
  }
  return bad;
}
