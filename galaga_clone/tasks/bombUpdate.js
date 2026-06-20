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

// ── Drop-logic constants ──────────────────────────────────────────────
const DROP_RELOAD       = 0x14;   // Z80 b_92E2[0] reload value (~20 frames)
// Only drop when the bomber is low enough on screen. Z80 case_0DF5 (gg1-5.s:2351-2352)
// compares 0x01(ix) (= SPRITE_Y >> 1) against 152>>1 — i.e. sprite_Y >= 152. Since
// canvas_Y = sprite_Y − 40, that is canvas_Y >= 112. (Was 152 with a comment that
// wrongly assumed canvas==sprite here — the −40 was dropped, same bug class as the
// bullet despawn. 152 canvas is 40px too deep; stage-1 dives only reach ~y173, so
// the drop window was too narrow and bombs almost never fired.)
const DROP_Y_THRESHOLD  = 112;

// ── Movement / collision constants ────────────────────────────────────
// Y velocity alternates 2 / 3 px/frame by frame parity (Z80 line 1740).
// X velocity is per-bomb, frozen at drop time.
const COLL_DX = 6;     // matches bullet-vs-enemy AABB scale
const COLL_DY = 4;     // tighter Y — bombs are taller than wide

// ── Aim tuning ────────────────────────────────────────────────────────
// Bomb X velocity is computed at drop time from the slope toward the
// player (frozen — NOT homing). The Z80 path is c_0EAA divide → 7 right-
// shifts → ÷32 in the rate byte, which produces an effective vx roughly
// (dx/dy) × 1.0 — i.e. bombs aim "kind of toward" the player but don't
// precisely track. Player can dodge by moving after the drop.
//
// VX_GAIN here approximates that Z80 effective rate. Earlier draft used
// 2.5 (matching the bomb's actual Y velocity, giving precise targeting),
// but that made bombs feel too smart vs. Galaga's actual dodgeable feel.
//
// TUNING POINT: this is approximate — real Z80 fidelity needs another
// research pass on the c_0EAA shift math, and "feel" depends on actual
// stage-flow playtesting. Refine during integration phase.
const VX_GAIN = 0.5;
const VX_CAP  = 1.0;

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
        // still above the drop line (canvas Y < 112) on those early checks and the
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

        // Vector frozen at drop — Z80 normalises (player.x - bomber.x)
        // by Y distance, then scales down. Approximate via slope × VX_GAIN
        // (see the TUNING POINT note at the top of this file).
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
                if (player.twoShip) {
                    player.twoShip = false;   // lose one fighter → back to single
                } else {
                    // Ship lost → general respawn (gameController, 4c). No
                    // life-loss yet (deferred). Was a permanent freeze before 4c.
                    player.alive = false;
                }
            }
        }
    }
}

export function render(state) {
    if (!state.tasks.bombUpdate) return;

    // Placeholder bomb sprite — small white rect, similar to bullets but
    // a bit taller. Galaga's actual bomb sprite is code 0x30 (same RAM
    // index as player rockets, distinguished by object-status byte). When
    // the resource decoder exposes the missile / bomb sprite group, swap
    // this for the real sprite.
    const ctx = state.ctx;
    ctx.fillStyle = '#ff8';   // pale-yellow tint to distinguish from bullets
    for (const b of state.bombs) {
        if (!b.alive) continue;
        ctx.fillRect(b.x - 1, b.y - 2, 2, 4);
    }
}
