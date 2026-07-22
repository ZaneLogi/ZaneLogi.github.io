// ladyfrog.js — the cyan lady-frog escort (§3.4, the ride-a-log / ride-on-back model). She boards
// River 4 by sitting on one of its logs; while she's aboard the player can hop onto that log to
// pick her up — she then rides on the frog's back (drawn by Frog) and a home landing pays +200.
// Uncollected, she rides off with the cycle and re-boards on the T_LADY timer. She is the player
// frog recoloured cyan (§5.1, §3.5).
import { SCREEN, TIMED, WRAP_L, FROG_FRAMES } from './constants.js';

/** @typedef {import('./lane.js').Lane} Lane */
/** @typedef {import('./renderer.js').Renderer} Renderer */

export class LadyFrog {
  /** @param {Lane} lane  River 4  @param {number} y  its render row y */
  constructor(lane, y) {
    this.lane = lane;
    this.y = y;
    this.active = false;   // aboard a river log (available to pick up)
    this.taken = false;    // picked up this cycle → now on the frog's back, off the river
  }

  reset() { this.active = false; this.taken = false; }

  // The log she sits on (her platform) and her sprite-left, centred on it.
  get log() { return this.lane.movers[TIMED.LADY_LOG]; }
  get x() { const m = this.log; return m ? m.x + (m.w - SCREEN.CELL) / 2 : 0; }

  // Board on each T_LADY cycle; ride off after LADY_WINDOW frames (§3.4). Deterministic — the
  // spawn is gated on the frame counter, and her position tracks her (conveyor) log.
  update(frame) {
    const t = frame % TIMED.T_LADY;
    if (t === 0) { this.active = true; this.taken = false; }
    if (t >= TIMED.LADY_WINDOW) this.active = false;
  }

  // While aboard (available), draw the cyan frog on her log, with a seam wrap copy like the lane.
  /** @param {Renderer} renderer */
  render(renderer) {
    if (!this.active || this.taken || !this.log) return;
    const cyan = renderer.recolored('cyan', renderer.sprites.FROG_RECOLOR.cyan);
    const name = FROG_FRAMES.up[0];                 // an up-facing rest frame
    renderer.drawSpriteFrom(cyan, name, this.x, this.y);
    if (this.log.x + this.log.w > WRAP_L) renderer.drawSpriteFrom(cyan, name, this.x - WRAP_L, this.y);
  }
}
