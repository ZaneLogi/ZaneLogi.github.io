// f_23DD — object state handler (active creatures: formation, fly-in, attack, death)
// Renders enemies that are visible on screen. Position depends on motion state:
//   'pending'   → NOT rendered (Z80 status 0x80 — alive but not yet spawned)
//   'flying'    → enemy's own (x, y), driven by bugMotion (CPU1 f_08D3)
//   'formation' → homeX/Y + formation oscillate / pulse offsets
//   'dead'      → NOT rendered

import { sprites } from '../gfx/resource.js';

export function update(state) {
    // State transitions (fly-in, attack, death) added in later steps.
}

export function render(state) {
    if (!state.tasks.objectStates) return;

    const ctx = state.ctx;
    const f   = state.formation;

    // case_2488: alternate between sprite codes 6 and 7 at ~2 Hz (every 30 frames).
    // Heading-based frame selection comes later (step 7 phase 3).
    const frame = 6 + ((state.frameCount >> 5) & 1);

    for (const e of state.enemies) {
        if (!e.alive)               continue;
        if (e.state === 'dead')     continue;
        if (e.state === 'pending')  continue;   // INT-3a: not yet spawned via fly-in

        let x, y;
        if (e.state === 'flying') {
            x = e.x | 0;
            y = e.y | 0;
        } else {
            // 'formation': home + oscillation (f_2A90) + pulse (f_1DE6)
            x = (e.homeX + f.oscillateX + f.pulseOffsets[e.colIdx])    | 0;
            y = (e.homeY +                f.pulseOffsets[10 + e.rowIdx]) | 0;
        }

        // 16×16 sprite centered on (x, y)
        ctx.drawImage(sprites[e.type][frame], x - 8, y - 8);
    }
}
