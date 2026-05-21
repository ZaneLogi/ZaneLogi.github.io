// f_23DD — object state handler (active creatures: formation, fly-in, attack, death)
// Currently handles formation render; fly-in / attack state machines come later.

import { sprites } from '../gfx/resource.js';

export function update(state) {
    // State transitions (fly-in, attack, death) added in later steps.
}

export function render(state) {
    if (!state.tasks.objectStates) return;

    const ctx = state.ctx;
    const f   = state.formation;

    // case_2488: alternate between sprite codes 6 and 7 at ~2 Hz (every 30 frames).
    const frame = 6 + ((state.frameCount >> 5) & 1);

    for (const e of state.enemies) {
        if (!e.alive) continue;
        // Home position + oscillation (f_2A90) + pulse offset (f_1DE6)
        const x = (e.homeX + f.oscillateX + f.pulseOffsets[e.colIdx])    | 0;
        const y = (e.homeY +                f.pulseOffsets[10 + e.rowIdx]) | 0;
        // 16×16 sprite centered on (x, y)
        ctx.drawImage(sprites[e.type][frame], x - 8, y - 8);
    }
}
