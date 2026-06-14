// MoonGates resource — the moongate subsystem's mutable runtime state:
//   - D_2C74 : the blue network's 8 endpoints [x,y,z] (D_2C4A.c), indexed by lunar
//              phase (= moonstone frame). SAVE STATE — burying relocates a slot, so it
//              persists (snapshot.js SAVED_RESOURCES). Seeded from the compiled
//              constants at new-game-init (the clone has no char-creation step that
//              would write them; research_moongate.md §8.1, locked decision #1).
//   - the two moons' SLOT + PHASE quad (D_2CC6/7/8/9), recomputed hourly from the
//     clock (seg_0A33.c:907-910). DERIVED, not persisted — recomputed on load + each
//     hour by the phase clock (sub-step b).
//
// Slot 0..7 = Trammel's / Felucca's endpoint index for the day (calendar D_036A).
// Phase 0..23 = the finer within-day value driving gate visibility (sub-step c),
// the sky arc position (h) and the which-moon-wins tiebreak (c). The phase math can
// go slightly negative (small slot + late hour); JS `%` matches C's truncated
// modulo, and consumers guard (`phase < 15` = moon up; the sky view gates on
// `phase >= 0`) — so the raw value is kept, not clamped.

import { D_2C74_DEFAULTS, D_036A } from '../assets/moon_tables.js';

export class MoonGates {
  constructor() {
    // Deep-copy the frozen defaults into a mutable 8x3 array (bury writes into it).
    this.D_2C74 = D_2C74_DEFAULTS.map((row) => row.slice());
    // Moon phase quad (seg_0A33.c:907-910). Filled by recomputePhases().
    this.trammelSlot = 0;    // D_2CC6 — moon 1 (Trammel) endpoint SLOT 0..7
    this.trammelPhase = 0;   // D_2CC7 — moon 1 within-day PHASE
    this.feluccaSlot = 0;    // D_2CC8 — moon 2 (Felucca) endpoint SLOT 0..7
    this.feluccaPhase = 0;   // D_2CC9 — moon 2 within-day PHASE
  }

  // seg_0A33.c:907-910 — recompute both moons from the hour-of-day + day-of-month.
  // Trammel offset +18, Felucca +20. Called on load + each WorldClock hour-rollover.
  recomputePhases(clock) {
    const d = D_036A[(clock.Date_D - 1) % 28];
    this.trammelSlot = d[0];
    this.trammelPhase = (this.trammelSlot * 3 + 18 - clock.Time_H) % 24;
    this.feluccaSlot = d[1];
    this.feluccaPhase = (this.feluccaSlot * 3 + 20 - clock.Time_H) % 24;
  }

  // The blue endpoint for a slot index, as [x,y,z]. (D_2C74[slot].)
  gateDest(slot) { return this.D_2C74[slot]; }

  // Is a blue slot "buried" (an active endpoint)? An all-zero row is an unburied slot
  // (GateTravel stays put; C_101C_0A3A's `if(x||y||z)` guard).
  isSlotActive(slot) {
    const s = this.D_2C74[slot];
    return !!(s[0] || s[1] || s[2]);
  }

  // At least one moon "up" — a blue gate should exist (C_0A33_121A's
  // `D_2CC7 < 15 || D_2CC9 < 15`).
  anyMoonUp() { return this.trammelPhase < 15 || this.feluccaPhase < 15; }
}
