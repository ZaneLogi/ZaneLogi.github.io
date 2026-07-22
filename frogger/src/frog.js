// frog.js — the player: hop, ride, facing, spawn, death (§6, §3.5, §7).
// A hop glides the frog one cell as a smooth HOP_FRAMES-frame slide, not a teleport: one lane
// vertically (via the row index → ROWS.ANCHOR_Y, a uniform 16 px grid) or one 16 px column
// horizontally. Input is locked for the hop's duration (one hop per press); collision resolves
// when it lands (§7). While landed on a river object the frog is carried at the lane's drift
// (`riding` / `rideDx`, set by Collision) — §7 step 2.
import { FROG, FROG_FRAMES, ROWS, SCREEN } from './constants.js';

/** @typedef {import('./renderer.js').Renderer} Renderer */

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export class Frog {
  constructor() { this.reset(); }

  reset() {
    this.row = 0;                 // 0 = start row; increases toward the homes (row MAX_ROW)
    this.x = FROG.SPAWN_X;        // sprite left, horizontally centred
    this.y = ROWS.ANCHOR_Y[0];
    this.facing = 'up';           // up | down | left | right
    this.hopping = false;
    this.slide = 0;               // frames left in the current slide
    this.stepX = 0;               // per-frame pixels while sliding
    this.stepY = 0;
    this.destRow = this.row;       // where the slide lands (snapped exactly on arrival)
    this.destX = this.x;
    this.destY = this.y;
    this.riding = null;           // the Mover it stands on, if any (a river object)
    this.rideDx = 0;              // that mover's per-frame drift, carried while landed (§7 step 2)
    this.hasLady = false;         // carrying the escorted lady-frog on its back (§3.4) — lost on death
  }

  // Begin a hop: face `dir`, then slide one cell if the target is on the field. A hop blocked
  // at the edge only turns the frog (no lock), so the player can try another way at once.
  beginHop(dir) {
    if (this.hopping) return;                       // input locked mid-hop (one hop per press)
    this.facing = dir;
    let destRow = this.row, destX = this.x;
    if (dir === 'up') destRow = Math.min(this.row + 1, ROWS.MAX_ROW);
    else if (dir === 'down') destRow = Math.max(this.row - 1, 0);
    else if (dir === 'left') destX = clamp(this.x - SCREEN.CELL, FROG.MIN_X, FROG.MAX_X);
    else if (dir === 'right') destX = clamp(this.x + SCREEN.CELL, FROG.MIN_X, FROG.MAX_X);
    const destY = ROWS.ANCHOR_Y[destRow];
    if (destX === this.x && destY === this.y) return; // blocked at the edge — just faced it
    this.destRow = destRow;
    this.destX = destX;
    this.destY = destY;
    this.stepX = (destX - this.x) / FROG.HOP_FRAMES;  // 0 on the axis that doesn't move
    this.stepY = (destY - this.y) / FROG.HOP_FRAMES;
    this.slide = FROG.HOP_FRAMES;
    this.hopping = true;
  }

  // Advance the current hop; snap to the target cell on the final frame. While landed, a frog
  // riding a river object is carried by last frame's lane drift (§7 step 2). No carry mid-hop
  // (the frog is in transit) — the ride is re-resolved by Collision when it lands.
  update() {
    if (!this.hopping) {
      if (this.riding) this.x += this.rideDx;   // carried at the lane's speed while on an object
      return;
    }
    this.x += this.stepX;
    this.y += this.stepY;
    if (--this.slide <= 0) {
      this.row = this.destRow;                        // exact landing — no float drift
      this.x = this.destX;
      this.y = this.destY;
      this.hopping = false;
    }
  }

  // frog_0..7 by facing × rest/hop: the hop frame during the slide, the rest frame landed (§3.5).
  // When carrying the escorted lady-frog, a cyan-recoloured frog rides on the back (§3.4), drawn
  // just BELOW the frog (`+LADY_DY`, so her screen-y is greater than the frog's). Feel value, tunable.
  /** @param {Renderer} renderer */
  render(renderer) {
    const frames = FROG_FRAMES[this.facing];
    renderer.drawSprite(frames[this.hopping ? 1 : 0], this.x, this.y);
    if (this.hasLady) {
      const cyan = renderer.recolored('cyan', renderer.sprites.FROG_RECOLOR.cyan);
      renderer.drawSpriteFrom(cyan, FROG_FRAMES.up[0], this.x, this.y + FROG.LADY_DY);
    }
  }
}
