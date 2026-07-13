// tiles.js -- the faithful MSX brick renderer. Turns the extracted TILES
// (assets/dat_tiles.js: patterns + colors + colorToPattern) into ready-to-blit
// bitmaps, and draws a brick as its two 8x8 tiles.
//
// Each pixel's colour is taken straight from the source data: the pattern bit
// (1 = on, 0 = off) selects the row's fg vs bg colour byte -- so the result is
// pixel-identical to the MSX. See block_breaker/CLAUDE.md "Tile data extraction".
//
//   brick colour-index i  ->  colorToPattern[2i]   (left  8x8 char)
//                             colorToPattern[2i+1] (right 8x8 char)   = a 16x8 brick

import { MSX_PALETTE } from './palette.js';

// '#rrggbb' -> [r,g,b]; null (palette index 0) stays null = transparent.
function toRgb(hex) {
  return hex ? [parseInt(hex.slice(1, 3), 16),
                parseInt(hex.slice(3, 5), 16),
                parseInt(hex.slice(5, 7), 16)] : null;
}

// buildTileBitmaps: TILES -> 256 offscreen 8x8 <canvas>, indexed by char code,
// built once at load. Canvases (not raw ImageData) so they can be drawImage'd
// SCALED -- putImageData ignores scale. patterns[code*8+r] = shape byte (MSB =
// leftmost); colors[code*8+r] = (fg<<4)|bg, the two palette indices for row r.
export function buildTileBitmaps(TILES, palette = MSX_PALETTE) {
  const { patterns, colors } = TILES;
  const pal = palette.map(toRgb);
  const tiles = new Array(256);
  for (let code = 0; code < 256; code++) {
    const cv = document.createElement('canvas');
    cv.width = 8;
    cv.height = 8;
    const g = cv.getContext('2d');
    const img = g.createImageData(8, 8);
    for (let r = 0; r < 8; r++) {
      const pat = patterns[code * 8 + r];
      const fg = colors[code * 8 + r] >> 4;
      const bg = colors[code * 8 + r] & 0x0f;
      for (let x = 0; x < 8; x++) {
        const idx = ((pat >> (7 - x)) & 1) ? fg : bg;   // this pixel's palette index
        const rgb = pal[idx];
        const p = (r * 8 + x) * 4;
        if (rgb) {
          img.data[p] = rgb[0];
          img.data[p + 1] = rgb[1];
          img.data[p + 2] = rgb[2];
          img.data[p + 3] = 255;
        }                                                // else leave transparent
      }
    }
    g.putImageData(img, 0, 0);
    tiles[code] = cv;
  }
  return tiles;
}

// drawBrick: blit brick colour-index i as its two tiles, scaled into (x,y,w,h).
// Nearest-neighbour (imageSmoothingEnabled = false) keeps the pixels crisp.
export function drawBrick(ctx, tiles, colorToPattern, i, x, y, w, h) {
  ctx.imageSmoothingEnabled = false;
  const half = w / 2;
  ctx.drawImage(tiles[colorToPattern[2 * i]], x, y, half, h);
  ctx.drawImage(tiles[colorToPattern[2 * i + 1]], x + half, y, half, h);
}
