// text.js — the ROM's "huge letter" text, drawn into a Tilemap.
//
// Absorbs:
//   sub_D8D2_draw_huge_letters ($D8D2)  -> drawHugeText()
//   sub_D85E_draw_huge_letter ($D85E)   -> drawHugeLetter()
//
// THE MECHANISM, because it is not obvious and it is lovely: there is no huge font
// in the ROM. sub_D85E reads the letter's ORDINARY 8x8 font glyph out of the
// background pattern table, then blows each glyph BIT up into a 4x4-pixel brick
// quadrant — so "BATTLE CITY" on the title screen is literally built out of
// brick-wall tiles, in the same $00-$0F quadrant vocabulary a bullet later chips
// away at (see Tilemap.setQuadrant). One 8x8 glyph -> 32x32 px -> 4x4 tiles.
//
// This is why the ROM's complete huge-text set is five short ASCII strings
// (BATTLE, CITY, HISCORE, GAME, OVER) and not a single byte of letter artwork.
//
// NOT PORTED, deliberately — three bits of $D85E are pure 6502/PPU plumbing:
//   - the glyph read is $2006/$2007 against $1000 + tile*16, with the mandatory
//     dummy read at $D884 for the PPU's buffered-read latency. We index CHR[].
//   - only bytes 0-7 are read: that is bitplane 0, which for a 2-colour font glyph
//     IS the shape. Not a shortcut — $D85E never touches plane 1 either.
//   - the PHA/PLA stack reversal ($D88B/$D897) exists because the PPU can only be
//     read forwards (rows 0..7) while the routine walks the screen UPWARDS
//     ($D8C9 SBC #$04 from posY+$20). The two reversals cancel; the net effect is
//     plane0[r] landing at y + 4 + 4*r, which is what the loop below just says.

import { CHR, CHR_BG_BASE } from './assets/dat_chr.js';

/** @typedef {import('./tilemap.js').Tilemap} Tilemap */

const LETTER_PX = 0x20;   // $D8EC ADC #$20 — 8 glyph bits x 4px = 32px per letter

// $D1B5 LDA #$30 -> ram_0060_tile_id_offset. The font is ASCII-indexed, so adding
// $30 is what turns a digit VALUE (0-9) into the tile for the character '0'-'9'.
// $D6F5 does the add; $D210 puts the offset back to 0 for ordinary text.
const DIGIT_TILE = 0x30;

// sub_D9FE_clear_bcd_number ($D9FE) spells the layout out: a score is SEVEN digit
// bytes, most significant first — millions, hundred-thousands, ten-thousands,
// thousands, hundreds, tens, ones — then an $FF end token.
const SCORE_DIGITS = 7;

/**
 * sub_D85E_draw_huge_letter ($D85E). One letter, 32x32 px, top-left at (x, y+4).
 * @param {Tilemap} tm
 * @param {number} tile  BG pattern-table index of the letter's normal glyph.
 * @param {number} x  pixel column ($0056 ram_pos_X_letter)
 * @param {number} y  pixel row    ($0057 ram_pos_Y_letter)
 */
export function drawHugeLetter(tm, tile, x, y) {
  const base = (CHR_BG_BASE + tile) * 16;   // $D867-$D877: $1000 + tile * $10
  for (let r = 0; r < 8; r++) {
    const plane0 = CHR[base + r];           // $D88B LDA $2007 x8
    const py = y + 4 + 4 * r;               // see the PHA/PLA note above
    for (let c = 0; c < 8; c++) {
      // $D8A5-$D8AB: AND the walking mask; set -> $D764, clear -> $D74D.
      tm.setQuadrant(x + 4 * c, py, (plane0 & (0x80 >> c)) !== 0);
    }
  }
}

/**
 * sub_D8D2_draw_huge_letters ($D8D2). An ASCII string, laid out left to right.
 * The ROM's tables are $FF-terminated ($D8D8); here the string's end is the end.
 * @param {Tilemap} tm
 * @param {string} str  e.g. 'BATTLE' (tbl_D299), 'CITY' (tbl_D2A0)
 * @param {number} x  pixel column of the first letter
 * @param {number} y  pixel row
 * @param {number} tileIdOffset  ram_0060 ($D8E4 ADC) — 0 for text, since the
 *                 ROM's font is ASCII-indexed. It is $30 only when the caller is
 *                 feeding DIGIT VALUES 0-9 and needs them to land on '0'-'9'.
 */
export function drawHugeText(tm, str, x, y, tileIdOffset = 0) {
  for (const ch of str) {
    drawHugeLetter(tm, ch.charCodeAt(0) + tileIdOffset, x, y);   // $D8E6
    x += LETTER_PX;                                              // $D8E9-$D8EE
  }
}

/**
 * sub_D6B3_fill_buffer_with_tiles ($D6B3) against a table from dat_text.js.
 * @param {Tilemap} tm
 * @param {{col: number, row: number, ids: number[]}} t
 */
export function writeText(tm, t) { tm.writeTiles(t.col, t.row, t.ids); }

/** The ROM's 7-digit array for `value`, most significant first ($D9FE's layout). */
function digitsOf(value) {
  const d = new Array(SCORE_DIGITS);
  for (let i = SCORE_DIGITS - 1; i >= 0; i--) {
    d[i] = value % 10;
    value = Math.floor(value / 10);
  }
  return d;
}

/**
 * sub_D934_calculate_padding_for_number ($D934) + sub_D6DD ($D6DD), fused.
 *
 * The ROM stores a score as fixed-width digits, so printing it means suppressing
 * the leading zeros — and it does that by walking the array from the left,
 * stepping the COLUMN along with the index ($D939 INY / $D93A INX). The number
 * therefore ends up right-aligned with its ones digit at a fixed column, which is
 * the whole point of the routine's odd shape.
 *
 * We keep scores as JS numbers, not a zero-page digit array (CLAUDE.md: idiomatic
 * data model, faithful behaviour), so digitsOf() is where the two meet.
 *
 * @param {number} first  index of the first digit to consider. The title passes
 *   `ram_p1_score + $01` ($D1C8), i.e. 1 — so the MILLIONS digit is never shown
 *   on the title screen at all, and a score of exactly 1000000 would print as
 *   "00". Faithful; unreachable in practice.
 * @param {number} minDigits  what to print when every digit is zero, and the walk
 *   runs into the $FF token instead ($D93E). The ROM backs up by 2 or by 1 depending
 *   on ram_006B_flag ($D942) — a shared "minimum width" scratch byte: 0 -> "00",
 *   nonzero -> "0". Each screen sets it for its OWN draws: RESET ($D495) and the
 *   Tally's exit loc_CEE5 ($CEF0) set 0; sub_C7C8 (battle lives) and the Tally setup
 *   ($CEFC) set 1. $D17F (the title) never sets it — but every path to the title
 *   clears it to 0 first: RESET at boot, and the Tally's $CEF0 on the way back from a
 *   game (game over ALWAYS routes through the Tally). So a zero title score is "00" in
 *   BOTH cases (verified P12). The port drops the shared byte and passes minDigits per
 *   call (title 2, HUD lives 1, tally 1); minDigits=2 here is faithful. Was flow doc §8.
 * @param {number} digitBase  ram_0060_tile_id_offset ($D6F5 ADC): the '0' glyph of
 *   the digit font. $30 (ASCII) for the title score; the sidebar HUD passes $6E,
 *   the small digit font ($C7CE lives / $C87A stage number). research_hud.md §4.
 */
export function drawNumber(tm, value, col, row,
                           { first = 1, minDigits = 2, digitBase = DIGIT_TILE } = {}) {
  const d = digitsOf(value);
  let i = first;
  let x = col;
  while (i < SCORE_DIGITS && d[i] === 0) { i++; x++; }        // $D934-$D93B
  if (i === SCORE_DIGITS) { i -= minDigits; x -= minDigits; } // $D93E-$D949
  const ids = [];
  for (let k = i; k < SCORE_DIGITS; k++) ids.push(digitBase + d[k]);   // $D6F5
  tm.writeTiles(x, row, ids);                                 // $D6F7 into the buffer
}
