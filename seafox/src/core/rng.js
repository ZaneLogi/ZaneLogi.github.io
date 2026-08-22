// seafox/src/core/rng.js
//
// The game's only source of randomness (design_spec § 5). There is no clock
// entropy, no input-timing entropy and no second generator, and this one is
// NEVER reseeded -- not between rounds, not between missions, not between
// games. It runs continuously for the life of the process.
//
// That is not a detail: it is what makes the whole game reproducible from a
// cold start (§ 1.6), and every oracle in Chapter 20 rests on it. Reseeding
// this anywhere silently destroys all four.
//
// Only s2 and s3 are recurrent. s1 is recomputed from the other two on every
// step and never influences the next one -- an implementation may store two
// bytes and derive the third (§ 5.2). It is kept here so that a state dump
// matches § 5.3's table, and because it is the value the recurrence folds
// into s3.
//
// Consumers STEP, then read s2, masking down when they want fewer bits.
// § 5.4 establishes that bit 0 of s2 is rewritten every step and carries
// nothing forward, so a consumer wanting a single bit must not take the low
// one -- § 8.4's enemy-submarine entry-side coin flip samples bit 1 for
// exactly this reason.

/**
 * The shipped state (§ 5.3). The generator starts here on a cold boot and is
 * never returned to it.
 * @type {Readonly<{s1: number, s2: number, s3: number}>}
 */
export const INITIAL_STATE = Object.freeze({ s1: 0xA0, s2: 0xC6, s3: 0x57 });

/**
 * One step of the recurrence (§ 5.2), as a pure function of the two recurrent
 * bytes. Kept separate from the class so the exhaustive oracles of § 20.2 can
 * sweep the state space without allocating a generator per state, and so the
 * recurrence has exactly one definition.
 * @param {number} s2 recurrent byte, 0-255
 * @param {number} s3 recurrent byte, 0-255
 * @returns {{s1: number, s2: number, s3: number}} the successor state
 */
export function stepState(s2, s3) {
  const carry = s3 & 1;
  const s1 = ((carry << 7) | (s2 >> 1)) & 0xFF;  // s2 >> 1, s3's low bit in at the top
  s2 = (s2 & 1) ^ s2;                            // clears bit 0
  s3 = s1 ^ s3;
  s2 = s3 ^ s2;
  return { s1, s2, s3 };
}

/** The game's random number generator. One instance exists in a running game. */
export class Rng {
  /**
   * @param {{s1?: number, s2: number, s3: number}} [state] starting state.
   *   Defaults to § 5.3; pass one only to build an oracle harness.
   */
  constructor(state = INITIAL_STATE) {
    /** @type {number} derived every step; never influences the next one. */
    this.s1 = state.s1 ?? 0;
    /** @type {number} recurrent. */
    this.s2 = state.s2;
    /** @type {number} recurrent. */
    this.s3 = state.s3;
    /**
     * Steps taken. Not part of the generator -- it exists because DRAW ORDER
     * is normative (§ 5.6) and a site that draws the wrong number of times
     * desynchronises every later random decision without changing any single
     * spawn table. Oracle 2 (§ 20.3) asserts against this.
     * @type {number}
     */
    this.draws = 0;
  }

  /**
   * Advance one step and return the byte a consumer reads (§ 5.2).
   * @returns {number} the new s2, 0-255
   */
  step() {
    const next = stepState(this.s2, this.s3);
    this.s1 = next.s1;
    this.s2 = next.s2;
    this.s3 = next.s3;
    this.draws++;
    return this.s2;
  }

  /**
   * A copy of the current state, for debugging and for the oracles.
   * @returns {{s1: number, s2: number, s3: number}}
   */
  getState() {
    return { s1: this.s1, s2: this.s2, s3: this.s3 };
  }
}
