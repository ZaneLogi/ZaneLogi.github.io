// seafox/src/core/round.js
//
// The round lifecycle -- design_spec Chapter 11 -- and § 10.4's session loop.
//
// A **round** is one submarine's attempt at one mission, and it has three
// phases: setup, play, outro.
//
// ---------------------------------------------------------------------------
// WHY THIS IS A PHASE MACHINE
//
// § 10.4 writes the session as three nested loops with gotos, and § 11 writes
// the transitions as straight-line steps containing blocking waits. Transcribed
// literally that runs an entire game inside one call -- and § 1.6 requires the
// opposite: **the core advances only when it is handed a tick.**
//
// So the control flow becomes what § 1.4 prescribes for exactly this case: an
// explicit state plus timers, stepped one tick at a time, behaviour identical
// and shape ours. The busy-waits become a hold counter; the `goto round setup`
// becomes a phase assignment.
//
// **A hold is a pause with the simulation stopped** -- nothing moves and nothing
// animates -- so a tick spent in one advances the hold counter and does nothing
// else. **The fly-in is not a hold**: the simulation runs normally while the
// submarine swims in, spawners and entities and all.

import { spawnPlayer, PLAYER_BOUNDS, PLAYER_START } from './player.js';
import { resetRoster, KILL_QUOTA, reloadSupplyCooldown } from './spawners.js';
import { createConvoyState } from './convoy.js';
import { STRIP, MISSION_NUMERALS } from './messages.js';
import { playSound, SOUND } from './sound.js';

/**
 * @enum {string} Where the session is. § 10.1's mission counter remains the
 * mode flag; this says which part of a round is running.
 */
export const PHASE = {
  TITLE: 'title',
  SETUP_ICONS: 'setupIcons',
  SETUP_LAUNCH: 'setupLaunch',
  FLY_IN: 'flyIn',
  FLY_IN_HOLD: 'flyInHold',
  PLAY: 'play',
  OUTRO: 'outro',
  DRAIN: 'drain',
};

/**
 * @type {number} § 11.1: **33 ticks**, about 1.1 s at 30 Hz.
 *
 * The original produces this as a counted busy-wait -- three nested loops all
 * loading the same 50, so 50 cubed passes of a DEC/BNE, about 1.1 s at
 * 1.023 MHz -- so the figure is a consequence of processor speed rather than a
 * number anyone chose. It is **the one visible duration in the game that no
 * table determines**, and docs/porting_decisions.md records the choice.
 */
export const HOLD_TICKS = 33;

/** § 11.4: the drain runs up to 20 passes of 11 ticks -- 220 ticks at most. */
export const DRAIN_PASSES = 20;
export const DRAIN_PASS_TICKS = 11;

/** § 11.1.2: the fly-in ends when the player reaches here. */
const FLY_IN_TARGET = 100;

/** § 11.3: the outro's exit, opened off-screen so the player drives off. */
const OUTRO_EXIT_X = 306;
const OUTRO_SPEED = 4;

/**
 * Start a new game (§ 10.4). Score zeroed, three submarines, and
 * `replayMission` set so the first round takes the fresh-submarine path.
 * @param {Object} session
 * @returns {void}
 */
export function newGame(session) {
  session.resources.newGame();
  session.spareSubs = 3;
  session.replayMission = true;
  session.gameOver = false;
  session.ranDry = false;
  session.startRequested = false;
  // § 18.8: **the title screen is silent but the demo keeps queueing**, so a
  // game starting on top of the demo's backlog would open with the demo's
  // audio. This is one of § 18.4's two flush points -- never during play.
  //
  // There is no "apply the preference" step to write: `outputFor` derives
  // suppression from the mission counter rather than storing it, so the
  // preference the title screen set takes effect the moment the counter leaves
  // zero. Storing it would be a second thing to keep in step.
  session.sound.queue.flush();
  nextMission(session);
}

/**
 * Advance to the next mission -- **a single increment** (§ 10.1), which is also
 * the attract-to-game transition, then begin its first round.
 * @param {Object} session
 * @returns {void}
 */
export function nextMission(session) {
  session.mission += 1;
  session.applyRung();
  resetRoster(session.spawners);
  session.killCounter = KILL_QUOTA;
  session.resupplyCount = 0;
  beginSetup(session);
}

/**
 * § 11.1: setup always erases whatever message is posted and posts the mission
 * banner, then forks on `replayMission`.
 * @param {Object} session
 * @returns {void}
 */
export function beginSetup(session) {
  session.messages.erase();
  session.messages.post(STRIP.MISSION, MISSION_NUMERALS[session.mission]);

  session.entities.reset();
  session.effects.reset();
  session.stencil.clear();
  session.convoy = createConvoyState();
  session.playerBounds = Object.assign({}, PLAYER_BOUNDS);
  session.input.vx = 0;
  session.input.vy = 0;

  session.phase = session.replayMission ? PHASE.SETUP_ICONS : PHASE.FLY_IN;
  session.holdTicks = 0;

  if (session.phase === PHASE.FLY_IN) {
    // § 11.1.2: no HUD rebuild -- fuel, torpedoes and the gauges carry over
    // untouched. The player spawns OFF-SCREEN LEFT with the left clamp opened
    // from 28 to 0, and swims in under its own steam.
    session.playerBounds.minX = 0;
    spawnPlayer(session, 0, PLAYER_START.y);
    session.input.vx = 2;
    session.roundLive = true;
  }
  // Chapter 19 draws the SUBS label and the spare-submarine icons; the icons are
  // the player's OWN sprite, not a separate asset (§ 11.1.1, § 19.9.3).
}

/**
 * One tick of whichever transition is running. Returns whether the caller should
 * go on to run an ordinary simulation frame.
 *
 * @param {Object} session
 * @returns {boolean} true when this tick should simulate
 */
export function advanceRound(session) {
  switch (session.phase) {
    case PHASE.SETUP_ICONS:
      // § 11.1.1, hold one: **before the icon is lifted off the rack.** The
      // numbered steps of § 11.1.1 show only the second hold; its own prose says
      // the launch holds twice, and the disassembly puts this one at $6BF6.
      if (holding(session)) return false;
      // The icon lifts to the player's start position, and the launch tone goes
      // out with it (§ 18.6, sound 17). One pair, 19.4 ms -- the longest single
      // burst in the game by a factor of two, and the reason the scheduler in
      // presentation/speaker.js has a tick-rate ceiling.
      playSound(session, SOUND.LAUNCH);
      session.phase = PHASE.SETUP_LAUNCH;
      return false;

    case PHASE.SETUP_LAUNCH:
      // The icon has been lifted to the player's start position and the launch
      // tone queued (Chapter 18, sound 17). Hold two, at $6C23.
      if (holding(session)) return false;
      finishLaunch(session);
      return false;

    case PHASE.FLY_IN: {
      // NOT a hold: the simulation runs normally and the submarine swims in
      // from the left edge, in view, while spawners and entities run.
      const slot = session.playerSlot;
      if (slot !== -1 && session.entities.slots[slot].x >= FLY_IN_TARGET) {
        session.input.vx = 0;
        session.phase = PHASE.FLY_IN_HOLD;
      }
      return true;
    }

    case PHASE.FLY_IN_HOLD:
      if (holding(session)) return false;
      // § 11.1.2 step 4: the left clamp is restored to 28.
      session.playerBounds.minX = PLAYER_BOUNDS.minX;
      finishSetup(session);
      session.phase = PHASE.PLAY;
      return false;

    case PHASE.DRAIN:
      return drainTick(session);

    default:
      return true;
  }
}

/**
 * Count down a hold.
 * @param {Object} session
 * @returns {boolean} true while the hold is still running
 */
function holding(session) {
  if (session.holdTicks === 0) session.holdTicks = HOLD_TICKS;
  session.holdTicks -= 1;
  return session.holdTicks > 0;
}

/**
 * § 11.1.1 steps 3-6, after the second hold.
 * @param {Object} session
 * @returns {void}
 */
function finishLaunch(session) {
  // Erase the lifted icon, and **decrement here, at launch -- not on death.**
  // So the count shown is submarines IN RESERVE, and the one being flown has
  // already been deducted.
  session.spareSubs -= 1;

  // § 11.1.1 step 5: **fill BOTH gauges from the starting values.** This is the
  // fresh-submarine path only -- § 11.1.2's fly-in carries fuel and torpedoes
  // over untouched, which is why the refill lives here and not in the
  // `finishSetup` the two paths share.
  //
  // Without it a submarine inherits the gauges the previous one died with, and
  // the failure is not subtle: run the tanks dry and the next submarine
  // launches at zero fuel, empties on its first burn, and takes every remaining
  // spare down with it in a cascade. ($6C5C-$6C6B fills fuel from $7E19/$7E1A
  // and torpedoes from $7E1F, immediately before the supply reload below.)
  session.resources.refill();

  // **The one spawner cooldown anything ever resets** (§ 11.1.1, § 12.3): the
  // fresh-submarine path reloads the supply submarine's countdown to a full
  // 1000 immediately before the player is placed, so a new submarine always gets
  // the whole interval before its first resupply. § 11.1.2's fly-in does NOT --
  // a cleared mission inherits whatever the counter was left at, and the next
  // resupply can arrive almost at once. The asymmetry is normative.
  reloadSupplyCooldown(session.spawners);

  // Chapter 19: clear the HUD line again -- which is what removes the SUBS
  // display -- and draw FUEL: and TORP: in its place, then fill both gauges.
  spawnPlayer(session, PLAYER_START.x, PLAYER_START.y);
  finishSetup(session);
  session.phase = PHASE.PLAY;
}

/**
 * Both paths finish the same way (§ 11.1).
 * @param {Object} session
 * @returns {void}
 */
function finishSetup(session) {
  session.roundLive = true;
  session.replayMission = false;
  session.gameOver = false;
  session.ranDry = false;
}

/**
 * § 11.2: **three guards, tested at the top of every tick, in this order.**
 *
 * The order is normative because § 11.3 re-tests them in the same order and
 * awards a different outcome depending on which it finds first.
 *
 * Guard 1's phrasing matters: nothing that kills the player writes the alive
 * flag directly. A lethal contact raises an ordinary removal request and the
 * player's own handler clears the flag on its next update, so **death reaches
 * this guard one tick after the hit.**
 *
 * @param {Object} session
 * @returns {boolean} whether the round has ended
 */
export function checkRoundGuards(session) {
  if (session.phase !== PHASE.PLAY) return false;
  if (!session.playerAlive || session.resources.dry || session.killCounter === 0) {
    beginOutro(session);
    return true;
  }
  return false;
}

/**
 * § 11.3. The outro sets up the exit **unconditionally**, then classifies.
 * @param {Object} session
 * @returns {void}
 */
export function beginOutro(session) {
  // The exit, before any classification: double speed so it is visibly brisk,
  // level flight, and the right clamp opened off-screen so the player drives off
  // rather than stopping at the edge. Clearing roundLive is what lets the
  // player's handler flag itself for removal on reaching the new clamp -- and
  // what makes the player invulnerable for the exit (§ 13.1).
  session.input.vx = OUTRO_SPEED;
  session.input.vy = 0;
  session.playerBounds.maxX = OUTRO_EXIT_X;
  session.roundLive = false;

  // Then classify, **in the same order § 11.2 tested**.
  if (!session.playerAlive) {
    lifeLost(session);
  } else if (!session.resources.dry) {
    // Mission complete.
    session.messages.post(STRIP.MISSION_COMPLETE);
    // § 18.6, sound 15: a single pitch held 32 times -- a steady second-long
    // tone, and the only sequence in the game that is not a contour.
    playSound(session, SOUND.MISSION_COMPLETE);
    session.replayMission = false;
    if (session.mission >= 5) session.gameOver = true;
  } else {
    // **Running dry costs a submarine even though nothing killed you.** The only
    // thing distinguishing it on screen is the descent: the vertical velocity
    // becomes +2, so the submarine SINKS as it drifts off rather than leaving
    // level. Then it falls through to life lost.
    //
    // And note what this ordering means: **meeting the quota on the same tick
    // the tanks empty is a LOSS.** Guard 3 ended the round, but this tests fuel
    // first, so the mission is not cleared and the submarine is spent.
    session.ranDry = true;
    session.input.vy = 2;
    lifeLost(session);
  }

  session.phase = PHASE.DRAIN;
  session.drainPass = 0;
  session.drainTicks = 0;
}

/**
 * @param {Object} session
 * @returns {void}
 */
function lifeLost(session) {
  session.replayMission = true;
  if (session.spareSubs === 0) session.gameOver = true;
}

/**
 * § 11.4: up to twenty passes of eleven ticks, so everything on screen finishes
 * its business under the banners -- **220 ticks of ordinary simulation with no
 * input polled**, which is what lets the player's submarine be driven off the
 * screen while the player watches.
 * @param {Object} session
 * @returns {boolean} whether this tick should simulate
 */
function drainTick(session) {
  if (session.drainTicks === 0) {
    // § 11.4's loop posts FIRST, then runs its eleven ticks, and only then tests
    // for an empty screen -- so the early stop is a TAIL test and the first pass
    // always runs. Testing emptiness first instead ends a drain that had nothing
    // left to finish without ever posting the banners, which is exactly the case
    // that matters: the game is over, the screen is clear, and GAME OVER is the
    // only thing left to say.
    const drained = session.entities.liveCount === 0 && session.effects.liveCount === 0;
    if (session.drainPass >= DRAIN_PASSES || (session.drainPass > 0 && drained)) {
      endDrain(session);
      return false;
    }
    // Re-posted on EVERY pass, because the loop re-tests both flags each time
    // round rather than drawing once before it starts (§ 19.10.3). This is
    // invisible -- the same strip into the same position with the same content
    // -- and is a consequence of the loop's shape, not an effect.
    if (session.ranDry) session.messages.postDirect(STRIP.OUT_OF_FUEL);
    if (session.gameOver) session.messages.postDirect(STRIP.GAME_OVER);
    session.drainPass += 1;
    session.drainTicks = DRAIN_PASS_TICKS;
  }
  session.drainTicks -= 1;
  return true;
}

/**
 * The drain is over: both lists cleared, both banners erased unconditionally,
 * and the right clamp restored (§ 11.4). Then § 10.4 decides what happens next.
 * @param {Object} session
 * @returns {void}
 */
function endDrain(session) {
  session.entities.reset();
  session.effects.reset();
  session.stencil.clear();
  // § 19.10.3: **MISSION COMPLETE is removed HERE, at the end of the drain** --
  // not by the next setup's erase. The MISSION banner is still underneath it and
  // must survive until that setup takes it (§ 11.1).
  //
  // Without this the stack gets one pop per round against two posts, so the next
  // setup pops MISSION COMPLETE, leaves the old banner in place, and posts the
  // new one on top of it: MISSION ONE and MISSION TWO drawn over each other on
  // the same seven rows, one more every mission.
  session.messages.eraseStrip(STRIP.MISSION_COMPLETE);
  session.messages.eraseDirect();
  session.playerBounds.maxX = PLAYER_BOUNDS.maxX;

  if (session.gameOver) {
    session.returnToTitle();
  } else if (session.replayMission) {
    beginSetup(session);                  // the same mission again
  } else {
    nextMission(session);
  }
}
