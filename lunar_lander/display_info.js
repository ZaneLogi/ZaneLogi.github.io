// lunar_lander/display_info.js
//
// The HUD (CLAUDE.md "Planned gameplay module layout" → display_info.js): the
// $5458 label grid + the CPU-drawn VALUES (SCORE / TIME / FUEL / ALTITUDE /
// HORIZONTAL SPEED / VERTICAL SPEED) and the two speed-direction arrows. A
// routine-level translation of the source's DISPLY (:3258, compute the decimals)
// + MESDATA (:1453, draw them). Extracted + consolidated from demos/screen.js.
//
// It only READS state (+ camera/landscape for altitude) and draws through render.js
// helpers — no canvas API, no motion writes (the seam discipline in state.js).
//
// VALUE SCALING — faithful to the source (research: A34573.1A):
//   • SCORE   — BCD, 4 digits, leading zeros KEPT (D.LD4A "LEAVE LEADING ZEROS" :1457).
//   • TIME    — MM:SS from GMTIME (min:sec), both zero-padded; colon glyph $55B2.
//   • FUEL    — integer part (source draws FUEL+1, skipping the fractional byte), 4 digits.
//   • ALTITUDE / H-SPEED / V-SPEED — 6-digit field, zero-SUPPRESSED (D.SIX → DIGTYS :1502).
//   • SPEED   — |velocity| >> 6 (DISPLY converts the top 10 bits of the 16-bit velocity :3264).
//   • ARROWS  — DISPLY :3276-3288: 0 velocity → none; else sign → right/left (X), up/down (Y).
//
// DEVIATIONS (labeled):
//   • Velocity is SIGN-MAGNITUDE in source (VELX magnitude + SGNVLX sign byte, ACCEL :1959);
//     our physics uses signed floats, so we take abs() for the number and sign() for the arrow.
//   • Values are BCD in source; we format plain integers (cosmetically identical).
//   • ALTITUDE is a HUD PROXY here — landscape.heightAt() is a single straight-down query;
//     the source's SCPDST is min(both lower-corner clearances) via the DECODE terrain pass,
//     which lands with collision.js (step 6). Clamped ≥ 0 (SCPDST is an unsigned distance).
//   • Layout is the MAME-MEASURED grid (screen.js / CLAUDE.md "Gameplay HUD"), not the
//     source's DATAVG offset vectors — same on-screen result, calibrated to a real frame.

import { SCREEN_H, drawShapeScreen, drawGlyphString, drawArrowGlyph } from './render.js';
import { ROM598 } from './discovery_rom_data.js';

// Character → ROM598 glyph key. Digits 1-9 are the $572A block; 0 reuses the letter
// O ($5688); colon is $55B2; space is $5726. (Same map as screen.js CHAR_GLYPH.)
const CHAR_KEY = { ' ': 'S_5726', ':': 'S_55B2', '0': 'S_5688' };
[0x572A, 0x5732, 0x5742, 0x5750, 0x575E, 0x576C, 0x577A, 0x5784, 0x5794]
  .forEach((a, i) => { CHAR_KEY[String(i + 1)] = 'S_' + a.toString(16).toUpperCase(); });
const keysFor = str => [...String(str)].map(c => CHAR_KEY[c] || CHAR_KEY[' ']);

const ARROW = { right: 'S_5566', left: 'S_5576', up: 'S_5586', down: 'S_5598' };

// MAME-measured layout (llander rev2, 2026-06-29; CLAUDE.md "Gameplay HUD").
// Canvas y-down baselines = the $5458 rows y_up 748/720/692 → 768−y.
const ROW = { top: 20, mid: 48, bot: 76 };   // SCORE/ALTITUDE · TIME/H-SPEED · FUEL/V-SPEED
const LEFT_X = 204;     // left column — LEFT-aligned (first char fixed)
const RIGHT_X = 878;    // right column — RIGHT-aligned units digit (number grows left)
const ARROW_X = 897;    // speed-direction arrow, ~20 units right of the value

const pad = (n, w) => String(n).padStart(w, '0');

export class DisplayInfo {
  // Draw the whole HUD for the current frame. `landscape` + `camera` are only used
  // for the ALTITUDE proxy; everything else is pure state.
  render(ctx, state, camera, landscape) {
    // The $5458 label grid at its native absolute position (LABS 100,748 inside the
    // composite → cx=0, cy=SCREEN_H, pxScale=1). runList skips the bri:0 spacing moves.
    drawShapeScreen(ctx, ROM598, 'S_5458', { cx: 0, cy: SCREEN_H, pxScale: 1, width: 1.5 });

    // LEFT column — left-aligned.
    drawGlyphString(ctx, ROM598, keysFor(pad(state.SCORE, 4)),            { x: LEFT_X, y: ROW.top, align: 'left' });
    drawGlyphString(ctx, ROM598, keysFor(`${pad(state.GMTIME_M, 2)}:${pad(state.GMTIME_S, 2)}`), { x: LEFT_X, y: ROW.mid, align: 'left' });
    drawGlyphString(ctx, ROM598, keysFor(pad(Math.max(0, Math.floor(state.FUEL)), 4)), { x: LEFT_X, y: ROW.bot, align: 'left' });

    // RIGHT column — right-aligned, zero-suppressed (bare integers).
    const alt    = this._altitude(state, camera, landscape);
    const hspeed = Math.floor(Math.abs(state.VELX) / 64);   // |VEL| >> 6 (DISPLY :3264)
    const vspeed = Math.floor(Math.abs(state.VELY) / 64);
    drawGlyphString(ctx, ROM598, keysFor(alt),    { x: RIGHT_X, y: ROW.top, align: 'right' });
    drawGlyphString(ctx, ROM598, keysFor(hspeed), { x: RIGHT_X, y: ROW.mid, align: 'right' });
    drawGlyphString(ctx, ROM598, keysFor(vspeed), { x: RIGHT_X, y: ROW.bot, align: 'right' });

    // Direction arrows (none when the speed reads 0; DISPLY :3276-3288).
    if (hspeed > 0) drawArrowGlyph(ctx, ROM598, state.VELX >= 0 ? ARROW.right : ARROW.left, { x: ARROW_X, baselineY: ROW.mid });
    if (vspeed > 0) drawArrowGlyph(ctx, ROM598, state.VELY >= 0 ? ARROW.up    : ARROW.down, { x: ARROW_X, baselineY: ROW.bot });
  }

  // ALTITUDE proxy (see the DEVIATIONS note) — the shared SCPDST stand-in in
  // landscape.altitudeAt (ship world Y − terrain below, clamped ≥ 0). Reads correctly in
  // both scapes: DISPLY shows SCPDST×4 in major = (alt/4)×4 = alt, and SCPDST in minor = alt.
  _altitude(state, camera, landscape) {
    if (!camera || !landscape) return 0;
    return Math.round(landscape.altitudeAt(state, camera));
  }
}
