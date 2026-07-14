// renderer.js — S9 Renderer (the re-derived PPU)
//
// The ROM's render path is the NMI half: OAM DMA + a PPU write-buffer flush +
// palettes + scroll (map §1). That hardware plumbing does NOT survive literally.
// Renderer keeps the RESPONSIBILITIES — draw the field tilemap, draw sprites,
// draw text, apply palettes — but paints straight to a canvas. This is the
// sanctioned "re-derive the hardware abstraction in our own view" deviation; the
// mechanism (logic builds state, render ships it) is preserved.
//
// Absorbs (as responsibilities, not byte-for-byte):
//   vec_D400_NMI render half, sub_DA2B_display_sprite ($DA2B),
//   sub_DA7B_display_2_sprites ($DA7B), sub_DA93_hide_unused_sprites ($DA93),
//   sub_D8FD_write_buffer_to_ppu ($D8FD), sub_D6B3_fill_buffer_with_tiles,
//   sub_D50E/D53E palettes (tbl_D555/tbl_D565), D85E/D8D2 "huge letter" text.
// TODO: load CHR_ROM.chr tiles + the two palette tables.
// See docs/research_system_interaction_map.md §5 (S9).

import { SCREEN_W, SCREEN_H } from './constants.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    // TODO: decode CHR_ROM.chr into tile bitmaps; load bg/sprite palettes.
  }

  beginFrame() { this.ctx.clearRect(0, 0, SCREEN_W, SCREEN_H); }

  drawField(field) { /* TODO: iterate field cells -> drawImage per tile */ }
  drawSprite(tile, x, y, palette) { /* TODO: port $DA2B/$DA7B */ }
  drawText(str, x, y) { /* TODO: port huge-letter routines */ }
  endFrame() { /* nothing to flush — canvas is the display */ }
}
