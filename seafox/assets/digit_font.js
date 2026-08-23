// seafox/assets/digit_font.js
//
// GENERATED FILE -- do not edit by hand.
// Build:  python seafox/tools/extract_sprites.py --dsk <path to the disk image>
//
// The HUD digit font of design_spec 19.9, read from $14F2-$1541 of the graphics
// file. Ten glyphs, eight bytes each, one byte per row.
//
// **It is not a block** (design_spec 6.6.1). Everything in sprite_blocks.js
// carries an eight-byte header giving its width, rows, palette and position,
// and is drawn by the general blitter. The font has none of that: the digit
// routine indexes it by BCD nibble and stores the bytes straight to the screen
// rows. What it shares with the blocks is the pixel format alone -- seven
// pixels to a byte, lowest bit leftmost -- so it is shaped like a block here,
// with byteWidth 1 and rows 8, purely so the bake of design_spec 6.3 applies to
// it unchanged.
//
// The cell is 6 x 8: six pixels of ink, a blank seventh column and a blank
// eighth row. Both blanks are the spacing between fields, which is what makes a
// digit field exactly seven pixels per digit with nothing to add between them.
//
// **Every glyph is pure white**, because no glyph contains an isolated lit
// pixel -- the extractor asserts this rather than assuming it. So the font takes
// no hue from the column it lands on, needs no parity variant, and phase and
// flip below are both 0 and mean nothing.


export const DIGIT_FONT = [
  { byteWidth: 1, rows: 8, phase: 0, flip: 0, bits: "HjMzMzMzHgA=" },  // 0
  { byteWidth: 1, rows: 8, phase: 0, flip: 0, bits: "DA4MDAwMHgA=" },  // 1
  { byteWidth: 1, rows: 8, phase: 0, flip: 0, bits: "HjMwGAwGPwA=" },  // 2
  { byteWidth: 1, rows: 8, phase: 0, flip: 0, bits: "HjMwHDAzHgA=" },  // 3
  { byteWidth: 1, rows: 8, phase: 0, flip: 0, bits: "ODw2Mz8wMAA=" },  // 4
  { byteWidth: 1, rows: 8, phase: 0, flip: 0, bits: "HwMfMDAzHgA=" },  // 5
  { byteWidth: 1, rows: 8, phase: 0, flip: 0, bits: "HgMDHzMzHgA=" },  // 6
  { byteWidth: 1, rows: 8, phase: 0, flip: 0, bits: "PzAwGAwGAwA=" },  // 7
  { byteWidth: 1, rows: 8, phase: 0, flip: 0, bits: "HjMzHjMzHgA=" },  // 8
  { byteWidth: 1, rows: 8, phase: 0, flip: 0, bits: "HjMzPjAwHgA=" },  // 9
];
