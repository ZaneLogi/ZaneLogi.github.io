// seafox/src/core/resources.js
//
// Score, fuel and the magazine -- design_spec Chapter 16, plus § 7.3's scoring
// rules, which only mean anything in the representation this file uses.
//
// **Score is three bytes of binary-coded decimal, and the decimal part is
// normative** (§ 1.3). § 7.3 makes a low byte of `$99` a SENTINEL rather than a
// value -- it means *this type scores by mission* -- and in binary `$99` is an
// ordinary number, so the merchant rule simply never fires. That is the whole
// reason the arithmetic is decimal rather than a convenience.
//
// The values are held here as ordinary integers and converted at the boundary,
// which § 16.7 permits ("how BCD is implemented" is free). What is NOT free is
// that every nibble stays 0-9, which § 20.6 asks to be asserted continuously --
// so `toBcd` is where an out-of-range value would surface.

/** @type {number} § 7.3: a low byte of $99 means "score by mission", not 99 points. */
export const MISSION_SCORED = 0x99;

/** @type {number} § 16.2: a full tank. */
export const FUEL_FULL = 1200;

/** @type {number} § 16.2: subtracted as a decimal pair, per burn. */
export const FUEL_BURN = 10;

/**
 * @type {number} § 16.2: **9 PLAYER UPDATES, which is 18 ticks.**
 *
 * The divider trap in its purest form. The countdown decrements once per player
 * update and the player's period is 2, so endurance is 120 burns x 18 ticks =
 * 2160 ticks. Reading this as ticks halves it, and § 20.7 lists the halving as
 * the signature.
 */
export const FUEL_BURN_UPDATES = 9;

/** @type {number} § 16.3: one magazine, shared by both weapons. */
export const TORPEDOES_FULL = 30;

/** @type {number} six digits, three BCD bytes. */
export const SCORE_MAX = 999999;

/**
 * Convert to packed BCD bytes, least significant first.
 *
 * Exported because the HUD draws digits from these bytes directly (§ 19.9.1) and
 * because it is where an invalid nibble would be caught.
 * @param {number} value a non-negative decimal integer
 * @param {number} bytes how many BCD bytes to produce
 * @returns {number[]} `bytes` values, each two decimal digits, LSB first
 */
export function toBcd(value, bytes) {
  const out = [];
  let v = value;
  for (let i = 0; i < bytes; i++) {
    const pair = v % 100;
    out.push(((pair / 10) << 4) | (pair % 10));
    v = Math.floor(v / 100);
  }
  return out;
}

/**
 * @param {number[]} bcd LSB first
 * @returns {number} the decimal value
 */
export function fromBcd(bcd) {
  let v = 0;
  for (let i = bcd.length - 1; i >= 0; i--) {
    v = v * 100 + ((bcd[i] >> 4) * 10 + (bcd[i] & 0x0F));
  }
  return v;
}

/**
 * Every nibble of a BCD value is 0-9 (§ 20.6).
 * @param {number[]} bcd
 * @returns {boolean}
 */
export function bcdIsValid(bcd) {
  return bcd.every((b) => (b >> 4) <= 9 && (b & 0x0F) <= 9);
}

/**
 * What a kill is worth (§ 7.3).
 *
 * The merchant rule (§ 7.3.1): an ordinary merchant is `(m + 1) x 100`, and
 * **the merchant that empties the quota is `(m + 1) x 1000`** -- a factor of ten,
 * awarded only when the kill counter reaches zero, so **the tenth merchant of a
 * mission is worth more than the other nine together.**
 *
 * @param {number} tableScore the type's score from the dispatch table
 * @param {number} mission 1-5
 * @param {boolean} emptiedQuota whether this kill took the counter to zero
 * @returns {number} points
 */
export function scoreFor(tableScore, mission, emptiedQuota) {
  if (tableScore !== MISSION_SCORED) return tableScore;
  return (mission + 1) * (emptiedQuota ? 1000 : 100);
}

/**
 * The player's resources for one game (§ 16).
 */
export class Resources {
  constructor() {
    /** @type {number} § 16.1: zeroed when a NEW GAME starts, not between missions. */
    this.score = 0;
    /** @type {number} § 16.1: three more bytes of the same shape. */
    this.highScore = 0;
    /** @type {number} § 16.2. */
    this.fuel = FUEL_FULL;
    /** @type {number} § 16.3, shared by both weapons. */
    this.torpedoes = TORPEDOES_FULL;
    /** @type {number} counts down in PLAYER UPDATES, not ticks. */
    this.burnCountdown = FUEL_BURN_UPDATES;
  }

  /**
   * § 10.4: a new game zeroes the score and refills. Missions do not.
   * @returns {void}
   */
  newGame() {
    this.score = 0;
    this.refill();
  }

  /**
   * § 16.4: the resupply **restores** rather than adds -- collecting a payload
   * with fuel remaining does not bank the surplus, and there is no way to exceed
   * the starting values.
   * @returns {void}
   */
  refill() {
    this.fuel = FUEL_FULL;
    this.torpedoes = TORPEDOES_FULL;
    this.burnCountdown = FUEL_BURN_UPDATES;
  }

  /**
   * Burn fuel, called once per PLAYER UPDATE by the player's handler.
   * @returns {void}
   */
  burn() {
    this.burnCountdown -= 1;
    if (this.burnCountdown > 0) return;
    this.burnCountdown = FUEL_BURN_UPDATES;
    this.fuel = Math.max(0, this.fuel - FUEL_BURN);
  }

  /** @returns {boolean} § 11.2 guard 2: both fuel bytes are zero. */
  get dry() {
    return this.fuel <= 0;
  }

  /**
   * Spend one torpedo (§ 16.3). Firing on empty makes a distinct sound and no
   * shot -- **but running out does NOT end the round**: a player with no
   * torpedoes and fuel remaining can still reach a resupply.
   * @returns {boolean} whether a shot was available
   */
  spendTorpedo() {
    // The empty click (§ 18.6, sound 3) is queued by the firing site in
    // weapons.js, not here: it is an event of firing, and this class has no
    // session to queue against.
    if (this.torpedoes <= 0) return false;
    this.torpedoes -= 1;
    return true;
  }

  /**
   * @param {number} points
   * @returns {void}
   */
  award(points) {
    this.score = Math.min(SCORE_MAX, this.score + points);
  }

  /**
   * § 16.1: **the high score is committed on entry to the title screen**, not
   * when a game ends. So a player watching the end-of-game drain is still
   * looking at the previous record; theirs appears as the title screen comes up.
   * @returns {boolean} whether the record was beaten
   */
  commitHighScore() {
    if (this.score <= this.highScore) return false;
    this.highScore = this.score;
    return true;
  }
}
