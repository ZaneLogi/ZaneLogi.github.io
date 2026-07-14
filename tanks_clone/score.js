// score.js — S8 Score / HUD
//
// Per-player scores are stored as BCD/decimal digit fields in the ROM; extra life
// at 20000 pts; hi-score tracking; the right-side HUD (lives + the column of
// remaining-enemy icons).
//
// Absorbs:
//   sub_D9BE_add_score ($D9BE), sub_D9E1/DA13 decimal, D9FE clear-bcd
//   sub_D138_gain_extra_life_for_20000_pts ($D138)
//   sub_D97D_check_hiscore_beaten ($D97D), sub_D951_draw_huge_hiscore
//   sub_C7C8_print_lives_handler ($C7C8)
//   enemy-icon counter: sub_C894/C8A2/C8B1/C8C0
//   ram_p1_score ($15), ram_p2_score ($1D), ram_hi_score ($3D)
// See docs/research_system_interaction_map.md §5 (S8).

export class Score {
  constructor() {
    this.p1 = 0; this.p2 = 0;   // BCD in source; plain ints here [?] keep faithful
    this.hi = 20000;            // default hi-score
    this.p1Extra = false; this.p2Extra = false; // ram_p1/p2_extra_life ($66/$67)
  }

  add(player, points) { /* TODO: port $D9BE (+ $D138 extra-life check) */ }
  checkHiscore() { /* TODO: port $D97D */ }
  drawLives(renderer, lives) { /* TODO: port $C7C8 */ }
  drawEnemyIcons(renderer, remaining) { /* TODO: port $C8C0 */ }
}
