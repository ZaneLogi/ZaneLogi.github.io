// tank_roster.js — Tank roster (the 8 slots)
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

import {
  MAX_TANKS, PLAYER_SPAWN, ENEMY_SPAWN, ENEMIES_PER_STAGE, TANK_TYPE,
  BONUS_SPAWN_COUNTS, SECOND_LOOP_STAGE, SECOND_LOOP,
} from './constants.js';
import { STAGE_ENEMY_TYPES, STAGE_ENEMY_COUNTS } from './assets/dat_levels.js';
import { Tank } from './tank.js';

/**
 * @typedef {import('./renderer.js').Renderer} Renderer
 * @typedef {import('./input.js').Input} Input
 * @typedef {import('./field.js').Field} Field
 */

export class TankRoster {
  constructor() {
    this.tanks = Array.from({ length: MAX_TANKS }, (_, i) => new Tank(i));
    // Enemy spawn bookkeeping. (ram_enemies_left_cnt $80, the DEFEAT counter, lives
    // on Game — it gates stage ending and is decremented on enemy death; here we own
    // the SPAWN machinery only.)
    this.enemySpawnCount = 0;   // ram_enemy_spawn_cnt ($7F) — enemies left to spawn
    this.enemyLimit = 0;        // ram_enemy_limit ($6C) — highest enemy slot (max concurrent)
    this.spawnInterval = 0;     // ram_enemy_spawn_interval ($84) — frames between spawns
    this.spawnTimer = 0;        // ram_enemy_timer_before_spawn ($82)
    this.spawnPosIndex = 0;     // ram_enemy_spawn_pos_index ($6A) — cycles the 3 top slots
    // Per-stage enemy type schedule (sub_E42B / sub_E3B8).
    this.enemyTypes = STAGE_ENEMY_TYPES[0];        // the 4 type bytes for this stage
    this.enemyTypeCount = [0, 0, 0, 0];            // ram_enemy_type_stage_cnt ($8B) — mutable
    this.enemyTypeOffset = 0;                      // ram_enemy_type_offset ($8F)
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

  // sub_DBF1_tank_movement ($DBF1) — the move step (pipeline step 3). Loops 7->0.
  // Players move 3 of every 4 frames ($DC09-$DC13). Enemies are gated by the clock
  // freeze then a per-type speed gate, and dispatched through their status handler.
  //
  // Players move on the 3/4-frame cadence; each live enemy passes the clock-freeze
  // and per-type speed gates, then runs its status handler through enemyAI.drive
  // (respawn included). The AI context is per-frame constant (the two players, the
  // stage clock + spawn interval that bias the enemy's target choice).
  /**
   * @param {Field} field  @param {number} frameLo  @param {number} clockTimer
   * @param {import('./enemy_ai.js').EnemyAI} enemyAI  @param {number} frameHi
   */
  moveTanks(field, frameLo, clockTimer, enemyAI, frameHi, game) {
    // $DBF5-$DC00 — the clock-freeze countdown: while a clock power-up is armed, DEC it
    // once every 64 frames. (The clock bonus arms clock_timer; otherwise it is 0, a no-op.) The
    // freeze gate below and enemy fire (step 9) then read the post-DEC value.
    if (clockTimer !== 0 && (frameLo & 0x3F) === 0 && game) {
      clockTimer = game.clockTimer = (clockTimer - 1) & 0xFF;   // $DC00 DEC ram_clock_timer
    }
    const playerGated = (frameLo & 1) === 0 && (frameLo & 3) !== 0;   // $DC09-$DC13
    const ctx = { frameHi, spawnInterval: this.spawnInterval, players: [this.tanks[0], this.tanks[1]], game };
    for (let slot = MAX_TANKS - 1; slot >= 0; slot--) {
      const tank = this.tanks[slot];
      if (tank.isPlayer) {
        // Under the 3/4 gate: drive, or (when exploding) tick the explosion — moveStep
        // dispatches both. game is needed only for the explosion's death branch.
        if (!playerGated) tank.moveStep(field, game);
        continue;
      }
      // --- enemy ($DC18) ---
      // Clock freeze: a live drivable enemy is frozen while clock_timer != 0;
      // exploding ($DC1F BPL) and respawning ($DC21 CMP #$E0) enemies proceed.
      if (clockTimer !== 0 && tank.state >= 0x80 && tank.state < 0xE0) continue;  // $DC1D-$DC23
      // Speed gate ($DC25-$DC33): a FAST tank (type & $F0 == $A0) moves every frame;
      // any other enemy moves only when (slot ^ frm_cnt_lo) & 1 != 0 — alternate
      // frames, staggered by slot so the enemies don't all step in lockstep.
      const fast = (tank.type & 0xF0) === TANK_TYPE.FAST_HI;
      if (!fast && ((slot ^ frameLo) & 1) === 0) continue;   // $DC2D-$DC33
      enemyAI.drive(tank, field, ctx);                       // $DC35 sub_DC3D dispatch
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

  // sub_E42B_prepare_enemy_tanks_for_stage ($E42B) + the enemy slice of sub_C331
  // ($C331). Load this stage's type counts and reset the spawn counters. The 2nd
  // loop reuses stage $23's schedule ($E42F); `enemyLimit` (1P 5 / 2P 7) and
  // `spawnInterval` are computed by Game.prepareStage and handed in.
  /** @param {{stage:number, secondLoop:number, enemyLimit:number, spawnInterval:number}} p */
  prepareForStage({ stage, secondLoop, enemyLimit, spawnInterval }) {
    const idx = (secondLoop === SECOND_LOOP.SECOND ? SECOND_LOOP_STAGE : stage) - 1;
    this.enemyTypes = STAGE_ENEMY_TYPES[idx];         // tbl_E4EC[stage]
    this.enemyTypeCount = [...STAGE_ENEMY_COUNTS[idx]]; // tbl_E578[stage] -> $8B (copy: consumed)
    this.enemyTypeOffset = 0;                         // $C35B
    this.enemySpawnCount = ENEMIES_PER_STAGE;         // $C355 — 20 to spawn
    this.spawnTimer = 0;                              // $C36B — first enemy spawns at once
    this.spawnPosIndex = 0;                           // $C372
    this.enemyLimit = enemyLimit;                     // $6C (mode-dependent)
    this.spawnInterval = spawnInterval;               // $84 (stage/mode-dependent)
  }

  // sub_DB48_enemy_spawn_handler ($DB48), pipeline step 10. When the inter-spawn
  // timer elapses and enemies remain, spawn the next one into the first FREE enemy
  // slot (scanning DOWN from enemyLimit to 2). No free slot -> nothing this frame,
  // which is the "max N enemies on screen" rule (4 in 1P, 6 in 2P).
  /**
   * @param {import('./field.js').Field} field  @param {import('./score.js').Score} score
   * @param {import('./bonus.js').Bonus} [bonus]  — a new bonus-carrier hides any live bonus
   */
  spawnEnemyTick(field, score, bonus) {
    if (this.spawnTimer > 0) { this.spawnTimer--; return; }   // $DB4A-$DB4E
    if (this.enemySpawnCount === 0) return;                   // $DB4F-$DB51 all spawned
    for (let slot = this.enemyLimit; slot >= 2; slot--) {     // $DB53-$DB72 scan enemy slots
      if (this.tanks[slot].state !== 0) continue;             // $DB59-$DB5B occupied
      this.spawnTimer = this.spawnInterval;                   // $DB5D-$DB5F reload
      this.spawnEnemy(slot, bonus);                           // $DB61 sub_E363
      this.enemySpawnCount--;                                 // $DB64
      // $DB66-$DB68: erase the reserve icon indexed by the post-decrement count
      // (drains the column bottom-up). S8-A / research_hud.md §2.
      score.eraseEnemyIcon(field, this.enemySpawnCount);
      return;
    }
  }

  // sub_E363_tank_spawn_handler ($E363), enemy path — place an enemy at the next of
  // the three top spawn points, mark the bonus-carriers, and assign its type, then
  // enter the RESPAWN state (Tank.spawn animates it in). The type write is sub_E3B8's
  // in the ROM; it is moved here (governing-test deviation, see Tank.becomeDrivable).
  /** @param {number} slot  @param {import('./bonus.js').Bonus} [bonus] */
  spawnEnemy(slot, bonus) {
    const tank = this.tanks[slot];
    this.spawnPosIndex = (this.spawnPosIndex + 1) % 3;   // $E37C-$E388 cycle 0/1/2
    const pos = ENEMY_SPAWN[this.spawnPosIndex];         // tbl_E474/E477
    tank.x = pos.x; tank.y = pos.y;                      // $E38A-$E391
    const carrier = BONUS_SPAWN_COUNTS.includes(this.enemySpawnCount);  // $E393-$E39F 4th/11th/18th
    tank.type = this._nextEnemyType(carrier ? TANK_TYPE.BONUS_FLAG : 0);
    if (carrier) bonus?.hide();                          // $E3A5-$E3A7 a new carrier hides any live bonus
    tank.spawn();                                        // $E3A9 loc_E3A9 -> RESPAWN ($F0)
  }

  // sub_E3B8 ($E3CB-$E408), enemy type assignment. Walk the type schedule: skip any
  // type-slot whose count is exhausted, consume one from the current slot, and return
  // its type byte. $E0 (armour) spawns as $E3 (a 3-hit counter in the low bits); the
  // bonus flag is OR'd in, and $E7 (armour+bonus) clamps to $E4.
  _nextEnemyType(bonusFlag) {
    while (this.enemyTypeCount[this.enemyTypeOffset] === 0) this.enemyTypeOffset++;  // $E3CB-$E3D4
    this.enemyTypeCount[this.enemyTypeOffset]--;                                     // $E3D7-$E3DA
    let type = this.enemyTypes[this.enemyTypeOffset];                               // tbl_E4EC
    if (type === TANK_TYPE.ARMOR) type |= TANK_TYPE.ARMOR_HP;                        // $E3F4-$E3F8 $E0->$E3
    type |= bonusFlag;                                                               // $E3FA ORA type
    if (type === 0xE7) type = 0xE4;                                                  // $E3FC-$E400
    return type;
  }

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
