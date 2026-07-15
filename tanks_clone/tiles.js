// tiles.js -- CHR decode + tile blitting. The faithful renderer's bottom layer.
//
// A NES tile is 8x8 at 2 bits per pixel, stored as two bitplanes: bytes 0-7 are
// plane 0 (low bit), bytes 8-15 are plane 1 (high bit). Bit 7 of each byte is
// the LEFTMOST pixel. So pixel (x, y) = plane1<<1 | plane0, giving 0..3 -- an
// index into a 4-colour palette, not a colour.
//
// Colour index 0 is special, and differs by table:
//   BACKGROUND -- index 0 is the universal backdrop ($3F00). The PPU mirrors
//                 $3F04/$3F08/$3F0C to it, so every BG palette's entry 0 is the
//                 same colour regardless of what the table says. (In this ROM
//                 every palette's entry 0 is $0F anyway, so the mirror never
//                 bites -- but the rule is why it doesn't.)
//   SPRITES    -- index 0 is TRANSPARENT; nothing is drawn.

import { nesRgb } from './palette.js';

export const TILE_W = 8;
export const TILE_H = 8;

/**
 * Split raw CHR bytes into per-tile pixel indices.
 * @param {number[]|Uint8Array} chr  8192 bytes = 512 tiles x 16.
 * @returns {Uint8Array[]} one Uint8Array(64) per tile, row-major, values 0..3.
 */
export function decodeTiles(chr) {
  const count = Math.floor(chr.length / 16);
  const tiles = new Array(count);
  for (let t = 0; t < count; t++) {
    const base = t * 16;
    const px = new Uint8Array(64);
    for (let y = 0; y < 8; y++) {
      const lo = chr[base + y];
      const hi = chr[base + 8 + y];
      for (let x = 0; x < 8; x++) {
        const bit = 7 - x;               // bit 7 = leftmost pixel
        px[y * 8 + x] = (((hi >> bit) & 1) << 1) | ((lo >> bit) & 1);
      }
    }
    tiles[t] = px;
  }
  return tiles;
}

/**
 * Paint one 8x8 tile into an ImageData at (dx, dy), 1:1. Scaling is the
 * caller's job (drawImage with imageSmoothingEnabled = false).
 * @param {ImageData} img      destination.
 * @param {Uint8Array} px      64 pixel indices from decodeTiles.
 * @param {number[]} palette   4 NES colour indices.
 * @param {boolean} transparent  true for sprites: pixel index 0 is skipped.
 */
export function paintTile(img, px, palette, dx, dy, transparent = false) {
  const { data, width, height } = img;
  for (let y = 0; y < 8; y++) {
    const py = dy + y;
    if (py < 0 || py >= height) continue;
    for (let x = 0; x < 8; x++) {
      const pxx = dx + x;
      if (pxx < 0 || pxx >= width) continue;
      const idx = px[y * 8 + x];
      if (transparent && idx === 0) continue;
      const [r, g, b] = nesRgb(palette[idx]);
      const o = (py * width + pxx) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  }
}

/** An offscreen canvas holding `img`, ready for a scaled drawImage. */
export function imageDataToCanvas(img) {
  const cv = document.createElement('canvas');
  cv.width = img.width;
  cv.height = img.height;
  cv.getContext('2d').putImageData(img, 0, 0);
  return cv;
}
