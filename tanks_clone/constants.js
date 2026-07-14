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

// --- Terrain / block types (tbl_DACB_block_data) ---
// TODO: decode block ids from tbl_DACB + F000_draw_stage. Known so far:
//   ice block == con_block_type + $21 (from E181_ice_detection).
export const TERRAIN = Object.freeze({
  // BRICK, STEEL, WATER, TREES, ICE, EMPTY — values TBD
  ICE: 0x21,
});

// --- Bonus / power-up ids (ram_bonus_id) ---
// TODO: decode from E8BE_spawn_bonus / E972_try_to_pick_up_bonus.

// NES display geometry
export const SCREEN_W = 256;
export const SCREEN_H = 240;
