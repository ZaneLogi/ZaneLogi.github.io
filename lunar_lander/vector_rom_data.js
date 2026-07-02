// lunar_lander/vector_rom_data.js
//
// GENERATED FILE — do not edit by hand.
// Source: 034598-01.np3 (Lunar Lander picture/glyph ROM, CPU $5000-$57FF)
// Build:  python lunar_lander/tools/build_vector_rom.py
// Spec:   asteroids_clone/docs/research_dvg.md §11 (shared DVG format)
//
// Scope: the letters/font block (A-Z + space). Each glyph is a DVG
// subroutine ending in RTS, decoded byte-faithfully from the ROM.
// Picture shapes (lander) live in lander_rom_data.js.

export const VROM = {
  // $55BE — 'A' — 8 opcodes
  Char_A: [
    {op: 'SVEC', scaleMode: 1, bri: 12, dx:  0, dy: +2},
    {op: 'SVEC', scaleMode: 0, bri: 12, dx: +2, dy: +2},
    {op: 'SVEC', scaleMode: 0, bri: 12, dx: +2, dy: -2},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx:  0, dy: -2},
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: -2, dy: +1},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +2, dy: -2},
    {op: 'RTS'},
  ],

  // $55CE — 'B' — 13 opcodes
  Char_B: [
    {op: 'SVEC', scaleMode: 1, bri: 12, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 0, bri: 12, dx: +3, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri: 12, dx: +1, dy: -1},
    {op: 'SVEC', scaleMode: 0, bri: 12, dx:  0, dy: -1},
    {op: 'SVEC', scaleMode: 0, bri: 12, dx: -1, dy: -1},
    {op: 'SVEC', scaleMode: 0, bri: 12, dx: -3, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +3, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri: 12, dx: +1, dy: -1},
    {op: 'SVEC', scaleMode: 0, bri: 12, dx:  0, dy: -1},
    {op: 'SVEC', scaleMode: 0, bri: 12, dx: -1, dy: -1},
    {op: 'SVEC', scaleMode: 0, bri: 12, dx: -3, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: +3, dy:  0},
    {op: 'RTS'},
  ],

  // $55E8 — 'C' — 6 opcodes
  Char_C: [
    {op: 'SVEC', scaleMode: 1, bri: 12, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: -2, dy: -3},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +2, dy:  0},
    {op: 'RTS'},
  ],

  // $55F4 — 'D' — 8 opcodes
  Char_D: [
    {op: 'SVEC', scaleMode: 1, bri: 12, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 0, bri: 12, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri: 12, dx: +2, dy: -2},
    {op: 'SVEC', scaleMode: 0, bri: 12, dx:  0, dy: -2},
    {op: 'SVEC', scaleMode: 0, bri: 12, dx: -2, dy: -2},
    {op: 'SVEC', scaleMode: 0, bri: 12, dx: -2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: +3, dy:  0},
    {op: 'RTS'},
  ],

  // $5604 — 'E' — 8 opcodes
  Char_E: [
    {op: 'SVEC', scaleMode: 1, bri: 12, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: -1, dy: -3},
    {op: 'SVEC', scaleMode: 0, bri: 12, dx: -3, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx:  0, dy: -3},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +2, dy:  0},
    {op: 'RTS'},
  ],

  // $5614 — 'F' — 7 opcodes
  Char_F: [
    {op: 'SVEC', scaleMode: 1, bri: 12, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: -1, dy: -3},
    {op: 'SVEC', scaleMode: 0, bri: 12, dx: -3, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx:  0, dy: -3},
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: +3, dy:  0},
    {op: 'RTS'},
  ],

  // $5622 — 'G' — 9 opcodes
  Char_G: [
    {op: 'SVEC', scaleMode: 1, bri: 12, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri: 12, dx:  0, dy: -2},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: -2, dy: -2},
    {op: 'SVEC', scaleMode: 0, bri: 12, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri: 12, dx:  0, dy: -2},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx: -2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: +3, dy:  0},
    {op: 'RTS'},
  ],

  // $5634 — 'H' — 7 opcodes
  Char_H: [
    {op: 'SVEC', scaleMode: 1, bri: 12, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx:  0, dy: -3},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx:  0, dy: -3},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +2, dy:  0},
    {op: 'RTS'},
  ],

  // $5642 — 'I' — 7 opcodes
  Char_I: [
    {op: 'SVEC', scaleMode: 1, bri: 12, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: -2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx: -2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: +3, dy: -3},
    {op: 'RTS'},
  ],

  // $5650 — 'J' — 6 opcodes
  Char_J: [
    {op: 'SVEC', scaleMode: 0, bri:  0, dx:  0, dy: +2},
    {op: 'SVEC', scaleMode: 0, bri: 12, dx: +2, dy: -2},
    {op: 'SVEC', scaleMode: 0, bri: 12, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: +1, dy: -3},
    {op: 'RTS'},
  ],

  // $565C — 'K' — 6 opcodes
  Char_K: [
    {op: 'SVEC', scaleMode: 1, bri: 12, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +3, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri: 12, dx: -3, dy: -3},
    {op: 'SVEC', scaleMode: 0, bri: 12, dx: +3, dy: -3},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +3, dy:  0},
    {op: 'RTS'},
  ],

  // $5668 — 'L' — 5 opcodes
  Char_L: [
    {op: 'SVEC', scaleMode: 1, bri:  0, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx:  0, dy: -3},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +2, dy:  0},
    {op: 'RTS'},
  ],

  // $5672 — 'M' — 6 opcodes
  Char_M: [
    {op: 'SVEC', scaleMode: 1, bri: 12, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 0, bri: 12, dx: +2, dy: -2},
    {op: 'SVEC', scaleMode: 0, bri: 12, dx: +2, dy: +2},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx:  0, dy: -3},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +2, dy:  0},
    {op: 'RTS'},
  ],

  // $567E — 'N' — 5 opcodes
  Char_N: [
    {op: 'SVEC', scaleMode: 1, bri: 12, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx: +2, dy: -3},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: +1, dy: -3},
    {op: 'RTS'},
  ],

  // $5688 — 'O' — 6 opcodes
  Char_O: [
    {op: 'SVEC', scaleMode: 1, bri: 12, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx:  0, dy: -3},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx: -2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: +3, dy:  0},
    {op: 'RTS'},
  ],

  // $5694 — 'P' — 7 opcodes
  Char_P: [
    {op: 'SVEC', scaleMode: 1, bri: 12, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri: 12, dx:  0, dy: -3},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx: -2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +3, dy: -3},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +3, dy:  0},
    {op: 'RTS'},
  ],

  // $56A2 — 'Q' — 9 opcodes
  Char_Q: [
    {op: 'SVEC', scaleMode: 1, bri: 12, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx:  0, dy: -2},
    {op: 'SVEC', scaleMode: 0, bri: 12, dx: -2, dy: -2},
    {op: 'SVEC', scaleMode: 0, bri: 12, dx: -2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +2, dy: +2},
    {op: 'SVEC', scaleMode: 0, bri: 12, dx: +2, dy: -2},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +2, dy:  0},
    {op: 'RTS'},
  ],

  // $56B4 — 'R' — 8 opcodes
  Char_R: [
    {op: 'SVEC', scaleMode: 1, bri: 12, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri: 12, dx:  0, dy: -3},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx: -2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +1, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri: 12, dx: +3, dy: -3},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +2, dy:  0},
    {op: 'RTS'},
  ],

  // $56C4 — 'S' — 7 opcodes
  Char_S: [
    {op: 'SVEC', scaleMode: 1, bri: 12, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri: 12, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx: -2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri: 12, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: +1, dy: -3},
    {op: 'RTS'},
  ],

  // $56D2 — 'T' — 6 opcodes
  Char_T: [
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: -2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: +1, dy: -3},
    {op: 'RTS'},
  ],

  // $56DE — 'U' — 6 opcodes
  Char_U: [
    {op: 'SVEC', scaleMode: 1, bri:  0, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx:  0, dy: -3},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: +1, dy: -3},
    {op: 'RTS'},
  ],

  // $56EA — 'V' — 5 opcodes
  Char_V: [
    {op: 'SVEC', scaleMode: 1, bri:  0, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx: +1, dy: -3},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx: +1, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: +1, dy: -3},
    {op: 'RTS'},
  ],

  // $56F4 — 'W' — 7 opcodes
  Char_W: [
    {op: 'SVEC', scaleMode: 1, bri:  0, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx:  0, dy: -3},
    {op: 'SVEC', scaleMode: 0, bri: 12, dx: +2, dy: +2},
    {op: 'SVEC', scaleMode: 0, bri: 12, dx: +2, dy: -2},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: +1, dy: -3},
    {op: 'RTS'},
  ],

  // $5702 — 'X' — 5 opcodes
  Char_X: [
    {op: 'SVEC', scaleMode: 1, bri: 12, dx: +2, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: -2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx: +2, dy: -3},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +2, dy:  0},
    {op: 'RTS'},
  ],

  // $570C — 'Y' — 7 opcodes
  Char_Y: [
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx:  0, dy: +2},
    {op: 'SVEC', scaleMode: 0, bri: 12, dx: -2, dy: +2},
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri: 12, dx: -2, dy: -2},
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: +2, dy: -2},
    {op: 'RTS'},
  ],

  // $571A — 'Z' — 6 opcodes
  Char_Z: [
    {op: 'SVEC', scaleMode: 1, bri:  0, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx: -2, dy: -3},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +2, dy:  0},
    {op: 'RTS'},
  ],

  // $5726 — space — 2 opcodes
  Char_Space: [
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: +3, dy:  0},
    {op: 'RTS'},
  ],
};
