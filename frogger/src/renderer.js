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

  // A solid rectangle (bands, the timer bar, the dev grid). Colour may carry alpha (rgba).
  fillRect(x, y, w, h, color) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x | 0, y | 0, w, h);
  }

  // Optional w/h clip the sprite to its top-left w×h region (e.g. a 16 px slice of the 24 px
  // bg_block strip). Omit them to draw the whole sprite.
  drawSprite(name, x, y, w, h) {
    const r = this.sprites.rect(name);
    if (!r) return;
    const sw = w == null ? r.w : Math.min(w, r.w);
    const sh = h == null ? r.h : Math.min(h, r.h);
    this.ctx.drawImage(this.sprites.image, r.x, r.y, sw, sh, x | 0, y | 0, sw, sh);
  }

  // A palette-remapped copy of the whole atlas (§5.1): swap each source colour for a target,
  // keeping the keyed-out (transparent) pixels. Built once per key and cached — used for the
  // cyan lady-frog (`FROG_RECOLOR.cyan`). Returns a canvas to draw from via drawSpriteFrom.
  recolored(key, map) {
    if (!this._recolor) this._recolor = {};
    if (this._recolor[key]) return this._recolor[key];
    const img = this.sprites.image;
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const im = g.getImageData(0, 0, c.width, c.height), d = im.data, lut = {};
    for (const k in map) lut[parseInt(k.slice(1), 16)] = parseInt(map[k].slice(1), 16);
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;                             // transparent — leave it
      const t = lut[(d[i] << 16) | (d[i + 1] << 8) | d[i + 2]];
      if (t != null) { d[i] = t >> 16; d[i + 1] = (t >> 8) & 255; d[i + 2] = t & 255; }
    }
    g.putImageData(im, 0, 0);
    return (this._recolor[key] = c);
  }

  // drawSprite, but from an alternate atlas-sized source (e.g. a recolored() canvas).
  drawSpriteFrom(src, name, x, y) {
    const r = this.sprites.rect(name);
    if (r) this.ctx.drawImage(src, r.x, r.y, r.w, r.h, x | 0, y | 0, r.w, r.h);
  }

  // Draw a horizontal object of width W at (x,y) from a tile spec {body, left?, right?}: the
  // optional 16 px end caps at the two edges, `body` tiled (at its own width) between them.
  // Logs use left/right rounded ends + a repeating body; turtles / vehicles are body-only (§3.1).
  drawObject(spec, x, y, w) {
    let x0 = x, x1 = x + w;
    if (spec.left) { this.drawSprite(spec.left, x0, y); x0 += this.sprites.rect(spec.left).w; }
    if (spec.right) { x1 -= this.sprites.rect(spec.right).w; this.drawSprite(spec.right, x1, y); }
    const b = this.sprites.rect(spec.body);
    if (b) for (let bx = x0; bx < x1; bx += b.w) this.drawSprite(spec.body, bx, y);
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
