// rng.js — S12 Random number generator
//
// Absorbs: sub_D44D_generate_random_number ($D44D)
//   random = random*7 + frm_cnt_hi + zp[++index]   (decoded)
// Consumed by EnemyAI (movement, fire), Bonus (position), spawn scheduling.
// See docs/research_system_interaction_map.md §5 (S12).

export class Rng {
  constructor() {
    this.random = 0;   // ram_random ($0F)
    this.index = 0;    // ram_index_for_random ($10)
    // Source mixes in a rolling zero-page byte as entropy (zp[index]). We have
    // no zero page; a small entropy ring is the re-derived equivalent.
    this.entropy = new Uint8Array(256); // TODO: decide seeding to match feel
  }

  // TODO: port $D44D. `frmCntHi` = ram_frm_cnt_hi ($0A), advanced once/64 frames.
  next(frmCntHi = 0) {
    // this.index = (this.index + 1) & 0xFF;
    // this.random = (this.random * 7 + frmCntHi + this.entropy[this.index]) & 0xFF;
    // return this.random;
    return 0;
  }
}
