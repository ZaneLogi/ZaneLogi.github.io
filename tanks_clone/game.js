// game.js — S1 Session / mode / stage flow  (the orchestrator)
//
// Owns every subsystem and runs the frame. Holds session state: mode, stage,
// lives (2), game-over flag, per-player score.
//
// The heart of this class is update() — it calls the subsystems in the EXACT
// order of sub_C2E6_main_battle_script ($C2E6). That order is a FAITHFULNESS
// INVARIANT (map §3): collisions must run after movement, bonus pickup after
// collisions, etc. Reordering changes behavior, so keep it literal.
//
// Absorbs:
//   vec_C070_RESET boot, tbl_CA69_game_mode_handler (mode dispatch),
//   the per-mode stage loops ($C200/$C23E/$C429),
//   sub_C331_prepare_tanks_addresses_and_spawn_players_before_stage ($C331),
//   sub_C728_check_condition_for_stage_ending ($C728),
//   sub_CCD4_score_after_stage_handler ($CCD4),
//   sub_C31D_water_palette_swap_handler ($C31D).
// See docs/research_system_interaction_map.md §2, §3, §5 (S1).

import { Field } from './field.js';
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

    // session state
    this.mode = 0;        // ram_game_mode ($83): 0=1P, 1=2P, 2=construction
    this.stage = 0;       // ram_stage ($85)
    this.lives = [0, 0];  // ram_lives ($51)
    this.gameOver = false;// ram_game_over_flag ($68)
    this.frame = 0;       // ram_frm_cnt_lo/hi ($0B/$0A)
    this.clockTimer = 0;  // ram_clock_timer ($0100) — enemy freeze
  }

  boot() { /* TODO: port $C070 reset + title/demo loop + mode dispatch (tbl_CA69) */ }
  prepareStage() { /* TODO: port $C331 */ }

  // ---- one frame ----
  // In the ROM this is split main-loop (logic) + NMI (input/audio/render); here
  // it collapses into one rAF tick, preserving the once-per-frame semantics.
  tick() {
    this.input.sample();   // ROM: read joypad in NMI ($D689)
    this.update();         // ROM: sub_C2E6_main_battle_script logic pipeline
    this.draw();           // ROM: sub_DEA6_tanks_handler + NMI render
    this.audio.tick();     // ROM: sub_EA7E_sound_driver in NMI (deferred stub)
    this.frame++;          // ROM: INC ram_frm_cnt_lo in NMI
  }

  // sub_C2E6_main_battle_script ($C2E6) — the 18-step pipeline, IN ORDER.
  update() {
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

  draw() {
    this.renderer.beginFrame();
    this.renderer.drawField(this.field);
    this.roster.handleAll(this.renderer);  // $DEA6 draw + state machine
    this.renderer.endFrame();
  }

  updateGameOverText() { /* TODO: port $C972 */ }
  waterPaletteSwap() { /* TODO: port $C31D — swap bg palette every 32 frames */ }
}
