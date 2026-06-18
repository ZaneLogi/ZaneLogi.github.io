// Moongate ROM tables — extracted VERBATIM from u6-decompiled (the moongate
// subsystem's static data). These are link-time constants in GAME.EXE, not save
// state, so they live here as frozen tables (the I-moongate "a — Data" sub-step;
// see docs/research_moongate.md + docs/progress.md §"I-moongate scope").
//
// Object / tile numbers used by the subsystem (obj.h / tile.h):
export const OBJ_MOONSTONE = 0x049;   // OBJ_049 — 8 phase glyphs (TIL_248..24F), frame = lunar phase
export const OBJ_RED_GATE  = 0x054;   // OBJ_054 — single-use red gate (TIL_25A/25B)
export const OBJ_BLUE_GATE = 0x055;   // OBJ_055 — phase-routed blue gate (TIL_25C left / 25D right, 2-wide)
export const OBJ_ORB       = 0x057;   // OBJ_057 — Orb of the Moons (TIL_25F)

// Sky-strip tiles (tile.h) — used by the sky view (sub-step h, seg_2FC1.c:677).
export const TIL_SKY_BASE   = 0x19B;  // backdrop row
export const TIL_MOUNTAIN_0 = 0x160;  // mountain ridge, +0..8 across 9 columns
export const TIL_SUN_DUSK   = 0x169;  // dawn/dusk sun
export const TIL_SUN_DAY    = 0x16A;  // daytime sun
export const TIL_SUN_ECLIPSE = 0x16B; // eclipse sun
export const TIL_CAVE_0     = 0x174;  // cave backdrop: col 0
export const TIL_CAVE_1     = 0x175;  // cave backdrop: cols 1..7
export const TIL_CAVE_2     = 0x176;  // cave backdrop: col 8 (right edge)

// D_2C4A.c:29-38 — D_2C74[8][3] /*moonstones x, y, z*/. The blue network's 8
// endpoints, indexed by lunar phase (= moonstone frame). The COMPILED default the
// clone seeds at new-game-init (a factory objlist ships this all-zero; U6's external
// char-creation writes these constants — research_moongate.md §8.1). Seven on the
// surface (z=0); slot 6 is in a dungeon (z=1). This is the y-value default — the
// placed moonstone OBJECTS sit one tile south (y+1), an authoring offset (§8.1).
export const D_2C74_DEFAULTS = Object.freeze([
  [0x3A7, 0x106, 0],
  [0x1F7, 0x166, 0],
  [0x09F, 0x3AE, 0],
  [0x127, 0x026, 0],
  [0x33F, 0x0A6, 0],
  [0x147, 0x336, 0],
  [0x017, 0x016, 1],
  [0x397, 0x3A6, 0],
]);

// seg_0A33.c:684-713 — D_036A[28][2] /*moon slot calendar*/. Per day-of-month
// (1..28), the [Trammel, Felucca] endpoint SLOT (0..7). Trammel advances ~1 slot /
// 2 days; Felucca cycles ~3x faster. Indexed [Date_D - 1].
export const D_036A = Object.freeze([
  [0, 0], [7, 0], [7, 7], [6, 6], [6, 5], [5, 4], [5, 3],
  [4, 2], [3, 1], [3, 0], [2, 0], [2, 7], [1, 6], [1, 5],
  [0, 4], [7, 3], [7, 2], [6, 1], [6, 0], [5, 0], [5, 7],
  [4, 6], [3, 5], [3, 4], [2, 3], [2, 2], [1, 1], [1, 0],
]);

// seg_1E0F.c:12-34 — the red gate's fixed-ROM destination web. Three parallel
// 25-entry arrays (X / Y / Z), indexed by the cast cell's Qual-1. Immutable. Indices
// 10/11/12/13 hold (0,0,0) padding that the cast handler remaps to a dead "stay-put"
// gate before they can index here (research_moongate.md §2.2).
export const D_171C = Object.freeze([   // red gate X
  0x383, 0x3A7, 0x1B3, 0x1F7, 0x093,
  0x397, 0x044, 0x133, 0x0BC, 0x09F,
  0x2E3, 0,     0,     0,     0x0E3,
  0x017, 0x080, 0x06C, 0x39B, 0x127,
  0x04B, 0x147, 0x183, 0x33F, 0x29B,
]);
export const D_174E = Object.freeze([   // red gate Y
  0x1F3, 0x106, 0x18B, 0x166, 0x373,
  0x3A6, 0x02D, 0x160, 0x02D, 0x3AE,
  0x2BB, 0,     0,     0,     0x083,
  0x016, 0x056, 0x0DD, 0x36C, 0x026,
  0x1FB, 0x336, 0x313, 0x0A6, 0x043,
]);
export const D_1780 = Object.freeze([   // red gate Z
  0, 0, 0, 0, 0,
  0, 5, 0, 5, 0,
  0, 0, 0, 0, 0,
  1, 5, 5, 0, 0,
  0, 0, 0, 0, 0,
]);

// seg_2FC1.c:675 — D_2BFA[15] /*sun, moons' y*/. The sky arc: vertical pixel offset
// for a sun/moon at horizontal index 0..14 (lower = higher in the sky; the zenith at
// indices 6/7/8 is y=0). Used by the sky view (sub-step h).
export const D_2BFA = Object.freeze([10, 7, 5, 3, 2, 1, 0, 0, 0, 1, 2, 3, 5, 7, 10]);

// Midnight blue-gate override destination — Shrine of Spirituality at (0x018,0x01d,1)
// (seg_1E0F.c:732, the 00:00-00:09 special case).
export const SHRINE_OF_SPIRITUALITY = Object.freeze([0x018, 0x01D, 1]);
