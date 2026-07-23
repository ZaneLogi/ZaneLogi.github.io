// sprites.js — the atlas image + manifest lookups (the asset layer, §5.1).
import { ATLAS, SPRITES, GLYPHS, GLYPH_W, GLYPH_H, PALETTE, FROG_RECOLOR }
  from '../assets/dat_sprites.js';

export class Sprites {
  constructor() {
    this.image = new Image();
    this.ready = new Promise((resolve, reject) => {
      this.image.onload = () => resolve(this);
      this.image.onerror = () => reject(new Error('atlas failed to load'));
    });
    this.image.src = ATLAS;
    this.GLYPH_W = GLYPH_W;
    this.GLYPH_H = GLYPH_H;
    this.PALETTE = PALETTE;
    this.FROG_RECOLOR = FROG_RECOLOR;
  }

  rect(name) { return SPRITES[name]; }        // { x, y, w, h } into the atlas
  glyph(ch) { return GLYPHS[ch]; }            // monospace font cell
}
