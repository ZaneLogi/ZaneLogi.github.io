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
import {
  BTN, GAME_MODE, SECOND_LOOP, TILE, TALLY, ENEMY_KILL_POINTS, PAUSE_TEXT,
} from '../constants.js';
import { Tilemap, TILEMAP_ROWS } from '../tilemap.js';
import { drawNumber, writeText } from '../text.js';

/** @typedef {import('../renderer.js').Renderer} Renderer */

const MAX_TANKS_LIMIT = 0x07;   // con_max_tanks — "2 players + 6 enemies"

const CURTAIN_FRAMES = 0x10;   // $CCAD / $CCCF — 16 frames each way
const BG_PAL_STAGE = 0x02;     // con_bg_pal_02 — ram_bg_palette_id during a stage,
                               // what $C31D lands on at frame 0 (the water swap, step
                               // 18, drives it 01<->02 later). See level_viewer.
const BG_PAL_INTRO = 0x04;     // con_bg_pal_04 — the stage-intro screen ($C16B).

// sub_CA91_print_word_stage_and_number ($CA91): "STAGE" is five hardcoded font tiles
// ($CAA9-$CAC3), then two $11 spaces, then the stage number with digit base $6E
// ($CADB). Written at buffer $05CC = ($05CC - $0400) -> row 14, col 12.
const STAGE_TILES = [0x23, 0x24, 0x25, 0x26, 0x27];   // S T A G E
const STAGE_TEXT_COL = 12, STAGE_TEXT_ROW = 14;
const STAGE_NUM_COL = 19;                             // after "STAGE" + two spaces
const DIGIT_BASE_STAGE = 0x6E;
const TAIL_END_HI = 0x02;      // $C24F CMP #$02
const TAIL_GAME_OVER_SEED = 0xFE;  // $C234 LDA #$FE — buys 2 extra hi-ticks

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
    // The grey curtain ($CC90) + "STAGE N" ($CA91), built once. bg_palette_id =
    // con_bg_pal_04 ($C16B) is BG_PAL_INTRO, applied in render().
    this.curtain = buildStageCurtain(g.stage);
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

      // loc_C172_loop ($C172) — the stage-select screen (only on stage 1 of a run;
      // stageSelectUsed skips it above). Start confirms; A steps the stage up, B down,
      // 1..35, each firing on a fresh press or every 8th frame while held ($C18B). The
      // "STAGE N" number is rebuilt to track the change.
      case INTRO.SELECT:
        if (g.input.pressed(0, BTN.Start)) { this.seq = INTRO.START_STAGE; return null; } // $C179
        if (this._stageStep(BTN.A)) {                 // $C17F press / $C185 hold
          if (++g.stage === 0x24) g.stage = 0x23;     // $C195-$C1A1 — INC, clamp 36 -> 35
          this.curtain = buildStageCurtain(g.stage);
        } else if (this._stageStep(BTN.B)) {          // $C1A4 press / $C1AA hold
          if (--g.stage === 0) g.stage = 1;           // $C1BA-$C1C2 — DEC, clamp 0 -> 1
          this.curtain = buildStageCurtain(g.stage);
        }
        return null;

      // bra_C1C5 ($C1C5) — build the field behind the closed curtain.
      case INTRO.START_STAGE:
        // $C1D4/$C1D9: sub_C9B0 + sub_F000_draw_stage build the field.
        g.field.loadStage(g.stageGrid());
        // $C1DC sub_CAF5_draw_default_base — stamp the eagle + HQ walls over the
        // freshly-drawn field (Base/S6). The base region is empty in stage data.
        g.base.drawDefault(g.field);
        // TODO, each waiting on another subsystem:
        //   $C1C7-$C1CD ram_sfx_stage_load_* — the load jingle (Audio, deferred).
        //   $C1D0/$C1E2 the editor path — keep the constructed field, draw just the
        //     eagle (sub_CB5D_draw_default_eagle; Construction mode, deferred; §6c).
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

  // $C17F-$C18F / $C1A4-$C1B4 — a stage-select button "fires" on a fresh PRESS, or
  // every 8th frame while HELD (auto-repeat). A press bypasses the frame gate; on any
  // fire, frm_cnt_lo resets to 0 ($C191/$C1B6) so the next held repeat is 8 frames out.
  _stageStep(btn) {
    const g = this.game;
    const fire = g.input.pressed(0, btn) ||
      (g.input.held(0, btn) && (g.frm.lo & 0x07) === 0);
    if (fire) g.frm.lo = 0;
    return fire;
  }

  // The curtain wipe. Grey grows IN from the top and bottom edges (CLOSE, $CC90),
  // holds with "STAGE N" (SELECT), then the field is revealed OUT from the centre
  // (OPEN, $CCB2). The ROM draws it one row per frame (rows Y and $1D-Y, the counter
  // walking edges<->centre); here it is a band clip driven by this.t (0..16).
  /** @param {Renderer} renderer */
  render(renderer) {
    const N = TILEMAP_ROWS;
    if (this.seq === INTRO.CURTAIN_CLOSE) {
      renderer.drawTilemapRows(this.curtain, BG_PAL_INTRO, 0, 0, 0, this.t);       // top
      renderer.drawTilemapRows(this.curtain, BG_PAL_INTRO, 0, 0, N - this.t, N);   // bottom
    } else if (this.seq === INTRO.CURTAIN_OPEN) {
      renderer.drawTilemap(this.curtain, BG_PAL_INTRO, 0, 0);                       // grey base
      renderer.drawTilemapRows(this.game.field.tilemap, BG_PAL_STAGE, 0, 0,        // field band
        Math.max(0, 15 - this.t), Math.min(N, 15 + this.t));
    } else {
      renderer.drawTilemap(this.curtain, BG_PAL_INTRO, 0, 0);                       // SELECT
    }
  }
}

// sub_CA91_print_word_stage_and_number ($CA91): the fully-closed grey $11 screen with
// "STAGE  N" centered, as one tilemap. render() animates the $CC90/$CCB2 wipe by
// clipping bands of this and the field.
function buildStageCurtain(stage) {
  const tm = new Tilemap();
  tm.tiles.fill(TILE.BORDER);                                    // $CC90 — grey $11
  tm.writeTiles(STAGE_TEXT_COL, STAGE_TEXT_ROW, STAGE_TILES);    // $CAA9-$CAC3 "STAGE"
  const digits = String(stage).split('').map((d) => DIGIT_BASE_STAGE + Number(d));
  tm.writeTiles(STAGE_NUM_COL, STAGE_TEXT_ROW, digits);          // $CADB-$CAED the number
  return tm;
}

// The battlefield: the field ($0400 buffer) with every sprite layer on top — the four
// PPU layers (backdrop -> behind-BG sprites -> BG (colour-0 transparent) -> front sprites).
// SHARED by Battle ($C200 loop) and Tail ($C238 loop): both run mainBattleScript and both
// draw the same world with the same sprite calls ($C206/$C209 in Battle, $C247/$C244 in
// Tail), all OUTSIDE the $C2E6 pipeline — so they belong in render(). The sliding GAME
// OVER message (sub_C947, gated) rides on top of everything; the blinking PAUSE text
// ($C21B sub_C8F9) is Battle-only (the Tail loop does not call it).
/** @param {import('../game.js').Game} g  @param {Renderer} renderer */
function renderBattlefield(g, renderer, { pause = false } = {}) {
  // The water shimmer rides the live bgPaletteId ($C31D swaps it 02<->01 every 32 frames).
  renderer.beginSpriteLayers();
  g.roster.render(renderer, g.frm.lo, g.field);      // $C209/$C244 sub_DEA6 — tanks + spawn star
  g.bullets.render(renderer);                        // $C206/$C247 sub_E0D8 — bullet + hit sprites
  g.roster.drawShields(renderer, g.frm.lo);          // $E27C draw half — spawn helmet
  g.base.render(renderer);                           // $E2A9 step 6 — the eagle explosion
  g.drawGameOverText(renderer);                      // $C310 / sub_C947 — the sliding message (gated)
  if (pause) drawPauseText(g, renderer);             // $C21B sub_C8F9 — Battle only
  // OAM priority (lowest index = front-most): the message/PAUSE > eagle explosion (step 6)
  // > shields (step 7) > bullets > tanks. The front list paints in enqueue order (last on
  // top), so enqueuing tanks..message paints them back-to-front — the ROM's OAM order.
  renderer.flushSprites(true);                       // behind-BG (forest-covered) sprites
  renderer.drawTilemap(g.field.tilemap, g.bgPaletteId, 0, 0, true);   // BG, transparent index 0
  renderer.flushSprites(false);                      // front sprites, on top
}

// sub_C8F9_display_pause_text ($C8F9) — the blinking "PAUSE" readout, shown only while
// paused AND (frm_cnt_lo & 0x10) != 0 (16 frames on, 16 off). Five 8x16 front sprites
// (the BG-glyph letters P A U S E), palette 3, all at Y=0x80.
/** @param {import('../game.js').Game} g  @param {Renderer} renderer */
function drawPauseText(g, renderer) {
  if (!g.paused) return;                                  // $C8F9-$C8FB
  if ((g.frm.lo & PAUSE_TEXT.BLINK_MASK) === 0) return;   // $C8FD-$C901 — the blink
  for (const [x, tile] of PAUSE_TEXT.SPRITES) {           // $C90B-$C934
    renderer.drawSprite(tile, x, PAUSE_TEXT.Y, PAUSE_TEXT.PALETTE);
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

    // The ROM's Battle loop runs three RENDER-half calls after the pipeline, all
    // OUTSIDE the pause gate: $C203 $E23B display_bonus, $C206 $E0D8 bullets_status,
    // $C209 $DEA6 tanks. Tanks are drawn in render() now (roster.render); bonus + bullet
    // sprites join it when Bonus / Bullet rendering land.

    if (g.input.pressed(0, BTN.Start)) {   // $C210
      g.paused = !g.paused;                // $C212-$C216
      // TODO: $C218 ram_sfx_pause. Pausing MUTES ($EA7E reads the flag) — that is
      // Battle's fact, separate from the demo's silence. Flow doc §6e.
    }
    // $C21B sub_C8F9_display_pause_text — the blinking PAUSE text, now drawn in render()
    // (drawPauseText, the render half) since it emits sprites.

    return g.checkStageEnding() ? DONE : null;   // $C21E / $C221
  }

  // The battlefield, via the shared renderBattlefield (Battle + Tail draw the same world).
  // Battle also draws the blinking PAUSE text ($C21B). Both the tank/bullet sprite draws
  // ($C206/$C209) and PAUSE sit OUTSIDE the $C2E6 pipeline in the ROM — the render half —
  // so they are render(), not update(). They keep running even while paused (the ROM jumps
  // past $C200 to $C203 on pause), which is why sprites still show on the pause screen.
  /** @param {Renderer} renderer */
  render(renderer) {
    renderBattlefield(this.game, renderer, { pause: true });
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
    // The render-half calls that follow in the ROM's Tail loop: $C244 $DEA6 tanks +
    // $C247 $E0D8 bullets are drawn in render() (shared renderBattlefield); $C24A $C31D
    // is a redundant SECOND water swap (mainBattleScript step 18 already ran it this
    // frame — idempotent). $C241 $E23B display_bonus is still deferred (Bonus/S7).
    return g.frm.hi === TAIL_END_HI ? DONE : null;   // $C24D-$C251
  }

  // The frozen battlefield keeps rendering through the tail — explosions finish and the
  // sliding GAME OVER message climbs over it. The ROM draws it with the same sprite calls
  // Battle uses ($C244 $DEA6 tanks / $C247 $E0D8 bullets), outside the pipeline, so it is
  // render() and shares renderBattlefield. No PAUSE here (the Tail loop omits sub_C8F9).
  /** @param {Renderer} renderer */
  render(renderer) {
    renderBattlefield(this.game, renderer);
  }
}

// --- sub_CCD4_score_after_stage_handler ($CCD4) — the tally ------------------
// The between-stage count-out. sub_CEF7 ($CEF7) draws a fresh screen (header, the four
// enemy-type rows, the players' scores); sub_CCD4 then tallies each player's per-type
// kills ONE AT A TIME into a per-type TEMP subtotal — display only, because the real
// score was already credited at kill time ($E824, P10). The tally NEVER re-adds to the
// running score; its only real-score write is the 2P survivor bonus. Full decode:
// docs/research_tally.md.
//
// A paced phase machine. game.killCounts (P10) is consumed here — DEC'd one kill per
// pass the way the ROM does ($CD30/$CD4E) — while the running subtotal + killed count
// are Tally's own display fields. The waits are player-observable timing (frames ->
// frames); the ROM's exact per-pass housekeeping frame is not reproduced (a ~1-frame
// cadence detail an emulator does better), same class as the curtain-wipe band clip.
const TALLY_PHASE = Object.freeze({
  PRE: 'PRE',                // $CCD7 — wait, then total the per-type counts
  KILL: 'KILL',              // loc_CD10 — tally one kill (each player) per KILL_STEP
  BETWEEN: 'BETWEEN',        // $CDEE — wait between exhausted types
  TOTALS: 'TOTALS',          // bra_CDF4 — draw the totals
  POST_TOTALS: 'POST_TOTALS',// $CE21 — wait, then decide bonus vs exit
  BONUS: 'BONUS',            // bra_CE2B — the 2P survivor's 1000-pt bonus
  FINAL: 'FINAL',            // loc_CEE5 — the closing hold, then the exit reset
});

// ram_0060 = $30, con_bg_pal_03, ram_006B_flag = 1 -> a per-call number-print spec (the
// ROM's $2800/$0060/$006B are CPU-only render state; we pass the equivalents each call).
const TALLY_NUM = { first: 1, minDigits: TALLY.MIN_DIGITS, digitBase: TALLY.DIGIT_BASE };

const sum4 = (a) => a[0] + a[1] + a[2] + a[3];

class Tally extends Mode {
  enter() {
    const g = this.game;
    g.audio.clear();   // $C253 sub_EA51
    // ram_game_mode / ram_2nd_loop_flag — 2P OR the attract demo shows player 2's column.
    this.two = g.gameMode === GAME_MODE.TWO_PLAYERS || g.secondLoop === SECOND_LOOP.DEMO;
    this.screen = buildTallyScreen(g, this.two);   // sub_CEF7 — the static screen, once
    this.tempScore = [0, 0];      // ram_p1/p2_temp_score ($25/$2D) — reset per type
    this.killedCount = [0, 0];    // ram_005D/005E_killed_enemies_cnt — reset per type
    this.totalKills = [0, 0];     // ram_p1/p2_total_kills ($7D/$7E)
    this.type = 0;                // ram_005A_t22_enemy_type_counter
    this.didKill = false;         // ram_007C_flag — did this pass tally anything?
    this.phase = TALLY_PHASE.PRE;
    this.t = 0;
  }

  update() {
    const g = this.game;
    switch (this.phase) {
      case TALLY_PHASE.PRE:
        if (++this.t < TALLY.PRE_WAIT) return null;                   // $CCD7 wait $1E
        // $CCDC-$CCF4 — total kills = the four per-type counts summed, per player. Read
        // BEFORE the count DECs them.
        this.totalKills = [sum4(g.killCounts[0]), sum4(g.killCounts[1])];
        this.type = 0;                                                // $CCF8
        this._resetType();                                            // loc_CCFA clears
        this.phase = TALLY_PHASE.KILL;
        this.t = 0;
        return null;

      // loc_CD10 — one pass: tally one kill for each player with kills of this type left,
      // then hold KILL_STEP frames; repeat while a kill was tallied, else next type.
      case TALLY_PHASE.KILL:
        if (this.t === 0) this._tallyPass();                          // $CD1A-$CD5B
        if (++this.t < TALLY.KILL_STEP) return null;                  // $CDDA wait $08
        this.t = 0;
        if (this.didKill) return null;                                // $CDDF -> loc_CD10
        if (++this.type >= 4) { this.phase = TALLY_PHASE.TOTALS; return null; } // $CDE8 CMP #$04
        this.phase = TALLY_PHASE.BETWEEN;                             // $CDEC wait $14 next
        return null;

      case TALLY_PHASE.BETWEEN:
        if (++this.t < TALLY.BETWEEN_TYPES) return null;              // $CDEE wait $14
        this.t = 0;
        this._resetType();                                           // loc_CCFA
        this.phase = TALLY_PHASE.KILL;
        return null;

      case TALLY_PHASE.TOTALS:
        if (++this.t < TALLY.TOTALS_WAIT) return null;                // $CDF4 wait $1E
        this.t = 0;
        drawNumber(this.screen, this.totalKills[0], TALLY.P1_TOTAL.col, TALLY.P1_TOTAL.row, TALLY_NUM); // $CE02/$CE07
        if (this.two) {
          drawNumber(this.screen, this.totalKills[1], TALLY.P2_TOTAL.col, TALLY.P2_TOTAL.row, TALLY_NUM); // $CE17/$CE1C
        }
        this.phase = TALLY_PHASE.POST_TOTALS;
        return null;

      case TALLY_PHASE.POST_TOTALS:
        if (++this.t < TALLY.POST_TOTALS_WAIT) return null;           // $CE21 wait $0F
        this.t = 0;
        // $CE24-$CE2F — 1P skips the bonus; 2P skips it once the base is destroyed
        // (game_over_flag == 0). The survivor bonus only makes sense mid-run.
        this.phase = (this.two && !g.base.isDestroyed())
          ? TALLY_PHASE.BONUS : TALLY_PHASE.FINAL;
        return null;

      case TALLY_PHASE.BONUS:
        this._awardBonus();
        this.phase = TALLY_PHASE.FINAL;
        return null;

      case TALLY_PHASE.FINAL:
        if (++this.t < TALLY.FINAL_HOLD) return null;                 // $CEE5 wait $78
        // $CEEA-$CEF4 — the exit reset. base_nmt / ram_0060 / ram_006B are CPU-only
        // render state (we pass their equivalents per-call), so only the palette carries.
        g.bgPaletteId = 0x00;                                         // $CEF4 con_bg_pal_00
        return DONE;
    }
    return null;
  }

  // loc_CD10's body: DEC one kill for each player who has kills of this type left, add its
  // points to that player's TEMP subtotal (idx 2/3, NOT the real score), bump the killed
  // count. didKill drives whether another pass runs. Points are tbl_D3D1 == ENEMY_KILL_POINTS.
  _tallyPass() {
    const g = this.game;
    const type = this.type;
    const pts = ENEMY_KILL_POINTS[type];
    this.didKill = false;
    for (let p = 0; p < 2; p++) {
      if (g.killCounts[p][type] > 0) {   // $CD24 / $CD42 BEQ — skip when this type is done
        g.killCounts[p][type]--;         // $CD30 / $CD4E DEC ram_p1/p2_enemy_type_kill_cnt
        this.killedCount[p]++;           // $CD32 / $CD50 INC killed_enemies_cnt
        this.tempScore[p] += pts;        // $CD34-$CD36 / $CD52-$CD54 add_score -> TEMP idx 2/3
        this.didKill = true;             // $CD3B / $CD59 ram_007C_flag = 1
        // TODO: ram_sfx_score_count ($CD2A) — Audio (deferred).
        // sub_D138 ($CD3D/$CD5B): the extra-life check is a NO-OP here — the real score
        // was credited at kill time (P10), so 20000 was already crossed. Not called.
      }
    }
    this._redrawCounters();
  }

  // loc_CCFA — clear this type's subtotal + killed count for both players, and redraw the
  // now-zero cells. The ROM clears the BCD temp score ($CD00) and killed_enemies_cnt ($CD0C).
  _resetType() {
    this.tempScore = [0, 0];
    this.killedCount = [0, 0];
    this._redrawCounters();
  }

  // Redraw the current type row's dynamic numbers (the scores are static, drawn once). P1's
  // subtotal + count on the left; P2's on the right in 2P. Positions are the ROM's posX/posY.
  _redrawCounters() {
    const row = TALLY.TYPE_ROW0 + this.type * 3;                      // $CD74 ASL/ADC #$0C
    drawNumber(this.screen, this.tempScore[0], TALLY.P1_TEMP_COL, row, TALLY_NUM);   // $CD6E
    drawNumber(this.screen, this.killedCount[0], TALLY.P1_COUNT_COL, row, TALLY_NUM); // $CD89
    if (this.two) {
      drawNumber(this.screen, this.tempScore[1], TALLY.P2_TEMP_COL, row, TALLY_NUM);   // $CDAD
      drawNumber(this.screen, this.killedCount[1], TALLY.P2_COUNT_COL, row, TALLY_NUM); // $CDC8
    }
  }

  // bra_CE32-$CED4 — the higher total-kills scorer, if still alive, gets +1000 on the real
  // score (this IS the only real-score write in the tally). A tie awards nobody.
  _awardBonus() {
    const g = this.game;
    const [k1, k2] = this.totalKills;
    if (k2 < k1 && g.lives[0] > 0) this._payBonus(0, TALLY.BONUS_P1);       // $CE34-$CE8A
    else if (k1 < k2 && g.lives[1] > 0) this._payBonus(1, TALLY.BONUS_P2);  // $CE8D-$CED4
  }

  _payBonus(player, pos) {
    const g = this.game;
    g.score.add(g, player, TALLY.BONUS_POINTS);   // $CE43/$CE9E add 1000 (+extra life at 20000)
    drawNumber(this.screen, g.scores[player], pos.scoreCol, TALLY.P1_SCORE.row, TALLY_NUM); // redraw score, row 9
    drawNumber(this.screen, TALLY.BONUS_POINTS, pos.numCol, pos.numRow, TALLY_NUM);          // the "1000"
    this.screen.writeTiles(pos.textCol, pos.textRow, TALLY.BONUS);   // "BONUS!" tbl_D3C4
    this.screen.writeTiles(pos.ptsCol, pos.ptsRow, TALLY.PTS);        // "PTS"    tbl_D35E
    // TODO: ram_sfx_bonus_1000 ($CE7C) — Audio (deferred).
  }

  // sub_CEF7 draws the score screen; sub_D0B8 redraws the four enemy-type icons as SPRITES
  // (palette 2) every frame. The BG is a persistent Tilemap; the icons are drawn here.
  /** @param {Renderer} renderer */
  render(renderer) {
    renderer.drawTilemap(this.screen, TALLY.BG_PAL, 0, 0);
    for (let type = 0; type < 4; type++) {                            // sub_D0B8
      const tile = TALLY.ICON_TILE[type];
      const y = TALLY.ICON_Y[type];
      renderer.drawSprite(tile, (TALLY.ICON_X - 8) & 0xFF, y, TALLY.ICON_PALETTE);
      renderer.drawSprite(tile + 2, TALLY.ICON_X, y, TALLY.ICON_PALETTE);
    }
  }
}

// sub_CEF7_draw_screen_with_score_count ($CEF7) — the static tally screen, built once as a
// Tilemap: the sub_D0D9 attribute regions, the header (HI-SCORE / STAGE / I-PLAYER [/ II-
// PLAYER]), and each type row's arrow + "PTS". The dynamic numbers are drawn by Tally.
function buildTallyScreen(g, two) {
  const tm = new Tilemap();
  // sub_D0D9_prepare_nametable_attributes ($D0D9) — per-cell BG sub-palette regions.
  for (const [r0, r1, c0, c1, pal] of TALLY.ATTR_REGIONS) {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) tm.setPalette(c, r, pal);
  }
  writeText(tm, TALLY.HI_SCORE);                                              // $CF2D
  drawNumber(tm, g.hiScore, TALLY.HI_NUM.col, TALLY.HI_NUM.row, TALLY_NUM);   // $CF34/$CF39
  writeText(tm, TALLY.STAGE);                                                 // $CF48
  drawNumber(tm, g.stage, TALLY.STAGE_NUM.col, TALLY.STAGE_NUM.row, TALLY_NUM); // $CF54/$CF59
  writeText(tm, TALLY.I_PLAYER);                                              // $CF6B
  drawNumber(tm, g.scores[0], TALLY.P1_SCORE.col, TALLY.P1_SCORE.row, TALLY_NUM); // $CF72/$CF77
  if (two) {
    writeText(tm, TALLY.II_PLAYER);                                           // $CFC9
    drawNumber(tm, g.scores[1], TALLY.P2_SCORE.col, TALLY.P2_SCORE.row, TALLY_NUM); // $CFD0/$CFD5
  }
  // The four type rows: P1 <- arrow + "PTS" ($CF86..); P2 -> arrow + "PTS" ($CFE4..) in 2P.
  for (let type = 0; type < 4; type++) {
    const row = TALLY.TYPE_ROW0 + type * 3;
    tm.setTile(TALLY.ARROW_COL_L, row, TALLY.ARROW_LEFT);
    tm.writeTiles(TALLY.PTS_COL_L, row, TALLY.PTS);
    if (two) {
      tm.setTile(TALLY.ARROW_COL_R, row, TALLY.ARROW_RIGHT);
      tm.writeTiles(TALLY.PTS_COL_R, row, TALLY.PTS);
    }
  }
  return tm;
}
