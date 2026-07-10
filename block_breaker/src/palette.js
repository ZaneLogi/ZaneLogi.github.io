// palette.js -- colour constants for the block_breaker port.
//
// Two things live here:
//   MSX_PALETTE  the fixed 16-colour TMS9918A palette (index -> #rrggbb).
//                Hardware-fixed on MSX1 (not stored in the ROM); this is the
//                standard datasheet approximation. Used by the faithful
//                tile-rendering step later; kept here so all colour data is in
//                one reusable module.
//   brickColor() display colour for a brick's colour-index (0..9).
//
// PROVENANCE NOTE (be honest about what's decoded vs provisional):
//   * index 9 = GOLD (indestructible) is DECODED FACT -- its per-level count
//     equals (present - breakable) across all 32 levels (see tools/extract.py
//     and CLAUDE.md). It must read as gold.
//   * indices 0..8 are PROVISIONAL canonical-Arkanoid colours chosen only so the
//     layout viewer shows distinct, recognisable bricks. They are NOT yet
//     verified against the ROM's real per-tile colours -- the faithful-tile step
//     will replace them by decoding in_game_patterns/in_game_colors.

// Standard TMS9918A / MSX1 palette. Index 0 is transparent.
export const MSX_PALETTE = [
  null,        // 0 transparent
  '#000000',   // 1 black
  '#3eb849',   // 2 medium green
  '#74d07d',   // 3 light green
  '#5955e0',   // 4 dark blue
  '#8076f1',   // 5 light blue
  '#b95e51',   // 6 dark red
  '#65dbef',   // 7 cyan
  '#db6559',   // 8 medium red
  '#ff897d',   // 9 light red
  '#ccc35e',   // 10 dark yellow
  '#ded087',   // 11 light yellow
  '#3aa241',   // 12 dark green
  '#b766b5',   // 13 magenta
  '#cccccc',   // 14 gray
  '#ffffff',   // 15 white
];

// Brick display colours by colour-index 0..9.
// 9 = gold (DECODED). 0..8 provisional (see note above).
export const BRICK_COLORS = [
  '#d8d8d8',   // 0 white / silver-ish
  '#e0781f',   // 1 orange
  '#3fb7e0',   // 2 cyan
  '#3ec84a',   // 3 green
  '#e23b3b',   // 4 red
  '#4a6bf5',   // 5 blue
  '#d060c8',   // 6 magenta/pink
  '#ede03a',   // 7 yellow
  '#9aa0a8',   // 8 silver (grey; provisional)
  '#d9a520',   // 9 GOLD (indestructible) -- decoded
];

export const GOLD_INDEX = 9; // decoded: the indestructible brick type

export function brickColor(index) {
  return BRICK_COLORS[index] ?? '#ff00ff'; // magenta = "unexpected index"
}
