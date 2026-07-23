// collision.js — the rules: for the frog's current landed row, decide safe / ride / drown /
// squash by span overlap against that row's objects (§6, §7 step 3, §8). Home / pickup land
// with Homes (step 4). Called only while the frog is landed (Play skips it mid-hop), and
// resolves against the movers' *current* positions — which are still last frame's drawn
// positions, since the lanes advance afterwards in §7 step 4.
import { ROWS, SCREEN, WRAP_L } from './constants.js';

/** @typedef {import('./frog.js').Frog} Frog */
/** @typedef {import('./playfield.js').Playfield} Playfield */
/** @typedef {import('./lane.js').Lane} Lane */

const HALF = SCREEN.CELL / 2;   // the 16 px frog sprite's centre is 8 px in from its left

export class Collision {
  /**
   * Resolve the frog's landed cell → 'safe' | 'ride' | 'drown' | 'squash' | 'home' | 'pickup'.
   * - **home band** (top row): delegated to `Homes.land` — 'home' (filled a bay), 'pickup' (bay +
   *   bonus insect), or 'death'.
   * - **river** (`lane.carries`): safe *only while riding* an object; open water or being
   *   carried off a screen edge drowns, as does riding the diving turtle group while it is
   *   **submerged** (§3.4). Riding is decided by the frog's **centre** over a mover (you must be
   *   on the log), and records the ride (`frog.riding` / `frog.rideDx`) so §7 step 2 carries it.
   * - **road** (`lane.kills`): **any** span overlap with a vehicle squashes (contact = death,
   *   a deliberately more generous hitbox than the river's centre test — see docs §step 3).
   * - **safe strips** (start row, median) and the **home band**: always safe here; the bay
   *   landing test is Homes (step 4).
   * @param {Frog} frog @param {Playfield} playfield @param {number} frame  the global tick counter
   */
  resolve(frog, playfield, frame = 0) {
    // The home band (top row) is Homes' business: it runs the bay landing test → home / pickup /
    // death (§6, step 4). Everything below is a lane band.
    if (frog.row === ROWS.MAX_ROW) { frog.riding = null; return playfield.homes.land(frog.x + HALF); }

    // Which lane's band does the frog stand in? Lanes render at FIRST_LANE_Y + i·CELL and the
    // frog's row anchors at ANCHOR_Y[row]; equate to recover i. Out of range ⇒ a safe strip
    // (start row above the lanes) — no lane there.
    const i = (ROWS.ANCHOR_Y[frog.row] - ROWS.FIRST_LANE_Y) / SCREEN.CELL;
    const lane = playfield.lanes[i];
    if (!lane || (!lane.carries && !lane.kills)) { frog.riding = null; return 'safe'; }

    const cx = frog.x + HALF;                    // the frog's centre x
    if (lane.carries) {                          // river
      if (cx < 0 || cx >= SCREEN.WIDTH) { frog.riding = null; return 'drown'; }  // carried off edge
      const otter = playfield.otter;             // the roaming otter kills while surfaced (§3.4)
      if (otter && otter.lane === lane && otter.hits(frog.x, frog.x + SCREEN.CELL)) {
        frog.riding = null; return 'drown';
      }
      const m = this._under(lane, cx);
      if (m) {
        if (lane.submerged(frame, m)) { frog.riding = null; return 'drown'; }                  // dived under
        if (m === lane.croc && lane.mouthOpen(frame) && this._inJaws(m, lane.cfg.dir, cx)) {
          frog.riding = null; return 'drown';                                                  // the open mouth
        }
        frog.riding = m; frog.rideDx = lane.cfg.dir * lane.v;
        // Hopping onto the lady-frog's log picks her up — she rides on the frog's back (§3.4).
        const lady = playfield.lady;
        if (lady && lady.active && !lady.taken && !frog.hasLady && lane === lady.lane && m === lady.log) {
          lady.taken = true; frog.hasLady = true;
        }
        return 'ride';
      }
      frog.riding = null; return 'drown';        // open water
    }
    frog.riding = null;                          // road
    return this._overlaps(lane, frog.x, frog.x + SCREEN.CELL) ? 'squash' : 'safe';
  }

  // The mover whose span contains x (the frog's centre) — testing each mover's on-screen span
  // and its seam wrap copy (matching Lane.render's copy at m.x − WRAP_L). Null over open water.
  /** @param {Lane} lane @param {number} x */
  _under(lane, x) {
    for (const m of lane.movers) {
      if (x >= m.x && x < m.x + m.w) return m;
      const wx = m.x - WRAP_L;                    // the seam wrap copy
      if (x >= wx && x < wx + m.w) return m;
    }
    return null;
  }

  // Is the frog's centre over the crocodile's leading front tile (the mouth) — of either the
  // primary span or its seam wrap copy? The front is the leading CELL px by the lane's direction.
  /** @param {import('./mover.js').Mover} m @param {number} dir @param {number} cx */
  _inJaws(m, dir, cx) {
    const cell = SCREEN.CELL;
    const front = (base) => (dir > 0 ? base + m.w - cell : base);
    const hit = (base) => cx >= front(base) && cx < front(base) + cell;
    return hit(m.x) || hit(m.x - WRAP_L);
  }

  // Does the span [x0, x1) overlap any mover's span (or its wrap copy)? 1-D AABB test, used for
  // the road squash (any contact kills).
  /** @param {Lane} lane @param {number} x0 @param {number} x1 */
  _overlaps(lane, x0, x1) {
    for (const m of lane.movers) {
      if (x0 < m.x + m.w && x1 > m.x) return true;
      const wx = m.x - WRAP_L;
      if (x0 < wx + m.w && x1 > wx) return true;
    }
    return false;
  }
}
