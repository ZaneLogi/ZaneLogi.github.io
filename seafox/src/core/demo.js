// seafox/src/core/demo.js
//
// The title-screen demo's submarine (design_spec § 10.5.1).
//
// The demo is **the game playing itself**: the same loop, the same spawners, the
// same entity list, with the mission counter at zero. There is no recorded
// input, no script, and no demo-specific movement code -- and this file is the
// whole of the "demo AI":
//
//   Each tick, if an axis's velocity is zero, negate that axis's stored
//   direction and assign it.
//
// That is it. The sub is spawned stationary, a clamp zeroes whichever component
// hits an edge (§ 2.5), and the negation turns the stop into a reversal, so it
// travels diagonally and bounces off the walls.
//
// **It writes the same velocity pair the player's controls write** (§ 19.1).
// Nothing downstream knows which wrote it.
//
// The cadence trap, and the reason Oracle 3 exists: **the bounce test runs every
// tick while the clamp that feeds it runs every second tick** (§ 2.7.3), because
// the clamps live inside the player's handler and the player's period is 2. The
// demo's whole cadence is therefore TWICE what a move-every-tick model predicts.

/** @type {number} § 20.4: both stored directions start here. */
export const DEMO_DIRECTION_SEED = -2;

/**
 * Fresh demo state.
 * @returns {{dirX: number, dirY: number, message: number, messagePosts: number,
 *            verticalFireAttempts: number, horizontalFireAttempts: number}}
 */
export function createDemoState() {
  return {
    /** @type {number} stored horizontal direction; negated on each bounce. */
    dirX: DEMO_DIRECTION_SEED,
    /** @type {number} stored vertical direction. */
    dirY: DEMO_DIRECTION_SEED,
    /** @type {number} which of the two demo messages is posted (§ 19.10.3). */
    message: 0,
    /** @type {number} how many times a message has been posted. */
    messagePosts: 0,
    /**
     * Weapon-fire attempts, counted while § 13.2's torpedoes are unported. They
     * make the two auto-fire rules of § 10.5.1 assertable now -- one attempted
     * every tick, the other 1 in 64 -- and become real spawns when Chapter 13
     * lands.
     * @type {number}
     */
    verticalFireAttempts: 0,
    /** @type {number} */
    horizontalFireAttempts: 0,
  };
}

/**
 * § 9.2 step 7 -- the horizontal bounce, and the message swap that is the same
 * event.
 *
 * **The horizontal bounce also swaps the on-screen message**, choosing between
 * two by the sign of the stored direction. So message changes and wall bounces
 * are one event, and the message cadence is a traverse of the screen -- roughly
 * 254 ticks, which is why the demo's captions change at the pace they do.
 *
 * @param {Object} session
 * @returns {boolean} whether it bounced this tick
 */
export function demoBounceHorizontal(session) {
  if (session.input.vx !== 0) return false;
  const demo = session.demo;
  demo.dirX = -demo.dirX;
  session.input.vx = demo.dirX;
  demo.message = demo.dirX < 0 ? 0 : 1;   // chosen by the sign, § 10.5.1
  demo.messagePosts += 1;
  return true;
}

/**
 * § 9.2 step 8 -- the vertical bounce. Independent of the horizontal one, and
 * it posts no message.
 * @param {Object} session
 * @returns {boolean} whether it bounced this tick
 */
export function demoBounceVertical(session) {
  if (session.input.vy !== 0) return false;
  const demo = session.demo;
  demo.dirY = -demo.dirY;
  session.input.vy = demo.dirY;
  return true;
}
