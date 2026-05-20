// Explosion subsystem — L38F8 / L0EC3 spawn + L0FC0 / L3758 update.
//
// Shared by alien-kill (states.js bullet-vs-alien path), bird-kill
// (states.js onBirdWingHit / onBirdHit), and mothership-pilot kill
// (states_mothership.js). Spread into the main `states` object in
// states.js the same way states_mothership.js / states_intro.js /
// states_player.js do, so consumers continue to call
// `this.spawnExplosion(...)` etc. with no change.
//
// Carved out ahead of the explosion-visual port (research_explosion_visual.md
// — L2085 center-out shockwave) so the visual rewrite lands in one
// focused file instead of buried inside states.js.

import { state } from './state.js';
import { ALIEN_EXPLOSION_ROM } from './data.js';   // source $17B0..$17F5 — T17B0 + frame tiles

export const explosionMixin = {
    // L38F8 — find the first free alien-explosion slot ($4370 or $4374)
    // and populate it with (counter, scoreBcd, screen position). Source
    // returns silently if both slots are active (slot starvation).
    //
    // Source also writes AbovePlayerBulletMSB/LSB ($43E6/$43E7) into the
    // slot's screen-RAM fields and clears the player bullet's bit 3 — but
    // those are L38F8's "bird wing" path-specific concerns. Alien hits
    // come through L0EAD which writes the ALIEN'S screen position to the
    // slot. The port skips the bullet-deactivate since playerBulletCollision
    // already does `b.active = false` after a hit.
    //
    // Bonus-slot variant (200-pt kills) lives in spawnBonusExplosion below.
    spawnExplosion(counter, scoreBcd, x, y) {
        for (const e of state.explosions) {
            if (e.counter !== 0) continue;
            e.counter  = counter;
            e.scoreBcd = scoreBcd;
            e.x        = x & 0xFF;
            e.y        = y & 0xFF;
            // Seed frameLsb from the spawn counter so render is correct
            // even on the first frame, before explosionUpdate has run.
            // Source draws on the spawn-tick using the just-written counter
            // value; this matches that behavior independent of lane ordering.
            e.frameLsb = ALIEN_EXPLOSION_ROM[(counter & 0x0E) >> 1];
            return true;
        }
        return false;
    },

    // Bonus-slot variant of L38F8 — allocate one of the 2 bonus slots
    // ($4378 / $437C). Used for 200-pt kills (alien current path byte 7
    // or 8 at hit time, see L0C00). Source's actual allocator at L0EC3
    // walks both bonus slots looking for counter==0; if both are active,
    // it falls through to L0ED5 and clobbers slot 1 anyway. Port returns
    // false on starvation to be safe (and to match spawnExplosion's
    // contract). Slot starvation is rare in practice — bonus kills only
    // fire on path bytes 7 or 8, which are brief moments in a swoop.
    //
    // Source counter for bonus kills is $10 (16 ticks ≈ 0.27 s at 60 Hz
    // gross, but each tick advances at the L0FC0 cadence so wall-time is
    // longer); scoreBcd is $20 (= "200" displayed via L37B0's "first two
    // digits + always-0").
    spawnBonusExplosion(counter, scoreBcd, x, y) {
        for (const e of state.bonusExplosions) {
            if (e.counter !== 0) continue;
            e.counter  = counter;
            e.scoreBcd = scoreBcd;
            e.x        = x & 0xFF;
            e.y        = y & 0xFF;
            return true;
        }
        return false;
    },

    // L0FC0 — Handle animations for killed aliens. Iterate the 2 alien
    // explosion slots ($4370 / $4374) and animate each non-zero counter
    // through the T17B0 tile-LSB cycle. Each tick:
    //   if counter == 0: slot is free, skip.
    //   else: pick the tile-frame LSB using the PRE-decrement counter
    //         (matches source L0FDB→L0FE6 ordering: LD B,(HL); DEC (HL);
    //         use B for tile lookup), then decrement counter.
    // drawExplosions in render.js consumes frameLsb to look up the 6-tile
    // 3x2 sprite via ALIEN_EXPLOSION_ROM.
    //
    // Source L0FC0 also processes the 2 bonus slots ($4378/$437C) via
    // L3758 — that path lives in bonusExplosionUpdate below.
    explosionUpdate() {
        for (const e of state.explosions) {
            if (e.counter === 0) continue;
            // T17B0 lives in the first 8 bytes of ALIEN_EXPLOSION_ROM.
            const idx = (e.counter & 0x0E) >> 1;
            e.frameLsb = ALIEN_EXPLOSION_ROM[idx];
            e.counter = (e.counter - 1) & 0xFF;
        }
    },

    // L3758 — bonus-explosion slot animation. Used by 200-pt swoop kills
    // (alien current path byte 7 or 8 — see L0C00) and by bird wing /
    // mothership scoring (step 11 territory). Source L3758 splits per
    // tick:
    //   counter == 0           → skip (slot free)
    //   else, post-dec == 0    → erase area via L37CC
    //   else, bit-0 of post-dec:
    //       0 → JP L37B0 (draw popup score digits only this frame)
    //       1 → fall through to draw the 6×2 sprite (L3796 + Draw3x2)
    //
    // The source's per-frame alternation between digits and sprite relies
    // on screen-RAM persistence — both end up visible on the CRT because
    // each leaves the other in place. Canvas clears per frame, so port
    // collapses to "draw both every frame for active slots" in
    // drawBonusExplosions; this update routine just decrements the
    // counter. The L37CC erase is also a no-op for canvas — counter==0
    // already gates rendering.
    bonusExplosionUpdate() {
        for (const e of state.bonusExplosions) {
            if (e.counter === 0) continue;
            e.counter = (e.counter - 1) & 0xFF;
        }
    },
};
