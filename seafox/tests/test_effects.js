// seafox/tests/test_effects.js
//
// Effects -- design_spec Chapter 15.
//
// The two claims worth testing hardest are the ones a screenshot would never
// settle:
//
//   * **The burst template's ORDER is the design** (§ 15.8), not an
//     implementation detail. A type consumes the first n records, so a
//     five-particle ship throws left, up-left, up, right and down-right and
//     never the long-lived ones -- and only the player, at twelve, reaches the
//     single record carrying a blob. Hand every type the same slice and every
//     count stays right while the deaths stop differing in kind.
//   * **This system forces no parity** (§ 15.4), which is what leaves the debris
//     as the one object whose colour the draw decides.

import { mount } from './harness.js';
import { Session } from '../src/core/session.js';
import { tick } from '../src/core/tick.js';
import { checkSessionInvariants } from '../src/core/invariants.js';
import {
  EffectList, MAX_EFFECTS, EFFECT_SPRITES, EFFECT_BOUNDS, walkEffects, spriteFor,
} from '../src/core/effects.js';
import { MARK_DELAY, wake } from '../src/core/trails.js';
import {
  BURST_TEMPLATE, emitBurst, oddStepTemplates, templateSpritesAreSound,
} from '../src/core/burst.js';
import { DEFINITIONS } from '../src/core/definitions.js';
import { MAX_ENTITIES } from '../src/core/entities.js';
import { TYPE, TYPE_NAMES, CLASS } from '../src/core/types.js';
import { fireHorizontalTorpedo } from '../src/core/weapons.js';

/** Sprite per type, for the types this page kills. */
const SPRITE_OF = {
  [TYPE.MERCHANT_SHIP]: 'merchant0',
  [TYPE.ENEMY_SUBMARINE]: 'enemyHullRightToLeft',
  [TYPE.DEPTH_CHARGE]: 'chargeSinking',
};

mount('design_spec Chapter 15 — effects, the game\'s second object system', run);

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function run(list) {
  allocator(list);
  theUpdate(list);
  sprites(list);
  theBurst(list);
  creationSites(list);
  longRun(list);
}

/**
 * A session with the spawners held off, so a test sees only what it makes.
 * @returns {Session}
 */
function quiet() {
  const s = new Session();
  s.startDemo();
  for (const k of Object.keys(s.spawners.cooldowns)) s.spawners.cooldowns[k] = 999999;
  s.caps[CLASS.VERTICAL_TORPEDO] = 0;
  s.caps[CLASS.HORIZONTAL_TORPEDO] = 0;
  s.effects.reset();
  return s;
}

// ---------------------------------------------------------------------------
// § 15.1 -- the allocator
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function allocator(list) {
  list.section('§ 15.1 — a second object system, with its own bound');

  const el = new EffectList();
  list.eq('32 slots, separate from the entity list\'s 32', el.slots.length, MAX_EFFECTS);

  for (let i = 0; i < MAX_EFFECTS; i++) {
    el.spawn({ x: 100, y: 100, sprite: 'dot', lifetime: 5 });
  }
  const overflow = el.spawn({ x: 100, y: 100, sprite: 'dot', lifetime: 5 });
  list.add('**this allocator checks its bound** and drops silently when full (§ 15.1)',
    overflow === -1 && el.liveCount === MAX_EFFECTS && el.dropped === 1,
    'the 33rd request returned ' + overflow + ' and the count stayed at ' +
    el.liveCount + ' — where § 4.7\'s entity list has no such test at all and ' +
    'relies entirely on the caps upstream. The two systems differ here on purpose');

  // The record shape is the whole difference between the two systems.
  const e = el.slots[0];
  list.add('an effect record holds VELOCITY and no type; an entity holds identity and '
    + 'no velocity (§ 15.1)',
    'dx' in e && 'dy' in e && !('type' in e),
    'which is why the effects walk is one loop with no dispatch table and no ' +
    'per-type code anywhere behind it — an effect is fully self-describing');

  // Compaction, exactly as § 4.6.
  const el2 = new EffectList();
  for (let i = 0; i < 4; i++) el2.spawn({ x: 100 + i, y: 0, sprite: 'dot', lifetime: 9 });
  el2.free(1);
  list.add('freeing compacts by swap-with-last, exactly as § 4.6',
    el2.liveCount === 3 && el2.slots[1].x === 103,
    'the last effect moved into the hole; slot 1 now holds x=' + el2.slots[1].x);
}

// ---------------------------------------------------------------------------
// § 15.3 -- the update
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function theUpdate(list) {
  list.section('§ 15.3 — the update, in order');

  const s = quiet();
  s.effects.spawn({ x: 100, y: 100, dx: 3, dy: -2, sprite: 'spark', lifetime: 4 });
  const e = s.effects.slots[0];

  list.add('justCreated skips straight to the bounds test -- it appears where it was born (§ 15.2)',
    e.justCreated === true, 'set at creation');
  walkEffects(s);
  list.add('and after that first walk it has still not moved',
    e.x === 100 && e.y === 100 && e.justCreated === false,
    '(' + e.x + ', ' + e.y + ') — an effect is visible at its spawn position ' +
    'before it takes its first step');

  walkEffects(s);
  list.add('the next walk steps it by (dx, dy)',
    e.x === 103 && e.y === 98, '(' + e.x + ', ' + e.y + ')');

  // Lifetime is counted in STEPS, not ticks.
  let steps = 1;
  while (s.effects.liveCount > 0 && steps < 20) { walkEffects(s); steps += 1; }
  list.add('the lifetime is a count of STEPS, and the effect dies when it runs out',
    s.effects.liveCount === 0, 'gone after ' + steps + ' further walks');

  // A step delay holds it still without ending it.
  const s2 = quiet();
  s2.effects.spawn({ x: 50, y: 50, dx: 2, dy: 0, sprite: 'dot', lifetime: 3, stepReload: 4 });
  const d = s2.effects.slots[0];
  walkEffects(s2);                          // justCreated
  walkEffects(s2);
  walkEffects(s2);
  list.add('a step delay holds an effect still without spending its lifetime',
    d.x === 50 && s2.effects.liveCount === 1,
    'x still ' + d.x + ' with the countdown part-way — drawn, not moved');

  // § 15.9 -- the step delay, which is the whole of what a trail is.
  const s9 = quiet();
  s9.effects.spawn({ x: 50, y: 50, sprite: 'dot', lifetime: 1,
    stepReload: MARK_DELAY.verticalDot });
  const mark = s9.effects.slots[0];
  list.eq('a mark is born holding its own step delay, not a shared one',
    mark.stepReload, MARK_DELAY.verticalDot);

  let standing = 0;
  while (s9.effects.liveCount > 0 && standing < 200) { walkEffects(s9); standing += 1; }
  list.eq('and a lifetime-1 mark STANDS for delay + 1 ticks before it goes',
    standing, MARK_DELAY.verticalDot + 1,
    (v) => v + ' walks');

  // The number a port is checked against: 31 against a 4-tick cadence and a
  // 1 px/tick climb is eight dots, and the oldest drops off as each arrives.
  list.eq('which is EIGHT dots behind the vertical torpedo',
    Math.floor((MARK_DELAY.verticalDot + 1) / 4), 8);

  // A ship's wake takes its parent's divider, so a ship holds exactly one.
  const s10 = quiet();
  const shipSlot2 = s10.entities.alloc(TYPE.MERCHANT_SHIP);
  const wakeShip = s10.entities.slots[shipSlot2];
  wakeShip.x = 100;
  wakeShip.y = 20;
  wakeShip.updatePeriod = 7;
  wake(s10, wakeShip, true);
  list.eq('a wake takes its step delay from the ship that laid it',
    s10.effects.slots[0].stepReload, wakeShip.updatePeriod,
    (v) => v + ' -- so one wake expires exactly as the next is laid');

  // The bounds rectangle is wider than the screen.
  const s3 = quiet();
  s3.effects.spawn({ x: 270, y: 100, dx: 6, dy: 0, sprite: 'dot', lifetime: 40 });
  const f = s3.effects.slots[0];
  let past = false;
  for (let i = 0; i < 12 && s3.effects.liveCount > 0; i++) {
    walkEffects(s3);
    if (s3.effects.liveCount > 0 && f.x > 280) past = true;
  }
  list.add('the bounds rectangle is deliberately WIDER than the screen (§ 15.3)',
    past,
    'rows ' + EFFECT_BOUNDS.top + '-' + EFFECT_BOUNDS.bottom + ' and world x ' +
    EFFECT_BOUNDS.left + '-' + EFFECT_BOUNDS.right + ', so effects drift off the ' +
    'edges before they are reaped rather than vanishing at them');

  // **Four literal limits, not one symmetric margin** (§ 15.3). Against § 2.3's
  // visible span of 28-307 the slack is 22 px left and 23 right; deriving both
  // from one margin puts the right cull a pixel inside where the game puts it.
  list.add('and its four limits are the literal ones, asymmetric on purpose (§ 15.3)',
    EFFECT_BOUNDS.left === 6 && EFFECT_BOUNDS.right === 330 &&
    EFFECT_BOUNDS.top === 7 && EFFECT_BOUNDS.bottom === 181,
    'world x ' + EFFECT_BOUNDS.left + '-' + EFFECT_BOUNDS.right + ' -- 22 px past ' +
    'the left edge but 23 past the right');

  // Inclusive: 330 survives, 331 does not.
  const edge = quiet();
  edge.effects.spawn({ x: 328, y: 100, dx: 2, dy: 0, sprite: 'dot', lifetime: 9 });
  walkEffects(edge);                        // justCreated -- clipped, not moved
  walkEffects(edge);                        // -> 330, the last surviving column
  const onLimit = edge.effects.liveCount === 1 && edge.effects.slots[0].x === 330;
  walkEffects(edge);                        // -> 332, past it
  list.add('the limits are INCLUSIVE -- world x 330 lives, past it dies (§ 15.3)',
    onLimit && edge.effects.liveCount === 0,
    'survived at 330' + (onLimit ? '' : ' (NO)') + ', reaped beyond it');

  // **The first walk skips the move but not the clip** (§ 15.3). A debris
  // particle born outside the rectangle -- § 15.8 throws them up to 27 px right
  // of the dying entity -- dies on its first visit, having never been drawn.
  const born = quiet();
  born.effects.spawn({ x: 333, y: 100, dx: -5, dy: 0, sprite: 'spark', lifetime: 5 });
  list.eq('an effect born OUTSIDE the rectangle is allocated as usual',
    born.effects.liveCount, 1);
  walkEffects(born);
  list.add('...and the FIRST walk clips it, so it is reaped never having been drawn (§ 15.3)',
    born.effects.liveCount === 0,
    'a Destroyer killed near the right edge loses the two burst records at X+27');

  // The same first walk keeps one born INSIDE, unmoved.
  const inside = quiet();
  inside.effects.spawn({ x: 330, y: 100, dx: -5, dy: 0, sprite: 'spark', lifetime: 5 });
  walkEffects(inside);
  list.add('while one born just inside it survives that walk, unmoved',
    inside.effects.liveCount === 1 && inside.effects.slots[0].x === 330,
    'x ' + (inside.effects.slots[0] ? inside.effects.slots[0].x : '-') +
    ' -- the clip runs on the first visit, the move does not');
}

// ---------------------------------------------------------------------------
// § 15.4 -- the four sprites
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function sprites(list) {
  list.section('§ 15.4 — four sprites, and who decides their colour');

  list.eq('exactly four (§ 15.4)', Object.keys(EFFECT_SPRITES).length, 4);

  list.add('flip follows the sprite select: the spark and the streak always, the blob '
    + 'and the dot never (§ 15.2)',
    EFFECT_SPRITES.spark.flip && EFFECT_SPRITES.streak.flip &&
    !EFFECT_SPRITES.blob.flip && !EFFECT_SPRITES.dot.flip,
    'the mode byte spends ONE bit on both, so a sprite reachable only with that ' +
    'bit set is always drawn flipped — flip is not a free choice here, it is a ' +
    'consequence of which sprite you asked for');

  list.add('the blob has no hue at all -- two adjacent pixels render white (§ 6.3)',
    EFFECT_SPRITES.blob.parity === 'none' &&
    EFFECT_SPRITES.blob.even === EFFECT_SPRITES.blob.odd,
    'so neither the parity bit nor the flip bit reaches it');

  // The one draw-time colour decision in the game.
  const even = { x: 100, sprite: 'spark', parity: 0 };
  const odd = { x: 101, sprite: 'spark', parity: 0 };
  list.add('the debris picks its variant on its CURRENT X, at draw time (§ 15.4)',
    spriteFor(even) !== spriteFor(odd),
    spriteFor(even) + ' vs ' + spriteFor(odd) +
    ' — the only draw-time colour decision in the game, and the exception § 6.5 names');

  const fixedEven = { x: 101, sprite: 'dot', parity: 0 };
  const fixedOdd = { x: 100, sprite: 'dot', parity: 1 };
  list.add('the dot and the streak are fixed by their creation site, not by their X',
    spriteFor(fixedEven) === EFFECT_SPRITES.dot.even &&
    spriteFor(fixedOdd) === EFFECT_SPRITES.dot.odd,
    'and the choice holds for life, because neither ever moves on an odd dx');
}

// ---------------------------------------------------------------------------
// § 15.8 -- the death burst
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function theBurst(list) {
  list.section('§ 15.8 — the death burst, where the ORDER is the design');

  list.eq('twelve template records, shared by every type', BURST_TEMPLATE.length, 12);
  list.add('eleven carry the spark cluster; record 8 carries the blob (§ 15.8)',
    templateSpritesAreSound(),
    'and being a different sprite it is also the one record drawn unflipped');
  list.eq('four records carry an odd dx (§ 15.8)', oddStepTemplates(), 4);

  // The counts come from the § 7.4 definition record, and a type takes the FIRST n.
  const counts = {
    [TYPE.PLAYER]: 12,
    [TYPE.ENEMY_SUBMARINE]: 7,
    [TYPE.MERCHANT_SHIP]: 5,
    [TYPE.SUPPLY_SUBMARINE]: 7,
    [TYPE.DESTROYER]: 5,
  };
  const wrong = Object.keys(counts).filter((t) => DEFINITIONS[t].debris !== counts[t]);
  list.add('debris counts come from the § 7.4 definition record, per type',
    wrong.length === 0,
    '12 for the player, 7 for a submarine, 5 for a ship — the player\'s is the ' +
    'largest burst in the game, and the only type with debris but no animation ' +
    'AND no re-anchor');

  // Only the player reaches record 8.
  const reaches8 = Object.keys(counts).filter((t) => counts[t] > 8).map((t) => TYPE_NAMES[t]);
  list.add('only the player reaches record 8, so only the player\'s death contains a blob',
    reaches8.length === 1 && reaches8[0] === 'player',
    'a type takes the FIRST n records, and 8 is reached only at a count of nine ' +
    'or more — so the player dies with one white particle among eleven coloured ' +
    'sparks, and nothing else in the game does');

  // A ship throws the first five and never the long-lived ones.
  const s = quiet();
  const shipSlot = s.entities.alloc(TYPE.MERCHANT_SHIP);
  const ship = s.entities.slots[shipSlot];
  ship.x = 120;
  ship.y = 40;
  emitBurst(s, ship, DEFINITIONS[TYPE.MERCHANT_SHIP].debris);
  const lifetimes = [];
  for (let i = 0; i < s.effects.liveCount; i++) lifetimes.push(s.effects.slots[i].lifetime);
  const longest = Math.max.apply(null, BURST_TEMPLATE.map((t) => t.life));
  list.add('a five-particle ship throws records 0-4 and never the long-lived ones',
    s.effects.liveCount === 5 && Math.max.apply(null, lifetimes) === 6,
    'lifetimes ' + lifetimes.join(', ') + ' — the longest of the first five. The ' +
    'longest record in the table lives ' + longest + ' steps and a ship never ' +
    'reaches it, because a type takes the FIRST n. Bigger deaths differ in KIND, ' +
    'not merely in count');

  // Driven through a REAL death, not through emitBurst directly: the count is
  // read inside beginDeath, so calling the emitter with a hand-supplied count
  // tests the template and not the port. A mutation handing every type the full
  // twelve records slips straight past a check that never goes through the walk.
  for (const type of [TYPE.MERCHANT_SHIP, TYPE.ENEMY_SUBMARINE, TYPE.DEPTH_CHARGE]) {
    const sd = quiet();
    const slot = sd.entities.alloc(type);
    const dead = sd.entities.slots[slot];
    dead.x = 140;
    dead.y = 60;
    dead.sprite = SPRITE_OF[type];
    dead.updatePeriod = 1;
    dead.updateCountdown = 1;
    dead.firstUpdate = false;
    sd.entities.countSpawn(type);
    dead.stateChangePending = true;
    tick(sd);
    const want = DEFINITIONS[type].debris;
    list.eq('a dying ' + TYPE_NAMES[type] + ' throws ' + want +
      ' particles through the real death path (§ 15.8)',
      sd.effects.liveCount, want);
  }

  list.add('particle positions are the template offsets added to the DYING entity\'s own',
    s.effects.slots[0].x === ship.x + BURST_TEMPLATE[0].ox &&
    s.effects.slots[0].y === ship.y + BURST_TEMPLATE[0].oy,
    'record 0 at (' + s.effects.slots[0].x + ', ' + s.effects.slots[0].y + ')');

  // The burst is subject to the allocator's bound like anything else.
  const s2 = quiet();
  for (let i = 0; i < MAX_EFFECTS - 3; i++) {
    s2.effects.spawn({ x: 1, y: 100, sprite: 'dot', lifetime: 40 });
  }
  const made = emitBurst(s2, ship, 12);
  list.add('a burst with no room left is short, not fatal -- the allocator drops (§ 15.1)',
    made === 3 && s2.effects.liveCount === MAX_EFFECTS,
    'asked for 12, made ' + made + ' — the game carries on a few sparks short');
}

// ---------------------------------------------------------------------------
// § 15.5 – § 15.7 -- the creation sites
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function creationSites(list) {
  list.section('§ 15.5 – § 15.7 — the creation sites');

  // The splash is thrown UPWARD.
  const s = quiet();
  const chargeSlot = s.entities.alloc(TYPE.DEPTH_CHARGE);
  const charge = s.entities.slots[chargeSlot];
  charge.x = 150;
  charge.y = 31;
  charge.sprite = 'chargeArcing';
  charge.updatePeriod = 1;
  charge.updateCountdown = 1;
  charge.scratch0 = 28;                     // a full arc ahead of it
  charge.scratch1 = 175;                    // a fuse it will not reach yet
  charge.scratch2 = 2;
  charge.scratch3 = 8;
  charge.animLastFrame = 8;
  s.entities.countSpawn(TYPE.DEPTH_CHARGE);

  let splashed = [];
  for (let t = 0; t < 10 && splashed.length === 0; t++) {
    tick(s);
    const dots = [];
    for (let i = 0; i < s.effects.liveCount; i++) {
      const f = s.effects.slots[i];
      if (f.sprite === 'dot' && f.lifetime >= 4) dots.push(f);
    }
    if (dots.length >= 3) splashed = dots;
  }
  list.add('the splash is three dots thrown UPWARD, not backward (§ 15.6)',
    splashed.length === 3 && splashed.every((f) => f.dy === -2) &&
    splashed.map((f) => f.dx).sort((a, b) => a - b).join(',') === '-2,0,2',
    splashed.length ? 'dy ' + splashed.map((f) => f.dy).join('/') + ', dx ' +
      splashed.map((f) => f.dx).sort((a, b) => a - b).join('/') +
      ', lifetime ' + splashed[0].lifetime +
      ' — a fan thrown up at the moment of entry, and one of only two effects ' +
      'in the game that outlive the tick that made them'
      : 'no splash seen');

  // The two trail toggles are seeded to OPPOSITE values (§ 15.7): the player's
  // horizontal torpedo lays its first mark on the tick it is fired, and the
  // enemy's waits a tick.
  const sT = quiet();
  sT.caps[CLASS.HORIZONTAL_TORPEDO] = 1;
  const pT = sT.entities.slots[sT.playerSlot];
  pT.x = 60;
  pT.y = 100;
  fireHorizontalTorpedo(sT);
  const horiz = findType(sT, TYPE.HORIZONTAL_TORPEDO);

  const sE = quiet();
  const subSlot = sE.entities.alloc(TYPE.ENEMY_SUBMARINE);
  const sub = sE.entities.slots[subSlot];
  sub.x = 200; sub.y = 100; sub.sprite = 'enemyHullRightToLeft';
  sub.updatePeriod = 1; sub.updateCountdown = 1; sub.scratch0 = -2;
  sE.entities.countSpawn(TYPE.ENEMY_SUBMARINE);
  sE.caps[CLASS.ENEMY_TORPEDO] = 1;
  let enemyTorp = null;
  for (let t = 0; t < 30 && enemyTorp === null; t++) {
    tick(sE);
    enemyTorp = findType(sE, TYPE.ENEMY_TORPEDO);
  }
  list.add('the two trail toggles are seeded to OPPOSITE values (§ 15.7)',
    horiz !== null && enemyTorp !== null && horiz.scratch3 !== enemyTorp.scratch2,
    horiz && enemyTorp
      ? 'player horizontal seeded ' + horiz.scratch3 + ', enemy seeded ' +
        enemyTorp.scratch2 + ' — so the player torpedo lays a mark on the very tick it ' +
        'is fired and the enemy one waits.  All three torpedoes trail, and no ' +
        'two the same way'
      : 'could not obtain both torpedoes');

  finishSites(list);
}

/**
 * @param {Session} s
 * @param {number} type
 * @returns {Object|null}
 */
function findType(s, type) {
  for (let i = 0; i < s.entities.liveCount; i++) {
    if (s.entities.slots[i].type === type) return s.entities.slots[i];
  }
  return null;
}

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function finishSites(list) {
  // Wake direction, which § 15.5 calls easy to get backwards.
  const s = quiet();
  const hSlot = s.entities.alloc(TYPE.HOSPITAL_SHIP);
  const h = s.entities.slots[hSlot];
  h.x = 120; h.y = 20; h.sprite = 'hospitalShip';
  h.updatePeriod = 3; h.updateCountdown = 3;
  s.entities.countSpawn(TYPE.HOSPITAL_SHIP);

  const dSlot = s.entities.alloc(TYPE.DESTROYER);
  const d = s.entities.slots[dSlot];
  d.x = 200; d.y = 30; d.sprite = 'destroyer';
  d.updatePeriod = 5; d.updateCountdown = 5;
  s.entities.countSpawn(TYPE.DESTROYER);

  let hWake = null;
  let dWake = null;
  for (let t = 0; t < 30 && (!hWake || !dWake); t++) {
    tick(s);
    for (let i = 0; i < s.effects.liveCount; i++) {
      const f = s.effects.slots[i];
      if (f.sprite !== 'streak') continue;
      if (f.y === h.y + 7 && !hWake) hWake = { x: f.x, parentX: h.x };
      if (f.y === d.y + 7 && !dWake) dWake = { x: f.x, parentX: d.x };
    }
  }
  list.add('a wake goes off the STERN, and the stern depends on direction (§ 15.5)',
    hWake !== null && dWake !== null &&
    hWake.x === hWake.parentX - 7 && dWake.x === dWake.parentX + 29,
    hWake && dWake
      ? 'the right-travelling hospital ship places it 7 px LEFT (' + hWake.x +
        ' from ' + hWake.parentX + '); the left-travelling Destroyer places it 29 px ' +
        'RIGHT (' + dWake.x + ' from ' + dWake.parentX + '). Putting both on the ' +
        'same side puts a wake in front of half the traffic'
      : 'no wake observed');

  // And the cadence is divided, not per tick.
  const s3 = quiet();
  const mSlot = s3.entities.alloc(TYPE.MERCHANT_SHIP);
  const m = s3.entities.slots[mSlot];
  m.x = 120; m.y = 10; m.sprite = 'merchant0';
  m.updatePeriod = 7; m.updateCountdown = 7;
  s3.entities.countSpawn(TYPE.MERCHANT_SHIP);
  // Counted by distinct position, not by the live count growing: a wake now
  // outlives the tick that made it (§ 15.9 gives it the ship's own period), so
  // the next one is laid as the last expires and the count barely moves.
  const seenWakes = new Set();
  for (let t = 0; t < 70; t++) {
    tick(s3);
    for (let i = 0; i < s3.effects.liveCount; i++) {
      const e = s3.effects.slots[i];
      if (e.sprite === 'streak') seenWakes.add(e.x + ',' + e.y);
    }
  }
  const wakes = seenWakes.size;
  list.add('a wake is made once per PARENT UPDATE, so it is divided down (§ 15.5)',
    wakes > 5 && wakes < 15,
    wakes + ' wakes in 70 ticks from a merchant on period 7 — a single mark for ' +
    'one tick in every 7, not one every tick');
}

// ---------------------------------------------------------------------------
// A long run
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function longRun(list) {
  list.section('an attract run of 3000 ticks');

  const s = new Session();
  s.startDemo();
  let peak = 0;
  let bad = null;
  const kinds = new Set();
  for (let t = 1; t <= 3000; t++) {
    tick(s);
    peak = Math.max(peak, s.effects.liveCount);
    for (let i = 0; i < s.effects.liveCount; i++) kinds.add(s.effects.slots[i].sprite);
    if (bad === null) {
      const v = checkSessionInvariants(s);
      if (v.length) bad = 'tick ' + t + ': ' + v.join('; ');
    }
  }

  list.add('all four sprites are actually produced in play',
    kinds.size === 4, [...kinds].sort().join(', '));
  list.add('§ 20.6 effect-count invariant holds every tick', bad === null,
    'peak ' + peak + ' of ' + MAX_EFFECTS + ', ' + s.effects.dropped + ' dropped');
  list.add('effects are reaped rather than accumulating',
    s.effects.liveCount < MAX_EFFECTS,
    s.effects.liveCount + ' live at tick 3000, having peaked at ' + peak);
  list.add('the entity and effect allocators stay the same size and separate',
    MAX_ENTITIES === MAX_EFFECTS && s.effects !== s.entities,
    'both 32, sharing a discipline and nothing else');
}
