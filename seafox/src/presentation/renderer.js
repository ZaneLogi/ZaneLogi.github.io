// seafox/src/presentation/renderer.js
//
// The renderer of design_spec Chapter 17.
//
// **It reads state and the simulation never draws** (§ 17.1). Once per tick,
// after the walks, this reads the entity list, the effects list and the session
// and composites `color` from them. Nothing in `core/` imports this file, and
// the whole of Chapter 20 depends on that staying true.
//
// **`color` is rebuilt from state every tick** -- no incremental update, no
// dirty region, no second page. That is what lets the original's page-flip and
// catch-up machinery be absent rather than replaced (§ 9.6), and it is why
// several things Chapter 19 describes as draw-and-erase are simply *not drawn*
// here: the HUD erase bar has no counterpart at all, because a rebuild starts
// from an empty buffer and the question "what is still on the line from the
// last state?" cannot arise.
//
// **`stencil` is not touched.** It is simulation state, written during the walk
// (§ 3.3); this neither reads nor writes it. The two agree anyway, and § 17.4
// says why: an entity that did not update did not move.

import { COLOR } from './palette.js';
import { SPRITES } from './sprites.js';
import { drawHud, drawMessages } from './hud.js';
import { SCREEN_W, SCREEN_H } from '../core/stencil.js';
import { spriteFor } from '../core/effects.js';

/** @type {number} § 3.5: the sea surface, one pixel tall, and the only scenery. */
export const WATERLINE_ROW = 38;

/**
 * The colour buffer and the composite that fills it.
 */
export class Renderer {
  constructor() {
    /**
     * § 3.1: 280 x 192 bytes of palette index. The display path reads this and
     * nothing else, which is what makes § 17.5's substitution local.
     * @type {Uint8Array}
     */
    this.color = new Uint8Array(SCREEN_W * SCREEN_H);
  }

  /**
   * Composite one frame, in the order of § 17.2.
   *
   * The order is normative and two of its six layers are the reason:
   * **the waterline goes down BEFORE the entities**, so a torpedo crossing the
   * surface occludes it and leaves a gap while it passes -- drawing it
   * afterwards would hide everything on row 38. **Effects go over entities**,
   * because the effects walk runs after the entity walk (§ 9.3) and sparks,
   * wakes and debris read correctly on top.
   *
   * @param {Object} session
   * @returns {void}
   */
  render(session) {
    this.color.fill(COLOR.BACKGROUND);          // 1
    this.drawWaterline();                       // 2
    this.drawEntities(session);                 // 3
    this.drawEffects(session);                  // 4
    drawHud(this, session);                     // 5
    drawMessages(this, session);                // 6
  }

  /**
   * § 3.5: row 38, the full width, blue, solid.
   *
   * **Solid, not dotted.** The stored pattern lights every even column and no
   * odd one, but every one of those is an isolated lit pixel, so § 6.3's bake
   * gives each a two-pixel chroma cell and the gaps fill. Drawing the dots
   * literally would produce a visibly wrong surface, so the line is written as
   * what the bake resolves it to.
   *
   * It is redrawn in full every tick. The original refreshed a tenth of the row
   * per tick on a rotating cursor, which left a gap wherever something had
   * crossed the surface until the cursor came back round; that gap is an
   * artifact of incremental repair and is not reproduced (§ 1.3).
   *
   * @returns {void}
   */
  drawWaterline() {
    const base = WATERLINE_ROW * SCREEN_W;
    this.color.fill(COLOR.BLUE, base, base + SCREEN_W);
  }

  /**
   * § 17.2 layer 3, and § 17.6.
   *
   * **Slot order, and every live entity, every tick.** The divider governs
   * whether an entity UPDATES, never whether it appears -- most entities are
   * skipped on most ticks (§ 2.7.1: a merchant updates once in seven), so a
   * renderer that drew only what moved would produce a game in which almost
   * everything flickers. Slot order is also overlap order, and it changes when
   * an entity is removed (§ 4.6); there is no z-ordering in this game.
   *
   * @param {Object} session
   * @returns {void}
   */
  drawEntities(session) {
    const list = session.entities;
    for (let i = 0; i < list.liveCount; i++) {
      const e = list.slots[i];
      const sprite = SPRITES[e.sprite];
      if (sprite === undefined) continue;       // a frame that carries no sprite
      this.blit(sprite, e.x - 28, e.y);
    }
  }

  /**
   * § 17.2 layer 4. Same rule as the entities: an effect that has not stepped
   * is still drawn.
   *
   * `spriteFor` is where the debris picks its hue from its current X -- the one
   * colour decision the bake cannot make (§ 15.4). It is core's, not ours,
   * because the rule is about the particle rather than about drawing.
   *
   * @param {Object} session
   * @returns {void}
   */
  drawEffects(session) {
    const list = session.effects;
    for (let i = 0; i < list.liveCount; i++) {
      const e = list.slots[i];
      const sprite = SPRITES[spriteFor(e)];
      if (sprite === undefined) continue;
      this.blit(sprite, e.x - 28, e.y);
    }
  }

  /**
   * Draw one sprite's colour bitmap (§ 17.3).
   *
   * `x` and `y` are the BLOCK's top-left in screen space -- an entity's
   * `x - 28`, or a strip's own header position. The bitmap is stripped to its
   * ink box, so the crop offset goes back on here; the same offset the stencil
   * applies, which is what keeps the picture and the collision footprint on the
   * same pixel.
   *
   * Three things this must not become:
   *
   * - **no shifting and no per-position variants.** Both buffers are one byte
   *   per pixel, so any X is a byte offset (§ 6.1).
   * - **no colour decisions.** Each sprite already carries the palette indices
   *   it draws in, chosen when it was baked (§ 6.5). This copies indices.
   * - **`color`, never `ink`.** They share a bounding box but are filled
   *   differently -- a chroma cell colours the gap right of an isolated pixel,
   *   so `color` is set where `ink` is 0 (§ 6.3.1).
   *
   * @param {Object} sprite a baked sprite
   * @param {number} x screen column of the block's left edge
   * @param {number} y screen row of the block's top edge
   * @returns {void}
   */
  blit(sprite, x, y) {
    const originX = x + sprite.minX;
    const originY = y + sprite.minY;
    const w = sprite.colorWidth;
    const src = sprite.color;

    for (let row = 0; row < sprite.h; row++) {
      const dstRow = originY + row;
      if (dstRow < 0 || dstRow >= SCREEN_H) continue;     // ordinary rect clip
      const dstBase = dstRow * SCREEN_W;
      const srcBase = row * w;
      for (let col = 0; col < w; col++) {
        const index = src[srcBase + col];
        if (index === COLOR.BACKGROUND) continue;         // index 0 transparent
        const dstCol = originX + col;
        if (dstCol < 0 || dstCol >= SCREEN_W) continue;
        this.color[dstBase + dstCol] = index;
      }
    }
  }

  /**
   * Draw a strip at the position stored in its own header (§ 6.6.1).
   *
   * Neither X nor Y is supplied by the code that posts it, so a caller names
   * the strip and nothing else.
   *
   * @param {Object} sprite a baked strip, carrying x and y
   * @returns {void}
   */
  blitStrip(sprite) {
    this.blit(sprite, sprite.x, sprite.y);
  }
}
