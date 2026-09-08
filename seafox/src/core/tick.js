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
import { walkEffects } from './effects.js';
import { demoBounceHorizontal, demoBounceVertical } from './demo.js';
import { fireVerticalTorpedo, fireHorizontalTorpedo } from './weapons.js';
import { advanceRound, checkRoundGuards, newGame, PHASE } from './round.js';
import { advanceSound } from './sound.js';
import { pollInput, pollPause } from './input.js';

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
  // § 19.6: a pause holds until any input. It sits ahead of the tick counter as
  // well as ahead of the loops, because a frozen game does not age.
  if (pollPause(session)) return;

  session.tick += 1;

  if (session.isTitleScreen) {
    demoTick(session);
    // § 10.5.3: the exit is tested immediately after input and before anything
    // else, so a start takes effect on the tick it is pressed. `demoTick` has
    // already returned early, so none of the demo's own steps ran either.
    if (session.startRequested) {
      newGame(session);
      return;                                       // setup draws from here on
    }
    frame(session);                                 // § 9.2 step 9
    return;
  }

  // Chapter 11's transitions are not the play loop. A hold is a pause with the
  // simulation STOPPED -- nothing moves and nothing animates -- so a tick spent
  // in one advances only its counter. The fly-in and the drain are the
  // exceptions: both run ordinary simulation, which is what lets the submarine
  // swim in under its own steam and be driven off the screen afterwards.
  if (!advanceRound(session)) return;

  // **The fly-in and the drain run the FRAME only -- they do not spawn.** The
  // five spawners have exactly two callers, the demo loop and the play loop
  // (`$68B2` and `$6D05`); the fly-in (`$6CB5`) and the drain (`$6DF2`) call
  // `sub_1542` alone, which is the entity walk, the effects walk and sound.
  //
  // That is what makes § 11.4's early exit reachable at all: with nothing
  // refilling the list, the drain ends when the screen clears instead of always
  // running its full twenty passes. Spawning here also consumes generator draws
  // (§ 5.6), so it would shift every later random decision in the game.
  // **A guard that fires ends the tick outright** -- no poll, no spawners, and
  // no frame. Each of the three exits the play loop with a `JMP loc_6D1A`
  // ($6CE3 / $6CF7 / $6CFF), so everything below `loc_6D02` is skipped on the
  // tick the round ends; the outro that follows is what draws the screen next.
  if (session.phase === PHASE.PLAY && !missionTick(session)) return;

  frame(session);
}

/**
 * § 9.2's demo column, steps 2 through 8.
 * @param {Object} session
 * @returns {void}
 */
function demoTick(session) {
  // 2. Poll input (§ 19.8). The demo reads no MOVEMENT keys -- its own bounce
  //    writes the pair -- but the start key, the pause and the sound toggle are
  //    all live here, because § 19.6 puts them ahead of every mode test.
  pollInput(session);

  // 3. Exit if a start was requested -- tested immediately after input and
  //    before anything else, so a start takes effect on the tick it is pressed
  //    (§ 10.5.3).
  if (session.startRequested) return;

  // 4. Fire the vertical torpedo -- ATTEMPTED EVERY TICK. The population cap of
  //    1 (§ 4.7) is what actually paces it, not a cooldown. It consumes no
  //    generator draw, so deferring the creation to § 13.2 costs nothing in
  //    draw order.
  session.demo.verticalFireAttempts += 1;
  fireVerticalTorpedo(session);

  // 5. The five spawners, in order (§ 9.2, § 12.1).
  runSpawners(session);

  // 6. One generator draw; fire the horizontal torpedo when the low six bits are
  //    all zero -- 1 in 64 (§ 10.5.1).
  //
  //    **The draw is taken every tick whether or not a torpedo results** -- 63
  //    times in 64 the draw IS the whole step, and the cap of 1 in flight
  //    refuses most of the rest. Moving it inside the `if` would put every later
  //    random decision in the game at the wrong point in the sequence (§ 5.6).
  if ((session.rng.step() & AUTO_FIRE_MASK) === 0) {
    session.demo.horizontalFireAttempts += 1;
    fireHorizontalTorpedo(session);
  }

  // 7. Horizontal bounce, and swap the message -- one event (§ 10.5.1).
  demoBounceHorizontal(session);

  // 8. Vertical bounce, independently.
  demoBounceVertical(session);
}

/**
 * § 9.2's mission column, steps 1 and 2. Chapter 11's transitions are
 * handled ahead of this, in `advanceRound`.
 * @param {Object} session
 * @returns {boolean} whether the round survived the guards -- false ends the tick
 */
function missionTick(session) {
  // 1. The three exit guards, IN ORDER (§ 11.2): dead, out of fuel, quota met.
  //    The order is normative because § 11.3 re-tests them in the same order and
  //    awards a different outcome depending on which it finds first -- meeting
  //    the quota on the same tick the tanks empty classifies as out of fuel.
  //
  //    **A guard that fires returns immediately, and steps 2 and 5 do not run.**
  //    The outro has just written the exit velocity, and polling after it would
  //    hand the pair straight back to whatever the player happens to be holding
  //    -- then the drain never polls again, so that one stale key steers the
  //    whole exit. A held `h` drives the submarine off to the LEFT for twenty
  //    passes; a centred pad, or `j`, parks it mid-screen and it never leaves at
  //    all. This return is what § 10.6 means by the outro being unstoppable.
  if (checkRoundGuards(session)) return false;

  // 2. Poll input -- § 19.8, once per tick, and **only from this loop**.
  //    The transitions of Chapter 11 deliberately poll nothing (§ 10.6), and
  //    input during one is deferred rather than dropped, so a key pressed there
  //    takes effect on the round's opening tick. That falls out of the source
  //    being a one-key register: nothing drains it while no one is polling.
  pollInput(session);

  runSpawners(session);                             // 5, shared
  return true;
}

/**
 * The frame (§ 9.3). Steps 1-3 are the simulation; the renderer is NOT part of
 * it and reads the state these leave behind (§ 1.5, § 17.1).
 * @param {Object} session
 * @returns {void}
 */
function frame(session) {
  // § 13.2: the horizontal torpedo's cooldown, unlike the vertical's absent one.
  if (session.horizontalCooldown > 0) session.horizontalCooldown -= 1;

  walkEntities(session);                            // 1 -- § 9.4

  // 2. Walk the effects list -- Chapter 15, a separate 32-slot allocator. It
  //    runs AFTER the entity walk, which is also why § 17.2 composites effects
  //    over entities.
  walkEffects(session);

  // 3. Advance sound by EXACTLY ONE (pitch, duration) pair -- always, not one
  //    per sound and never two (§ 9.3, § 18.3). Runs on every tick including
  //    silent ones: the empty ticks are what space the bursts apart.
  advanceSound(session);

  // 4. Render and present -- Chapter 17, presentation. Never called from here.
}
