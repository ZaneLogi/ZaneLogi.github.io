// enemy_ai.js — S4 Enemy AI
//
// In the ROM the AI is not a separate module — it's woven into tank movement and
// firing. This class collects those decision points for the enemy Tanks:
//   * target bias lives in the tank state nibble: FOLLOW_HQ ($B0) / FOLLOW_P2
//     ($C0) / FOLLOW_P1 ($D0)
//   * movement/destination decisions inside sub_DBF1_tank_movement using RNG and
//     ram_enemy_destination_X/Y ($71/$72)
//   * firing: sub_E162 ($E162) — frozen while ram_clock_timer ($0100) != 0, else
//     each enemy fires on a 1/32 RNG roll per frame (decoded)
//
// Absorbs: AI portion of $DBF1, $E162, ram_enemy_destination_*.
// Uses: Rng. See docs/research_system_interaction_map.md §5 (S4).

export class EnemyAI {
  constructor(rng) {
    this.rng = rng;
    this.destX = 0; // ram_enemy_destination_X ($71)
    this.destY = 0; // ram_enemy_destination_Y ($72)
  }

  // choose next move/turn for an enemy tank ($DBF1 AI paths)
  decideMovement(tank, field) { /* TODO */ }

  // 1/32 RNG roll ($E162); caller gates on clock-freeze power-up
  shouldFire(tank) { /* TODO: return (rng.next() & 0x1F) === 0 */ return false; }
}
