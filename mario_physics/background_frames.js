// background_frames.js -- SMB background metatiles -> drawable 16x16 blocks.
//
// The background analog of sprite_frames.js. Where that file assembles the
// player's 2-wide sprite rows, this one assembles a 2x2 background metatile: four
// 8x8 tiles from the background pattern table (PPU $1000, tiles 256..511 in the
// decoded array). Everything SMB-specific about a *background* block lives here.
//
// A metatile is stored as four tile ids in the order [upper-left, lower-left,
// upper-right, lower-right] -- SMB's Palette{N}_MTiles format (SMBDIS.ASM
// Palette1_MTiles: `.db $47,$47,$47,$47 ;breakable brick`, where the single
// crosshatch tile $47 repeats 2x2). One thing always differs from a sprite: there
// is no per-row mirror. Pixel index 0 is the backdrop: opaque by default (a solid
// block like the brick, no holes behind it), or transparent when `transparent` is
// set -- which a free-floating bg-tile object needs (a coin, whose index-0 area
// around the oval must show the scene through it, not a black box).

import { paintTile } from './chr_decoder.js';
import { tiles } from './chr_tiles.js';

export const MTILE_SIZE = 16;   // 2x2 of 8x8, the CHR's own size at 1x
const BG_BASE = 256;            // background pattern table = tiles 256..511 (PPU $1000)

/** A drawable with the same shape sprite_frames' produces and the Animator expects. */
function drawable(cv) {
  return {
    draw(ctx, x, y, mirror = false) {
      if (!mirror) { ctx.drawImage(cv, x, y); return; }
      ctx.save();
      ctx.translate(x + MTILE_SIZE, y);
      ctx.scale(-1, 1);
      ctx.drawImage(cv, 0, 0);
      ctx.restore();
    },
  };
}

/**
 * Compose one background metatile into a 16x16 drawable.
 * @param {number[]} mtile        four background-table tile ids [UL, LL, UR, LR] -- SMB's order
 * @param {number[]} palette      four NES colour indices; entry 0 is the backdrop
 * @param {boolean} [transparent] true skips index-0 pixels (see-through, e.g. a coin);
 *                                false (default) paints them opaque (a solid block).
 * @returns {{draw: function}} the same drawable contract as sprite_frames.js
 */
export function buildMetatile(mtile, palette, transparent = false) {
  const img = new ImageData(MTILE_SIZE, MTILE_SIZE);
  const [ul, ll, ur, lr] = mtile;
  paintTile(img, tiles[BG_BASE + ul], palette, 0, 0, transparent);
  paintTile(img, tiles[BG_BASE + ll], palette, 0, 8, transparent);
  paintTile(img, tiles[BG_BASE + ur], palette, 8, 0, transparent);
  paintTile(img, tiles[BG_BASE + lr], palette, 8, 8, transparent);
  const cv = document.createElement('canvas');
  cv.width = MTILE_SIZE;
  cv.height = MTILE_SIZE;
  cv.getContext('2d').putImageData(img, 0, 0);
  return drawable(cv);
}
