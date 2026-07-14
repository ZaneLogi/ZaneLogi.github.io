// bullet.js — S5 Bullets
//
// Bullets are indexed PARALLEL to tanks (decoded): bullet i belongs to tank i.
// Each tank has one primary bullet (8-wide arrays); the two players can each hold
// a SECOND simultaneous bullet once upgraded (2-wide arrays) — that's the
// "2 shots on screen" power level (tank_type & $C0 == $40, seen in $E122).
//   primary: ram_bullet_pos_X/Y ($B8/$C2), _status ($CC), _property ($D6)
//   second : ram_2nd_bullet_*    ($C0/$CA/$D4/$DE)  — players only
//
// Absorbs:
//   sub_E08C_bullets ($E08C)                     — spawn a bullet
//   sub_E122 ($E122)                             — player fire (+ 2nd-bullet promote)
//   sub_E162 ($E162)                             — enemy fire (delegates to EnemyAI)
//   sub_E02E_bullets_status_handler ($E02E)      — lifecycle/status
//   sub_E604_bullets_movement ($E604)            — move + terrain collision
//   sub_E70C_...collision_with_player_tanks ($E70C)
//   sub_E910_...collision_with_bullets ($E910)
//   sub_DEE2_draw_bullet_explosion ($DEE2), sub_E409_clear_bullet_status ($E409)
// See docs/research_system_interaction_map.md §3 (steps 5,8,9,11-13), §5 (S5).

export class Bullet {
  constructor(owner) {
    this.owner = owner;   // tank slot
    this.x = 0; this.y = 0;
    this.dir = 0;
    this.status = 0;      // 0 = inactive
    this.property = 0;    // power / owner-kind bits [?]
  }
  get active() { return this.status !== 0; }
}

export class BulletManager {
  constructor() {
    this.primary = Array.from({ length: 8 }, (_, i) => new Bullet(i));
    this.second = Array.from({ length: 2 }, (_, i) => new Bullet(i)); // players only
  }

  playerFire(roster, input) { /* TODO: port $E122 incl. 2nd-bullet promotion */ }
  enemyFire(roster, ai, clockFrozen) { /* TODO: port $E162 */ }
  spawn(tank) { /* TODO: port $E08C */ }

  updateStatus() { /* TODO: port $E02E */ }
  move(field, base) { /* TODO: port $E604 + terrain/eagle hit */ }
  collideWithBullets() { /* TODO: port $E910 */ }
  collideWithTanks(roster, score) { /* TODO: port $E70C */ }
  clearAll() { /* TODO: port $E409 */ }
}
