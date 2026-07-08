// HUD overlay — FAKED values at SOURCE-FAITHFUL positions.
//
// This is a diagnostic landmark layer, not a faithful port of the score/lives
// logic (that's roadmap step 11). Its only job is to draw the screen furniture
// MAME shows — HIGH SCORE + score at the top, reserve-ship icons lower-left, a
// stage-flag badge lower-right — at the EXACT tile positions the Z80 uses, so
// the sprite playfield can be eyeballed against a real cabinet. Values are
// hardcoded; positions are derived from the source.
//
// Tile→canvas mapping (mrw.s:63-79 layout diagram; verified):
//   • Playfield rows R=0..31  → canvas_y = (R + 2) * 8   (the +2 = top 2 rows)
//   • Top 2 rows  (screen 0,1) → canvas_y = 0, 8
//   • Bottom 2 rows (screen 34,35) → canvas_y = 272, 280
//   • Every column C → canvas_x = C * 8
//
// Toggle: state.tasks.hud (dev panel "Debug" group). Render-only (no update).

import { charCanvas } from '../gfx/resource.js';

// Palettes (tunable — positions are the load-bearing part, colors are eyeball).
const HS_PAL    = 3;    // "HIGH SCORE" label
const SCORE_PAL = 3;    // score digits
const ICON_PAL  = 3;    // reserve-ship icon tiles

// FAKED values.
const FAKE_LIVES = 4;   // reserve-ship icons drawn lower-left

// ASCII → char tile code (c_string_out formula, gg1-2.s:1208-1217). Kept local,
// matching the gameController / fighterCaptured convention.
function charCode(ch) {
    if (ch === ' ') return 0x24;
    let a = ch.charCodeAt(0) - 0x30;
    if (a >= 0x11) a -= 7;
    return a;
}

// Draw a char-tile string with its top-left at canvas (x, y).
function drawText(ctx, text, x, y, pal) {
    for (let i = 0; i < text.length; i++) {
        ctx.drawImage(charCanvas(charCode(text[i]), pal), x + i * 8, y);
    }
}

// Reserve-ship icon = 2×2 char tiles (Z80 draw_resv_ships, gg1-2.s:1083-1097):
//   0x801D→0x4A (top-left)  0x801C→0x4B (top-right)
//   0x803D→0x4C (bot-left)  0x803C→0x4D (bot-right)
function drawShipIcon(ctx, x, y) {
    ctx.drawImage(charCanvas(0x4A, ICON_PAL), x,     y);
    ctx.drawImage(charCanvas(0x4B, ICON_PAL), x + 8, y);
    ctx.drawImage(charCanvas(0x4C, ICON_PAL), x,     y + 8);
    ctx.drawImage(charCanvas(0x4D, ICON_PAL), x + 8, y + 8);
}

// Positional stand-in for the Z80 stage-number flags (the bottom-right badge in
// MAME). The actual flag-draw routine isn't located yet; this just marks the
// lower-right corner at the faithful rows so that area can be checked.
function drawStageBadge(ctx, x, y) {
    ctx.save();
    ctx.fillStyle = '#7f8c8d'; ctx.fillRect(x + 1, y + 2, 1, 14);    // pole
    ctx.fillStyle = '#c0392b'; ctx.fillRect(x + 2, y + 2, 12, 9);    // flag body
    ctx.fillStyle = '#ecf0f1'; ctx.fillRect(x + 2, y + 5, 12, 3);    // white band
    ctx.restore();
}

// No logic — present so the TASK_TABLE update dispatch has something to call.
export function update() {}

export function render(state) {
    if (!state.tasks.hud) return;
    const ctx = state.ctx;

    // ── Top status (screen rows 0,1) ──────────────────────────────────────
    // "HIGH SCORE" centered on row 0 (cols 9-18). The Z80's 6-digit high score
    // lives at tile 0x83ED-0x83F2 = row 1, cols 11-16 (gg1-4.s:34); "9999" is
    // right-aligned into that field via two leading spaces.
    drawText(ctx, 'HIGH SCORE', 72, 0, HS_PAL);
    drawText(ctx, '  9999',     88, 8, SCORE_PAL);

    // ── Reserve-ship icons, lower-left (canvas y 272-288) ─────────────────
    // First icon at col 0, each next +2 cols (+16 px) right.
    for (let i = 0; i < FAKE_LIVES; i++) drawShipIcon(ctx, i * 16, 272);

    // ── Stage-flag badge, lower-right ─────────────────────────────────────
    drawStageBadge(ctx, 208, 272);
}
