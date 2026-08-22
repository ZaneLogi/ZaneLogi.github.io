// seafox/src/core/tick.js
//
// One tick (design_spec § 9.2) and the frame inside it (§ 9.3).
//
// **There is one simulation loop.** The title-screen demo and a live mission call
// the same loop with the same spawners, the same entity list and the same
// dispatch table (§ 9.1). The difference is a single counter -- the mission
// number -- and the seven rules its zero value suspends (§ 10.5.2).
//
// **The order below is normative in full**, and it is not incidental: the
// spawners run BEFORE the entity walk, so an entity created on a tick is walked,
// moved and drawn on that same tick, never on the next one.
//
// Chapters not yet ported are written out as named, commented steps rather than
// omitted, because the ORDER is the part that is expensive to rediscover.

import { runSpawners } from './spawners.js';
import { walkEntities } from './walk.js';
import { demoBounceHorizontal, demoBounceVertical } from './demo.js';

/** @type {number} § 10.5.1: the horizontal torpedo fires when the low six bits are zero. */
const AUTO_FIRE_MASK = 0x3F;

/**
 * Advance the simulation by one tick.
 *
 * The demo and a mission share steps 2, 5 and 9; everything else belongs to one
 * mode. The mission's exit guards have no demo counterpart because a keypress is
 * the demo's only exit, and the demo's extra steps stand in for a player.
 *
 * @param {Object} session
 * @returns {void}
 */
export function tick(session) {
  session.tick += 1;

  if (session.isTitleScreen) demoTick(session);
  else missionTick(session);

  frame(session);                                   // § 9.2 step 9
}

/**
 * § 9.2's demo column, steps 2 through 8.
 * @param {Object} session
 * @returns {void}
 */
function demoTick(session) {
  // 2. Poll input. Chapter 19 is not ported; the demo's own exit is step 3.
  // pollInput(session)

  // 3. Exit if a start was requested -- tested immediately after input and
  //    before anything else, so a start takes effect on the tick it is pressed
  //    (§ 10.5.3).
  if (session.startRequested) return;

  // 4. Fire the vertical torpedo -- ATTEMPTED EVERY TICK. The population cap of
  //    1 (§ 4.7) is what actually paces it, not a cooldown. It consumes no
  //    generator draw, so deferring the creation to § 13.2 costs nothing in
  //    draw order.
  session.demo.verticalFireAttempts += 1;
  // fireVerticalTorpedo(session)   -- § 13.2

  // 5. The five spawners, in order (§ 9.2, § 12.1).
  runSpawners(session);

  // 6. One generator draw; fire the horizontal torpedo when the low six bits are
  //    all zero -- 1 in 64 (§ 10.5.1).
  //
  //    **The draw is taken every tick whether or not a torpedo results**, so it
  //    is taken here even though § 13.2's creation is not ported: 63 times in 64
  //    the draw IS the whole step, and omitting it would put every later random
  //    decision in the game at the wrong point in the sequence (§ 5.6).
  if ((session.rng.step() & AUTO_FIRE_MASK) === 0) {
    session.demo.horizontalFireAttempts += 1;
    // fireHorizontalTorpedo(session)   -- § 13.2
  }

  // 7. Horizontal bounce, and swap the message -- one event (§ 10.5.1).
  demoBounceHorizontal(session);

  // 8. Vertical bounce, independently.
  demoBounceVertical(session);
}

/**
 * § 9.2's mission column, steps 1 and 2. Chapter 11 is not ported.
 * @param {Object} session
 * @returns {void}
 */
function missionTick(session) {
  // 1. The three exit guards, IN ORDER (§ 11.2): dead, out of fuel, quota met.
  //    The order is normative because § 11.3 re-tests them in the same order and
  //    awards a different outcome depending on which it finds first -- meeting
  //    the quota on the same tick the tanks empty classifies as out of fuel.
  // checkRoundExitGuards(session)   -- § 11.2

  // 2. Poll input -- § 19.8, once per tick, only from this loop.
  // pollInput(session)

  runSpawners(session);                             // 5, shared
}

/**
 * The frame (§ 9.3). Steps 1-3 are the simulation; the renderer is NOT part of
 * it and reads the state these leave behind (§ 1.5, § 17.1).
 * @param {Object} session
 * @returns {void}
 */
function frame(session) {
  walkEntities(session);                            // 1 -- § 9.4

  // 2. Walk the effects list -- Chapter 15, a separate 32-slot allocator.
  // walkEffects(session)

  // 3. Advance sound by EXACTLY ONE (pitch, duration) pair -- always, not one
  //    per sound and never two (§ 9.3, § 18.3).
  // advanceSound(session)

  // 4. Render and present -- Chapter 17, presentation. Never called from here.
}
