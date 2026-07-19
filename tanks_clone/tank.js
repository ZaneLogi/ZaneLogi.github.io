// tank.js — Tank (one tank entity)
//
// One slot of the 8-wide roster. In the ROM a tank is spread across parallel
// zero-page arrays indexed by slot; here it's one object (idiomatic OO — data
// reorganized, behavior faithful).
//   pos  = ram_tank_pos_X/Y ($90/$98)
//   state+dir = ram_tank_flags ($A0)   — hi nibble = state, lo nibble = direction
//   type = ram_tank_type ($A8)         — armor/speed/upgrade bits [?]
//   wheels = ram_tank_wheels ($B0)     — tread anim / move substate
//   stagePos = ram_tank_stage_pos_lo/hi ($E0/$E8) — current field cell
//
// The status machine dispatches on the state nibble via tbl_E4B8; here that's a
// switch over TANK_STATE (explosion frames, kill-points popup, respawn, normal,
// enemy follow-bias). "live & drivable" == state >= $80 && state < $E0.
//
// Absorbs:
//   sub_DEB8_tank_handler ($DEB8) + status handlers at $DECD..  (state dispatch)
//   sub_DC3D_tank_status_handler ($DC3D)
//   sub_DBF1_tank_movement ($DBF1)   — this tank's move step
//   sub_DB75_ice_movement ($DB75)    — ice slide
// See docs/research_system_interaction_map.md §4, §5 (S3).

import { TANK_PALETTE_FLICKER } from './assets/dat_chr.js';
import { Input } from './input.js';
import { SFX } from './assets/dat_sfx.js';
import {
  DIR, DIR_DX, DIR_DY, TILE, TANK_STATE, HELMET_TIMER_INIT, SLIDE_ARM, SLIDE_LOCK_BIT,
  TANK_EXPLOSION_FRAMES, EXPLOSION_PHASE_TICKS, KILL_POINTS_TICKS, EXPLOSION_PALETTE,
  KILL_POINTS_SPRITE_BASE,
} from './constants.js';

/**
 * @typedef {import('./renderer.js').Renderer} Renderer
 * @typedef {import('./input.js').Input} Input
 * @typedef {import('./field.js').Field} Field
 */

export class Tank {
  constructor(slot) {
    this.slot = slot;            // 0=P1, 1=P2, 2..7=enemy
    this.x = 0; this.y = 0;
    this.dir = 0;                // low nibble of flags
    this.state = 0;              // high nibble of flags (TANK_STATE)
    this.type = 0;
    this.wheels = 0;
    this.stunTimer = 0;          // ram_plr_stun_timer ($6F) — players only
    this.stageCell = 0;
    this.onIce = false;          // player standing on ice — $E181 sets $0103 bit7
    // Ice-slide budget — the counter re-derived from ram_0103_plr_flags's low 7
    // bits (the packed $0103 byte is split into onIce + this per the data-model rule).
    this.slideTimer = 0;
    this.occupancyCells = null;  // cells this tank marked in Field.occupancy ($E181);
                                 // Field.occupancyWriteback ($E1FA) clears them
    // Enemy recoil coast — the re-derived ram_tank_flags bits 2-3 ($88->$84->$80).
    // The ROM packs a 2-step "pause after bumping a wall" counter into the flag
    // byte's mid nibble; our state/dir split has no room for it, so it is an explicit
    // field (like slideTimer for ice). Set to 2 on a blocked recoil; the $80 handler
    // counts it down, then resumes $A0. See EnemyAI.recoil.
    this.coast = 0;
    // Respawn-in counter (the low nibble of ram_tank_flags while state is $F0/$E0,
    // an explicit field here). Drives the spawn star; INC'd by the move step.
    this.respawnFrame = 0;
    this.helmetTimer = 0;        // ram_helmet_timer ($89) — spawn invincibility
    // Explosion phase countdown (the low nibble of ram_tank_flags while state is
    // $70..$10, an explicit field like respawnFrame / slideTimer — the packed byte
    // is split). Set to 3 per phase, 6 at the $10 kill-points phase. See tickExplosion.
    this.explosionTimer = 0;
  }

  get isPlayer() { return this.slot < 2; }
  get isDrivable() { return this.state >= 0x80 && this.state < 0xE0; }

  // sub_DEB8_tank_handler ($DEB8) — the per-slot status dispatch.
  //
  // The ROM computes (flags >> 3) & $FE and indexes tbl_E4B8, whose entries are two
  // bytes each. Divide that back out and the index is simply the flags' HIGH NIBBLE
  // — 16 states, 16 handlers. Stating it that way is the same dispatch without the
  // byte-offset arithmetic, which only existed because the 6502 has no jump-by-index.
  //
  // This is the RENDER half. The ROM keeps sub_DEA6 OUTSIDE the $C2E6 pipeline and
  // calls it separately from each screen's loop ($C9F5 menu / $C20C battle /
  // $C42F demo) — the split our Mode contract requires already exists upstream. So
  // nothing in here may mutate game state (mode.js).
  /** @param {Renderer} renderer  @param {number} frameLo  @param {Field} [field] */
  render(renderer, frameLo, field) {
    // $00 -> ofs_001_DBF0_00_RTS. An empty slot draws nothing.
    if (this.state === 0) return;
    // $80..$D0 -> ofs_001_DFB6. Six table entries ($80/$90/$A0 + the three enemy
    // follow-bias states) share one body: they differ in AI, not in appearance.
    if (this.state >= 0x80 && this.state < 0xE0) { this.draw(renderer, frameLo, field); return; }
    // $E0/$F0 -> ofs_001_E00B — the materializing spawn star.
    if (this.state >= 0xE0) { this.drawRespawnStar(renderer, field); return; }
    // $70..$20 -> ofs_001_DECD/DF33/DF46 — the destruction blast.
    if (this.state >= TANK_STATE.EXPLODE_20 && this.state <= TANK_STATE.EXPLOSION) {
      this.drawExplosion(renderer);
      return;
    }
    // $10 -> ofs_001_DEFD — the kill-points popup (S8-B).
    if (this.state === TANK_STATE.KILL_POINTS) { this.drawKillPoints(renderer); return; }
  }

  // ofs_001_DEFD ($DEFD) — the kill-points popup, drawn during the $10 phase. An enemy
  // (type != 0) shows its point value as a 2-tile number sprite (tile = ((type>>3) &
  // $FC) - $10 + $B9 -> $B9/$BD/$C1/$C5 for $80/$A0/$C0/$E0); a killed player (type 0)
  // shows a plain $F1 blast instead ($DF03 BEQ). Palette 3, 2 sprites (sub_DA7B). S8-B.
  /** @param {Renderer} renderer */
  drawKillPoints(renderer) {
    const tile = this.type === 0
      ? 0xF1                                                   // $DF23 sub_DEF0(0) — player blast
      : ((this.type >> 3) & 0xFC) - 0x10 + KILL_POINTS_SPRITE_BASE;   // $DF05-$DF10
    renderer.drawSprite(tile, (this.x - 8) & 0xFF, this.y, EXPLOSION_PALETTE);
    renderer.drawSprite(tile + 2, this.x, this.y, EXPLOSION_PALETTE);
  }

  // ofs_001_DECD / DF33 / DF46 ($DECD/$DF33/$DF46) — the tank destruction blast for the
  // explosion states. TANK_EXPLOSION_FRAMES maps the state to [dx,dy,tile] groups around
  // the tank centre; each is two 8x16 sprites (sub_DA7B: tile @ gx-8, tile+2 @ gx),
  // palette 3, front layer (the ROM zeroes priority_spr_A). Same blast as the P8 base.
  /** @param {Renderer} renderer */
  drawExplosion(renderer) {
    const groups = TANK_EXPLOSION_FRAMES[this.state];
    if (!groups) return;
    for (const [dx, dy, tile] of groups) {
      const gx = (this.x + dx) & 0xFF, gy = this.y + dy;
      renderer.drawSprite(tile, (gx - 8) & 0xFF, gy, EXPLOSION_PALETTE);
      renderer.drawSprite(tile + 2, gx, gy, EXPLOSION_PALETTE);
    }
  }

  // sub_DA2B's forest-priority probe ($DA3B-$DA45): a sprite half is drawn BEHIND the
  // background when the field tile at (sprX + 3, sprY) is forest ($22). sub_DA2B reads
  // the tile at the sprite's own X+3 and the tank's centre Y. No field -> never behind
  // (the menu draws its cursor with no field).
  /** @param {Field} [field] */
  onForest(field, sprX) {
    return !!field && field.terrainAt((sprX + 3) >> 3, this.y >> 3) === TILE.FOREST;
  }

  // ofs_001_E00B ($E00B) — the spawn-in star, drawn for both respawn states ($F0
  // and $E0). The tile pulses with |counter - 7|: the star is at its edges (tile
  // $AD) at the ends of each phase and brightest ($A1) in the middle. Two 8x16
  // sprites (sub_DA7B), palette 3. This is our stand-in for the ROM's $0F spawn
  // block too (loc_E3A9's field write, not ported — the sprite is the visual).
  /** @param {Renderer} renderer  @param {Field} [field] */
  drawRespawnStar(renderer, field) {
    const n = this.respawnFrame;                    // flags & $0F ($E00D)
    const t = Math.abs(n - 7);                      // $E010-$E018 SBC #$07, negate if <0
    const tile = ((t << 1) & 0xFC) + 0xA1;          // $E019-$E01D ASL / AND #$FC / ADC #$A1
    renderer.drawSprite(tile, this.x - 8, this.y, 3, this.onForest(field, this.x - 8));  // left ($E025 sub_DA7B)
    renderer.drawSprite(tile + 2, this.x, this.y, 3, this.onForest(field, this.x));      // right (INC INC spr_T)
  }

  // ofs_001_DFB6 ($DFB6) + loc_DFE9_display_sprites ($DFE9) — draw a live tank.
  /** @param {Renderer} renderer  @param {number} frameLo  @param {Field} [field] */
  draw(renderer, frameLo, field) {
    let palette;
    if (this.isPlayer) {                             // $DFB6 CPX #$02 / BCC
      // $DFDD-$DFE7 — a stunned player BLINKS: invisible while frm_cnt_lo & $08,
      // so it flashes every 8 frames rather than vanishing outright.
      if (this.stunTimer !== 0 && (frameLo & 0x08) !== 0) return;
      palette = this.slot;                           // $DFE8 TXA — palette IS the slot
    } else if (this.type & 0x04) {
      // $DFC0-$DFC8 — a bonus (flashing) tank alternates palettes 2 and 3 every
      // 8 frames. This is the "shoot me for a power-up" tell.
      palette = ((frameLo >> 3) & 0x01) + 0x02;
    } else {
      // $DFCD-$DFDA — ordinary enemies flicker through tbl_E003, indexed by
      // (frm_cnt_lo * 4 + type) & $07. Armour level rides in `type`, so a damaged
      // heavy tank cycles a different colour set as it degrades.
      palette = TANK_PALETTE_FLICKER[((frameLo << 2) + this.type) & 0x07];
    }

    // loc_DFE9 — the tile byte. $DFEB takes the direction from the flags' low two
    // bits, $DFF0-$DFF7 adds the tank type's high nibble and the tread phase, and
    // sub_DA73 ($DA73) multiplies the direction by 8 before adding it in.
    const tileByte = (this.dir & 0x03) * 8 + (this.type & 0xF0) + this.wheels;

    // sub_DA7B_display_2_sprites ($DA7B) — a tank is TWO 8x16 sprites, never one
    // pre-composed 16x16: the left half sits 8px back ($DA81) and the right half
    // takes the next tile pair ($DA87-$DA89 INC INC). Keeping them separate is what
    // lets $DA2B probe the field under each half INDEPENDENTLY — so a tank straddling
    // a forest edge has just the half over grass drawn behind it.
    renderer.drawSprite(tileByte, this.x - 8, this.y, palette, this.onForest(field, this.x - 8));
    renderer.drawSprite(tileByte + 2, this.x, this.y, palette, this.onForest(field, this.x));
  }

  // loc_E3A9 ($E3A9) — enter the RESPAWN state. Position/type are set by the
  // roster (sub_E363); this is the state reset the move step then animates in.
  spawn() {
    this.state = TANK_STATE.RESPAWN;   // $F0 con_tank_flag_respawn
    this.dir = DIR.UP;
    this.respawnFrame = 0;
    this.wheels = 0;
    this.helmetTimer = 0;
    this.onIce = false;
    this.slideTimer = 0;
    this.occupancyCells = null;
  }

  // sub_DB75 ($DB75, "ice_movement" — misnamed; this is PLAYER CONTROL). Reads the
  // pad, sets facing + drive/stop state. Runs before the move step, players only.
  //
  // Simplified per the governing test: the ROM's stopped state is $88 and it decays
  // $88->$84 via SBC #$04 ($DC6B), but $DB75 rewrites the state every processed
  // frame on the SAME 3/4 gate as the move step, so that coast never advances a
  // player — it is CPU-shaped and unobservable. We model just $80 (stopped) / $A0
  // (moving). Ice-slide arming is folded in below.
  /** @param {Input} input  @param {import('./audio.js').Audio} [audio] */
  control(input, audio) {
    if (!this.isDrivable) return;                       // $DB85/$DB89 exploding/respawning
    if (this.stunTimer !== 0) {                         // $DB8B-$DB91 stunned: stop
      this.stunTimer--;
      this.state = TANK_STATE.NORMAL_80;
      return;
    }
    // $DB94-$DB9B — on ice, while the slide LOCK is engaged (the counter's bit4) the
    // pad is ignored: the tank commits to sliding in its current direction, and the
    // $80 handler carries the motion. This is what makes turning on ice feel sluggish.
    if (this.onIce && (this.slideTimer & SLIDE_LOCK_BIT) !== 0) {   // $DB95 BPL / $DB99 AND #$10
      this.state = TANK_STATE.NORMAL_80;                // $DBA6 loc_DBA6
      return;
    }
    const dir = Input.dpadToDirection(input.hold[this.slot]);   // $DB9D/$DB9F sub_E451
    if (dir < 0) {                                      // $DBA4 — no d-pad -> stop
      this.state = TANK_STATE.NORMAL_80;                // $DBA6 loc_DBA6
      return;
    }
    // $DBB4-$DBC4 — pressing on ice from a SETTLED state (counter back to 0) arms a
    // fresh slide budget, so releasing keeps the tank moving (momentum).
    if (this.onIce && this.slideTimer === 0) {          // $DBB7 BPL / $DBB9 AND #$1F
      this.slideTimer = SLIDE_ARM;                      // $DBBD LDA #$9C (counter $1C)
      audio?.play(SFX.MOVEMENT_ICE);                    // $DBC4 — the slide "skid" (one-shot)
    }
    // $DBC7-$DBE5 — a PERPENDICULAR turn snaps position to the 8px grid so the tank
    // lines up with corridors. Same or opposite (EOR #$02) direction does not snap.
    if (dir !== this.dir && dir !== (this.dir ^ 0x02)) {
      this.x = (this.x + 4) & 0xF8;                     // $DBD5-$DBDC (pos + 4) & $F8
      this.y = (this.y + 4) & 0xF8;                     // $DBDE-$DBE5
    }
    this.dir = dir;                                     // $DBE7 flags low nibble
    this.state = TANK_STATE.NORMAL_A0;                  // $DBE9 ORA #con_tank_flag_A0
  }

  // sub_DBF1 / sub_DC3D / loc_DC97 ($DBF1) — the per-tank move step, dispatched on
  // the state. The roster applies the 3/4-frame player speed gate before calling.
  /** @param {Field} field  @param {import('./game.js').Game} [game] */
  moveStep(field, game) {
    switch (this.state) {
      case TANK_STATE.RESPAWN:                          // $F0 ofs_000_DE55
        this.respawnTick(TANK_STATE.E0, game);          // $F0..$FE -> $E0
        return;
      case TANK_STATE.E0:                               // $E0 ofs_000_DE64
        this.respawnTick(null, game);                   // $E0..$EE -> become drivable
        return;
      case TANK_STATE.NORMAL_80:                        // $80 ofs_000_DC52 — stopped/slide
        this.stopped(field);
        return;
      case TANK_STATE.NORMAL_A0:                        // $A0 ofs_000_DC7C -> loc_DC97
        this.drive(field);
        return;
      default:
        // $70..$10 explosion states -> ofs_000_DDEA (the tick). Players reach here via
        // the 3/4 move gate; a return covers empty ($00) and any unhandled state. The
        // lower bound is $10 (KILL_POINTS), not $20 — the $10 phase must tick to reach
        // death even though its popup is not drawn.
        if (this.state >= TANK_STATE.KILL_POINTS && this.state <= TANK_STATE.EXPLOSION) {
          this.tickExplosion(game);
        }
        return;
    }
  }

  // ofs at $E75F/$E7F2 — a tank is hit: flags = $73 (explosion state $70, low nibble 3).
  explode() {
    this.state = TANK_STATE.EXPLOSION;                  // $70
    this.explosionTimer = EXPLOSION_PHASE_TICKS;        // low nibble 3
  }

  // ofs_000_DDEA ($DDEA) — advance the explosion one tick. The ROM DECs the flags byte
  // and steps a phase ($70->$60..->$20->$10->dead) when the low nibble hits 0, longer at
  // the $10 kill-points phase (ORA #$06). Here the low nibble is the explicit
  // explosionTimer; at the last phase the tank dies -> game.destroyTank. Dispatched under
  // the same gate as movement (player 3/4, enemy speed), so the caller owns the gating.
  // research_enemy_combat.md §3.
  /** @param {import('./game.js').Game} game */
  tickExplosion(game) {
    if (this.explosionTimer > 1) { this.explosionTimer--; return; }   // $DDEA-$DDF0 still in phase
    // low nibble reaches 0 -> next phase ($DDF2 SBC #$10)
    if (this.state === TANK_STATE.KILL_POINTS) {        // $10 -> 0: dead ($DDF7 -> $DE07)
      this.state = 0;
      this.explosionTimer = 0;
      game?.destroyTank(this);
      return;
    }
    if (this.state === TANK_STATE.EXPLODE_20) {         // $20 -> $10 kill-points ($DDFD ORA #$06)
      this.state = TANK_STATE.KILL_POINTS;
      this.explosionTimer = KILL_POINTS_TICKS;
      return;
    }
    this.state -= 0x10;                                 // $70..$30 -> next phase ($DE02 ORA #$03)
    this.explosionTimer = EXPLOSION_PHASE_TICKS;
  }

  // ofs_000_DE55 / ofs_000_DE64 ($DE55/$DE64) — the two respawn phases both just INC
  // the low-nibble counter each processed frame; at $0E the phase ends.
  /** @param {import('./game.js').Game} [game] */
  respawnTick(nextState, game) {
    if (++this.respawnFrame >= 0x0E) {                  // $DE59 AND #$0F / CMP #$0E
      this.respawnFrame = 0;
      if (nextState !== null) this.state = nextState;   // $DE5F $F0 -> $E0
      else this.becomeDrivable(game);                   // $DE6E sub_E3B8
    }
  }

  // sub_E3B8 ($E3B8) — the tank finishes materializing. tbl_E47E[slot] ($E47E) is
  // the resulting state: players $A0 (face UP), enemies $A2 (face DOWN, toward the
  // base). Then the player path arms the helmet + restores the star upgrade; the enemy
  // path assigns the tank type from the stage tables + clears wheels.
  /** @param {import('./game.js').Game} [game] */
  becomeDrivable(game) {
    this.state = TANK_STATE.NORMAL_A0;             // tbl_E47E high nibble = $A0
    this.dir = this.isPlayer ? DIR.UP : DIR.DOWN;  // tbl_E47E low nibble: 0 / 2
    this.wheels = 0;                               // $E406 (enemy) / players unchanged
    if (this.isPlayer) {
      this.helmetTimer = HELMET_TIMER_INIT;        // $E3C1-$E3C3
      // $E3C5-$E3C8 — restore the persistent star tier (0 for a fresh life, since death
      // zeroes it; carried across stages for a player who did not die). spawnPlayer reset
      // type to 0 ($E365), so this ORA-with-0 is just tank_type = tank_upgrade.
      if (game) this.type = game.tankUpgrade[this.slot];
    }
    // Enemy: ram_tank_type was assigned at spawn (TankRoster.spawnEnemy). The ROM
    // sets it here in $E3B8's enemy branch, but the type is unobservable during the
    // respawn star (its sprite ignores type), so moving the write to spawn — where
    // the roster already holds the type counters + stage tables — is a governing-test
    // deviation that avoids threading that context into the state machine.
  }

  // ofs_000_DC52 ($DC52), player path — a stopped player normally does nothing, but
  // on ICE it keeps sliding in its current direction while the slide budget lasts
  // (and stops the instant it leaves the ice or the counter runs out). The two wheel
  // toggles ($DC62 here + loc_DD29 inside drive) cancel, so a sliding tank's treads
  // freeze — faithful. The ROM's non-ice $88->$84 coast ($DC6B) is dropped (dev. #1).
  /** @param {Field} field */
  stopped(field) {
    if (this.onIce && this.slideTimer !== 0) {   // $DC56 BPL / $DC5B AND #$7F
      this.slideTimer--;                          // $DC5F DEC ram_0103_plr_flags
      this.wheels ^= 0x04;                        // $DC62-$DC66
      this.drive(field);                          // $DC68 JMP loc_DC97 — slide in `dir`
    }
  }

  // loc_DC97 ($DC97) — try a 1px step in `dir`. Probe the destination's two LEADING
  // corners; if both are passable (terrain) and unoccupied (another tank), commit.
  // Returns whether it moved: players ignore it (blocked = stay put), enemies react
  // to a block (recoil/turn — EnemyAI). No wheel toggle here; the caller owns that,
  // because the enemy turn branch ($DD30) skips it while every other path toggles.
  /** @param {Field} field */
  tryStep(field) {
    const dx = DIR_DX[this.dir], dy = DIR_DY[this.dir];   // tbl_E46C / tbl_E470
    const newX = (this.x + dx) & 0xFF;                    // $DCB4-$DCBA
    const newY = (this.y + dy) & 0xFF;
    // probe 1 at +(dx+dy)*8 on both axes ($DCBC-$DCC0); probe 2 at the mirror
    // ($DCDF-$DCF0). Corner pixels are fixed up by sub_DD6E/DD76 inside cornerClear.
    const a = (dx + dy) * 8;
    const clear =
      this.cornerClear(field, newX + a, newY + a, newX, newY) &&
      this.cornerClear(field, newX + dx * 8 - dy * 8, newY + dy * 8 - dx * 8, newX, newY);
    if (clear) { this.x = newX; this.y = newY; }          // $DD04-$DD0C commit
    return clear;
  }

  // Player $A0 drive: step then always toggle wheels (loc_DD29 is unconditional on
  // the player path — the treads roll even while pushing a wall). $DD11 CPX #$02 BCC.
  /** @param {Field} field */
  drive(field) {
    this.tryStep(field);
    this.wheels ^= 0x04;                                  // $DD29 loc_DD29
  }

  // One collision corner ($DCC2-$DCDD): sub_DD6E/DD76 subtract 1 when the probe is
  // on the tank's FAR side (so a 16px tank samples the tile it is entering, not the
  // one past it), then block on occupancy (the ROM's bit7) or a solid tile ($01-$1F).
  /** @param {Field} field */
  cornerClear(field, px, py, newX, newY) {
    let cx = px & 0xFF;                                      // A is 8-bit in the ROM
    if (cx >= newX) cx = (cx - 1) & 0xFF;                    // sub_DD6E: BCC skip else SBC #$01
    let cy = py & 0xFF;                                      // sub_DD76 ($DD76)
    if (cy >= newY) cy = (cy - 1) & 0xFF;
    const col = cx >> 3, row = cy >> 3;                      // sub_D706
    if (field.isOccupied(col, row)) return false;           // $DCD7 BMI (bit7)
    return field.isPassable(col, row);                      // $DCD9 BEQ / $DCDB CMP #$20
  }
}
