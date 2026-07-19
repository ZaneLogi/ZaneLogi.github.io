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
  EXPLODE_50: 0x50, EXPLODE_60: 0x60,
  EXPLOSION: 0x70,         // con_tank_flag_explosion — the hit sets flags = $73
  NORMAL_80: 0x80, NORMAL_90: 0x90, NORMAL_A0: 0xA0,
  FOLLOW_HQ: 0xB0,         // enemy AI target bias
  FOLLOW_P2: 0xC0,
  FOLLOW_P1: 0xD0,
  E0: 0xE0,
  RESPAWN: 0xF0,           // con_tank_flag_respawn
});

// --- Tank explosion (P10) — research_enemy_combat.md §3/§4 ---
// The blast drawn per explosion state, as [dx, dy, tile] groups relative to the tank
// centre (x, y). Each group is two 8x16 sprites (sub_DA7B: tile @ gx-8, tile+2 @ gx),
// palette 3. Same tile family as the P8 base explosion (base.js), centred on the tank
// instead of the eagle: $F1/$F5/$F9 single (sub_DEE2, $70/$60/$50 & $20), $D1../$E1..
// four-group (sub_DF99, $40/$30). $10 is the kill-points popup (S8-B), drawn separately.
export const TANK_EXPLOSION_FRAMES = {
  0x70: [[0, 0, 0xF1]],
  0x60: [[0, 0, 0xF5]],
  0x50: [[0, 0, 0xF9]],
  0x40: [[-8, -8, 0xD1], [8, -8, 0xD5], [-8, 8, 0xD9], [8, 8, 0xDD]],
  0x30: [[-8, -8, 0xE1], [8, -8, 0xE5], [-8, 8, 0xE9], [8, 8, 0xED]],
  0x20: [[0, 0, 0xF9]],
};
// ofs_000_DDEA phase countdown (the flags byte's low nibble): 3 ticks per phase,
// 6 at the $10 kill-points phase (ORA #$03 / ORA #$06). The hit sets flags = $73.
export const EXPLOSION_PHASE_TICKS = 3;
export const KILL_POINTS_TICKS = 6;
export const EXPLOSION_PALETTE = 0x03;   // $DEF5 / $DF16 STA spr_A_palette
// Points a kill awards, per enemy-type index (basic/fast/power/armour). tbl_E8BA
// ($E8BA) stores these as $10/$20/$30/$40; sub_D9E1 decodes each byte as hundreds
// (hi nibble) + tens (lo), so $10 -> 100. The port keeps scores as ints, so we store
// the decimal value directly. Indexed by (type>>5)-4 ($E7FD). S8-B.
export const ENEMY_KILL_POINTS = [100, 200, 300, 400];
// The one-time extra life at 20000 points ($D138: ram_score+$02 >= 2 = the ten-
// thousands digit >= 2). Granted once per player, gated on ram_p1/p2_extra_life.
export const EXTRA_LIFE_SCORE = 20000;
// The kill-points popup sprites ($DF05-$DF10): an enemy's $10 phase shows its value as
// a 2-tile number sprite, tile = ((type>>3) & $FC) - $10 + $B9 -> $B9/$BD/$C1/$C5 for
// type $80/$A0/$C0/$E0. A killed player (type 0) shows a plain $F1 blast instead.
export const KILL_POINTS_SPRITE_BASE = 0xB9;

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

// Enemy spawn points — tbl_E474_enemy_spawn_pos_X / tbl_E477_enemy_spawn_pos_Y
// ($E474/$E477), read by sub_E363. Three fixed slots along the TOP edge; sub_E363
// cycles ram_enemy_spawn_pos_index 0->1->2->0 each enemy spawned ($E37C-$E388).
export const ENEMY_SPAWN = [
  { x: 0x18, y: 0x18 },   // 0 left
  { x: 0x78, y: 0x18 },   // 1 center
  { x: 0xD8, y: 0x18 },   // 2 right
];

// tbl_E486 ($E486) — the enemy targeting direction lookup, indexed by
// 3*dySign + dxSign (each sign 0=target is up/left, 1=aligned, 2=down/right).
// The first 9 entries bias toward VERTICAL for a diagonal target; sub_DDA2 adds 9
// on a coin-flip to reach the second 9, which bias toward HORIZONTAL — so an enemy
// wanders toward its target rather than beelining. Values are the low nibble (dir)
// of the ROM's $A0|dir bytes: A0 A0 A0 A1 A0 A3 A2 A2 A2 / A1 A0 A3 A1 A0 A3 A1 A2 A3.
export const AIM_DIR = [
  0, 0, 0, 1, 0, 3, 2, 2, 2,   // primary   ($E486): up-biased on diagonals
  1, 0, 3, 1, 0, 3, 1, 2, 3,   // alternate ($E48F): side-biased on diagonals
];

// The eagle/HQ, the enemies' late-game target (ofs_000_DD94: $DD94 loads $78/$D8).
export const HQ_TARGET = Object.freeze({ x: 0x78, y: 0xD8 });

// The 4 enemy tank TYPE bytes (high nibble), from tbl_E4EC. A fast tank is
// type & $F0 == $A0 (it moves every frame, sub_DBF1 $DC29); armour is $E0, which
// sub_E3B8 turns into $E3 (low bits = a 4-hit counter). Bit 2 ($04) is the
// carries-a-bonus flag (sub_E363 marks the 4th/11th/18th enemy). Types drive the
// palette flicker (Tank.draw, tbl_E003) and the fast-tank speed gate.
export const TANK_TYPE = Object.freeze({
  BASIC: 0x80, FAST: 0xA0, POWER: 0xC0, ARMOR: 0xE0,
  ARMOR_HP: 0x03,       // $E0 -> $E3: armour spawns with 3 in its low-bit hit counter
  BONUS_FLAG: 0x04,     // ram_tank_type & $04 — this enemy drops a bonus when killed
  FAST_HI: 0xA0,        // type & $F0 == $A0 -> fast (moves every frame)
});

// Bonus-tank markers: sub_E363 flags the enemy as bonus-carrying when
// ram_enemy_spawn_cnt (counting DOWN from 20) hits these — i.e. the 4th, 11th and
// 18th enemy of the stage ($E395/$E39B/$E39F: CMP #$11 / #$0A / #$03).
export const BONUS_SPAWN_COUNTS = Object.freeze([0x11, 0x0A, 0x03]);

// Enemy spawn interval (frames between spawns), sub_C331 loc_C39E: base $BE minus
// stage*4, so later stages spawn faster; the 2nd loop uses a fixed stage $23; 2P
// mode subtracts $14 more ($C3AD). Also feeds the AI target bias (sub_DE72).
export const SPAWN_INTERVAL_BASE = 0xBE;      // $C3A2
export const SPAWN_INTERVAL_2P_ADJ = 0x14;    // $C3B0 (2P: even faster)
export const SECOND_LOOP_STAGE = 0x23;        // 35 — the 2nd loop's enemy schedule +
                                              // spawn interval use this fixed stage

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

// --- Sidebar HUD (S8-A) — tiles + positions in the right border strip (cols 28-31,
// palette 0). Literal tile ids: sub_D6B3 copies them verbatim (no ram_0060 offset),
// unlike the digit path (sub_D6DD adds it). See docs/research_hud.md §3/§4.
export const HUD_TILE = Object.freeze({
  PLAYER_ICON: 0x14,   // tbl_D341 — the mini player-tank icon
  ENEMY_ICON:  0x6A,   // tbl_D362 — one reserve-enemy icon (drawn in pairs by $C8C0)
  GRAY:        0x11,   // tbl_D36B — erase an icon back to the grey border (= TILE.BORDER)
  DIGIT_BASE:  0x6E,   // ram_0060 = $6E: the small sidebar digit font's '0' glyph
});
// Two-tile labels ($C830 / $C859), each drawn at cols 29-30 of its row.
export const HUD_LABEL = Object.freeze({
  IP:    [0x58, 0x13],   // tbl_D2AB — "I"  + "P"
  IIP:   [0x5A, 0x13],   // tbl_D2AE — "II" + "P"
  FLAG1: [0x6C, 0xFC],   // tbl_D365 — flag, top row
  FLAG2: [0x6D, 0xFD],   // tbl_D368 — flag, bottom row
});
// Sidebar cell geometry (research_hud.md §1). All in the col 29-30 strip.
export const HUD_COL = 29;                 // icons / labels start here; digit right of it
export const HUD_ENEMY_ROW0 = 3;           // $C894: reserve grid rows 3..12
export const HUD_LIVES_ROW0 = 18;          // $C7C8: P1 row 18, +3 per player
export const HUD_LABEL_ROW0 = 17;          // $C830: Ip row 17, +3 per player
export const HUD_FLAG_ROW = 23;            // $C859: flag rows 23-24, stage number row 25
export const HUD_NUM_COL = 25;             // $C7C8/$C859: D934 start col, ones lands at 30

// --- Tally / score-count screen (P11) — sub_CCD4 ($CCD4) + sub_CEF7 ($CEF7) ---
//
// The between-stage screen: each player's per-type kills are counted out ONE AT A
// TIME into a per-type TEMP subtotal (display only — the real score was already
// credited at kill time, $E824/P10; the tally never re-adds to it), then the totals,
// then a 2P "killed-more-and-survived" 1000-pt bonus. Full decode: research_tally.md.
//
// The ROM draws this into nametable $2800 with digit offset $30 and bg_palette 03
// ($CEFC-$CF10). Those are our render params, not persistent state: we build a fresh
// Tilemap and draw it with these. Positions are the ROM's own sub_D6B3 (col,row) and
// sub_D934/sub_D6DD (posX,posY) arguments, transcribed 1:1.
export const TALLY = Object.freeze({
  BG_PAL: 0x03,        // con_bg_pal_03 ($CF0E)
  DIGIT_BASE: 0x30,    // ram_0060 = $30 ($CF0A) — the ASCII digit font, not the HUD's $6E
  // 006B_flag = 1 ($CEFC) -> an all-zero number prints a single '0' (minDigits 1).
  MIN_DIGITS: 1,
  BONUS_POINTS: 1000,  // sub_D9E1(#$00) sets the thousands digit -> 1000 ($CE3C-$CE43)

  // Frame waits (sub_D276 / sub_D8F6), all player-observable timing -> verbatim frames.
  PRE_WAIT: 0x1E,        // $CCD7 — before the first type counts
  KILL_STEP: 0x08,       // $CDDA — between each kill tallied
  BETWEEN_TYPES: 0x14,   // $CDEE — after a type is exhausted, before the next
  TOTALS_WAIT: 0x1E,     // $CDF4 — before the totals are drawn
  POST_TOTALS_WAIT: 0x0F,// $CE21 — after totals, before the bonus/exit
  FINAL_HOLD: 0x78,      // $CEE5 — the closing hold before returning to the flow

  // Static BG text — literal tile ids (the font is ASCII: 'H'=$48 ... 'Z'=$5A, ' '=$20;
  // custom glyphs $5E='I' $5F='II' $6B=dash $5B=<- $5D=-> $15='!'). sub_D6B3 copies
  // verbatim, like HUD_LABEL. Each { col, row, ids }.
  HI_SCORE: { col: 0x08, row: 0x03, ids: [0x48, 0x49, 0x6B, 0x53, 0x43, 0x4F, 0x52, 0x45] }, // "HI-SCORE" tbl_D2BD, $0468
  STAGE:    { col: 0x0C, row: 0x05, ids: [0x53, 0x54, 0x41, 0x47, 0x45] },                   // "STAGE"    tbl_D3CB, $04AC
  I_PLAYER: { col: 0x03, row: 0x07, ids: [0x5E, 0x6B, 0x50, 0x4C, 0x41, 0x59, 0x45, 0x52] }, // "I-PLAYER" tbl_D2D9, $04E3
  II_PLAYER:{ col: 0x15, row: 0x07, ids: [0x5F, 0x6B, 0x50, 0x4C, 0x41, 0x59, 0x45, 0x52] }, // "II-PLAYER" tbl_D2E2, $04F5
  ARROW_LEFT:  0x5B,   // tbl_D3B1 — P1 rows point right-to-left at the icon column
  ARROW_RIGHT: 0x5D,   // tbl_D3B3 — P2 rows
  PTS: [0x50, 0x54, 0x53],                          // "PTS" tbl_D35E
  BONUS: [0x42, 0x4F, 0x4E, 0x55, 0x53, 0x15],      // "BONUS!" tbl_D3C4

  // Column of the four per-type rows (rows = TYPE_ROW0 + type*3), $CD74's ASL/ADC #$0C.
  TYPE_ROW0: 0x0C,   // 12; rows 12/15/18/21
  ARROW_COL_L: 0x0E, // 14  ($058E) — P1 <- arrow
  ARROW_COL_R: 0x11, // 17  ($0591) — P2 -> arrow
  PTS_COL_L: 0x08,   // 8   ($0588) — P1 "PTS"
  PTS_COL_R: 0x1A,   // 26  ($059A) — P2 "PTS"

  // Number positions (posX,posY) — drawNumber(col=posX, row=posY).
  HI_NUM:   { col: 0x12, row: 0x03 },   // $CF32/$CF37 hi-score value
  STAGE_NUM:{ col: 0x0E, row: 0x05 },   // $CF52/$CF57 stage number
  P1_SCORE: { col: 0x05, row: 0x09 },   // $CD62/$CD67 (also CEF7) — static during the count
  P2_SCORE: { col: 0x17, row: 0x09 },   // $CDA1/$CDA6
  P1_TEMP_COL: 0x01,    // $CD6E — P1 per-type subtotal, row = type*3+12
  P1_COUNT_COL: 0x08,   // $CD87 — P1 per-type kill count
  P2_TEMP_COL: 0x13,    // $CDAD — 19
  P2_COUNT_COL: 0x0E,   // $CDC6 — 14
  P1_TOTAL: { col: 0x08, row: 0x17 },   // $CE00/$CE07 — P1 total kills, row 23
  P2_TOTAL: { col: 0x0E, row: 0x17 },   // $CE15/$CE1C

  // The 2P bonus block, drawn on the winner's side ($CE46-$CE79 / $CEA1-$CED4).
  BONUS_P1: { scoreCol: 0x05, numCol: 0x01, numRow: 0x1A, textCol: 0x03, textRow: 0x19, ptsCol: 0x08, ptsRow: 0x1A },
  BONUS_P2: { scoreCol: 0x17, numCol: 0x14, numRow: 0x1A, textCol: 0x16, textRow: 0x19, ptsCol: 0x1B, ptsRow: 0x1A },

  // The four enemy-type icons — sprites redrawn every frame (sub_D0B8/sub_D130), NOT BG.
  // spr_X = $81 centre, spr_Y per type, spr_T = the type's base tank tile, palette 2.
  ICON_X: 0x81,
  ICON_Y: [0x64, 0x7C, 0x94, 0xAC],       // 100/124/148/172 ($D0BC/$D0C3/$D0CA/$D0D1)
  ICON_TILE: [0x80, 0xA0, 0xC0, 0xE0],    // $D0BE/$D0C5/$D0CC/$D0D3 — basic/fast/power/armour
  ICON_PALETTE: 0x02,                      // $D0B8 LDA #$02

  // sub_D0D9_prepare_nametable_attributes ($D0D9) — the per-16x16-quad BG sub-palette.
  // Decoded to tile-cell palette regions (our Tilemap stores one palette per cell):
  // headers (HI-SCORE / I-PLAYER / II-PLAYER / BONUS) -> pal 1, the scores -> pal 2,
  // everything else -> pal 0. Each entry [rowStart, rowEnd, colStart, colEnd, pal] inclusive.
  ATTR_REGIONS: [
    [2, 3, 0, 15, 1],   [2, 3, 16, 31, 2],   // $00-03 = $50 (rows 2-3 pal1), $04-07 = $A0 (pal2)
    [6, 7, 0, 11, 1],   [6, 7, 20, 31, 1],   // $08-0A / $0D-0F = $50 (rows 6-7 pal1)
    [8, 9, 0, 11, 2],   [8, 9, 20, 31, 2],   // $10-12 / $15-17 = $0A (rows 8-9 pal2)
    [24, 25, 0, 11, 1], [24, 25, 20, 31, 1], // $30-32 / $35-37 = $05 (rows 24-25 pal1)
  ],
});

// --- Bullets (S5) — the $CC..$D5 zero-page arrays + the $E0xx/$E6xx routines ---
//
// 10 FLAT slots: 0-7 = each tank's primary bullet (bullet i belongs to tank i);
// 8-9 = the two players' 2nd bullets (the "2 shots on screen" upgrade, players only).
// The ROM lays the 2nd-bullet arrays right after the primaries so one loop 0..9 covers
// both ($E02E/$E604/$E910 all count 9->0); the flat array IS that faithful model. The
// membership tests the loops do with & masks are named in bullet.js, not spelled here.
export const BULLET_SLOTS = 10;
export const SECOND_BULLET_BASE = 8;   // bullets[8 + p] = player p's 2nd bullet

// Bullet lifecycle state. The ROM packs this (+ direction + the explosion counter) into
// the HIGH/LOW nibbles of one byte, ram_bullet_status ($CC); we split it into named
// fields (Bullet.state / .dir / .explosionPhase / .phaseFrame) the way Tank splits
// ram_tank_flags and Base splits ram_game_over_flag — see research_bullets.md dev #4.
// String enum to match BASE_STATE / the StageIntro seq (readable in the debugger).
export const BULLET_STATE = Object.freeze({
  INACTIVE: 'inactive',   // status $00 — empty slot
  FLYING: 'flying',       // status $40 — a live bullet in flight
  EXPLODING: 'exploding', // status $30/$20/$10 — the hit-explosion animation
});

// ram_bullet_property ($D6) — set from the firing tank's type ($E0BC-$E0D5).
export const BULLET_PROPERTY = Object.freeze({
  FAST: 0x01,   // advance twice per frame ($E05D) AND move every frame ($E614)
  POWER: 0x02,  // destroys steel + clears the WHOLE tile, not one quadrant ($E6DA)
});

// Bullet collision boxes — half-open, hit when |d| < range on BOTH axes.
export const BULLET_TANK_RANGE = 0x0A;     // vs a tank centre ($E739/$E74A/$E87A/$E88B)
export const BULLET_BULLET_RANGE = 0x06;   // vs another bullet ($E94D/$E95E)

// Flying-bullet sprite (sub_DA64): ONE 8x16 sprite, tile $B1 + dir*2, palette 2, at
// (pos_X - 5, pos_Y). $B0-$B7 are the four facings in the BG pattern table.
export const BULLET_SPRITE_BASE = 0xB1;      // $E109 LDA #$B1
export const BULLET_SPRITE_X_OFFSET = 0x05;  // $DA6C SBC #$05
export const BULLET_SPRITE_PALETTE = 0x02;   // $E107 STA spr_A_palette
export const BULLET_EXPLOSION_PALETTE = 0x03; // $DEF5 — sub_DEE2's palette

// Hit-explosion animation ($E076 countdown + sub_DEE2 tiles). The ROM seeds status $33
// and walks it $33->$23->$13->0: three shrinking blast sprites, each shown for 3 frames
// (the low nibble counting 3->0, reloaded via ORA #$03). Split from the packed byte:
export const BULLET_EXPLOSION_PHASES = 3;                 // the three $30/$20/$10 sizes
export const BULLET_PHASE_FRAMES = 3;                     // frames each phase shows ($E087 -> 3)
export const BULLET_EXPLOSION_SPRITES = [0xF1, 0xF5, 0xF9]; // sub_DEE2 spr_T, phase 3/2/1

// Bullet-vs-terrain thresholds ($E6A6-$E6EF), each relative to a live TILE id. A bullet
// PASSES over any tile >= $12 (water $12, ice $21, forest $22, blank-steel $20); every
// solid it stops at is $01-$11. The eagle is the four tiles $C8-$CB (tile & $FC == $C8).
export const BULLET_PASS_MIN = 0x12;   // $E6C8 CMP #$12 / BCS -> pass over
export const EAGLE_TILE_BASE = 0xC8;   // $E6A4 AND #$FC / $E6A6 CMP #$C8

// ram_plr_stun_timer ($6F) — THE FREEZE. $E8AA writes $C8 to a player hit by the OTHER
// player's bullet; sub_DB75 ($DB8F) DECs it and holds the tank stopped + blinking
// ($DFDD) until 0. Cleared on spawn ($E377) and at stage prep ($C363). See Tank.control.
export const STUN_TIMER_INIT = 0xC8;   // $E8AA LDA #$C8 — 200 control-ticks (~4.4 s)

// --- Base / HQ (S6) ---
// ram_shovel_timer ($45) — the shovel power-up fortifies the base walls (brick->steel)
// for this many units. sub_E2A9 DECs it every 64 frames while acting every 16 ($E2A9).
// Set by the shovel bonus ($EA02 LDA #$14; Bonus.applyShovel — P14). See base.js.
export const SHOVEL_TIMER_INIT = 0x14;   // $EA02 LDA #$14

// --- Bonus / power-ups (S7) — sub_E8BE / sub_E23B / sub_E972 ($E8BE/$E23B/$E972) ---
//
// A single on-field bonus: ram_bonus_pos_X/Y ($86/$87 — the CENTRE, like a tank),
// ram_bonus_id ($88), ram_0062_bonus_timer ($62). A bonus-carrier enemy (the 4th/11th/
// 18th of the stage — TANK_TYPE.BONUS_FLAG) drops one when its bullet-death is dealt
// ($E7D7). Full decode: docs/research_bonus.md.

// The 7 power-up ids — tbl_E9E2 ($E9E2) handler order. 6 (pistol) is a no-op RTS and is
// never spawned (not in BONUS_ID_TABLE), but the slot exists in the dispatch table.
export const BONUS_ID = Object.freeze({
  HELMET: 0, CLOCK: 1, SHOVEL: 2, STAR: 3, GRENADE: 4, TANK: 5, PISTOL: 6,
});

// tbl_E8FA ($E8FA) — spawn rolls (random & $07) and indexes this: GRENADE (4) and STAR
// (3) each appear TWICE (2/8); helmet/clock/shovel/tank are 1/8 each; pistol never.
export const BONUS_ID_TABLE = [0, 1, 2, 3, 4, 5, 4, 3];

// sub_E902 ($E902) — a random 0-3 maps to a pixel on the 4x4 spawn grid via
// ((n*3)*2 + 6) << 3, i.e. these four values in both X and Y.
export const BONUS_POS = [0x30, 0x60, 0x90, 0xC0];

export const BONUS_PICKUP_RANGE = 0x0C;    // $E994/$E9A4 — |player - bonus| < $0C to grab
export const BONUS_FLASH_TIMER = 0x32;     // $E9A8 — the picked-up "500" flash lasts $32 frames
export const BONUS_PICKUP_POINTS = 500;    // $E9B6 sub_D9E1(#$50) — 500 pts on pickup
export const BONUS_HELMET_TIMER = 0x0A;    // $E9F0 — helmet bonus: 10 units (DEC'd every 64 frm)
export const BONUS_CLOCK_TIMER = 0x0A;     // $E9F5 — clock/freeze: 10 units
export const BONUS_STAR_STEP = 0x20;       // $EA0F — each star bumps tank_type by $20
export const BONUS_STAR_MAX = 0x60;        // $EA0A — capped at $60 (3 stars)
export const BONUS_SENTINEL_ID = 0xFF;     // $E8D9 — the spawn-search probe id ($E9AE BMI skips)

// Bonus sprites (sub_E23B). The on-field icon is bonus_id*4 + $81 ($E265-$E268), a
// 2x8x16 pair (sub_DA7B), palette 2, blinking every 8 frames while it waits ($E259
// frm_cnt_lo & $08). The picked-up "500" flash is the number tile $3B ($E252-$E254).
export const BONUS_SPRITE_BASE = 0x81;     // $E268 — icon tile = id*4 + $81
export const BONUS_SCORE_SPRITE = 0x3B;    // $E252 — the "500" pickup-flash tile
export const BONUS_PALETTE = 0x02;         // $E250 spr_A_palette
export const BONUS_BLINK_MASK = 0x08;      // $E25B AND #$08 — the on-field blink

// --- End-of-run screens & PAUSE (P12) — sub_C5D9 / sub_C44B / sub_C972 / sub_C8F9 ---
//
// GAME OVER + HALL OF FAME are full-screen HUGE-text screens (drawHugeText, the brick-
// glyph letters in text.js). The sliding "GAME OVER" message and the "PAUSE" readout are
// front SPRITES. Full decode: docs/research_game_over.md.

// The two huge-text screens. Strings verified against the ROM bytes ("labels lie"):
// tbl_D2B5="HISCORE", tbl_D343="GAME", tbl_D348="OVER". Each { str, x, y } is the pixel
// (X,Y) the screen loads into ram_0056/ram_0057 before sub_D8D2_draw_huge_letters.
export const HUGE_TEXT = Object.freeze({
  GAME:    { str: 'GAME',    x: 0x3C, y: 0x46 },   // $C5E9/$C5ED  tbl_D343
  OVER:    { str: 'OVER',    x: 0x3C, y: 0x78 },   // $C5FC/$C600  tbl_D348
  HISCORE: { str: 'HISCORE', x: 0x10, y: 0x32 },   // $C45B/$C45F  tbl_D2B5
});

// sub_D951_draw_huge_hiscore ($D951): the hi-score drawn HUGE, right-aligned in a
// 7-digit field starting at px (0x10, 0x64). Each huge digit is 0x20 px wide; the ROM
// skips leading-zero digits, advancing X by 0x20 per skip ($D965-$D96A) — so a right-
// aligned draw is startX = 0x10 + (7 - digitCount) * 0x20.
export const HUGE_HISCORE = Object.freeze({ x0: 0x10, y: 0x64, digitPx: 0x20, fieldDigits: 7 });

// HALL OF FAME colour flash ($C489-$C490): bg_palette_id = (frm_cnt_lo & 3) + 5, i.e.
// con_bg_pal_05..08 cycling; con_bg_pal_00 on the way out ($C497).
export const HOF_PAL_BASE = 5;      // con_bg_pal_05
export const HOF_PAL_MASK = 0x03;   // $C48B AND #$03
export const BG_PAL_TITLE = 0x00;   // con_bg_pal_00 — GAME OVER / HALL OF FAME exit default

// The sliding "GAME OVER" message — sub_C972 (animate) + sub_C947 (draw). Started by
// $C737 (begin), cleared per stage by $C337-$C33E (clear). movType indexes the speed
// tables below; the real game-over message uses UP.
export const GAME_OVER_MSG = Object.freeze({
  BEGIN_X: 0x70,      // $C737
  HIDE_Y:  0xF0,      // $C33C / $C73C / $C988 — off-screen Y (per-stage clear + timer-0 hide)
  MOV_UP:  0x00,      // movType 0 — tbl_D3D5[0]/tbl_D3D9[0]
  TIMER_INIT: 0x11,   // $C746
  MOVE_UNTIL: 0x0A,   // $C990 CMP #$0A — move only while timer >= this
  DEC_MASK: 0x0F,     // $C97F AND #$0F — DEC the timer every 16 frames
  PALETTE: 0x03,      // $C947 spr_A_palette
  // sub_C947 -> two sub_DA7B groups at (posX, $79) and (posX+$10, $7D); each draws
  // tile @ x-8 and tile+2 @ x. Net 4 sprites at these [dx, tile] from posX:
  SPRITES: [[-8, 0x79], [0, 0x7B], [8, 0x7D], [0x10, 0x7F]],
  // The 2P per-player "player N is out" slide ($DE18-$DE54): the partner plays on, so it
  // enters horizontally from the eliminated player's side along the bottom (posY $D8) and
  // does NOT end the stage. movType reuses the animator's DX/DY indices (1=left, 3=right):
  // P1 (left player) enters from $20 moving RIGHT; P2 (right) from $C0 moving LEFT.
  PLAYER_OUT: {
    P1: { movType: 0x03, x: 0x20 },   // $DE26 mov right / $DE2B posX
    P2: { movType: 0x01, x: 0xC0 },   // $DE38 mov left  / $DE3D posX
    TIMER: 0x0D,                       // $DE46
    Y: 0xD8,                           // $DE4B posY — the bottom of the field (by the HQ)
  },
});
// tbl_D3D5_game_over_message_spd_X ($D3D5) / tbl_D3D9_..._spd_Y ($D3D9), indexed by
// movType (Up/Left/Down/Right). Stored signed here ($FF -> -1).
export const GAME_OVER_MSG_DX = [0, -1, 0, 1];   // $D3D5: 00 FF 00 01
export const GAME_OVER_MSG_DY = [-1, 0, 1, 0];   // $D3D9: FF 00 01 00

// The blinking "PAUSE" readout — sub_C8F9_display_pause_text ($C8F9). Shown while paused
// AND (frm_cnt_lo & 0x10) != 0 (16 frames on, 16 off). Five 8x16 front sprites (the BG-
// glyph letters P A U S E), palette 3, all at Y=0x80, 8 px apart.
export const PAUSE_TEXT = Object.freeze({
  BLINK_MASK: 0x10,   // $C8FF AND #$10
  Y: 0x80,            // $C90D
  PALETTE: 0x03,      // $C903
  // [spr_X, spr_T] per letter ($C90B-$C934): P A U S E.
  SPRITES: [[0x64, 0x17], [0x6C, 0x19], [0x74, 0x1B], [0x7C, 0x1D], [0x84, 0x1F]],
});

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
