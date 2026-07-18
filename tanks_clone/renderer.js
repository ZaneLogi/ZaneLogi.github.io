// renderer.js — Renderer
//
// Absorbs (as responsibilities, not byte-for-byte):
//   vec_D400_NMI render half, sub_D8FD_write_buffer_to_ppu ($D8FD),
//   sub_D50E_set_background_palette ($D50E) + tbl_D565,
//   sub_D53E_set_sprites_palette ($D53E) + tbl_D555,
//   sub_D7B4_copy_400h_to_nametable ($D7B4) — the $0400 -> PPU ship.
//   sub_DA2B_display_sprite ($DA2B) + sub_DA7B ($DA7B) -> drawSprite/_paintSprite,
//   and the behind-BG/front layering ($DA3B forest probe + beginSpriteLayers/
//   flushSprites) — built P6. sub_DA93_hide_unused_sprites ($DA93) is NOT ported: it
//   parks the leftover OAM slots off-screen so stale sprites don't linger, a hardware-
//   OAM chore the canvas has no analog for (beginFrame clears; we draw only what we enqueue).
// See docs/research_system_interaction_map.md §5 (S9).
//
// TWO CACHES, doing different jobs:
//   TileCache (tiles.js)   — (tile, palette) -> an 8x8 canvas. Lazy: decode on
//                            first use. Kills per-draw pixel work.
//   _composed (here)       — Tilemap -> a 256x240 canvas, repainted only when the
//                            tilemap's version moves. Kills per-frame tile work.
// The NES has the second one in spirit: it never redraws the background, because
// its write buffer is a dirty-block queue (map §7 design notes). A scroll is then
// one drawImage of an unchanged picture — which is exactly what the PPU does with
// a scroll register.

import { CHR, CHR_BG_BASE, CHR_SPRITE_BASE, BG_PALETTE_SETS, SPRITE_PALETTES }
  from './assets/dat_chr.js';
import { TileCache, TILE_W, TILE_H } from './tiles.js';
import { TILEMAP_COLS, TILEMAP_ROWS } from './tilemap.js';
import { nesRgb } from './palette.js';
import { SCREEN_W, SCREEN_H } from './constants.js';

/** @typedef {import('./tilemap.js').Tilemap} Tilemap */

// $3F00, the universal backdrop. The PPU mirrors $3F04/$3F08/$3F0C onto it, so
// every BG palette's entry 0 is this colour whatever its table says — and in this
// ROM every entry 0 is $0F anyway, so the two agree. See tiles.js.
const BACKDROP = nesRgb(0x0F);

// Palette identity for TileCache, which needs a small stable int per palette:
// BG takes set (0..8) * 4 + attribute (0..3) -> 0..35, sprites take 36..39. Both
// fit the cache's 0..63 key field.
const bgPaletteId = (set, attr) => set * 4 + attr;
const SPRITE_PALETTE_ID = 36;

export class Renderer {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.tiles = new TileCache(CHR);
    this._composed = new WeakMap();   // Tilemap -> { canvas, ctx, version, set, transparent }
    this._sprites = null;             // sprite queue while layering (see beginSpriteLayers)
  }

  beginFrame() {
    this.ctx.fillStyle = `rgb(${BACKDROP[0]},${BACKDROP[1]},${BACKDROP[2]})`;
    this.ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    this._sprites = null;   // default: sprites paint immediately (menu, etc.)
  }

  // Turn on the PPU's sprite/BG priority layering for this frame. While active,
  // drawSprite ENQUEUES (into behind-BG / front lists) instead of painting, so the
  // caller can interleave the background between the two: backdrop -> flushSprites(true)
  // -> drawTilemap(..., transparent) -> flushSprites(false). This is what lets a tank
  // on forest ($DA3B) sit behind the grass. Without it (menu title) sprites paint on top.
  beginSpriteLayers() { this._sprites = { behind: [], front: [] }; }

  // Paint the queued sprites of one priority. behind=true is drawn before the BG.
  flushSprites(behind) {
    if (!this._sprites) return;
    for (const s of this._sprites[behind ? 'behind' : 'front']) {
      this._paintSprite(s[0], s[1], s[2], s[3]);
    }
  }

  /**
   * The tilemap as a 256x240 canvas, repainted only when its (version, set,
   * transparent) changes. Whole-map repaint: cheap because the field changes rarely —
   * once at stage load, and twice a second when $C31D swaps the palette set for the
   * water shimmer (a global change per-cell tracking wouldn't help anyway). Per-cell
   * dirty tracking is a later optimization for when brick-chipping (bullets) starts
   * churning the field every frame.
   */
  _compose(tm, set, transparent = false) {
    let c = this._composed.get(tm);
    if (c === undefined) {
      const cv = document.createElement('canvas');
      cv.width = SCREEN_W;
      cv.height = SCREEN_H;
      c = { canvas: cv, ctx: cv.getContext('2d'), version: -1, set: -1, transparent: false };
      c.ctx.imageSmoothingEnabled = false;
      this._composed.set(tm, c);
    }
    if (c.version === tm.version && c.set === set && c.transparent === transparent) return c.canvas;

    // transparent: colour-0 is left clear (so behind-BG sprites show through) instead
    // of baked to the backdrop. Every entry-0 IS the backdrop, so the two look the
    // same over a backdrop fill — the difference only matters with a sprite beneath.
    if (transparent) c.ctx.clearRect(0, 0, SCREEN_W, SCREEN_H);
    for (let row = 0; row < TILEMAP_ROWS; row++) {
      for (let col = 0; col < TILEMAP_COLS; col++) {
        const attr = tm.paletteAt(col, row);
        const palette = BG_PALETTE_SETS[set][attr];
        const tile = this.tiles.get(
          CHR_BG_BASE + tm.tileAt(col, row), palette, bgPaletteId(set, attr), transparent);
        c.ctx.drawImage(tile, col * TILE_W, row * TILE_H);
      }
    }
    c.version = tm.version;
    c.set = set;
    c.transparent = transparent;
    return c.canvas;
  }

  /**
   * Ship a tilemap to the screen at (dx, dy) — our sub_D7B4 + the scroll register,
   * fused. Off-screen placement is fine and is the point: the title scroll draws it
   * at dy = 240 - scrollY and lets the canvas clip.
   * @param {Tilemap} tm
   * @param {number} set  ram_bg_palette_id ($4D), a con_bg_pal_* index 0..8.
   */
  drawTilemap(tm, set, dx = 0, dy = 0, transparent = false) {
    this.ctx.drawImage(this._compose(tm, set, transparent), dx, dy);
  }

  /**
   * drawTilemap, but only tile rows [row0, row1) — the stage-intro curtain wipe
   * composites horizontal bands of grey and field ($CC90/$CCB2 draw it row by row).
   * Same composed canvas, clipped to the band's source rectangle.
   * @param {Tilemap} tm
   * @param {number} set  ram_bg_palette_id ($4D), a con_bg_pal_* index 0..8.
   * @param {number} dx
   * @param {number} dy
   * @param {number} row0  first tile row, inclusive.
   * @param {number} row1  last tile row, exclusive.
   */
  drawTilemapRows(tm, set, dx, dy, row0, row1) {
    if (row1 <= row0) return;
    const y = row0 * TILE_H;
    const h = (row1 - row0) * TILE_H;
    this.ctx.drawImage(this._compose(tm, set), 0, y, SCREEN_W, h, dx, dy + y, SCREEN_W, h);
  }

  /**
   * One sprite — sub_DA2B_display_sprite ($DA2B)'s output half.
   *
   * TWO coordinate quirks live here, in the PPU analog, because that is where they
   * belong — callers pass what the ROM passes:
   *
   *  1. $DA34 stores OAM Y = sprY - 8. Every sprite in the game goes through this
   *     routine, so the ROM's convention is that sprY is the sprite's CENTRE, not
   *     its top.
   *  2. The PPU renders sprites one scanline LATE, so OAM Y is really "top minus
   *     one" and the hardware adds the 1 back. Net: the top scanline is sprY - 7.
   *     Worth the pixel — a tank centred on 139 spans 132..147, which is what puts
   *     the menu cursor level with its 136..142 text row.
   *
   * 8x16 mode ($2000 bit 5, set by the NMI at $D41F) makes the tile byte NOT a
   * plain index: bit 0 picks the PATTERN TABLE and bits 7..1 pick the pair, so the
   * sprite is CHR[t & $FE] stacked over CHR[(t & $FE) + 1] and PPUCTRL's
   * sprite-table bit is ignored. That is exactly why sprites here can draw
   * BACKGROUND glyphs ($C59C loads #$9D) — see assets/dat_chr.js.
   *
   * $DA3B-$DA45 probes the field at (sprX + 3, sprY) and, on tile $22 (forest), ORs
   * ram_priority_spr_A ($20) into the attribute to put the sprite BEHIND the background.
   * Ported in P6 as the `behind` flag below + the backdrop -> behind-BG sprites -> BG ->
   * front sprites composite (beginSpriteLayers/flushSprites; CLAUDE.md); the field probe
   * itself lives in the caller (Tank.onForest). The menu has no field, so its sprites
   * paint on top (behind = false).
   *
   * @param {number} tileByte  the OAM tile byte, 8x16-encoded (see above).
   * @param {number} sprX  $DA2B's X in-param -> OAM X directly.
   * @param {number} sprY  $DA2B's Y in-param -> OAM Y = sprY - 8.
   * @param {number} paletteId  0..3, an index into tbl_D555 (SPRITE_PALETTES).
   * @param {boolean} behind  the OAM priority bit ($DA45): draw behind the BG (forest).
   *   Honoured only while beginSpriteLayers() is active; otherwise painted on top.
   */
  drawSprite(tileByte, sprX, sprY, paletteId, behind = false) {
    if (this._sprites) {
      this._sprites[behind ? 'behind' : 'front'].push([tileByte, sprX, sprY, paletteId]);
      return;
    }
    this._paintSprite(tileByte, sprX, sprY, paletteId);
  }

  _paintSprite(tileByte, sprX, sprY, paletteId) {
    const table = (tileByte & 0x01) ? CHR_BG_BASE : CHR_SPRITE_BASE;
    const top = tileByte & 0xFE;
    const palette = SPRITE_PALETTES[paletteId & 0x03];
    const pid = SPRITE_PALETTE_ID + (paletteId & 0x03);
    const y = sprY - 8 + 1;   // $DA34's -8, then the PPU's one-line delay
    // `true` = index 0 is TRANSPARENT for sprites (tiles.js) — not the backdrop.
    this.ctx.drawImage(this.tiles.get(table + top, palette, pid, true), sprX, y);
    this.ctx.drawImage(this.tiles.get(table + top + 1, palette, pid, true), sprX, y + 8);
  }

  endFrame() { /* nothing to flush — canvas is the display */ }
}
