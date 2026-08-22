// seafox/tests/test_spawners.js
//
// Oracle 2 -- cold-boot spawn cadence (design_spec § 20.3), plus the Chapter 12
// rules it rests on.
//
// Cost, per § 20.3: the spawners, the entity list and the session state. **No
// player, no collision, no rendering** -- so nothing here constructs a renderer
// or a canvas, and the whole page runs headless apart from its own report.
//
// The oracle exists because the five spawn cooldowns are shipped constants that
// nothing resets between rounds or missions (§ 12.3), which makes the opening of
// the first demo after a cold start exactly determined. It also exercises the
// shared generator's DRAW ORDER (§ 5.6): the enemy submarine takes two draws for
// its depth and one for its cooldown, so a spawner that draws the wrong number
// of times desynchronises every later spawn without changing the table below.

import { mount } from './harness.js';
import { checkEntityInvariants } from '../src/core/invariants.js';
import { Session } from '../src/core/session.js';
import {
  runSpawners, drawDepth, SPAWNERS, MERCHANT_ROSTER, ROSTER_STATUS,
} from '../src/core/spawners.js';
import { tick } from '../src/core/tick.js';
import { LADDER, capsFor } from '../src/core/difficulty.js';
import { Rng } from '../src/core/rng.js';
import { TYPE, TYPE_NAMES, CLASS } from '../src/core/types.js';
import { SPRITE_BLOCKS } from '../assets/sprite_blocks.js';

/** § 20.3's table: the first spawn of each class from a cold boot. */
const COLD_BOOT = [
  { tick: 1,   type: TYPE.SUPPLY_SUBMARINE },
  { tick: 46,  type: TYPE.HOSPITAL_SHIP },
  { tick: 51,  type: TYPE.ENEMY_SUBMARINE },
  { tick: 51,  type: TYPE.DESTROYER },
  { tick: 201, type: TYPE.MERCHANT_SHIP },
];

mount('Oracle 2 — cold-boot spawn cadence (§ 20.3), and Chapter 12', run);

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function run(list) {
  oracle2(list);
  depthDistribution(list);
  blockedSpawns(list);
  roster(list);
  ladder(list);
  regression(list);
}

/**
 * A cold-booted attract session, and every spawn it produces.
 *
 * This drives the WHOLE tick of § 9.2, not just its step 5, because that is what
 * a cold boot actually runs -- and the demo's step 6 takes one generator draw per
 * tick ahead of the next tick's spawners, so spawner-only ticking would consume
 * the shared generator differently from the real game (§ 5.6).
 *
 * § 20.3's five first-spawn ticks are unaffected either way: they come from the
 * shipped cooldowns, not from a draw. Everything draw-dependent is not.
 *
 * @param {Session} session
 * @param {number} ticks
 * @returns {{tick: number, type: number, slot: number}[]} spawns in order
 */
function runTicks(session, ticks) {
  /** @type {{tick: number, type: number, slot: number}[]} */
  const log = [];
  for (let t = 1; t <= ticks; t++) {
    const before = session.entities.liveCount;
    tick(session);
    for (let s = before; s < session.entities.liveCount; s++) {
      log.push({ tick: t, type: session.entities.slots[s].type, slot: s });
    }
  }
  return log;
}

/**
 * @returns {Session} a session at the cold-boot attract state
 */
function coldBoot() {
  const session = new Session();
  session.startDemo();
  return session;
}

// ---------------------------------------------------------------------------
// § 20.3 -- the oracle
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function oracle2(list) {
  list.section('§ 20.3 — Oracle 2, the cold-boot table');

  const session = coldBoot();
  const log = runTicks(session, 201);

  /** @type {Object<number, number>} first spawn tick per type */
  const first = {};
  for (const s of log) if (first[s.type] === undefined) first[s.type] = s.tick;

  for (const want of COLD_BOOT) {
    const got = first[want.type];
    list.eq('first ' + TYPE_NAMES[want.type] + ' spawns on tick ' + want.tick + ' (§ 20.3)',
      got === undefined ? 'never' : got, want.tick, String);
  }

  // § 20.3's two named failure signatures, reported only when they apply.
  const offsets = COLD_BOOT
    .map((w) => (first[w.type] === undefined ? null : first[w.type] - w.tick))
    .filter((d) => d !== null);
  const allEarly = offsets.length === COLD_BOOT.length && offsets.every((d) => d === -1);
  list.add('not the "everything one tick early" signature (§ 20.3)',
    !allEarly,
    allEarly
      ? 'every class is exactly one tick early: the cooldown is being tested BEFORE it is '
        + 'decremented. A cooldown of n fires on tick n+1.'
      : 'offsets from the table: ' + offsets.join(', '));

  const sub = first[TYPE.ENEMY_SUBMARINE];
  const des = first[TYPE.DESTROYER];
  list.add('the enemy submarine and the Destroyer agree, both on tick 51 (§ 20.3)',
    sub === des && sub === 51,
    sub === des
      ? 'both on ' + sub
      : 'submarine ' + sub + ' vs Destroyer ' + des +
        ' — they disagree, so one of them is reloading its cooldown on a blocked spawn (§ 12.2)');

  // The oracle is about the five SPAWNERS. Everything else that appears in the
  // window is a child created from inside an entity handler -- the submarine's
  // mine and torpedo, the Destroyer's depth charge, the supply run's cargo, and
  // the demo's own auto-fire -- and none of those is on a spawner (§ 12.1).
  const CHILDREN = [TYPE.VERTICAL_TORPEDO, TYPE.HORIZONTAL_TORPEDO, TYPE.MAGNETIC_MINE,
                    TYPE.ENEMY_TORPEDO, TYPE.DEPTH_CHARGE, TYPE.PAYLOAD,
                    TYPE.DOLPHIN, TYPE.GIANT_CLAM];
  const strays = log.filter((s) => !COLD_BOOT.some((w) => w.type === s.type)
                                && CHILDREN.indexOf(s.type) === -1);
  list.add('nothing appears that is neither on the table nor a handler-created child',
    strays.length === 0,
    strays.length ? strays.map((s) => TYPE_NAMES[s.type] + '@' + s.tick).join(', ')
                  : log.length + ' creations in 201 ticks, all accounted for');

  // § 20.6, run over the whole window rather than at the end.
  const session2 = coldBoot();
  /** @type {string[]} */
  let violations = [];
  for (let t = 1; t <= 201 && violations.length === 0; t++) {
    tick(session2);
    violations = checkEntityInvariants(session2.entities);
  }
  list.add('the § 20.6 invariants hold on every one of the 201 ticks',
    violations.length === 0, violations.join('; ') || 'clean throughout');
}

// ---------------------------------------------------------------------------
// § 12.4 -- the enemy submarine's depth, and its two draws
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function depthDistribution(list) {
  list.section('§ 12.4 — spawn depth, over a full generator period');

  // Walk onto the cycle, then take the whole 32767-value output sequence. The
  // distribution is measured with a sliding window, because in play the two
  // draws are consecutive values wherever the generator happens to be.
  const rng = new Rng();
  rng.step();                                   // tail of 1 (§ 5.4)
  const start = rng.s2 | (rng.s3 << 8);
  /** @type {number[]} */
  const seq = [];
  do {
    seq.push(rng.s2);
    rng.step();
  } while ((rng.s2 | (rng.s3 << 8)) !== start);

  const n = seq.length;

  // Measure through drawDepth ITSELF rather than re-implementing the rule here,
  // so this tests the port and not just the spec's arithmetic.
  //
  // Each call consumes two values, so n calls consume exactly two periods. The
  // period is odd and gcd(2, n) = 1, so the first value of the k-th call walks
  // every position of the cycle exactly once -- which makes n calls precisely
  // the sliding window the distribution is stated over, with no bias from
  // pairing values off.
  const depths = new Rng();
  depths.step();                                // onto the cycle first (§ 5.4)
  const bands = { shallow: 0, middle: 0, deep: 0 };
  let aboveCeiling = 0;
  let outOfRange = 0;
  for (let i = 0; i < n; i++) {
    const y = drawDepth(depths);
    if (y <= 74) bands.shallow += 1;
    else if (y <= 127) bands.middle += 1;
    else bands.deep += 1;
    if (y < 50) aboveCeiling += 1;
    if (y < 43 || y > 170) outOfRange += 1;
  }

  // The mask share is a property of the generator, not of drawDepth's output,
  // so it is the one figure here still measured from the raw sequence.
  let deepMask = 0;
  for (let i = 0; i < n; i++) if ((seq[i] & 3) === 0) deepMask += 1;

  const pct = (k) => (100 * k / n).toFixed(1);
  list.eq('rows 43-74 take 81.2% of spawns (§ 12.4)', pct(bands.shallow), '81.2');
  list.eq('rows 75-127 take 10.5%', pct(bands.middle), '10.5');
  list.eq('rows 128-170 take 8.2%', pct(bands.deep), '8.2');
  list.add('17.2% spawn above the player\'s ceiling of row 50 (§ 12.4, § 2.5)',
    pct(aboveCeiling) === '17.2',
    pct(aboveCeiling) + '% — about one in six appears shallower than the player can ever ' +
    'climb, so it can attack downward and the player cannot rise to meet it');
  list.add('the deep mask is drawn 1 time in 4',
    pct(deepMask) === '25.0', pct(deepMask) + '%');

  // The failure § 12.4 names: one draw instead of two, so the mask and the depth
  // come from the same byte. Worth measuring rather than assuming, because the
  // SHALLOW band alone does not distinguish the two -- a byte with (d & 3) != 0
  // takes the 31 mask and is shallow by construction, which lands the collapsed
  // version on 81.25% and rounds to the same 81.2%. Only the middle and deep
  // bands separate them, so a check written against the shallow share would look
  // like a test and catch nothing.
  const oneDraw = { shallow: 0, middle: 0, deep: 0 };
  for (let i = 0; i < n; i++) {
    const d = seq[i];
    const y = 43 + (d & ((d & 3) === 0 ? 127 : 31));
    if (y <= 74) oneDraw.shallow += 1;
    else if (y <= 127) oneDraw.middle += 1;
    else oneDraw.deep += 1;
  }
  const one = (k) => (100 * k / n).toFixed(1);
  list.add('collapsing the two draws into one IS visible here -- the check can fail',
    oneDraw.middle !== bands.middle && oneDraw.deep !== bands.deep,
    'one draw gives ' + one(oneDraw.shallow) + ' / ' + one(oneDraw.middle) + ' / ' +
    one(oneDraw.deep) + ' against the correct ' + pct(bands.shallow) + ' / ' +
    pct(bands.middle) + ' / ' + pct(bands.deep) +
    ' — note the SHALLOW band matches either way, so only the middle and deep ' +
    'bands separate them');

  list.add('every one of the ' + n + ' drawn depths lands in rows 43-170 (§ 2.4.1)',
    outOfRange === 0, outOfRange + ' outside the band');
}

// ---------------------------------------------------------------------------
// § 12.2 -- a blocked spawn is pending, not skipped
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function blockedSpawns(list) {
  list.section('§ 12.2 — a blocked spawn is pending, not skipped');

  // Drive the Destroyer class to its title-screen cap of 3, then keep ticking.
  const session = coldBoot();
  runTicks(session, 800);
  const cap = session.caps[CLASS.DESTROYER];
  const atCap = session.entities.counts[CLASS.DESTROYER];
  list.add('the Destroyer class saturates at its cap rather than growing',
    atCap === cap, 'count ' + atCap + ' against a cap of ' + cap);

  // Once saturated the cooldown must sit at zero, retested every tick.
  let ticks = 0;
  while (session.spawners.cooldowns.destroyer !== 0 && ticks < 400) {
    tick(session);
    ticks += 1;
  }
  list.add('a saturated class leaves its cooldown at zero, retesting every tick (§ 12.2)',
    session.spawners.cooldowns.destroyer === 0,
    'cooldown reached 0 after ' + ticks + ' further ticks and stayed there');

  // The payoff: killing one replaces it on the very next tick, which is what
  // makes a cap a standing population rather than a rate.
  const before = session.entities.counts[CLASS.DESTROYER];
  freeOneOfClass(session, TYPE.DESTROYER);
  tick(session);
  list.add('freeing a slot lets the spawn land on the very next tick (§ 12.2)',
    session.entities.counts[CLASS.DESTROYER] === before,
    'count returned to ' + session.entities.counts[CLASS.DESTROYER] + ' immediately');
}

/**
 * Remove one live entity of a type, doing the bookkeeping its own handler would
 * (§ 4.5). Stands in for the entity walk, which does not exist yet.
 * @param {Session} session
 * @param {number} type
 * @returns {boolean} whether one was found
 */
function freeOneOfClass(session, type) {
  for (let i = 0; i < session.entities.liveCount; i++) {
    if (session.entities.slots[i].type !== type) continue;
    session.entities.countRemoval(type);
    session.entities.freeSlot(i, session.stencil);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// § 12.5 -- the merchant roster
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function roster(list) {
  list.section('§ 12.5 — the merchant roster');

  list.eq('ten records (§ 12.5)', MERCHANT_ROSTER.length, 10);
  list.eq('seven distinct bitmaps',
    new Set(MERCHANT_ROSTER.map((r) => SPRITE_BLOCKS[r.sprite].bits)).size, 7);
  list.eq('four distinct hues -- § 1.3 makes this normative',
    new Set(MERCHANT_ROSTER.map((r) => r.hue)).size, 4);

  // The roster table and the baked assets must agree, or the ship spawns at a
  // parity its artwork was not baked for and comes out the wrong colour.
  const mismatched = MERCHANT_ROSTER.filter((r) => {
    const block = SPRITE_BLOCKS[r.sprite];
    return block.phase !== r.spawnX || block.flip !== r.flip;
  });
  list.add('every record\'s spawn X and flip match its baked sprite block (§ 6.5)',
    mismatched.length === 0,
    mismatched.length ? mismatched.map((r) => r.sprite).join(', ')
                      : 'all ten agree — spawn X IS the parity the artwork was baked at');

  // § 12.5's three named pairs.
  const bits = (i) => SPRITE_BLOCKS[MERCHANT_ROSTER[i].sprite].bits;
  list.add('records 1 and 7 are the same vessel twice -- same bitmap and same flag',
    bits(1) === bits(7) &&
    MERCHANT_ROSTER[1].spawnX === MERCHANT_ROSTER[7].spawnX &&
    MERCHANT_ROSTER[1].flip === MERCHANT_ROSTER[7].flip,
    'identical in both');
  list.add('records 2 and 8, and 4 and 9, share a bitmap at different parity',
    bits(2) === bits(8) && MERCHANT_ROSTER[2].spawnX !== MERCHANT_ROSTER[8].spawnX &&
    bits(4) === bits(9) && MERCHANT_ROSTER[4].spawnX !== MERCHANT_ROSTER[9].spawnX,
    '2/8 are ' + MERCHANT_ROSTER[2].hue + ' and ' + MERCHANT_ROSTER[8].hue +
    '; 4/9 are ' + MERCHANT_ROSTER[4].hue + ' and ' + MERCHANT_ROSTER[9].hue +
    ' — the same ship reading as two');

  // The cursor advances even when the record it lands on cannot be spawned, so
  // the roster is walked in order regardless.
  const session = coldBoot();
  session.spawners.roster[0] = ROSTER_STATUS.SUNK;
  session.spawners.cooldowns.merchant = 0;
  const beforeCursor = session.spawners.rosterCursor;
  const beforeLive = session.entities.liveCount;
  tick(session);
  // Count merchants rather than entities: the demo's own auto-fire and the
  // tick-1 supply submarine also arrive on this tick, and neither is the point.
  let merchants = 0;
  for (let i = 0; i < session.entities.liveCount; i++) {
    if (session.entities.slots[i].type === TYPE.MERCHANT_SHIP) merchants += 1;
  }
  list.add('the cursor advances on a failed attempt, and no merchant spawns (§ 12.5)',
    session.spawners.rosterCursor === beforeCursor + 1 && merchants === 0,
    'cursor ' + beforeCursor + ' -> ' + session.spawners.rosterCursor +
    ', 0 merchants among the ' + (session.entities.liveCount - beforeLive) +
    ' creations on this tick');
  list.add('an unavailable record consumes a full interval (§ 12.5)',
    session.spawners.cooldowns.merchant >= 200,
    'cooldown reloaded to ' + session.spawners.cooldowns.merchant +
    ' — which is why merchant traffic thins out late in a mission with no rule saying so');
}

// ---------------------------------------------------------------------------
// Chapter 8 -- the ladder
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function ladder(list) {
  list.section('Chapter 8 — the difficulty ladder');

  list.eq('six rungs: the title screen and five missions (§ 8.1)', LADDER.length, 6);

  const m5 = LADDER[5];
  const sum = m5.enemySubmarine + m5.magneticMine + m5.hospitalShip + m5.merchant +
              m5.destroyer + m5.depthCharge + m5.enemyTorpedo;
  list.eq('mission 5\'s seven caps sum to 25 (§ 4.7.1, § 8.2)', sum, 25);
  list.add('25 + 2 torpedoes + the player + the four-record supply chain = 32, the whole array',
    sum + 2 + 1 + 4 === 32,
    'zero margin — § 4.7.1 says to treat the array as fragile rather than safe, ' +
    'and the avenger sits outside this arithmetic entirely');

  list.add('only the hospital ship ramps monotonically (§ 8.3)',
    [1, 2, 3, 4, 5].every((m, i, a) =>
      i === 0 || LADDER[a[i]].hospitalShip > LADDER[a[i - 1]].hospitalShip),
    LADDER.slice(1).map((r) => r.hospitalShip).join(', ') +
    ' — the one thing that steadily increases is clutter');

  list.add('the merchant cap never changes: the target class is as dense on 5 as on 1',
    LADDER.every((r) => r.merchant === 3), 'always 3');

  list.add('mission 1 switches mines, Destroyers and depth charges off entirely (§ 8.3)',
    LADDER[1].magneticMine === 0 && LADDER[1].destroyer === 0 && LADDER[1].depthCharge === 0,
    'a first mission is merchant traffic, hospital ships and an unarmed enemy submarine');

  list.add('the submarine\'s two weapons alternate rather than accumulate (§ 8.3)',
    LADDER[3].enemyTorpedo > 0 && LADDER[3].magneticMine === 0 &&
    LADDER[4].magneticMine > 0 && LADDER[4].enemyTorpedo === 0 &&
    LADDER[5].enemyTorpedo > 0 && LADDER[5].magneticMine > 0,
    'torpedoes on 3, mines on 4, both on 5 — the harder one to escape arrives second');

  // § 8.3: the title screen is denser than mission 1 on five of seven knobs.
  const knobs = ['enemySubmarine', 'magneticMine', 'hospitalShip', 'merchant',
                 'destroyer', 'depthCharge', 'enemyTorpedo'];
  const denser = knobs.filter((k) => LADDER[0][k] > LADDER[1][k]).length;
  list.eq('the title screen is denser than mission 1 on five of seven knobs (§ 8.3)',
    denser, 5);

  list.add('the eighth knob is zero on every rung and is wired to nothing (§ 8.2)',
    LADDER.every((r) => r.unused === 0), 'it belonged to the rate governor § 1.3 drops');

  // § 8.1: above 5 falls through to mission 3, not to a default or a scaling rule.
  list.add('a mission counter above 5 inherits mission 3\'s caps (§ 8.1)',
    JSON.stringify(capsFor(9)) === JSON.stringify(capsFor(3)),
    'unreachable in the game as specified, but an implementation that adds missions ' +
    'should inherit mission 3 deliberately');
}

// ---------------------------------------------------------------------------
// Regression tripwires -- NOT normative
// ---------------------------------------------------------------------------

/**
 * These are values this implementation produces, not values design_spec gives.
 * They exist to trip when draw order or draw count changes by accident -- the
 * failure § 12.4 and § 5.6 warn about, which shifts every later random decision
 * while leaving § 20.3's table untouched.
 *
 * A change here is not automatically a bug. It means the generator is being
 * consumed differently, and that needs a reason.
 *
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function regression(list) {
  list.section('Regression tripwires — derived here, NOT from design_spec');

  const session = coldBoot();
  runTicks(session, 201);
  const hex = (v) => v.toString(16).toUpperCase().padStart(2, '0');

  // These carry baked-in values so they can actually TRIP. Reporting the number
  // without asserting it would be a tripwire that never fires -- the mutation
  // run that collapsed § 12.4's two draws moved every figure below, and a
  // report-only check would have shrugged at all three.
  list.eq('221 draws taken in the first 201 ticks', session.rng.draws, 221);
  list.eq('generator state after 201 ticks',
    hex(session.rng.s2) + ' ' + hex(session.rng.s3), 'EF 8B');
  list.eq('13 live entities after 201 ticks', session.entities.liveCount, 13);

  list.add('what a change in the three above means',
    true,
    'the demo takes one draw per tick for the horizontal torpedo (§ 10.5.1), so 201 of ' +
    'these are step 6; the rest are spawners and their children — each enemy submarine ' +
    'costs 3 (mask, depth, cooldown), the supply submarine 1 more for its release ' +
    'countdown, and each depth charge 2. The demo takes NO entry-side draw, which the ' +
    'disassembly settles: $79DE draws a bit only on missions 1 and 2. These figures have ' +
    'moved three times — 13 / FF 0F / 8 when the page ticked spawners alone, ' +
    '213 / 0D 35 / 8 once it ran the whole tick, 221 / EF 8B / 16 when Chapter 13 gave ' +
    'the handlers children to create, and 221 / EF 8B / 13 now that Chapter 14 lets ' +
    'things destroy each other. Note the DRAWS did not move this time: collision ' +
    'consumes no randomness. The five first-spawn ticks have never moved at all.');
}
