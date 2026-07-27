// lemmings/src/animation.js
//
// Reusable animation-frame advance — the design_spec §12.4 rule, shared by the
// simulation and any presentation. Pure integer logic: no canvas, no wall-clock
// (§1.6). The game advances a lemming's `frame` this way once per game frame;
// the demo advances each gallery sprite the same way on a display clock.

/**
 * Advance one animation frame (§12.4).
 *   - while frame < frames-1: increment, endOfAnimation = false.
 *   - at the last frame: endOfAnimation = true; a LOOP animation wraps to 0,
 *     a ONCE animation holds on the last frame.
 * @param {number} frame current animation-frame index
 * @param {{ frames: number, loop: boolean }} anim frame count + loop mode
 *   (an entry from LEMMING_ANIMATIONS, or a lemming's cached `{frames, loop}`)
 * @returns {{ frame: number, endOfAnimation: boolean }}
 */
export function advanceFrame(frame, anim) {
  if (frame < anim.frames - 1) {
    return { frame: frame + 1, endOfAnimation: false };
  }
  return { frame: anim.loop ? 0 : anim.frames - 1, endOfAnimation: true };
}
