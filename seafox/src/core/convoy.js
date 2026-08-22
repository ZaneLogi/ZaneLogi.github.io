// seafox/src/core/convoy.js
//
// The supply chain -- types 13, 14, 15 and 16 (design_spec § 13.8, § 16.5).
// **Four entities, one mechanic**, and none of them can harm the player.
//
// The coupling is the point. The payload's position and motion live in a small
// block of SHARED state rather than in its entity record, and the dolphin and
// the clam **derive their own position from it every tick** -- they do not track
// it, and no entity ever searches for another. § 1.3 makes that the resupply
// mechanic rather than an optimisation.
//
// The clam's depth being locked to the payload's Y - 5 is what makes the race a
// pure horizontal contest: it cannot miss vertically, so the only question is
// whether it arrives before the player does.
//
// ---------------------------------------------------------------------------
// A NOTE ON PROVENANCE
//
// § 13.8.1 says only that the supply submarine's "handler creates the payload
// and the dolphin together" and gives no timing -- but the payload is released
// at the parent's X + 10 and removed once its X passes below 23, and the parent
// SPAWNS at X = 1. Released at spawn, the payload would begin below its own exit
// bound. The specification does not settle it, so the disassembly was consulted
// per the project's working agreement, and it does:
//
//   $7C0D seeds the release countdown with $5A + (LFSR & $1F) = 90-121 frames,
//   counted down once a frame in the submarine's own slot.
//
// That is **a generator draw § 5.6's consumer list does not mention**, taken at
// the supply submarine's spawn. Draw order is normative, so this matters beyond
// the timing: any implementation built from § 5.6 alone consumes the shared
// generator differently from the original for the rest of the session.
// docs/design_spec.md now records both.

import { TYPE } from './types.js';

/** @type {number} § 13.8.1 / $7C0D: base of the release countdown, in frames. */
const RELEASE_BASE = 90;

/** @type {number} the release countdown's random span: 90-121 frames. */
const RELEASE_MASK = 0x1F;

/** @type {number} the resupply count at or above which the clam contests (§ 13.8.3). */
const CLAM_THRESHOLD = 3;

/** @type {number} the clam's delay while under the threshold -- longer than a payload lives. */
const CLAM_DELAY_UNCONTESTED = 255;

/** @type {number} § 13.8.3 / $0134: the clam appears off the drawable range. */
const CLAM_SPAWN_X = 308;

/** Speeds. Every convoy member is step 2, period 1, except the clam at 5 (§ 2.7.2). */
const CONVOY_STEP = 2;
const CLAM_STEP = 5;

/** § 13.11 and § 13.8.2: where each member leaves. */
const SUPPLY_EXIT = 307;
const PAYLOAD_EXIT_X = 23;
const PAYLOAD_DEATH_ROW = 175;
const PAYLOAD_CEILING = 50;

/**
 * The shared block of § 16.5 ($8588-$858E in the original).
 *
 * The payload's own handler writes both this and its record every tick; the
 * dolphin and the clam read only this. That is the whole of the "chase".
 * @returns {{live: boolean, x: number, y: number, dx: number, dy: number}}
 */
export function createConvoyState() {
  return {
    /** @type {boolean} the chain is live. Cleared when the payload goes. */
    live: false,
    /** @type {number} payload X, 16-bit. */
    x: 0,
    /** @type {number} payload Y. */
    y: 0,
    /** @type {number} payload dX -- SUBTRACTED, so the convoy drifts left. */
    dx: CONVOY_STEP,
    /** @type {number} payload dY -- added. -2 while rising, 0 once level. */
    dy: -CONVOY_STEP,
  };
}

/**
 * Supply submarine -- type 13 (§ 13.8.1).
 *
 * Step 2, period 1, row 177, left to right. Spawned by a fixed timer with **no
 * cap at all** -- the only class the difficulty ladder cannot touch. It crosses
 * from 1 to 307 in 153 ticks, the shortest life of any spawned class.
 *
 * @param {Object} session
 * @param {number} slot
 * @returns {void}
 */
export function updateSupplySubmarine(session, slot) {
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

  e.x += CONVOY_STEP;
  if (e.x > SUPPLY_EXIT) {
    e.removalRequested = true;
    e.updateCountdown = e.updatePeriod;
    return;
  }

  // The release countdown seeded at spawn. It fires once, roughly 59% to 79% of
  // the way across, so the resupply always appears in the right-hand half of the
  // screen with only 30-60 ticks of its parent's own run left. After it, the
  // submarine keeps going and the two children never read its record again.
  if (e.scratch0 > 0) {
    e.scratch0 -= 1;
    if (e.scratch0 === 0) releasePayload(session, slot);
  }

  e.updateCountdown = e.updatePeriod;
}

/**
 * Seed the release countdown. Called from the supply spawner, at spawn.
 * @param {Object} session
 * @param {number} slot
 * @returns {void}
 */
export function seedRelease(session, slot) {
  const e = session.entities.slots[slot];
  e.scratch0 = RELEASE_BASE + (session.rng.step() & RELEASE_MASK);
  // Increment one of the two per-resupply steps of § 13.8.3: this one at the
  // submarine's spawn, the other at its release.
  session.resupplyCount += 1;
}

/**
 * Release the payload and the dolphin **together** (§ 13.8.2).
 *
 * The dolphin comes out *below* what it is carrying and five pixels behind it,
 * which is what makes the pair read as one animal with a parcel.
 * @param {Object} session
 * @param {number} parentSlot
 * @returns {void}
 */
function releasePayload(session, parentSlot) {
  const parent = session.entities.slots[parentSlot];
  const convoy = session.convoy;

  convoy.live = true;
  convoy.x = parent.x + 10;
  convoy.y = parent.y - 11;               // row 166 from a hull on row 177
  convoy.dx = CONVOY_STEP;                // subtracted: the convoy drifts left
  convoy.dy = -CONVOY_STEP;               // added: rising

  const pSlot = session.entities.alloc(TYPE.PAYLOAD);
  const payload = session.entities.slots[pSlot];
  payload.x = convoy.x;
  payload.y = convoy.y;
  payload.sprite = 'payload';
  payload.updatePeriod = 1;
  payload.updateCountdown = 1;

  const dSlot = session.entities.alloc(TYPE.DOLPHIN);
  const dolphin = session.entities.slots[dSlot];
  dolphin.x = parent.x + 5;
  dolphin.y = parent.y - 6;               // row 171 -- below the payload
  dolphin.sprite = 'dolphin';
  dolphin.updatePeriod = 1;
  dolphin.updateCountdown = 1;

  // The second of the two increments, and the clam's delay is tested AFTER it.
  // So the first release of a mission tests 2 -- under the threshold -- and the
  // second tests 4, over it: every mission gives one uncontested resupply and
  // contests every later one.
  session.resupplyCount += 1;
  payload.scratch0 = session.resupplyCount < CLAM_THRESHOLD
    ? CLAM_DELAY_UNCONTESTED
    : (session.rng.step() & 15);          // a draw taken ONLY on this branch
}

/**
 * Payload -- type 14 (§ 13.8.2).
 *
 * **It rises to the player's own ceiling and stops there.** It tests its Y
 * against the PLAYER's clamps rather than its own: too deep and it dies, too
 * high and it stops rising and snaps to row 50 -- the exact row the player
 * cannot climb above. The part of the resupply you can actually reach is the
 * flat run along your own ceiling.
 *
 * @param {Object} session
 * @param {number} slot
 * @returns {void}
 */
export function updatePayload(session, slot) {
  const e = session.entities.slots[slot];
  const convoy = session.convoy;

  if (e.removalRequested) {
    convoy.live = false;
    session.entities.confirmRemoval(slot);
    return;
  }
  if (e.firstUpdate) {
    e.firstUpdate = false;
    e.updateCountdown = e.updatePeriod;
    return;
  }

  convoy.y += convoy.dy;

  if (convoy.y >= PAYLOAD_DEATH_ROW) {
    // § 13.8.2: it DIES rather than being removed quietly -- the same
    // state-change path a kill uses, so it explodes.
    e.stateChangePending = true;
    convoy.live = false;
    e.updateCountdown = e.updatePeriod;
    return;
  }
  if (convoy.y < PAYLOAD_CEILING) {
    convoy.dy = 0;
    convoy.y = PAYLOAD_CEILING;
  }

  // Subtracted every tick, from release onward -- not only once level.
  convoy.x -= convoy.dx;

  e.x = convoy.x;
  e.y = convoy.y;

  if (convoy.x < PAYLOAD_EXIT_X) {
    e.removalRequested = true;
    convoy.live = false;
  }

  // The clam countdown lives in the payload's own slot (§ 13.8.3).
  if (e.scratch0 > 0) {
    e.scratch0 -= 1;
    if (e.scratch0 === 0) spawnClam(session);
  }

  e.updateCountdown = e.updatePeriod;
}

/**
 * Dolphin -- type 15 (§ 13.8.2, § 16.5). **It has no position of its own**: it
 * is the payload's, offset by (-5, +5).
 *
 * Shoot it and it retaliates -- its collision response is the only place in the
 * game that creates an entity, and what it creates is the avenger. That path is
 * Chapter 14's.
 * @param {Object} session
 * @param {number} slot
 * @returns {void}
 */
export function updateDolphin(session, slot) {
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

  if (session.convoy.live) {
    e.x = session.convoy.x - 5;
    e.y = session.convoy.y + 5;           // below what it carries
  } else {
    e.x -= CONVOY_STEP;                   // the chain is gone; it swims on alone
  }
  if (e.x <= 0) e.removalRequested = true;
  e.updateCountdown = e.updatePeriod;
}

/**
 * Put the Giant Clam on screen (§ 13.8.3). It is a child of the payload, not of
 * a spawner, and has **no cap and no population counter of any kind** -- safe
 * only because the payload it is keyed to is itself a singleton.
 * @param {Object} session
 * @returns {void}
 */
function spawnClam(session) {
  const slot = session.entities.alloc(TYPE.GIANT_CLAM);
  const e = session.entities.slots[slot];
  e.x = CLAM_SPAWN_X;                     // off the drawable range: invisible for a tick
  e.y = session.convoy.y - 5;
  e.sprite = 'shellOpen';
  e.updatePeriod = 1;
  e.updateCountdown = 1;
}

/**
 * Giant Clam -- type 16 (§ 13.8.3). **Step 5, period 1: 5 px per tick, the
 * fastest object in the game**, and four instructions of behaviour.
 * @param {Object} session
 * @param {number} slot
 * @returns {void}
 */
export function updateGiantClam(session, slot) {
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

  // Its depth is LOCKED to the payload's, which is what makes the race a pure
  // horizontal contest -- it cannot miss vertically.
  if (session.convoy.live) e.y = session.convoy.y - 5;
  e.x -= CLAM_STEP;
  if (e.x <= 0) e.removalRequested = true;
  e.updateCountdown = e.updatePeriod;
}

/** @type {Object<number, Function>} the four handlers, for dispatch.js. */
export const CONVOY_HANDLERS = {
  [TYPE.SUPPLY_SUBMARINE]: updateSupplySubmarine,
  [TYPE.PAYLOAD]: updatePayload,
  [TYPE.DOLPHIN]: updateDolphin,
  [TYPE.GIANT_CLAM]: updateGiantClam,
};
