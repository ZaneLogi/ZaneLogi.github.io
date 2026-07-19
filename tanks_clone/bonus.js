// bonus.js — Bonus / power-ups
//
// A single on-field bonus (ram_bonus_pos_X/Y $86/$87, ram_bonus_id $88, ram_0062
// bonus_timer $62). A bonus-carrier enemy (the 4th/11th/18th of the stage — marked
// TANK_TYPE.BONUS_FLAG by sub_E363) drops one when hit; a player who drives over it
// gets 500 points and an effect that reaches into several subsystems:
//   helmet -> Tank.helmetTimer ($89)     invincibility (already drawn by the roster)
//   clock  -> Game.clockTimer ($0100)    freezes enemy move + fire
//   shovel -> Base.applyShovel            fortify the HQ walls (already ported P8)
//   star   -> Tank.type / Game.tankUpgrade  upgrade tier (drives bullet FAST/POWER/2-shot)
//   grenade-> explode every live enemy    (no score — unlike shooting them)
//   tank   -> Game.lives[player]++         an extra life
//   pistol -> no-op ($EA48 RTS; never spawns)
//
// Absorbs:
//   sub_E8BE_spawn_bonus ($E8BE)                    -> spawn
//   sub_E902_convert_random_number_to_position ($E902) -> bonusPos
//   sub_E23B_display_bonus_on_screen ($E23B)        -> updateDisplay (state) + render
//   sub_E972_try_to_pick_up_bonus ($E972)           -> tryPickup + the 7 effect handlers
// See docs/research_bonus.md and docs/research_system_interaction_map.md §5 (S7).

import {
  MAX_TANKS, SECOND_LOOP,
  BONUS_ID, BONUS_ID_TABLE, BONUS_POS, BONUS_PICKUP_RANGE, BONUS_FLASH_TIMER,
  BONUS_PICKUP_POINTS, BONUS_HELMET_TIMER, BONUS_CLOCK_TIMER, BONUS_STAR_STEP,
  BONUS_STAR_MAX, BONUS_SENTINEL_ID, BONUS_SPRITE_BASE, BONUS_SCORE_SPRITE,
  BONUS_PALETTE, BONUS_BLINK_MASK,
} from './constants.js';
import { SFX } from './assets/dat_sfx.js';

/**
 * @typedef {import('./game.js').Game} Game
 * @typedef {import('./tank.js').Tank} Tank
 * @typedef {import('./renderer.js').Renderer} Renderer
 */

// sub_E902 ($E902) — a random 0-3 -> a pixel on the 4x4 spawn grid: ((n*3)*2 + 6) << 3
// gives $30/$60/$90/$C0. BONUS_POS is the closed form.
/** @param {import('./rng.js').Rng} rng  @param {number} frameHi */
function bonusPos(rng, frameHi) {
  return BONUS_POS[rng.next(frameHi) & 0x03];   // $E8C6 AND #$03 -> $E902
}

export class Bonus {
  constructor() {
    this.x = 0;        // ram_bonus_pos_X ($86) — 0 means "no bonus on the field"
    this.y = 0;        // ram_bonus_pos_Y ($87)
    this.id = 0;       // ram_bonus_id ($88) — 0-6, or $FF during the spawn-position search
    this.timer = 0;    // ram_0062_bonus_timer ($62) — the post-pickup "500" flash countdown
  }

  get active() { return this.x !== 0; }

  // $C36D (in sub_C331 prepareStage) — a fresh stage starts with no bonus.
  reset() { this.x = 0; this.timer = 0; }

  // $E3A5-$E3A7 — a newly-spawned bonus-carrier enemy hides any bonus still on the field
  // (so two never coexist). Called from the roster's spawnEnemy.
  hide() { this.x = 0; }

  // sub_E8BE_spawn_bonus ($E8BE) — a bonus-carrier enemy was killed. Pick a random grid
  // position that is NOT on top of a player (the retry loop), then a weighted-random id.
  /** @param {Game} game */
  spawn(game) {
    game.audio.play(SFX.BONUS_APPEAR);              // $E8C0 ram_sfx_bonus_appear
    const { rng, frm } = game;
    do {                                            // bra_E8C3_loop
      this.x = bonusPos(rng, frm.hi);               // $E8C3-$E8CB
      this.y = bonusPos(rng, frm.hi);               // $E8CD-$E8D5
      this.id = BONUS_SENTINEL_ID;                  // $E8D7-$E8D9 $FF — a probe, not a real id
      this.timer = 0;                               // $E8DB-$E8DD
      // $E8DF sub_E972: with id=$FF this is just a position check — it sets timer=$32 if
      // the spot lands on a player, and applies NO effect ($E9AE BMI skips). Retry if so.
      this.tryPickup(game);                         // $E8DF
    } while (this.timer !== 0);                       // $E8E2-$E8E4 landed on a player -> retry
    this.id = BONUS_ID_TABLE[rng.next(frm.hi) & 0x07]; // $E8E6-$E8EF tbl_E8FA weighted roll
    this.timer = 0;                                 // $E8F1-$E8F3 (clear the probe's would-be flash)
  }

  // sub_E23B_display_bonus_on_screen ($E23B), STATE half. The ROM's routine runs OUTSIDE
  // sub_C2E6 (from the loop body at $C203/$C241), so it ticks even while paused. It DECs
  // the post-pickup flash timer and clears the bonus when the flash expires. The waiting
  // (timer 0) branch mutates nothing — its blink is render-only (see render()).
  updateDisplay() {
    if (this.x === 0) return;              // $E23B-$E23D no bonus
    if (this.timer === 0) return;          // $E23F-$E241 -> bra_E259 (waiting; render only)
    if (--this.timer === 0) this.x = 0;    // $E243-$E24B DEC; 0 -> the bonus is gone
  }

  // sub_E23B RENDER half ($E24E / $E259-$E274). Two 8x16 sprites (sub_DA7B: tile @ x-8,
  // tile+2 @ x), palette 2, as a FRONT sprite (priority_spr_A = 0). While flashing
  // (timer != 0) it shows the "500" number tile; while waiting it shows the bonus icon,
  // blinking on frm_cnt_lo & $08.
  /** @param {Renderer} renderer  @param {number} frameLo */
  render(renderer, frameLo) {
    if (this.x === 0) return;                            // $E23B-$E23D
    let sprT;
    if (this.timer !== 0) {                              // bra_E24E — the "500" pickup flash
      sprT = BONUS_SCORE_SPRITE;                         // $E252 spr_T = $3B
    } else {                                             // bra_E259 — the on-field icon
      if ((frameLo & BONUS_BLINK_MASK) === 0) return;    // $E259-$E25D blink: hidden this frame
      sprT = this.id * 4 + BONUS_SPRITE_BASE;            // $E263-$E26A id*4 + $81
    }
    renderer.drawSprite(sprT, (this.x - 8) & 0xFF, this.y, BONUS_PALETTE);   // sub_DA7B left
    renderer.drawSprite(sprT + 2, this.x, this.y, BONUS_PALETTE);            // right
  }

  // sub_E972_try_to_pick_up_bonus ($E972) — pipeline step 14. If a live player is within
  // the pickup box, start the flash, award 500 (unless the attract demo), and apply the
  // effect. Scans players 1 then 0, so P2 wins a tie. Only the first grabs it; the ROM's
  // PLA/PLA + JMP (handler) is a tail-call to the effect, then RTS to mainBattleScript.
  /** @param {Game} game */
  tryPickup(game) {
    if (this.x === 0) return;                            // $E972-$E974 no bonus
    if (this.timer !== 0) return;                        // $E976-$E978 flashing / probe locked
    for (let p = 1; p >= 0; p--) {                       // $E97A-$E97E players 1,0
      const player = game.roster.tanks[p];
      if (!player.isDrivable) continue;                  // $E980-$E986 exploding/respawning
      if (Math.abs(player.x - this.x) >= BONUS_PICKUP_RANGE) continue;   // $E988-$E996
      if (Math.abs(player.y - this.y) >= BONUS_PICKUP_RANGE) continue;   // $E998-$E9A6
      // --- picked up ---
      this.timer = BONUS_FLASH_TIMER;                    // $E9A8-$E9AA = $32
      if (this.id & 0x80) return;                        // $E9AE BMI — the $FF spawn probe: no effect
      if (game.secondLoop !== SECOND_LOOP.DEMO) {        // $E9B0-$E9B4 the demo scores nothing
        game.score.add(game, p, BONUS_PICKUP_POINTS);    // $E9B6-$E9C0 +500 (+ extra life at 20000)
        game.audio.play(SFX.BONUS_PICKUP);               // $E9C7 ram_sfx_bonus_pickup
      }
      this._applyEffect(game, player);                   // $E9CA-$E9DA tbl_E9E2 dispatch
      return;                                            // handler RTS -> return to the caller
    }
  }

  // tbl_E9E2 ($E9E2) — dispatch the picked-up id to its effect handler.
  /** @param {Game} game  @param {Tank} player */
  _applyEffect(game, player) {
    switch (this.id) {
      case BONUS_ID.HELMET:  player.helmetTimer = BONUS_HELMET_TIMER; break;   // $E9F0
      case BONUS_ID.CLOCK:   game.clockTimer = BONUS_CLOCK_TIMER; break;       // $E9F5
      case BONUS_ID.SHOVEL:  game.base.applyShovel(game.field); break;         // $E9FB
      case BONUS_ID.STAR:    this._star(game, player); break;                  // $EA07
      case BONUS_ID.GRENADE: this._grenade(game); break;                       // $EA17
      case BONUS_ID.TANK:    game.lives[player.slot]++; break;                 // $EA3E
      case BONUS_ID.PISTOL:  break;                                            // $EA48 RTS
    }
  }

  // ofs_bonus_EA07_03_star ($EA07) — upgrade the picking-up player one tier ($20 per star,
  // capped at $60). Written to BOTH the live tank type (immediate: bullets get FAST/POWER,
  // the sprite shows the upgraded tank) and the persistent Game.tankUpgrade (so the tier
  // survives the per-stage respawn — Tank.becomeDrivable restores it; death zeroes it).
  /** @param {Game} game  @param {Tank} player */
  _star(game, player) {
    const cur = game.tankUpgrade[player.slot];           // $EA07 LDA tank_upgrade,X
    if (cur === BONUS_STAR_MAX) return;                  // $EA0A-$EA0C already max
    const next = cur + BONUS_STAR_STEP;                  // $EA0E-$EA0F CLC ADC #$20
    game.tankUpgrade[player.slot] = next;                // $EA11 STA tank_upgrade,X
    player.type = next;                                  // $EA14 STA tank_type,X
  }

  // ofs_bonus_EA17_04_grenade ($EA17) — every live enemy explodes at once. No score and no
  // per-type kill count (unlike shooting them): the explosion runs to death, DECing
  // enemiesLeft as each finishes, but game.awardKill is never called.
  /** @param {Game} game */
  _grenade(game) {
    game.audio.play(SFX.EXPLOSION_ENEMY);                // $EA1D ram_sfx_explosion_enemy
    for (let x = MAX_TANKS - 1; x >= 2; x--) {           // $EA17-$EA3B enemies 7..2
      const enemy = game.roster.tanks[x];
      if (!enemy.isDrivable) continue;                   // $EA25 BPL / $EA29 >= $E0 skip
      enemy.explode();                                   // $EA2B flags = $73 (explosion+3)
      enemy.type = 0;                                    // $EA30-$EA32
    }
  }
}
