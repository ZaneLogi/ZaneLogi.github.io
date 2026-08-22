// seafox/src/core/walk.js
//
// The entity walk of design_spec § 9.4 -- step 1 of the frame (§ 9.3).
//
// A cursor runs from 0 and is compared against the LIVE COUNT each iteration, so
// entities created during the walk are picked up by it on the same tick, and
// entities removed during it are handled by the swap-with-last of § 4.6.
//
// Three things in § 9.4 are easy to lose, and all three are reproduced here:
//
//   * **Two flags bypass the divider.** A removal request and a first update both
//     run the handler immediately, whatever the countdown says. The first-update
//     bypass is what makes § 9.1's same-tick guarantee hold for spawned entities.
//   * **Collision runs inside the walk**, immediately after each entity's own
//     handler -- not as a separate pass afterwards. That is what gives § 3.3 its
//     ordering: entities earlier in the walk are already at their new positions
//     when a later one tests for contact, and entities later in the walk are
//     still at their previous ones. Chapter 14 is not ported, so the call site
//     below is a comment rather than a call -- it is marked so the ORDER is not
//     rediscovered later.
//   * **SETTLE can re-enter UPDATE.** If a request is still outstanding after the
//     handler ran, the handler runs again: the two-phase handoff of § 4.5
//     completing inside one tick.
//
// The cursor does not advance after a slot is freed (§ 4.6, § 9.5).

import { updateHandlerFor } from './dispatch.js';

/**
 * Walk every live entity once (§ 9.4).
 * @param {Object} session
 * @returns {void}
 */
export function walkEntities(session) {
  const el = session.entities;
  let cursor = 0;

  while (cursor !== el.liveCount) {
    const e = el.slots[cursor];
    const handler = updateHandlerFor(e.type);

    // SCAFFOLDING (dispatch.js): a type with no handler yet is inert. It stays
    // live and keeps its slot, but is not updated and its countdown is not
    // touched, so it cannot fire a handler that does not exist. Every branch
    // below assumes a handler, which is why this test comes first.
    if (handler === null) {
      cursor += 1;
      continue;
    }

    let run;                              // 'update' | 'stateChange' | 'skip'
    if (e.removalRequested)          run = 'update';        // bypasses the divider
    else if (e.firstUpdate)          run = 'update';        // bypasses the divider
    else if (e.stateChangePending)   run = 'stateChange';
    else {
      e.updateCountdown -= 1;
      if (e.updateCountdown !== 0) {
        cursor += 1;
        continue;                         // skipped this tick -- still drawn (§ 17.6)
      }
      run = e.dying ? 'stateChange' : 'update';
    }

    // UPDATE / STATE_CHANGE / SETTLE, with SETTLE able to re-enter UPDATE.
    let guard = 0;
    for (;;) {
      if (++guard > 4) {
        throw new Error('walk: slot ' + cursor + ' (type ' + e.type +
          ') will not settle -- its handler is not clearing removalRequested (§ 4.5)');
      }

      if (run === 'update') {
        handler(session, cursor);
        // Chapter 14's collision for this entity belongs HERE, immediately after
        // the handler and inside the walk -- not in a pass afterwards (§ 3.3).
        if (!e.stateChangePending) run = 'settle';
        else run = 'stateChange';
      }

      if (run === 'stateChange') {
        // Chapter 15: sound, debris, begin the death animation. Not ported.
        run = 'settle';
      }

      // SETTLE
      if (e.removalRequested) { run = 'update'; continue; }   // another pass
      if (e.removalConfirmed) {
        el.freeSlot(cursor);              // cursor does NOT advance (§ 4.6, § 9.5)
      } else {
        cursor += 1;
      }
      break;
    }
  }
}
