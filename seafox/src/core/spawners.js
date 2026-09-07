// seafox/src/core/spawners.js
//
// The five spawners of design_spec Chapter 12, and the merchant roster they
// walk. Each runs once per tick, in the order of § 9.2, and they share one
// shape (§ 12.1).
//
// **The order is normative** -- enemy submarine, hospital ship, merchant, supply
// submarine, Destroyer -- because all five draw from one shared generator
// (§ 5.6). Two implementations that draw the same quantities in a different
// order produce different games from the same initial state.
//
// Two rules here look like details and are the whole behaviour of the caps:
//
//   * **A blocked spawn is pending, not skipped** (§ 12.2). When the cooldown
//     reaches zero but the class is at its cap, the cooldown is NOT reloaded:
//     it stays at zero and the cap is retested every tick, so the spawn happens
//     on the very tick a slot frees. That is what makes a cap a standing
//     population rather than a rate. An implementation that reschedules a
//     blocked spawn turns every cap into a slow trickle.
//   * **A cooldown of n fires on tick n + 1**, because the countdown is tested
//     before it is decremented. § 20.3 names "everything one tick early" as the
//     signature of getting this backwards.

import { TYPE, CLASS } from './types.js';
import { entrySideIsRandom } from './difficulty.js';
import { seedRelease } from './convoy.js';

/** Merchant roster record states (§ 12.5). */
export const ROSTER_STATUS = {
  AVAILABLE: 0,
  IN_FLIGHT: 1,
  SUNK: 2,
};

/**
 * The ten merchant roster records (§ 12.5). **The roster is the mission**: ten
 * records, a quota of ten, one spawn each.
 *
 * Each record's flag byte fixes the vessel's appearance for life -- bit 0 feeds
 * the spawn X, which fixes the column parity and therefore the hue, and bit 7
 * feeds the palette selection. Ten records over **seven distinct bitmaps** in
 * **four hues**: records 1 and 7 are genuinely the same vessel twice, while 2/8
 * and 4/9 share a bitmap at different parity and read as different ships.
 *
 * § 1.3 makes the four hues normative -- without colour the ten collapse to
 * seven. `spawnX` here IS the parity: it is the stored `phase` of the matching
 * sprite block, and the test cross-checks the two against the asset metadata.
 *
 * @type {{sprite: string, spawnX: number, flip: number, hue: string}[]}
 */
export const MERCHANT_ROSTER = [
  { sprite: 'merchant0', spawnX: 0, flip: 0, hue: 'violet' },
  { sprite: 'merchant1', spawnX: 0, flip: 1, hue: 'blue' },
  { sprite: 'merchant2', spawnX: 0, flip: 0, hue: 'violet' },
  { sprite: 'merchant3', spawnX: 1, flip: 1, hue: 'orange' },
  { sprite: 'merchant4', spawnX: 1, flip: 0, hue: 'green' },
  { sprite: 'merchant5', spawnX: 1, flip: 1, hue: 'orange' },
  { sprite: 'merchant6', spawnX: 1, flip: 0, hue: 'green' },
  { sprite: 'merchant7', spawnX: 0, flip: 1, hue: 'blue' },
  { sprite: 'merchant8', spawnX: 1, flip: 0, hue: 'green' },
  { sprite: 'merchant9', spawnX: 0, flip: 1, hue: 'blue' },
];

/** @type {number} § 8.5: the quota is ten in every mission. */
export const KILL_QUOTA = 10;

/**
 * The five spawners, in the normative order of § 9.2.
 *
 * `firstTick` is what § 20.3 asserts and is a **cold-boot property**: these
 * cooldowns are shipped values that nothing resets between rounds or missions,
 * so the opening of the first demo after a cold start is fully determined.
 * `cooldown` below is therefore `firstTick - 1`.
 *
 * Intervals are `base + (draw & 15)`, a 16-tick window. **The supply submarine
 * is the exception in two ways**: a fixed 1000-tick interval with no random
 * term, and no population cap at all -- it can be delayed but never blocked,
 * and it is the only class the difficulty ladder cannot touch.
 *
 * @type {{key: string, type: number, cls: string|null, firstTick: number,
 *         base: number, random: boolean}[]}
 */
export const SPAWNERS = [
  { key: 'enemySubmarine', type: TYPE.ENEMY_SUBMARINE, cls: CLASS.ENEMY_SUBMARINE, firstTick: 51,  base: 48,   random: true },
  { key: 'hospitalShip',   type: TYPE.HOSPITAL_SHIP,   cls: CLASS.HOSPITAL_SHIP,   firstTick: 46,  base: 150,  random: true },
  { key: 'merchant',       type: TYPE.MERCHANT_SHIP,   cls: CLASS.MERCHANT,        firstTick: 201, base: 200,  random: true },
  { key: 'supplySubmarine', type: TYPE.SUPPLY_SUBMARINE, cls: null,                firstTick: 1,   base: 1000, random: false },
  { key: 'destroyer',      type: TYPE.DESTROYER,       cls: CLASS.DESTROYER,       firstTick: 51,  base: 240,  random: true },
];

/** Fixed spawn rows (§ 12.3). The enemy submarine's is drawn instead (§ 12.4). */
const SPAWN_Y = {
  hospitalShip: 20,
  merchant: 10,
  supplySubmarine: 177,
  destroyer: 30,
};

/** @type {number} X of an object entering from the right (§ 12.3). */
const RIGHT_EDGE = 306;

/**
 * Reload the supply submarine's cooldown to its full interval (§ 11.1.1).
 *
 * **The one exception to "cooldowns never reset"** (§ 12.3). It is called from
 * the fresh-submarine path only -- never from the mission-cleared fly-in -- so
 * the two round-start paths differ in when the next resupply arrives.
 *
 * @param {{cooldowns: Object<string, number>}} spawners
 * @returns {void}
 */
export function reloadSupplyCooldown(spawners) {
  spawners.cooldowns.supplySubmarine = SPAWNERS
    .find((s) => s.key === 'supplySubmarine').base;
}

/**
 * Fresh spawner state. **Nothing resets this** -- § 12.3 makes the cooldowns
 * shipped constants that survive rounds and missions, which is exactly what
 * makes Oracle 2 an oracle. The roster is the part that does reset, per mission.
 * @returns {{cooldowns: Object<string, number>, roster: number[], rosterCursor: number}}
 */
export function createSpawnerState() {
  /** @type {Object<string, number>} */
  const cooldowns = {};
  for (const s of SPAWNERS) cooldowns[s.key] = s.firstTick - 1;
  return {
    cooldowns,
    roster: MERCHANT_ROSTER.map(() => ROSTER_STATUS.AVAILABLE),
    rosterCursor: MERCHANT_ROSTER.length,
  };
}

/**
 * Reset the roster for a new mission (§ 12.5, § 8.5). The cooldowns are
 * deliberately untouched.
 * @param {{roster: number[], rosterCursor: number}} state
 * @returns {void}
 */
export function resetRoster(state) {
  for (let i = 0; i < state.roster.length; i++) state.roster[i] = ROSTER_STATUS.AVAILABLE;
  // **Seeded with the roster LENGTH, not zero** -- $6A20/$6A23 is `LDA $8341 /
  // STA $8340`, the same byte that supplies the quota. The cursor therefore
  // starts one past the end, on the value that trips the wrap below, so every
  // mission opens on the doubled record-0 pair.
  state.rosterCursor = MERCHANT_ROSTER.length;
}

/**
 * Release every **in-flight** record back to the pool, leaving sunk ones alone
 * (§ 12.5). This is the tail of the list clear, not a reset of its own:
 *
 *     69AF  LDA $8341 / ASL A x3      ; the roster length
 *     69B6  DEY x4 / BMI done
 *     69BC  LDA $8345,Y / CMP #$FF    ; in flight?
 *     69C3  LDA #$00 -> $8345,Y       ; -> free
 *
 * **It is what makes a death survivable, exactly as the escape path makes a
 * crossing survivable.** Clearing the entity list destroys the merchants on
 * screen without running their removal handler, so the records they carry would
 * otherwise stay in-flight for the rest of the mission -- unable to spawn, and
 * therefore unable to be sunk. Ten records against a quota of ten means even one
 * stranded record makes the mission unwinnable.
 *
 * **The source's loop bound is wrong and is deliberately not reproduced.**
 * `$69AF` scales the count by 8 -- the ENTITY stride -- where the roster's is 4,
 * so it walks twenty slots over ten records and runs past the end into the two
 * unaddressable records and then into `entry_8373`'s own bytes. Those read
 * `16 F0 16 9D AB 16 A3 16`; none is `$FF`, so nothing is ever written and the
 * bug has never fired. Porting it would mean modelling code as data to reproduce
 * an effect that does not exist -- the clam's uninitialised Y again (§ 13.8.3).
 *
 * @param {{roster: number[]}} state
 * @returns {void}
 */
export function releaseInFlight(state) {
  for (let i = 0; i < state.roster.length; i++) {
    if (state.roster[i] === ROSTER_STATUS.IN_FLIGHT) state.roster[i] = ROSTER_STATUS.AVAILABLE;
  }
}

/**
 * Run all five spawners for one tick, in the normative order (§ 9.2 step 5).
 * @param {Object} session the session of session.js
 * @returns {void}
 */
export function runSpawners(session) {
  for (const spawner of SPAWNERS) runOne(session, spawner);
}

/**
 * One spawner, the shared shape of § 12.1.
 * @param {Object} session
 * @param {{key: string, type: number, cls: string|null, base: number, random: boolean}} spawner
 * @returns {void}
 */
function runOne(session, spawner) {
  const state = session.spawners;

  if (state.cooldowns[spawner.key] !== 0) {
    state.cooldowns[spawner.key] -= 1;
    return;                                  // nothing else happens this tick
  }

  // The cap test. Returning WITHOUT reloading is § 12.2 and is the whole
  // difference between a standing population and a rate.
  if (spawner.cls !== null) {
    const cap = session.caps[spawner.cls];
    if (session.entities.counts[spawner.cls] >= cap) return;
  }

  if (spawner.key === 'merchant') {
    // § 12.5: the cursor advances even on a failed attempt, so the roster is
    // walked in order regardless of which records are still available.
    // $7B2E-$7B3D. **This is not a modulo**, and the difference is observable:
    //
    //     7B2E  LDA $8340      ; A = the cursor
    //     7B31  INC $8340      ; the STORED cursor moves; A still holds the old value
    //     7B34  CMP $8341      ; so the test is on the value just read, against 10
    //     7B37  BNE $7B3E
    //     7B39  LDA #$00       ; reloads the ACCUMULATOR as well as the cursor
    //     7B3B  STA $8340
    //
    // The cursor is allowed to reach 10, and the attempt that reads it there is
    // redirected to record 0 -- so the cycle is **eleven attempts long and names
    // record 0 twice in a row**: 0,0,1,2,...,9. A modulo gives ten attempts and
    // one record 0, which loses the doubled attempt.
    //
    // That attempt is not free. It finds record 0 in flight, falls into the
    // reload below, and **consumes both a full interval and a generator draw**
    // -- so the shape here sets merchant cadence and the shared draw order
    // (§ 5.6) for the rest of the mission, not just which vessel is next.
    let record = state.rosterCursor;
    state.rosterCursor += 1;
    if (record === MERCHANT_ROSTER.length) {
      record = 0;
      state.rosterCursor = 0;
    }
    if (state.roster[record] !== ROSTER_STATUS.AVAILABLE) {
      // A busy or sunk record consumes a full interval. Late in a mission this
      // is why merchant traffic thins out on its own, with no rule saying so.
      reload(session, state, spawner);
      return;
    }
    state.roster[record] = ROSTER_STATUS.IN_FLIGHT;
    spawnMerchant(session, record);
  } else {
    spawnFixed(session, spawner);
  }

  reload(session, state, spawner);
  session.entities.countSpawn(spawner.type);
}

/**
 * Reload a spawner's cooldown: `base + (draw & 15)`, or the fixed base where the
 * spawner takes no random term.
 * @param {Object} session
 * @param {{cooldowns: Object<string, number>}} state
 * @param {{key: string, base: number, random: boolean}} spawner
 * @returns {void}
 */
function reload(session, state, spawner) {
  state.cooldowns[spawner.key] = spawner.random
    ? spawner.base + (session.rng.step() & 15)
    : spawner.base;
}

/**
 * Spawn one of the four fixed-position classes.
 * @param {Object} session
 * @param {{key: string, type: number}} spawner
 * @returns {void}
 */
function spawnFixed(session, spawner) {
  const slot = session.entities.alloc(spawner.type);
  const e = session.entities.slots[slot];

  if (spawner.key === 'enemySubmarine') {
    const fromLeft = enterFromLeft(session);
    e.x = fromLeft ? 0 : RIGHT_EDGE;
    e.y = drawDepth(session.rng);
    e.sprite = fromLeft ? 'enemyHullLeftToRight' : 'enemyHullRightToLeft';
    // The direction is FIXED AT SPAWN and never changes: § 13.3 is explicit that
    // the submarine does not steer horizontally at all. Without this the step is
    // zero, the submarine never crosses, never reaches its exit, and its class
    // sits at its cap for the rest of the session -- which looks exactly like the
    // cap lock a missing exit produces (§ 13.11).
    e.scratch0 = fromLeft ? 2 : -2;
  } else if (spawner.key === 'destroyer') {
    e.x = RIGHT_EDGE;
    e.y = SPAWN_Y.destroyer;
    e.sprite = 'destroyer';
  } else if (spawner.key === 'hospitalShip') {
    e.x = 0;
    e.y = SPAWN_Y.hospitalShip;
    e.sprite = 'hospitalShip';
  } else {
    e.x = 1;
    e.y = SPAWN_Y.supplySubmarine;
    e.sprite = 'supplySubmarine';
    // One generator draw, seeding the payload-release countdown (§ 13.8.1 as
    // corrected; $7C0D in the disassembly). § 5.6's consumer list omits this
    // site, and draw order is normative -- see convoy.js's header.
    seedRelease(session, slot);
  }
}

/**
 * Spawn the merchant named by a roster record (§ 12.5). Its X is the record's
 * parity bit, which is what fixes its hue for life.
 * @param {Object} session
 * @param {number} record 0-9
 * @returns {void}
 */
function spawnMerchant(session, record) {
  const r = MERCHANT_ROSTER[record];
  const slot = session.entities.alloc(TYPE.MERCHANT_SHIP);
  const e = session.entities.slots[slot];
  e.x = r.spawnX;
  e.y = SPAWN_Y.merchant;
  e.sprite = r.sprite;
  e.paletteFlip = r.flip === 1;
  e.scratch3 = record;        // the roster slot: its death stamps the roster
}

/**
 * Which side an enemy submarine enters from (§ 8.4).
 *
 * **RESOLVED against the disassembly** (this was an open assumption; § 8.4 and
 * § 12.4 now carry it). The spawn costs THREE generator draws on missions 1-2
 * and TWO on every other rung, in this order: side, mask, depth. On the
 * right-only rungs the side draw is not taken at all -- the spawner does not
 * draw and discard -- so those missions consume one fewer value per submarine.
 * **Bit 1 set selects the left side**, clear the right.
 *
 * @param {Object} session
 * @returns {boolean} true to enter from the left at X 0
 */
function enterFromLeft(session) {
  if (!entrySideIsRandom(session.mission)) return false;
  // Bit 1, NOT bit 0: § 5.4 establishes bit 0 carries nothing forward, so
  // masking the low bit is not sampling the same thing.
  return ((session.rng.step() >> 1) & 1) === 1;
}

/**
 * The enemy submarine's spawn depth (§ 12.4) -- the only spawner that chooses a
 * Y, and it costs **two draws, in this order**.
 *
 * Three spawns in four are a shallow band just under the waterline; one in four
 * is a deep runner. About one spawn in six appears shallower than the player can
 * ever climb, since the player's ceiling is row 50 -- it can attack downward but
 * the player cannot rise to meet it.
 *
 * **Both draws are normative, and so is their order.** Picking the mask and the
 * depth from a single draw consumes one fewer value from the shared generator,
 * which shifts every subsequent random decision in the game.
 *
 * @param {{step: () => number}} rng
 * @returns {number} row 43-170
 */
export function drawDepth(rng) {
  const mask = (rng.step() & 3) === 0 ? 127 : 31;   // 1 in 4 deep, 3 in 4 shallow
  return 43 + (rng.step() & mask);
}
