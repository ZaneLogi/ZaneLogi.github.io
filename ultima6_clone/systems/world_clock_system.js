// WorldClockSystem — sim-list. I-14d: the game clock is DECOUPLED from NPC rounds — it
// advances on its OWN real-time cadence (game-minutes per real-second), scaled by the
// WORLD_SPEED master slider, NOT once per turn/refill. (Source ticks the clock per depleted
// move-point round, C_0A33_1355(1) at seg_1E0F.c:2147; that per-refill coupling is turn-loop
// convenience — dropped as a kept clone deviation per the modern-UX anchor, so time-of-day
// can't speed up in empty areas / slow down in crowds, and the old 600x runaway is gone.)
//
// Like the npc tick it integrates real elapsed time (clamped, injectable `now` for tests),
// accumulating fractional game-minutes and advancing the WorldClock by whole minutes (which
// fires its hourly schedule hooks). It's a sim system, so a suspended turn-driver (modal /
// dev pause) freezes time too; WORLD_SPEED 0 (slider slow end) also freezes it.

import { WorldClock } from '../resources/world_clock.js';
import { WorldSpeed } from '../resources/world_speed.js';
import { MAX_ELAPSED_MS } from './move_economy.js';

// Game-minutes per real-second at WORLD_SPEED 1 (the calibrated default). 2 → a full
// 24-game-hour day in ~12 real minutes; the slider scales it (slow end = frozen).
export const CLOCK_MIN_PER_REAL_SEC = 2;

export function makeWorldClockSystem({ now = () => performance.now() } = {}) {
  let lastAt = now();
  let fracMin = 0;                       // carried fractional game-minutes
  return (world) => {
    const t = now();
    let elapsed = t - lastAt; lastAt = t;
    if (elapsed < 0) elapsed = 0; else if (elapsed > MAX_ELAPSED_MS) elapsed = MAX_ELAPSED_MS;
    const wsRes = world.getResource(WorldSpeed);
    const worldSpeed = wsRes ? wsRes.value : 1;
    fracMin += (elapsed / 1000) * CLOCK_MIN_PER_REAL_SEC * worldSpeed;
    const whole = Math.floor(fracMin);
    if (whole > 0) { world.getResource(WorldClock).advance(whole); fracMin -= whole; }
  };
}
