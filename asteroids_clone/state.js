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

  // $6BDD-$6C30 — spawn dispatch: random Y edge slot, left/right entry edge
  // from rngHi bit 6, size from saucerTimeReload + score progression. Called
  // by saucerSpawn() in task_seq.js when the saucer-spawn countdown fires.
  //
  // Caller advances RNG twice (once via state.rngHi check, once via possible
  // size-roll); this method advances RNG once for Y and may advance once more
  // for the size roll, matching source ordering.
  spawn(state, advanceRNG) {
    // $6BDD-$6BE4 — default: enter from LEFT edge moving RIGHT.
    this.x = 0;
    let horzVelByte = 0x10;     // +16/256 = +0.0625 game-units/tick

    // $6BE5-$6BF3 — y from RNG, shifted right 3 (= rnd >> 3, range 0..31).
    const rndY = advanceRNG(state);
    let yCell = rndY >> 3;
    // $6BF4-$6BF8 — clamp y to [0, 23]: if >=24, AND #$17 maps 24-31 → 16-23.
    if (yCell >= 0x18) yCell &= 0x17;
    this.y = yCell;

    // $6BFD-$6C0D — bit 6 of $60 (rngHi) flips entry edge.
    // Source: BIT $60 / BVS $6C0F. Set → right edge x=$1F:$FF, horzVel = $F0.
    if (state.rngHi & 0x40) {
      this.x = WORLD_W - 1 / 256;   // $1F:$FF = 31 + 255/256
      horzVelByte = 0xf0;           // -16/256 = -0.0625 game-units/tick
    }

    this.vx = horzVelByte <= 0x7f ? horzVelByte / 256 : (horzVelByte - 256) / 256;
    this.vy = 0;

    // $6C12-$6C30 — size selection.
    //   $6C12: LDX #$02 (assume LARGE)
    //   $6C17: BMI saucerTimeReload>=$80 → use LARGE
    //   $6C1B-$6C20: score>=30,000 → DEX (SMALL)
    //   $6C22-$6C2D: RNG roll, saucerTimeReload/2 >= rnd → LARGE; else SMALL.
    //   Net: as saucerTimeReload shrinks, small saucer probability grows.
    let size = 2;
    if ((state.saucerTimeReload & 0x80) === 0) {
      if (state.scoreThousands >= 30) {
        size = 1;                       // 30k+ → always small
      } else {
        const rnd = advanceRNG(state);
        if ((state.saucerTimeReload >> 1) < rnd) size = 1;
      }
    }
    this.status = size;
  }

  // $6FC7-$7016 motion + $6FE2-$6FEA saucer-specific edge handling.
  // Source: after the per-axis 16-bit adds, if x carries past $20 (= wrap),
  // and X==$1C (saucer slot), JSR $702D which zeroes saucer state and
  // resets saucerTimer = saucerTimeReload. Y still wraps mod 24 normally.
  //
  // JS variant: detect either-edge crossing in Float64. If saucer's vx
  // would carry it out of [0, WORLD_W), despawn instead of wrapping.
  // (Source only checks the high-edge AND #$1F wrap, but the same logic
  // fires for low-edge wrap too — see I-10b notes in task_seq.js.)
  advancePosition(state) {
    const newX = this.x + this.vx;
    if (newX < 0 || newX >= WORLD_W) {
      // $6FE6 JSR $702D — despawn: clear status, zero velocities,
      // reset saucerTimer = saucerTimeReload for next-spawn countdown.
      this.status = 0;
      this.vx = 0;
      this.vy = 0;
      state.saucerTimer = state.saucerTimeReload;
      return;
    }
    this.x = newX;
    this.y = ((this.y + this.vy) % WORLD_H + WORLD_H) % WORLD_H;
  }

  // Game-coord → DVG-coord (× 32). Mirrors Ship.dvgPos / Asteroid.dvgPos.
  dvgPos() {
    return { x: this.x * GAME_TO_DVG, y: this.y * GAME_TO_DVG };
  }

  // $7018-$7025 size→gs (shared with asteroid alive dispatch via the same
  // $72FE entry). Saucer status: 1=small → bit 0 set → Y=$E0 → gs=14.
  // 2=large → bit 1 set, bit 0 clear → Y=$F0 → gs=15. Under the mod-16
  // wrap (research_dvg.md §4), gs=14 renders smaller than gs=15.
  globalScale() {
    if (this.status & 0x01) return 14;  // small
    if (this.status & 0x02) return 15;  // large (= "medium" position on the wrap)
    return 0;
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

  // $6CFD-$6D87 — spawn this shot from a source object's (ship or saucer)
  // current state. Shot velocity is source velocity plus a unit vector along
  // the firing direction, then clamped to ±SHOT_VEL_MAX per the $6D14-$6D24
  // saturation. Position is source position + a small nose offset along the
  // same direction. Source uses X register to disambiguate ship (X=0) vs
  // saucer (X=1) and reads $023E,X / $0261,X for the right vx/vy — JS port
  // takes the source values directly.
  spawn(srcX, srcY, srcVx, srcVy, direction) {
    const rad = (direction / 256) * 2 * Math.PI;
    const cosD = Math.cos(rad);
    const sinD = Math.sin(rad);
    this.vx = Math.max(-SHOT_VEL_MAX, Math.min(SHOT_VEL_MAX, srcVx + SHOT_SPEED * cosD));
    this.vy = Math.max(-SHOT_VEL_MAX, Math.min(SHOT_VEL_MAX, srcVy + SHOT_SPEED * sinD));
    this.x = ((srcX + cosD * SHOT_NOSE_OFFSET) % WORLD_W + WORLD_W) % WORLD_W;
    this.y = ((srcY + sinD * SHOT_NOSE_OFFSET) % WORLD_H + WORLD_H) % WORLD_H;
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

    // $02F5 asteroidsPerWave — initial value 2 from $6ED8. Each $7168
    // call adds 2 (capped at 11), so wave 1 = 4, wave 2 = 6, ..., wave 5+ = 11.
    this.asteroidsPerWave = 2;
    // $02FD max_rocks_for_ufo — initial 5 from game-init burst $6910.
    // $7168 increments per wave (capped at 10) to make UFOs appear more often.
    // Consumed by saucer-spawn (I-10).
    this.max_rocks_for_ufo = 5;
    // $02F7 saucerTimer — DUAL-USE byte (per RAMUse.md):
    //   - When no saucer active: countdown until spawn attempt. Reset to $7F at
    //     end of wave-init ($71D7); shortened to $12 ($6BBC) on each spawn-tick
    //     where the timer hits zero (retry interval if spawn aborts).
    //   - When saucer active: countdown between shots. Reset to $0A ($6C56)
    //     after each saucer-shot fires.
    // Cold-init value $92 from $6903 is irrelevant for now — newWaveInit
    // overwrites with $7F on frame 1 (via the I-9f trailer).
    this.saucerTimer = 0;
    // $02F8 saucerTimeReload — drift target for inter-saucer interval. Each
    // saucer spawn shortens this by 6 ($6BD4), clamped at $20 ($6BD6). Cold
    // init = $92 from $68FA. Also gates size selection: high bit set ($>=80)
    // forces large saucers; below $80 enables small-saucer rolls (more likely
    // as the value shrinks further).
    this.saucerTimeReload = 0x92;
    // $02F9 asteroid_hit_timer — set to $50 ($75EC) on shot-vs-asteroid hit;
    // decremented per saucer-spawn-dispatch tick ($6BB4). While ticking,
    // saucer spawn is gated by curAsteroidCount being in (0, max_rocks_for_ufo).
    // I-9h's resolveShotVsAsteroid sets this as part of I-10a (it gates
    // saucer behavior).
    this.asteroid_hit_timer = 0;
    // $02FA shipSpawnTimer — counts down ship respawn/spawn-protect window.
    // Source cold-inits to 1 at $68F2; on the very next frame, $7048-$704D
    // in shipSpawnPhys decrements it to 0, then $7068 sets statusShip=1.
    // Since the spawnTimer-decrement body is deferred to I-11 (along with
    // ship death/respawn), we initialize directly to the steady state of 0
    // so the saucer-shot gate at $6C49 doesn't permanently block firing in
    // play mode. Will be set non-zero ($81) on ship death by I-11's port.
    this.shipSpawnTimer = 0;
    // $0053 ply1ScoreThous — current player's score (thousands BCD byte).
    // Placeholder until I-11 BCD scoring ($7397) lands. Used by Saucer.spawn
    // for the 30k size-threshold ($6C1E CMP #$30).
    this.scoreThousands = 0;

    // $5F:$60 rndValue — 16-bit Galois LFSR state. Seed must be non-zero
    // (the LFSR has an anti-stuck-at-zero guard at $77CA-$77CC but it
    // can only inch the state forward — a fresh non-zero seed avoids
    // the boot-time bias). Port of $77B5 (research_main_loop.md §10).
    this.rngLo = 1;
    this.rngHi = 0;

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
