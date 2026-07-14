// bonus.js — S7 Bonus / power-ups
//
// A single on-field bonus (ram_bonus_pos_X/Y/id $86/$87/$88, timer $62). Picking
// it up applies an effect that reaches into several subsystems — hence Bonus
// collaborates widely:
//   helmet/star  -> ram_helmet_timer ($89)   invincibility (Tank/Roster)
//   clock/freeze -> ram_clock_timer ($0100)  freezes enemy fire (EnemyAI, $E162)
//   shovel       -> Base.fortify
//   grenade/tank/star-upgrade -> Roster / lives / score
//
// Absorbs:
//   sub_E8BE_spawn_bonus ($E8BE)
//   sub_E23B_display_bonus_on_screen ($E23B)
//   sub_E972_try_to_pick_up_bonus ($E972)
//   sub_E902_convert_random_number_to_position ($E902)
// See docs/research_system_interaction_map.md §5 (S7).

export class Bonus {
  constructor() {
    this.x = 0; this.y = 0;
    this.id = 0;      // ram_bonus_id ($88) — [?] decode ids from $E8BE/$E972
    this.timer = 0;   // ram_bonus_timer ($62)
    this.active = false;
  }

  spawn(rng) { /* TODO: port $E8BE + $E902 (random position) */ }
  display(renderer) { /* TODO: port $E23B (blink) */ }
  tryPickup(roster, base, session, score) { /* TODO: port $E972 + effect dispatch */ }
}
