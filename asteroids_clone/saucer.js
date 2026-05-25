// asteroids_clone/saucer.js
//
// Saucer actor — JS port of source's $1C slot. Saucer doesn't carry
// its own constants (tunables like saucerTimeReload live on GameState
// and reach the methods through the `state` argument).

import { WORLD_W, WORLD_H, GAME_TO_DVG, PLAYFIELD_Y_OFFSET } from './world.js';

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

  // Game-coord → DVG-coord (× 32) + $72FE's +128 DVG-y playfield offset.
  // Mirrors Ship.dvgPos / Asteroid.dvgPos.
  dvgPos() {
    return { x: this.x * GAME_TO_DVG, y: this.y * GAME_TO_DVG + PLAYFIELD_Y_OFFSET };
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
