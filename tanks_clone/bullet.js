// bullet.js — Bullets
//
// TEN flat slots:
//   0-7  each tank's primary bullet — bullet i belongs to tank i.
//   8-9  the two players' 2nd bullets — the "2 shots on screen" upgrade (players only).
//
// Absorbs:
//   sub_E08C_bullets ($E08C)                       — spawn a bullet            -> spawn
//   sub_E122 ($E122)                               — player fire (+ 2nd-bullet) -> playerFire
//   sub_E162 ($E162)                               — enemy fire (built P10)     -> enemyFire
//   sub_E02E_bullets_status_handler ($E02E)        — advance / explosion count  -> updateStatus
//   sub_E604_bullets_movement ($E604) + sub_E69A   — move + terrain collision   -> move/checkPoint
//   sub_E910_...collision_with_bullets ($E910)                                  -> collideWithBullets
//   sub_E70C_...collision_with_player_tanks ($E70C)                             -> collideWithTanks
//   sub_E0D8_bullets_status_handler ($E0D8) render half + sub_DEE2 ($DEE2)      -> render
//   sub_E409_clear_bullet_status ($E409)                                        -> clearAll
// See docs/research_bullets.md and docs/research_system_interaction_map.md §3, §5 (S5).

import {
  DIR_DX, DIR_DY, TILE, BTN_AB, SECOND_LOOP, MAX_TANKS,
  BULLET_STATE, BULLET_PROPERTY, BULLET_SLOTS, SECOND_BULLET_BASE,
  BULLET_TANK_RANGE, BULLET_BULLET_RANGE,
  BULLET_SPRITE_BASE, BULLET_SPRITE_X_OFFSET, BULLET_SPRITE_PALETTE,
  BULLET_EXPLOSION_PALETTE, BULLET_EXPLOSION_PHASES, BULLET_PHASE_FRAMES,
  BULLET_EXPLOSION_SPRITES, BULLET_PASS_MIN, EAGLE_TILE_BASE, STUN_TIMER_INIT,
} from './constants.js';

/**
 * @typedef {import('./field.js').Field} Field
 * @typedef {import('./base.js').Base} Base
 * @typedef {import('./tank_roster.js').TankRoster} TankRoster
 * @typedef {import('./input.js').Input} Input
 * @typedef {import('./renderer.js').Renderer} Renderer
 */

// sub_E08C ($E0BC-$E0D5) — the bullet's property from the firing tank's TYPE (upgrade /
// armour) HIGH nibble: 0-star player -> 0; a player star tier ($10-$50,$70) or a 200-pt
// enemy ($C0) -> FAST; a 3-star player ($60) -> FAST|POWER; any other enemy ($80+) -> 0.
function bulletPropertyForType(type) {
  const hi = type & 0xF0;
  if (hi === 0x00) return 0;                                              // $E0C0 BEQ
  if (hi === 0xC0) return BULLET_PROPERTY.FAST;                           // $E0C4 -> $E0CE
  if (hi === 0x60) return BULLET_PROPERTY.FAST | BULLET_PROPERTY.POWER;   // $E0C8 -> $E0D3
  if (hi & 0x80) return 0;                                                // $E0CC BNE
  return BULLET_PROPERTY.FAST;                                            // $E0CE fall-through
}

// The bullet-vs-tank hit box ($E72C-$E74C etc.): |dx| < $0A and |dy| < $0A. Plain abs
// (not the ROM's 8-bit two's-complement fold) — a bullet and its target are always
// within a few pixels, well clear of the 0/255 wrap, so the two agree. Same shape the
// P7 freeze (Part 3) uses.
function boxHit(bullet, tank) {
  return Math.abs(bullet.x - tank.x) < BULLET_TANK_RANGE &&
         Math.abs(bullet.y - tank.y) < BULLET_TANK_RANGE;
}

export class Bullet {
  constructor(index) {
    this.index = index;    // 0..9 — 0-7 tank primaries, 8-9 the players' 2nd bullets
    this.x = 0; this.y = 0;
    this.state = BULLET_STATE.INACTIVE;   // lifecycle
    this.dir = 0;                         // facing 0-3, set at spawn
    this.property = 0;                    // BULLET_PROPERTY bits (FAST / POWER)
    this.explosionPhase = 0;              // 3 -> 2 -> 1, the shrinking blast
    this.phaseFrame = 0;                  // 3 -> 0 within a phase
  }

  get active() { return this.state !== BULLET_STATE.INACTIVE; }
  get flying() { return this.state === BULLET_STATE.FLYING; }

  // isPlayerBullet — the player-owned slots {0,1,8,9}: the P1/P2 primaries (0,1) and
  // their 2nd bullets (8,9); slots 2-7 are enemy bullets. This is who can freeze a
  // player and whose bullets cancel another. The mask is $06 (bits 1-2), NOT $07,
  // because bit 0 only says which player and bit 3 only says primary-vs-2nd — so every
  // player bullet leaves bits 1 & 2 clear, and 2-7 are exactly the indices that don't.
  // The ROM's own AND #$06 / BNE ($E856 / $E916).
  //
  //   idx  bin   &$06  who
  //    0   0000   0    P1 primary
  //    1   0001   0    P2 primary
  //    2   0010   2    enemy
  //    3   0011   2    enemy
  //    4   0100   4    enemy
  //    5   0101   4    enemy
  //    6   0110   6    enemy
  //    7   0111   6    enemy
  //    8   1000   0    P1 2nd bullet
  //    9   1001   0    P2 2nd bullet
  get isPlayerBullet() { return (this.index & 0x06) === 0; }

  // the bullet hit something (a wall, a tank, the eagle):
  // start the explosion.
  explode() {
    this.state = BULLET_STATE.EXPLODING;
    this.explosionPhase = BULLET_EXPLOSION_PHASES;   // 3
    this.phaseFrame = BULLET_PHASE_FRAMES;           // 3
  }

  deactivate() { this.state = BULLET_STATE.INACTIVE; }

  // $E146-$E154 — promote a primary bullet into a 2nd-bullet slot (the 2-shot upgrade).
  copyFrom(other) {
    this.state = other.state;
    this.dir = other.dir;
    this.x = other.x;
    this.y = other.y;
    this.property = other.property;
    this.explosionPhase = other.explosionPhase;
    this.phaseFrame = other.phaseFrame;
  }

  // sub_E69A ($E69A) — resolve ONE sample point against terrain. Called several times per
  // frame across the bullet's cross-section (see BulletManager.move). Calls this.explode()
  // when the bullet hits a solid, and returns whether it chipped a BRICK (which is what
  // tells move() to also sample the far edge). px/py are 8-bit like the ROM.
  /** @param {Field} field  @param {Base} base */
  checkPoint(field, base, px, py) {
    px &= 0xFF; py &= 0xFF;
    if (!field.quadrantHit(px, py)) return false;      // $E69D-$E6A0 — nothing solid here
    const col = px >> 3, row = py >> 3;
    const tile = field.terrainAt(col, row);

    // $E6A2-$E6C3 — the eagle ($C8-$CB). Destroy it once; sub_C728 turns that into game
    // over a few frames later (Base owns the countdown). Now live — Base draws the eagle.
    if ((tile & 0xFC) === EAGLE_TILE_BASE) {           // $E6A4 AND #$FC / $E6A6 CMP #$C8
      if (!base.isDestroyed()) {                       // $E6AC BEQ — already gone, ignore
        base.onHit(field);                             // $E6AE-$E6BA (draws the destroyed eagle)
        this.explode();                                // $E6C0 LDA #$33
      }
      return false;                                    // $E6C3 -> loc_E709
    }
    if (tile >= BULLET_PASS_MIN) return false;         // $E6C8 CMP #$12 / BCS — fly over

    // $E6CC-$E6FF — a solid ($01-$11): the bullet explodes wherever it landed.
    this.explode();                                    // $E6CE-$E6D0 LDA #$33
    if (tile === TILE.BORDER) return false;            // $E6D4 CMP #$11 — indestructible wall
    if (this.property & BULLET_PROPERTY.POWER) {       // $E6D8 AND #$02
      field.clearTile(col, row);                       // $E6DE sub_D784 A=$00 — whole tile gone
      return false;
    }
    if (tile === TILE.STEEL) return false;             // $E6ED CMP #$10 — steel needs POWER
    field.chipQuadrant(px, py);                        // $E6FA sub_D743 — chip this brick quadrant
    return true;                                       // $E6FD LDA #$01 — chipped a brick
  }
}

export class BulletManager {
  constructor() {
    this.bullets = Array.from({ length: BULLET_SLOTS }, (_, i) => new Bullet(i));
  }

  // --- pipeline step 5: sub_E02E_bullets_status_handler ($E02E) ---
  // Advance flying bullets; count exploding ones down. Runs every frame (no gate here —
  // the frame gate is in move(), step 11); a normal bullet moves 2px/frame, a fast one 4.
  updateStatus() {
    for (let i = BULLET_SLOTS - 1; i >= 0; i--) {              // $E030 loop 9->0
      const b = this.bullets[i];
      if (b.state === BULLET_STATE.FLYING) {                  // ofs_002_E051 — advance
        this._advance(b);                                     // $E056 sub_E063 (2px)
        if (b.property & BULLET_PROPERTY.FAST) this._advance(b);   // $E05D — fast: again (4px)
      } else if (b.state === BULLET_STATE.EXPLODING) {        // ofs_002_E076 — explosion countdown
        if (--b.phaseFrame <= 0) {                            // $E076 DEC / $E07A this phase's frames up
          if (--b.explosionPhase <= 0) b.deactivate();        // $E083/$E085 last phase -> gone
          else b.phaseFrame = BULLET_PHASE_FRAMES;            // $E087 ORA #$03 — next phase, 3 frames
        }
      }
    }
  }

  // sub_E063 ($E063) — one 2px step in the bullet's direction.
  _advance(b) {
    b.x = (b.x + DIR_DX[b.dir] * 2) & 0xFF;   // $E063-$E06A tbl_E46C[dir] ASL + pos_X
    b.y = (b.y + DIR_DY[b.dir] * 2) & 0xFF;   // $E06C-$E073 tbl_E470[dir] ASL + pos_Y
  }

  // --- pipeline step 8: sub_E122 ($E122) — player fire ---
  /** @param {TankRoster} roster  @param {Input} input */
  playerFire(roster, input) {
    for (let x = 1; x >= 0; x--) {                            // $E124 players 1,0
      const tank = roster.tanks[x];
      if (!tank.isDrivable) continue;                         // $E128-$E12E exploding/respawning
      if ((input.press[x] & BTN_AB) === 0) continue;          // $E130-$E134 A or B pressed
      // $E136-$E158 — the 2-shot upgrade. With the upgrade AND the primary already flying,
      // shift the primary into the 2nd slot (if free) so a fresh one can spawn into it.
      // Without the upgrade, or with the primary free, fall straight to spawn.
      if ((tank.type & 0xC0) === 0x40 && this.bullets[x].active) {
        if (this.bullets[SECOND_BULLET_BASE + x].active) continue;         // $E142 both busy -> skip
        this.bullets[SECOND_BULLET_BASE + x].copyFrom(this.bullets[x]);    // $E146-$E154 promote
        this.bullets[x].deactivate();                                      // $E156-$E158 free primary
      }
      this.spawn(tank);                                       // $E15A sub_E08C (no-op if still busy)
    }
  }

  // sub_E08C_bullets ($E08C) — spawn into the tank's OWN primary slot (index == tank.slot).
  /** @param {import('./tank.js').Tank} tank */
  spawn(tank) {
    const b = this.bullets[tank.slot];
    if (b.active) return;                           // $E08E already active
    // TODO: ram_sfx_shot ($E094, players only) when Audio lands.
    const dir = tank.dir & 0x03;                    // $E099 tank_flags & $03
    b.state = BULLET_STATE.FLYING;                  // $E09E-$E0A0 ORA #$40
    b.dir = dir;
    b.x = (tank.x + DIR_DX[dir] * 8) & 0xFF;        // $E0A2-$E0AB tbl_E46C[dir]*8 + pos_X
    b.y = (tank.y + DIR_DY[dir] * 8) & 0xFF;        // $E0AD-$E0B6 tbl_E470[dir]*8 + pos_Y
    b.property = bulletPropertyForType(tank.type);  // $E0B8-$E0D5
  }

  // --- pipeline step 9: sub_E162 ($E162) — enemy fire ---
  // 1/32 RNG per drivable enemy per frame, frozen while the clock power-up is active.
  // One primary bullet each (no 2-shot upgrade — that is players only). shouldFire uses
  // the same LFSR that drives AI movement, so it takes frm_cnt_hi. research_enemy_combat §1.
  /** @param {TankRoster} roster  @param {import('./enemy_ai.js').EnemyAI} ai */
  enemyFire(roster, ai, clockTimer, frameHi) {
    if (clockTimer !== 0) return;                        // $E162-$E165 frozen
    for (let x = MAX_TANKS - 1; x >= 2; x--) {           // $E167-$E17E enemies 7..2
      const tank = roster.tanks[x];
      if (!tank.isDrivable) continue;                    // $E16B/$E16F exploding/respawning
      if (!ai.shouldFire(frameHi)) continue;             // $E171-$E176 random & $1F == 0
      this.spawn(tank);                                  // $E178 sub_E08C
    }
  }

  // --- pipeline step 11: sub_E604_bullets_movement ($E604) — move + terrain collision ---
  /** @param {Field} field  @param {Base} base  @param {number} frameLo */
  move(field, base, frameLo) {
    for (let i = BULLET_SLOTS - 1; i >= 0; i--) {             // $E606 loop 9->0
      const b = this.bullets[i];
      if (!b.flying) continue;                                // $E60C AND #$F0 / CMP #$40
      // Speed gate: a fast bullet is checked every frame; a normal one every OTHER frame,
      // keyed by (slot ^ frame) parity so the 10 bullets stagger. $E612-$E61B.
      if (b.property === 0 && ((i ^ frameLo) & 1) === 0) continue;

      const dir = b.dir;
      // The samples spread PERPENDICULAR to travel: spd = |DIR_DX|/|DIR_DY| swapped
      // (tbl_EA49 -> spd_Y, tbl_EA4D -> spd_X, both == tbl_E46C/E470), so an up/down bullet
      // samples across X and a left/right one across Y — covering its ~8px cross-section.
      const spdY = Math.abs(DIR_DX[dir]);   // |tbl_EA49[dir]|   $E622-$E630
      const spdX = Math.abs(DIR_DY[dir]);   // |tbl_EA4D[dir]|   $E632-$E640
      const nextY = spdY * 4, nextX = spdX * 4;                // $E62E/$E63E ASL ASL

      // Sample A at the centre; ONLY if it chipped a brick, sample B at the far +edge. The
      // conditional far-sample is what lets a bullet fly down a 1-wide corridor without
      // chipping the walls its edges brush. $E642-$E65C.
      if (b.checkPoint(field, base, b.x, b.y)) {
        b.checkPoint(field, base, b.x + nextX, b.y + nextY);
      }
      // Sample C at the near -edge; if it chipped, sample D at the far -edge. $E65F-$E688.
      if (b.checkPoint(field, base, b.x - spdX, b.y - spdY)) {
        b.checkPoint(field, base, b.x - nextX - spdX, b.y - nextY - spdY);
      }
    }
  }

  // --- pipeline step 12: sub_E910 ($E910) — bullet vs bullet ---
  // A PLAYER bullet (0,1,8,9) overlapping any OTHER bullet within 6px: both vanish, no
  // explosion. Enemy bullets are only ever the inner term, so two of them never cancel.
  collideWithBullets() {
    for (let x = BULLET_SLOTS - 1; x >= 0; x--) {             // $E912 outer 9->0
      const bx = this.bullets[x];
      if (!bx.isPlayerBullet) continue;                       // $E916 AND #$06
      if (!bx.flying) continue;                               // $E91E-$E922
      for (let y = BULLET_SLOTS - 1; y >= 0; y--) {           // $E926 inner 9->0
        if ((y & 0x07) === (x & 0x07)) continue;              // $E92B-$E935 skip self + own pair
        const by = this.bullets[y];
        if (!by.flying) continue;                             // $E93A-$E93E
        if (Math.abs(by.x - bx.x) >= BULLET_BULLET_RANGE) continue;   // $E940-$E94F
        if (Math.abs(by.y - bx.y) >= BULLET_BULLET_RANGE) continue;   // $E951-$E960
        bx.deactivate(); by.deactivate();                     // $E962-$E966 both cleared, silent
      }
    }
  }

  // --- pipeline step 13: sub_E70C ($E70C) — bullet vs tank ---
  // Three parts, in the ROM's order. Part 1 (enemy bullet -> player -> kill) and Part 2
  // (player bullet -> enemy -> damage/kill) are P10; Part 3 (player bullet -> the OTHER
  // player -> FREEZE) was P7. The kill's score-visible consequences (score, per-type
  // counters, kill-points popup) are Game.awardKill (S8-B); only the bonus drop is deferred
  // (Bonus/S7). research_enemy_combat.md §2/§7. Hit box: |dx| < $0A and |dy| < $0A per axis.
  /** @param {TankRoster} roster  @param {number} secondLoop  @param {import('./game.js').Game} game */
  collideWithTanks(roster, secondLoop, game) {
    // $E710 Part 1 — enemy bullet kills a player. For each player, scan the enemy bullets
    // (slots 2-7); a hit explodes the bullet, then a helmet absorbs it or the player dies.
    for (let p = 1; p >= 0; p--) {                            // $E710 players 1,0
      const player = roster.tanks[p];
      if (!player.isDrivable) continue;                       // $E712-$E71B exploding/respawning
      for (let bi = MAX_TANKS - 1; bi >= 2; bi--) {           // $E721 enemy bullets 7..2
        const b = this.bullets[bi];
        if (!b.flying) continue;                              // $E723-$E72A status $40
        if (!boxHit(b, player)) continue;                     // $E72C-$E74C
        b.explode();                                          // $E74E-$E750 status $33
        if (player.helmetTimer !== 0) { b.deactivate(); continue; } // $E753-$E75C helmet clears it, $E75C -> next bullet
        player.explode();                                     // $E75F-$E761 flags = $73
        player.type = 0;                                      // $E76D — star tier lost on death
        // TODO: ram_tank_upgrade[p] = 0 ($E76A) — Bonus/S7 (always 0 today);
        //       ram_sfx_explosion_player ($E765) — Audio.
        break;                                                // $E76F -> next player
      }
    }

    // $E782 Part 2 — a player bullet kills an enemy. For each enemy, scan the PLAYER
    // bullets (slots 0/1/8/9); armour survives with a decremented hit counter, otherwise
    // the enemy explodes.
    for (let x = MAX_TANKS - 1; x >= 2; x--) {                // $E782 enemies 7..2
      const tank = roster.tanks[x];
      if (!tank.isDrivable) continue;                         // $E784-$E78C exploding/respawning
      for (let bi = BULLET_SLOTS - 1; bi >= 0; bi--) {        // $E793 bullets 9..0
        const b = this.bullets[bi];
        if (!b.isPlayerBullet) continue;                      // $E795 AND #$06 — player bullets only
        if (!b.flying) continue;                              // $E79E-$E7A5 status $40
        if (!boxHit(b, tank)) continue;                       // $E7AA-$E7CA
        b.explode();                                          // $E7CC-$E7CE status $33
        if (tank.type & 0x04) {                               // $E7D1-$E7D5 bonus carrier
          // TODO: sub_E8BE_spawn_bonus ($E7D7) — Bonus/S7 (P10 defers the drop).
          if (tank.type === 0xE4) tank.type--;                // $E7DA-$E7E0 armour+bonus -> $E3
        }
        if ((tank.type & 0x03) !== 0) {                       // $E7E2-$E7E6 armour still alive
          tank.type--;                                        // $E7E8 one hit off; survive
          // TODO: ram_sfx_bullet_hit_tank ($E7EA) — Audio.
          continue;                                           // $E7EF -> next bullet
        }
        tank.explode();                                       // $E7F2-$E7F4 flags = $73
        // $E7FB-$E827 (S8-B) — the score-visible half: per-type kill count + points to
        // the bullet's owner. The bullet slot's low bit is which player fired it ($E806).
        // ram_sfx_explosion_enemy ($E7F8) — Audio, deferred.
        game.awardKill(tank, bi & 1, secondLoop === SECOND_LOOP.DEMO);
        break;                                                // done with this enemy
      }
    }

    // $E83F Part 3 — THE FREEZE. A player hit by the OTHER player's bullet is STUNNED, not
    // killed (unless shielded / already stunned / in the demo). The whole P-vs-P rule.
    for (let p = 1; p >= 0; p--) {                            // $E841 players 1,0
      const player = roster.tanks[p];
      if (!player.isDrivable) continue;                       // $E845-$E84B alive, not respawning
      for (let bi = BULLET_SLOTS - 1; bi >= 0; bi--) {        // $E852 bullets 9->0
        const b = this.bullets[bi];
        if (!b.isPlayerBullet) continue;                      // $E856 AND #$06
        if (!b.flying) continue;                              // $E85F-$E863
        if (((p ^ bi) & 1) === 0) continue;                   // $E865-$E86B only the OTHER player's
        if (Math.abs(b.x - player.x) >= BULLET_TANK_RANGE) continue;   // $E86D-$E87C
        if (Math.abs(b.y - player.y) >= BULLET_TANK_RANGE) continue;   // $E87E-$E88D
        b.explode();                                          // $E88F-$E891 the bullet explodes
        if (player.helmetTimer !== 0) { b.deactivate(); continue; }   // $E894-$E89A shield absorbs
        if (player.stunTimer !== 0) continue;                 // $E8A0-$E8A2 already frozen
        if (secondLoop === SECOND_LOOP.DEMO) continue;        // $E8A4-$E8A8 no stun in the demo
        player.stunTimer = STUN_TIMER_INIT;                   // $E8AA-$E8AC = $C8 (200)
        break;                                                // $E8AE -> loc_E8B5 this player done
      }
    }
  }

  // sub_E409_clear_bullet_status ($E409) — clear all 10 slots. Wired at stage prep ($C331).
  clearAll() {
    for (const b of this.bullets) b.deactivate();
  }

  // --- render half: sub_E0D8_bullets_status_handler ($E0D8), OUTSIDE the pipeline ($C206) ---
  // Draws the flying bullet sprite or the hit explosion. Bullets carry no forest priority,
  // so they are always front sprites.
  /** @param {Renderer} renderer */
  render(renderer) {
    for (let i = BULLET_SLOTS - 1; i >= 0; i--) {             // $E0DA loop 9->0
      const b = this.bullets[i];
      if (b.state === BULLET_STATE.FLYING) {                  // ofs_003_E0FB — one 8x16 sprite
        const tile = BULLET_SPRITE_BASE + b.dir * 2;          // sub_DA64: $B1 + dir*2
        renderer.drawSprite(tile, (b.x - BULLET_SPRITE_X_OFFSET) & 0xFF, b.y, BULLET_SPRITE_PALETTE);
      } else if (b.state === BULLET_STATE.EXPLODING) {        // ofs_003_E112 -> sub_DEE2
        // sub_DEE2 picks the blast tile from the phase: $F1 / $F5 / $F9 for phase 3 / 2 / 1.
        // sub_DA7B draws two 8x16 sprites (left at x-8, right at x), palette 3.
        const sprT = BULLET_EXPLOSION_SPRITES[BULLET_EXPLOSION_PHASES - b.explosionPhase];
        renderer.drawSprite(sprT, (b.x - 8) & 0xFF, b.y, BULLET_EXPLOSION_PALETTE);
        renderer.drawSprite(sprT + 2, b.x, b.y, BULLET_EXPLOSION_PALETTE);
      }
    }
  }
}
