// base.js — Base / HQ (the eagle)
//
// The eagle and its walls. THE ONE FACT everything follows from: the base is
// ordinary background TILES in the field buffer, not sprites (map §5 S6). The four
// draw routines write tiles into $0400; the ONLY sprite part is the game-over
// explosion ($E2D8-$E362). So Base owns no surface — it edits Field's tilemap, the
// way a bullet chips a brick (Field.chipQuadrant).
//
// Absorbs:
//   sub_CAF5_draw_default_base ($CAF5)      -> drawDefault      (walls brick + eagle)
//   sub_CB9E_draw_protected_base ($CB9E)    -> drawProtected    (walls steel + eagle)
//   sub_CC08_draw_destroyed_eagle ($CC08)   -> drawDestroyedEagle
//   sub_E2A9_HQ_handler ($E2A9)             -> update           (shovel + countdown)
//   the $E2D8-$E362 explosion sprites       -> render
//   ofs_bonus_E9FB_02_shovel ($E9FB)        -> applyShovel      (Bonus calls this)
//   the $E6AA-$E6BA eagle-hit set           -> onHit
//   ram_game_over_flag ($68) — as state + timer; ram_shovel_timer ($45)
//   (sub_CB5D_draw_default_eagle $CB5D is the editor-only path — Construction, deferred)
// See docs/research_base.md and docs/research_system_interaction_map.md §5 (S6).

import { TILE, SHOVEL_TIMER_INIT } from './constants.js';

/** @typedef {import('./field.js').Field} Field */
/** @typedef {import('./renderer.js').Renderer} Renderer */

// The ROM packs the eagle's condition into ram_game_over_flag ($68) as a TRI-STATE
// BYTE ($E2D2-$E2D6 discriminates all three): $80 alive (BMI), $01-$7F exploding
// (the VALUE is the countdown), $00 destroyed (BEQ). "eagle destroyed -> game over"
// is therefore not an edge — a bullet sets $27 ($E6B0), sub_E2A9 DECs it every frame
// ($E2DC) driving the explosion off the remaining count, and only at $00 does
// sub_C728 end the stage. We keep the BEHAVIOUR (a 39-frame animated countdown) and
// drop the byte-packing (6502 economy, not design). Flow doc §6b/§7.8.
export const BASE_STATE = Object.freeze({
  ALIVE: 'ALIVE',
  EXPLODING: 'EXPLODING',
  DESTROYED: 'DESTROYED',
});

export const EAGLE_EXPLOSION_FRAMES = 0x27;   // $E6AE LDA #$27 — 39 frames

// --- The base geometry: a fixed 6x4 tile stamp at the bottom-centre ($CAF5's lines
// at buffer $070C/$072C/$074C/$076C -> cols 12-17, rows 24-27). Eagle 2x2 at cols
// 14-15 / rows 26-27. All of it is empty in the stage files (block rows 11-12 cols
// 5-7 = $D), so the stamp fills empty space. research_base.md §1.
const BASE_COL = 12;   // $070C & $1F — left column of the stamp
const BASE_ROW = 24;   // ($070C - $0400) / $20 — top row of the stamp
const EAGLE_COL = 14;  // $074E & $1F
const EAGLE_ROW = 26;  // ($074E - $0400) / $20

// The four lines of the DEFAULT base, transcribed verbatim from tbl_D36D/D374/D37B/
// D382 ($D36D..). Brick walls ($0F) with the eagle tiles ($C8-$CB) baked into lines
// 3-4 — which is why drawDefault paints walls AND eagle in one call.
const DEFAULT_BASE = [
  [0x00, 0x00, 0x00, 0x00, 0x00, 0x00],   // $D36D line1 — blank
  [0x00, 0x0F, 0x0F, 0x0F, 0x0F, 0x00],   // $D374 line2 — top wall
  [0x00, 0x0F, 0xC8, 0xCA, 0x0F, 0x00],   // $D37B line3 — L wall · eagle-top · R wall
  [0x00, 0x0F, 0xC9, 0xCB, 0x0F, 0x00],   // $D382 line4 — L wall · eagle-bot · R wall
];

// The PROTECTED (shovel) base — tbl_D389/D390/D397/D39E. Identical but steel ($10).
const PROTECTED_BASE = [
  [0x00, 0x00, 0x00, 0x00, 0x00, 0x00],   // $D389 line1
  [0x00, 0x10, 0x10, 0x10, 0x10, 0x00],   // $D390 line2
  [0x00, 0x10, 0xC8, 0xCA, 0x10, 0x00],   // $D397 line3
  [0x00, 0x10, 0xC9, 0xCB, 0x10, 0x00],   // $D39E line4
];

// The eagle 2x2 in its default and destroyed forms — tbl_D3A5/D3A8 and tbl_D3AB/D3AE.
const EAGLE = [[0xC8, 0xCA], [0xC9, 0xCB]];             // $D3A5 / $D3A8
const DESTROYED_EAGLE = [[0xCC, 0xCE], [0xCD, 0xCF]];   // $D3AB / $D3AE

// A cell is "eagle" iff it holds one of the eagle tiles — used to keep the eagle at
// palette 0 while protected walls take palette 3 (the $CBE8/$CBF1 attribute writes).
const isEagleTile = (t) => (t & 0xFC) === 0xC8;   // $E6A4 AND #$FC / CMP #$C8

// --- The game-over explosion sprites ($E2D8-$E362). Each entry is the group list for
// one phase index (the tbl_E306 handler); a group is [X, Y, tile] drawn as a 2x8x16
// pair via drawSprite (sub_DA7B: left tile T at X-8, right tile T+2 at X). Palette 3.
// Index 0 draws nothing; 1-3 one 16x16 blast at the eagle centre; 4-5 a 32x32 blast.
const EXPLOSION_GROUPS = [
  [],                                              // 0 — ofs_004_DBF0_00_RTS
  [[0x78, 0xD8, 0xF1]],                            // 1 — $E312 spr_T $F1
  [[0x78, 0xD8, 0xF5]],                            // 2 — $E317 spr_T $F5
  [[0x78, 0xD8, 0xF9]],                            // 3 — $E31C spr_T $F9
  [[0x70, 0xD0, 0xD1], [0x80, 0xD0, 0xD5],         // 4 — $E32E sub_E33E, ram_0069 = $00
   [0x70, 0xE0, 0xD9], [0x80, 0xE0, 0xDD]],
  [[0x70, 0xD0, 0xE1], [0x80, 0xD0, 0xE5],         // 5 — $E336 sub_E33E, ram_0069 = $10
   [0x70, 0xE0, 0xE9], [0x80, 0xE0, 0xED]],
];
const EXPLOSION_PALETTE = 0x03;   // $E2D8 STA spr_A_palette

export class Base {
  constructor() {
    this.state = BASE_STATE.ALIVE;
    this.explosionTimer = 0;
    this.shovelTimer = 0;   // ram_shovel_timer ($45) — set by the shovel bonus (Bonus.applyShovel)
  }

  isAlive() { return this.state === BASE_STATE.ALIVE; }
  isDestroyed() { return this.state === BASE_STATE.DESTROYED; }

  // $C386-$C388 (inside sub_C331) + $C361 clear shovel — reset per stage.
  reset() {
    this.state = BASE_STATE.ALIVE;
    this.explosionTimer = 0;
    this.shovelTimer = 0;
  }

  // --- the four draws: write tiles + per-cell palettes into Field's tilemap ---

  // sub_CAF5_draw_default_base ($CAF5) — the 6x4 stamp: brick walls + the eagle, all
  // palette 0 (the $CB41/$CB4B attribute writes). Called at stage intro ($C1DC) and
  // when the shovel expires ($E2CF).
  /** @param {Field} field */
  drawDefault(field) { this._stamp(field, DEFAULT_BASE, 0); }

  // sub_CB9E_draw_protected_base ($CB9E) — same stamp with steel walls; the walls take
  // palette 3, the eagle stays palette 0 ($CBE8 = $3F / $CBF1 = (x&$CC)|$33).
  /** @param {Field} field */
  drawProtected(field) { this._stamp(field, PROTECTED_BASE, 3); }

  // Write one 6x4 line block. wallPalette is 0 (default) or 3 (protected); the eagle
  // cells are forced to palette 0 whatever the walls use (the attribute derivation in
  // research_base.md §2 — visible output identical to the region writes).
  _stamp(field, lines, wallPalette) {
    const tm = field.tilemap;
    for (let r = 0; r < lines.length; r++) {
      for (let c = 0; c < lines[r].length; c++) {
        const tile = lines[r][c];
        tm.setTile(BASE_COL + c, BASE_ROW + r, tile);
        tm.setPalette(BASE_COL + c, BASE_ROW + r, isEagleTile(tile) ? 0 : wallPalette);
      }
    }
  }

  // sub_CC08_draw_destroyed_eagle ($CC08) — the eagle 2x2 -> $CC-$CF, palette 0. Walls
  // untouched (the crater keeps whatever walls survived).
  /** @param {Field} field */
  drawDestroyedEagle(field) {
    const tm = field.tilemap;
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        tm.setTile(EAGLE_COL + c, EAGLE_ROW + r, DESTROYED_EAGLE[r][c]);
        tm.setPalette(EAGLE_COL + c, EAGLE_ROW + r, 0);
      }
    }
  }

  // ofs_bonus_E9FB_02_shovel ($E9FB) — the SHOVEL pickup effect. Fortify to steel and
  // arm the timer, but only while the base is alive ($E9FB BPL). The Bonus subsystem
  // (S7/P14) calls this when the shovel power-up is picked up, arming update()'s
  // fortify branch.
  /** @param {Field} field */
  applyShovel(field) {
    if (!this.isAlive()) return;              // $E9FB LDA game_over_flag / BPL
    this.drawProtected(field);               // $E9FF sub_CB9E
    this.shovelTimer = SHOVEL_TIMER_INIT;    // $EA02-$EA04 LDA #$14 / STA
  }

  // $E6AA-$E6BA — a bullet reached the eagle (called from Bullet.checkPoint). Start
  // the countdown and swap the eagle to its destroyed tiles right away; the sprite
  // blast animates on top for the 39 frames.
  /** @param {Field} field */
  onHit(field) {
    if (this.state !== BASE_STATE.ALIVE) return;   // $E6AC BEQ — don't re-trigger
    this.state = BASE_STATE.EXPLODING;
    this.explosionTimer = EAGLE_EXPLOSION_FRAMES;  // $E6AE-$E6B0 LDA #$27 / STA
    // TODO: ram_sfx_explosion_hq / _player ($E6B4/$E6B7) when Audio lands.
    this.drawDestroyedEagle(field);                // $E6BA sub_CC08
  }

  // sub_E2A9_HQ_handler ($E2A9) — pipeline step 6. Shovel fortify (armed by the shovel
  // bonus) first, then the game-over countdown.
  /** @param {Field} field  @param {import('./game.js').Game} game */
  update(field, game) {
    this._fortifyTick(field, game.frm.lo);   // $E2A9-$E2CF

    // loc_E2D2 ($E2D2) — the countdown. $E2D4 BEQ (destroyed) / $E2D6 BMI (alive).
    if (this.state !== BASE_STATE.EXPLODING) return;
    if (--this.explosionTimer <= 0) {        // $E2DC DEC; 0 -> destroyed
      this.state = BASE_STATE.DESTROYED;
    }
  }

  // $E2A9-$E2CF — the shovel fortify/blink/expiry. Acts only every 16 frames while
  // the timer is live; DECs it every 64 frames; blinks steel<->brick in the last few.
  _fortifyTick(field, frameLo) {
    if (this.shovelTimer === 0) return;              // $E2AB BEQ — no shovel
    if ((frameLo & 0x0F) !== 0) return;              // $E2AF AND #$0F / BNE — every 16 frames
    if ((frameLo & 0x3F) === 0) {                    // $E2B5 AND #$3F — every 64 frames:
      if (--this.shovelTimer === 0) {                //   $E2B9 DEC shovel_timer
        this.drawDefault(field);                     //   $E2BB BEQ $E2CF — expired, revert
        return;
      }
    }
    if (this.shovelTimer >= 0x04) return;            // $E2BF CMP #$04 / BCS — steady, skip
    // timer < 4: the warning blink. $E2C5 AND #$10 picks the frame.
    if ((frameLo & 0x10) !== 0) this.drawProtected(field);   // $E2C9 sub_CB9E
    else this.drawDefault(field);                            // $E2CF sub_CAF5
  }

  // The eagle explosion sprites ($E2D8-$E362) — render half of sub_E2A9. Drawn only
  // while EXPLODING; the phase index is a triangle wave off the remaining count.
  /** @param {Renderer} renderer */
  render(renderer) {
    if (this.state !== BASE_STATE.EXPLODING) return;
    const idx = Base.explosionPhaseIndex(this.explosionTimer);
    for (const [x, y, tile] of EXPLOSION_GROUPS[idx]) {
      // sub_DA7B_display_2_sprites: left tile at X-8, right tile T+2 at X.
      renderer.drawSprite(tile, (x - 8) & 0xFF, y, EXPLOSION_PALETTE);
      renderer.drawSprite(tile + 2, x, y, EXPLOSION_PALETTE);
    }
  }

  // $E2DE-$E2F6 — index = | |(count>>2) - 5| - 5 |, two abs folds. count sweeps $26->0
  // so count>>2 is 9->0 and the index runs 1->2->3->4->5->4->3->2->1->0 (~4 frames each).
  static explosionPhaseIndex(count) {
    let a = (count >> 2) - 5;                 // $E2E0-$E2E3 LSR LSR / SEC SBC #$05
    a = Math.abs(a) - 5;                      // $E2E5 abs / $E2EC SEC SBC #$05
    return Math.abs(a);                       // $E2EF abs -> the tbl_E306 index
  }
}
