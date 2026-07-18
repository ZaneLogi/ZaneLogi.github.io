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
export const BTN_SS = BTN.Start | BTN.Select;                     // $0C con_btns_SS

// --- Facing — the low nibble of ram_tank_flags ---
// bank_val.inc names the BUTTONS but not the directions; these values are
// sub_E451_convert_Dpad_buttons' own returns ($E466/$E45A/$E460/$E454), and $C9CE
// seeds the menu cursor with con_tank_flag_80 + $03, i.e. alive + facing RIGHT.
export const DIR = Object.freeze({
  UP: 0, LEFT: 1, DOWN: 2, RIGHT: 3,
  NONE: -1,   // $E469 returns $FF and callers test N; `< 0` is the JS equivalent.
});

// Per-direction step, indexed by DIR — tbl_E46C (dx, $E46C) / tbl_E470 (dy, $E470).
// A tank moves ONE pixel per processed move step; a bullet scales these up.
export const DIR_DX = [0, -1, 0, 1];   // UP 0, LEFT $FF, DOWN 0, RIGHT $01
export const DIR_DY = [-1, 0, 1, 0];   // UP $FF, LEFT 0, DOWN $01, RIGHT 0

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

// Player spawn points — tbl_E47A_player_spawn_pos_X / tbl_E47C_player_spawn_pos_Y
// ($E47A/$E47C), read by sub_E363. These are tank CENTRE coords (the sprite spans
// x-8..x+7, y-8..y+7), so P1 sits just left of the eagle at ($78,$D8).
export const PLAYER_SPAWN = [
  { x: 0x58, y: 0xD8 },   // P1
  { x: 0x98, y: 0xD8 },   // P2
];

// Spawn (helmet) invincibility: sub_E3B8 ($E3C1-$E3C3) seeds 3; sub_E27C DECs it
// every 64 frames, so ~192 frames (~3.2 s) of shield after materializing.
export const HELMET_TIMER_INIT = 0x03;

// Ice slide budget — the low 7 bits of the $9C the ROM writes to ram_0103_plr_flags
// when a player presses on ice ($DBBD). The counter DECs one per processed slide
// frame ($DC5F) until 0; its bit4 ($10) is the input LOCK — while set the pad is
// ignored and the tank commits to sliding ($DB99). Re-derived into Tank.slideTimer.
export const SLIDE_ARM = 0x1C;      // $9C & $7F
export const SLIDE_LOCK_BIT = 0x10; // $DB99 AND #$10 — bit4

// --- ram_game_mode ($83) — the index into tbl_CA69_game_mode_handler ($CA69) ---
// The handlers differ only in ram_enemy_limit: 1P = con_max_tanks - 2 = 5 ($CA6F),
// 2P = con_max_tanks = 7 ($CA74). Both then JMP loc_C159 — there is no separate
// 2P loop. See docs/research_game_flow.md §2.
export const GAME_MODE = Object.freeze({
  ONE_PLAYER: 0, TWO_PLAYERS: 1, CONSTRUCTION: 2,
});

// --- ram_2nd_loop_flag ($46) — THREE states, not a boolean ---
// The name undersells it: bank_val.inc's `con_flag_demo = $02 ; stored in
// ram_2nd_loop_flag` means one variable carries both "which loop" and "is this the
// attract demo". $C391 tests `CMP #$01` specifically, so DEMO ($02) does NOT take
// the 2nd-loop path. Flow doc §4 [9], §5.
export const SECOND_LOOP = Object.freeze({
  FIRST: 0, SECOND: 1, DEMO: 2,   // con_flag_demo = $02
});

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
  BORDER: 0x11,       // the indestructible grey tile $D7CC fills the field with; it
                      // surrounds the 26x26 play grid and is reused as the curtain
                      // ($CC90) and " " in text. Solid ($11 < $20) -> blocks tanks.
  WATER: 0x12,
  BLANK_STEEL: 0x20,  // the empty quarters of a half-STEEL block. Byte-identical
                      // to BLANK ($00) in CHR -- both all-zero. Colour index 0 is
                      // the universal backdrop in every palette, so they render
                      // the same; the table just uses $20 to pair with $10.
  ICE: 0x21,
  FOREST: 0x22,
});

// isPassable threshold ($DCD5). A tank drives over $00 (empty) and anything >= $20
// (BLANK_STEEL $20, ICE $21, FOREST $22); every SOLID tile sits in $01-$1F (brick
// $01-$0F, steel $10, grey border $11, water $12). The tile ids were ARRANGED so a
// single magnitude compare classifies terrain — see field.js isPassable.
export const TILE_DRIVE_OVER_MIN = 0x20;

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

// Where the play grid sits in the 32x30 nametable. sub_F000_draw_stage draws the
// first block at pixel (16,16), i.e. tile (2,2) (ram_0056/ram_0057 init $10, step
// $10); sub_D7CC clears the 26x26 grid from pointer $0442 = row 2, col 2. Everything
// outside is the $11 grey border.
export const FIELD_ORIGIN_COL = 2;
export const FIELD_ORIGIN_ROW = 2;

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
