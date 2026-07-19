// score.js — Score / HUD
//
// S8-A — the battle sidebar HUD: lives, the 20-enemy reserve column, the Ip/IIp
//   labels, the flag + stage number. Full decode: docs/research_hud.md.
// S8-B — score ACCUMULATION: add_score ($D9BE) + extra-life ($D138), driven by
//   P10 kills (Game.awardKill) and, since P14 (S7), Bonus pickups. hi-score-beaten
//   ($D97D / checkHiscore) is ported in P12 (the GAME OVER flow, docs/research_game_over.md
//   §4) — it raises the hi-score at game over and routes to HALL OF FAME. The Tally
//   count-out screen ($CEF7) is P11 (docs/research_tally.md); it reads killCounts but
//   adds only to a display subtotal, never re-crediting the score this file owns.
//
// Score is the HUD RENDERER + the score logic; the STATE it reads/mutates (lives /
// scores / stage / gameMode) lives on Game (the map's §7 lock — which is what lets
// GameOver read the final scores with no handoff). Score holds only a NOT-SOURCE
// render cache.
//
// Absorbs:
//   sub_C7C8_print_lives_handler ($C7C8)                    -> drawLives
//   sub_C8C0_draw_20_enemy_icons ($C8C0) / sub_C894 / C8A2  -> drawStageHud
//   sub_C8B1_erase_enemy_icon ($C8B1)                       -> eraseEnemyIcon
//   sub_C830_draw_Ip_IIp_icons ($C830)                      -> drawStageHud
//   sub_C859_draw_flag_above_stage_number ($C859)           -> drawStageHud
//   sub_D9BE_add_score ($D9BE) + sub_D138_gain_extra_life ($D138)  -> add

import { drawNumber } from './text.js';
import {
  GAME_MODE, SECOND_LOOP, EXTRA_LIFE_SCORE,
  HUD_TILE, HUD_LABEL, HUD_COL, HUD_ENEMY_ROW0,
  HUD_LIVES_ROW0, HUD_LABEL_ROW0, HUD_FLAG_ROW, HUD_NUM_COL,
} from './constants.js';
import { SFX } from './assets/dat_sfx.js';

/** @typedef {import('./field.js').Field} Field */

// sub_C894_calculate_enemy_icon_pos ($C894): X = (i & 1) + $1D, Y = (i >> 1) + $03.
// Reserve index i (0..19) -> its cell in the 2-wide x 10-tall grid, cols 29-30,
// rows 3-12, filled left->right, top->bottom.
function enemyIconCell(i) {
  return { col: HUD_COL + (i & 1), row: HUD_ENEMY_ROW0 + (i >> 1) };
}

// The small sidebar number: base-$6E digit font, ones digit right-aligned at col 30
// (D934 starts at col 25 and walks the leading zeros). $C7CC sets ram_006B_flag = 1,
// so an all-zero value prints a single '0' (minDigits = 1).
function drawHudNumber(field, value, row) {
  drawNumber(field.tilemap, value, HUD_NUM_COL, row,
    { first: 1, minDigits: 1, digitBase: HUD_TILE.DIGIT_BASE });
}

export class Score {
  constructor() {
    // NOT SOURCE render cache — drawLives writes only when a player's displayed
    // reserve CHANGES (write-on-change), so the persistent field canvas isn't
    // repainted every frame. The ROM re-fills its transient PPU buffer each frame;
    // we re-derive that as the same version-bump-on-change shape the field itself
    // uses (research_hud.md §5; CLAUDE.md rendering notes).
    this._livesShown = [null, null];
  }

  // Whether player 2's column is shown: 2P mode OR the attract demo. Same gate the
  // ROM uses for the P2 icon ($C7E1/$C7E7), the IIp label ($C841/$C845) and the P2
  // lives digit.
  static _twoColumns(gameMode, secondLoop) {
    return gameMode === GAME_MODE.TWO_PLAYERS || secondLoop === SECOND_LOOP.DEMO;
  }

  // The stage-entry HUD, drawn once from Game.prepareStage ($C331): the 20-enemy
  // reserve column ($C8C0), the Ip/IIp labels ($C830), the flag + stage number
  // ($C859). Also resets the lives cache so step 17 repaints on this stage's first
  // battle frame.
  /** @param {Field} field */
  drawStageHud(field, gameMode, secondLoop, stage) {
    this._livesShown = [null, null];
    const two = Score._twoColumns(gameMode, secondLoop);
    this.drawEnemyIcons(field);           // $C377 sub_C8C0
    this._drawLabels(field, two);         // $C37D sub_C830
    this._drawFlagAndStage(field, stage); // $C380 sub_C859
  }

  // sub_C8C0_draw_20_enemy_icons ($C8C0) — fill all 20 reserve cells with the enemy
  // icon. (The ROM draws 10 horizontal pairs via sub_C8A2; filling 20 cells directly
  // is byte-identical, same enemyIconCell mapping.)
  /** @param {Field} field */
  drawEnemyIcons(field) {
    for (let i = 0; i < 20; i++) {
      const { col, row } = enemyIconCell(i);
      field.tilemap.setTile(col, row, HUD_TILE.ENEMY_ICON);
    }
  }

  // sub_C8B1_erase_enemy_icon ($C8B1) — grey out one reserve cell. Called on each
  // enemy spawn with the spawn counter AFTER its decrement ($DB66), so the column
  // drains bottom-up (index 19 = the bottom-right cell). research_hud.md §2.
  /** @param {Field} field */
  eraseEnemyIcon(field, index) {
    if (index < 0 || index > 19) return;
    const { col, row } = enemyIconCell(index);
    field.tilemap.setTile(col, row, HUD_TILE.GRAY);
  }

  // sub_C830_draw_Ip_IIp_icons ($C830) — "Ip" always at row 17; "IIp" at row 20 when
  // player 2's column is shown.
  _drawLabels(field, two) {
    field.tilemap.writeTiles(HUD_COL, HUD_LABEL_ROW0, HUD_LABEL.IP);          // $063D
    if (two) field.tilemap.writeTiles(HUD_COL, HUD_LABEL_ROW0 + 3, HUD_LABEL.IIP); // $069D
  }

  // sub_C859_draw_flag_above_stage_number ($C859) — the 2x2 flag (rows 23-24), then
  // the stage number (row 25). Stage is 1..35, so the all-zero path never runs.
  _drawFlagAndStage(field, stage) {
    field.tilemap.writeTiles(HUD_COL, HUD_FLAG_ROW,     HUD_LABEL.FLAG1);   // $06FD
    field.tilemap.writeTiles(HUD_COL, HUD_FLAG_ROW + 1, HUD_LABEL.FLAG2);   // $071D
    drawHudNumber(field, stage, HUD_FLAG_ROW + 2);                          // $C87E
  }

  // sub_C7C8_print_lives_handler ($C7C8) — pipeline step 17, every battle frame.
  // The sidebar shows the RESERVE tank count (max(lives - 1, 0)), not total lives:
  // the one in play isn't counted ($C805 SBC #$01 / $C808 BPL). Write-on-change: on
  // a change, re-draw the icon THEN the digit (the ROM's order), which also self-
  // heals a 2-digit->1-digit shrink that would leave a stale tens digit at col 29.
  /** @param {Field} field */
  drawLives(field, lives, gameMode, secondLoop) {
    this._drawPlayerLives(field, 0, lives);                        // P1 always
    if (Score._twoColumns(gameMode, secondLoop)) {
      this._drawPlayerLives(field, 1, lives);                      // P2 in 2P/demo
    }
  }

  _drawPlayerLives(field, p, lives) {
    const display = Math.max(lives[p] - 1, 0);                     // $C803-$C80A
    if (display === this._livesShown[p]) return;                   // write-on-change
    this._livesShown[p] = display;
    const row = HUD_LIVES_ROW0 + p * 3;                            // $C816-$C821: P1 18 / P2 21
    field.tilemap.setTile(HUD_COL, row, HUD_TILE.PLAYER_ICON);     // $C7D2-$C7DE icon at col 29
    drawHudNumber(field, display, row);                           // $C801-$C822 digit at col 30
  }

  // --- S8-B: score accumulation (driven by P10 kills + P14 Bonus pickups, $E9B6) ---
  // State lives on Game (§7 lock); Score owns the logic and mutates it. Scores are ints,
  // not the ROM's 7-digit BCD arrays — the digit math is CPU-only, the VALUE is faithful.

  // sub_D9BE_add_score ($D9BE) + sub_D138_gain_extra_life_for_20000_pts ($D138). Add the
  // points, then grant the one-time extra life at 20000 (once per player).
  /** @param {import('./game.js').Game} game */
  add(game, player, points) {
    game.scores[player] += points;                              // $D9BE add_score
    if (!game.extraLife[player] && game.scores[player] >= EXTRA_LIFE_SCORE) {  // $D13E-$D146
      game.lives[player]++;                                     // $D148 INC ram_lives
      game.extraLife[player] = 1;                               // $D14A INC ram_p1_extra_life
      game.audio.play(SFX.GAIN_LIFE_1);                         // $D163 ram_sfx_gain_life_1
      game.audio.play(SFX.GAIN_LIFE_2);                         // $D166 ram_sfx_gain_life_2 (2-part)
    }
    // NOTE: $D138's game-over-flag guard ($D13A) is dropped here — it belongs with the
    // GAME OVER flow (a separate step); at a normal kill the eagle still stands.
  }

  // sub_D97D_check_hiscore_beaten ($D97D). Runs once at GAME OVER ($C286): compare each
  // player's score to the hi-score and RAISE the hi-score to the higher one; return
  // whether it was beaten (the caller then routes to HALL OF FAME). The ROM walks the
  // 7-digit BCD arrays MSB-first ($D981 / $D9A0) and copies only on a strictly-greater
  // digit (BMI = less -> not beaten, so an EQUAL score does not count); with int scores
  // that is one `>`. P1 is checked first, then P2 against the possibly-raised value, so
  // the net is hiScore = max(hiScore, s0, s1), beaten if either strictly exceeded it.
  /** @param {import('./game.js').Game} game */
  checkHiscore(game) {
    let beaten = false;
    if (game.scores[0] > game.hiScore) { game.hiScore = game.scores[0]; beaten = true; }  // $D981-$D99C (Y=1)
    if (game.scores[1] > game.hiScore) { game.hiScore = game.scores[1]; beaten = true; }  // $D9A0-$D9BB (Y=$FF)
    return beaten;
  }
}
