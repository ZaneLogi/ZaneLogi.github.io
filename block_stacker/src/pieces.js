// pieces.js — piece shape/rotation/spawn tables, ported verbatim from the NES ROM.
// Source: C:\Z_Temp\TetrisNESDisasm\main.asm. Format is a registry indexed by
// orientation id (0x00..0x13); each is a plain data entry (see ../docs/research_gameplay.md §2).

import { TILE1, TILE2, TILE3, TILE_HIDDEN, ORI, PIECE } from './constants.js';

// --- orientationTable (main.asm:1759-1788) ---
// Each orientation: a uniform `tile` (color group) + 4 minos as [dy, dx] offsets
// from the center block. Source stores [yOff, tileID, xOff] per mino; the tile is
// constant within a piece, so we hoist it. Verified against the decoded grids.
export const ORIENTATIONS = [
  /* 0x00 t up      */ { tile: TILE1, cells: [[0,-1],[0,0],[0,1],[-1,0]] },
  /* 0x01 t right   */ { tile: TILE1, cells: [[-1,0],[0,0],[0,1],[1,0]] },
  /* 0x02 t down  ★ */ { tile: TILE1, cells: [[0,-1],[0,0],[0,1],[1,0]] },
  /* 0x03 t left    */ { tile: TILE1, cells: [[-1,0],[0,-1],[0,0],[1,0]] },
  /* 0x04 j left    */ { tile: TILE3, cells: [[-1,0],[0,0],[1,-1],[1,0]] },
  /* 0x05 j up      */ { tile: TILE3, cells: [[-1,-1],[0,-1],[0,0],[0,1]] },
  /* 0x06 j right   */ { tile: TILE3, cells: [[-1,0],[-1,1],[0,0],[1,0]] },
  /* 0x07 j down  ★ */ { tile: TILE3, cells: [[0,-1],[0,0],[0,1],[1,1]] },
  /* 0x08 z horiz ★ */ { tile: TILE2, cells: [[0,-1],[0,0],[1,0],[1,1]] },
  /* 0x09 z vert    */ { tile: TILE2, cells: [[-1,1],[0,0],[0,1],[1,0]] },
  /* 0x0A o       ★ */ { tile: TILE1, cells: [[0,-1],[0,0],[1,-1],[1,0]] },
  /* 0x0B s horiz ★ */ { tile: TILE3, cells: [[0,0],[0,1],[1,-1],[1,0]] },
  /* 0x0C s vert    */ { tile: TILE3, cells: [[-1,0],[0,0],[0,1],[1,1]] },
  /* 0x0D l right   */ { tile: TILE2, cells: [[-1,0],[0,0],[1,0],[1,1]] },
  /* 0x0E l down  ★ */ { tile: TILE2, cells: [[0,-1],[0,0],[0,1],[1,-1]] },
  /* 0x0F l left    */ { tile: TILE2, cells: [[-1,-1],[-1,0],[0,0],[1,0]] },
  /* 0x10 l up      */ { tile: TILE2, cells: [[-1,1],[0,-1],[0,0],[0,1]] },
  /* 0x11 i vert    */ { tile: TILE1, cells: [[-2,0],[-1,0],[0,0],[1,0]] },
  /* 0x12 i horiz ★ */ { tile: TILE1, cells: [[0,-2],[0,-1],[0,0],[0,1]] },
  /* 0x13 hidden    */ { tile: TILE_HIDDEN, cells: [[0,0],[0,0],[0,0],[0,0]] },
];

// --- rotationTable (main.asm:1503-1528) ---
// Indexed by current orientation -> [ ccwTarget (B), cwTarget (A) ].
// S/Z/I map both A and B to the same toggle (2-state pieces).
export const ROTATION = [
  /* 0x00 tUp    */ [ORI.tLeft, ORI.tRight],
  /* 0x01 tRight */ [ORI.tUp, ORI.tDown],
  /* 0x02 tDown  */ [ORI.tRight, ORI.tLeft],
  /* 0x03 tLeft  */ [ORI.tDown, ORI.tUp],
  /* 0x04 jLeft  */ [ORI.jDown, ORI.jUp],
  /* 0x05 jUp    */ [ORI.jLeft, ORI.jRight],
  /* 0x06 jRight */ [ORI.jUp, ORI.jDown],
  /* 0x07 jDown  */ [ORI.jRight, ORI.jLeft],
  /* 0x08 zHoriz */ [ORI.zVert, ORI.zVert],
  /* 0x09 zVert  */ [ORI.zHoriz, ORI.zHoriz],
  /* 0x0A oFixed */ [ORI.oFixed, ORI.oFixed],
  /* 0x0B sHoriz */ [ORI.sVert, ORI.sVert],
  /* 0x0C sVert  */ [ORI.sHoriz, ORI.sHoriz],
  /* 0x0D lRight */ [ORI.lUp, ORI.lDown],
  /* 0x0E lDown  */ [ORI.lRight, ORI.lLeft],
  /* 0x0F lLeft  */ [ORI.lDown, ORI.lUp],
  /* 0x10 lUp    */ [ORI.lLeft, ORI.lRight],
  /* 0x11 iVert  */ [ORI.iHoriz, ORI.iHoriz],
  /* 0x12 iHoriz */ [ORI.iVert, ORI.iVert],
];

// --- spawnTable (main.asm:3013) — piece type (0..6) -> spawn orientation ---
export const SPAWN_TABLE = [
  ORI.tDown,  // PIECE.T
  ORI.jDown,  // PIECE.J
  ORI.zHoriz, // PIECE.Z
  ORI.oFixed, // PIECE.O
  ORI.sHoriz, // PIECE.S
  ORI.lDown,  // PIECE.L
  ORI.iHoriz, // PIECE.I
];

// --- spawnOrientationFromOrientation (main.asm:3021) — any orientation -> its piece's spawn orientation ---
export const SPAWN_ORIENTATION = [
  ORI.tDown, ORI.tDown, ORI.tDown, ORI.tDown,   // T
  ORI.jDown, ORI.jDown, ORI.jDown, ORI.jDown,   // J
  ORI.zHoriz, ORI.zHoriz,                       // Z
  ORI.oFixed,                                   // O
  ORI.sHoriz, ORI.sHoriz,                       // S
  ORI.lDown, ORI.lDown, ORI.lDown, ORI.lDown,   // L
  ORI.iHoriz, ORI.iHoriz,                       // I
];

// --- tetriminoTypeFromOrientation (main.asm:3005) — orientation -> piece type ---
export const TYPE_FROM_ORIENTATION = [
  PIECE.T, PIECE.T, PIECE.T, PIECE.T,
  PIECE.J, PIECE.J, PIECE.J, PIECE.J,
  PIECE.Z, PIECE.Z,
  PIECE.O,
  PIECE.S, PIECE.S,
  PIECE.L, PIECE.L, PIECE.L, PIECE.L,
  PIECE.I, PIECE.I,
];
