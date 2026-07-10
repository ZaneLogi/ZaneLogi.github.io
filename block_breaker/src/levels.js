// levels.js -- decode an Arkanoid-MSX level's brick bitmask + colour list into a
// 2D grid. Reusable by both the level viewer (now) and the future game.
//
// Faithful port of the brick-paint loop at disassembly.asm:2707-2806 (label
// L5C7E): walk the 17-byte bitmask MSB-first; each set bit is a present brick
// and consumes the next byte from the colour list (which is why absent cells
// don't advance the colour cursor). See block_breaker/CLAUDE.md for the format.
//
// Grid geometry: 132 usable cells. Strong evidence (tilemap is 22 chars = 11
// bricks wide, BRICK_COL runs 0..10) says 11 columns x 12 rows, row-major, with
// the final 4 bits of the 136-bit field unused. decodeLevel() takes (cols, rows)
// so the orientation is trivially flippable if the viewer proves otherwise.

export const COLS = 11;
export const ROWS = 12;

/**
 * @param {{bitmask:number[], colors:number[]}} level  one entry from levels.json
 * @param {number} cols  bricks per row (default 11)
 * @param {number} rows  rows (default 12)
 * @returns {{grid:(number|null)[][], present:number}}
 *   grid[r][c] = brick colour-index (0..9) or null (empty).
 *   present    = number of set bits consumed (== colours used).
 */
export function decodeLevel(level, cols = COLS, rows = ROWS) {
  const { bitmask, colors } = level;
  const grid = Array.from({ length: rows }, () => new Array(cols).fill(null));

  let cell = 0;           // linear 0..cols*rows-1, row-major
  let colorCursor = 0;    // next unused colour byte
  const total = cols * rows;

  // 17 bytes x 8 bits, MSB first -- exactly the L5C7E outer/inner loop order.
  for (let byte = 0; byte < bitmask.length && cell < total; byte++) {
    const bits = bitmask[byte];
    for (let bit = 7; bit >= 0 && cell < total; bit--) {
      if ((bits >> bit) & 1) {
        const r = (cell / cols) | 0;
        const c = cell % cols;
        grid[r][c] = colors[colorCursor++];
      }
      cell++;
    }
  }
  return { grid, present: colorCursor };
}
