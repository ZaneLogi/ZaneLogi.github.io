// game.js — S1 Session / mode / stage flow  (the orchestrator)
//
// Owns every subsystem, drives the MODE MACHINE, and holds session state.
//
// Two things this class is NOT:
//   - It is not the battle loop. mainBattleScript() is $C2E6 — a SHARED BODY with
//     exactly three callers (Battle $C200, Tail $C23E, the demo $C429), not a tick.
//   - It is not a phase dispatcher of its own invention. The mode graph lives in
//     flow.js; Game just drives it. See mode.js and docs/research_game_flow.md §7.
//
// Absorbs:
//   vec_C070_RESET boot ($C070) -> boot()
//   sub_C2B3_clear_score_and_prepare_player_data ($C2B3) -> resetSession()
//   sub_C728_check_condition_for_stage_ending ($C728)    -> checkStageEnding()
//   $C259-$C280 the post-tally stage/loop/game-over decision -> advanceStage()
//   sub_C331_prepare_tanks_addresses_... ($C331)         -> prepareStage()
//   sub_C2E6_main_battle_script ($C2E6)                  -> mainBattleScript()
//   sub_C31D_water_palette_swap_handler ($C31D), sub_C972 ($C972)
// See docs/research_system_interaction_map.md §2, §3, §5 (S1).

import { Field } from './field.js';
import { Tilemap } from './tilemap.js';
import { TankRoster } from './tank_roster.js';
import { EnemyAI } from './enemy_ai.js';
import { BulletManager } from './bullet.js';
import { Base } from './base.js';
import { Bonus } from './bonus.js';
import { Score } from './score.js';
import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Rng } from './rng.js';

import { DONE } from './mode.js';
import { MODE, NEXT } from './flow.js';
import { Attract, ATTRACT_AT } from './modes/attract.js';
import { Session } from './modes/session.js';
import { GameOver } from './modes/game_over.js';
import { HallOfFame } from './modes/hall_of_fame.js';
import { Editor } from './modes/editor.js';

import { GAME_MODE, SECOND_LOOP, ENEMIES_PER_STAGE } from './constants.js';

const MODES = Object.freeze({
  [MODE.ATTRACT]: Attract,
  [MODE.SESSION]: Session,
  [MODE.GAME_OVER]: GameOver,
  [MODE.HALL_OF_FAME]: HallOfFame,
  [MODE.EDITOR]: Editor,
});

// ram_frm_cnt_lo ($0B) + ram_frm_cnt_hi ($0A).
//
// NOT a 16-bit pair, despite the names. $D43E does AND #$3F / BNE / INC, so hi
// ticks every 64 FRAMES — and the game WRITES hi as a timer ($C236 seeds #$FE,
// $C24D waits for #$02). Collapsing them into one counter breaks both the RNG
// ($D45A mixes hi in) and the ending tail's fuse. Map §1.
class FrameCounter {
  constructor() { this.lo = 0; this.hi = 0; }
  bump() {                                    // $D43C / $D43E, inside the NMI
    this.lo = (this.lo + 1) & 0xFF;
    if ((this.lo & 0x3F) === 0) this.hi = (this.hi + 1) & 0xFF;
  }
  reset() { this.lo = 0; this.hi = 0; }       // $C223-$C227
}

// ram_game_over_msg_pos_X/_Y/_mov_type/_timer ($0105-$0108) — the sliding sprite
// message, animated by sub_C972 ($C972, pipeline step 15).
class GameOverMessage {
  constructor() { this.posX = 0; this.posY = 0; this.movType = 0; this.timer = 0; }

  // $C737 — the REAL game over: slides UP from off-screen, and the stage ends.
  // (The 2P "one player is out but the other plays on" message is a DIFFERENT
  // site — $DE18 -> sub_DE46 ($DE46) — which slides in from the side and does not
  // end the stage. Same four variables, same animator. Flow doc §6f.)
  begin() {
    this.posX = 0x70;      // $C737
    this.posY = 0xF0;      // $C73C
    this.movType = 0;      // $C741 — move up
    this.timer = 0x11;     // $C746
  }
}

export class Game {
  constructor(canvas) {
    this.rng = new Rng();
    this.input = new Input();
    this.field = new Field();
    this.roster = new TankRoster();
    this.ai = new EnemyAI(this.rng);
    this.bullets = new BulletManager();
    this.base = new Base();
    this.bonus = new Bonus();
    this.score = new Score();
    this.renderer = new Renderer(canvas);
    this.audio = new Audio();

    this.frm = new FrameCounter();
    this.gameOverMsg = new GameOverMessage();

    // --- persistent: outlives a run ---
    this.hiScore = 20000;
    this.constrUsageCnt = 0;   // ram_constr_usage_cnt ($4B) — the editor's memory (§6c)
    this.hiddenCutsceneCnt = 0;   // ram_hidden_cutscene_action_cnt ($4A) — $C9E0 clears
                                  // it on every menu entry; $CA4F fires at $74 (§6c)

    // The title screen, standing analog of PPU nametable $2800. It lives here, not
    // on Attract, because the ROM draws it ONCE (sub_D17F at $C095) and then loops
    // back in at $C09C — so it survives every menu -> demo -> scroll cycle, and the
    // editor's $C0A2 re-entry finds it still there. An Attract-owned map would be
    // rebuilt on each setMode and lost on the editor path. Flow doc §4 [1].
    this.titleMap = new Tilemap();

    // --- session state: cleared by resetSession() ($C2B3) ---
    // It lives on Game, not on a Session object (the map's §7 lock), which is what
    // lets GameOver read the final scores with no handoff.
    this.gameMode = GAME_MODE.ONE_PLAYER;  // ram_game_mode ($83) — tbl_CA69's index
    this.stage = 0;                        // ram_stage ($85)
    this.lives = [0, 0];                   // ram_lives ($51)
    this.scores = [0, 0];                  // ram_p1_score ($15) / ram_p2_score ($1D)
    this.secondLoop = SECOND_LOOP.FIRST;   // ram_2nd_loop_flag ($46) — also flags the demo
    this.stageSelectUsed = false;          // ram_004C_flag ($4C) — see §6a for the name
    this.tankUpgrade = [0, 0];             // ram_tank_upgrade ($0101)
    this.extraLife = [0, 0];               // ram_p1/p2_extra_life ($66/$67)
    this.enemyLimit = 5;                   // ram_enemy_limit ($6C)
    this.enemiesLeft = 0;                  // ram_enemies_left_cnt ($80)
    this.clockTimer = 0;                   // ram_clock_timer ($0100) — enemy freeze
    this.paused = false;                   // ram_pause_flag ($6D)
    this.scrollY = 0;                      // ram_scroll_Y ($4F)

    // --- the mode machine ---
    this.modeId = null;
    this.mode = null;
  }

  // vec_C070_RESET ($C070) -> loc_C095. RESET does not touch session state; that
  // is sub_C2B3's job at the ATTRACT -> SESSION transition.
  boot() {
    this.input.attach();
    this.setMode(MODE.ATTRACT, { at: ATTRACT_AT.SCROLL });
  }

  setMode(id, args = {}) {
    this.mode?.exit();
    this.modeId = id;
    this.mode = new MODES[id](this, args);   // fresh instance — flow doc §7.4(3)
    this.mode.enter();
  }

  // ---- one logic frame @ NTSC_FPS ----
  //
  // The order here is vec_D400_NMI's own (map §1), and it is not arbitrary. The
  // NMI fires WHILE the main loop is parked in sub_D8F6_wait_1_frm, so every frame
  // is render -> input -> audio -> counter -> update, with update LAST, reading
  // what the NMI just refreshed. Two things a naive order gets wrong by one frame:
  // sfx that update() queues into ram_sfx_* are consumed by the NEXT NMI, and the
  // main loop always reads a counter the NMI has already advanced. Put either
  // after update() and every `frm_cnt_lo &` timer (§6f), the menu cursor's wheels
  // ($C9E9) and the water swap ($C31D) sit one frame out of phase.
  tick() {
    this.input.sample();   // sub_D689_read_joy_regs ($D689)   — NMI step 5
    this.audio.tick();     // sub_EA7E_sound_driver ($EA7E)     — NMI step 7
    this.frm.bump();       // INC ram_frm_cnt_lo ($D43C)        — NMI step 8
    if (this.mode.update() === DONE) this.setMode(...NEXT[this.modeId](this));
  }

  // NMI steps 1-4 (OAM DMA + the PPU write-buffer flush). Driven by rAF, not by
  // tick() — see main.js. Must not mutate state.
  render() {
    this.renderer.beginFrame();
    this.mode.render(this.renderer);
    this.renderer.endFrame();
  }

  // ---- session flow ----

  // sub_C2B3_clear_score_and_prepare_player_data ($C2B3).
  // Runs at the mode dispatch ($CA78), i.e. when a run STARTS — the constructor
  // for a run, expressed as a method because the state lives on Game.
  resetSession() {
    this.scores = [0, 0];              // $C2B3-$C2BA sub_D9FE_clear_bcd_number x2
    this.preparePlayerData();          // falls through into $C2BD
  }

  // sub_C2BD_prepare_player_data ($C2BD) — the ROM's second entry point into the
  // routine above, and it is called on its own by sub_C3B5_demo_settings ($C3BD).
  // That is the whole reason the split exists: the demo re-arms the players but
  // must NOT clear the scores on the title screen behind it.
  preparePlayerData() {
    this.tankUpgrade = [0, 0];         // $C2BF
    this.extraLife = [0, 0];           // $C2C7
    this.stageSelectUsed = false;      // $C2CB ram_004C_flag = 0 -> stage select armed
    this.lives = [3, 3];               // $C2CD-$C2D1
    // $C2D5-$C2DB: in 1P, P2's lives are zeroed — "he won't spawn if his lives
    // are 00" (the ROM's own comment). Absence of lives IS the disable mechanism.
    if (this.gameMode === GAME_MODE.ONE_PLAYER) this.lives[1] = 0;
    this.stage = 1;                    // $C2DF
    this.secondLoop = SECOND_LOOP.FIRST;   // $C2E3
  }

  // sub_C728_check_condition_for_stage_ending ($C728). True = end the stage.
  //
  // THE ORDER OF THESE THREE TESTS IS LOAD-BEARING. The ROM checks the eagle, then
  // enemies-left, then lives — so "last enemy killed on the same frame the last
  // life is lost" ends the stage with NO game-over message ($C72E returns before
  // $C730 is reached). Reordering silently changes that case.
  //
  // Setting up the message is this routine's own side effect ($C737), not a
  // caller's: bra_C737 falls THROUGH into bra_C74F, so both paths return 1.
  checkStageEnding() {
    if (this.base.isDestroyed()) {                  // $C72A BEQ -> $C737
      this.beginGameOverMessage();
      return true;
    }
    if (this.enemiesLeft === 0) return true;        // $C72E -> $C74F, no message
    if (this.lives[0] + this.lives[1] === 0) {      // $C730-$C735 -> $C737
      this.beginGameOverMessage();
      return true;
    }
    return false;                                   // $C752
  }

  beginGameOverMessage() {
    this.gameOverMsg.begin();   // $C737-$C746
    this.frm.lo = 0;            // $C74B
  }

  // $C259-$C280 — after the tally. Returns true to run another stage.
  //
  // There is no ending: 1..35 is the 1st loop, 36..70 the 2nd (drawn as 1..35 via
  // $F009's SBC #$23), and 71 wraps back to 1 AND clears the flag — so loop 3 is
  // loop 1 again, forever. The only terminal state is game over. Flow doc §5.
  advanceStage() {
    this.stage++;                                   // $C259
    if (this.stage === 0x47) {                      // $C25D — 71
      this.stage = 1;                               // $C261
      this.secondLoop = SECOND_LOOP.FIRST;          // $C267
    }
    if (this.stage === 0x24) {                      // $C26B — 36
      this.secondLoop = SECOND_LOOP.SECOND;         // $C271
    }
    if (this.lives[0] + this.lives[1] === 0) return false;   // $C273-$C278
    // $C27A-$C280 tests ram_game_over_flag == con_not_game_over. We keep the
    // BEHAVIOUR — the eagle must not have finished exploding — but not the
    // tri-state byte; Base owns its own state + timer. Flow doc §6b/§7.8.
    return !this.base.isDestroyed();
  }

  // sub_C331_prepare_tanks_addresses_and_spawn_players_before_stage ($C331).
  prepareStage() {
    this.enemiesLeft = ENEMIES_PER_STAGE;   // $C355/$C357 — 20 ($14)
    this.frm.hi = 0;                        // $C35D
    this.constrUsageCnt = 0;                // $C35F — a constructed stage plays ONCE (§6c)
    this.base.reset();                      // $C386-$C388 game_over_flag = con_not_game_over
    this.stageSelectUsed = true;            // $C38F ram_004C_flag = 1 (§6a)
    // TODO: the rest of $C331 — clear bullets/tanks, spawn surviving players,
    //   ram_enemy_spawn_cnt, clear the power-up timers ($C361-$C367), draw the 20
    //   enemy icons ($C377 sub_C8C0), sub_C830/sub_C859 HUD icons,
    //   sub_E42B_prepare_enemy_tanks_for_stage ($C383);
    //   the spawn interval $BE - stage*4, minus $14 in 2P ($C391-$C3B2).
  }

  // sub_D97D_check_hiscore_beaten ($D97D).
  hiScoreBeaten() { /* TODO: port $D97D */ return false; }

  // ---- sub_C2E6_main_battle_script ($C2E6) — the 18-step pipeline, IN ORDER ----
  //
  // A SHARED BODY, not a tick: Battle ($C200), Tail ($C23E) and the demo ($C429)
  // are its only three callers. The order is a FAITHFULNESS INVARIANT (map §3) —
  // collisions must run after movement, bonus pickup after collisions. Keep it
  // literal.
  mainBattleScript() {
    this.field.iceDetectAndMarkOccupancy(this.roster);            // 1  $E181 ice_detection
    this.roster.iceMovement(this.field);                          // 2  $DB75 ice_movement
    this.roster.movement(this.input, this.ai, this.field);        // 3  $DBF1 tank_movement
    this.field.occupancyWriteback(this.roster);                   // 4  $E1FA
    this.bullets.updateStatus();                                  // 5  $E02E
    this.base.update(this.field, this);                           // 6  $E2A9 HQ_handler
    this.roster.updateInvincibility();                            // 7  $E27C
    this.bullets.playerFire(this.roster, this.input);             // 8  $E122 player fire
    this.bullets.enemyFire(this.roster, this.ai, this.clockTimer);// 9  $E162 enemy fire
    this.roster.spawnEnemyTick();                                 // 10 $DB48 enemy_spawn
    this.bullets.move(this.field, this.base);                     // 11 $E604 bullets_movement
    this.bullets.collideWithBullets();                            // 12 $E910
    this.bullets.collideWithTanks(this.roster, this.score);       // 13 $E70C
    this.bonus.tryPickup(this.roster, this.base, this, this.score);// 14 $E972
    this.updateGameOverText();                                    // 15 $C972
    this.audio.movementSfx(this.roster);                          // 16 $DB0B (deferred)
    this.score.drawLives(this.renderer, this.lives);              // 17 $C7C8
    this.waterPaletteSwap();                                      // 18 $C31D
  }

  // sub_C972_game_over_text_handler ($C972) — animates gameOverMsg.
  // Returns immediately in the demo ($C979 CMP #con_flag_demo) — the attract mode
  // never shows GAME OVER. Flow doc §6f.
  updateGameOverText() { /* TODO: port $C972 */ }

  waterPaletteSwap() { /* TODO: port $C31D — swap bg palette every 32 frames */ }
}
