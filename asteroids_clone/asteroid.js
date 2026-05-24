// asteroids_clone/asteroid.js
//
// Asteroid actor — JS port of source's $00-$1A slot range.
// Hybrid design: data as classes, behavior as cited free functions
// (task_seq.js + future per-subsystem modules). See state.js header
// for the broader convention.

import { WORLD_W, WORLD_H, GAME_TO_DVG } from './world.js';

export class Asteroid {
  constructor() {
    this.status = 0;        // $0200+slot — low 2 bits = size (0=large, 1=small, 2=med);
                            //   bit 2 = "alive marker" set by $71A2; bits 3-4 = shape-
                            //   variant seed set by $71A0 (picks 1 of 4 fixed Rock
                            //   tumble poses, NEVER cycled per-frame for alive
                            //   asteroids); high bit = "exploding" flag
    this.vx = 0;            // signed velocity
    this.vy = 0;
    this.x = 0;             // Float64 — collapses (x_hi, x_lo) per R-C §7
    this.y = 0;
  }

  // $6FC7-$7016 — position += velocity, with toroidal wrap. X mod 32,
  // Y mod 24. Same shape as Ship.advancePosition / Shot.advancePosition;
  // source's $6F57 dispatch reuses one motion routine across all object
  // types (research_position_math.md §3).
  advancePosition() {
    this.x = ((this.x + this.vx) % WORLD_W + WORLD_W) % WORLD_W;
    this.y = ((this.y + this.vy) % WORLD_H + WORLD_H) % WORLD_H;
  }

  // Game-coord → DVG-coord (× 32). Mirrors Ship.dvgPos.
  dvgPos() {
    return { x: this.x * GAME_TO_DVG, y: this.y * GAME_TO_DVG };
  }

  // $7365-$736A — pick 1 of 4 Rock shapes from status bits 3,4. These
  // bits are the "shape-variant seed" set by $71A0 AND #$18 at spawn
  // and NEVER CHANGE during an alive asteroid's lifetime — each asteroid
  // stays in one of 4 fixed tumble poses (Rock1..Rock4). The poses LOOK
  // like 4 rotations of the same rock, but no per-frame animation runs;
  // source-listing convention calls these "rotation bits" but that's
  // misleading. See research_collisions.md §3.
  shapeSelection() {
    return `Rock${1 + ((this.status & 0x18) >> 3)}`;
  }

  // $701B-$7025 — size bits → globalScale. Small (bit 0 set) → 14,
  // medium (bit 1 set, bit 0 clear) → 15, large (neither) → 0. Under
  // the wrap-and-saturate DVG scale model, 14/15/0 produce shifts 3/4/5
  // (monotonic 2x size progression). See research_dvg.md §4 design-note
  // for why this specific triplet — the ordering looks backwards but
  // is dictated by the mod-16 wrap.
  globalScale() {
    if (this.status & 0x01) return 14;  // small
    if (this.status & 0x02) return 15;  // medium
    return 0;                            // large
  }
}
