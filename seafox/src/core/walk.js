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
//     still at their previous ones. It also runs BEFORE the subject is
//     re-stamped into the stencil, which is the only order that makes § 3.2's
//     test mean anything -- see the note at the call site.
//   * **SETTLE can re-enter UPDATE.** If a request is still outstanding after the
//     handler ran, the handler runs again: the two-phase handoff of § 4.5
//     completing inside one tick.
//
// The cursor does not advance after a slot is freed (§ 4.6, § 9.5).

import { updateHandlerFor } from './dispatch.js';
import { beginDeath, advanceDeath } from './definitions.js';
import { runCollision } from './collision.js';

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
        // § 3.3: the entity's PREVIOUS footprint is cleared before it moves and
        // its new one written after. An entity skipped by its divider is not
        // rewritten and stays in the stencil where it is -- required, not
        // incidental, because a skipped entity is still physically present and
        // still collidable.
        //
        // Rebuilding the whole buffer at the top of a tick is the tempting
        // shortcut and is wrong: it puts entities later in the walk at their new
        // positions when earlier ones test against them, shifting every contact
        // by up to a step per entity.
        session.stencil.erase(e, cursor);
        handler(session, cursor);

        // Collision runs HERE -- immediately after the entity's own handler and
        // inside the walk, not as a pass afterwards (§ 14.1). That is what gives
        // § 3.3 its ordering: entities earlier in the walk are already at their
        // new positions, entities later in it are still at their previous ones.
        //
        // **And it runs BEFORE the subject is re-stamped, which is the only
        // order that makes § 3.2's test mean anything.** The confirm scans the
        // subject's own footprint for an id that is neither 0 nor its own; stamp
        // first and every pixel of that footprint holds its own id, so the test
        // is false by construction and nothing in the game can ever collide.
        // Clearing first and stamping last leaves the buffer holding exactly the
        // OTHER entities while the subject asks its question.
        runCollision(session, cursor);

        session.stencil.write(e, cursor);

        if (!e.stateChangePending) run = 'settle';
        else run = 'stateChange';
      }

      if (run === 'stateChange') {
        // The state-change handler: the type's death sound (Chapter 18), its
        // debris (Chapter 15) and the start of its death animation (§ 7.4).
        // Two different arrivals land here -- a transition falling due, and a
        // death animation whose frame timer has expired -- and they are told
        // apart by the flag, not by the caller.
        // The death sequence moves the entity once (§ 7.4.2's subtracted
        // re-anchor) and swaps its sprite on every frame, so its footprint has
        // to follow it -- a wreck is still collidable until it is removed.
        session.stencil.erase(e, cursor);
        if (e.stateChangePending) beginDeath(session, cursor);
        else if (e.dying) advanceDeath(session, cursor);
        session.stencil.write(e, cursor);
        run = 'settle';
      }

      // SETTLE
      if (e.removalRequested) { run = 'update'; continue; }   // another pass
      if (e.removalConfirmed) {
        el.freeSlot(cursor, session.stencil);   // cursor does NOT advance (§ 4.6, § 9.5)
      } else {
        cursor += 1;
      }
      break;
    }
  }
}
