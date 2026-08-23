// seafox/src/core/stencil.js
//
// The stencil buffer of design_spec Chapter 3 -- core state, and the thing
// § 14.3's confirm reads.
//
// 280 x 192 bytes: `0` empty, `1…32` the occupying entity's slot + 1. It carries
// IDENTITY, not mere occupancy, and that is the whole reason it exists. Collision
// needs to ask *"does this object's silhouette touch anything that is not
// itself?"*, and a buffer recording only whether a pixel is lit cannot answer
// that, because the subject is in the buffer too. Recording the occupying slot
// answers it directly, as a read-only test with no erase, no redraw and no
// mutation of any buffer -- which is what removes the original's
// erase-and-redraw sequence, a sequence that exists only because a one-bit
// framebuffer can report that a pixel is lit but not what lit it.
//
// **It is written from the sprite's INK mask, never from its colour bitmap.**
// The two are different shapes: an isolated coloured pixel occupies a two-pixel
// chroma cell, so the colour image can extend one pixel to the RIGHT of the ink
// and never to the left (§ 6.3). Collision uses the ink; the screen uses the
// colour. Using either for the other's job is a conformance failure, and a quiet
// one -- the game remains playable and hitboxes are wrong by a pixel.
//
// **The waterline is not in here.** It is decoration, not an object, and cannot
// register as contact -- § 1.3 lists that among the deliberate differences from
// the original, where the surface shares memory with the objects and therefore
// can. Slot value 255 is reserved for scenery should collidable terrain ever be
// wanted; nothing uses it.

import { SPRITE_BLOCKS } from '../../assets/sprite_blocks.js';
import { bakeAllInk } from '../assets/ink.js';

/** @type {number} § 2.2: the screen, and therefore both buffers. */
export const SCREEN_W = 280;
export const SCREEN_H = 192;

/** @type {number} § 3.5: reserved for scenery. Nothing writes it. */
export const SCENERY_ID = 255;

/**
 * Every sprite's ink, baked once at load.
 *
 * `core/` may read this: it is data, and ink.js imports nothing, so no path runs
 * from here to `presentation/` (§ 1.5).
 * @type {Object<string, import('../assets/ink.js').InkSprite>}
 */
export const INK = bakeAllInk(SPRITE_BLOCKS);

/**
 * The collidable buffer.
 */
export class Stencil {
  constructor() {
    /** @type {Uint8Array} SCREEN_W * SCREEN_H, row-major. */
    this.buf = new Uint8Array(SCREEN_W * SCREEN_H);
  }

  /** @returns {void} */
  clear() {
    this.buf.fill(0);
  }

  /**
   * Write an entity's footprint under its own id, the slot **+ 1** so that 0 can
   * mean empty. Masked by the ink, never by the bounding box.
   *
   * @param {Object} e an Entity
   * @param {number} slot the entity's slot
   * @returns {void}
   */
  write(e, slot) {
    this.paint(e, slot + 1, -1);
  }

  /**
   * Clear an entity's footprint -- **and only the pixels it actually owns.**
   *
   * § 3.3 is precise about this: where two entities overlap, the later writer
   * owns the shared pixels, and when it moves away *it clears only what it
   * wrote*. Blanking everything under the ink instead erases the OTHER entity
   * from the buffer across the overlap, and the consequence is not subtle -- the
   * two stop being able to see each other at exactly the moment they are
   * touching, which is the one moment that matters.
   *
   * What § 3.3 does leave behind is an asymmetry, and it is harmless: the
   * earlier entity's shared pixels stay owned by the later one until the earlier
   * one next redraws, so a detection can be missed on one side. The other
   * party's own subject pass makes it anyway.
   *
   * @param {Object} e an Entity
   * @param {number} slot the entity's slot
   * @returns {void}
   */
  erase(e, slot) {
    this.paint(e, 0, slot + 1);
  }

  /**
   * @param {Object} e an Entity
   * @param {number} value what to write
   * @param {number} onlyOver write only where the buffer already holds this;
   *   -1 to write unconditionally
   * @returns {void}
   */
  paint(e, value, onlyOver) {
    const sprite = INK[e.sprite];
    if (sprite === undefined) return;          // a type with no artwork yet

    // § 2.3: the buffer is screen space, the entity's X is world space -- and
    // the entity's position is its BLOCK's top-left, so the bitmap's own crop
    // offset goes back on. § 6.2's bitmaps are stripped to their ink box, which
    // is what makes `byteWidth` worth retaining (§ 6.4); dropping the offset
    // instead would slide the nine blocks that have one 1-2 px up or left of
    // where the game puts them, in the picture AND in this buffer.
    const originX = e.x - 28 + sprite.minX;
    const originY = e.y + sprite.minY;

    for (let y = 0; y < sprite.h; y++) {
      const row = originY + y;
      if (row < 0 || row >= SCREEN_H) continue;
      const rowBase = row * SCREEN_W;
      const inkBase = y * sprite.w;
      for (let x = 0; x < sprite.w; x++) {
        if (!sprite.ink[inkBase + x]) continue;
        const col = originX + x;
        if (col < 0 || col >= SCREEN_W) continue;
        const at = rowBase + col;
        if (onlyOver >= 0 && this.buf[at] !== onlyOver) continue;
        this.buf[at] = value;
      }
    }
  }

  /**
   * § 3.2's touching test, and § 14.3's confirm:
   *
   *   touching = exists p in the subject's footprint :
   *                  ink[p] AND stencil[p] not in { 0, subjectSlot + 1 }
   *
   * **It does not reference any candidate.** It asks whether the subject's
   * silhouette touches anything that is not itself, which is why § 14.3 computes
   * it once per subject per tick and caches it, leaving the sweep to do box tests
   * only. That is not a simplification imposed on the design -- it is what the
   * original computes, because its own confirm measures the whole subject sprite
   * against the whole screen.
   *
   * A normative consequence follows: **a third entity's pixels can confirm a
   * contact between subject and candidate whose own silhouettes never met**,
   * provided their boxes overlapped.
   *
   * @param {Object} e an Entity
   * @param {number} slot the subject's slot
   * @returns {boolean}
   */
  confirms(e, slot) {
    const sprite = INK[e.sprite];
    if (sprite === undefined) return false;
    const self = slot + 1;
    const originX = e.x - 28 + sprite.minX;   // the crop offset, as in paint()
    const originY = e.y + sprite.minY;

    for (let y = 0; y < sprite.h; y++) {
      const row = originY + y;
      if (row < 0 || row >= SCREEN_H) continue;
      const rowBase = row * SCREEN_W;
      const inkBase = y * sprite.w;
      for (let x = 0; x < sprite.w; x++) {
        if (!sprite.ink[inkBase + x]) continue;
        const col = originX + x;
        if (col < 0 || col >= SCREEN_W) continue;
        const occupant = this.buf[rowBase + col];
        if (occupant !== 0 && occupant !== self) return true;
      }
    }
    return false;
  }

  /**
   * § 20.6's stencil invariant: the buffer holds only 0, or the slot + 1 of a
   * live entity.
   * @param {Object} entities an EntityList
   * @returns {string[]} one message per violation
   */
  check(entities) {
    /** @type {string[]} */
    const bad = [];
    const seen = new Set();
    for (let i = 0; i < this.buf.length; i++) {
      const v = this.buf[i];
      if (v === 0 || seen.has(v)) continue;
      seen.add(v);
      if (v === SCENERY_ID) {
        bad.push('scenery id 255 written, but nothing should write it (§ 3.5)');
      } else if (v - 1 >= entities.liveCount) {
        bad.push('stencil holds id ' + v + ' (slot ' + (v - 1) +
          ') but only ' + entities.liveCount + ' entities are live');
      }
    }
    return bad;
  }
}
