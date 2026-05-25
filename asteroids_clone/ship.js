// asteroids_clone/ship.js
//
// Ship actor — JS port of source's $1B slot. Ship-specific motion
// constants (MAX_VEL, THRUST_ACCEL, FRICTION) live here since they're
// derived from ship physics and not shared with other actors.

import { WORLD_W, WORLD_H, GAME_TO_DVG, PLAYFIELD_Y_OFFSET } from './world.js';
import { SHIP_EXPLOSION_VELOCITY } from './vector_rom_data.js';

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
    // $68F2 cold-init: statusShip=0 + shipSpawnTimer=1. On frame 1 the
    // spawnTimer DECs to 0, respawn fires, status → 1. I-11d restored
    // source-faithful cold-init (previously status=1 short-circuited
    // the spawn sequence).
    this.status = 0;        // $021B — 0 absent, 1 alive, $80+ exploding
    this.vx = 0;            // $023E — collapsed to Float64 (R-C §7); range ±MAX_VEL
    this.vy = 0;            // $0261 — collapsed to Float64; range ±MAX_VEL
    this.x = WORLD_W / 2;   // game-coord center X (16); first respawn refines to 16.375
    this.y = WORLD_H / 2;   // game-coord center Y (12); first respawn refines to 12.375
    this.direction = 0;     // $61 — 0-255 around the circle; 0 = east

    // $7D-$88 X-axis + $89-$94 Y-axis fragment positions in source.
    // I-11e: 6 × {x, y} game-coord offsets from ship's death position.
    // Initialized by Ship.kill; advanced each frame during explosion;
    // read by drawShip's exploding branch for fragment SVEC emit. See
    // docs/research_ship_explosion.md §3-§5 and §8.
    this.shipExplosionFragments = [
      { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 },
      { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 },
    ];
  }

  // $7086-$709A rotation step: direction += signed delta, mod 256.
  rotate(delta) {
    this.direction = (this.direction + delta) & 0xff;
  }

  // $70AC-$70DE — accelerate by (cos, sin) of direction. Source ASLs a
  // 0..64-magnitude LUT entry, adds to 16-bit velocity, clamps the high
  // byte to ±64. JS uses Math.cos/sin directly (deviation: skip the
  // $77D2/$77D5 LUT — source folds a 65-entry quarter-sin table at
  // vector-ROM $57B9 via $77D2 ADC #$40 + $77E3 EOR #$7F symmetric
  // reflection; Math.cos/sin is simpler and exact).
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

  // Game-coord → DVG-coord per research_position_math.md §6 (× 32),
  // plus $72FE's +128 DVG-y playfield offset (research_hud_coords.md §2).
  // Returns a fresh {x, y} for the renderer; callers don't share storage.
  dvgPos() {
    return { x: this.x * GAME_TO_DVG, y: this.y * GAME_TO_DVG + PLAYFIELD_Y_OFFSET };
  }

  // $71E8 — place ship at game-coord (16.375, 12.375). Source bytes:
  // hposhShip = $10 / hposlShip = $60 → 16 + 96/256 = 16.375.
  // vposhShip = $0C / vposlShip = $60 → 12 + 96/256 = 12.375.
  // Zero velocity. Used by both explosion-complete cleanup ($6F93) and
  // respawn ($7068) — source does $71E8 from $6F93 then sets status=1
  // later at $7068 after the spawn-timer countdown.
  placeAtCenter() {
    this.x = 16 + 0x60 / 256;
    this.y = 12 + 0x60 / 256;
    this.vx = 0;
    this.vy = 0;
  }

  // $6B1E-$6B25 + $706F-$707E — ship-hit/hyperspace-death sequence:
  // status = $A0 (exploding), curShips -= 1, shipSpawnTimer = $81 (129
  // frames respawn delay), zero velocity. Sound timer ($69) deferred to R-G.
  //
  // When curShips hits 0, the source's $81 universal-respawn-delay marker
  // ticks to $80 exactly once on the way down ($81 → $80 on the next frame's
  // shipSpawnPhys tick) — and the $6960 game-over flow (I-12e, see
  // playerMgmt → gameOverFlow) catches that $80 frame to fire the cold-
  // attract transition. No special-case needed here.
  kill(state) {
    this.status = 0xA0;
    this.vx = 0;
    this.vy = 0;
    state.curShips -= 1;
    state.shipSpawnTimer = 0x81;

    // $7465-$748C init phase — source writes velocity/16 (signed-shifted)
    // to the HI byte of fragment position. If HI=game-unit, init offset =
    // vx/16 game-units → 2.5-4.4 unit spread, way too wide.
    //
    // **Port deviation: init offset = velocity / 96 instead of / 16.**
    // Cabinet footage (user 2026-05-25) shows a tight burst at ship center
    // — /96 gives fragment offsets in the 0.3-0.7 game-unit range, matching
    // the observed radius. The likely source mechanism is something in
    // $7C49's scale-normalization that effectively divides the rendered
    // position, but the exact correspondence is unresolved (see
    // research_ship_explosion.md §5). Tuned empirically from cabinet snapshot.
    for (let i = 0; i < 6; i++) {
      this.shipExplosionFragments[i].x = SHIP_EXPLOSION_VELOCITY[i].vx / 96;
      this.shipExplosionFragments[i].y = SHIP_EXPLOSION_VELOCITY[i].vy / 96;
    }
  }

  // $74A4-$74C5 per-frame fragment position advance. Source increments
  // position by velocity each frame (treating position as 16-bit signed,
  // velocity as 8-bit signed with carry to hi-byte).
  //
  // **Port deviation: drift / 4096 instead of source's effective per-frame
  // add.** Source-faithful add (velocity per frame, where 1 lo-byte = 1/256
  // game-unit) drifts fragments 15 game-units across the 56-frame lifetime —
  // way past screen edges. Cabinet shows fragments slowly drifting outward
  // over the lifetime. Tuned empirically: /4096 with the halved status-
  // increment rate (task_seq.js ship-exploding branch) gives ~1.2 game-units
  // of drift over the explosion's ~72-real-frame lifetime, on top of the
  // ~0.3-0.7 unit init spread. The likely source mechanism is the scale-
  // normalization in $7C49 that effectively divides position back down before
  // LABS emit, but the exact correspondence is unresolved (see
  // research_ship_explosion.md §5).
  advanceExplosionFragments() {
    for (let i = 0; i < 6; i++) {
      this.shipExplosionFragments[i].x += SHIP_EXPLOSION_VELOCITY[i].vx / 4096;
      this.shipExplosionFragments[i].y += SHIP_EXPLOSION_VELOCITY[i].vy / 4096;
    }
  }

  // $7068-$706A — respawn: status = 1. Position has already been placed
  // at center by $6F93 (explosion-complete cleanup); we call placeAtCenter
  // here too so cold-init game-start (no prior explosion) still lands at
  // the source-faithful (16.375, 12.375). Direction is NOT reset — preserved
  // across deaths, matching source's lack of direction-set in $7068.
  respawn(state) {
    this.placeAtCenter();
    this.status = 1;
  }

  // $7139 — safe-respawn scan. Returns true if no alive asteroid or
  // saucer is within 4 game-units (= 4 source-byte high-bytes) of ship's
  // current position. Non-wrap-aware per source's high-byte SBC + CMP
  // #$04/#$FC pattern — matches the collision proximity gate's behavior
  // (research_collisions.md §4). Source uses raw high-byte signed
  // distance < 4; we use Float64 |pos - ship.pos| < 4 which collapses
  // to the same semantics for in-range positions.
  canSafelyRespawn(state) {
    const sx = this.x, sy = this.y;
    for (const ast of state.asteroids) {
      if (ast.status === 0) continue;
      if (Math.abs(ast.x - sx) < 4 && Math.abs(ast.y - sy) < 4) return false;
    }
    if (state.saucer.status !== 0) {
      if (Math.abs(state.saucer.x - sx) < 4 && Math.abs(state.saucer.y - sy) < 4) return false;
    }
    return true;
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
