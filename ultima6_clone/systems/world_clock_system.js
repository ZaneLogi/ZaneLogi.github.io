// WorldClockSystem — sim-list. Each turn (driven by TurnClock's idle heartbeat
// or commitAction), advance the WorldClock by 1 game-minute. Ports the
// time-advance kick at the bottom of C_1E0F_4E0A — "round exhausted ->
// C_0A33_1355(1)" (seg_1E0F.c:2147). At I-3 there's no NPC machinery, so the
// turn-driver's idle heartbeat IS the round-exhaustion signal.

import { WorldClock } from '../resources/world_clock.js';

export function makeWorldClockSystem() {
  return (world) => world.getResource(WorldClock).advance(1);
}
