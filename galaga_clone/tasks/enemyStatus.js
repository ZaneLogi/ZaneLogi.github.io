// f_1DB3 — scan collision notifications, transition hit enemies to dead
// (gg1-2_fx.s:1500–1519).
//
// In the original, CPU1's hitd_det_rckt sets b_9200_obj_collsn_notif[n]
// when a bullet AABB-overlaps an enemy. f_1DB3 polls those flags each
// tick and transitions the enemy to disposition 4 (exploding), with a
// ~5-frame counter (0x40 → 0x45) handled by f_23DD (gg1-3.s:949–954).
//
// For now: simply mark the enemy dead. Explosion sprite + countdown come
// when the resource decoder exposes the explosion tile group (~step 8).

export function update(state) {
    for (const e of state.enemies) {
        if (!e.hitFlag) continue;
        e.hitFlag = false;

        // 2-hit bosses (Z80 l_08CA, gg1-5.s:1189): the first hit on a green
        // boss (palette 0) turns it blue (palette 1) and it SURVIVES; only the
        // second hit kills. Other enemies die on the first hit. (4d-c hooks the
        // capture rescue onto the killing blue-boss hit.)
        if (e.type === 'boss' && (e.hits | 0) === 0) {
            e.hits = 1;          // → blue; render swaps the sprite (objectStates)
            continue;
        }

        e.alive = false;

        // 4d-c rescue (Z80 gg1-5.s:1339): a dying boss that holds the captured
        // ship FREES it — the slave spins, lands, and docks beside the player
        // (→ 2-ship). fighterCaptured drives the motion. (Shooting the slave
        // ITSELF, not the boss, loses it — handled in bulletUpdate, G19.)
        const slave = state.capturedSlave;
        if (e.type === 'boss' && slave && slave.bossId === e.objectId &&
            !String(slave.state).startsWith('rescue')) {
            slave.state                = 'rescue-spin';
            slave.rescueTimer          = 0;
            state.player.controlLocked = true;   // lock control during the rescue
            state.captureActive        = false;
            state.captureBossId        = null;
        }
    }
}
