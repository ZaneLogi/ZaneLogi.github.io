// seafox/src/presentation/sprites.js
//
// The baked artwork the renderer draws from -- design_spec § 6.2's runtime
// asset, one bake at load, shared by every draw.
//
// This is the COLOUR half of the split. `core/stencil.js` bakes the same blocks
// for their ink and never looks at colour; nothing here is imported by `core/`,
// and nothing here knows what any of these bitmaps mean.
//
// **Three tables, and the third is the interesting one.**
//
// `SPRITES` is every block at the phase and palette its use site gives it
// (§ 6.5), so an entity draws by name and takes no colour decision at all.
//
// `DIGITS` is the HUD font (§ 19.9), baked through the same two passes even
// though every glyph comes out white: the bake is where "white" is DECIDED, and
// hand-filling the digits with palette index 5 would be asserting the outcome
// rather than computing it.
//
// `POSTED` is the nine strips a posting can flip. A posted strip's palette bit
// is XORed on every one of its own postings and written back (§ 19.10.1), so
// the strip alternates between two colours for the life of the session. That is
// a second colour per strip, not a second colour decision: both variants bake
// up front, and the draw picks by the post's parity. The two direct-blit
// banners are deliberately absent -- they never flip (§ 19.10.1).

import { SPRITE_BLOCKS } from '../../assets/sprite_blocks.js';
import { DIGIT_FONT } from '../../assets/digit_font.js';
import { bake, bakeAll } from '../assets/bake.js';

/** @type {Object<string, Object>} every block at its own phase and palette. */
export const SPRITES = bakeAll(SPRITE_BLOCKS);

/** @type {Object[]} the ten HUD glyphs, indexed by the digit they draw. */
export const DIGITS = DIGIT_FONT.map(bake);

/**
 * The strips whose palette a posting flips (§ 19.10.1) -- the four banner
 * strings and the five mission numerals.
 *
 * `OUT OF FUEL` and `GAME OVER` are not here: they are direct blits, drawn in
 * their fixed colour with no flip and no stack entry.
 *
 * @type {string[]}
 */
export const POSTED_STRIPS = [
  'stripMission', 'stripMissionComplete', 'stripDemoMessageA', 'stripDemoMessageB',
  'stripOne', 'stripTwo', 'stripThree', 'stripFour', 'stripFive',
];

/** @type {Object<string, Object>} the same nine strips at the other palette. */
export const POSTED = {};
for (const name of POSTED_STRIPS) {
  const block = SPRITE_BLOCKS[name];
  POSTED[name] = bake({ ...block, flip: block.flip ^ 1 });
}

/**
 * One strip at the palette a given posting draws it in.
 *
 * `flip` is the POST parity from `core/messages.js`, not an absolute colour: 0
 * is the strip as it ships and 1 is its other palette. So the numerals keep
 * shipping opposite to the word they sit beside (§ 6.6.1) while alternating in
 * step with it, which is what makes the banner read as two colours rather than
 * one.
 *
 * @param {string} name a key of SPRITE_BLOCKS
 * @param {number} [flip] 0 or 1, the posting's parity
 * @returns {Object} the baked sprite
 */
export function stripSprite(name, flip = 0) {
  return flip && POSTED[name] ? POSTED[name] : SPRITES[name];
}
