// seafox/src/presentation/screen.js
//
// design_spec § 17.5 -- getting `color` onto a canvas.
//
// **This is the whole of the free part.** Scaling, aspect and filtering are
// § 1.3-free, and so is the path itself: the indexed-texture GPU path § 17.5
// mentions is a later substitution for THIS FILE and nothing else, because
// `color` is already the texture it wants and nothing outside Chapter 17 reads
// it.
//
// The display surface is 280 x 192. Integer scaling keeps the art sharp; the
// original's display was 4:3, so a 4:3 presentation is closest to how it was
// seen. Neither is normative, and the two disagree -- 280 x 192 is 35:24, so a
// square-pixel presentation is slightly tall. Both are offered below and the
// default is integer, because a demo page is read for its pixels.

import { paletteRgba } from './palette.js';
import { SCREEN_W, SCREEN_H } from '../core/stencil.js';

/**
 * A canvas that shows a colour buffer.
 */
export class Screen {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {number} [scale] integer pixel scale
   */
  constructor(canvas, scale = 2) {
    /** @type {HTMLCanvasElement} */
    this.canvas = canvas;
    canvas.width = SCREEN_W;
    canvas.height = SCREEN_H;

    /** @type {CanvasRenderingContext2D} */
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    /** @type {ImageData} the RGBA the palette lookup writes into. */
    this.image = this.ctx.createImageData(SCREEN_W, SCREEN_H);

    /** @type {Uint32Array} the same bytes as little-endian words. */
    this.words = new Uint32Array(this.image.data.buffer);

    /**
     * Index 0 is opaque here. It is transparent in a sprite's colour bitmap --
     * that is what makes it the skip value in § 17.3 -- but on the way to the
     * display it is the sea, so it must paint.
     * @type {Uint32Array}
     */
    this.palette = paletteRgba(255);

    this.setScale(scale);
  }

  /**
   * @param {number} scale integer pixel scale; CSS only, the buffer is 1:1
   * @returns {void}
   */
  setScale(scale) {
    /** @type {number} */
    this.scale = scale;
    this.canvas.style.width = (SCREEN_W * scale) + 'px';
    this.canvas.style.height = (SCREEN_H * scale) + 'px';
    this.canvas.style.imageRendering = 'pixelated';
  }

  /**
   * Present one frame: a palette lookup per pixel, once (§ 3.6).
   * @param {Uint8Array} color the renderer's buffer
   * @returns {void}
   */
  present(color) {
    const words = this.words;
    const palette = this.palette;
    for (let i = 0; i < color.length; i++) words[i] = palette[color[i]];
    this.ctx.putImageData(this.image, 0, 0);
  }
}
