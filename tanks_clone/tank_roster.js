// tank_roster.js — S3 Tank roster (the 8 slots)
//
// Owns the 8 tanks (0=P1, 1=P2, 2..7 enemies — decoded), the per-frame draw+state
// loop, enemy spawn scheduling, per-stage enemy setup, and player invincibility.
//
// Absorbs:
//   sub_DEA6_tanks_handler ($DEA6)   — loop X=0..7 → Tank.handle()
//   sub_E363_tank_spawn_handler ($E363)          — spawn a player/enemy into a slot
//   sub_DB48_enemy_spawn_handler ($DB48)         — spawn next enemy when slot free
//   sub_E42B_prepare_enemy_tanks_for_stage ($E42B)
//   sub_E27C_players_invincibility_handler ($E27C)
//   sub_E413_clear_some_tank_addresses ($E413), sub_E420_change_tank_status ($E420)
// See docs/research_system_interaction_map.md §5 (S3).

import { MAX_TANKS } from './constants.js';
import { Tank } from './tank.js';

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
  // This is the RENDER half, not a pipeline step — see Tank.handle(). frameLo is
  // ram_frm_cnt_lo, which the draw needs for the enemy flicker and the stun blink.
  handleAll(renderer, frameLo) {
    for (const tank of this.tanks) tank.handle(renderer, frameLo);
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
    for (const tank of this.tanks) { tank.state = 0; tank.dir = 0; }
  }

  // pipeline: step 2 ($DB75) slide tanks flagged on ice; step 3 ($DBF1) move all
  // tanks — players by input, enemies delegate to EnemyAI. Both loop the roster.
  iceMovement(field) { /* TODO: port $DB75 (per tank -> Tank.iceMove) */ }
  movement(input, ai, field) { /* TODO: port $DBF1 (per tank -> Tank.move) */ }

  spawnPlayer(slot) { /* TODO: port $E363 */ }
  spawnEnemyTick() { /* TODO: port $DB48 */ }
  prepareForStage(stage) { /* TODO: port $E42B */ }
  updateInvincibility() { /* TODO: port $E27C */ }
}
