// timer.js — the per-life countdown: 60 beats, one draining every 30 frames (§6). Time-out
// kills; remaining beats × 10 is the home time bonus. The bar renders green, red near the
// end (§4.1). Values are tunable (constants.js).
import { TIMER } from './constants.js';

export class Timer {
  constructor() { this.reset(); }

  reset() { this.beats = TIMER.BEATS; this._frames = TIMER.FRAMES_PER_BEAT; }

  // Returns true on time-out (beats reached 0).
  tick() {
    if (this.beats <= 0) return true;
    if (--this._frames <= 0) { this._frames = TIMER.FRAMES_PER_BEAT; this.beats--; }
    return this.beats <= 0;
  }

  get warning() { return this.beats <= TIMER.WARNING_AT; }
  bonus() { return this.beats * TIMER.BONUS_PER_BEAT; }

  // Continuous beats remaining (whole beats + the sub-beat drained so far) so the HUD bar creeps
  // smoothly rather than jumping a whole beat every FRAMES_PER_BEAT frames.
  remaining() { return this.beats > 0 ? (this.beats - 1) + this._frames / TIMER.FRAMES_PER_BEAT : 0; }
  fraction() { return this.remaining() / TIMER.BEATS; }
}
