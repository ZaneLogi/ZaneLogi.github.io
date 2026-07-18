// tank.js — S3 Tank (one tank entity)
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
    this.occupancyCells = null;  // cells this tank marked in Field.occupancy ($E181);
                                 // Field.occupancyWriteback ($E1FA) clears them
    this.ai = null;              // EnemyAI instance for enemy slots
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
  /** @param {Renderer} renderer  @param {number} frameLo */
  handle(renderer, frameLo) {
    // $00 -> ofs_001_DBF0_00_RTS. An empty slot draws nothing.
    if (this.state === 0) return;
    // $80..$D0 -> ofs_001_DFB6. Six table entries ($80/$90/$A0 + the three enemy
    // follow-bias states) share one body: they differ in AI, not in appearance.
    if (this.state >= 0x80 && this.state < 0xE0) { this.draw(renderer, frameLo); return; }
    // TODO: $10 kill-points ($DEFD); $20/$30/$40 ($DF33/$DF46) and $50/$60/$70
    // ($DECD) explosions; $E0/$F0 respawn ($E00B). None reachable from the menu.
  }

  // ofs_001_DFB6 ($DFB6) + loc_DFE9_display_sprites ($DFE9) — draw a live tank.
  /** @param {Renderer} renderer  @param {number} frameLo */
  draw(renderer, frameLo) {
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
    // lets $DA2B probe the field under each half independently (CLAUDE.md).
    renderer.drawSprite(tileByte, this.x - 8, this.y, palette);
    renderer.drawSprite(tileByte + 2, this.x, this.y, palette);
  }

  // movement step ($DBF1); players use input, enemies delegate to this.ai
  /** @param {Input} input  @param {Field} field */
  move(input, field) { /* TODO: port $DBF1 */ }

  /** @param {Field} field */
  iceMove(field) { /* TODO: port $DB75 */ }
}
