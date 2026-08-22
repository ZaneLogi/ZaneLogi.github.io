// seafox/src/assets/ink.js
//
// The ink half of the bake (design_spec § 6.1): the true pixel silhouette,
// stripped to its bounding box, one byte per pixel.
//
// **This module imports nothing.** That is the point of its existence rather
// than an accident: `core/` needs the ink, because § 3.1 makes the stencil --
// and therefore collision -- read the silhouette and never the colour bitmap.
// The colour half needs the palette, which lives in `presentation/`, and § 1.5's
// only normative rule is that `core` depends on neither of the other two layers.
// Splitting the two halves is what keeps that true; bake.js builds the colour
// pass on top of this.
//
// So the ink/colour split of § 3.1 is structural here, not a convention:
//
//   * `ink` drives the stencil and collision -- `core/`
//   * `color` drives the display -- `presentation/`
//
// Using either for the other's job is a conformance failure, and a quiet one:
// the game stays playable and the hitboxes are wrong by a pixel (§ 6.1).

/** Pixels packed into one source byte. Bit 7 is the palette bit, not a pixel. */
export const PIXELS_PER_BYTE = 7;

/**
 * @typedef {Object} InkSprite
 * @property {number} w          width of the stripped bitmap, in pixels
 * @property {number} h          height, in pixels
 * @property {number} byteWidth  the SOURCE block's byte width, retained (§ 6.4)
 * @property {Uint8Array} ink    w*h bytes, 0 or 1 -- the true silhouette
 * @property {number} minX       where the strip began, so the colour pass can align
 * @property {number} minY
 * @property {number} srcWidth   the unstripped width, byteWidth * 7
 */

/**
 * Decode a base64 payload to bytes.
 * @param {string} b64
 * @returns {Uint8Array}
 */
export function decodeBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Expand a source block's lit pixels to one byte per pixel.
 * @param {Object} block one entry of assets/sprite_blocks.js
 * @returns {{lit: Uint8Array, width: number, rows: number}}
 */
export function expandLit(block) {
  const raw = decodeBase64(block.bits);
  const width = block.byteWidth * PIXELS_PER_BYTE;
  const rows = block.rows;
  const lit = new Uint8Array(width * rows);
  for (let y = 0; y < rows; y++) {
    for (let c = 0; c < block.byteWidth; c++) {
      const b = raw[y * block.byteWidth + c];
      for (let k = 0; k < PIXELS_PER_BYTE; k++) {
        lit[y * width + c * PIXELS_PER_BYTE + k] = (b >> k) & 1;
      }
    }
  }
  return { lit, width, rows };
}

/**
 * Bake one block's ink: the lit pixels, stripped to their bounding box.
 *
 * The source blocks reserve blank working columns on the right, and stripping
 * them is exactly what makes `byteWidth` worth retaining -- collision box
 * extents derive from the BYTE width, not from the stripped pixel width (§ 6.4).
 * Recomputing a box from the stripped bitmap yields boxes that are equal or
 * tighter, never looser, and a game whose weapons miss slightly more often than
 * they should with no symptom that points at the cause.
 *
 * @param {Object} block
 * @returns {InkSprite}
 */
export function bakeInk(block) {
  const { lit, width, rows } = expandLit(block);

  let minX = width, maxX = -1, minY = rows, maxY = -1;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < width; x++) {
      if (!lit[y * width + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error('sprite block has no lit pixel');

  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const ink = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const src = (minY + y) * width + minX;
    for (let x = 0; x < w; x++) ink[y * w + x] = lit[src + x];
  }

  return { w, h, byteWidth: block.byteWidth, ink, minX, minY, srcWidth: width };
}

/**
 * Bake every block's ink.
 * @param {Object<string, Object>} blocks
 * @returns {Object<string, InkSprite>}
 */
export function bakeAllInk(blocks) {
  /** @type {Object<string, InkSprite>} */
  const out = {};
  for (const name of Object.keys(blocks)) out[name] = bakeInk(blocks[name]);
  return out;
}

/**
 * The collision box width in pixels, derived from the SOURCE byte width (§ 6.4).
 *
 * Entity blocks reserve blank columns at their right edge as working space, and
 * the original sized its boxes to the ink by deriving the extent from the byte
 * width rather than the pixel width. Text strips reserve no such space, so a
 * strip's drawn width is `byteWidth * 7` -- but strips never collide, so no box
 * is computed for them (§ 6.6.1).
 *
 * @param {{byteWidth: number}} sprite
 * @returns {number} box width in pixels; extents are inclusive, so 0 is one pixel
 */
export function boxWidth(sprite) {
  return (sprite.byteWidth - 1) * PIXELS_PER_BYTE;
}
