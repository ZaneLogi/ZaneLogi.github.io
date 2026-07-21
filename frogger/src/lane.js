// lane.js — one row: its object type, direction, speed, and its set of Movers; knows whether
// it carries a rider (river) or kills on contact (road) (§6, §3.2). A fixed conveyor, seeded
// deterministically — no RNG.
import { Mover } from './mover.js';
import { WRAP_L, ANIM } from './constants.js';

/** @typedef {import('./renderer.js').Renderer} Renderer */

export class Lane {
  /** @param {object} cfg  @param {number} level  @param {number} index  top→bottom lane index (§3.2 φ) */
  constructor(cfg, level = 1, index = 0) {
    this.cfg = cfg;
    this.level = level;
    this.index = index;
    this.carries = cfg.band === 'river';
    this.kills = cfg.band === 'road' || (cfg.band === 'median' && !cfg.safe);
    /** @type {Mover[]} */
    this.movers = [];
    this._seed();
  }

  // Seed N movers evenly along the wrap length: left edge x_i = (φ + i·P) mod L, pitch P = L/N,
  // phase φ = index·20 staggers the lanes (§3.2). The median snake enters at an edge on a timer,
  // not as a fixed conveyor, so it is seeded later (hazard step), not here.
  _seed() {
    const { band, n, w } = this.cfg;
    if (band !== 'river' && band !== 'road') return;
    const phi = this.index * 20;
    const P = WRAP_L / n;
    for (let i = 0; i < n; i++) this.movers.push(new Mover((phi + i * P) % WRAP_L, w));
  }

  // Step each mover by dir·V (level-1 speed; the §3.3 level ramp on V and N lands in step 8).
  // Carrying a riding frog arrives with collision (§7 step 4, step 3 of the plan).
  advance() {
    const dx = this.cfg.dir * this.cfg.v;
    for (const m of this.movers) m.advance(dx);
  }

  // Resolve a tile part to the sprite to draw this frame: a static sprite name as-is, or the
  // current frame of an animated part (cosmetic cycle at ANIM.RATE, §3.5). (Dive/croc state
  // frames get selected here too once their §3.4 timers drive the choice.)
  _frame(ref, frame) {
    return Array.isArray(ref) ? ref[Math.floor(frame / ANIM.RATE) % ref.length] : ref;
  }

  // Draw each mover from its tile spec (logs = end caps + repeating body; turtles/vehicles =
  // body only), resolving animated parts for this frame, with a seamless wrap copy when it
  // straddles the wrap seam (§3.1, §3.2, §3.5).
  /** @param {Renderer} renderer @param {number} y @param {number} frame  the global tick counter */
  render(renderer, y, frame = 0) {
    const t = this.cfg.tiles;
    const spec = {
      body: this._frame(t.body, frame),
      left: t.left && this._frame(t.left, frame),
      right: t.right && this._frame(t.right, frame),
    };
    for (const m of this.movers) {
      renderer.drawObject(spec, m.x, y, m.w);
      if (m.x + m.w > WRAP_L) renderer.drawObject(spec, m.x - WRAP_L, y, m.w);
    }
  }
}
