// renderer.js — the 224×256 backbuffer + drawSprite/drawText; owns the atlas (§4, §5.1).
// Black is transparent (the atlas is already keyed out). The font is white and gets
// tinted to a colour via a source-in fill (§5.1); fixed-width, so HUD fields never jitter.
import { SCREEN } from './constants.js';

/** @typedef {import('./sprites.js').Sprites} Sprites */

export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Sprites} sprites
   */
  constructor(canvas, sprites) {
    this.sprites = sprites;
    this.canvas = canvas;
    canvas.width = SCREEN.WIDTH;
    canvas.height = SCREEN.HEIGHT;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this._tint = document.createElement('canvas');       // scratch for glyph tinting
    this._tctx = this._tint.getContext('2d');
  }

  clear(color = '#000') {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, SCREEN.WIDTH, SCREEN.HEIGHT);
  }

  drawSprite(name, x, y) {
    const r = this.sprites.rect(name);
    if (!r) return;
    this.ctx.drawImage(this.sprites.image, r.x, r.y, r.w, r.h, x | 0, y | 0, r.w, r.h);
  }

  // Monospace: advance penX by GLYPH_W per character (§5.1). Unknown chars = blank cell.
  drawText(str, x, y, color = '#fff') {
    const gw = this.sprites.GLYPH_W;
    let penX = x | 0;
    for (const ch of String(str).toUpperCase()) {
      const key = ch === '-' ? 'dash' : ch;
      const r = this.sprites.glyph(key);
      if (r) this._glyph(r, penX, y | 0, color);
      penX += gw;
    }
  }

  _glyph(r, x, y, color) {
    if (color === '#fff' || color === 'white') {
      this.ctx.drawImage(this.sprites.image, r.x, r.y, r.w, r.h, x, y, r.w, r.h);
      return;
    }
    const t = this._tint, tc = this._tctx;
    t.width = r.w; t.height = r.h;
    tc.clearRect(0, 0, r.w, r.h);
    tc.drawImage(this.sprites.image, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    tc.globalCompositeOperation = 'source-in';
    tc.fillStyle = color;
    tc.fillRect(0, 0, r.w, r.h);
    tc.globalCompositeOperation = 'source-over';
    this.ctx.drawImage(t, x, y);
  }
}
