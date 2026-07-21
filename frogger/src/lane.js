// lane.js — one row: its object type, direction, speed, and its set of Movers; knows whether
// it carries a rider (river) or kills on contact (road) (§6, §3.2). A fixed conveyor, seeded
// deterministically — no RNG.
import { Mover } from './mover.js';

/** @typedef {import('./renderer.js').Renderer} Renderer */

export class Lane {
  constructor(cfg, level = 1) {
    this.cfg = cfg;
    this.level = level;
    this.carries = cfg.band === 'river';
    this.kills = cfg.band === 'road' || (cfg.band === 'median' && !cfg.safe);
    this.movers = [];   // TODO(impl): seed n movers evenly from phase φ = index×20 (§3.2)
  }

  // TODO(impl): step each mover by dir·V·(level speed-up, §3.3); carry a riding frog (§7 step 4).
  advance() {}

  // TODO(impl): drawSprite per on-screen mover (logs are multi-tile; §3.1 sprites).
  /** @param {Renderer} renderer @param {number} y */
  render(renderer, y) {}
}
