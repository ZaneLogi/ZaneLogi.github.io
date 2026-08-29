// seafox/src/assets/bake.js
//
// The bake of design_spec § 6.3: a stored sprite block plus its parity and
// palette become the runtime pair of § 6.2 -- an ink silhouette and a colour
// bitmap.
//
// This is the COLOUR half. The ink half lives in ink.js and imports nothing,
// because `core/` needs the silhouette for the stencil (§ 3.1) while the palette
// lives in `presentation/` -- and § 1.5's only normative rule is that `core`
// depends on neither of the other two layers. Keeping the halves in separate
// modules is what makes § 3.1's ink/colour split structural rather than a
// convention: `ink` is what core collision reads, `color` is what presentation
// draws, and neither can quietly stand in for the other.
//
// Running the bake at load rather than into the asset file is a free choice under
// § 6.7, and it is the cheap one: the source blocks are under 3 KB and the baked
// pair for every variant is roughly fifteen times that.

import { COLOR } from '../presentation/palette.js';
import { bakeInk, expandLit, decodeBase64, PIXELS_PER_BYTE, boxWidth } from './ink.js';

export { boxWidth };

/**
 * Hue by palette bit and absolute column parity (design_spec § 6.3).
 * @type {number[][]} [paletteBit][columnParity]
 */
const HUE = [
  [COLOR.VIOLET, COLOR.GREEN],   // palette bit 0
  [COLOR.BLUE, COLOR.ORANGE],    // palette bit 1
];

/**
 * @typedef {Object} SpriteBlock  One entry of assets/sprite_blocks.js.
 * @property {number} byteWidth   stored width in bytes
 * @property {number} rows        height in pixels
 * @property {number} phase       parity of the leftmost pixel's screen column
 * @property {number} flip        palette flip, XORed into every palette bit
 * @property {string} bits        base64 of byteWidth*rows source bytes
 * @property {boolean} [verified] false when phase/flip are not established
 * @property {boolean} [phaseLive] true when nothing fixes the object's parity,
 *                                so the draw picks the variant by its current X
 * @property {number} [x]         text strips only: their own screen x
 * @property {number} [y]         text strips only: their own top row
 */

/**
 * @typedef {Object} Sprite  The runtime asset of design_spec § 6.2.
 * @property {number} w           width of the stripped bitmap, in pixels
 * @property {number} h           height, in pixels
 * @property {number} byteWidth   the SOURCE block's byte width, retained for
 *                                collision box extents (design_spec § 6.4)
 * @property {Uint8Array} ink     w*h bytes, 0 or 1 -- the true silhouette
 * @property {Uint8Array} color   colorWidth*h palette indices
 * @property {number} colorWidth  always w -- § 6.3.1 clips the chroma cell to the
 *                                row's ink, so colour shares the ink's box
 * @property {number} minX        where the crop began, in source pixels. Both
 *                                bitmaps are stripped to the ink box, so an
 *                                object's position -- which is its BLOCK's
 *                                top-left -- needs this back on to draw and to
 *                                collide where the game puts it (§ 6.4)
 * @property {number} minY
 * @property {number} phase
 * @property {number} flip
 * @property {boolean} verified
 * @property {boolean} phaseLive
 * @property {number} [x]
 * @property {number} [y]
 */

/**
 * Expand a source block to one byte per pixel: what is lit (from ink.js), and
 * what hue each pixel would take if it turned out to be isolated.
 * @param {SpriteBlock} block
 * @returns {{lit: Uint8Array, hue: Uint8Array, width: number, rows: number}}
 */
function expand(block) {
  const { lit, width, rows } = expandLit(block);
  const raw = decodeBase64(block.bits);
  const hue = new Uint8Array(width * rows);

  for (let y = 0; y < rows; y++) {
    for (let c = 0; c < block.byteWidth; c++) {
      const b = raw[y * block.byteWidth + c];
      // The palette bit covers all seven pixels of its byte, so one sprite may
      // hold more than one palette region -- the ships' masts sit in the other
      // one. Colour is therefore selected per byte, never per sprite.
      const paletteBit = ((b >> 7) & 1) ^ block.flip;
      for (let k = 0; k < PIXELS_PER_BYTE; k++) {
        const x = c * PIXELS_PER_BYTE + k;
        // Column parity is ABSOLUTE screen parity, not position in the sprite.
        hue[y * width + x] = HUE[paletteBit][(block.phase + x) & 1];
      }
    }
  }
  return { lit, hue, width, rows };
}

/**
 * Bake one stored block into its runtime ink + colour pair.
 * @param {SpriteBlock} block
 * @returns {Sprite}
 */
export function bake(block) {
  const { lit, hue, width, rows } = expand(block);

  // The colour bitmap is built over the whole source block and cropped
  // afterwards, because the chroma pass needs each row's full ink span -- the
  // clip of § 6.3.1 is against the SOURCE row, before the box is known.
  const full = new Uint8Array(width * rows);

  // Pass 1 -- chroma. An isolated lit pixel takes a colour and paints a
  // TWO-pixel cell: its own column and the one to its right. That cell is why
  // an every-other-pixel fill reads as solid colour rather than as stripes.
  //
  // **The cell is clipped to the row's ink** (§ 6.3.1): the right-hand column is
  // written only when a lit pixel lies further right on the same row. The cell
  // physically straddles its dot and no integer grid holds that, so a rule has
  // to round it somewhere; rounding it wholly rightward widens the sprite by a
  // column wherever a row's last pixel is isolated. The vertical torpedoes are
  // the case that decides it -- their rows alternate `#.#` and `###`, which
  // round to 4 columns against 3 and leave the shaft visibly ragged.
  //
  // Clipping keeps the gaps filled, which is the half of the rule that carries
  // the picture: `#.#` still renders as three solid columns, not as two dots.
  for (let y = 0; y < rows; y++) {
    let lastLit = -1;
    for (let x = width - 1; x >= 0; x--) if (lit[y * width + x]) { lastLit = x; break; }
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!lit[i]) continue;
      const left = x > 0 && lit[i - 1];
      const right = x + 1 < width && lit[i + 1];
      if (left || right) continue;
      full[i] = hue[i];
      // `x < lastLit` implies `x + 1 < width`, so no bounds test is needed.
      if (x < lastLit && !lit[i + 1]) full[i + 1] = hue[i];
    }
  }

  // Pass 2 -- white, and it overwrites the chroma pass wherever the two meet.
  // A lit pixel with any lit neighbour is white; runs of two or more read as
  // white, isolated pixels as colour.
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!lit[i]) continue;
      const left = x > 0 && lit[i - 1];
      const right = x + 1 < width && lit[i + 1];
      if (left || right) full[i] = COLOR.WHITE;
    }
  }

  // The ink is ink.js's job -- one definition of the silhouette, shared by the
  // stencil and the picture.
  const inkSprite = bakeInk(block);
  const { w, h, minX, minY } = inkSprite;

  // Colour shares the ink's bounding box. Pass 1 writes nothing outside the
  // row's ink span and every lit pixel is coloured, so the two boxes coincide
  // exactly and `colorWidth` is always `w`. It is kept as a field because the
  // renderer and the checks index the colour bitmap with it, and because the
  // two bitmaps stay separately-shaped ideas even where the shapes agree.
  const colorWidth = w;

  const ink = inkSprite.ink;
  const color = new Uint8Array(colorWidth * h);
  for (let y = 0; y < h; y++) {
    const src = (minY + y) * width + minX;
    for (let x = 0; x < colorWidth; x++) color[y * colorWidth + x] = full[src + x];
  }

  /** @type {Sprite} */
  const sprite = {
    w, h, byteWidth: block.byteWidth, ink, color, colorWidth, minX, minY,
    phase: block.phase, flip: block.flip, verified: block.verified !== false,
    phaseLive: block.phaseLive === true,
  };
  if (block.x !== undefined) sprite.x = block.x;
  if (block.y !== undefined) sprite.y = block.y;
  return sprite;
}

/**
 * Bake every block of an asset module.
 * @param {Object<string, SpriteBlock>} blocks
 * @returns {Object<string, Sprite>} same keys, baked values
 */
export function bakeAll(blocks) {
  /** @type {Object<string, Sprite>} */
  const out = {};
  for (const name of Object.keys(blocks)) out[name] = bake(blocks[name]);
  return out;
}

/**
 * Choose between the two baked parities of a live-parity sprite.
 *
 * The death-burst debris is the one object whose parity nothing fixes: no
 * creation site pins it, and the effects walk -- unlike the death frames --
 * never forces it. Four of the twelve burst templates carry an odd `dx`, so
 * those particles change column parity on every step and change hue as they fly.
 * Both parities are baked and the draw picks on the particle's current X.
 *
 * **This is the only colour decision made at draw time** (design_spec § 15.4).
 * Every other object is settled by the bake of § 6.5; if a second caller of this
 * function appears, that claim has stopped being true.
 *
 * @param {Sprite} even  the variant baked at phase 0
 * @param {Sprite} odd   the variant baked at phase 1
 * @param {number} x     the object's current X, in screen pixels
 * @returns {Sprite}
 */
export function forParity(even, odd, x) {
  return (x & 1) ? odd : even;
}
