// constants.js — scalar constants + enums, ported from the NES disassembly.
// Source: C:\Z_Temp\TetrisNESDisasm\  (constants.asm, tetris-ram.asm).
// See ../docs/research_gameplay.md.

// --- Board dimensions (tetris-ram.asm:170 — playfield .res $C8 = 200 = 10x20) ---
export const COLS = 10;
export const ROWS = 20;

// --- Tile values (constants.asm:104-109). A cell < TILE_EMPTY is "occupied". ---
export const TILE_EMPTY  = 0xEF; // blank square
export const TILE1       = 0x7B; // color group {T, O, I}
export const TILE2       = 0x7C; // color group {Z, L}
export const TILE3       = 0x7D; // color group {J, S}
export const TILE_HIDDEN = 0xFF; // used during clear/curtain animations

// --- Piece type IDs (constants.asm:111-118) ---
export const PIECE = { T: 0, J: 1, Z: 2, O: 3, S: 4, L: 5, I: 6 };

// --- Orientation IDs (constants.asm:120-140). 19 states + hidden. ---
export const ORI = {
  tUp: 0x00, tRight: 0x01, tDown: 0x02, tLeft: 0x03,
  jLeft: 0x04, jUp: 0x05, jRight: 0x06, jDown: 0x07,
  zHoriz: 0x08, zVert: 0x09,
  oFixed: 0x0A,
  sHoriz: 0x0B, sVert: 0x0C,
  lRight: 0x0D, lDown: 0x0E, lLeft: 0x0F, lUp: 0x10,
  iVert: 0x11, iHoriz: 0x12,
  hidden: 0x13,
};

// --- Spawn position (main.asm:2925-2928 / initGameState main.asm:1203-1207) ---
export const SPAWN_X = 5;
export const SPAWN_Y = 0;

// --- DAS (constants.asm:87-96, NTSC). 16-frame charge, then repeat every 6. ---
export const DAS_DELAY = 0x0A; // 10 — recharge point after a repeat fires
export const DAS_RESET = 0x10; // 16 — fully-charged threshold

// --- Soft-drop lockout seed (constants.asm:94, NTSC). bit7 set => start lockout. ---
export const INITIAL_AUTOREPEAT_Y = 0xA0;

// --- Controller bit masks (constants.asm:39-46) ---
export const BTN = {
  A: 0x80, B: 0x40, SELECT: 0x20, START: 0x10,
  UP: 0x08, DOWN: 0x04, LEFT: 0x02, RIGHT: 0x01,
  DPAD: 0x0F,           // Up|Down|Left|Right (BUTTON_DPAD)
  LEFT_RIGHT: 0x03,     // Left|Right
};

// --- Gravity: frames-per-row by level (main.asm:1608-1611, NTSC).
//     Levels >= 29 are not in the table -> speed 1 (kill screen). ---
export const FRAMES_PER_DROP = [
  0x30, 0x2B, 0x26, 0x21, 0x1C, 0x17, 0x12, 0x0D, // lv 0-7
  0x08, 0x06, 0x05, 0x05, 0x05, 0x04, 0x04, 0x04, // lv 8-15
  0x03, 0x03, 0x03, 0x02, 0x02, 0x02, 0x02, 0x02, // lv 16-23
  0x02, 0x02, 0x02, 0x02, 0x02, 0x01,             // lv 24-29
];

// framesPerDrop for a given level, with the >=29 -> 1 rule (main.asm:1586-1590).
export function framesPerDrop(level) {
  return level < FRAMES_PER_DROP.length ? FRAMES_PER_DROP[level] : 1;
}

// --- Frame rate. NES logic ticks at the NTSC vblank rate (main.asm:248 NMI). ---
export const NTSC_FPS = 60.0988;
