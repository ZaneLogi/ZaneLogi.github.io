// Moon-phase clock (I-moongate sub-step b). Ports the moon-recompute half of the
// hourly time-advance block (seg_0A33.c:907-910): each hour-rollover recomputes both
// moons' SLOT + PHASE from the day-of-month calendar + hour-of-day, into the MoonGates
// resource. The blue-gate runtime (c), the sky view (h) and the gate readout (g) all
// read those values.
//
// Registers a WorldClock.onHour hook (fires once per hour during WorldClock.advance,
// driven by the decoupled world_clock_system — research_moongate.md §3). Also does ONE
// immediate recompute at install so the phases are valid before the first hour rolls
// over — needed on a RESTORED game (where startRender skips the fresh-load first-tick
// hour-hook replay) and harmless on a fresh load (the replay recomputes again).

import { WorldClock } from '../resources/world_clock.js';
import { MoonGates } from '../resources/moon_gates.js';

export function installMoonPhaseSystem(world) {
  const clock = world.getResource(WorldClock);
  const moons = world.getResource(MoonGates);
  if (!clock || !moons) return;
  clock.onHour((c) => moons.recomputePhases(c));   // seg_0A33.c:907-910, on each hour-rollover
  moons.recomputePhases(clock);                    // initial sync (covers restore; redundant-but-safe on fresh load)
}
