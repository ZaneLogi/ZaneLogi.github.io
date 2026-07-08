// f_1F04 — read fire button, spawn player bullet (gg1-2_fx.s:1850).
//
// Galaga limits to 2 simultaneous bullets, enforced by a hardcoded slot
// scan (gg1-2_fx.s:1873–1884): check sprite_posn[0x64] then [0x66] for a
// free slot; if both occupied, return without firing.
//
// Fire is edge-triggered: holding Space does not auto-repeat — must
// release and re-press. The Z80 IO chip provides hardware debounce; we
// reproduce it in main.js with state.input.fireEdge.
//
// Bullets spawn at the ship's exact sprite position (no offset) —
// gg1-2_fx.s:1909–1912 copies sprite_posn[0x62-3] → rocket_posn[0x64-7].

export function update(state) {
    const p = state.player;
    if (!p.alive)              return;
    if (p.controlLocked)       return;   // ship being pulled by the beam (f_20F2)
    if (!state.input.fireEdge) return;

    // 2-ship mode (4d-d): fire from BOTH fighters (Z80 _b_2ship) — one rocket
    // each, using whatever bullet slots are free (max 2). Single ship: one shot.
    const xs = p.twoShip ? [p.x, p.x - 16] : [p.x];
    for (const x of xs) {
        const slot = state.bullets.find(b => !b.alive);
        if (!slot) break;   // both slots in use
        slot.x     = x;
        slot.y     = p.y;
        slot.alive = true;
    }
}
