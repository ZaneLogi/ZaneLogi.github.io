// enemy_ai.js — Enemy AI
//
// In the ROM the AI is not a separate module — it IS the enemy half of the tank
// state machine, woven into sub_DBF1_tank_movement. The states $80/$90/$A0 and the
// three follow-bias states $B0/$C0/$D0 are the enemy's movement handlers (tbl_E498,
// dispatched by sub_DC3D). This class is that decision layer: it drives an enemy
// tank through those states, calling the SHARED forward step (Tank.tryStep, the
// loc_DC97 move+collision) and reacting to what it reports. The roster's moveTanks
// (sub_DBF1) applies the clock-freeze + speed gates, then hands each enemy here.
//
// Two policies live here because they need game context a Tank does not hold:
//   * sub_DE72 — WHICH target to chase, and it drifts over the stage: early = wander
//     randomly, mid = chase a player, late = rush the HQ (keyed off frm_cnt_hi vs the
//     spawn interval).
//   * sub_DDA2/sub_DAAF/tbl_E486 — the biased direction TOWARD a destination.
//
// Absorbs: the AI paths of $DBF1 (ofs_000_DC7C/DD48/DC52 + ofs_000_DD7E/DD89/DD94),
// sub_DE72, sub_DDA2. Uses: Rng. See docs/research_system_interaction_map.md §5 (S4).

import { TANK_STATE, AIM_DIR, HQ_TARGET } from './constants.js';

/**
 * @typedef {import('./tank.js').Tank} Tank
 * @typedef {import('./field.js').Field} Field
 * @typedef {{frameHi:number, spawnInterval:number, players:Tank[]}} AiContext
 */

export class EnemyAI {
  /** @param {import('./rng.js').Rng} rng */
  constructor(rng) {
    this.rng = rng;
  }

  // sub_DC3D dispatch, enemy states. Respawn ($E0/$F0) and the explosion tick ($70..$10)
  // reuse the shared Tank handlers; the movement states are handled below. This runs
  // under the enemy speed gate (roster.moveTanks), so an exploding enemy's tick is
  // speed-gated exactly like its movement — the ROM dispatches both through sub_DC3D.
  /** @param {Tank} tank  @param {Field} field  @param {AiContext} ctx */
  drive(tank, field, ctx) {
    switch (tank.state) {
      case TANK_STATE.RESPAWN:                          // $F0 ofs_000_DE55
      case TANK_STATE.E0:                               // $E0 ofs_000_DE64
        tank.moveStep(field); return;                   // shared respawn animation
      case TANK_STATE.NORMAL_A0: this.driveForward(tank, field, ctx); return;  // $A0
      case TANK_STATE.NORMAL_90: this.turn(tank, ctx); return;                 // $90
      case TANK_STATE.NORMAL_80: this.recoil(tank); return;                    // $80
      case TANK_STATE.FOLLOW_HQ:                        // $B0
      case TANK_STATE.FOLLOW_P2:                        // $C0
      case TANK_STATE.FOLLOW_P1:                        // $D0
        this.followTarget(tank, ctx); return;
      default:                                          // $70..$10 exploding -> $DDEA
        // $10 (KILL_POINTS) must tick to reach death, though its popup isn't drawn.
        if (tank.state >= TANK_STATE.KILL_POINTS && tank.state <= TANK_STATE.EXPLOSION) {
          tank.tickExplosion(ctx.game);
        }
        return;
    }
  }

  // ofs_000_DC7C_A0 ($DC7C) enemy + loc_DC97 — the main "drive forward" state.
  /** @param {Tank} tank  @param {Field} field  @param {AiContext} ctx */
  driveForward(tank, field, ctx) {
    // $DC80-$DC91 — on an 8px grid boundary, a 1/16 roll re-picks the target
    // direction (the RNG is only rolled when aligned, so the call count matches).
    if ((tank.x & 7) === 0 && (tank.y & 7) === 0
        && (this.rng.next(ctx.frameHi) & 0x0F) === 0) {
      this.pickTarget(tank, ctx);                       // $DC93 sub_DE72
      return;
    }
    if (tank.tryStep(field)) { tank.wheels ^= 0x04; return; }   // moved -> loc_DD29
    // Blocked (bra_DD11 enemy): 1/4 turn, else 3/4 recoil.
    if ((this.rng.next(ctx.frameHi) & 0x03) === 0) {    // $DD17-$DD1C
      // bra_DD30: reverse; if grid-aligned, hand off to the $90 turn state.
      if ((tank.x & 7) === 0 && (tank.y & 7) === 0) tank.state = TANK_STATE.NORMAL_90;  // $DD30-$DD3E
      tank.dir ^= 0x02;                                 // $DD41-$DD45 EOR #$02 (reverse)
    } else {
      tank.state = TANK_STATE.NORMAL_80;                // $DD1E-$DD22 recoil
      tank.coast = 2;                                   // the re-derived $88 -> $84 -> $80 pause
      tank.wheels ^= 0x04;                              // loc_DD29
    }
  }

  // ofs_000_DC52_80 ($DC6B) enemy — the recoil coast after bumping a wall: sit still
  // for two move-steps, then resume driving. No move, no wheel toggle.
  /** @param {Tank} tank */
  recoil(tank) {
    if (--tank.coast <= 0) tank.state = TANK_STATE.NORMAL_A0;   // $DC6B-$DC78 $88->$80->$A0
  }

  // ofs_000_DD48_90 ($DD48) — the turn/re-decide state: half the time re-pick the
  // target, otherwise rotate one step left or right and resume driving.
  /** @param {Tank} tank  @param {AiContext} ctx */
  turn(tank, ctx) {
    if ((this.rng.next(ctx.frameHi) & 0x01) === 0) {    // $DD48-$DD4D
      this.pickTarget(tank, ctx);                       // $DD6A sub_DE72
      return;
    }
    tank.dir = (this.rng.next(ctx.frameHi) & 0x01)      // $DD4F-$DD54
      ? (tank.dir + 1) & 0x03                            // $DD56-$DD59 flags + 1 (turn right)
      : (tank.dir - 1) & 0x03;                           // $DD5E-$DD61 flags - 1 (turn left)
    tank.state = TANK_STATE.NORMAL_A0;                  // $DD63-$DD65 AND #$03 / ORA #$A0
  }

  // ofs_000_DD7E/DD89/DD94 ($DD7E) — a transient follow state: resolve the target's
  // position to a biased direction, then immediately become $A0 driving that way.
  /** @param {Tank} tank  @param {AiContext} ctx */
  followTarget(tank, ctx) {
    let dest;
    if (tank.state === TANK_STATE.FOLLOW_P1) dest = ctx.players[0];       // $DD7E
    else if (tank.state === TANK_STATE.FOLLOW_P2) dest = ctx.players[1];  // $DD89
    else dest = HQ_TARGET;                                                // $DD94
    tank.dir = this.directionToward(tank, dest.x, dest.y, ctx);          // sub_DDA2
    tank.state = TANK_STATE.NORMAL_A0;                                    // $DD9F STA ($A0|dir)
  }

  // sub_DE72 ($DE72) — pick the target, drifting with the stage clock. interval/4 and
  // interval/8 vs frm_cnt_hi (which ticks once/64 frames from 0 at stage start):
  // early = wander, mid = chase a player, late = rush the HQ.
  /** @param {Tank} tank  @param {AiContext} ctx */
  pickTarget(tank, ctx) {
    const quarter = ctx.spawnInterval >> 2;             // $DE74 interval / 4
    if (quarter < ctx.frameHi) {                        // $DE76-$DE78 (late)
      tank.state = TANK_STATE.FOLLOW_HQ; return;        // $DE7A rush the base
    }
    if ((quarter >> 1) >= ctx.frameHi) {                // $DE7F-$DE82 interval/8 >= hi (early)
      tank.state = TANK_STATE.NORMAL_A0;                // $DE84-$DE8B random direction
      tank.dir = this.rng.next(ctx.frameHi) & 0x03;
      return;
    }
    // Mid: follow a player ($DE8E-$DEA0). p1 dead -> p2; else even slot -> p1, odd
    // slot -> p2 (falling back to p1 if p2 is dead). "dead" = the slot is empty.
    const p1alive = ctx.players[0].state !== 0;         // $DE8E LDA tank_flags[0]
    const p2alive = ctx.players[1].state !== 0;
    let followP1;
    if (!p1alive) followP1 = false;                     // $DE90 -> follow p2
    else if ((tank.slot & 0x01) === 0) followP1 = true; // $DE92-$DE95 even slot -> p1
    else followP1 = !p2alive;                           // $DE97-$DE99 p2 dead -> p1, else p2
    tank.state = followP1 ? TANK_STATE.FOLLOW_P1 : TANK_STATE.FOLLOW_P2;
  }

  // sub_DDA2 ($DDA2), enemy branch — the biased direction toward (destX, destY).
  // sub_DAAF gives each axis a sign (0 target-is-less / 1 aligned / 2 greater);
  // index = 3*dySign + dxSign picks tbl_E486, and a coin flip adds 9 to reach the
  // side-biased half so the approach wanders rather than beelines. (The player branch
  // of DDA2 — frm_cnt_hi instead of RNG — is unreachable: players never follow.)
  /** @param {Tank} tank  @param {number} destX  @param {number} destY  @param {AiContext} ctx */
  directionToward(tank, destX, destY, ctx) {
    const dxSign = destX === tank.x ? 1 : (destX > tank.x ? 2 : 0);   // $DDA2-$DDAD
    const dySign = destY === tank.y ? 1 : (destY > tank.y ? 2 : 0);   // $DDAF-$DDBA
    let index = 3 * dySign + dxSign;                                  // $DDBC-$DDC3
    if (this.rng.next(ctx.frameHi) & 0x01) index += 9;               // $DDD4-$DDE0 (alt table)
    return AIM_DIR[index];                                            // tbl_E486 low nibble
  }

  // sub_E162 ($E162) — an enemy fires on a 1/32 roll per frame. Used by both the AI
  // movement decisions and the enemy-fire pipeline step (BulletManager.enemyFire, P10).
  /** @param {number} frameHi */
  shouldFire(frameHi) { return (this.rng.next(frameHi) & 0x1F) === 0; }
}
