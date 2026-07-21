// frog.js — the player: hop, ride, facing, spawn, death (§6, §3.5, §7).
import { FROG } from './constants.js';

/** @typedef {import('./renderer.js').Renderer} Renderer */

export class Frog {
  constructor() { this.reset(); }

  reset() {
    this.x = FROG.SPAWN_X;   // start row, horizontally centred
    this.row = 0;            // 0 = start row; increases toward the homes
    this.facing = 'up';      // up | down | left | right
    this.hopping = false;
    this.slide = 0;          // frames remaining in the current 8-frame hop
    this.riding = null;      // the Mover it stands on, if any
  }

  // TODO(impl): lock input, begin the smooth 8-frame @ 2 px slide one cell in `dir` (§6).
  beginHop(dir) {}

  // TODO(impl): advance the hop 2 px, or (landed) apply last frame's ride carry (§7 step 2).
  update() {}

  // TODO(impl): frog_0..7 by facing × rest/hop; the hop frame during the slide (§3.5).
  /** @param {Renderer} renderer */
  render(renderer) {}
}
