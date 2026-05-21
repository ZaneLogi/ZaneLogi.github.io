// f_1F85 — ship movement from joystick input (c_1F92, gg1-2_fx.s:2071)
//
// All X values are canvas coordinates (sprite_X - 10 hardware offset).
// Z80 sprite limits: left 0x12=18, right 0xE1=225  →  canvas: 8, 215.
// Movement uses a pre-move check (not a post-move clamp), matching the Z80:
//   right: move only when canvas_X < 215; left: move only when canvas_X >= 8.
// Speed: dxFlag toggles each held frame → 1 px first frame, then alternates
//   1 / 2 px, matching Z80 b_92A0[3] toggle logic.

import { sprites } from '../gfx/resource.js';

// Canvas-coordinate limits (Z80 sprite limits minus 10 px hardware offset).
const X_MIN = 8;    // sprite 0x12 = 18  → canvas 8   (c_1F92, gg1-2_fx.s:2128)
const X_MAX = 215;  // sprite 0xE1 = 225 → canvas 215  (c_1F92, gg1-2_fx.s:2118)

export function update(state) {
    const p = state.player;
    if (!p.alive) return;

    const { left, right } = state.input;

    if (!left && !right) {
        p.dxFlag = 0;  // clear flag — next press starts at 1 px
        return;
    }

    // Toggle dxFlag each held frame; flag=1 → dx=1, flag=0 → dx=2.
    p.dxFlag ^= 1;
    const dx = p.dxFlag ? 1 : 2;

    // Pre-move check (mirrors Z80 cp/ret before add/sub).
    if (right) {
        if (p.x < X_MAX) p.x += dx;
    } else {
        if (p.x >= X_MIN) p.x -= dx;
    }
}

export function render(state) {
    if (!state.tasks.playerMove) return;

    const p = state.player;
    if (!p.alive) return;

    // Sprite code 6 = wings-open upright pose (c_133A, gg1-2.s:1044).
    // 16×16 sprite centered on (p.x, p.y).
    state.ctx.drawImage(sprites.ship[6], p.x - 8, p.y - 8);
}
