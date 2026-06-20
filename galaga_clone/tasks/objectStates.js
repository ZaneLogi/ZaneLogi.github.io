// f_23DD — object state handler (active creatures: formation, fly-in, attack, death)
// Renders enemies that are visible on screen. Position depends on motion state:
//   'pending'   → NOT rendered (Z80 status 0x80 — alive but not yet spawned)
//   'flying'    → enemy's own (x, y), driven by bugMotion (CPU1 f_08D3)
//   'homing'    → enemy's own (x, y) — same as flying. The post-FB
//                 guided approach to formation slot (Z80 case_0AA0).
//   'formation' → homeX/Y + formation oscillate / pulse offsets
//   'dead'      → NOT rendered

import { sprites } from '../gfx/resource.js';

export function update(state) {
    // State transitions (fly-in, attack, death) added in later steps.
}

// ── Heading-based sprite selection (Z80 gg1-5.s:2104-2148) ────────────
// Each enemy type has 8 sprite frames. Frames 0-5 cover 6 directions in
// one quadrant (~15° per frame). Frame 6 = vertical (within ±15° of
// 90°/270°). Frame 7 = vertical wings-closed (formation wing-flap pair).
//
// The base sprites face UP-LEFT (Q1, 90°-180°). Other quadrants reuse
// the same frames with flip-X / flip-Y from the sprite chip:
//   Q0 (0°-90°,    right-up):    flipY  (mirror left/right)
//   Q1 (90°-180°,  up-left):     no flip
//   Q2 (180°-270°, left-down):   flipX  (mirror up/down)
//   Q3 (270°-360°, down-right):  flipX + flipY (180° rotation)
//
// Frame index math (Z80 verified):
//   lowByte = angle & 0xFF
//   if (quadrant odd) lowByte = ~lowByte & 0xFF   (CCW→CW within quadrant)
//   if (lowByte + 21 ≥ 256) frame = 6              (vertical zone, ±15°)
//   else frame = upper 3 bits of (3·lowByte/4)     (0-5 directional)
//
// The Z80 lda + 21 + carry trick is equivalent to "lowByte ≥ 235".
function spriteFromAngle(angle10) {
    const quadrant = (angle10 >> 8) & 0x03;
    let lowByte    = angle10 & 0xFF;
    if (quadrant & 1) lowByte = (~lowByte) & 0xFF;

    let frame;
    if (lowByte >= 235) {
        frame = 6;
    } else {
        // Z80: srl/srl/add → 3·A/4, then 3 rlcas + and 0x07 = upper 3 bits
        frame = (((lowByte * 3) >> 2) >> 5) & 0x07;
    }

    return {
        frame,
        flipX: (quadrant === 2 || quadrant === 3),   // vertical mirror
        flipY: (quadrant === 0 || quadrant === 3),   // horizontal mirror
    };
}

export function render(state) {
    if (!state.tasks.objectStates) return;

    const ctx = state.ctx;
    const f   = state.formation;

    // case_2488: alternate between sprite codes 6 and 7 at ~2 Hz (every 30 frames).
    // Used for enemies sitting in formation (the wing-flap animation).
    const formationFrame = 6 + ((state.frameCount >> 5) & 1);

    for (const e of state.enemies) {
        if (!e.alive)               continue;
        if (e.state === 'dead')     continue;
        if (e.state === 'pending')  continue;   // INT-3a: not yet spawned via fly-in

        let x, y, frame, flipX = false, flipY = false;
        if (e.state === 'flying' || e.state === 'homing') {
            // Both 'flying' and 'homing' use the enemy's free position
            // and angle-driven sprite orientation.
            x = e.x | 0;
            y = e.y | 0;
            ({ frame, flipX, flipY } = spriteFromAngle(e.angle));
        } else {
            // 'formation': home + oscillation (f_2A90) + pulse (f_1DE6).
            // Sprite is the wing-flap pair (frames 6/7) — Z80 case_2488.
            x = (e.homeX + f.oscillateX + f.pulseOffsets[e.colIdx])    | 0;
            y = (e.homeY +                f.pulseOffsets[10 + e.rowIdx]) | 0;
            frame = formationFrame;
        }

        // 16×16 sprite centered on (x, y). For flying/homing, apply
        // flip transforms via canvas scale around the sprite center.
        // 2-hit boss: render blue (palette 1) once it has taken its first hit (4d-a).
        const grp = (e.type === 'boss' && e.hits) ? sprites.bossBlue : sprites[e.type];
        const img = grp[frame];
        if (flipX || flipY) {
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(flipY ? -1 : 1, flipX ? -1 : 1);
            ctx.drawImage(img, -8, -8);
            ctx.restore();
        } else {
            ctx.drawImage(img, x - 8, y - 8);
        }
    }
}
