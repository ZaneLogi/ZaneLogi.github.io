// ball_sprite.js -- the decoded Arkanoid-MSX ball sprite (pattern 0x80).
//
// Source: sprite_data.asm:131-134 (ROM 0x8A84), the top-left 8x8 quadrant of a
// 16x16 hardware sprite; the other three quadrants and rows 4-15 are all empty.
// Set as the ball's pattern at disassembly.asm:9230 / :7154 (colour 15 = white).
//
// The four non-empty pattern bytes (MSB = leftmost pixel), rows 0..3:
//     0x70  . # # # .
//     0xf8  # # # # #
//     0xf8  # # # # #
//     0x70  . # # # .
// => a 5-wide x 4-tall lozenge anchored at the sprite ORIGIN (no transparent
// margin -- unlike the Vaus's ~10px left margin). So the sprite origin ~= the
// ball's visible top-left, which is why one rendered ball sits flush against both
// the origin-based wall checks and the edge-based brick checks. See the research
// doc "Ball sprite (decoded)".

export const BALL_PATTERN_BYTES = [0x70, 0xf8, 0xf8, 0x70]; // ROM 0x8A84..0x8A87

export const BALL_SPRITE = {
  w: 5,
  h: 4,
  // Lit-pixel rows (cols 0..4), derived from the top 5 bits of each pattern byte.
  // Drawn from the top-left at (ball.x, ball.y) -- the sprite origin.
  rows: [
    [0, 1, 1, 1, 0],
    [1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1],
    [0, 1, 1, 1, 0],
  ],
};
