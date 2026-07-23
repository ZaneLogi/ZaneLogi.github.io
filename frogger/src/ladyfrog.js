// ladyfrog.js — the cyan lady-frog escort (§3.4, the ride-a-log / ride-on-back model). She boards
// River 4 by sitting on one of its logs; while she's aboard the player can hop onto that log to
// pick her up — she then rides on the frog's back (drawn by Frog) and a home landing pays +200.
// She rides her log CONTINUOUSLY until picked up (no vanish-and-return), and only ONE lady is ever
// in play — none boards while the player is already carrying one. She is the player frog recoloured
// cyan (§5.1, §3.5).
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

  // Board on the T_LADY timer, then ride her log CONTINUOUSLY (no vanish-and-return) until picked
  // up. Only one lady is ever in play: while the player carries one, none boards; a fresh one boards
  // on the timer only after she has been delivered or lost. Deterministic — the board is frame-gated
  // and her position tracks her (conveyor) log.
  update(frame, frogHasLady = false) {
    if (frogHasLady) return;                             // one at a time — no new lady while carrying (§3.4)
    if (this.taken) { this.taken = false; this.active = false; }   // delivered / lost last cycle → clear it
    if (frame % TIMED.T_LADY === 0) this.active = true;  // board; then rides her log until picked up
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
