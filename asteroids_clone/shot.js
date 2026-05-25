// asteroids_clone/shot.js
//
// Shot actor — JS port of source's $1D-$1E (saucer shots) and $1F-$22
// (player shots) slots. Both shot kinds share this one class, since
// source's $6F57 dispatch reuses one motion routine and $7393 one
// lifetime decrement for all shot slots; only the source position +
// direction (set at spawn) differs. Shot-specific constants live here.

import { WORLD_W, WORLD_H, GAME_TO_DVG, PLAYFIELD_Y_OFFSET } from './world.js';

// $6D14-$6D24 — shot velocity clamp: ±112 source-byte units
// (= ±$70 positive, ±$91 negative two's-complement). Larger than the
// ship's ±64 so shots overtake the ship.
const SHOT_VEL_MAX = 112 / 256;

// $6D04-$6D11 — shot velocity = source velocity + (LUT[direction] / 2).
// LUT max ≈ 64 source units → contribution max = 32/256 game-units/tick.
const SHOT_SPEED = 32 / 256;

// $6D4A-$6D87 — shot spawned at source position + ~0.2 game-units in the
// firing direction (source: low-byte += 0.75 × LUT/2 → max 48/256 ≈ 0.19).
const SHOT_NOSE_OFFSET = 0.2;

// $6CFF — shot lifetime starts at 18; decremented every 4 ticks at $7393.
const SHOT_LIFETIME = 18;

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

  // Game-coord → DVG-coord (× 32) + $72FE's +128 DVG-y playfield offset.
  // Mirrors Ship.dvgPos / Asteroid.dvgPos / Saucer.dvgPos.
  dvgPos() {
    return { x: this.x * GAME_TO_DVG, y: this.y * GAME_TO_DVG + PLAYFIELD_Y_OFFSET };
  }
}
