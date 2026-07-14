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

export class Tank {
  constructor(slot) {
    this.slot = slot;            // 0=P1, 1=P2, 2..7=enemy
    this.x = 0; this.y = 0;
    this.dir = 0;                // low nibble of flags
    this.state = 0;              // high nibble of flags (TANK_STATE)
    this.type = 0;
    this.wheels = 0;
    this.stageCell = 0;
    this.ai = null;              // EnemyAI instance for enemy slots
  }

  get isPlayer() { return this.slot < 2; }
  get isDrivable() { return this.state >= 0x80 && this.state < 0xE0; }

  // per-frame status dispatch (draw+state) — the tbl_E4B8 jump table ($DEB8)
  handle() { /* TODO: switch(this.state) → explosion / kill-points / respawn / normal */ }

  // movement step ($DBF1); players use input, enemies delegate to this.ai
  move(input, field) { /* TODO: port $DBF1 */ }

  iceMove(field) { /* TODO: port $DB75 */ }
}
