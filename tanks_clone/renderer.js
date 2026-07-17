// renderer.js — Renderer
//
// Absorbs (as responsibilities, not byte-for-byte):
//   vec_D400_NMI render half, sub_D8FD_write_buffer_to_ppu ($D8FD),
//   sub_D50E_set_background_palette ($D50E) + tbl_D565,
//   sub_D53E_set_sprites_palette ($D53E) + tbl_D555,
//   sub_D7B4_copy_400h_to_nametable ($D7B4) — the $0400 -> PPU ship.
// TODO: sprites — sub_DA2B_display_sprite ($DA2B), sub_DA7B ($DA7B),
//   sub_DA93_hide_unused_sprites ($DA93). 8x16 mode, 2 sprites per tank.
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
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.tiles = new TileCache(CHR);
    this._composed = new WeakMap();   // Tilemap -> { canvas, ctx, version, set }
  }

  beginFrame() {
    this.ctx.fillStyle = `rgb(${BACKDROP[0]},${BACKDROP[1]},${BACKDROP[2]})`;
    this.ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  }

  /**
   * The tilemap as a 256x240 canvas, repainted only if it changed since last time.
   * Whole-map repaint for now: the title screen is drawn once and then never
   * touched, so per-cell dirty tracking would buy nothing yet. It is what the
   * battlefield will want (map §7) — add it when there is a battlefield.
   */
  _compose(tm, set) {
    let c = this._composed.get(tm);
    if (c === undefined) {
      const cv = document.createElement('canvas');
      cv.width = SCREEN_W;
      cv.height = SCREEN_H;
      c = { canvas: cv, ctx: cv.getContext('2d'), version: -1, set: -1 };
      c.ctx.imageSmoothingEnabled = false;
      this._composed.set(tm, c);
    }
    if (c.version === tm.version && c.set === set) return c.canvas;

    for (let row = 0; row < TILEMAP_ROWS; row++) {
      for (let col = 0; col < TILEMAP_COLS; col++) {
        const attr = tm.paletteAt(col, row);
        const palette = BG_PALETTE_SETS[set][attr];
        const tile = this.tiles.get(
          CHR_BG_BASE + tm.tileAt(col, row), palette, bgPaletteId(set, attr));
        c.ctx.drawImage(tile, col * TILE_W, row * TILE_H);
      }
    }
    c.version = tm.version;
    c.set = set;
    return c.canvas;
  }

  /**
   * Ship a tilemap to the screen at (dx, dy) — our sub_D7B4 + the scroll register,
   * fused. Off-screen placement is fine and is the point: the title scroll draws it
   * at dy = 240 - scrollY and lets the canvas clip.
   * @param {Tilemap} tm
   * @param {number} set  ram_bg_palette_id ($4D), a con_bg_pal_* index 0..8.
   */
  drawTilemap(tm, set, dx = 0, dy = 0) {
    this.ctx.drawImage(this._compose(tm, set), dx, dy);
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
   * NOT ported yet: $DA3B-$DA45 probes the field at (sprX + 3, sprY) and, on tile
   * $22 (forest), ORs ram_priority_spr_A ($20) into the attribute to put the sprite
   * BEHIND the background. That needs Field, and needs the backdrop -> behind-BG
   * sprites -> BG -> front sprites composite (CLAUDE.md). Nothing reaches it today:
   * the title screen has no forest, so the probe's answer is always "no".
   *
   * @param {number} tileByte  the OAM tile byte, 8x16-encoded (see above).
   * @param {number} sprX  $DA2B's X in-param -> OAM X directly.
   * @param {number} sprY  $DA2B's Y in-param -> OAM Y = sprY - 8.
   * @param {number} paletteId  0..3, an index into tbl_D555 (SPRITE_PALETTES).
   */
  drawSprite(tileByte, sprX, sprY, paletteId) {
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
