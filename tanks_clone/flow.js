// flow.js — the mode graph, as data.
//
// This table IS docs/research_game_flow.md §2, executable. Each row cites the
// source site it re-expresses, so the doc and the code read side by side.
// LOCKED design: flow doc §7.5.
//
// Transitions are decided HERE, not by the modes. That is forced, not taste
// (§7.4(2)): if a mode returned its successor, attract.js would import editor.js
// and editor.js would import attract.js — a real ES-module cycle, and with no
// build step that means TDZ landmines on the class declarations. With this table,
// modes import NOTHING of each other; only game.js and flow.js know the set.
//
// The ROM has no such table: it dispatches through tbl_CA69 after popping a
// return address (PLA/PLA, $CA56), and lets the caller of sub_C5D9 decide the
// hi-score branch inline ($C286). Both are the same graph, differently expressed.

import { ATTRACT_AT } from './modes/attract.js';
import { GAME_MODE } from './constants.js';

export const MODE = Object.freeze({
  ATTRACT: 'ATTRACT',
  SESSION: 'SESSION',
  GAME_OVER: 'GAME_OVER',
  HALL_OF_FAME: 'HALL_OF_FAME',
  EDITOR: 'EDITOR',
});

// NEXT[modeId](game) -> [nextModeId, args?]
// Called only when a mode's update() returns DONE.
export const NEXT = Object.freeze({
  // $CA56 PLA/PLA -> JMP (tbl_CA69_game_mode_handler,Y). The ROM branches on
  // ram_game_mode here too — the menu returning is not the decision, game_mode is.
  [MODE.ATTRACT]: (g) =>
    g.gameMode === GAME_MODE.CONSTRUCTION ? [MODE.EDITOR] : [MODE.SESSION],

  // $C283 bra_C283_game_over. A run has exactly one exit: it ends.
  [MODE.SESSION]: () => [MODE.GAME_OVER],

  // $C286-$C292: the CALLER checks sub_D97D_check_hiscore_beaten and only then
  // calls sub_C44B. Deciding out here matches the ROM's own shape.
  [MODE.GAME_OVER]: (g) =>
    g.hiScoreBeaten() ? [MODE.HALL_OF_FAME] : [MODE.ATTRACT, { at: ATTRACT_AT.SCROLL }],

  // $C292 JMP loc_C095 — the full, counter-zeroing entry.
  [MODE.HALL_OF_FAME]: () => [MODE.ATTRACT, { at: ATTRACT_AT.SCROLL }],

  // $C156 JMP loc_C0A2 — NOT loc_C095. Straight to the menu, and
  // ram_constr_usage_cnt is PRESERVED. That preservation is what lets the counter
  // reach the 7 the hidden cutscene needs ($CA43); collapse this into the SCROLL
  // entry above and the easter egg dies silently. Flow doc §6c/§7.5.
  [MODE.EDITOR]: () => [MODE.ATTRACT, { at: ATTRACT_AT.MENU }],
});
