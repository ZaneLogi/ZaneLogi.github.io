// tank_roster.js — S3 Tank roster (the 8 slots)
//
// Owns the 8 tanks (0=P1, 1=P2, 2..7 enemies — decoded), the per-frame draw+state
// loop, enemy spawn scheduling, per-stage enemy setup, and player invincibility.
//
// Absorbs:
//   sub_DEA6_tanks_handler ($DEA6)   — loop X=0..7 → Tank.render()
//   sub_E363_tank_spawn_handler ($E363)          — spawn a player/enemy into a slot
//   sub_DB48_enemy_spawn_handler ($DB48)         — spawn next enemy when slot free
//   sub_E42B_prepare_enemy_tanks_for_stage ($E42B)
//   sub_E27C_players_invincibility_handler ($E27C)
//   sub_E413_clear_some_tank_addresses ($E413), sub_E420_change_tank_status ($E420)
// See docs/research_system_interaction_map.md §5 (S3).

import { MAX_TANKS, PLAYER_SPAWN } from './constants.js';
import { Tank } from './tank.js';

/**
 * @typedef {import('./renderer.js').Renderer} Renderer
 * @typedef {import('./input.js').Input} Input
 * @typedef {import('./field.js').Field} Field
 */

export class TankRoster {
  constructor() {
    this.tanks = Array.from({ length: MAX_TANKS }, (_, i) => new Tank(i));
    // enemy spawn bookkeeping
    this.enemySpawnCount = 0;   // ram_enemy_spawn_cnt ($7F)
    this.enemiesLeft = 0;       // ram_enemies_left_cnt ($80)
    this.enemyLimit = 0;        // ram_enemy_limit ($6C)
    this.spawnInterval = 0;     // ram_enemy_spawn_interval ($84)
    this.spawnTimer = 0;        // ram_enemy_timer_before_spawn ($82)
    this.spawnPosIndex = 0;     // ram_enemy_spawn_pos_index ($6A)
  }

  get players() { return this.tanks.slice(0, 2); }
  get enemies() { return this.tanks.slice(2); }

  // sub_DEA6_tanks_handler ($DEA6) — every slot, 0..7, unconditionally ($DEB3
  // CMP #$08). Empty slots cost a dispatch and return; the ROM does not track
  // which are live.
  //
  // This is the RENDER half, not a pipeline step — see Tank.render(). frameLo is
  // ram_frm_cnt_lo, which the draw needs for the enemy flicker and the stun blink.
  // `field` (optional) feeds the sprite-vs-forest priority probe; the menu passes none.
  /** @param {Renderer} renderer  @param {number} frameLo  @param {Field} [field] */
  render(renderer, frameLo, field) {
    for (const tank of this.tanks) tank.render(renderer, frameLo, field);
  }

  // sub_E413_clear_some_tank_addresses ($E413) — zero every slot's flags.
  //
  // The ROM's loop also writes ram_0103_plr_flags,X for X = 0..7, and the
  // disassembly flags that as a bug: ram_0103 + 8 runs off the end of the array and
  // clobbers ram_game_over_msg_pos_X/_Y/_timer, ram_debug_address_index and
  // ram_010A. That overrun is a zero-page LAYOUT accident with no counterpart in an
  // object model — not ported, and nothing depends on it (the menu has no game-over
  // message to corrupt).
  clearAll() {
    for (const tank of this.tanks) {
      tank.state = 0; tank.dir = 0;
      tank.onIce = false; tank.slideTimer = 0;   // $E419 STA ram_0103_plr_flags,X
    }
  }

  // sub_DB75 ($DB75) — player control (pipeline step 2). Players only. The gate is
  // the SAME 3/4-frame cadence as the move step ($DB77-$DB7F): process every frame
  // whose lo is odd or a multiple of 4 — i.e. skip only lo % 4 == 2.
  /** @param {Input} input  @param {number} frameLo */
  controlPlayers(input, frameLo) {
    if ((frameLo & 1) === 0 && (frameLo & 3) !== 0) return;   // $DB77-$DB7F
    for (const tank of this.players) tank.control(input);
  }

  // sub_DBF1 ($DBF1) — the move step (pipeline step 3). A player moves 3 of every 4
  // frames ($DC09-$DC13, the same gate as control). Enemies (slots 2..7) get their
  // move from EnemyAI (deferred) — none are drivable yet, so this is players only.
  /** @param {Field} field  @param {number} frameLo */
  moveTanks(field, frameLo) {
    const playerGated = (frameLo & 1) === 0 && (frameLo & 3) !== 0;
    for (const tank of this.tanks) {
      if (tank.isPlayer) {
        if (!playerGated) tank.moveStep(field);
      }
      // TODO: enemy movement ($DC18 clock/type gate + EnemyAI) when EnemyAI lands.
    }
  }

  // sub_E363_tank_spawn_handler ($E363), player path — place a player at its spawn
  // point in the RESPAWN state; the move step then animates it in (Tank.spawn).
  spawnPlayer(slot) {
    const tank = this.tanks[slot];
    const spawn = PLAYER_SPAWN[slot];   // tbl_E47A/E47C
    tank.type = 0;                      // $E365
    tank.x = spawn.x; tank.y = spawn.y; // $E36B-$E373
    tank.stunTimer = 0;                 // $E377
    tank.spawn();                       // $E379 -> loc_E3A9
  }

  spawnEnemyTick() { /* TODO: port $DB48 */ }
  prepareForStage(stage) { /* TODO: port $E42B */ }

  // sub_E27C_players_invincibility_handler ($E27C), UPDATE half (pipeline step 7):
  // count the spawn helmet down one tick every 64 frames. The ROM routine also
  // WRITES the shield's OAM here; our Mode contract keeps drawing in render(), so
  // the shield sprite lives in drawShields() below (same faithful behaviour, split).
  /** @param {number} frameLo */
  updateInvincibility(frameLo) {
    for (const tank of this.players) {
      if (tank.helmetTimer === 0) continue;                 // $E284 BEQ helmet off
      if ((frameLo & 0x3F) === 0) tank.helmetTimer--;       // $E286-$E28C DEC each 64 frames
    }
  }

  // sub_E27C draw half ($E28E-$E2A1) — the flickering spawn shield around any player
  // whose helmet is active. Two 8x16 sprites (sub_DA7B), palette 2; the tile alternates
  // $29 / $2D every 2 frames (`(lo & 2) << 1) + $29`). Drawn ON TOP of the tank: the
  // shield's OAM is written in the pipeline (step 7), earlier than sub_DEA6's tank OAM
  // ($C209), so it has the lower index and higher sprite priority.
  /** @param {Renderer} renderer  @param {number} frameLo */
  drawShields(renderer, frameLo) {
    for (const tank of this.players) {
      if (tank.helmetTimer === 0) continue;
      const tile = ((frameLo & 0x02) << 1) + 0x29;          // $E297-$E29D
      renderer.drawSprite(tile, tank.x - 8, tank.y, 2);     // sub_DA7B left, palette 2
      renderer.drawSprite(tile + 2, tank.x, tank.y, 2);     // right
    }
  }
}
