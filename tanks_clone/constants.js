// constants.js — ported from bank_val.inc
//
// Global constants for the Battle City port. Values are the source's own,
// kept verbatim so ported routines read 1:1 against the disassembly.
// See docs/research_system_interaction_map.md.

// --- Joypad bits (ram_btn_hold / ram_btn_press) — con_btn_* ---
export const BTN = Object.freeze({
  Right: 0x80, Left: 0x40, Down: 0x20, Up: 0x10,
  Start: 0x08, Select: 0x04, B: 0x02, A: 0x01,
});
export const BTN_DPAD = BTN.Right | BTN.Left | BTN.Down | BTN.Up; // $F0
export const BTN_AB = BTN.A | BTN.B;                              // $03

// --- Tank state — high nibble of ram_tank_flags (con_tank_flag_*) ---
// tank_handler ($DEB8) dispatches on (flags >> 3) & $FE via tbl_E4B8.
// "live & drivable" == flags >= $80 && flags < $E0 (see map §4).
export const TANK_STATE = Object.freeze({
  KILL_POINTS: 0x10,       // points popup after a kill
  EXPLODE_20: 0x20, EXPLODE_30: 0x30, EXPLODE_40: 0x40,
  EXPLOSION: 0x70,         // con_tank_flag_explosion
  NORMAL_80: 0x80, NORMAL_90: 0x90, NORMAL_A0: 0xA0,
  FOLLOW_HQ: 0xB0,         // enemy AI target bias
  FOLLOW_P2: 0xC0,
  FOLLOW_P1: 0xD0,
  E0: 0xE0,
  RESPAWN: 0xF0,           // con_tank_flag_respawn
});

// Slot roster (decoded): 0=P1, 1=P2, 2..7=enemies. con_max_tanks=$07.
export const MAX_TANKS = 8;
export const PLAYER_SLOTS = 2;
export const ENEMIES_PER_STAGE = 0x14; // 20, seeded in $C331

// --- Terrain: TWO namespaces, do not mix them ---
//
// This is the trap the old TODO here was sitting on. A stage file and the live
// field speak different languages:
//
//   BLOCK code  $0-$D, one nibble per 16x16 block. What incbin/stages/*.bin
//               stores. Indexes tbl_DACB_block_data ($DACB) -> the block's four
//               8x8 TILE ids, and tbl_DABB_nametable_attribute ($DABB) -> its
//               BG palette. 14 codes; $E/$F unused (never appear in any stage).
//
//   TILE id     what the FIELD BUFFER ($0400, a full nametable mirror) actually
//               holds, 2x2 of them per block. This is what gameplay reads back:
//               $E181_ice_detection compares TILE $21, and $DA2B's sprite-vs-
//               forest priority probe compares TILE $22 (con_block_type = $00).
//
// So a stage decodes BLOCK -> 4 TILEs at draw time; collision then reads TILEs.
// The old `TERRAIN.ICE = 0x21` was a TILE id, correctly -- kept below as TILE.ICE.
export const TILE = Object.freeze({
  BLANK: 0x00,        // used for the empty quarters of a half-BRICK block
  BRICK: 0x0F,
  STEEL: 0x10,        // "concrete" in the tbl_DACB comments
  WATER: 0x12,
  BLANK_STEEL: 0x20,  // the empty quarters of a half-STEEL block. Byte-identical
                      // to BLANK ($00) in CHR -- both all-zero. Colour index 0 is
                      // the universal backdrop in every palette, so they render
                      // the same; the table just uses $20 to pair with $10.
  ICE: 0x21,
  FOREST: 0x22,
});

// Block codes, in tbl_DACB order. Half-blocks name the half that is SOLID.
export const BLOCK = Object.freeze({
  BRICK_RIGHT: 0x0, BRICK_BOTTOM: 0x1, BRICK_LEFT: 0x2, BRICK_TOP: 0x3,
  BRICK: 0x4,
  STEEL_RIGHT: 0x5, STEEL_BOTTOM: 0x6, STEEL_LEFT: 0x7, STEEL_TOP: 0x8,
  STEEL: 0x9,
  WATER: 0xA, FOREST: 0xB, ICE: 0xC, EMPTY: 0xD,
});

// Stage geometry (decoded; closes map §8's first [?]).
// 13x13 blocks of 16x16px = 208x208, each block 2x2 tiles of 8x8 = 26x26 quarters.
export const STAGE_COLS = 13;
export const STAGE_ROWS = 13;
export const BLOCK_PX = 16;

// --- Bonus / power-up ids (ram_bonus_id) ---
// TODO: decode from E8BE_spawn_bonus / E972_try_to_pick_up_bonus.

// NES display geometry
export const SCREEN_W = 256;
export const SCREEN_H = 240;

// --- Frame rate ---
// Not a value the ROM chooses: the PPU's vblank NMI IS the clock. The main loop
// just sleeps on it (sub_D8F6_wait_1_frm, $D8F6, spins until the NMI bumps
// ram_frm_cnt_lo at $D43C), and the battle loop calls that exactly once per pass
// ($C1F9) -- so one logic pass == one frame. Famicom => NTSC.
// rAF runs at the DISPLAY rate (60/120/144), so logic needs a fixed-timestep
// accumulator against this, not one tick per rAF. See map §1.
export const NTSC_FPS = 60.0988;
