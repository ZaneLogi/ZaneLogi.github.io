// base.js — S6 Base / HQ (the eagle)
//
// The eagle and its surrounding walls. Reads/writes the Field (the wall cells).
// The shovel power-up temporarily fortifies the walls (brick -> steel) for
// ram_shovel_timer ($45).
//
// Absorbs:
//   sub_E2A9_HQ_handler ($E2A9)                  — per-frame base logic
//   sub_CAF5_draw_default_base ($CAF5), sub_CB5D_draw_default_eagle ($CB5D)
//   sub_CB9E_draw_protected_base ($CB9E), sub_CC08_draw_destroyed_eagle ($CC08)
//   ram_game_over_flag ($68) — as state + timer, see below
//   ram_shovel_timer ($45)
// See docs/research_system_interaction_map.md §5 (S6) and research_game_flow.md §6b.

// The ROM packs the eagle's condition into ram_game_over_flag ($68) as a
// TRI-STATE BYTE, and $E2D2-$E2D6 discriminates all three:
//
//   $80 (con_not_game_over)  alive       — tested with BMI  ($E2D6)
//   $01-$7F                  exploding   — and the VALUE IS the countdown
//   $00                      destroyed   — tested with BEQ  ($C72A/$E2D4/$E6AC)
//
// So "eagle destroyed -> game over" is not an edge: a bullet reaching the eagle
// sets $27 ($E6B0), sub_E2A9 decrements it every frame ($E2DC) while driving the
// explosion animation off the remaining count, and only at $00 does sub_C728 end
// the stage. We keep that BEHAVIOUR — a 39-frame animated countdown — and drop the
// byte-packing, which is 6502 economy, not design. Flow doc §6b/§7.8.
export const BASE_STATE = Object.freeze({
  ALIVE: 'ALIVE',
  EXPLODING: 'EXPLODING',
  DESTROYED: 'DESTROYED',
});

export const EAGLE_EXPLOSION_FRAMES = 0x27;   // $E6AE LDA #$27 — 39 frames

export class Base {
  constructor() {
    this.state = BASE_STATE.ALIVE;
    this.explosionTimer = 0;
    this.shovelTimer = 0;   // ram_shovel_timer ($45)
  }

  isDestroyed() { return this.state === BASE_STATE.DESTROYED; }

  // $C386-$C388 (inside sub_C331): game_over_flag = con_not_game_over, per stage.
  reset() {
    this.state = BASE_STATE.ALIVE;
    this.explosionTimer = 0;
  }

  // $E6AA-$E6B0 — a bullet reached the eagle.
  onHit() {
    if (this.state !== BASE_STATE.ALIVE) return;   // $E6AC BEQ — don't re-trigger
    this.state = BASE_STATE.EXPLODING;
    this.explosionTimer = EAGLE_EXPLOSION_FRAMES;
    // TODO: $C6B4/$C6B7 ram_sfx_explosion_hq / _player;
    //       $E6BA sub_CC08_draw_destroyed_eagle.
  }

  // sub_E2A9_HQ_handler ($E2A9) — pipeline step 6.
  update(field, game) {
    // TODO: port $E2A9's fortify/unfortify + the eagle draw ($E2C9 sub_CB9E
    //       draw_protected_base vs $E2CF sub_CAF5 draw_default_base).

    // loc_E2D2 ($E2D2) — the countdown.
    if (this.state !== BASE_STATE.EXPLODING) return;   // $E2D4 BEQ / $E2D6 BMI
    if (--this.explosionTimer <= 0) {                  // $E2DC DEC
      this.state = BASE_STATE.DESTROYED;
    }
    // TODO: $E2DE-$E2F5 drive the explosion animation off the remaining count.
  }

  fortify(field) { /* TODO: shovel power-up — walls brick->steel */ }
  unfortify(field) { /* TODO: revert when timer expires */ }
}
