// lunar_lander/display_info.js
//
// The HUD (CLAUDE.md "Planned gameplay module layout" → display_info.js): the
// $5458 label grid + the CPU-drawn VALUES (SCORE / TIME / FUEL / ALTITUDE /
// HORIZONTAL SPEED / VERTICAL SPEED) and the two speed-direction arrows. A
// routine-level translation of the source's DISPLY (:3258, compute the decimals)
// + MESDATA (:1453, draw them). Extracted + consolidated from demos/screen.js.
//
// It only READS state (+ the measured clearance for ALTITUDE) and draws through render.js
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
// It also owns the LAND/CRASH outcome messages (renderOutcome) — the source's
// message display (:1655-1675 + the ENGMSG string table :1677-1746), drawn with
// the same ROM598 glyph set the original's MESSAGE JSRLs use.
//
// DEVIATIONS (labeled):
//   • Velocity is SIGN-MAGNITUDE in source (VELX magnitude + SGNVLX sign byte, ACCEL :1959);
//     our physics uses signed floats, so we take abs() for the number and sign() for the arrow.
//   • Values are BCD in source; we format plain integers (cosmetically identical).
//   • ALTITUDE = the REAL SCPDST (collision.js's min lower-corner clearance / major point
//     probe), passed in by main.js; 0 during the outcome (ALTITD cleared, :562-563).
//   • Layout is the MAME-MEASURED grid (screen.js / CLAUDE.md "Gameplay HUD"), not the
//     source's DATAVG offset vectors — same on-screen result, calibrated to a real frame.
//   • Outcome-message PLACEMENT is approximate (centred lines, readable 2× scale) — the
//     exact MESSLAB LABS grid is not decoded. The strings + pick logic are the source's.

import { SCREEN_H, drawShapeScreen, drawGlyphString, drawArrowGlyph, glyphRunWidth } from './render.js';
import { ROM598 } from './discovery_rom_data.js';
import { CollisionStatus } from './state.js';

// Character → ROM598 glyph key. Digits 1-9 are the $572A block; 0 reuses the letter
// O ($5688); colon is $55B2; space is $5726; A-Z are the $55BE font block (CLAUDE.md
// letter table) — the outcome messages need the full set.
const CHAR_KEY = { ' ': 'S_5726', ':': 'S_55B2', '0': 'S_5688' };
[0x572A, 0x5732, 0x5742, 0x5750, 0x575E, 0x576C, 0x577A, 0x5784, 0x5794]
  .forEach((a, i) => { CHAR_KEY[String(i + 1)] = 'S_' + a.toString(16).toUpperCase(); });
[0x55BE, 0x55CE, 0x55E8, 0x55F4, 0x5604, 0x5614, 0x5622, 0x5634, 0x5642, 0x5650,
 0x565C, 0x5668, 0x5672, 0x567E, 0x5688, 0x5694, 0x56A2, 0x56B4, 0x56C4, 0x56D2,
 0x56DE, 0x56EA, 0x56F4, 0x5702, 0x570C, 0x571A]
  .forEach((a, i) => { CHAR_KEY[String.fromCharCode(65 + i)] = 'S_' + a.toString(16).toUpperCase(); });
const keysFor = str => [...String(str).toUpperCase()].map(c => CHAR_KEY[c] || CHAR_KEY[' ']);

// The outcome status strings (ENGMSG :1677; strings :1729-1746). The pick is
// header + 1-of-4 by RNDOM (:1670-1672): good = CONG + GOOD0-3 (#9+R), hard =
// SATIRE + HARD0-3 (#13+R), crash = BAD0-3 (#17+R; BAD0 = the DESTROYED tail of
// HARD3). Then the points line (DIGT2S + HTPNTS " POINTS", :1651-1654).
const GOODMSG = ['THAT WAS A GREAT LANDING', 'THE EAGLE HAS LANDED',
                 'THE COLUMBIA HAS LANDED', 'YOU HAVE LANDED'];
const HARDMSG = ['LIFE SUPPORT IS GONE', 'YOUR TRIP IS ONE WAY',
                 'YOU ARE HOPELESSLY MAROONED', 'COMMUNICATION SYSTEM DESTROYED'];
const BADMSG  = ['DESTROYED', 'YOU CREATED A TWO MILE CRATER',
                 'YOU JUST DESTROYED A 100 MEGABUCK LANDER', 'THERE WERE NO SURVIVORS'];

const ARROW = { right: 'S_5566', left: 'S_5576', up: 'S_5586', down: 'S_5598' };

// MAME-measured layout (llander rev2, 2026-06-29; CLAUDE.md "Gameplay HUD").
// Canvas y-down baselines = the $5458 rows y_up 748/720/692 → 768−y.
const ROW = { top: 20, mid: 48, bot: 76 };   // SCORE/ALTITUDE · TIME/H-SPEED · FUEL/V-SPEED
const LEFT_X = 204;     // left column — LEFT-aligned (first char fixed)
const RIGHT_X = 878;    // right column — RIGHT-aligned units digit (number grows left)
const ARROW_X = 897;    // speed-direction arrow, ~20 units right of the value

const pad = (n, w) => String(n).padStart(w, '0');

export class DisplayInfo {
  // Draw the whole HUD for the current frame. `clearance` = the measured altitude
  // (collision.clearance = the source's SCPDST, world units; main passes 0 during
  // the outcome — ALTITD cleared, :562); everything else is pure state.
  render(ctx, state, clearance) {
    // The $5458 label grid at its native absolute position (LABS 100,748 inside the
    // composite → cx=0, cy=SCREEN_H, pxScale=1). runList skips the bri:0 spacing moves.
    drawShapeScreen(ctx, ROM598, 'S_5458', { cx: 0, cy: SCREEN_H, pxScale: 1, width: 1.5 });

    // LEFT column — left-aligned.
    drawGlyphString(ctx, ROM598, keysFor(pad(state.score, 4)),            { x: LEFT_X, y: ROW.top, align: 'left' });
    drawGlyphString(ctx, ROM598, keysFor(`${pad(state.clockMinutes, 2)}:${pad(state.clockSeconds, 2)}`), { x: LEFT_X, y: ROW.mid, align: 'left' });
    drawGlyphString(ctx, ROM598, keysFor(pad(Math.max(0, Math.floor(state.fuel)), 4)), { x: LEFT_X, y: ROW.bot, align: 'left' });

    // RIGHT column — right-aligned, zero-suppressed (bare integers).
    const alt    = Math.round(Math.max(0, clearance || 0));
    const hspeed = Math.floor(Math.abs(state.velX) / 64);   // |VEL| >> 6 (DISPLY :3264)
    const vspeed = Math.floor(Math.abs(state.velY) / 64);
    drawGlyphString(ctx, ROM598, keysFor(alt),    { x: RIGHT_X, y: ROW.top, align: 'right' });
    drawGlyphString(ctx, ROM598, keysFor(hspeed), { x: RIGHT_X, y: ROW.mid, align: 'right' });
    drawGlyphString(ctx, ROM598, keysFor(vspeed), { x: RIGHT_X, y: ROW.bot, align: 'right' });

    // Direction arrows (none when the speed reads 0; DISPLY :3276-3288).
    if (hspeed > 0) drawArrowGlyph(ctx, ROM598, state.velX >= 0 ? ARROW.right : ARROW.left, { x: ARROW_X, baselineY: ROW.mid });
    if (vspeed > 0) drawArrowGlyph(ctx, ROM598, state.velY >= 0 ? ARROW.up    : ARROW.down, { x: ARROW_X, baselineY: ROW.bot });
  }

  // The land/crash status display (:1655-1675): header + a random 1-of-4 status
  // line + the "NN POINTS" score line, all in the ROM glyph set. Drawn by main.js
  // while the outcome sequence runs (GAMODE $80).
  renderOutcome(ctx, state) {
    const st = state.outcomeStatus;
    const lines =
      st === CollisionStatus.CRASH     ? [BADMSG[state.messagePick]] :
      st === CollisionStatus.HARD_LAND ? ['YOU LANDED HARD', HARDMSG[state.messagePick]] :  // SATIRE (#8) + HARD0-3
                                         ['CONGRATULATIONS', GOODMSG[state.messagePick]];   // CONG (#7) + GOOD0-3
    lines.push(`${state.lastPoints} POINTS`);
    lines.forEach((s, i) => this._centreLine(ctx, s, 290 + i * 34));
  }

  // One glyph-string line centred on the screen's vertical axis (canvas y-down
  // baseline). 2× scale is a readability choice over the original's native size.
  _centreLine(ctx, str, y) {
    const keys = keysFor(str);
    const px = 2;
    const x = (1024 - glyphRunWidth(ROM598, keys) * px) / 2;
    drawGlyphString(ctx, ROM598, keys, { x, y, pxScale: px, align: 'left' });
  }
}
