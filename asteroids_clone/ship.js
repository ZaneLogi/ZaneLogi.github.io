// asteroids_clone/ship.js
//
// Ship actor — JS port of source's $1B slot. Ship-specific motion
// constants (MAX_VEL, THRUST_ACCEL, FRICTION) live here since they're
// derived from ship physics and not shared with other actors.

import { WORLD_W, WORLD_H, GAME_TO_DVG } from './world.js';

// $7125 — clamp horzVel/vertVel to [-64, +63] (source byte range).
// In game-coord: ±0.25 (= 64/256). Sub-byte fractional accumulator is
// collapsed into the float per R-C §7 recommendation.
const MAX_VEL = 0.25;

// $70AE/$70C7 — accel per thrust frame is (2 × cos/sin) added to the
// 16-bit velocity. With cos max ≈ 64, that's 128/65536 ≈ 0.00195
// game-units/tick at peak, reaching MAX_VEL in ~128 ticks ≈ 2 sec @ 62.5 Hz.
const THRUST_ACCEL = MAX_VEL / 128;

// $70E1-$7124 — friction-off path decays 16-bit velocity by ~2×|vel_hi|
// per frame. Per-tick decay factor ≈ (1 - 2/256) = 0.9922; matches the
// cabinet's ~1.4-sec half-life feel. Port deviation: linear damping
// replaces the source's piecewise sub-byte arithmetic.
const FRICTION = 1 - 2 / 256;

export class Ship {
  constructor() {
    this.status = 1;        // $021B — 0 absent, 1 alive, $80+ exploding (I-8a: start alive)
    this.vx = 0;            // $023E — collapsed to Float64 (R-C §7); range ±MAX_VEL
    this.vy = 0;            // $0261 — collapsed to Float64; range ±MAX_VEL
    this.x = WORLD_W / 2;   // game-coord center X (16 of 0..32)
    this.y = WORLD_H / 2;   // game-coord center Y (12 of 0..24)
    this.direction = 0;     // $61 — 0-255 around the circle; 0 = east
  }

  // $7086-$709A rotation step: direction += signed delta, mod 256.
  rotate(delta) {
    this.direction = (this.direction + delta) & 0xff;
  }

  // $70AC-$70DE — accelerate by (cos, sin) of direction. Source ASLs a
  // 0..64-magnitude LUT entry, adds to 16-bit velocity, clamps the high
  // byte to ±64. JS uses Math.cos/sin directly (deviation: skip the
  // $77D2/$77D5 LUT; LUT contents are in the un-disasm region anyway).
  applyThrust() {
    const rad = (this.direction / 256) * 2 * Math.PI;
    this.vx = Math.max(-MAX_VEL, Math.min(MAX_VEL, this.vx + THRUST_ACCEL * Math.cos(rad)));
    this.vy = Math.max(-MAX_VEL, Math.min(MAX_VEL, this.vy + THRUST_ACCEL * Math.sin(rad)));
  }

  // $70E1-$7124 — linear damping per tick. See FRICTION note above.
  applyFriction() {
    this.vx *= FRICTION;
    this.vy *= FRICTION;
  }

  // $6FC7-$7016 — position += velocity, with toroidal wrap. X mod 32
  // ($6FDC AND #$1F), Y mod 24 ($7007 CMP #$18). Float64 + modulo
  // collapses the 16-bit hi/lo carry-propagation per R-C §7.
  advancePosition() {
    this.x = ((this.x + this.vx) % WORLD_W + WORLD_W) % WORLD_W;
    this.y = ((this.y + this.vy) % WORLD_H + WORLD_H) % WORLD_H;
  }

  // Game-coord → DVG-coord per research_position_math.md §6 (× 32).
  // Returns a fresh {x, y} for the renderer; callers don't share storage.
  dvgPos() {
    return { x: this.x * GAME_TO_DVG, y: this.y * GAME_TO_DVG };
  }

  // $750B — fold the 8-bit direction down to one of 17 base ShipDirN
  // shapes (covering 0-90°) plus X/Y flip flags (deriving the other 270°
  // by reflection). Returns {name, xFlip, yFlip} for the renderer.
  shapeSelection() {
    let a = this.direction & 0xff;
    let yFlip = false, xFlip = false;

    // $7511-$751B — direction & 0x80 set (south half) → fold to (256 - dir),
    // set Y-flip flag.
    if (a & 0x80) {
      yFlip = true;
      a = (-a) & 0xff;
    }

    // $751D-$7528 — folded a's bit 7 or bit 6 set (source's BIT / BMI / BVC)
    // → fold via (128 - a), set X-flip flag. Mask 0xC0 catches both bits.
    if (a & 0xC0) {
      xFlip = true;
      a = (0x80 - a) & 0xff;
    }

    // $752E-$7531 — quantize folded direction (0..64) to a multiple of 4,
    // matching the 17 ShipDirN steps. Source: LSR A; AND #$FE; TAY.
    // Equivalent JS: clear the low 2 bits.
    return { name: `ShipDir${a & ~3}`, xFlip, yFlip };
  }
}
