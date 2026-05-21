// Explosion subsystem — three families of visuals share this file:
//
//   1. Kill-anim slots (L38F8 / L0EC3 spawn + L0FC0 / L3758 update) —
//      alien-kill (states.js bullet-vs-alien path), bird-kill (states.js
//      onBirdWingHit / onBirdHit), bonus kills (200-pt path-byte 7/8).
//
//   2. L2085 scattered-debris walk — center-out shockwave used by player
//      death (T2800/T2900) and mothership pilot kill (T2A00/T2B00).
//      Engine described in research_explosion_visual.md §5; §9.2
//      "Strategy 1" walk math is implemented in _walkL2085.
//
// Spread into the main `states` object in states.js the same way
// states_mothership.js / states_intro.js / states_player.js do, so
// consumers continue to call `this.spawnExplosion(...)` /
// `this._drawScatteredParticles(...)` / `this._drawPlayerScatteredFrame(...)`
// with no change.

import { state } from './state.js';
import { ALIEN_EXPLOSION_ROM,
         PLAYER_EXPLOSION_TILES, PLAYER_EXPLOSION_CONTROL,
         MOTHERSHIP_EXPLOSION_TILES, MOTHERSHIP_EXPLOSION_CONTROL } from './data.js';
import { findBeltRow } from './states_mothership.js';   // L2085 mothership anchor tracks the moving pilot

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

    // $2085 walk — shared between the player and mothership scattered
    // explosions. CounterA5 selects a 32-byte sliding window of the
    // control table; the walk visits 16 column-pairs × 16 rows = 256
    // cells, writing tileTable[deOff] to any cell whose control bit is
    // set. Window L_initial computation:
    //   L = $E0 - ((CounterA5 - $20) << 2 & $E0)
    // ~10-25 cells actually written per frame depending on table
    // density + window. Off-canvas cells are silently skipped (source's
    // screen-RAM wrap is a no-op on the canvas's bounded coord space).
    // research_explosion_visual.md §5/§7/§9.
    _walkL2085(counterA5, baseX, baseY, controlTable, tileTable) {
        const L_initial = (0xE0 - (((counterA5 - 0x20) << 2) & 0xE0)) & 0xFF;
        let L = L_initial;
        let deOff = 0;

        for (let pair = 0; pair < 16; pair++) {
            // Byte 0 of pair: bits 0..7 walk DOWN rows 0..7 of column `pair`.
            let controlByte = controlTable[L];
            for (let bit = 0; bit < 8; bit++) {
                if (controlByte & (1 << bit)) {
                    const tile = tileTable[deOff];
                    if (tile !== 0) {
                        const x = baseX + pair * 8;
                        const y = baseY + bit * 8;
                        if (x >= 0 && x < 208 && y >= 0 && y < 256) {
                            state.scatteredDebris.set(`${x},${y}`, tile);
                        }
                    }
                }
                deOff++;
            }
            L = (L + 1) & 0xFF;
            // Byte 1 of pair: bits 0..7 walk DOWN rows 8..15 of same column.
            controlByte = controlTable[L];
            for (let bit = 0; bit < 8; bit++) {
                if (controlByte & (1 << bit)) {
                    const tile = tileTable[deOff];
                    if (tile !== 0) {
                        const x = baseX + pair * 8;
                        const y = baseY + (8 + bit) * 8;
                        if (x >= 0 && x < 208 && y >= 0 && y < 256) {
                            state.scatteredDebris.set(`${x},${y}`, tile);
                        }
                    }
                }
                deOff++;
            }
            L = (L + 1) & 0xFF;
        }
    },

    // $2085 + T2A00/T2B00 — mothership scattered debris. Anchored so
    // the explosion-start cluster (window 0) lands on the pilot.
    // T2A00/T2B00's window-0 centroid is at region (col 7.5, row 7.5)
    // — centered, unlike the player's (7.5, 11.5) bottom-anchored
    // cluster (the two tables encode different explosion shapes).
    //
    // Pilot center is at canvas (100, (beltRow-1)*8 + 4). Region anchor
    // is 7.5 cells left and 7.5 cells up so the cluster lands on the pilot.
    _drawScatteredParticles(counterA5) {
        const beltRow = findBeltRow(state);
        if (beltRow < 0) return;
        const baseX = 40;                       // = 100 - 60
        const baseY = (beltRow - 1) * 8 - 56;   // = pilot_center_y - 60, kept 8-px aligned

        // Source semantics: each call clears the region first ($20B5
        // LD (HL),$00 inside the inner loop), then conditionally
        // overwrites with a tile. The separate scatteredDebris Map
        // makes "clear the region" a one-line clear() rather than a
        // per-cell delete loop.
        state.scatteredDebris.clear();
        this._walkL2085(counterA5, baseX, baseY,
                        MOTHERSHIP_EXPLOSION_CONTROL, MOTHERSHIP_EXPLOSION_TILES);
    },

    // $2070 → $2085 + T2800/T2900 — player scattered debris.
    // Anchored such that the simulation's window-0 centroid (col ≈ 7.5,
    // row ≈ 11.5 of the 16-col × 16-row region) lands at the player
    // center — so the tight end-of-explosion cluster appears at the
    // player's last-known position, with debris expanding outward as
    // CounterA5 ticks DOWN ($60 → $20). Calibration is the research's
    // §10 best-guess; tune if MAME comparison shows a different anchor.
    _drawPlayerScatteredFrame(counterA5) {
        const baseX = state.player.x - 56;
        const baseY = state.player.y - 88;
        state.scatteredDebris.clear();
        this._walkL2085(counterA5, baseX, baseY,
                        PLAYER_EXPLOSION_CONTROL, PLAYER_EXPLOSION_TILES);
    },
};
