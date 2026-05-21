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
        e.alive   = false;
        e.hitFlag = false;
    }
}
