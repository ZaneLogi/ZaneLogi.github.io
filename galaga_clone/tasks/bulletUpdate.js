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
//   despawn at canvas Y < 40        (gg1-5.s:996–1000)
//   AABB: |dY| ≤ 3, |dX| < 6        (gg1-5.s:1094–1119, 1-ship mode)
//
// On hit: enemy.hitFlag = true; CPU0's f_1DB3 (enemyStatus) reads it on
// its own tick and transitions the enemy to dead (gg1-2_fx.s:1500–1519).

const BULLET_DY   = 6;
const Y_OFFSCREEN = 40;
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
            if (!e.alive || e.hitFlag) continue;

            let ex, ey;
            if (e.state === 'flying') {
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
    }
}

export function render(state) {
    if (!state.tasks.bulletUpdate) return;

    // Placeholder: 2 × 6 white rectangle. Galaga has a small rocket sprite
    // at code 0x30 (gg1-2_fx.s:1941–1951); wire it up when the resource
    // decoder exposes the missile / explosion sprite groups.
    const ctx = state.ctx;
    ctx.fillStyle = '#fff';
    for (const b of state.bullets) {
        if (!b.alive) continue;
        ctx.fillRect(b.x - 1, b.y - 3, 2, 6);
    }
}
