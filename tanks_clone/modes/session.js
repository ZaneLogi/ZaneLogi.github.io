// modes/session.js — the SESSION mode: a run. Stage intro -> battle -> tail ->
// tally, cycling until the run ends.
//
// Absorbs:
//   loc_C159 ($C159) + loc_C172_loop ($C172) + bra_C1C5 ($C1C5)  -> StageIntro
//   bra_C1F9_loop ($C1F9)                                        -> Battle
//   bra_C238_loop ($C238)                                        -> Tail
//   sub_CCD4_score_after_stage_handler ($CCD4)                   -> Tally
// See docs/research_game_flow.md §4 [3][4][5][6], §7.2.
//
// SESSION is a mode, NOT a data owner: lives/stage/scores live on Game (the map's
// §7 lock), which is what lets GameOver read the final scores with no handoff.
//
// 1P and 2P are the SAME flow — the mode handlers ($CA6F/$CA74) differ only in
// ram_enemy_limit (5 vs 7) and a spawn-interval tweak ($C3AD). There is no second
// loop to write.

import { Mode, DONE } from '../mode.js';
import { BTN, GAME_MODE } from '../constants.js';

const MAX_TANKS_LIMIT = 0x07;   // con_max_tanks — "2 players + 6 enemies"

const CURTAIN_FRAMES = 0x10;   // $CCAD / $CCCF — 16 frames each way
const TAIL_END_HI = 0x02;      // $C24F CMP #$02
const TAIL_GAME_OVER_SEED = 0xFE;  // $C234 LDA #$FE — buys 2 extra hi-ticks

// TODO: placeholder until $CCD4 is ported. NOT SOURCE.
const TALLY_STUB_FRAMES = 180;

export class Session extends Mode {
  // ofs_000_CA6F_00_1_player ($CA6F) / ofs_000_CA74_01_2_players ($CA74) — the
  // tbl_CA69 handlers. This IS the whole of the 1P/2P difference: they set
  // ram_enemy_limit, JSR sub_C2B3, and both JMP loc_C159 into the identical loop.
  enter() {
    const g = this.game;
    g.enemyLimit = g.gameMode === GAME_MODE.TWO_PLAYERS
      ? MAX_TANKS_LIMIT          // $CA74 — con_max_tanks = 7
      : MAX_TANKS_LIMIT - 2;     // $CA6F — con_max_tanks - $02 = 5
    g.resetSession();            // $CA78 sub_C2B3
    this.setSub(StageIntro);     // $CA7B JMP loc_C159
  }

  update() {
    if (this.sub.update() !== DONE) return null;
    const done = this.sub;

    if (done instanceof StageIntro) { this.setSub(Battle); return null; }
    if (done instanceof Battle)     { this.setSub(Tail); return null; }
    if (done instanceof Tail)       { this.setSub(Tally); return null; }

    // Tally finished: $C259-$C280 decides another stage vs the end of the run.
    if (!this.game.advanceStage()) return DONE;   // -> $C283 bra_C283_game_over
    this.setSub(StageIntro);                      // $C280 JMP loc_C159
    return null;
  }
}

// --- loc_C159 ($C159) — the "STAGE N" screen ---------------------------------
const INTRO = Object.freeze({
  CURTAIN_CLOSE: 'CURTAIN_CLOSE',
  SELECT: 'SELECT',
  START_STAGE: 'START_STAGE',
  CURTAIN_OPEN: 'CURTAIN_OPEN',
});

class StageIntro extends Mode {
  enter() {
    const g = this.game;
    g.audio.clear();     // $C15C sub_EA51_clear_sound_engine_data
    g.scrollY = 0;       // $C165
    g.paused = false;    // $C169
    // TODO: bg_palette_id = con_bg_pal_04 ($C16B).
    this.seq = INTRO.CURTAIN_CLOSE;
    this.t = 0;
  }

  update() {
    const g = this.game;
    switch (this.seq) {
      // sub_CC90_close_grey_curtain ($CC90) — fills the screen with tile $11.
      case INTRO.CURTAIN_CLOSE:
        if (++this.t < CURTAIN_FRAMES) return null;
        this.t = 0;
        // $C175: ram_004C_flag gates the stage select. It is 0 only before the
        // first sub_C331 of a fresh run ($C2CB sets it, $C38F clears it), so A/B
        // stage select exists on stage 1 and nowhere else. Flow doc §6a.
        this.seq = g.stageSelectUsed ? INTRO.START_STAGE : INTRO.SELECT;
        return null;

      // loc_C172_loop ($C172) — sub_CA91 prints "STAGE  N" once per frame.
      case INTRO.SELECT:
        // TODO: A/B change the stage, clamped 1..35 ($C195-$C1C2: INC, CMP #$24
        // -> $23; DEC, 0 -> 1). Held A/B auto-repeats every 8 frames ($C18D).
        if (g.input.pressed(0, BTN.Start)) this.seq = INTRO.START_STAGE;   // $C17B
        return null;

      // bra_C1C5 ($C1C5) — build the field behind the closed curtain.
      case INTRO.START_STAGE:
        // TODO: $C1C7-$C1CD ram_sfx_stage_load_*.
        // $C1D0: if the editor was used, KEEP the constructed field ($C1E2 draws
        // just the eagle); otherwise sub_C9B0 + sub_F000_draw_stage ($C1D4/$C1D9).
        // sub_C331 then clears the counter ($C35F), so a constructed stage is
        // played exactly ONCE and stage 2 reverts to the real stages. §6c.
        this.seq = INTRO.CURTAIN_OPEN;
        this.t = 0;
        return null;

      // sub_CCB2_open_grey_curtain ($CCB2).
      case INTRO.CURTAIN_OPEN:
        // On hardware this IS the $0400 -> PPU upload: with grey_tile_flag = 0 it
        // draws the REAL tiles, row by row, and there is no copy_400h_to_nametable
        // on this path. For us that is plumbing — it is a 16-frame wipe the
        // renderer does, reusable by any transition. Flow doc §7.8.
        if (++this.t < CURTAIN_FRAMES) return null;
        g.prepareStage();   // $C1F6 sub_C331
        return DONE;
    }
    return null;
  }
}

// --- bra_C1F9_loop ($C1F9) — the battle --------------------------------------
class Battle extends Mode {
  update() {
    const g = this.game;

    // $C1FC: pause gates ONLY the pipeline. The three handlers below keep running
    // while paused — which is why sprites still animate on the pause screen. A
    // port that freezes everything on pause is wrong. Map §2.
    if (!g.paused) g.mainBattleScript();   // $C200

    // TODO: $C203 $E23B display_bonus, $C206 $E0D8 bullets_status,
    //       $C209 $DEA6 tanks_handler — all OUTSIDE the pause gate.

    if (g.input.pressed(0, BTN.Start)) {   // $C210
      g.paused = !g.paused;                // $C212-$C216
      // TODO: $C218 ram_sfx_pause. Pausing MUTES ($EA7E reads the flag) — that is
      // Battle's fact, separate from the demo's silence. Flow doc §6e.
    }
    // TODO: $C21B sub_C8F9_display_pause_text.

    return g.checkStageEnding() ? DONE : null;   // $C21E / $C221
  }
}

// --- bra_C238_loop ($C238) — the ending tail ---------------------------------
// The stage is over but the world keeps moving: explosions finish, the GAME OVER
// message slides in. $C23E is $C200 again plus sub_C2A2, so this COULD be Battle
// with a flag — kept separate per Zane 2026-07-16 ("harmless to have two modes;
// work first, improve later"), and fusing threads an `if (endingTail)` through
// the middle of the battle's update.
class Tail extends Mode {
  enter() {
    const g = this.game;
    g.frm.reset();   // $C223-$C227 — both lo and hi
    // TODO: $C229/$C22C silence ram_sfx_movement_player / _enemy.

    // $C22F-$C236: if a GAME OVER message is sliding, seed hi = $FE to buy two
    // extra hi-ticks — 256 frames instead of 128, so the message can arrive and
    // be read. The number is denominated in frames and transfers verbatim: we
    // render the same 256x240 at the same rate. Flow doc §4[5]/§7.1.
    if (g.gameOverMsg.timer !== 0) g.frm.hi = TAIL_GAME_OVER_SEED;
  }

  update() {
    const g = this.game;
    // TODO: $C23B sub_C2A2_disable_buttons_if_game_over — zeroes btn_press so the
    // player cannot act while the message slides.
    g.mainBattleScript();   // $C23E — the SAME body Battle and the demo run
    // TODO: $C241 $E23B, $C244 $DEA6, $C247 $E0D8, $C24A $C31D water swap.
    return g.frm.hi === TAIL_END_HI ? DONE : null;   // $C24D-$C251
  }
}

// --- sub_CCD4_score_after_stage_handler ($CCD4) — the tally ------------------
class Tally extends Mode {
  enter() {
    this.game.audio.clear();   // $C253 sub_EA51
    this.t = 0;
    // TODO: sub_CEF7_draw_screen_with_score_count ($CEF7), drawn into $2800.
  }

  update() {
    // TODO: port $CCD4. Count each enemy type's kills out ONE AT A TIME against
    // tbl_D3D1_points_for_killing_enemy, with sub_D276 waits between ($CCD9 $1E,
    // $CDDA $08, $CDEE $14, $CDF6 $1E, $CE21 $0F, $CEE5 $78), calling
    // sub_D138_gain_extra_life_for_20000_pts as it goes; then the totals and the
    // 2P bonus comparison ($CE2B). Flow doc §4[6].
    // NOT SOURCE: a flat placeholder until the above lands.
    return ++this.t >= TALLY_STUB_FRAMES ? DONE : null;
  }
}
