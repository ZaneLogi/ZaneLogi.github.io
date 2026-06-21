// f_1EA4 — bomb update + collision detection
//
// Per-tick task. Two responsibilities:
//   1. Drop logic — for each diving enemy with bomb state armed (set by
//      the F6 FREE_FLIGHT token in bugMotion's loadSegment), decrement
//      the bomb counter; on hitting zero, shift the enable bits and try
//      to drop a bomb if Y-position gate passes.
//   2. Per-tick movement + collision — for each active bomb, advance
//      position, despawn off-screen, AABB collision vs player ship.
//
// Z80 references:
//   gg1-2_fx.s:1729  — f_1EA4 mover
//   gg1-5.s:2343     — case_0DF5 drop logic (counter + enable + Y gate)
//   gg1-5.s:2402     — vector math (frozen at drop, NOT homing)
//   gg1-3.s:1090     — collision detection
// See architecture.html §5b "BOMB SUBSYSTEM" for the full research block.

import { bomb, explosionShip } from '../gfx/resource.js';
import { spawnExplosion } from './explosions.js';

// ── Drop-logic constants ──────────────────────────────────────────────
const DROP_RELOAD       = 0x14;   // Z80 b_92E2[0] reload value (~20 frames)
// Only drop when the bomber is low enough on screen. Z80 case_0DF5 (gg1-5.s:2351-2352)
// compares 0x01(ix) (= SPRITE_Y >> 1) against 152>>1 — i.e. sprite_Y >= 152. Since
// canvas_Y = sprite_Y − 32 (corner→center), that is canvas_Y >= 120. (Was 152 with a
// comment that wrongly assumed canvas==sprite here — the offset was dropped, same bug
// class as the bullet despawn. 152 canvas is too deep; stage-1 dives only reach ~y181,
// so the drop window was too narrow and bombs almost never fired.)
const DROP_Y_THRESHOLD  = 120;

// ── Movement / collision constants ────────────────────────────────────
// Y velocity alternates 2 / 3 px/frame by frame parity (Z80 line 1740).
// X velocity is per-bomb, frozen at drop time.
const COLL_DX = 6;     // matches bullet-vs-enemy AABB scale
const COLL_DY = 4;     // tighter Y — bombs are taller than wide

// ── Aim tuning ────────────────────────────────────────────────────────
// Bomb X velocity is a REAL aimed shot, computed at drop time from the
// slope toward the player and frozen (NOT homing). Verified against the
// Z80 drop path — see research_attack_paths.md §6.2:
//
//   case_0DF5 (gg1-5.s:2402-2457) computes
//     dX    = fighter.x − bomber.x                 (X full-scale)
//     dY    = (298>>1) − (bomber.sprite_Y >> 1)    (Y HALVED — gg1-5.s:2414)
//     slope = (dX << 8) / dY                        (c_0EAA divide @2649)
//     rate  = clamp(±0x60, slope × 5/16)            (shift chain @2423-2434)
//   f_1EA4 (gg1-2_fx.s:1737) advances the bomb rate/32 px/frame, Y by 2/3
//   px on frame parity (~2.5 avg).
//
// In canvas terms (dx = player.x − bomb.x, dy = player.y − bomb.y):
//
//   vx = clamp(±3.0, 5.0 × dx/dy)   px/frame
//
// The bomb's Y speed is ~2.5 px/frame, so a *perfect* intercept would use
// gain 2.5. The Z80's 5.0 is 2× that (the halved dY) — a deliberate
// OVER-AIM: the bomb curves toward and crosses the player's column partway
// down (the aggressive Galaga lead). The ±3 cap stops it tracking a player
// far to the side; the dodge comes from the vector being frozen at drop
// (aimed where you *were*), not from a gentle gain.
//
// (Was VX_GAIN=0.5 / VX_CAP=1.0 — an un-sourced feel tweak, 10×/3× too weak;
// clone bombs fell nearly straight. Restored to the verified §6.2 values.)
const VX_GAIN = 5.0;
const VX_CAP  = 3.0;

export function update(state) {
    if (!state.tasks.bombUpdate) return;   // dev-panel toggle (defensive)

    // ── Drop logic per diving enemy ───────────────────────────────────
    for (const e of state.enemies) {
        if (e.state !== 'flying') continue;
        if (e.bombCounter <= 0)   continue;     // not bombing

        e.bombCounter -= 1;
        if (e.bombCounter > 0) continue;        // not yet at zero
        e.bombCounter = DROP_RELOAD;             // reload the per-drop countdown

        // Decide whether this tick drops a bomb, consuming the enable bitmask.
        //
        // Z80 case_0DF5 (gg1-5.s:2348-2353) does `srl 0x0F` (shift the enable
        // bits) EVERY time the counter hits zero, regardless of height — so a SET
        // bit is wasted if the bomber is still high. That relies on the bomber
        // being low (sprite_Y >= 152) by the first couple of checks. Our attack-
        // dive descent is a touch slower/curvier, so on stage 1 the bomber is
        // still above the drop line (canvas Y < 120) on those early checks and the
        // tiny per-stage mask (1-2 bits) depletes before it gets low → no bomb
        // ever drops. **DEVIATION:** hold a SET bit until the bomber is actually
        // low enough, so each set bit yields a bomb instead of being wasted high.
        // (Consume clear bits immediately, as the Z80 does.) Pending a deeper
        // attack-dive-descent vs MAME fidelity pass — see research_attack_paths.md.
        if (e.bombEnable === 0) continue;        // no drops left this dive
        if ((e.bombEnable & 1) === 0) {          // clear bit → consume, no drop
            e.bombEnable >>>= 1;
            continue;
        }
        if (e.y < DROP_Y_THRESHOLD) continue;    // set bit but too high — keep it for a later check
        e.bombEnable >>>= 1;                     // consume the set bit on the actual drop

        // Allocate first free bomb slot.
        const slot = state.bombs.find(b => !b.alive);
        if (!slot) continue;

        // Vector frozen at drop — aimed at the player's position now, then
        // never updated. vx = clamp(±VX_CAP, VX_GAIN × dx/dy); the over-aim
        // gain + dodge-by-moving feel is the verified §6.2 behavior (see the
        // aim-tuning note at the top of this file).
        slot.x = e.x;
        slot.y = e.y;
        const dx = state.player.x - slot.x;
        const dy = state.player.y - slot.y;
        slot.vx = (dy > 0) ? Math.max(-VX_CAP, Math.min(VX_CAP, (dx / dy) * VX_GAIN)) : 0;
        slot.alive = true;
    }

    // ── Per-tick mover + collision ────────────────────────────────────
    // Z80: Y advances 2 or 3 px/frame depending on frame-counter bit 0
    // (gg1-2_fx.s:1740). X uses the frozen per-bomb rate.
    const yStep = (state.frameCount & 1) ? 3 : 2;
    const player = state.player;

    for (const b of state.bombs) {
        if (!b.alive) continue;

        b.x += b.vx;
        b.y += yStep;

        // Despawn off-screen bottom (canvas height = 288, matches Galaga's
        // actual 224×288 hardware screen).
        if (b.y > 288) { b.alive = false; continue; }

        // AABB collision vs player ship. Skip while the ship is being pulled by
        // a tractor beam (mid-capture, not dodging). In 2-ship mode a bomb that
        // hits EITHER fighter costs one ship (revert to single) instead of a
        // full loss (4d-d).
        if (player.alive && !player.controlLocked &&
            Math.abs(b.y - player.y) < COLL_DY) {
            const hitRight = Math.abs(b.x - player.x) < COLL_DX;
            const hitLeft  = player.twoShip && Math.abs(b.x - (player.x - 16)) < COLL_DX;
            if (hitRight || hitLeft) {
                b.alive = false;
                // Player-ship explosion (Z80 hitd_fghtr_hit → disposition 8,
                // case_243C): the 2×2 burst at the destroyed fighter's position.
                if (player.twoShip) {
                    // left fighter destroyed → back to single
                    spawnExplosion(state, player.x - 16, player.y, explosionShip, 4);
                    player.twoShip = false;
                } else {
                    // Ship lost → general respawn (gameController, 4c). No
                    // life-loss yet (deferred). Was a permanent freeze before 4c.
                    spawnExplosion(state, player.x, player.y, explosionShip, 4);
                    player.alive = false;
                }
            }
        }
    }
}

export function render(state) {
    if (!state.tasks.bombUpdate) return;

    // Real bomb sprite (tile 0x30, palette 0x0B — gg1-2.s c_game_or_demo_init;
    // same tile as the player rocket, different color). Centered on the bomb.
    const ctx = state.ctx;
    for (const b of state.bombs) {
        if (!b.alive) continue;
        ctx.drawImage(bomb, (b.x | 0) - 8, (b.y | 0) - 8);
    }
}
