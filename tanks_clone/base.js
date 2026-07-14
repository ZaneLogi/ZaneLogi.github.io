// base.js — S6 Base / HQ (the eagle)
//
// The eagle and its surrounding walls. Reads/writes the Field (the wall cells).
// When a bullet destroys the eagle, sets the game-over flag. The shovel power-up
// temporarily fortifies the walls (brick -> steel) for ram_shovel_timer ($45).
//
// Absorbs:
//   sub_E2A9_HQ_handler ($E2A9)                  — per-frame base logic
//   sub_CAF5_draw_default_base ($CAF5), sub_CB5D_draw_default_eagle ($CB5D)
//   sub_CB9E_draw_protected_base ($CB9E), sub_CC08_draw_destroyed_eagle ($CC08)
//   ram_shovel_timer ($45)
// See docs/research_system_interaction_map.md §5 (S6).

export class Base {
  constructor() {
    this.alive = true;
    this.shovelTimer = 0; // ram_shovel_timer ($45)
  }

  update(field, session) { /* TODO: port $E2A9 (fortify/unfortify, destruction) */ }
  fortify(field) { /* TODO: shovel power-up — walls brick->steel */ }
  unfortify(field) { /* TODO: revert when timer expires */ }
  onHit(session) { /* TODO: eagle destroyed -> session.gameOver */ }
}
