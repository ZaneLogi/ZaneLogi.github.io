// rng.js — Random number generator
//
// Source: sub_D44D_generate_random_number ($D44D):
//   random = random*7 + frm_cnt_hi + zp[++index]      (decoded)
// The ROM's core mix (random*7) is a WEAK generator with short, visible cycles;
// it leans on `zp[++index]` — a rolling read of the whole zero page, i.e. live
// game state (tank/bullet positions, frame counters) — to stay unpredictable.
//
// Re-derivation (governing test: the RNG *sequence* is CPU-only, unobservable —
// only its effect, natural-looking enemy choices, is seen; so the generator is
// free to change). We replace the weak core + the 256-byte live-state stir with a
// proper 16-bit LFSR, and KEEP `+ frm_cnt_hi` from the source. The LFSR is a
// maximal-period generator (period 65535, uniform low byte), so it needs no
// external entropy; the run-to-run variation comes from WHEN it is sampled —
// which is gameplay-driven (enemies roll it a data-dependent number of times per
// frame: the 1/16 grid re-pick, the blocked 3/4-vs-1/4, the $90 turn, one 1/32
// fire roll per live enemy). That also makes it reproducible, so the headless
// enemy-movement tests are deterministic.
//
// Consumed by EnemyAI (movement, fire), Bonus (position), spawn scheduling.
// See docs/research_system_interaction_map.md §5 (S12).

// Maximal 16-bit Galois LFSR feedback polynomial (taps 16,14,13,11): every
// non-zero state is visited once before repeating (period 65535).
const LFSR_TAPS = 0xB400;

// Arbitrary non-zero seed. The LFSR must never be seeded 0 (0 is a fixed point);
// any non-zero value enters the single length-65535 cycle.
const RNG_SEED = 0xACE1;

export class Rng {
  constructor() {
    this.state = RNG_SEED;   // 16-bit LFSR state (the ROM's ram_random $0F analog)
  }

  // sub_C2AA / RESET seed the ROM's random to a known value; re-seed here so a
  // fresh session (and a test) starts from a deterministic point.
  reset() { this.state = RNG_SEED; }

  // sub_D44D — one step. `frmCntHi` = ram_frm_cnt_hi ($0A), which advances once
  // per 64 frames; passed in like the ROM reads the shared counter, kept from
  // the source ($D458 ADC ram_frm_cnt_hi). Returns a byte; callers mask the low
  // bits they need (& $1F fire, & $0F re-pick, & $03 direction, & $01 coin-flip).
  next(frmCntHi = 0) {
    this._advance();
    return (this.state + frmCntHi) & 0xFF;   // low byte of the LFSR + frm_cnt_hi
  }

  // 16-bit Galois LFSR: shift right, and XOR in the taps when the ejected bit is 1.
  _advance() {
    const lsb = this.state & 1;
    this.state >>>= 1;
    if (lsb) this.state ^= LFSR_TAPS;
  }
}
