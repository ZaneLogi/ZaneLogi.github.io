// asteroids_clone/vector_rom_data.js
//
// GENERATED FILE — do not edit by hand.
// Source: <sparse-clone>/content/Arcade/Asteroids/VectorROM.md
// Build:  python asteroids_clone/tools/build_vector_rom.py
// Spec:   asteroids_clone/docs/research_dvg.md §11
//
// First-pass scope: ship region only (CPU $5290-$54D8 /
// DVG byte $1290-$14D8). Covers 17 ShipDirN + 17 ThrustDirN = 34 subroutines.
// Direction unit: 360°/256 = 1.40625° per unit; ShipDirN angle = N × 1.40625°.
//
// Data is byte-faithful to the ROM — no aesthetic modifications applied.
// (A 4-step SVEC→VEC + ×8-scaling recipe was tried and reverted; see
// docs/progress.md if you want to re-apply.)

export const VROM = {
  // $50E0 — 6 opcodes
  ShipExplosion: [
    {op: 'SVEC', scaleMode: 1, bri: 12, dx: -2, dy: -3},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx: +1, dy: -2},
    {op: 'SVEC', scaleMode: 0, bri: 12, dx: +3, dy: +1},
    {op: 'SVEC', scaleMode: 2, bri: 12, dx: -1, dy: +1},
    {op: 'SVEC', scaleMode: 0, bri: 12, dx: -3, dy: +1},
    {op: 'SVEC', scaleMode: 1, bri: 12, dx: +1, dy: -1},
  ],

  // $5100 — 21 opcodes
  Shrapnel1: [
    {op: 'SVEC', scaleMode: 3, bri:  0, dx: -1, dy:  0},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx:  0, dy:  0},
    {op: 'SVEC', scaleMode: 3, bri:  0, dx: -1, dy: -1},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx:  0, dy:  0},
    {op: 'SVEC', scaleMode: 3, bri:  0, dx: +1, dy: -1},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx:  0, dy:  0},
    {op: 'SVEC', scaleMode: 2, bri:  0, dx: +3, dy: +1},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx:  0, dy:  0},
    {op: 'SVEC', scaleMode: 2, bri:  0, dx: +2, dy: -1},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx:  0, dy:  0},
    {op: 'SVEC', scaleMode: 3, bri:  0, dx:  0, dy: +1},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx:  0, dy:  0},
    {op: 'SVEC', scaleMode: 2, bri:  0, dx: +1, dy: +3},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx:  0, dy:  0},
    {op: 'SVEC', scaleMode: 2, bri:  0, dx: -1, dy: +3},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx:  0, dy:  0},
    {op: 'VEC',  localScale: 5, bri:  0, dx:  -512, dy:  -128},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx:  0, dy:  0},
    {op: 'SVEC', scaleMode: 2, bri:  0, dx: -3, dy: +1},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx:  0, dy:  0},
    {op: 'RTS'},
  ],

  // $512C — 21 opcodes
  Shrapnel2: [
    {op: 'VEC',  localScale: 3, bri:  0, dx:  -896, dy:     0},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx:  0, dy:  0},
    {op: 'VEC',  localScale: 3, bri:  0, dx:  -896, dy:  -896},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx:  0, dy:  0},
    {op: 'VEC',  localScale: 3, bri:  0, dx:  +896, dy:  -896},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx:  0, dy:  0},
    {op: 'VEC',  localScale: 4, bri:  0, dx:  +672, dy:  +224},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx:  0, dy:  0},
    {op: 'VEC',  localScale: 3, bri:  0, dx:  +896, dy:  -448},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx:  0, dy:  0},
    {op: 'VEC',  localScale: 3, bri:  0, dx:     0, dy:  +896},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx:  0, dy:  0},
    {op: 'VEC',  localScale: 4, bri:  0, dx:  +224, dy:  +672},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx:  0, dy:  0},
    {op: 'VEC',  localScale: 4, bri:  0, dx:  -224, dy:  +672},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx:  0, dy:  0},
    {op: 'VEC',  localScale: 4, bri:  0, dx:  -896, dy:  -224},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx:  0, dy:  0},
    {op: 'VEC',  localScale: 4, bri:  0, dx:  -672, dy:  +224},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx:  0, dy:  0},
    {op: 'RTS'},
  ],

  // $516A — 21 opcodes
  Shrapnel3: [
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: -3, dy:  0},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx:  0, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: -3, dy: -3},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx:  0, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: +3, dy: -3},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx:  0, dy:  0},
    {op: 'VEC',  localScale: 4, bri:  0, dx:  +576, dy:  +192},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx:  0, dy:  0},
    {op: 'VEC',  localScale: 3, bri:  0, dx:  +768, dy:  -384},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx:  0, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri:  0, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx:  0, dy:  0},
    {op: 'VEC',  localScale: 4, bri:  0, dx:  +192, dy:  +576},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx:  0, dy:  0},
    {op: 'VEC',  localScale: 4, bri:  0, dx:  -192, dy:  +576},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx:  0, dy:  0},
    {op: 'VEC',  localScale: 4, bri:  0, dx:  -768, dy:  -192},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx:  0, dy:  0},
    {op: 'VEC',  localScale: 4, bri:  0, dx:  -576, dy:  +192},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx:  0, dy:  0},
    {op: 'RTS'},
  ],

  // $51A0 — 21 opcodes
  Shrapnel4: [
    {op: 'VEC',  localScale: 3, bri:  0, dx:  -640, dy:     0},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx:  0, dy:  0},
    {op: 'VEC',  localScale: 3, bri:  0, dx:  -640, dy:  -640},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx:  0, dy:  0},
    {op: 'VEC',  localScale: 3, bri:  0, dx:  +640, dy:  -640},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx:  0, dy:  0},
    {op: 'VEC',  localScale: 3, bri:  0, dx:  +960, dy:  +320},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx:  0, dy:  0},
    {op: 'VEC',  localScale: 3, bri:  0, dx:  +640, dy:  -320},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx:  0, dy:  0},
    {op: 'VEC',  localScale: 3, bri:  0, dx:     0, dy:  +640},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx:  0, dy:  0},
    {op: 'VEC',  localScale: 3, bri:  0, dx:  +320, dy:  +960},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx:  0, dy:  0},
    {op: 'VEC',  localScale: 3, bri:  0, dx:  -320, dy:  +960},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx:  0, dy:  0},
    {op: 'VEC',  localScale: 4, bri:  0, dx:  -640, dy:  -160},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx:  0, dy:  0},
    {op: 'VEC',  localScale: 3, bri:  0, dx:  -960, dy:  +320},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx:  0, dy:  0},
    {op: 'RTS'},
  ],

  // $51E6 — 12 opcodes
  Rock1: [
    {op: 'SVEC', scaleMode: 3, bri:  0, dx:  0, dy: +1},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx: +1, dy: +1},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx: +1, dy: -1},
    {op: 'SVEC', scaleMode: 2, bri:  7, dx: -1, dy: -2},
    {op: 'SVEC', scaleMode: 2, bri:  7, dx: +1, dy: -2},
    {op: 'SVEC', scaleMode: 2, bri:  8, dx: -3, dy: -2},
    {op: 'SVEC', scaleMode: 2, bri:  8, dx: -3, dy:  0},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx: -1, dy: +1},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx:  0, dy: +2},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx: +1, dy: +1},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx: +1, dy: -1},
    {op: 'RTS'},
  ],

  // $51FE — 14 opcodes
  Rock2: [
    {op: 'SVEC', scaleMode: 2, bri:  0, dx: +2, dy: +1},
    {op: 'SVEC', scaleMode: 2, bri:  7, dx: +2, dy: +1},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx: -1, dy: +1},
    {op: 'SVEC', scaleMode: 2, bri:  7, dx: -2, dy: -1},
    {op: 'SVEC', scaleMode: 2, bri:  7, dx: -2, dy: +1},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx: -1, dy: -1},
    {op: 'SVEC', scaleMode: 2, bri:  7, dx: +1, dy: -2},
    {op: 'SVEC', scaleMode: 2, bri:  7, dx: -1, dy: -2},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx: +1, dy: -1},
    {op: 'SVEC', scaleMode: 2, bri:  7, dx: +1, dy: +1},
    {op: 'SVEC', scaleMode: 2, bri:  8, dx: +3, dy: -1},
    {op: 'SVEC', scaleMode: 2, bri:  8, dx: +2, dy: +3},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx: -1, dy: +1},
    {op: 'RTS'},
  ],

  // $521A — 13 opcodes
  Rock3: [
    {op: 'SVEC', scaleMode: 3, bri:  0, dx: -1, dy:  0},
    {op: 'SVEC', scaleMode: 2, bri:  7, dx: -2, dy: -1},
    {op: 'SVEC', scaleMode: 2, bri:  7, dx: +2, dy: -3},
    {op: 'SVEC', scaleMode: 2, bri:  7, dx: +2, dy: +3},
    {op: 'SVEC', scaleMode: 2, bri:  7, dx:  0, dy: -3},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx: +1, dy:  0},
    {op: 'SVEC', scaleMode: 2, bri:  7, dx: +2, dy: +3},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx:  0, dy: +1},
    {op: 'SVEC', scaleMode: 2, bri:  7, dx: -2, dy: +3},
    {op: 'SVEC', scaleMode: 2, bri:  7, dx: -3, dy:  0},
    {op: 'SVEC', scaleMode: 2, bri:  7, dx: -3, dy: -3},
    {op: 'SVEC', scaleMode: 2, bri:  7, dx: +2, dy: -1},
    {op: 'RTS'},
  ],

  // $5234 — 14 opcodes
  Rock4: [
    {op: 'SVEC', scaleMode: 2, bri:  0, dx: +1, dy:  0},
    {op: 'SVEC', scaleMode: 2, bri:  7, dx: +3, dy: +1},
    {op: 'SVEC', scaleMode: 2, bri:  6, dx:  0, dy: +1},
    {op: 'SVEC', scaleMode: 2, bri:  7, dx: -3, dy: +2},
    {op: 'SVEC', scaleMode: 2, bri:  7, dx: -3, dy:  0},
    {op: 'SVEC', scaleMode: 2, bri:  6, dx: +1, dy: -2},
    {op: 'SVEC', scaleMode: 2, bri:  7, dx: -3, dy:  0},
    {op: 'SVEC', scaleMode: 2, bri:  7, dx:  0, dy: -3},
    {op: 'SVEC', scaleMode: 2, bri:  7, dx: +2, dy: -3},
    {op: 'SVEC', scaleMode: 2, bri:  7, dx: +3, dy: +1},
    {op: 'SVEC', scaleMode: 2, bri:  6, dx: +1, dy: -1},
    {op: 'SVEC', scaleMode: 3, bri:  6, dx: +1, dy: +1},
    {op: 'SVEC', scaleMode: 2, bri:  7, dx: -3, dy: +2},
    {op: 'RTS'},
  ],

  // $5252 — 13 opcodes
  UFO: [
    {op: 'SVEC', scaleMode: 2, bri:  0, dx: -2, dy: +1},
    {op: 'SVEC', scaleMode: 3, bri: 12, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 2, bri:  0, dx: +3, dy: -2},
    {op: 'VEC',  localScale: 6, bri: 13, dx:  -640, dy:     0},
    {op: 'SVEC', scaleMode: 2, bri: 13, dx: +3, dy: -2},
    {op: 'SVEC', scaleMode: 3, bri: 12, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 2, bri: 13, dx: +3, dy: +2},
    {op: 'SVEC', scaleMode: 2, bri: 13, dx: -3, dy: +2},
    {op: 'SVEC', scaleMode: 2, bri: 12, dx: -1, dy: +2},
    {op: 'SVEC', scaleMode: 3, bri: 12, dx: -1, dy:  0},
    {op: 'SVEC', scaleMode: 2, bri: 12, dx: -1, dy: -2},
    {op: 'SVEC', scaleMode: 2, bri: 13, dx: -3, dy: -2},
    {op: 'RTS'},
  ],

  // $5290 — 0° (east →) — 7 opcodes
  ShipDir0: [
    {op: 'SVEC', scaleMode: 2, bri:  0, dx: -3, dy: -2},
    {op: 'SVEC', scaleMode: 3, bri: 12, dx:  0, dy: +2},
    {op: 'SVEC', scaleMode: 3, bri: 11, dx: -1, dy: +1},
    {op: 'VEC',  localScale: 6, bri: 12, dx:  +768, dy:  -256},
    {op: 'VEC',  localScale: 6, bri: 12, dx:  -768, dy:  -256},
    {op: 'SVEC', scaleMode: 3, bri: 11, dx: +1, dy: +1},
    {op: 'RTS'},
  ],

  // $52A2 — thrust flame, 0° (east →) — 3 opcodes
  ThrustDir0: [
    {op: 'SVEC', scaleMode: 3, bri: 12, dx: -2, dy: +1},
    {op: 'SVEC', scaleMode: 3, bri: 12, dx: +2, dy: +1},
    {op: 'RTS'},
  ],

  // $52A8 — 5.625° — 7 opcodes
  ShipDir4: [
    {op: 'VEC',  localScale: 4, bri:  0, dx:  -704, dy:  -576},
    {op: 'VEC',  localScale: 5, bri: 12, dx:   -48, dy:  +512},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  -544, dy:  +448},
    {op: 'VEC',  localScale: 6, bri: 12, dx:  +792, dy:  -176},
    {op: 'VEC',  localScale: 6, bri: 12, dx:  -736, dy:  -328},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  +448, dy:  +544},
    {op: 'RTS'},
  ],

  // $52C2 — thrust flame, 5.625° — 3 opcodes
  ThrustDir4: [
    {op: 'VEC',  localScale: 5, bri: 12, dx:  -528, dy:  +208},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  +960, dy:  +608},
    {op: 'RTS'},
  ],

  // $52CC — 11.25° — 7 opcodes
  ShipDir8: [
    {op: 'VEC',  localScale: 4, bri:  0, dx:  -640, dy:  -640},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  -192, dy:  +992},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  -608, dy:  +416},
    {op: 'VEC',  localScale: 6, bri: 12, dx:  +800, dy:  -104},
    {op: 'VEC',  localScale: 6, bri: 12, dx:  -704, dy:  -400},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  +416, dy:  +608},
    {op: 'RTS'},
  ],

  // $52E6 — thrust flame, 11.25° — 3 opcodes
  ThrustDir8: [
    {op: 'VEC',  localScale: 5, bri: 12, dx:  -560, dy:  +144},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  +896, dy:  +704},
    {op: 'RTS'},
  ],

  // $52F0 — 16.875° — 7 opcodes
  ShipDir12: [
    {op: 'VEC',  localScale: 4, bri:  0, dx:  -576, dy:  -704},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  -288, dy:  +992},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  -640, dy:  +352},
    {op: 'VEC',  localScale: 6, bri: 12, dx:  +808, dy:   -24},
    {op: 'VEC',  localScale: 6, bri: 12, dx:  -664, dy:  -464},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  +352, dy:  +640},
    {op: 'RTS'},
  ],

  // $530A — thrust flame, 16.875° — 3 opcodes
  ThrustDir12: [
    {op: 'VEC',  localScale: 5, bri: 12, dx:  -560, dy:   +96},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  +832, dy:  +800},
    {op: 'RTS'},
  ],

  // $5314 — 22.5° — 7 opcodes
  ShipDir16: [
    {op: 'SVEC', scaleMode: 2, bri:  0, dx: -2, dy: -3},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  -384, dy:  +960},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  -672, dy:  +288},
    {op: 'VEC',  localScale: 6, bri: 12, dx:  +808, dy:   +56},
    {op: 'VEC',  localScale: 6, bri: 12, dx:  -608, dy:  -528},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  +288, dy:  +672},
    {op: 'RTS'},
  ],

  // $532C — thrust flame, 22.5° — 3 opcodes
  ThrustDir16: [
    {op: 'VEC',  localScale: 5, bri: 12, dx:  -576, dy:   +48},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  +736, dy:  +864},
    {op: 'RTS'},
  ],

  // $5336 — 28.125° — 7 opcodes
  ShipDir20: [
    {op: 'VEC',  localScale: 4, bri:  0, dx:  -448, dy:  -800},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  -480, dy:  +896},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  -704, dy:  +224},
    {op: 'VEC',  localScale: 6, bri: 12, dx:  +800, dy:  +136},
    {op: 'VEC',  localScale: 6, bri: 12, dx:  -560, dy:  -584},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  +224, dy:  +704},
    {op: 'RTS'},
  ],

  // $5350 — thrust flame, 28.125° — 3 opcodes
  ThrustDir20: [
    {op: 'VEC',  localScale: 5, bri: 12, dx:  -576, dy:   -16},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  +672, dy:  +928},
    {op: 'RTS'},
  ],

  // $535A — 33.75° — 7 opcodes
  ShipDir24: [
    {op: 'VEC',  localScale: 4, bri:  0, dx:  -352, dy:  -864},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  -576, dy:  +864},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  -704, dy:  +128},
    {op: 'VEC',  localScale: 6, bri: 12, dx:  +784, dy:  +216},
    {op: 'VEC',  localScale: 6, bri: 12, dx:  -496, dy:  -640},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  +128, dy:  +704},
    {op: 'RTS'},
  ],

  // $5374 — thrust flame, 33.75° — 3 opcodes
  ThrustDir24: [
    {op: 'VEC',  localScale: 5, bri: 12, dx:  -560, dy:   -64},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  +576, dy:  +992},
    {op: 'RTS'},
  ],

  // $537E — 39.375° — 7 opcodes
  ShipDir28: [
    {op: 'VEC',  localScale: 4, bri:  0, dx:  -256, dy:  -896},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  -640, dy:  +800},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  -736, dy:   +64},
    {op: 'VEC',  localScale: 6, bri: 12, dx:  +760, dy:  +288},
    {op: 'VEC',  localScale: 6, bri: 12, dx:  -432, dy:  -688},
    {op: 'VEC',  localScale: 4, bri: 12, dx:   +64, dy:  +736},
    {op: 'RTS'},
  ],

  // $5398 — thrust flame, 39.375° — 3 opcodes
  ThrustDir28: [
    {op: 'VEC',  localScale: 5, bri: 12, dx:  -560, dy:  -128},
    {op: 'VEC',  localScale: 5, bri: 12, dx:  +240, dy:  +528},
    {op: 'RTS'},
  ],

  // $53A2 — 45° (northeast ↗) — 7 opcodes
  ShipDir32: [
    {op: 'VEC',  localScale: 4, bri:  0, dx:  -192, dy:  -896},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  -736, dy:  +736},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  -736, dy:     0},
    {op: 'VEC',  localScale: 6, bri: 12, dx:  +728, dy:  +360},
    {op: 'VEC',  localScale: 6, bri: 12, dx:  -360, dy:  -728},
    {op: 'VEC',  localScale: 4, bri: 12, dx:     0, dy:  +736},
    {op: 'RTS'},
  ],

  // $53BC — thrust flame, 45° (northeast ↗) — 3 opcodes
  ThrustDir32: [
    {op: 'VEC',  localScale: 5, bri: 12, dx:  -544, dy:  -176},
    {op: 'VEC',  localScale: 5, bri: 12, dx:  +176, dy:  +544},
    {op: 'RTS'},
  ],

  // $53C6 — 50.625° — 7 opcodes
  ShipDir36: [
    {op: 'VEC',  localScale: 4, bri:  0, dx:   -96, dy:  -928},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  -800, dy:  +640},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  -736, dy:   -64},
    {op: 'VEC',  localScale: 6, bri: 12, dx:  +688, dy:  +432},
    {op: 'VEC',  localScale: 6, bri: 12, dx:  -288, dy:  -760},
    {op: 'VEC',  localScale: 4, bri: 12, dx:   -64, dy:  +736},
    {op: 'RTS'},
  ],

  // $53E0 — thrust flame, 50.625° — 3 opcodes
  ThrustDir36: [
    {op: 'VEC',  localScale: 5, bri: 12, dx:  -528, dy:  -240},
    {op: 'VEC',  localScale: 5, bri: 12, dx:  +128, dy:  +560},
    {op: 'RTS'},
  ],

  // $53EA — 56.25° — 7 opcodes
  ShipDir40: [
    {op: 'VEC',  localScale: 4, bri:  0, dx:     0, dy:  -928},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  -864, dy:  +576},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  -704, dy:  -128},
    {op: 'VEC',  localScale: 6, bri: 12, dx:  +640, dy:  +496},
    {op: 'VEC',  localScale: 6, bri: 12, dx:  -216, dy:  -784},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  -128, dy:  +704},
    {op: 'RTS'},
  ],

  // $5404 — thrust flame, 56.25° — 3 opcodes
  ThrustDir40: [
    {op: 'VEC',  localScale: 4, bri: 12, dx:  -992, dy:  -576},
    {op: 'VEC',  localScale: 5, bri: 12, dx:   +64, dy:  +560},
    {op: 'RTS'},
  ],

  // $540E — 61.875° — 7 opcodes
  ShipDir44: [
    {op: 'VEC',  localScale: 4, bri:  0, dx:   +96, dy:  -928},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  -896, dy:  +480},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  -704, dy:  -224},
    {op: 'VEC',  localScale: 6, bri: 12, dx:  +584, dy:  +560},
    {op: 'VEC',  localScale: 6, bri: 12, dx:  -136, dy:  -800},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  -224, dy:  +704},
    {op: 'RTS'},
  ],

  // $5428 — thrust flame, 61.875° — 3 opcodes
  ThrustDir44: [
    {op: 'VEC',  localScale: 4, bri: 12, dx:  -928, dy:  -672},
    {op: 'VEC',  localScale: 5, bri: 12, dx:   +16, dy:  +576},
    {op: 'RTS'},
  ],

  // $5432 — 67.5° — 7 opcodes
  ShipDir48: [
    {op: 'VEC',  localScale: 4, bri:  0, dx:  +192, dy:  -896},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  -960, dy:  +384},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  -672, dy:  -288},
    {op: 'VEC',  localScale: 6, bri: 12, dx:  +528, dy:  +608},
    {op: 'VEC',  localScale: 6, bri: 12, dx:   -56, dy:  -808},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  -288, dy:  +672},
    {op: 'RTS'},
  ],

  // $544C — thrust flame, 67.5° — 3 opcodes
  ThrustDir48: [
    {op: 'VEC',  localScale: 4, bri: 12, dx:  -864, dy:  -736},
    {op: 'VEC',  localScale: 5, bri: 12, dx:   -48, dy:  +576},
    {op: 'RTS'},
  ],

  // $5456 — 73.125° — 7 opcodes
  ShipDir52: [
    {op: 'VEC',  localScale: 4, bri:  0, dx:  +256, dy:  -896},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  -992, dy:  +288},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  -640, dy:  -352},
    {op: 'VEC',  localScale: 6, bri: 12, dx:  +464, dy:  +664},
    {op: 'VEC',  localScale: 6, bri: 12, dx:   +24, dy:  -808},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  -352, dy:  +640},
    {op: 'RTS'},
  ],

  // $5470 — thrust flame, 73.125° — 3 opcodes
  ThrustDir52: [
    {op: 'VEC',  localScale: 4, bri: 12, dx:  -800, dy:  -832},
    {op: 'VEC',  localScale: 5, bri: 12, dx:   -96, dy:  +560},
    {op: 'RTS'},
  ],

  // $547A — 78.75° — 7 opcodes
  ShipDir56: [
    {op: 'VEC',  localScale: 4, bri:  0, dx:  +352, dy:  -864},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  -992, dy:  +192},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  -608, dy:  -416},
    {op: 'VEC',  localScale: 6, bri: 12, dx:  +400, dy:  +704},
    {op: 'VEC',  localScale: 6, bri: 12, dx:  +104, dy:  -800},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  -416, dy:  +608},
    {op: 'RTS'},
  ],

  // $5494 — thrust flame, 78.75° — 3 opcodes
  ThrustDir56: [
    {op: 'VEC',  localScale: 4, bri: 12, dx:  -704, dy:  -896},
    {op: 'VEC',  localScale: 5, bri: 12, dx:  -144, dy:  +560},
    {op: 'RTS'},
  ],

  // $549E — 84.375° — 7 opcodes
  ShipDir60: [
    {op: 'VEC',  localScale: 4, bri:  0, dx:  +448, dy:  -800},
    {op: 'VEC',  localScale: 5, bri: 12, dx:  -512, dy:   +48},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  -544, dy:  -448},
    {op: 'VEC',  localScale: 6, bri: 12, dx:  +328, dy:  +736},
    {op: 'VEC',  localScale: 6, bri: 12, dx:  +176, dy:  -792},
    {op: 'VEC',  localScale: 4, bri: 12, dx:  -448, dy:  +544},
    {op: 'RTS'},
  ],

  // $54B8 — thrust flame, 84.375° — 3 opcodes
  ThrustDir60: [
    {op: 'VEC',  localScale: 4, bri: 12, dx:  -608, dy:  -960},
    {op: 'VEC',  localScale: 5, bri: 12, dx:  -208, dy:  +528},
    {op: 'RTS'},
  ],

  // $54C2 — 90° (north ↑) — 7 opcodes
  ShipDir64: [
    {op: 'SVEC', scaleMode: 2, bri:  0, dx: +2, dy: -3},
    {op: 'SVEC', scaleMode: 3, bri: 12, dx: -2, dy:  0},
    {op: 'SVEC', scaleMode: 3, bri: 12, dx: -1, dy: -1},
    {op: 'VEC',  localScale: 6, bri: 12, dx:  +256, dy:  +768},
    {op: 'VEC',  localScale: 6, bri: 12, dx:  +256, dy:  -768},
    {op: 'SVEC', scaleMode: 3, bri: 12, dx: -1, dy: +1},
    {op: 'RTS'},
  ],

  // $54D4 — thrust flame, 90° (north ↑) — 3 opcodes
  ThrustDir64: [
    {op: 'SVEC', scaleMode: 3, bri: 12, dx: -1, dy: -2},
    {op: 'SVEC', scaleMode: 3, bri: 12, dx: -1, dy: +2},
    {op: 'RTS'},
  ],

  // $54DA — 8 opcodes
  LivesIcon: [
    {op: 'SVEC', scaleMode: 2, bri:  0, dx: -2, dy: -3},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx: +1, dy: -1},
    {op: 'VEC',  localScale: 6, bri:  7, dx:  -256, dy:  +768},
    {op: 'VEC',  localScale: 6, bri:  7, dx:  -256, dy:  -768},
    {op: 'SVEC', scaleMode: 3, bri:  7, dx: +1, dy: +1},
    {op: 'VEC',  localScale: 6, bri:  0, dx:  +640, dy:  +192},
    {op: 'RTS'},
  ],

  // $54F0 — 8 opcodes
  Char_A: [
    {op: 'SVEC', scaleMode: 1, bri:  7, dx:  0, dy: +2},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx: +2, dy: +2},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx: +2, dy: -2},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx:  0, dy: -2},
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: -2, dy: +1},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +2, dy: -2},
    {op: 'RTS'},
  ],

  // $5500 — 13 opcodes
  Char_B: [
    {op: 'SVEC', scaleMode: 1, bri:  7, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx: +3, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx: +1, dy: -1},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx:  0, dy: -1},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx: -1, dy: -1},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx: -3, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +3, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx: +1, dy: -1},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx:  0, dy: -1},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx: -1, dy: -1},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx: -3, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: +3, dy:  0},
    {op: 'RTS'},
  ],

  // $551A — 6 opcodes
  Char_C: [
    {op: 'SVEC', scaleMode: 1, bri:  7, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: -2, dy: -3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +2, dy:  0},
    {op: 'RTS'},
  ],

  // $5526 — 8 opcodes
  Char_D: [
    {op: 'SVEC', scaleMode: 1, bri:  7, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx: +2, dy: -2},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx:  0, dy: -2},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx: -2, dy: -2},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx: -2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: +3, dy:  0},
    {op: 'RTS'},
  ],

  // $5536 — 8 opcodes
  Char_E: [
    {op: 'SVEC', scaleMode: 1, bri:  7, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: -1, dy: -3},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx: -3, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx:  0, dy: -3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +2, dy:  0},
    {op: 'RTS'},
  ],

  // $5546 — 7 opcodes
  Char_F: [
    {op: 'SVEC', scaleMode: 1, bri:  7, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: -1, dy: -3},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx: -3, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx:  0, dy: -3},
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: +3, dy:  0},
    {op: 'RTS'},
  ],

  // $5554 — 9 opcodes
  Char_G: [
    {op: 'SVEC', scaleMode: 1, bri:  7, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx:  0, dy: -2},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: -2, dy: -2},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx:  0, dy: -2},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: -2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: +3, dy:  0},
    {op: 'RTS'},
  ],

  // $5566 — 7 opcodes
  Char_H: [
    {op: 'SVEC', scaleMode: 1, bri:  7, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx:  0, dy: -3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx:  0, dy: -3},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +2, dy:  0},
    {op: 'RTS'},
  ],

  // $5574 — 7 opcodes
  Char_I: [
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: -2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: -2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: +3, dy: -3},
    {op: 'RTS'},
  ],

  // $5582 — 6 opcodes
  Char_J: [
    {op: 'SVEC', scaleMode: 0, bri:  0, dx:  0, dy: +2},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx: +2, dy: -2},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: +1, dy: -3},
    {op: 'RTS'},
  ],

  // $558E — 6 opcodes
  Char_K: [
    {op: 'SVEC', scaleMode: 1, bri:  7, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +3, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx: -3, dy: -3},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx: +3, dy: -3},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +3, dy:  0},
    {op: 'RTS'},
  ],

  // $559A — 5 opcodes
  Char_L: [
    {op: 'SVEC', scaleMode: 1, bri:  0, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx:  0, dy: -3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +2, dy:  0},
    {op: 'RTS'},
  ],

  // $55A4 — 6 opcodes
  Char_M: [
    {op: 'SVEC', scaleMode: 1, bri:  7, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx: +2, dy: -2},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx: +2, dy: +2},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx:  0, dy: -3},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +2, dy:  0},
    {op: 'RTS'},
  ],

  // $55B0 — 5 opcodes
  Char_N: [
    {op: 'SVEC', scaleMode: 1, bri:  7, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: +2, dy: -3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: +1, dy: -3},
    {op: 'RTS'},
  ],

  // $55BA — 6 opcodes
  Char_O: [
    {op: 'SVEC', scaleMode: 1, bri:  7, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx:  0, dy: -3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: -2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: +3, dy:  0},
    {op: 'RTS'},
  ],

  // $55C6 — 7 opcodes
  Char_P: [
    {op: 'SVEC', scaleMode: 1, bri:  7, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx:  0, dy: -3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: -2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +3, dy: -3},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +3, dy:  0},
    {op: 'RTS'},
  ],

  // $55D4 — 9 opcodes
  Char_Q: [
    {op: 'SVEC', scaleMode: 1, bri:  7, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx:  0, dy: -2},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx: -2, dy: -2},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx: -2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +2, dy: +2},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx: +2, dy: -2},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +2, dy:  0},
    {op: 'RTS'},
  ],

  // $55E6 — 8 opcodes
  Char_R: [
    {op: 'SVEC', scaleMode: 1, bri:  7, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx:  0, dy: -3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: -2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +1, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx: +3, dy: -3},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +2, dy:  0},
    {op: 'RTS'},
  ],

  // $55F6 — 7 opcodes
  Char_S: [
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: -2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: +1, dy: -3},
    {op: 'RTS'},
  ],

  // $5604 — 6 opcodes
  Char_T: [
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: -2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: +1, dy: -3},
    {op: 'RTS'},
  ],

  // $5610 — 6 opcodes
  Char_U: [
    {op: 'SVEC', scaleMode: 1, bri:  0, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx:  0, dy: -3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: +1, dy: -3},
    {op: 'RTS'},
  ],

  // $561C — 5 opcodes
  Char_V: [
    {op: 'SVEC', scaleMode: 1, bri:  0, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: +1, dy: -3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: +1, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: +1, dy: -3},
    {op: 'RTS'},
  ],

  // $5626 — 7 opcodes
  Char_W: [
    {op: 'SVEC', scaleMode: 1, bri:  0, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx:  0, dy: -3},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx: +2, dy: +2},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx: +2, dy: -2},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: +1, dy: -3},
    {op: 'RTS'},
  ],

  // $5634 — 5 opcodes
  Char_X: [
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: +2, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: -2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: +2, dy: -3},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +2, dy:  0},
    {op: 'RTS'},
  ],

  // $563E — 7 opcodes
  Char_Y: [
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx:  0, dy: +2},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx: -2, dy: +2},
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx: -2, dy: -2},
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: +2, dy: -2},
    {op: 'RTS'},
  ],

  // $564C — 6 opcodes
  Char_Z: [
    {op: 'SVEC', scaleMode: 1, bri:  0, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: -2, dy: -3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +2, dy:  0},
    {op: 'RTS'},
  ],

  // $5658 — 2 opcodes
  Char_Space: [
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: +3, dy:  0},
    {op: 'RTS'},
  ],

  // $565C — 4 opcodes
  Char_1: [
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: +2, dy: -3},
    {op: 'RTS'},
  ],

  // $5664 — 8 opcodes
  Char_2: [
    {op: 'SVEC', scaleMode: 1, bri:  0, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx:  0, dy: -3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: -2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx:  0, dy: -3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +2, dy:  0},
    {op: 'RTS'},
  ],

  // $5674 — 7 opcodes
  Char_3: [
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: -2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx:  0, dy: -3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +2, dy: -3},
    {op: 'RTS'},
  ],

  // $5682 — 7 opcodes
  Char_4: [
    {op: 'SVEC', scaleMode: 1, bri:  0, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx:  0, dy: -3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx:  0, dy: -3},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +2, dy:  0},
    {op: 'RTS'},
  ],

  // $5690 — 7 opcodes
  Char_5: [
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: -2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: +1, dy: -3},
    {op: 'RTS'},
  ],

  // $569E — 7 opcodes
  Char_6: [
    {op: 'SVEC', scaleMode: 0, bri:  0, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx:  0, dy: -3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: -2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: +3, dy: -3},
    {op: 'RTS'},
  ],

  // $56AC — 5 opcodes
  Char_7: [
    {op: 'SVEC', scaleMode: 1, bri:  0, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx:  0, dy: -3},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +2, dy:  0},
    {op: 'RTS'},
  ],

  // $56B6 — 8 opcodes
  Char_8: [
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: -2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx:  0, dy: -3},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +2, dy: -3},
    {op: 'RTS'},
  ],

  // $56C6 — 7 opcodes
  Char_9: [
    {op: 'SVEC', scaleMode: 1, bri:  0, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx:  0, dy: +3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: -2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  7, dx:  0, dy: -3},
    {op: 'SVEC', scaleMode: 1, bri:  7, dx: +2, dy:  0},
    {op: 'SVEC', scaleMode: 0, bri:  0, dx: +2, dy: -3},
    {op: 'RTS'},
  ],
};

// Ship-explosion piece velocity table — CPU $50EC-$50F6 (6 × 2 bytes,
// signed). Paired with the 6 SVECs of VROM.ShipExplosion: one (svec, vel)
// per fragment. Cabinet animator (un-disasm CPU region near RAM $7D-$94)
// holds independent positions per fragment, advances by vx/vy each frame,
// and emits LABS+SVEC per fragment in the per-frame display list.
export const SHIP_EXPLOSION_VELOCITY = [
  {vx: -40, vy: +30},  // fragment 0
  {vx: +50, vy: -20},  // fragment 1
  {vx:   0, vy: -60},  // fragment 2
  {vx: +60, vy: +20},  // fragment 3
  {vx: +10, vy: +70},  // fragment 4
  {vx: -40, vy: -40},  // fragment 5
];
