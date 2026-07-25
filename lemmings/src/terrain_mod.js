// lemmings/src/terrain_mod.js
//
// The terrain-modification primitives (design_spec Chapter 16): the five ways a
// skill reshapes the collision buffer. Three remove terrain through a MASK
// (bash / mine / explosion), one lays bricks, one digs a row. Chapter 15 owns
// *when* each is called; this file owns *what it does to the buffer*.
//
// NONE of these consult the object map (§16.7): a mask removes every terrain pixel
// under a set bit, a dig clears its whole row, a brick fills every empty pixel.
// Steel and one-way walls are respected because the *handler* stops the skill
// before its mask reaches protected terrain — never by filtering the pixels here.

import { MASKS } from '../assets/dat_masks.js';

/** @typedef {import('./terrain.js').Terrain} Terrain */
/** @typedef {import('./lemming.js').Lemming} Lemming */

// Sprite-placement offsets (§11.2): footDx/footDy = −(foot anchor). The sprite
// origin — and every mask's top-left — is (x + footDx, y + footDy) = (x − footX,
// y − footY), the same point the renderer draws from (§1.4, §16.2).

/**
 * Apply a 1-bit mask at a world top-left: every set bit removes the terrain pixel
 * under it; clear bits are no-ops; out-of-world writes are discarded (§16.1, §3.4).
 * @param {Terrain} terrain
 * @param {Uint8Array} frame row-major w×h mask (1 = remove)
 * @param {number} w
 * @param {number} h
 * @param {number} x0 world x of the mask's top-left
 * @param {number} y0 world y of the mask's top-left
 * @returns {void}
 */
function applyMask(terrain, frame, w, h, x0, y0) {
  for (let my = 0; my < h; my++) {
    const row = my * w;
    for (let mx = 0; mx < w; mx++) {
      if (frame[row + mx]) terrain.removeTerrain(x0 + mx, y0 + my);
    }
  }
}

/**
 * §16.2 — apply one bash-mask frame (0..3) at the lemming's sprite origin. The
 * mask is mirrored: a left-facing lemming uses the `_rtl` form.
 * @param {Terrain} terrain
 * @param {Lemming} lem
 * @param {number} frame 0..3
 * @returns {void}
 */
export function applyBashMask(terrain, lem, frame) {
  const mask = lem.direction < 0 ? MASKS.bash_rtl : MASKS.bash;
  applyMask(terrain, mask.frames[frame], mask.w, mask.h, lem.x - lem.footX, lem.y - lem.footY);
}

/**
 * §16.3 — apply one mine-mask application (0 or 1). Frame 0 sits at the sprite
 * origin; frame 1 is offset one pixel forward and one pixel down, which is what
 * turns the two cuts into a downward diagonal. Mirrored like the bash mask.
 * @param {Terrain} terrain
 * @param {Lemming} lem
 * @param {number} which 0 or 1
 * @returns {void}
 */
export function applyMineMask(terrain, lem, which) {
  const mask = lem.direction < 0 ? MASKS.mine_rtl : MASKS.mine;
  const x0 = lem.x - lem.footX + (which === 1 ? lem.direction : 0);
  const y0 = lem.y - lem.footY + (which === 1 ? 1 : 0);
  applyMask(terrain, mask.frames[which], mask.w, mask.h, x0, y0);
}

/**
 * §16.4 — apply the explosion mask, centred on the lemming: the 16-wide mask sits
 * at x−8 and the 22-tall mask at y−14, so the crater straddles and rises above
 * where the lemming stood. Symmetric (facing does not matter). The handler gates
 * this (no crater on steel or in water, §15.14); once called it always removes.
 * @param {Terrain} terrain
 * @param {Lemming} lem
 * @returns {void}
 */
export function applyExplosionMask(terrain, lem) {
  const mask = MASKS.explosion;
  applyMask(terrain, mask.frames[0], mask.w, mask.h, lem.x - 8, lem.y - 14);
}

/**
 * §16.5 — lay one builder brick: a 6-pixel horizontal line one pixel above the
 * foot, extending forward from the foot (rightward from x, or from x−4 when facing
 * left). Fills ONLY empty pixels, so a brick merges into terrain it runs into
 * rather than punching through it.
 * @param {Terrain} terrain
 * @param {Lemming} lem
 * @returns {void}
 */
export function layBrick(terrain, lem) {
  const xStart = lem.direction > 0 ? lem.x : lem.x - 4;
  const rowY = lem.y - 1;
  for (let px = xStart; px < xStart + 6; px++) {
    if (!terrain.hasTerrain(px, rowY)) terrain.setSolid(px, rowY);
  }
}

/**
 * §16.6 — clear one 9-pixel-wide row (x−4 … x+4) at `rowY` (clamped ≥ 0). Returns
 * whether it removed anything — the digger reads this: a row already empty means it
 * has broken through into a cavity (§15.10).
 * @param {Terrain} terrain
 * @param {Lemming} lem
 * @param {number} rowY
 * @returns {boolean} removedAny
 */
export function digOneRow(terrain, lem, rowY) {
  const y = rowY < 0 ? 0 : rowY;
  let removedAny = false;
  for (let px = lem.x - 4; px <= lem.x + 4; px++) {
    if (terrain.hasTerrain(px, y)) { terrain.removeTerrain(px, y); removedAny = true; }
  }
  return removedAny;
}
