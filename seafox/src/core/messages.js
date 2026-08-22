// seafox/src/core/messages.js
//
// Banners and messages -- design_spec § 19.10, the state half of it.
//
// **Text outside the HUD line reaches the screen by two different paths, and
// which path a strip uses determines both how it is removed and whether it
// changes colour.** That is not a rendering detail: it is why the mission banner
// is a different colour every round, and why the drain has to erase two specific
// banners unconditionally.
//
// **The message stack** -- the demo messages, the `MISSION` banner and
// `MISSION COMPLETE`. Posting pushes and draws; erasing pops the top entry and
// undraws it. Messages NEST: posting a second does not remove the first, and
// erasing removes the most recent. Erasing an empty stack does nothing.
//
// **Each post also flips that strip's palette, permanently.** The flip is
// written back into the strip itself, so the *next* post starts from the flipped
// value and flips again -- a stack-posted strip therefore alternates between its
// two colours every time it is shown.
//
// **Direct blit** -- `OUT OF FUEL` and `GAME OVER`. These bypass the stack
// entirely: drawn where their header says, in their fixed colour, with no
// palette flip and no stack entry. Because nothing on the stack represents them,
// they must be erased explicitly, which is what the unconditional erase at the
// end of the drain is for (§ 11.4).
//
// Only the state lives here. Chapter 17 draws it, and § 6.6.1 already fixes each
// strip's own position -- neither X nor Y is supplied by the code that posts it.

/** The strips this module knows how to post. Positions are the strips' own. */
export const STRIP = {
  MISSION: 'stripMission',
  MISSION_COMPLETE: 'stripMissionComplete',
  OUT_OF_FUEL: 'stripOutOfFuel',
  GAME_OVER: 'stripGameOver',
  DEMO_A: 'stripDemoMessageA',
  DEMO_B: 'stripDemoMessageB',
};

/** § 6.6.1: the five numerals, which share one position to the right of the word. */
export const MISSION_NUMERALS = [
  null, 'stripOne', 'stripTwo', 'stripThree', 'stripFour', 'stripFive',
];

/**
 * The posted-text state.
 */
export class Messages {
  constructor() {
    /**
     * The stack, most recent last. Strips nest rather than replace.
     * @type {{strip: string, numeral: string|null, flip: number}[]}
     */
    this.stack = [];
    /**
     * The two direct-blit banners, which are not on the stack.
     * @type {Set<string>}
     */
    this.direct = new Set();
    /**
     * Each stack-posted strip's palette flip, **kept across posts**. This is the
     * field § 19.10.1 says is written back into the strip itself, so the next
     * post starts from the flipped value and flips again.
     * @type {Object<string, number>}
     */
    this.flips = {};
  }

  /**
   * Post a strip onto the stack, flipping its palette permanently.
   * @param {string} strip
   * @param {string} [numeral] the mission numeral, which shares the banner's row
   * @returns {number} the flip this post is drawn at
   */
  post(strip, numeral) {
    const flip = (this.flips[strip] || 0) ^ 1;
    this.flips[strip] = flip;
    this.stack.push({ strip, numeral: numeral || null, flip });
    return flip;
  }

  /**
   * Pop the most recent stack entry. Erasing an empty stack does nothing.
   * @returns {Object|null} what was removed
   */
  erase() {
    return this.stack.length ? this.stack.pop() : null;
  }

  /**
   * Post a direct-blit banner: no stack entry, no palette flip, fixed colour.
   *
   * The drain re-posts these on **every pass**, up to twenty times (§ 19.10.3),
   * because the loop re-tests both flags each time round rather than drawing
   * once before it starts. **This is invisible** -- compositing the same strip
   * into the same position with the same content changes nothing after the
   * first. It is a consequence of the loop's shape, not an effect.
   * @param {string} strip
   * @returns {void}
   */
  postDirect(strip) {
    this.direct.add(strip);
  }

  /**
   * Erase both direct banners **unconditionally**, whether they were ever shown
   * or not (§ 11.4).
   * @returns {void}
   */
  eraseDirect() {
    this.direct.clear();
  }

  /** @param {string} strip @returns {boolean} */
  isPosted(strip) {
    return this.direct.has(strip) || this.stack.some((m) => m.strip === strip);
  }

  /** @returns {Object|null} the top of the stack. */
  get top() {
    return this.stack.length ? this.stack[this.stack.length - 1] : null;
  }
}
