// CPU1 rckt_man + hitd_det_rckt — bullet movement and collision detection.
//
// In the original arcade, bullet motion and collision run on a second
// Z80 (CPU1) in parallel with the main task scheduler on CPU0. We're
// single-threaded so this task stands in for that work. It is slotted
// right after playerFire in main.js's TASK_TABLE so a freshly spawned
// bullet doesn't move on the same tick — matching the natural CPU0/CPU1
// 1-frame lag.
//
//   dY = 6 px/frame upward          (gg1-5.s:927–970, max value)
//   despawn at canvas Y < 0         (gg1-5.s:996–1000)
//   AABB: |dY| ≤ 3, |dX| < 6        (gg1-5.s:1094–1119, 1-ship mode)
//
// On hit: enemy.hitFlag = true; CPU0's f_1DB3 (enemyStatus) reads it on
// its own tick and transitions the enemy to dead (gg1-2_fx.s:1500–1519).

import { missile } from '../gfx/resource.js';

const BULLET_DY   = 6;
// Despawn threshold. Z80 disables the rocket at SPRITE_Y < 40 (gg1-5.s:996-997);
// canvas_Y = sprite_Y − 40, so that is canvas_Y < 0 — the bullet travels the
// whole playfield to the top edge. (Was 40: the Z80's sprite-Y threshold used
// directly as a canvas threshold dropped the −40, so bullets vanished at Y=40 —
// just below the boss row at Y=36 and the top row at Y=20, making both
// effectively unhittable in formation. Caught playtesting 2026-06-21.)
const Y_OFFSCREEN = 0;
const COLL_DX     = 6;
const COLL_DY     = 3;

export function update(state) {
    const f = state.formation;

    for (const b of state.bullets) {
        if (!b.alive) continue;

        b.y -= BULLET_DY;

        if (b.y < Y_OFFSCREEN) {
            b.alive = false;
            continue;
        }

        // AABB vs every active enemy. Position routed by enemy state:
        //   'flying'    → use e.x, e.y (live position from path interpreter)
        //   'formation' → use homeX/Y + oscillation + pulse offsets
        // Step 9 phase INT-4 fix: previously only checked the formation slot,
        // so flying enemies were immune to bullets (latent step 6 bug surfaced
        // in step 8 phase 8f). Now bullets correctly hit enemies wherever
        // they actually are on screen.
        for (const e of state.enemies) {
            // Skip 'pending' (not yet flown in): the else-branch below would test
            // its FORMATION SLOT, making the empty slot hittable — so the player
            // could kill a bug by shooting the spot it will land in (very visible
            // on a fresh stage's fly-in). Only on-screen enemies (formation /
            // flying / homing) are valid targets. 'dead' is covered by !e.alive.
            if (!e.alive || e.hitFlag || e.state === 'pending') continue;

            let ex, ey;
            if (e.state === 'flying' || e.state === 'homing') {
                // Both 'flying' and 'homing' use the enemy's free position.
                // 'homing' is the post-FB guided approach to formation.
                ex = e.x;
                ey = e.y;
            } else {
                // 'formation' (default for enemies sitting in their slot)
                ex = e.homeX + f.oscillateX + f.pulseOffsets[e.colIdx];
                ey = e.homeY +                f.pulseOffsets[10 + e.rowIdx];
            }

            if (Math.abs(ex - b.x) < COLL_DX && Math.abs(ey - b.y) <= COLL_DY) {
                e.hitFlag = true;
                b.alive   = false;
                break;
            }
        }

        // 4d-c (G19): bullet vs the captured slave. Shooting your OWN captured
        // ship (not the boss holding it) destroys it — lost forever. Skipped
        // while it's mid-rescue (already freed). The boss sits 16 px BELOW the
        // slave during a dive, so an upward shot reaches the boss first (→
        // rescue) unless you aim squarely at the slave.
        if (b.alive) {
            const s = state.capturedSlave;
            if (s && s.alive && !String(s.state).startsWith('rescue') &&
                Math.abs(s.x - b.x) < COLL_DX && Math.abs(s.y - b.y) <= COLL_DY) {
                b.alive                       = false;
                state.capturedSlave           = null;
                state.capture.fighterCaptured = 0;
                state.captureActive           = false;
                state.captureBossId           = null;
                state.tasks.fighterCaptured   = false;
            }
        }
    }
}

export function render(state) {
    if (!state.tasks.bulletUpdate) return;

    // Real rocket sprite (tile 0x30, palette 0x09 — gg1-2.s c_game_or_demo_init).
    // The 16×16 tile is centered on the bullet position; the missile graphic is
    // a small dart in the tile's center, the rest transparent.
    const ctx = state.ctx;
    for (const b of state.bullets) {
        if (!b.alive) continue;
        ctx.drawImage(missile, (b.x | 0) - 8, (b.y | 0) - 8);
    }
}
