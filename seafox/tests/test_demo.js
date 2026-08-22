// seafox/tests/test_demo.js
//
// Oracle 3 -- the demo submarine's trajectory (design_spec § 20.4) -- and the
// Chapter 9 walk and Chapter 13.1 player it rests on.
//
// Cost, per § 20.4: the player entity, the clamps and the attract loop. Still no
// collision and no rendering.
//
// **Nothing random touches the demo submarine's path.** It is spawned at a fixed
// position with fixed direction seeds and moves only by the bounce rule of
// § 10.5.1, so its trajectory is exactly reproducible INDEPENDENTLY of whether
// Oracle 1 passes. That isolation is what makes it valuable: it tests the
// divider, the clamps and the loop order and nothing else.
//
// What it exists to catch is the divider being dropped -- which § 2.7 calls the
// single easiest thing in the specification to implement wrongly. Every interval
// then lands very close to half its correct value, which is exactly the kind of
// error that looks like a plausible game and is wrong everywhere.

import { mount } from './harness.js';
import { Session } from '../src/core/session.js';
import { tick } from '../src/core/tick.js';
import { checkEntityInvariants } from '../src/core/invariants.js';
import { unportedTypes } from '../src/core/dispatch.js';
import { DEMO_START, PLAYER_BOUNDS } from '../src/core/player.js';
import { DEMO_DIRECTION_SEED } from '../src/core/demo.js';
import { TYPE, TYPE_NAMES } from '../src/core/types.js';

/** § 20.4's oracle: the first five bounces on each axis, from a cold start. */
const WANT_HORIZONTAL = [1, 256, 510, 764, 1018];
const WANT_VERTICAL = [1, 18, 144, 270, 396];

/** § 20.4's named failure signature when the player's divider is dropped. */
const DIVIDER_DROPPED_H = [1, 129, 256, 383];
const DIVIDER_DROPPED_V = [1, 10, 73, 136];

mount('Oracle 3 — the demo submarine (§ 20.4), the walk (§ 9.4) and the player (§ 13.1)', run);

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function run(list) {
  theWalk(list);
  thePlayer(list);
  oracle3(list);
}

/**
 * Run the attract loop and record everything the oracle needs.
 * @param {number} ticks how many ticks to run
 * @param {number} [period] override the player's update period, to demonstrate
 *   the failure § 20.4 names. Omit for the correct value of 2.
 * @returns {{h: number[], v: number[], session: Session, minX: number,
 *            maxX: number, minY: number, maxY: number, oddX: number,
 *            updateTicks: number[], violations: string[], atMaxXvx: number}}
 */
function runDemo(ticks, period) {
  const session = new Session();
  session.startDemo();
  const player = session.entities.slots[session.playerSlot];
  if (period !== undefined) player.updatePeriod = period;

  const h = [];
  const v = [];
  const updateTicks = [];
  let minX = player.x, maxX = player.x, minY = player.y, maxY = player.y;
  let oddX = 0;
  let atMaxXvx = null;
  /** @type {string[]} */
  let violations = [];

  for (let t = 1; t <= ticks; t++) {
    const posts = session.demo.messagePosts;
    const dirY = session.demo.dirY;
    const px = player.x, py = player.y;

    tick(session);

    if (session.demo.messagePosts !== posts) h.push(t);
    if (session.demo.dirY !== dirY) v.push(t);
    if (player.x !== px || player.y !== py) updateTicks.push(t);

    if (player.x < minX) minX = player.x;
    if (player.x > maxX) maxX = player.x;
    if (player.y < minY) minY = player.y;
    if (player.y > maxY) maxY = player.y;
    if (player.x & 1) oddX += 1;

    // The strict-clamp evidence: the first time X lands exactly on the bound,
    // the velocity must still be running -- the clamp fires only on the step
    // that would pass it.
    if (atMaxXvx === null && player.x === PLAYER_BOUNDS.maxX) atMaxXvx = session.input.vx;

    if (violations.length === 0) violations = checkEntityInvariants(session.entities);
  }
  return { h, v, session, minX, maxX, minY, maxY, oddX, updateTicks, violations, atMaxXvx };
}

// ---------------------------------------------------------------------------
// § 9.4 -- the entity walk
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function theWalk(list) {
  list.section('§ 9.4 — the entity walk');

  const session = new Session();
  session.startDemo();
  const player = session.entities.slots[0];

  list.add('the player takes slot 0, allocated into an empty list (§ 4.4)',
    session.playerSlot === 0 && player.type === TYPE.PLAYER,
    'slot ' + session.playerSlot);
  list.add('firstUpdate is set at creation (§ 9.4.1)',
    player.firstUpdate === true && player.updateCountdown === 0,
    'firstUpdate=' + player.firstUpdate + ' countdown=' + player.updateCountdown);

  // Tick 1: the bypass. Without it the countdown would go 0 -> -1, which is
  // non-zero, and the player would never run at all.
  tick(session);
  list.add('firstUpdate bypasses the divider, and the handler clears it (§ 9.4.1)',
    player.firstUpdate === false && player.updateCountdown === 2,
    'after tick 1: firstUpdate=' + player.firstUpdate +
    ' countdown=' + player.updateCountdown + ' — reloaded from a period of 2');
  list.add('the first update does not move the player (§ 13.1 step 2)',
    player.x === DEMO_START.x && player.y === DEMO_START.y,
    '(' + player.x + ', ' + player.y + ')');

  // § 9.4.1's warning: firstUpdate is not an "is alive" flag. If it were, every
  // live entity would bypass its divider forever and the speed system of § 2.7
  // would collapse into everything moving at once.
  tick(session);
  list.add('tick 2 is SKIPPED by the divider -- the countdown falls but nothing moves',
    player.updateCountdown === 1 && player.x === DEMO_START.x,
    'countdown=' + player.updateCountdown);
  tick(session);
  list.add('tick 3 runs the handler, and the player finally moves',
    player.x !== DEMO_START.x,
    'x ' + DEMO_START.x + ' -> ' + player.x + ', y ' + DEMO_START.y + ' -> ' + player.y);

  // Chapter 13 landed, so nothing on screen is inert any more. What remains
  // unported is exactly § 7.5's six unused merchant slots, which have no
  // creation site by design -- and the walk's null-handler branch is now the
  // guard that keeps them harmless rather than scaffolding.
  const many = runDemo(220);
  const unported = unportedTypes();
  let inertOnScreen = 0;
  for (let i = 0; i < many.session.entities.liveCount; i++) {
    if (unported.indexOf(many.session.entities.slots[i].type) !== -1) inertOnScreen += 1;
  }
  list.add('nothing on screen is inert -- every live entity has a handler (§ 7.2)',
    inertOnScreen === 0 && many.session.entities.liveCount > 1,
    many.session.entities.liveCount + ' live entities, none of them inert');
  list.eq('only § 7.5\'s six unused merchant slots lack a handler',
    unported.join(', '), '5, 6, 7, 10, 11, 12');

  // Two-phase removal, driven through the real walk this time (§ 4.5, § 9.4).
  const dying = new Session();
  dying.startDemo();
  tick(dying);
  const p = dying.entities.slots[0];
  p.removalRequested = true;
  const liveBefore = dying.entities.liveCount;
  tick(dying);
  list.add('a removal request runs the handler immediately, bypassing the divider (§ 9.4)',
    dying.playerAlive === false,
    'the player\'s own handler cleared the alive flag — that is the whole of dying (§ 13.1)');
  list.add('SETTLE then frees the slot in the same tick (§ 4.5, § 9.4)',
    dying.entities.liveCount === liveBefore - 1 && dying.playerSlot === -1,
    'liveCount ' + liveBefore + ' -> ' + dying.entities.liveCount);
}

// ---------------------------------------------------------------------------
// § 13.1, § 2.5 -- the player and the clamps
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function thePlayer(list) {
  list.section('§ 13.1, § 2.5 — the player and its four clamps');

  const fresh = new Session();
  fresh.startDemo();
  const player = fresh.entities.slots[0];
  list.add('the demo submarine spawns at (28, 160), stationary (§ 20.4, § 10.5.1)',
    player.x === DEMO_START.x && player.y === DEMO_START.y &&
    fresh.input.vx === 0 && fresh.input.vy === 0,
    '(' + player.x + ', ' + player.y + ') with velocity (' +
    fresh.input.vx + ', ' + fresh.input.vy + ')');
  list.add('the player carries period 2 and the alive flag (§ 13.1)',
    player.updatePeriod === 2 && fresh.playerAlive === true,
    'period ' + player.updatePeriod);

  const r = runDemo(1100);

  list.add('the player never leaves X 28-280 (§ 2.5)',
    r.minX >= PLAYER_BOUNDS.minX && r.maxX <= PLAYER_BOUNDS.maxX,
    'reached X ' + r.minX + ' … ' + r.maxX + ' over 1100 ticks');
  list.add('the player never leaves Y 50-175 (§ 2.5)',
    r.minY >= PLAYER_BOUNDS.minY && r.maxY <= PLAYER_BOUNDS.maxY,
    'reached Y ' + r.minY + ' … ' + r.maxY +
    ' — the ceiling of 50 is twelve rows below the waterline, so the surface ' +
    'lanes are unreachable by the submarine itself (§ 2.4.1)');
  list.add('both clamps are actually reached, so the bounds are exercised',
    r.minX === PLAYER_BOUNDS.minX && r.maxX === PLAYER_BOUNDS.maxX &&
    r.minY === PLAYER_BOUNDS.minY && r.maxY === PLAYER_BOUNDS.maxY,
    'all four bounds touched');

  list.add('the player\'s X is always even (§ 2.5)',
    r.oddX === 0,
    r.oddX + ' odd readings — normative because Chapter 13 has an object that ' +
    'spawns at a fixed offset from the player and depends on the parity');

  // The clamp is a STRICT inequality. § 2.5 says only that hitting a clamp
  // zeroes the axis, which does not distinguish `>` from `>=`; landing exactly
  // on the bound must NOT stop the sub, or every horizontal interval shortens.
  list.add('landing exactly on a bound does not zero the velocity -- the clamp is strict',
    r.atMaxXvx === 2,
    'at the first X == ' + PLAYER_BOUNDS.maxX + ', vx was still ' + r.atMaxXvx +
    ' — with a >= clamp the horizontal bounces come out at 254 / 506 / 758');

  list.add('the player updates on odd ticks only, one tick in two (§ 2.7)',
    r.updateTicks.every((t) => t % 2 === 1),
    'first movements on ticks ' + r.updateTicks.slice(0, 5).join(', ') +
    ' — tick 1 is the firstUpdate bypass, which does not move');

  list.add('the § 20.6 invariants hold across the whole run',
    r.violations.length === 0, r.violations.join('; ') || 'clean throughout');
}

// ---------------------------------------------------------------------------
// § 20.4 -- the oracle
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function oracle3(list) {
  list.section('§ 20.4 — Oracle 3, the demo trajectory');

  const fresh = new Session();
  fresh.startDemo();
  list.add('both direction seeds start at -2 (§ 20.4)',
    fresh.demo.dirX === DEMO_DIRECTION_SEED && fresh.demo.dirY === DEMO_DIRECTION_SEED,
    'dirX=' + fresh.demo.dirX + ' dirY=' + fresh.demo.dirY +
    ' — so tick 1 bounces both axes, the sub being spawned stationary');

  const r = runDemo(1100);

  list.eq('horizontal bounces, i.e. message posts (§ 20.4)',
    r.h.slice(0, 5).join(', '), WANT_HORIZONTAL.join(', '));
  list.eq('vertical bounces (§ 20.4)',
    r.v.slice(0, 5).join(', '), WANT_VERTICAL.join(', '));

  const hGaps = r.h.slice(1, 5).map((t, i) => t - r.h[i]);
  const vGaps = r.v.slice(1, 5).map((t, i) => t - r.v[i]);
  list.add('steady-state intervals are 254 horizontal and 126 vertical (§ 20.4)',
    hGaps.slice(1).every((g) => g === 254) && vGaps.slice(1).every((g) => g === 126),
    'horizontal ' + hGaps.join(', ') + '; vertical ' + vGaps.join(', ') +
    ' — the first interval differs on both axes because the sub does not start centred');

  list.add('a message is posted on every horizontal bounce and no other tick (§ 10.5.1)',
    r.session.demo.messagePosts === r.h.length,
    r.session.demo.messagePosts + ' posts against ' + r.h.length + ' horizontal bounces ' +
    '— the two are one event, so the caption cadence is a traverse of the screen');

  // § 10.5.2 rule 6: fuel does not burn on the title screen, which is one of the
  // seven suspensions that let an unattended demo run forever.
  list.add('the demo never runs dry -- the fuel gate is shut all run (§ 10.5.2 rule 6)',
    r.session.mission === 0 && r.session.roundLive === false,
    'mission counter 0 and the round not live, so § 13.1 step 3 never fires');

  // The two auto-fire rules of § 10.5.1, assertable while § 13.2 is unported.
  list.eq('the vertical torpedo is attempted every tick (§ 10.5.1)',
    r.session.demo.verticalFireAttempts, 1100);
  const fires = r.session.demo.horizontalFireAttempts;
  const rate = 1100 / fires;
  list.add('the horizontal torpedo fires on 1 draw in 64 (§ 10.5.1)',
    fires > 8 && fires < 30,
    fires + ' fires in 1100 ticks, 1 in ' + rate.toFixed(1) +
    ' — the low six bits of one draw per tick');

  // The oracle must be able to fail, and § 20.4 documents exactly how.
  const dropped = runDemo(400, 1);
  list.add('dropping the player\'s divider produces § 20.4\'s documented signature',
    dropped.h.slice(0, 4).join(', ') === DIVIDER_DROPPED_H.join(', ') &&
    dropped.v.slice(0, 4).join(', ') === DIVIDER_DROPPED_V.join(', '),
    'period 1 gives h: ' + dropped.h.slice(0, 4).join(', ') +
    ' and v: ' + dropped.v.slice(0, 4).join(', ') +
    ' — every interval very close to half, which is why this oracle exists');
}
