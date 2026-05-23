// asteroids_clone/state.js
//
// JS port of the source's $0200-$03FF object tables + frame-state RAM.
//
// Hybrid design: data as classes (this file), behavior as cited free
// functions (task_seq.js + future per-subsystem modules). Each routine
// elsewhere comments its $xxxx source citation; here we just carry the
// fields and their source addresses for traceability.
//
// Position uses Float64 instead of the source's 16-bit (hi, lo) byte
// pairs — port deviation per research_position_math.md §7. Position
// is in game-coord [0, 32) × [0, 24); velocity is in game-coord/tick,
// clamped to ±0.25 per axis. Render scaling: dvg = game * 32 (since
// 32 game-units span the 1024 DVG horizontal, 24 span the 768 vertical).
//
// Constants captured here so the conversion is named once.
export const GAME_TO_DVG = 32;
export const WORLD_W = 32;   // X high-byte modulus ($6FDC AND #$1F)
export const WORLD_H = 24;   // Y high-byte modulus ($7007 CMP #$18)

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

// $6D14-$6D24 — player-shot velocity clamp: ±112 source-byte units
// (= ±$70 positive, ±$91 negative two's-complement). Larger than the
// ship's ±64 so shots overtake the ship.
const SHOT_VEL_MAX = 112 / 256;

// $6D04-$6D11 — shot velocity = ship velocity + (LUT[direction] / 2).
// LUT max ≈ 64 source units → contribution max = 32/256 game-units/tick.
const SHOT_SPEED = 32 / 256;

// $6D4A-$6D87 — shot spawned at ship position + ~0.2 game-units in the
// firing direction (source: low-byte += 0.75 × LUT/2 → max 48/256 ≈ 0.19).
const SHOT_NOSE_OFFSET = 0.2;

// $6CFF — shot lifetime starts at 18; decremented every 4 ticks at $7393.
const SHOT_LIFETIME = 18;

export class Asteroid {
  constructor() {
    this.status = 0;        // $0200+slot — low 2 bits = size (0=large, 1=small, 2=med)
    this.vx = 0;            // signed velocity
    this.vy = 0;
    this.x = 0;             // Float64 — collapses (x_hi, x_lo) per R-C §7
    this.y = 0;
  }
}

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

export class Saucer {
  constructor() {
    this.status = 0;        // $021C — 0 absent, 1 small, 2 large, $80+ exploding
    this.vx = 0;
    this.vy = 0;
    this.x = 0;
    this.y = 0;
  }
}

export class Shot {
  constructor() {
    this.status = 0;        // 0 absent, non-zero = lifetime countdown ($7393)
    this.vx = 0;
    this.vy = 0;
    this.x = 0;
    this.y = 0;
  }

  // $6CFD-$6D87 — spawn this shot from a ship's current state. Shot velocity
  // is ship velocity plus a unit vector along the firing direction, then
  // clamped to ±SHOT_VEL_MAX per the $6D14-$6D24 saturation. Position is
  // ship position + a small nose offset along the same direction.
  spawn(ship) {
    const rad = (ship.direction / 256) * 2 * Math.PI;
    const cosD = Math.cos(rad);
    const sinD = Math.sin(rad);
    this.vx = Math.max(-SHOT_VEL_MAX, Math.min(SHOT_VEL_MAX, ship.vx + SHOT_SPEED * cosD));
    this.vy = Math.max(-SHOT_VEL_MAX, Math.min(SHOT_VEL_MAX, ship.vy + SHOT_SPEED * sinD));
    this.x = ((ship.x + cosD * SHOT_NOSE_OFFSET) % WORLD_W + WORLD_W) % WORLD_W;
    this.y = ((ship.y + sinD * SHOT_NOSE_OFFSET) % WORLD_H + WORLD_H) % WORLD_H;
    this.status = SHOT_LIFETIME;
  }

  // $6FC7-$7016 — position += velocity, with toroidal wrap. Same shape
  // as Ship.advancePosition; the source's $6F57 dispatch reuses the
  // same motion code for ship, asteroids, saucer, and shots.
  advancePosition() {
    this.x = ((this.x + this.vx) % WORLD_W + WORLD_W) % WORLD_W;
    this.y = ((this.y + this.vy) % WORLD_H + WORLD_H) % WORLD_H;
  }

  // $7393 — lifetime byte decremented at draw time, gated on
  // (fastTimer & 3) == 0. Shot expires (back to slot-free) when it
  // hits 0. Caller passes the current frame timer.
  decrementLifetime(fastTimer) {
    if ((fastTimer & 3) !== 0) return;
    this.status -= 1;
    if (this.status <= 0) this.status = 0;
  }

  dvgPos() {
    return { x: this.x * GAME_TO_DVG, y: this.y * GAME_TO_DVG };
  }
}

export class GameState {
  constructor() {
    // Object tables — RAMUse.md $0200-$03FF.
    // Slot counts per pre-research scouting + R-C §3.
    this.asteroids = Array.from({ length: 27 }, () => new Asteroid());
    this.ship = new Ship();
    this.saucer = new Saucer();
    this.saucerShots = [new Shot(), new Shot()];
    this.playerShots = Array.from({ length: 4 }, () => new Shot());

    // Frame state (zero-page bytes).
    this.frameGate = 0;          // $5B — main-loop frame-sync gate (NMI ticks; LSR/BCC at $6811)
    this.fastTimer = 0;          // $5C — incremented per frame (~62.5 Hz)
    this.slowTimer = 0;          // $5D — incremented on fastTimer overflow
    this.delayBeforePlay = 0;    // $5A — inter-life pause counter

    // Game-state bytes.
    this.numPlayers = 0;         // $1C — 0 = attract mode
    this.curPlayer = 0;          // $18 — 0/1
    this.curAsteroidCount = 0;   // $02F6
    this.astdWaveTimer = 0;      // $02FB
    this.astWaveTimerReload = 0; // $02FC
    this.hyperSpaceFlag = 0;     // $59

    // Polled-switch state — mirrors source's $2003-$2407 hardware ports.
    // Source reads SWROTLEFT/SWROTRGHT/SWTHRUST/SWHYPER/SWFIRE every frame
    // (not edge-triggered); JS keyboard handlers in main.js flip these
    // bools on keydown/keyup. See research_hardware.md §5 input map.
    this.input = {
      rotLeft: false,    // $2407 SWROTLEFT
      rotRight: false,   // $2406 SWROTRGHT
      thrust: false,     // $2405 SWTHRUST
      hyper: false,      // $2003 SWHYPER   — consumed in I-13
      fire: false,       // $2004 SWFIRE
    };

    // $63 photomLimiter — edge-detection state for SWFIRE so a held fire
    // button doesn't auto-spam shots. Tracks last frame's fire state.
    this.fireWasPressed = false;

    // High-score table, DIP settings, sound timers, credits, and per-
    // subsystem state get added as their port steps land (I-8..I-14).
  }
}
