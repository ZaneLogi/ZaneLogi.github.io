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
 * Split ONE tile's CHR bytes into pixel indices.
 * @param {number[]|Uint8Array} chr  the whole 8192-byte CHR.
 * @param {number} index  tile number (0..511).
 * @returns {Uint8Array} 64 entries, row-major, values 0..3.
 */
export function decodeTile(chr, index) {
  const base = index * 16;
  const px = new Uint8Array(64);
  for (let y = 0; y < 8; y++) {
    const lo = chr[base + y];
    const hi = chr[base + 8 + y];
    for (let x = 0; x < 8; x++) {
      const bit = 7 - x;                 // bit 7 = leftmost pixel
      px[y * 8 + x] = (((hi >> bit) & 1) << 1) | ((lo >> bit) & 1);
    }
  }
  return px;
}

/**
 * Split raw CHR bytes into per-tile pixel indices, all of them, eagerly.
 * The demo viewers want every tile at once; the game does NOT — see TileCache.
 * @param {number[]|Uint8Array} chr  8192 bytes = 512 tiles x 16.
 * @returns {Uint8Array[]} one Uint8Array(64) per tile, row-major, values 0..3.
 */
export function decodeTiles(chr) {
  const count = Math.floor(chr.length / 16);
  const tiles = new Array(count);
  for (let t = 0; t < count; t++) tiles[t] = decodeTile(chr, t);
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

/**
 * LAZY cache of ready-to-blit 8x8 tile canvases. Ask for a (tile, palette); get a
 * canvas back. Built on the first ask, reused forever after.
 *
 * Why lazy rather than decode-everything-up-front (which is what the demo viewers
 * do, deliberately — they exist to show ALL the tiles):
 *   - CHR holds 512 tiles and the ROM has 9 background palette sets of 4 palettes,
 *     plus 4 sprite palettes. That is >18000 possible (tile, palette) canvases. A
 *     title screen touches SIXTEEN. Eager decoding pays for 99.9% it never draws.
 *   - The set actually used is decided by the ROM's data at runtime (a stage's
 *     block codes, an attribute byte, $C31D's live water swap), so there is no
 *     honest up-front list to decode anyway.
 *
 * Why the palette is part of the KEY, not an argument applied later: a NES tile is
 * four pixel INDICES, not four colours. The same brick tile is orange on the title
 * screen (con_bg_pal_03) and grey in a stage — identical CHR bytes, two different
 * images. Keying on the tile alone would hand back the wrong colours the moment a
 * second palette asked for it.
 *
 * The decode itself (decodeTile + paintTile) still writes pixels one at a time —
 * but exactly ONCE per (tile, palette), not once per draw. Drawing is drawImage.
 */
export class TileCache {
  /** @param {number[]|Uint8Array} chr  the whole 8192-byte CHR. */
  constructor(chr) {
    this.chr = chr;
    this._cache = new Map();
    this.decodes = 0;   // instrumentation: how many were really built
  }

  /**
   * @param {number} tile        CHR tile index 0..511 (add CHR_BG_BASE yourself).
   * @param {number[]} palette   4 NES colour indices.
   * @param {number} paletteId   IDENTITY of `palette`, 0..63, stable across calls.
   *                             Callers mint it: BG = set * 4 + attribute (0..35),
   *                             sprites = 36 + slot. An array cannot be a Map key by
   *                             value, and hashing 4 bytes into a string per lookup
   *                             would allocate on the hot path — so the caller, who
   *                             already knows which palette it picked, just says so.
   * @param {boolean} transparent  true for sprites: pixel index 0 is not drawn.
   * @returns {HTMLCanvasElement} an 8x8 canvas.
   */
  get(tile, palette, paletteId, transparent = false) {
    const key = (tile << 7) | (paletteId << 1) | (transparent ? 1 : 0);
    let cv = this._cache.get(key);
    if (cv === undefined) {
      const img = new ImageData(TILE_W, TILE_H);
      paintTile(img, decodeTile(this.chr, tile), palette, 0, 0, transparent);
      cv = imageDataToCanvas(img);
      this._cache.set(key, cv);
      this.decodes++;
    }
    return cv;
  }

  get size() { return this._cache.size; }
}
