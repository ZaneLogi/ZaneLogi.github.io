// f_1F85 — ship movement from joystick input (c_1F92, gg1-2_fx.s:2071)
//
// All X values are canvas CENTER coordinates (sprite_X − 9: galagino corner
// sprite_X − 16, + 8 sprite center, −1 visual nudge — see paths.js rawXToCanvasX).
// Z80 sprite limits: left 0x12=18, right 0xE1=225  →  center canvas: 9, 216.
// Movement uses a pre-move check (not a post-move clamp), matching the Z80:
//   right: move only when canvas_X < 216; left: move only when canvas_X >= 9.
// Speed: dxFlag toggles each held frame → 1 px first frame, then alternates
//   1 / 2 px, matching Z80 b_92A0[3] toggle logic.

import { sprites } from '../gfx/resource.js';

// Canvas-coordinate center limits (Z80 sprite limits − 9; render seats the 16px
// ship's left edge flush on the first column at the left limit).
const X_MIN = 9;    // sprite 0x12 = 18  → center 9   (c_1F92, gg1-2_fx.s:2128)
const X_MAX = 216;  // sprite 0xE1 = 225 → center 216 (c_1F92, gg1-2_fx.s:2118)

export function update(state) {
    const p = state.player;
    if (!p.alive || p.controlLocked) return;   // controlLocked: ship pulled by f_20F2

    const { left, right } = state.input;

    if (!left && !right) {
        p.dxFlag = 0;  // clear flag — next press starts at 1 px
        return;
    }

    // Toggle dxFlag each held frame; flag=1 → dx=1, flag=0 → dx=2.
    p.dxFlag ^= 1;
    const dx = p.dxFlag ? 1 : 2;

    // Pre-move check (mirrors Z80 cp/ret before add/sub). In 2-ship mode the
    // LEFT fighter sits 16 px left of p.x, so the left limit shifts in by 16.
    const xMin = p.twoShip ? X_MIN + 16 : X_MIN;
    if (right) {
        if (p.x < X_MAX) p.x += dx;
    } else {
        if (p.x >= xMin) p.x -= dx;
    }
}

export function render(state) {
    if (!state.tasks.playerMove) return;

    const p = state.player;
    if (!p.alive) return;

    // Sprite code 6 = wings-open upright pose (c_133A, gg1-2.s:1044). During a
    // tractor-beam pull, captureFrame holds the spin frame (0..6, c_2188).
    // 16×16 sprite centered on (p.x, p.y).
    const frame = (p.captureFrame != null) ? p.captureFrame : 6;
    state.ctx.drawImage(sprites.ship[frame], p.x - 8, p.y - 8);

    // 2-ship mode (4d-d): the rescued fighter rides 16 px to the left.
    if (p.twoShip && p.captureFrame == null) {
        state.ctx.drawImage(sprites.ship[6], (p.x - 16) - 8, p.y - 8);
    }
}
