// seafox/src/core/input.js
//
// Input -- design_spec Chapter 19, sections 19.1 to 19.8. The HUD half of that
// chapter (§ 19.9, § 19.10) is presentation and lives in `presentation/hud.js`.
//
// **One seam** (§ 19.1): every source of control reaches the simulation as the
// pair `session.input.vx / vy`, each axis one of -2, 0 or +2, and nothing
// downstream knows where a value came from. That seam is the whole mechanism by
// which one engine serves both the title-screen demo and a played game -- the
// demo's bounce writes the same two fields the key table does.
//
// **This file contains no DOM.** It reads one pending key from an injected
// source with a single method, `read()`, which returns a key name or null and
// clears itself. `platform/keyboard.js` supplies the real one; a headless
// session gets a null source and runs identically.
//
// **The source is a one-key register, not a queue, and that is faithful rather
// than lazy.** The original reads the Apple's KBD latch, which holds only the
// most recent key until the strobe clears it -- so a flurry of presses between
// two polls collapses to one (§ 19.4), and a key pressed during a Chapter 11
// transition, when nothing polls, is still there for the first poll afterwards
// (§ 19.8: deferred, not discarded). Both fall out of the single slot.

import { fireVerticalTorpedo, fireHorizontalTorpedo } from './weapons.js';

/**
 * § 19.4: eleven bindings -- nine directions and two weapons.
 *
 * **The movement keys are a 3 x 3 block whose geometry is the direction they
 * command**, with the centre key as stop:
 *
 * ```
 *       Y    U    I           (-2,-2)  ( 0,-2)  (+2,-2)
 *       H    J    K           (-2, 0)  ( 0, 0)  (+2, 0)
 *       N    M    ,           (-2,+2)  ( 0,+2)  (+2,+2)
 * ```
 *
 * The ninth key exists because the keyboard scheme is **latched** (§ 19.2): a
 * direction persists until another replaces it, so stopping needs a key of its
 * own. A held scheme would not carry one.
 *
 * @type {Object<string, {vx: number, vy: number}|{fire: string}>}
 */
export const KEY_TABLE = {
  y: { vx: -2, vy: -2 }, u: { vx: 0, vy: -2 }, i: { vx: 2, vy: -2 },
  h: { vx: -2, vy: 0 },  j: { vx: 0, vy: 0 },  k: { vx: 2, vy: 0 },
  n: { vx: -2, vy: 2 },  m: { vx: 0, vy: 2 },  ',': { vx: 2, vy: 2 },
  d: { fire: 'vertical' },
  f: { fire: 'horizontal' },
};

/** § 10.5.3: the key that starts a game, and so selects the keyboard scheme. */
export const START_KEY = ' ';
/** § 19.6: live in both schemes and on the title screen. */
export const PAUSE_KEY = 'escape';
export const SOUND_KEY = 'ctrl+s';

/** § 19.3: the value `session.controller` takes when the start key is used. */
export const SCHEME_KEYBOARD = 'keyboard';

/** A source that never reports a key. The default, so core runs headless. */
export const NULL_KEYS = { read: () => null };

/**
 * Poll input once (§ 19.8).
 *
 * **Called from the two loops of § 9.2 and from nowhere else.** Chapter 11's
 * transitions -- the launch, the fly-in, the outro drain -- deliberately poll
 * nothing (§ 10.6), which is what makes the outro unstoppable.
 *
 * The order below is the original's, and the first three entries sit **ahead of
 * every mode and scheme test** (§ 19.6), which is why they work while the demo
 * is running as well as in a mission.
 *
 * @param {Object} session
 * @returns {void}
 */
export function pollInput(session) {
  const key = session.keys.read();

  // **No key means nothing is written, and that is the latch** (§ 19.2). The
  // velocity pair keeps whatever the last movement key put there; releasing a
  // key does nothing at all, and holding one does nothing extra.
  if (key === null) return;

  // -- live in both schemes, and on the title screen (§ 19.6) ---------------
  if (key === PAUSE_KEY) {
    session.paused = true;
    return;
  }

  if (key === SOUND_KEY) {
    // § 19.7 / § 18.8: this always flips the stored preference, and the
    // preference reaches the speaker only once a mission is running. That
    // second layer is not written here and is not a field: `outputFor` derives
    // suppression from the mission counter, so a preference set on the silent
    // title screen takes effect the moment the counter leaves zero.
    session.sound.enabled = !session.sound.enabled;
    return;
  }

  // -- leaving the title screen (§ 10.5.3) ---------------------------------
  if (key === START_KEY) {
    // **Which input starts the game selects the controller for the session**
    // (§ 19.3), and nothing changes it afterwards.
    if (session.isTitleScreen) {
      session.startRequested = true;
      session.controller = SCHEME_KEYBOARD;
    }
    return;
  }

  // **The demo reads no movement keys.** Its own bounce writes the pair, and
  // the original skips the key table outright while the mission counter is
  // zero rather than letting a keypress steer the demo submarine.
  if (session.isTitleScreen) return;

  // § 19.3: while one scheme is selected the other's controls are inert.
  if (session.controller !== SCHEME_KEYBOARD) return;

  const binding = KEY_TABLE[key];
  if (binding === undefined) return;              // an unbound key does nothing

  if (binding.fire === 'vertical') {
    fireVerticalTorpedo(session);
    return;
  }
  if (binding.fire === 'horizontal') {
    // § 13.2: the drift sign is read off the pair BELOW at launch, which is why
    // firing is a poll-time action and not a deferred one -- the shot inherits
    // the velocity the player is holding at the moment the key is pressed.
    fireHorizontalTorpedo(session);
    return;
  }

  session.input.vx = binding.vx;
  session.input.vy = binding.vy;
}

/**
 * § 19.6: a pause **holds until any input**.
 *
 * The original blocks inside its input routine, freezing the whole game mid-tick;
 * this returns "still paused" from the top of the tick instead. Nothing between
 * the two points has an observable effect while frozen -- no time passes either
 * way -- and stopping the tick is the honest expression of it in a loop we do
 * not get to block.
 *
 * @param {Object} session
 * @returns {boolean} true while the simulation should stay frozen
 */
export function pollPause(session) {
  if (!session.paused) return false;
  if (session.keys.read() !== null) session.paused = false;
  return session.paused;
}
