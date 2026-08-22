// seafox/src/core/difficulty.js
//
// The difficulty ladder of design_spec Chapter 8.
//
// **There is no level data.** Difficulty is six rungs -- the title screen, then
// missions 1 to 5 -- each setting the same eight values, and five missions share
// one map, one roster, one set of sprites and one loadout. § 8.5 lists what does
// NOT vary, and it is longer than what does: the kill quota, the ten-record
// roster, both type tables, every sprite, the four surface spawn rows, every
// spawner interval, and the starting fuel, torpedoes and burn rate.
//
// Seven of the eight knobs are **live-population caps**: they limit CONCURRENCY,
// not rate. Spawn intervals do not vary by mission at all (§ 8.2). Reading them
// as spawn rates makes the whole curve wrong in a way that still looks like a
// difficulty ramp.
//
// § 8.6 leaves the storage free and says a table is preferable to six branches
// and produces identical behaviour. This is that table.

import { CLASS } from './types.js';

/**
 * The six rungs of § 8.2, indexed by mission counter: 0 is the title screen and
 * 1-5 are the missions. Column order is the spec's.
 *
 * Reading the ladder as a whole (§ 8.3), it is mostly **gating rather than
 * climbing**:
 *
 *   * Only the hospital ship ramps monotonically -- 2, 4, 5, 6, 7 -- and it is
 *     the one class that is never a target and never a threat. The thing that
 *     steadily increases is clutter.
 *   * The merchant cap never changes. The target class is exactly as dense on
 *     mission 5 as on mission 1; what changes is what else is on screen.
 *   * Mission 1 switches three classes off entirely -- no mines, no Destroyers,
 *     and therefore no depth charges.
 *   * The submarine's two weapons alternate rather than accumulate: torpedoes on
 *     3, mines on 4, both on 5. The harder one to escape arrives second.
 *   * The title screen is NOT the easy setting -- it is denser than mission 1 on
 *     five of seven knobs, tuned to look busy rather than to be survivable.
 *
 * @type {{enemySubmarine: number, magneticMine: number, hospitalShip: number,
 *         merchant: number, destroyer: number, depthCharge: number,
 *         enemyTorpedo: number, unused: number}[]}
 */
export const LADDER = [
  // enemy sub, mine, hospital, merchant, destroyer, depth charge, enemy torpedo, unused
  { enemySubmarine: 3, magneticMine: 2, hospitalShip: 2, merchant: 3, destroyer: 3, depthCharge: 3, enemyTorpedo: 1, unused: 0 },  // 0 title / demo
  { enemySubmarine: 1, magneticMine: 0, hospitalShip: 2, merchant: 3, destroyer: 0, depthCharge: 0, enemyTorpedo: 0, unused: 0 },  // 1
  { enemySubmarine: 1, magneticMine: 0, hospitalShip: 4, merchant: 3, destroyer: 3, depthCharge: 3, enemyTorpedo: 0, unused: 0 },  // 2
  { enemySubmarine: 3, magneticMine: 0, hospitalShip: 5, merchant: 3, destroyer: 3, depthCharge: 3, enemyTorpedo: 3, unused: 0 },  // 3
  { enemySubmarine: 3, magneticMine: 3, hospitalShip: 6, merchant: 3, destroyer: 3, depthCharge: 3, enemyTorpedo: 0, unused: 0 },  // 4
  { enemySubmarine: 3, magneticMine: 3, hospitalShip: 7, merchant: 3, destroyer: 3, depthCharge: 3, enemyTorpedo: 3, unused: 0 },  // 5
];

/**
 * The eighth knob is zero on every rung and has no effect: it belonged to the
 * rate governor that § 1.3 does not reproduce. Kept in the table for
 * transcription fidelity, and named here so nobody wires it to anything.
 * @type {string}
 */
export const UNUSED_KNOB = 'unused';

/**
 * The two caps that are not on the ladder (§ 4.7). One shot of each kind may be
 * in flight, which is the weapon's rate of fire expressed as a population limit
 * rather than as a cooldown.
 * @type {number}
 */
export const TORPEDO_CAP = 1;

/**
 * The rung for a mission counter.
 *
 * **A mission counter above 5 falls through to mission 3's settings** (§ 8.1),
 * not to a default and not to any scaling rule. This is unreachable in the game
 * as specified, because clearing mission 5 ends it -- but an implementation that
 * adds missions inherits mission 3 and should do so deliberately.
 *
 * @param {number} mission 0 for the title screen, 1-5 for a mission
 * @returns {Object<string, number>} the nine caps, keyed as the counters are
 */
export function capsFor(mission) {
  const rung = LADDER[mission] !== undefined ? LADDER[mission] : LADDER[3];
  return {
    [CLASS.ENEMY_SUBMARINE]: rung.enemySubmarine,
    [CLASS.MAGNETIC_MINE]: rung.magneticMine,
    [CLASS.HOSPITAL_SHIP]: rung.hospitalShip,
    [CLASS.MERCHANT]: rung.merchant,
    [CLASS.DESTROYER]: rung.destroyer,
    [CLASS.DEPTH_CHARGE]: rung.depthCharge,
    [CLASS.ENEMY_TORPEDO]: rung.enemyTorpedo,
    [CLASS.VERTICAL_TORPEDO]: TORPEDO_CAP,
    [CLASS.HORIZONTAL_TORPEDO]: TORPEDO_CAP,
  };
}

/**
 * Which side the enemy submarine enters from (§ 8.4). This is decided separately
 * from the ladder, and it **inverts the apparent difficulty curve**: the two
 * missions where the submarine can come at you from behind are exactly the two
 * where it is unarmed. From mission 3 on it always enters from the right, which
 * is what makes its torpedo's firing condition meaningful -- Chapter 13 refuses
 * the shot unless the player is ahead of it.
 *
 * When the side is random, the choice draws one bit from the generator and it is
 * **bit 1 of the output byte, not bit 0**. § 5.4 establishes that bit 0 carries
 * nothing forward, so masking the low bit is not sampling the same thing.
 *
 * @param {number} mission
 * @returns {boolean} true when the side is drawn per spawn, false for right-only
 */
export function entrySideIsRandom(mission) {
  return mission === 1 || mission === 2;
}
