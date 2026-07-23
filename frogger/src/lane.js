// lane.js — one row: its object type, direction, speed, and its set of Movers; knows whether
// it carries a rider (river) or kills on contact (road) (§6, §3.2). A fixed conveyor, seeded
// deterministically — no RNG.
import { Mover } from './mover.js';
import { WRAP_L, ANIM, TIMED, RAMP, speedFactor, laneCount } from './constants.js';

/** @typedef {import('./renderer.js').Renderer} Renderer */

export class Lane {
  /** @param {object} cfg  @param {number} level  @param {number} index  top→bottom lane index (§3.2 φ) */
  constructor(cfg, level = 1, index = 0) {
    this.cfg = cfg;
    this.level = level;
    this.index = index;
    this.carries = cfg.band === 'river';
    // §3.3 level ramp: the effective speed (base V × the capped speed factor) and count (the per-lane
    // schedule, else the base n). `advance` and the river carry read `this.v`; `_seed` reads `this.n`.
    this.v = cfg.v * speedFactor(level);
    this.n = laneCount(cfg.id, cfg.n, level);
    /** @type {Mover[]} */
    this.movers = [];
    this._seed();
    // Road lanes always kill on contact; the median is safe grass until its snake is seeded
    // (from level 2, §3.4) — then it kills like a road lane. So `kills` follows the seed.
    this.kills = cfg.band === 'road' || (cfg.band === 'median' && this.movers.length > 0);
    // Diving turtles (§3.4): in a turtle lane the first group (movers[0]) submerges on the T_DIVE
    // cycle; from level 3 a second group (movers[1]) also dives (§3.3), offset half a cycle so the
    // two never submerge together. Each diver's phase adds the lane's own offset (index·T_DIVE/2) so
    // the two turtle lanes also stay out of unison. Non-dive lanes leave `divers` empty.
    /** @type {{ m: Mover, phase: number }[]} */
    this.divers = [];
    if (cfg.dive) {
      const base = index * (TIMED.T_DIVE / 2);
      this.divers.push({ m: this.movers[0], phase: base });
      if (level >= RAMP.DIVE_2ND_MIN_LEVEL && this.movers.length > 1) {
        this.divers.push({ m: this.movers[1], phase: base + TIMED.T_DIVE / 2 });
      }
    }
    // River crocodile (§3.4, from level 2): one River-1 log is a croc whose front tile (the mouth)
    // is lethal while open; its back rides like a log. Absent below level 2 → plain logs.
    this.croc = (level >= 2 && cfg.croc) ? this.movers[TIMED.CROC_LOG] : null;
  }

  // Whether `mover` is a diving group currently submerged — the last quarter of the T_DIVE cycle,
  // offset by that diver's own phase (§3.4). Returns false for any non-diver (so callers can test
  // any mover). A rider drowns while its group is under.
  submerged(frame, mover) {
    const d = this.divers.find((d) => d.m === mover);
    return !!d && (frame + d.phase) % TIMED.T_DIVE >= TIMED.T_DIVE * 0.75;
  }

  // Whether the river crocodile's mouth is open (its front tile lethal) — the last third of the
  // T_MOUTH cycle (§3.4). Only meaningful on a lane that has a croc.
  mouthOpen(frame) {
    return !!this.croc && frame % TIMED.T_MOUTH >= TIMED.T_MOUTH * 2 / 3;
  }

  // Seed N movers evenly along the wrap length: left edge x_i = (φ + i·P) mod L, pitch P = L/N,
  // phase φ = index·20 staggers the lanes (§3.2). River/road lanes seed at every level; the median
  // seeds its single snake only from level 2 (§3.4) — below that it is empty safe grass.
  _seed() {
    const { band, w } = this.cfg;
    const n = this.n;   // the §3.3-scheduled count for this level
    const seeded = band === 'river' || band === 'road' || (band === 'median' && this.level >= 2);
    if (!seeded) return;
    const phi = this.index * 20;
    const P = WRAP_L / n;
    for (let i = 0; i < n; i++) this.movers.push(new Mover((phi + i * P) % WRAP_L, w));
  }

  // Step each mover by dir·V — the §3.3-ramped speed (this.v). A riding frog is carried the same
  // pixels by collision (§7 step 4), which reads the same this.v.
  advance() {
    const dx = this.cfg.dir * this.v;
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
    // A diving group draws its submerged frames while under; the crocodile draws its mouth
    // closed/open sprite in place of the log tiles (§3.4/§3.5).
    const diveSpec = this.cfg.dive ? { body: this._frame(this.cfg.dive, frame) } : null;
    const crocSpec = this.croc ? { body: this.mouthOpen(frame) ? 'croc_1' : 'croc_0' } : null;
    for (const m of this.movers) {
      let s = spec;
      if (diveSpec && this.submerged(frame, m)) s = diveSpec;
      else if (m === this.croc) s = crocSpec;
      renderer.drawObject(s, m.x, y, m.w);
      if (m.x + m.w > WRAP_L) renderer.drawObject(s, m.x - WRAP_L, y, m.w);
    }
  }
}
