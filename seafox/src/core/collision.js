// seafox/src/core/collision.js
//
// Collision -- design_spec § 14.1 to § 14.5.
//
// It runs **inside the entity walk**, immediately after each entity's own
// update, not as a pass afterwards (§ 14.1). For the entity just updated -- the
// SUBJECT -- the game sweeps every other live entity as a CANDIDATE.
//
// Two stages: an inclusive box overlap, then a pixel-accurate confirm against
// the stencil. The original carried a third stage ahead of these, a screen-pixel
// pre-filter that rejected subjects whose draw had landed on nothing; it bought
// rejection and affected nothing else, and is not reproduced (§ 1.3).

import { INK } from './stencil.js';
import { boxWidth } from '../assets/ink.js';
import { respond } from './responses.js';

/**
 * The subject's rectangle (§ 14.2), built from its position and its sprite's
 * **stored block size** -- not its stripped pixel size (§ 6.4).
 *
 * **Both extents are inclusive.**
 *
 * Height comes off the stored `rows` for the same reason width comes off
 * `byteWidth`: the bitmaps are stripped to their ink box, and measuring the
 * stripped one yields boxes that are tighter than the game's. Exactly one block
 * differs -- `sinkingShip3`, whose top row is blank -- and it is a death frame,
 * so § 14.4 skips it before any box is built. The two agree everywhere the
 * sweep can reach, which is why this cost nothing to get right.
 *
 * @param {Object} e an Entity
 * @returns {{left: number, right: number, top: number, bottom: number}|null}
 *   null when the type has no artwork, and so no box
 */
export function boxOf(e) {
  const sprite = INK[e.sprite];
  if (sprite === undefined) return null;
  return {
    left: e.x,
    right: e.x + boxWidth(sprite),
    top: e.y,
    bottom: e.y + sprite.rows - 1,
  };
}

/**
 * A standard separating-axis rejection on four comparisons.
 * @param {{left: number, right: number, top: number, bottom: number}} a
 * @param {{left: number, right: number, top: number, bottom: number}} b
 * @returns {boolean}
 */
export function boxesOverlap(a, b) {
  return !(a.right < b.left || b.right < a.left ||
           a.bottom < b.top || b.bottom < a.top);
}

/**
 * Run collision for the entity just updated (§ 14.1).
 *
 * The order of the two stages matters for cost but not for meaning: **the
 * confirm does not reference the candidate** (§ 14.3), so it is computed once
 * for the subject and then the sweep does box tests only. That is not a
 * simplification imposed on the design -- it is what the original computes,
 * because its own confirm measures the whole subject sprite against the whole
 * screen.
 *
 * The normative consequence, and it is a strange one worth stating plainly:
 * **a third entity's pixels can confirm a contact between subject and candidate
 * whose own silhouettes never met**, provided their boxes overlapped.
 *
 * The sweep **does not stop at the first hit** -- one entity can collide with
 * several others in a single tick, and all of them resolve.
 *
 * @param {Object} session
 * @param {number} subjectSlot
 * @returns {void}
 */
export function runCollision(session, subjectSlot) {
  const el = session.entities;
  const subject = el.slots[subjectSlot];

  // § 14.4: an entity already flagged as dying is skipped entirely.
  if (subject.dying || subject.removalConfirmed) return;

  const subjectBox = boxOf(subject);
  if (subjectBox === null) return;

  // Stage 2, computed once and cached for the whole sweep.
  if (!session.stencil.confirms(subject, subjectSlot)) return;

  for (let i = 0; i < el.liveCount; i++) {
    if (i === subjectSlot) continue;
    const candidate = el.slots[i];
    if (candidate.dying || candidate.removalConfirmed) continue;

    const candidateBox = boxOf(candidate);
    if (candidateBox === null) continue;
    if (!boxesOverlap(subjectBox, candidateBox)) continue;

    // § 14.4: a confirmed contact dispatches TWICE, once with each party as the
    // subject. Each call runs that type's own response handler, and every
    // handler's first act is to read the other party's type -- which is why the
    // responses read as whitelists rather than as rules about the pair.
    respond(session, subjectSlot, i);
    respond(session, i, subjectSlot);

    // Both parties may have died; the subject's own death ends its sweep, since
    // a dying entity takes no further part (§ 14.4).
    if (subject.dying || subject.stateChangePending || subject.removalRequested) return;
  }
}
