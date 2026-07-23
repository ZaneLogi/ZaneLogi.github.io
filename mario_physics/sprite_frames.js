// sprite_frames.js -- a graphics table's rows -> drawable frames.
//
// The layer between chr_decoder (CHR bytes -> tiles, no SMB knowledge) and
// actor_types (which frame a state shows). Everything SMB-specific about assembling
// tiles into a sprite lives here.
//
// DrawSpriteObject is the shared primitive: two tiles per row, left at X and right
// at X+8. How many rows, and which of them mirror, is per table --
//   PlayerGraphicsTable  4 rows (DrawPlayerLoop), mirrors per ChkForPlayerAttrib
//   EnemyGraphicsTable   3 rows (DrawEnemyObject) -- not ported yet
// so the enemy builder belongs beside buildPlayerFrames when it lands, not in a
// module of its own.
//
// Always 4 rows for the player -- PlayerGfxProcessing calls RenderPlayerSub with
// #$04 whatever the size. Small Mario's top two rows are $fc (blank), which is what
// bottom-aligns him inside the block for free.
//
// The block is the registration. Ink extent varies per frame (small Mario standing
// is 14 wide, walking frame 1 is 13, jumping is 16); the padding is what holds the
// feet still across the cycle. Blit the whole 16x32 block at the actor's position --
// never trim to the ink, never centre it.

import { paintTile } from './chr_decoder.js';
import { FRAMES } from './assets/dat_tiles.js';
import { tiles } from './chr_tiles.js';

export const FRAME_W = 16;
export const FRAME_H = 32;

/**
 * @typedef {Object} Frame  One PlayerGraphicsTable entry (a FRAMES row).
 * @property {number} off      PlayerGfxOffset -- selects the per-row flip rule.
 * @property {string} size     'small' | 'big' | 'both'.
 * @property {string} name     e.g. 'walking frame 1'.
 * @property {number[]} tiles  eight CHR tile ids, row-major (2 wide x 4 tall).
 */

/**
 * Which rows get their RIGHT tile horizontally flipped -- ChkForPlayerAttrib.
 * Several frames store one tile and mirror it for the other half: 'small player
 * standing' is $fc,$fc,$fc,$fc,$3a,$37,$4f,$4f, where the two $4f are the same leg
 * tile drawn twice, the right one flipped.
 *
 *   GameEngineSubroutine == $0b (killed) -> KilledAtt: rows 2 and 3
 *   PlayerGfxOffset $50 / $b8 / $c0      -> C_S_IGAtt: row 3 only
 *   PlayerGfxOffset $c8                  -> falls THROUGH `bne ExPlyrAt` into
 *                                           KilledAtt: rows 2 and 3
 *
 * That fall-through is easy to misread: `cmp #$c8 / bne ExPlyrAt` leaves only when
 * the offset is NOT $c8, so $c8 gets the third-row treatment too -- exactly what
 * 'big player standing' ($00,$01,$4c,$4d,$4a,$4a,$4b,$4b) needs, since rows 2 AND 3
 * are duplicated pairs there.
 *
 * This is NOT the facing flip. That one mirrors the whole sprite at draw time
 * (world.js passes `facing === -1`); this one is per-row, inside one frame.
 *
 * @param {number} gfxOffset  the frame's PlayerGfxOffset (`off`).
 * @param {boolean} [killed]  true for the killed frame, reached via a different path.
 * @returns {number[]} the row indices (0..3) whose right tile is mirrored.
 */
function rightTileFlipRows(gfxOffset, killed = false) {
  if (killed) return [2, 3];
  if (gfxOffset === 0x50 || gfxOffset === 0xb8 || gfxOffset === 0xc0) return [3];
  if (gfxOffset === 0xc8) return [2, 3];
  return [];
}

/**
 * One FRAMES row -> a 16x32 canvas coloured by `palette`.
 * @param {Frame} frame       the row to compose.
 * @param {number[]} palette  four NES colour indices (e.g. PLAYER_COLORS[0]).
 * @param {boolean} killed    selects the killed frame's per-row flip rule.
 * @returns {HTMLCanvasElement} the composed 16x32 frame.
 */
function composeFrame(frame, palette, killed) {
  const img = new ImageData(FRAME_W, FRAME_H);
  const flip = rightTileFlipRows(frame.off, killed);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 2; c++) {
      const px = tiles[frame.tiles[r * 2 + c]];
      const mirror = c === 1 && flip.includes(r);
      const src = mirror ? mirrorTile(px) : px;
      paintTile(img, src, palette, c * 8, r * 8, true);
    }
  }
  const cv = document.createElement('canvas');
  cv.width = FRAME_W;
  cv.height = FRAME_H;
  cv.getContext('2d').putImageData(img, 0, 0);
  return cv;
}

/**
 * Horizontally flip one 8x8 tile's pixel indices.
 * @param {Uint8Array} px  64 pixel indices, row-major.
 * @returns {Uint8Array} a new 64-entry array, mirrored left<->right.
 */
function mirrorTile(px) {
  const out = new Uint8Array(64);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) out[y * 8 + x] = px[y * 8 + (7 - x)];
  return out;
}

/**
 * Wrap a composed canvas as a drawable -- the shape the Animator expects of a
 * BMP-backed frame, so composed and BMP frames are interchangeable.
 * @param {HTMLCanvasElement} cv  the composed frame.
 * @returns {{draw: function}} a drawable; `draw(ctx, x, y, mirror)` blits it (mirroring on request).
 */
function drawable(cv) {
  return {
    draw(ctx, x, y, mirror = false) {
      if (!mirror) { ctx.drawImage(cv, x, y); return; }
      ctx.save();
      ctx.translate(x + FRAME_W, y);
      ctx.scale(-1, 1);
      ctx.drawImage(cv, 0, 0);
      ctx.restore();
    },
  };
}

/**
 * Build every PlayerGraphicsTable frame for one PlayerColors palette.
 * @param {number[]} palette  4 NES colour indices, e.g. PLAYER_COLORS[0] (mario).
 * @returns {Object.<string, {draw: function}>} name -> drawable, e.g. 'small jumping'.
 */
export function buildPlayerFrames(palette) {
  const out = {};
  for (const f of FRAMES) {
    // The killed frame is the one ChkForPlayerAttrib reaches via GameEngineSubroutine
    // rather than PlayerGfxOffset, so it cannot be keyed off `off` like the others.
    const killed = f.name === 'killed';
    // The 'both' rows already name their own size ('small player standing'); the
    // sized rows do not ('walking frame 1'), so they take the size as a prefix.
    const key = f.size === 'both' ? f.name : `${f.size} ${f.name}`;
    out[key] = drawable(composeFrame(f, palette, killed));
  }
  return out;
}
