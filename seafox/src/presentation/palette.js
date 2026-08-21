// seafox/src/presentation/palette.js
//
// The six palette entries of design_spec § 3.4. Index 0 is the background and
// the only transparent value in a sprite's colour bitmap.
//
// The palette is normative in its DISTINCTIONS -- the four hues are what tell
// the ten merchant vessels apart -- but the exact RGB values are reference
// values, and a display may tune them.

/** @enum {number} Palette index. A sprite's `color` bitmap holds these. */
export const COLOR = {
  BACKGROUND: 0,
  VIOLET: 1,
  GREEN: 2,
  BLUE: 3,
  ORANGE: 4,
  WHITE: 5,
};

/** @type {string[]} Reference RGB per palette index, for CSS and debugging. */
export const PALETTE_HEX = [
  '#000000',  // background
  '#D030D0',  // violet
  '#30D030',  // green
  '#3060F0',  // blue
  '#F08020',  // orange
  '#FFFFFF',  // white
];

/** @type {string[]} Human names per palette index. */
export const PALETTE_NAMES = [
  'background', 'violet', 'green', 'blue', 'orange', 'white',
];

/**
 * The palette as packed little-endian RGBA words, for `putImageData`.
 * Index 0 is fully transparent so it can be composited; the colour buffer
 * itself treats it as open water.
 * @param {number} [backgroundAlpha] alpha for index 0, 0-255. Default 0.
 * @returns {Uint32Array} six words, indexed by palette index.
 */
export function paletteRgba(backgroundAlpha = 0) {
  const out = new Uint32Array(PALETTE_HEX.length);
  for (let i = 0; i < PALETTE_HEX.length; i++) {
    const v = parseInt(PALETTE_HEX[i].slice(1), 16);
    const a = i === COLOR.BACKGROUND ? backgroundAlpha : 255;
    out[i] = (a << 24) | ((v & 0xFF) << 16) | ((v >> 8 & 0xFF) << 8) | (v >> 16 & 0xFF);
  }
  return out;
}
