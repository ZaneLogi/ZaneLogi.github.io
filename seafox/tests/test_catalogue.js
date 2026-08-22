// seafox/tests/test_catalogue.js
//
// The entity catalogue -- design_spec Chapter 13 -- and the § 7.4 death sequence.
//
// The strongest check available here is **§ 2.7.2's resolved speed table**. It
// is normative, it is directly measurable, and it is the one table that catches
// the confusion § 2.7 calls the single easiest thing in the document to
// implement wrongly: *speed is step / period, never step*, and the two are
// specified in different chapters on purpose.
//
// Measurement uses each entity's allocation serial rather than its slot, because
// neither a slot index nor an object reference identifies an entity over time --
// slots are pooled and swap-with-last moves entities between them (§ 4.6).

import { mount } from './harness.js';
import { Session } from '../src/core/session.js';
import { tick } from '../src/core/tick.js';
import { checkEntityInvariants } from '../src/core/invariants.js';
import { unportedTypes } from '../src/core/dispatch.js';
import { DEFINITIONS, DEATH_FRAMES, DEATH_FRAME_PERIOD, SILENT, beginDeath }
  from '../src/core/definitions.js';
import { TYPE, TYPE_NAMES, CLASS } from '../src/core/types.js';
import { spawnAvenger } from '../src/core/avenger.js';

/**
 * § 2.7.2, verbatim. Per-axis pixels per tick -- the table gives one figure per
 * entity because each moves on one axis at a time, except the demo player and
 * the homing mine, which move on both.
 */
const SPEEDS = [
  { type: TYPE.MAGNETIC_MINE,      pxPerTick: 0.22, note: 'hunting — the slowest object in the game' },
  { type: TYPE.MERCHANT_SHIP,      pxPerTick: 0.29 },
  { type: TYPE.DESTROYER,          pxPerTick: 0.40 },
  { type: TYPE.HOSPITAL_SHIP,      pxPerTick: 0.67 },
  { type: TYPE.PLAYER,             pxPerTick: 1.00 },
  { type: TYPE.VERTICAL_TORPEDO,   pxPerTick: 1.00, note: 'the only step of 1 in the game' },
  { type: TYPE.HORIZONTAL_TORPEDO, pxPerTick: 2.00, note: 'largest step of any weapon, halved by its period' },
  { type: TYPE.ENEMY_SUBMARINE,    pxPerTick: 2.00 },
  { type: TYPE.SUPPLY_SUBMARINE,   pxPerTick: 2.00 },
  { type: TYPE.PAYLOAD,            pxPerTick: 2.00 },
  { type: TYPE.DOLPHIN,            pxPerTick: 2.00 },
  { type: TYPE.DEPTH_CHARGE,       pxPerTick: 2.00 },
  { type: TYPE.ENEMY_TORPEDO,      pxPerTick: 3.00 },
  { type: TYPE.GIANT_CLAM,         pxPerTick: 5.00, note: 'the fastest object in the game' },
  // The avenger is absent from this table on purpose: its only creation site is
  // the dolphin's collision response (§ 13.9), which is Chapter 14's. It is
  // measured separately below, from a hand-placed one.
];

const RUN_TICKS = 6000;

mount('design_spec Chapter 13 — the entity catalogue, and the § 7.4 death sequence', run);

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function run(list) {
  const survey = surveyDemo(RUN_TICKS);
  speeds(list, survey);
  exits(list, survey);
  behaviours(list);
  deathSequence(list);
  avenger(list);
  dispatchTable(list, survey);
}

/**
 * Run the attract loop and record, per entity serial, how far it travelled on
 * each axis and over how many ticks.
 *
 * @param {number} ticks
 * @returns {{session: Session, byType: Object, peak: Object, violations: string[],
 *            everLeft: Object, seenTypes: Set<number>}}
 */
function surveyDemo(ticks) {
  const session = new Session();
  session.startDemo();

  /** @type {Map<number, {type: number, x: number, y: number, dx: number, dy: number, n: number}>} */
  const tracked = new Map();
  const peak = {};
  const everLeft = {};
  const seenTypes = new Set();
  /** @type {string[]} */
  let violations = [];

  for (let t = 1; t <= ticks; t++) {
    tick(session);

    const alive = new Set();
    for (let i = 0; i < session.entities.liveCount; i++) {
      const e = session.entities.slots[i];
      alive.add(e.serial);
      seenTypes.add(e.type);
      const prev = tracked.get(e.serial);
      if (prev === undefined) {
        tracked.set(e.serial, { type: e.type, x: e.x, y: e.y, dx: 0, dy: 0, n: 0 });
      } else if (e.type === TYPE.DEPTH_CHARGE && e.scratch0 > 0) {
        // § 2.7.2's 2.00 for the depth charge is its SINKING speed. The seven
        // arc ticks of § 13.7.3 are a different motion -- +13 across and +4 down
        // off a table -- and averaging them in drags the figure below 2.
        prev.x = e.x;
        prev.y = e.y;
      } else if (!e.dying) {
        // A dying entity is skipped: § 7.4.2's re-anchor moves it once, and the
        // death frames force its X parity, so its motion is not its type's.
        prev.dx += Math.abs(e.x - prev.x);
        prev.dy += Math.abs(e.y - prev.y);
        prev.n += 1;
        prev.x = e.x;
        prev.y = e.y;
      } else {
        prev.x = e.x;
        prev.y = e.y;
      }
    }
    for (const [serial, rec] of tracked) {
      if (!alive.has(serial) && rec.n > 0 && !everLeft[rec.type]) everLeft[rec.type] = true;
    }
    for (const k of Object.keys(session.entities.counts)) {
      peak[k] = Math.max(peak[k] || 0, session.entities.counts[k]);
    }
    if (violations.length === 0) violations = checkEntityInvariants(session.entities);
  }

  // Aggregate per type: total distance on the axis that type actually uses.
  const byType = {};
  for (const rec of tracked.values()) {
    if (rec.n < 20) continue;                 // too short a sample to be meaningful
    const b = byType[rec.type] || (byType[rec.type] = { dx: 0, dy: 0, n: 0 });
    b.dx += rec.dx;
    b.dy += rec.dy;
    b.n += rec.n;
  }
  return { session, byType, peak, violations, everLeft, seenTypes };
}

// ---------------------------------------------------------------------------
// § 2.7.2 -- the resolved speed table
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @param {Object} survey
 * @returns {void}
 */
function speeds(list, survey) {
  list.section('§ 2.7.2 — resolved speeds, measured over ' + RUN_TICKS + ' ticks');

  for (const want of SPEEDS) {
    const b = survey.byType[want.type];
    if (b === undefined) {
      list.add(TYPE_NAMES[want.type] + ' moves at ' + want.pxPerTick.toFixed(2) + ' px/tick',
        false, 'never observed for long enough to measure');
      continue;
    }
    // Each type moves on one axis at a time; the mine and the demo player use
    // both, and for those the per-axis figure is what § 2.7.2 gives.
    const perAxis = Math.max(b.dx, b.dy) / b.n;
    const ok = Math.abs(perAxis - want.pxPerTick) < 0.06;
    list.add(TYPE_NAMES[want.type] + ' moves at ' + want.pxPerTick.toFixed(2) +
      ' px/tick (§ 2.7.2)' + (want.note ? ' — ' + want.note : ''),
      ok, 'measured ' + perAxis.toFixed(2) + ' over ' + b.n + ' entity-ticks');
  }

  // The transposition § 2.7.1 explicitly warns about, stated as a relationship
  // rather than as two separate numbers.
  const mine = survey.byType[TYPE.MAGNETIC_MINE];
  const torp = survey.byType[TYPE.ENEMY_TORPEDO];
  if (mine && torp) {
    const mineSpeed = Math.max(mine.dx, mine.dy) / mine.n;
    const torpSpeed = Math.max(torp.dx, torp.dy) / torp.n;
    list.add('the mine is the SLOW homing one and the enemy torpedo the FAST blind one (§ 2.7.1)',
      mineSpeed < 0.5 && torpSpeed > 2.5,
      'mine ' + mineSpeed.toFixed(2) + ' vs torpedo ' + torpSpeed.toFixed(2) +
      ' px/tick — they are easy to transpose because one submarine launches both ' +
      'and their spawn code sits back to back, each carrying the other\'s ' +
      'plausible-looking numbers');
  }
}

// ---------------------------------------------------------------------------
// § 13.11 -- how entities leave
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @param {Object} survey
 * @returns {void}
 */
function exits(list, survey) {
  list.section('§ 13.11 — every type leaves, and no class cap locks');

  const created = [...survey.seenTypes].filter((t) => t !== TYPE.PLAYER).sort((a, b) => a - b);
  list.add('thirteen of the fourteen created types appear in an attract run',
    created.length === 13,
    created.map((t) => TYPE_NAMES[t]).join(', ') +
    ' -- the avenger is the fourteenth and has no creation site until Chapter 14');

  // The magnetic mine is the one type that never expires on its own -- its
  // limit of 310 is beyond the drawable range and it homes rather than crosses.
  const shouldLeave = created.filter((t) => t !== TYPE.MAGNETIC_MINE && t !== TYPE.GIANT_CLAM);
  const stuck = shouldLeave.filter((t) => !survey.everLeft[t]);
  list.add('every crossing type is observed leaving at least once',
    stuck.length === 0,
    stuck.length ? 'never left: ' + stuck.map((t) => TYPE_NAMES[t]).join(', ')
                 : shouldLeave.length + ' types observed leaving');

  // A cap lock is a class that reached its cap and then never released a slot
  // again. Sitting AT the cap is normal -- § 12.2 makes a cap a standing
  // population -- so the test is whether anything of that class ever left, not
  // what the final count is.
  const classOfType = {
    [CLASS.ENEMY_SUBMARINE]: TYPE.ENEMY_SUBMARINE,
    [CLASS.MAGNETIC_MINE]: TYPE.MAGNETIC_MINE,
    [CLASS.HOSPITAL_SHIP]: TYPE.HOSPITAL_SHIP,
    [CLASS.MERCHANT]: TYPE.MERCHANT_SHIP,
    [CLASS.DESTROYER]: TYPE.DESTROYER,
    [CLASS.DEPTH_CHARGE]: TYPE.DEPTH_CHARGE,
    [CLASS.ENEMY_TORPEDO]: TYPE.ENEMY_TORPEDO,
  };
  const locked = Object.keys(classOfType).filter((c) =>
    // The magnetic mine is exempt, and § 13.11 says why: it is the one type that
    // never expires on its own. Its limit of 310 is beyond the drawable range,
    // and since it homes on the player rather than crossing it will normally
    // never approach it. A mine leaves when it kills the player, when something
    // destroys it, or when the round ends -- all of them Chapter 14's.
    c !== CLASS.MAGNETIC_MINE &&
    survey.peak[c] >= survey.session.caps[c] && survey.peak[c] > 0 &&
    !survey.everLeft[classOfType[c]]);
  list.add('no class reached its cap and then never released a slot again (§ 13.11)',
    locked.length === 0,
    locked.length
      ? 'locked: ' + locked.join(', ') + ' — that is what a missing exit looks like'
      : 'every capped class that filled up also drained; peaks ' +
        JSON.stringify(survey.peak));

  list.add('the § 20.6 invariants hold across all ' + RUN_TICKS + ' ticks',
    survey.violations.length === 0, survey.violations.join('; ') || 'clean throughout');
}

// ---------------------------------------------------------------------------
// Per-type behaviours that a speed figure cannot show
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function behaviours(list) {
  list.section('§ 13.3 – § 13.8 — behaviours a speed figure cannot show');

  // -- the depth charge's arc (§ 13.7.3) ------------------------------------
  const s = quietSession();
  const d = forceSpawn(s, 'destroyer');
  // Run until a charge exists, then follow it through its seven arc ticks.
  let charge = null;
  for (let t = 0; t < 200 && charge === null; t++) {
    tick(s);
    charge = findType(s, TYPE.DEPTH_CHARGE);
  }
  if (charge === null) {
    list.add('a Destroyer releases a depth charge', false, 'none released in 200 ticks');
  } else {
    const x0 = charge.x, y0 = charge.y;
    const serial = charge.serial;
    let steps = 0;
    while (charge.scratch0 > 0 && steps < 20) { tick(s); steps += 1; }
    const stillSame = charge.serial === serial;
    list.add('the arc is seven ticks, +13 px across and +4 down, ending row 35 (§ 13.7.3)',
      stillSame && steps === 7 && (charge.x - x0) === 13 && charge.y === 35,
      'took ' + steps + ' ticks, moved +' + (charge.x - x0) + ' across and +' +
      (charge.y - y0) + ' down, ending on row ' + charge.y);
    list.add('the arc lands the charge on an ODD column (§ 13.7.3)',
      (charge.x & 1) === 1,
      'x=' + charge.x + ' — the final step\'s dX of +1 is the one odd horizontal ' +
      'step in the game whose effect a player can see: it fixes the hue of the ' +
      'sinking form the charge swaps to on the very next tick');
    list.add('the sprite swapped to the sinking form on water entry (§ 13.7.4)',
      charge.sprite === 'chargeSinking', charge.sprite);
  }

  // -- the fuse is sampled once (§ 13.7.2) ----------------------------------
  const s2 = quietSession();
  forceSpawn(s2, 'destroyer');
  const player2 = s2.entities.slots[s2.playerSlot];
  player2.y = 120;
  let charge2 = null;
  for (let t = 0; t < 200 && charge2 === null; t++) {
    tick(s2);
    charge2 = findType(s2, TYPE.DEPTH_CHARGE);
  }
  if (charge2) {
    const fuse = charge2.scratch1;
    const serial = charge2.serial;
    player2.y = 60;                          // dive AFTER the release
    // Tick only while this charge still occupies its slot: the record is pooled,
    // and reading it once the charge has gone reads a stranger.
    let ticked = 0;
    while (charge2.serial === serial && ticked < 30) { tick(s2); ticked += 1; }
    list.add('the fuse is the player\'s depth at RELEASE, never updated (§ 13.7.2)',
      charge2.serial !== serial || charge2.scratch1 === fuse,
      'fuse stayed ' + fuse + ' across ' + ticked + ' ticks while the player dived '
      + '— diving after the release defeats it, and holding depth does not');
  }

  // -- the enemy torpedo is aimed once (§ 13.5.2) ---------------------------
  const s3 = quietSession();
  s3.caps[CLASS.ENEMY_TORPEDO] = 1;
  forceSpawn(s3, 'enemySubmarine');
  let torp = null;
  for (let t = 0; t < 400 && torp === null; t++) {
    tick(s3);
    torp = findType(s3, TYPE.ENEMY_TORPEDO);
  }
  if (torp === null) {
    list.add('an enemy submarine fires a torpedo', false, 'none fired in 400 ticks');
  } else {
    const drift = torp.scratch0;
    const player3 = s3.entities.slots[s3.playerSlot];
    player3.y = player3.y === 60 ? 160 : 60;   // move hard, after the shot
    for (let t = 0; t < 20; t++) tick(s3);
    list.add('the enemy torpedo is aimed ONCE at launch and never again (§ 13.5.2)',
      torp.scratch0 === drift,
      'drift stayed ' + drift + ' after the player moved to row ' + player3.y +
      ' — the mine corrects, the torpedo commits');
  }

  // -- the enemy submarine steers vertically only, and stops level (§ 13.3) --
  // Mission 3 rather than the demo, so the player holds still: the attract bounce
  // writes the velocity pair every tick and would keep the target moving.
  const s4 = quietSession(3);
  forceSpawn(s4, 'enemySubmarine');
  const sub = findType(s4, TYPE.ENEMY_SUBMARINE);
  if (sub === null) {
    list.add('an enemy submarine spawns on mission 3', false, 'none spawned');
  } else {
    const player4 = s4.entities.slots[s4.playerSlot];
    sub.y = player4.y;                       // already level
    const y0 = sub.y;
    const x0 = sub.x;
    const serial = sub.serial;
    for (let t = 0; t < 30 && sub.serial === serial; t++) tick(s4);
    list.add('a level enemy submarine stops dead vertically rather than oscillating (§ 13.3)',
      sub.y === y0 && sub.x !== x0,
      'y is ' + sub.y + ' after 30 ticks against a player at ' + player4.y
      + ', while x moved ' + Math.abs(sub.x - x0) + ' px — it converges far more '
      + 'slowly than it crosses, and stops rather than oscillating');
  }

  // -- the convoy derives its positions (§ 16.5) ----------------------------
  const s5 = quietSession();
  // The supply submarine is the one class with NO cap at all (§ 12.3), so its
  // cooldown is released ONCE and then left alone. Holding it at zero would
  // spawn one every tick and overflow the array -- which is not a bug in the
  // spawner but a property of the only class the ladder cannot touch.
  let payload = null;
  s5.spawners.cooldowns.supplySubmarine = 0;
  for (let t = 0; t < 400 && payload === null; t++) {
    tick(s5);
    payload = findType(s5, TYPE.PAYLOAD);
  }
  if (payload === null) {
    list.add('a supply submarine releases a payload', false, 'none in 2000 ticks');
  } else {
    const dolphin = findType(s5, TYPE.DOLPHIN);
    list.add('the payload and the dolphin are released together (§ 13.8.2)',
      dolphin !== null,
      dolphin ? 'dolphin at (' + dolphin.x + ', ' + dolphin.y + '), payload at (' +
        payload.x + ', ' + payload.y + ')' : 'no dolphin');
    if (dolphin) {
      list.add('the dolphin derives its position from the payload: (-5, +5) (§ 16.5)',
        dolphin.x === s5.convoy.x - 5 && dolphin.y === s5.convoy.y + 5,
        'it is drawn BENEATH what it carries — it does not track the payload, ' +
        'it derives from it every tick');
    }
    // The payload climbs to the player's own ceiling and holds there.
    for (let t = 0; t < 120; t++) tick(s5);
    list.add('the payload climbs to row 50 — the player\'s own ceiling — and holds (§ 13.8.2)',
      s5.convoy.y === 50 && s5.convoy.dy === 0,
      'y=' + s5.convoy.y + ' dy=' + s5.convoy.dy +
      ' — the part of a resupply you can actually reach is the flat run along your ceiling');
  }

  // -- the clam's escalation (§ 13.8.3) -------------------------------------
  const s6 = quietSession();
  const delays = [];
  for (let run = 0; run < 3; run++) {
    let p = null;
    s6.spawners.cooldowns.supplySubmarine = 0;      // once per run, not per tick
    for (let t = 0; t < 400 && p === null; t++) {
      tick(s6);
      p = findType(s6, TYPE.PAYLOAD);
    }
    if (p === null) break;
    delays.push({ count: s6.resupplyCount, delay: p.scratch0 });
    let guard = 0;
    while (findType(s6, TYPE.PAYLOAD) !== null && guard++ < 400) tick(s6);
  }
  list.add('the resupply counter runs 2, 4, 6 against a threshold of 3 (§ 13.8.3)',
    delays.length >= 2 && delays[0].count === 2 && delays[1].count === 4,
    delays.map((d) => 'count ' + d.count + ' -> delay ' + d.delay).join('; '));
  list.add('the first resupply of a mission is clam-free, every later one contested',
    delays.length >= 2 && delays[0].delay === 255 && delays[1].delay <= 15,
    'a delay of 255 is longer than a payload lives, so the clam never arrives; ' +
    'from the second onward it is 0-15 ticks');
}

// ---------------------------------------------------------------------------
// § 7.4 -- the death sequence
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function deathSequence(list) {
  list.section('§ 7.4 — the definition table and the shared death sequence');

  list.eq('twelve death frames, shared by every type (§ 7.4.1)', DEATH_FRAMES.length, 12);
  list.add('frames 8-10 repeat the sinking ship of 0-2 (§ 7.4.1)',
    DEATH_FRAMES[8].sprite === DEATH_FRAMES[0].sprite &&
    DEATH_FRAMES[10].sprite === DEATH_FRAMES[2].sprite,
    'the merchant needs its own copy because it is the only type whose animation ' +
    'must end on a floating score value');
  list.add('frame 11 carries no sprite -- it is the floating score, special-cased',
    DEATH_FRAMES[11].sprite === null,
    'unreachable until Chapter 14 lets a merchant die and Chapter 16 gives the score its value');
  list.eq('death frames advance at period 4, whatever the type (§ 2.7.1)',
    DEATH_FRAME_PERIOD, 4);

  const noAnimation = [TYPE.PLAYER, TYPE.ENEMY_SUBMARINE, TYPE.SUPPLY_SUBMARINE,
                       TYPE.DOLPHIN, TYPE.GIANT_CLAM, TYPE.AVENGER];
  list.add('six types have first = last = 0 and simply vanish (§ 7.4)',
    noAnimation.every((t) => DEFINITIONS[t].firstFrame === 0 && DEFINITIONS[t].lastFrame === 0),
    noAnimation.map((t) => TYPE_NAMES[t]).join(', '));
  list.add('the player\'s twelve-particle burst is the largest in the game (§ 7.4)',
    DEFINITIONS[TYPE.PLAYER].debris === 12 &&
    DEFINITIONS[TYPE.ENEMY_SUBMARINE].debris === 7 &&
    DEFINITIONS[TYPE.MERCHANT_SHIP].debris === 5,
    '12 for the player, 7 for a submarine, 5 for a ship — and the player is the ' +
    'only type with debris but no animation AND no re-anchor');
  list.add('the avenger is the only silent type, and unreachably so (§ 7.4, § 13.9)',
    DEFINITIONS[TYPE.AVENGER].sound === SILENT &&
    DEFINITIONS.filter((d) => d && d.sound === SILENT).length === 1,
    'nothing in the game can destroy it, so the one silent type never gets the ' +
    'chance to be silent');
  list.add('the horizontal torpedo\'s 0/0 re-anchor is reproduced, not corrected (§ 7.4.2)',
    DEFINITIONS[TYPE.HORIZONTAL_TORPEDO].reanchorX === 0 &&
    DEFINITIONS[TYPE.VERTICAL_TORPEDO].reanchorX === 4,
    'it is the same size as the other two torpedoes and dies into the same wider ' +
    'burst, so its explosion sits low and right of the shot while theirs are centred');

  // The re-anchor is SUBTRACTED, once.
  const s = quietSession();
  const slot = s.entities.alloc(TYPE.MAGNETIC_MINE);
  const e = s.entities.slots[slot];
  e.x = 100; e.y = 100;
  e.stateChangePending = true;
  beginDeath(s, slot);
  const def = DEFINITIONS[TYPE.MAGNETIC_MINE];
  list.add('the re-anchor is SUBTRACTED, pulling the anchor up and left (§ 7.4.2)',
    e.y === 100 - def.reanchorY && (e.x & ~1) === ((100 - def.reanchorX) & ~1),
    'a mine at (100, 100) begins its death at (' + e.x + ', ' + e.y + ') with a ' +
    're-anchor of (' + def.reanchorX + ', ' + def.reanchorY + ')');
  list.add('the death sequence fixes the palette flip to 1 for every type (§ 7.4.1)',
    e.paletteFlip === true && e.dying === true,
    'a wreck is drawn in the flipped palette whatever the dying object\'s own was, ' +
    'so a merchant and a Destroyer sink in the same colour despite differing in life');
  list.add('each death frame forces the entity\'s X to the frame\'s parity (§ 7.4.1)',
    (e.x & 1) === DEATH_FRAMES[def.firstFrame].parity,
    'x=' + e.x + ', frame ' + def.firstFrame + ' wants parity ' +
    DEATH_FRAMES[def.firstFrame].parity +
    ' — an explosion cannot change colour as it plays');

  // It runs to the last frame and then removes itself.
  let ticks = 0;
  while (s.entities.liveCount > 1 && ticks < 100) { tick(s); ticks += 1; }
  const frames = def.lastFrame - def.firstFrame + 1;
  list.add('the animation runs its frames at period 4 and then removes the entity',
    s.entities.liveCount === 1,
    frames + ' frames at period ' + DEATH_FRAME_PERIOD + ' cleared in ' + ticks + ' ticks');
}

// ---------------------------------------------------------------------------
// § 7.2, § 7.5 -- the dispatch table
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @param {Object} survey
 * @returns {void}
 */
function avenger(list) {
  list.section('§ 13.9 -- the avenger, which nothing yet creates');

  const s = quietSession(3);
  const slot = spawnAvenger(s);
  const e = s.entities.slots[slot];
  const player = s.entities.slots[s.playerSlot];
  list.add('it spawns off-screen left with the player Y copied at that instant (§ 13.9)',
    e.x === 1 && e.y === player.y, '(' + e.x + ', ' + e.y + ')');

  player.y = 90;
  // The first tick is the firstUpdate pass, which draws and does NOT move
  // (§ 9.4.1), so measurement starts after it -- counting it in reads 3.8.
  tick(s);
  const xAfterFirst = e.x;
  for (let t = 0; t < 20; t++) tick(s);
  list.eq('it moves 4 px per tick (§ 2.7.2)', (e.x - xAfterFirst) / 20, 4);
  list.add('it re-copies the player Y EVERY tick -- it does not steer (§ 13.9)',
    e.y === player.y,
    'it is always exactly at the player depth for its whole run, so there is no '
    + 'lead to break and no gap to open: it cannot be killed, cannot be dodged, '
    + 'and cannot be earned');
}

/**
 * @param {import('./harness.js').CheckList} list
 * @param {Object} survey
 * @returns {void}
 */
function dispatchTable(list, survey) {
  list.section('§ 7.2, § 7.5 — the dispatch table');

  const unported = unportedTypes();
  const expected = [5, 6, 7, 10, 11, 12];
  list.eq('only the six unused merchant slots have no handler (§ 7.5)',
    unported.join(', '), expected.join(', '));
  list.add('and none of them is ever created',
    expected.every((t) => !survey.seenTypes.has(t)),
    'they are byte-identical to type 9 in both tables and produced by nothing. ' +
    'Keeping them keeps Chapter 14\'s range-based merchant exemption inert rather ' +
    'than turning it into a bug the first time someone reuses a type number');
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * An attract session with the spawners held off, so a test can introduce exactly
 * the entities it wants and slot indices stay predictable.
 * @returns {Session}
 */
function quietSession(mission) {
  const s = new Session();
  s.startDemo();
  if (mission !== undefined) {
    // A mission tick runs no bounce and no auto-fire, so the velocity pair stays
    // zero and the player holds position -- which is what a test needs when the
    // thing under test reads the player.
    s.mission = mission;
    s.applyRung();
  }
  for (const k of Object.keys(s.spawners.cooldowns)) s.spawners.cooldowns[k] = 999999;
  s.caps[CLASS.VERTICAL_TORPEDO] = 0;       // stop the demo's auto-fire cluttering
  s.caps[CLASS.HORIZONTAL_TORPEDO] = 0;
  return s;
}

/**
 * Let one spawner fire on the next tick.
 * @param {Session} s
 * @param {string} key a spawner key
 * @returns {void}
 */
function forceSpawn(s, key) {
  s.spawners.cooldowns[key] = 0;
  tick(s);
  s.spawners.cooldowns[key] = 999999;
}

/**
 * @param {Session} s
 * @param {number} type
 * @returns {Object|null} the first live entity of that type
 */
function findType(s, type) {
  for (let i = 0; i < s.entities.liveCount; i++) {
    if (s.entities.slots[i].type === type) return s.entities.slots[i];
  }
  return null;
}
