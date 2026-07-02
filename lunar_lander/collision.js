// lunar_lander/collision.js
//
// The land/crash VERDICT (CLAUDE.md module table): a routine-level translation of
// DECODE (A34573.1A :2087 — ship-corner-to-terrain distances) + SCPDST (:2930 —
// min lower-corner clearance) + SCAPLND (:2794 — the landing gate), producing
// state.collisionStatus (the source's COLFLG — see the CollisionStatus enum in
// state.js). Terrain FACTS come from landscape
// (heightAt); the verdict lives HERE (the facts-vs-verdict split). main.js calls
// update() every PLAY tick after motion + camera framing (the source order:
// ACCEL → DECODE :484 → SCAPCHG/SCAPLND :485).
//
// Measurement model — faithful, with two labeled simplifications:
//   • The source walks the scape's VG display list per corner and takes AXIS
//     distances: DISTX* at the UPPER corners (sideways gap to rising terrain),
//     DISTY* at the LOWER corners (vertical clearance), crashing on a negative
//     (penetrated) distance (:2350-2352 / :2396-2399 / :2547-2549). The terrain
//     is a strict heightfield (no overhangs), so corner-below-surface —
//     cornerY < heightAt(cornerX) — catches every case DISTX*/DISTY* can flag;
//     we probe all FOUR corners vertically and SUBSUME the separate X-axis pass
//     (same outcomes, one query kind).
//   • BOTH corner pairs are measured EVERY tick — the source does the left pair
//     on even frames, the right on odd (DECODE :2092-2113), a CPU-budget hack,
//     not a mechanism (decided 2026-07-02). Ours is one frame more responsive.
//
// The verdict kernel is INTEGER on source-unit values (research_physics.md §13 —
// the asteroids half-distance lesson): clearances floor to whole world units
// before the <2 gate; velocity gates use the 16-bit magnitude high byte.

import { isMajor, CollisionStatus } from './state.js';
import { screenToWorld } from './render.js';

// Ship corner probe points (A34573.1A :3592-3722, VERBATIM) — the silhouette
// extremes per rotation: 32 hand-authored (x,y) offsets per corner, indexed by
// shipRotation 0-31 (CNVRT :2444-2446 reads pair SHIP*2), in ship-local world
// units (Y-up, origin = the cabin-centre DVG origin). MINOR view only: in MAJOR
// the source probes the bare ship point, no offsets (CNVRT :2442-2443, the
// "LITTLE MODULES" path). At upright (rotation 8) all four sit at the leg tips;
// on-side they hug the tall hull side.
const CORNER_UPPER_LEFT = [                                  // SHPUPL — "MODULE UPPER LEFT CORNER(S)" (:3592)
  [-18, 12], [-21, 8], [-22, 4], [-23, -1], [-22, -5], [-21, -8], [-19, -13], [-15, -16],
  [-11, -18], [-8, -21], [-8, 0], [-7, -3], [-7, -4], [-6, -5], [-8, 0], [-8, -1],
  [-8, -3], [-7, -4], [-8, 0], [-7, -2], [-7, -3], [-6, -4], [-8, 0], [-8, -1],
  [-12, 18], [-15, 16], [-19, 13], [-21, 8], [-22, 5], [-23, 1], [-22, -4], [-21, -8],
];
const CORNER_LOWER_LEFT = [                                  // SHPLWL — "MODULE LOWER LEFT CORNER(S)" (:3625)
  [-18, -11], [-16, -15], [-14, -18], [-8, -22], [-5, -22], [-3, -22], [-19, -13], [-15, -16],
  [-9, -18], [-8, -21], [-3, -22], [3, -22], [5, -22], [8, -22], [4, -18], [-4, -7],
  [-3, -8], [-1, -8], [1, -8], [-4, -6], [-3, -7], [-2, -7], [0, -9], [1, -8],
  [-3, -8], [-7, -4], [-7, -6], [-5, -6], [-4, -7], [-3, -7], [-22, -4], [-21, -8],
];
const CORNER_LOWER_RIGHT = [                                 // SHPLWR — "MODULE LOWER RIGHT CORNER(S)" (:3658)
  [3, -7], [4, -7], [5, -7], [6, -5], [-5, -22], [-3, -22], [3, -22], [8, -21],
  [12, -18], [15, -16], [19, -13], [21, -8], [22, -5], [23, -1], [22, 4], [16, -15],
  [18, -12], [21, -8], [22, -4], [3, -7], [4, -7], [5, -6], [7, -6], [7, -4],
  [2, -8], [-1, -8], [0, -9], [2, -7], [3, -7], [4, -6], [-1, -8], [1, -8],
];
const CORNER_UPPER_RIGHT = [                                 // SHPUPR — "MODULE UPPER RIGHT CORNER(S)" (:3691)
  [8, -2], [8, -1], [8, 0], [7, 2], [7, -4], [7, -3], [8, 0], [8, 1],
  [12, -18], [15, -16], [19, -13], [21, -8], [22, -5], [23, -1], [22, 4], [21, 8],
  [18, -12], [21, -8], [22, -4], [23, 1], [22, 5], [21, 8], [19, 13], [15, 16],
  [11, 18], [8, -1], [8, 0], [6, -4], [7, -3], [7, -2], [6, -5], [7, -4],
];

export class Collision {
  constructor() {
    // Measured vertical clearances (world units, ≥0), updated every update():
    //   clearanceLeft/Right — the lower corners' gaps to the terrain (DISTYL/DISTYR)
    //   clearance           — the smaller of the two (the source's SCPDST), read by
    //                         the HUD ALTITUDE and the zoom trigger.
    this.clearance = 0;
    this.clearanceLeft = 0;
    this.clearanceRight = 0;
  }

  // Measure this tick's corner clearances and run the verdict. Clears the status
  // first (ACCEL clears COLFLG, :1943), so it is only ever THIS frame's result.
  update(state, camera, landscape) {
    state.collisionStatus = CollisionStatus.SAFE_FLY;
    const w = screenToWorld(camera, state.posX, state.posY);   // ship origin, world units

    if (isMajor()) {
      // MAJOR: bare-point probe (CNVRT :2442-2443 — no corner offsets).
      const clr = w.y - landscape.heightAt(w.x);
      this.clearanceLeft = this.clearanceRight = this.clearance = Math.max(0, clr);
      if (clr < 0) state.collisionStatus = CollisionStatus.CRASH;   // penetration crash
      return;
    }

    // MINOR: the four rotation-indexed corners.
    const i = ((Math.round(state.shipRotation) % 32) + 32) % 32;
    let penetrated = false;
    const clearAt = (tbl) => {
      const c = tbl[i];
      const clr = (w.y + c[1]) - landscape.heightAt(w.x + c[0]);
      if (clr < 0) penetrated = true;
      return clr;
    };
    const yl = clearAt(CORNER_LOWER_LEFT), yr = clearAt(CORNER_LOWER_RIGHT);   // DISTYL/DISTYR
    clearAt(CORNER_UPPER_LEFT); clearAt(CORNER_UPPER_RIGHT);   // upper pair: penetration only (subsumed DISTX*)
    this.clearanceLeft = Math.max(0, yl);
    this.clearanceRight = Math.max(0, yr);
    this.clearance = Math.min(this.clearanceLeft, this.clearanceRight);        // SCPDST (:2930)
    if (penetrated) {                                          // flew into the scape (DECODE crash)
      state.collisionStatus = CollisionStatus.CRASH;
      return;
    }

    // SCAPLND (:2794-2824) — the landing gate, integer kernel. Runs only when the
    // module is DOWN: both lower-corner clearances < 2 whole units (:2795-2800).
    // Touching with any gate failed = COLLIDE (CRASH), not "no landing".
    const dl = Math.floor(yl), dr = Math.floor(yr);
    if (dl >= 2 || dr >= 2) return;                            // both corners must be down
    let verdict = CollisionStatus.CRASH;                       // default: COLLIDE
    if (i >= 7 && i <= 9) {                                    // near-upright: ships #7,8,9 (:2801-2805)
      const vy = Math.floor(Math.abs(state.velY) / 256);       // |VELY| high byte
      const vx = Math.floor(Math.abs(state.velX) / 256);       // |VELX| high byte
      if (vx < 4) {                                            // lateral gate (:2813-2815)
        if (vy < 4) verdict = CollisionStatus.GOOD_LAND;
        else if (vy < 8) verdict = CollisionStatus.HARD_LAND;  // (:2806-2812)
      }
    }
    state.collisionStatus = verdict;
  }
}
