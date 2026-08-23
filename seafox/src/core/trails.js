// seafox/src/core/trails.js
//
// The creation sites of design_spec § 15.5 to § 15.7 -- everything that makes an
// effect except the death burst, which is burst.js.
//
// **Almost every effect here is a one-tick stationary mark, re-created each time
// its parent updates.** That is why they track their parent exactly and need no
// following logic at all: nothing chases anything, the mark is simply made
// again. Only the death burst and the depth charge's splash carry velocity and
// outlive a tick.
//
// The parity notes below are not decoration. § 15.4 makes this system force no
// parity of its own -- the effects walk never touches the low bit of X -- so an
// effect's colour is whatever its creator's X plus a constant offset makes it,
// and it survives only while the effect's own dx is even. Each site therefore
// fixes a variant, and § 15.5 records which.

/** @type {number} § 15.5: every trail mark takes exactly one step, and dies on it. */
const MARK_LIFETIME = 1;

/**
 * **How long each mark STANDS before taking that one step** (§ 15.9), which is
 * what decides how long a trail is. Each value is its creation site's own, and
 * they differ per site -- this is not one shared number.
 *
 * The vertical torpedo's is the one to check a port against: 31, laid every 4
 * ticks behind a shot climbing 1 px per tick, is **eight dots 4 px apart**, and
 * the oldest drops off as each new one appears.
 *
 * @type {Object<string, number>}
 */
export const MARK_DELAY = {
  verticalDot: 31,      // 8 dots
  horizontalBlob: 10,   // ~3 blobs, 8 px apart
  enemyDot: 5,          // ~3 dots, 6 px apart
  splash: 2,            // the three thrown dots step almost at once
  bubble: 16,           // ~4 bubbles behind a sinking charge
};

/**
 * A single-pixel dot (§ 15.4).
 *
 * The two player-torpedo dot sites land **even** because both parents sit at odd
 * X and both offsets are odd; the enemy torpedo's lands **odd** because that
 * parent sits at even X. The parity is taken from the mark's own X, which is
 * what produces those outcomes rather than asserting them.
 *
 * @param {Object} session
 * @param {number} x
 * @param {number} y
 * @returns {void}
 */
export function trailDot(session, x, y, delay) {
  session.effects.spawn({ x, y, sprite: 'dot', lifetime: MARK_LIFETIME, stepReload: delay });
}

/**
 * A two-pixel blob -- adjacent pixels, so it renders white and **has no hue at
 * all** (§ 6.3). Neither the parity bit nor the flip bit reaches it.
 * @param {Object} session
 * @param {number} x
 * @param {number} y
 * @returns {void}
 */
export function trailBlob(session, x, y, delay) {
  session.effects.spawn({ x, y, sprite: 'blob', lifetime: MARK_LIFETIME, stepReload: delay });
}

/**
 * The depth charge's sinking bubble: a blob every 4 ticks (§ 15.5).
 * @param {Object} session
 * @param {number} x
 * @param {number} y
 * @returns {void}
 */
export function bubble(session, x, y) {
  trailBlob(session, x, y, MARK_DELAY.bubble);
}

/**
 * **The splash is thrown upward** (§ 15.6).
 *
 * Three dots at the entry point, all carrying `dy = -2` and differing only in
 * `dx` -- a three-way fan thrown UP at the moment the charge enters the water,
 * not anything thrown backward. Lifetime 5, so unlike almost every other mark
 * here these outlive the tick that made them.
 *
 * All three velocities are even, so the dots keep the parity they are born at
 * for their whole five ticks.
 *
 * @param {Object} session
 * @param {number} x
 * @param {number} y
 * @returns {void}
 */
export function splash(session, x, y) {
  for (const dx of [-2, 0, 2]) {
    session.effects.spawn({
      x, y, dx, dy: -2, sprite: 'dot', lifetime: 5, stepReload: MARK_DELAY.splash,
    });
  }
}

/**
 * A ship's wake (§ 15.5), and **both details the specification calls easy to get
 * backwards**:
 *
 *   * **It goes off the STERN, and the stern depends on direction.** The
 *     hospital ship and the merchants travel right, so their wake is placed 7 px
 *     to the LEFT; the Destroyer travels left, so its wake is placed 29 px to
 *     the RIGHT. Placing both on the same side puts a wake in front of half the
 *     traffic.
 *   * **A wake inverts its parent's parity**, because both stern offsets are
 *     odd. The hospital ship and the Destroyer travel at even X, so their wakes
 *     are odd; the merchant roster spawns records at *both* parities (§ 12.5),
 *     so merchant wakes occur at both and the record that spawned the ship picks
 *     the variant.
 *
 * The right-travelling ships also **suppress the mark while still too close to
 * the left edge to subtract**.
 *
 * Cadence is the caller's: this is made once per PARENT UPDATE, and those
 * parents are divided down, so a wake is a single mark for one tick in every 3
 * (hospital ship), 5 (Destroyer) or 7 (merchant) -- not one every tick.
 *
 * @param {Object} session
 * @param {Object} e the parent ship
 * @param {boolean} travellingRight
 * @returns {void}
 */
export function wake(session, e, travellingRight) {
  let x;
  if (travellingRight) {
    if (e.x < 7) return;                  // too close to the left edge to subtract
    x = e.x - 7;
  } else {
    x = e.x + 29;
  }
  // **A wake's delay is its PARENT's update period**, so each ship holds exactly
  // one wake mark: the old one expires as the ship's next update lays the next.
  // That is why a wake never reads as a trail while a torpedo's does.
  session.effects.spawn({
    x, y: e.y + 7, sprite: 'streak', lifetime: MARK_LIFETIME, stepReload: e.updatePeriod,
  });
}
