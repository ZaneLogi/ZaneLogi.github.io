// seafox/tests/test_entities.js
//
// The entity list of design_spec Chapter 4, and the continuously-checkable
// invariants of § 20.6 that guard it.
//
// This is not one of the four oracles. It exists because Chapter 4 carries three
// rules whose failures are close to undiagnosable from play -- a collapsed
// two-phase removal silently stops a class spawning for the rest of the session,
// and an advancing cursor after swap-with-last silently skips an entity every
// time a slot is freed. Both are cheap to test directly and expensive to find
// later, and neither needs a walk, a handler or a renderer to exercise.
//
// § 20.6's invariants themselves live in src/core/invariants.js -- a development
// build calls them per tick, so they are core state readers rather than test
// code. This page checks that they can both pass and FAIL.

import { mount } from './harness.js';
import { EntityList, MAX_ENTITIES } from '../src/core/entities.js';
import { TYPE, CLASS, CLASS_OF_TYPE } from '../src/core/types.js';
import { checkEntityInvariants } from '../src/core/invariants.js';

mount('design_spec Chapter 4 -- the entity list, plus the § 20.6 invariants', run);

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function run(list) {
  allocation(list);
  removal(list);
  swapWithLast(list);
  classCounters(list);
  resetDiscipline(list);
  invariants(list);
}

// ---------------------------------------------------------------------------
// § 4.1, § 4.4 -- the array and append allocation
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function allocation(list) {
  list.section('§ 4.1, § 4.4 — the array and append allocation');

  const el = new EntityList();
  list.eq('the array is 32 slots (§ 4.1)', el.slots.length, MAX_ENTITIES);
  list.eq('a fresh list is empty', el.liveCount, 0);

  const a = el.alloc(TYPE.MERCHANT_SHIP);
  const b = el.alloc(TYPE.DESTROYER);
  const c = el.alloc(TYPE.ENEMY_SUBMARINE);
  list.add('allocation is an append -- slots come back 0, 1, 2 (§ 4.4)',
    a === 0 && b === 1 && c === 2, 'got ' + a + ', ' + b + ', ' + c);
  list.eq('liveCount tracks the appends', el.liveCount, 3);

  list.add('a new slot carries active and firstUpdate (§ 4.3, § 9.4.1)',
    el.slots[c].active === true && el.slots[c].firstUpdate === true,
    'active=' + el.slots[c].active + ' firstUpdate=' + el.slots[c].firstUpdate);

  // A slot is reused, so it must arrive clean -- a stale scratch field read as
  // this type's step is exactly the order-of-magnitude speed error § 4.2 warns
  // about.
  el.slots[2].scratch0 = 1234;
  el.freeSlot(2);
  const d = el.alloc(TYPE.HOSPITAL_SHIP);
  list.add('a reused slot arrives cleared, carrying nothing from its last tenant',
    d === 2 && el.slots[2].scratch0 === 0,
    'slot ' + d + ', scratch0=' + el.slots[2].scratch0);

  // § 4.4 has no bounds check because the caps prevent overflow upstream. We
  // refuse rather than grow: the array size is what gives every cap its meaning.
  const full = new EntityList();
  for (let i = 0; i < MAX_ENTITIES; i++) full.alloc(TYPE.MERCHANT_SHIP);
  let threw = false;
  try { full.alloc(TYPE.MERCHANT_SHIP); } catch (e) { threw = true; }
  list.add('a 33rd allocation is refused rather than growing the array (§ 4.7.1)',
    threw && full.liveCount === MAX_ENTITIES,
    'liveCount stayed at ' + full.liveCount);
}

// ---------------------------------------------------------------------------
// § 4.5 -- removal is two-phase
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function removal(list) {
  list.section('§ 4.5 — two-phase removal');

  const el = new EntityList();
  const slot = el.alloc(TYPE.ENEMY_SUBMARINE);
  el.countSpawn(TYPE.ENEMY_SUBMARINE);

  // Phase 1: anything may request. Nothing else happens.
  el.slots[slot].removalRequested = true;
  list.add('a request alone frees nothing and decrements nothing (§ 4.5)',
    el.liveCount === 1 && el.counts[CLASS.ENEMY_SUBMARINE] === 1,
    'liveCount=' + el.liveCount + ' count=' + el.counts[CLASS.ENEMY_SUBMARINE]);

  // Phase 2: the entity's OWN handler confirms and decrements its class counter.
  // This is what the walk would do; here it is driven directly.
  const e = el.slots[slot];
  e.removalRequested = false;
  e.removalConfirmed = true;
  el.countRemoval(e.type);
  el.freeSlot(slot);

  list.add('confirmation frees the slot and decrements the class counter',
    el.liveCount === 0 && el.counts[CLASS.ENEMY_SUBMARINE] === 0,
    'liveCount=' + el.liveCount + ' count=' + el.counts[CLASS.ENEMY_SUBMARINE]);

  // The failure § 4.5 warns about, demonstrated: free without the type's own
  // handler running, and the class stays full forever. Shown here so the
  // invariant below is known to be able to catch it.
  const leak = new EntityList();
  const s2 = leak.alloc(TYPE.ENEMY_SUBMARINE);
  leak.countSpawn(TYPE.ENEMY_SUBMARINE);
  leak.freeSlot(s2);                        // collapsed: no countRemoval
  const leaked = leak.counts[CLASS.ENEMY_SUBMARINE] !== leak.populationOf(CLASS.ENEMY_SUBMARINE);
  list.add('a collapsed handoff is detectable -- counter drifts from the array',
    leaked,
    'counter=' + leak.counts[CLASS.ENEMY_SUBMARINE] + ' actual population=' +
    leak.populationOf(CLASS.ENEMY_SUBMARINE) +
    ' — this is the leak § 4.5 describes, and § 20.6 is what catches it');
}

// ---------------------------------------------------------------------------
// § 4.6 -- swap-with-last, and the cursor that must not advance
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function swapWithLast(list) {
  list.section('§ 4.6 — swap-with-last and the non-advancing cursor');

  const el = new EntityList();
  for (let i = 0; i < 4; i++) {
    const s = el.alloc(TYPE.MERCHANT_SHIP);
    el.slots[s].x = 100 + i;              // a tag, so the swap is visible
  }

  el.freeSlot(1);
  list.add('freeing a middle slot moves the LAST entity into the hole',
    el.slots[1].x === 103 && el.liveCount === 3,
    'slot 1 now holds x=' + el.slots[1].x + ', liveCount=' + el.liveCount);

  list.add('the array stays dense -- no holes, no tombstones (§ 4.1)',
    el.slots.slice(0, el.liveCount).every((e) => e.active),
    'first ' + el.liveCount + ' slots all active');

  // Freeing the LAST slot leaves the cursor already equal to liveCount, so the
  // walk ends on its next test -- which is why "do not advance" is safe in both
  // cases and does not need a special one.
  const lastSlot = el.liveCount - 1;
  el.freeSlot(lastSlot);
  list.add('after freeing the last slot the cursor already equals liveCount, so the walk ends',
    lastSlot === el.liveCount,
    'cursor would sit at ' + lastSlot + ', liveCount=' + el.liveCount);

  // The bug the rule exists to prevent, both halves of it.
  const bug = simulateWalk(true);
  const correct = simulateWalk(false);
  // The symptom is quieter than it looks: the buggy walk does not crash or
  // overrun. It reaches cursor === liveCount early and exits cleanly, having
  // silently never visited the entities that were swapped down into the holes.
  list.add('a cursor that advances after a free silently skips entities (§ 4.6)',
    bug.visited < correct.total && !bug.overran,
    'always-advance visited ' + bug.visited + ' of ' + bug.total +
    ' and exited cleanly -- it does not crash, it just misses ' +
    (bug.total - bug.visited) + ' of them');
  list.add('never advancing after a free visits every entity exactly once',
    correct.visited === correct.total && !correct.overran && correct.liveCount === 4,
    'visited ' + correct.visited + ' of ' + correct.total +
    ', ' + correct.liveCount + ' survivors left');
}

/**
 * Walk a list removing every other entity, once by § 4.6's rule and once with
 * the cursor bug.
 *
 * The § 9.4 walk shape, reduced to what Chapter 4 governs: no handlers, no
 * dividers, no collision.
 * @param {boolean} advanceAfterFree the bug being demonstrated
 * @returns {{visited: number, total: number, overran: boolean, liveCount: number}}
 */
function simulateWalk(advanceAfterFree) {
  const el = new EntityList();
  const total = 8;
  for (let i = 0; i < total; i++) {
    const s = el.alloc(TYPE.MERCHANT_SHIP);
    el.slots[s].y = i;                    // identity, preserved across swaps
  }
  const seen = new Set();
  let cursor = 0;
  let overran = false;
  while (cursor !== el.liveCount) {
    if (cursor > el.liveCount || cursor >= MAX_ENTITIES) { overran = true; break; }
    const e = el.slots[cursor];
    seen.add(e.y);
    if (e.y % 2 === 0) {                  // remove every other one
      el.freeSlot(cursor);
      if (advanceAfterFree) cursor += 1;
    } else {
      cursor += 1;
    }
  }
  return { visited: seen.size, total, overran, liveCount: el.liveCount };
}

// ---------------------------------------------------------------------------
// § 4.7 -- per-class admission control
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function classCounters(list) {
  list.section('§ 4.7 — the nine capped classes and the six uncapped sites');

  const capped = Object.values(CLASS);
  list.eq('nine capped classes (§ 4.7)', capped.length, 9);

  // § 4.7: six creation sites carry no cap at all.
  const uncapped = [TYPE.PLAYER, TYPE.SUPPLY_SUBMARINE, TYPE.PAYLOAD,
                    TYPE.DOLPHIN, TYPE.GIANT_CLAM, TYPE.AVENGER];
  list.add('the player, supply submarine, payload, dolphin, clam and avenger are uncapped',
    uncapped.every((t) => CLASS_OF_TYPE[t] === null),
    uncapped.length + ' uncapped creation sites');

  // All seven merchant type numbers share one class, which is what lets the six
  // unused slots of § 7.5 cost nothing.
  const merchantTypes = [5, 6, 7, 9, 10, 11, 12];
  list.add('all seven merchant type numbers map to one class (§ 7.5)',
    merchantTypes.every((t) => CLASS_OF_TYPE[t] === CLASS.MERCHANT),
    'types ' + merchantTypes.join(', '));

  const el = new EntityList();
  el.alloc(TYPE.MERCHANT_SHIP); el.countSpawn(TYPE.MERCHANT_SHIP);
  el.alloc(TYPE.MERCHANT_UNUSED_11); el.countSpawn(TYPE.MERCHANT_UNUSED_11);
  list.eq('two different merchant type numbers count against the same cap',
    el.counts[CLASS.MERCHANT], 2);

  const uncappedList = new EntityList();
  uncappedList.alloc(TYPE.AVENGER);
  uncappedList.countSpawn(TYPE.AVENGER);
  list.add('an uncapped type increments nothing',
    Object.values(uncappedList.counts).every((n) => n === 0),
    'every counter still zero after spawning an avenger');
}

// ---------------------------------------------------------------------------
// § 4.8 -- the joint reset
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function resetDiscipline(list) {
  list.section('§ 4.8 — list and counters clear together');

  const el = new EntityList();
  for (const t of [TYPE.MERCHANT_SHIP, TYPE.DESTROYER, TYPE.ENEMY_SUBMARINE,
                   TYPE.VERTICAL_TORPEDO]) {
    el.alloc(t);
    el.countSpawn(t);
  }
  el.reset();

  list.add('the list empties and every counter zeroes in one operation',
    el.liveCount === 0 && Object.values(el.counts).every((n) => n === 0),
    'liveCount=' + el.liveCount + ', all nine counters at zero');

  list.add('the two torpedo counters clear too, though § 4.8 says "seven"',
    el.counts[CLASS.VERTICAL_TORPEDO] === 0 && el.counts[CLASS.HORIZONTAL_TORPEDO] === 0,
    'a cap of 1 left standing would block that weapon for the rest of the session');

  list.add('every slot is cleared, not just the live prefix',
    el.slots.every((e) => e.active === false && e.type === 0),
    'all ' + MAX_ENTITIES + ' slots');
}

// ---------------------------------------------------------------------------
// § 20.6 -- the continuously-checkable invariants
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function invariants(list) {
  list.section('§ 20.6 — the invariants themselves');

  const good = new EntityList();
  for (const t of [TYPE.MERCHANT_SHIP, TYPE.DESTROYER]) {
    good.alloc(t);
    good.countSpawn(t);
  }
  list.add('a correctly-maintained list reports no violations',
    checkEntityInvariants(good).length === 0,
    checkEntityInvariants(good).join('; ') || 'clean');

  // The invariant must be able to fail, or it is decoration.
  const drifted = new EntityList();
  const s = drifted.alloc(TYPE.DESTROYER);
  drifted.countSpawn(TYPE.DESTROYER);
  drifted.freeSlot(s);                      // collapsed handoff again
  const found = checkEntityInvariants(drifted);
  list.add('a drifted class counter IS reported -- the invariant can fail',
    found.length === 1 && found[0].indexOf(CLASS.DESTROYER) === 0,
    found.join('; '));

  const holed = new EntityList();
  holed.alloc(TYPE.MERCHANT_SHIP);
  holed.countSpawn(TYPE.MERCHANT_SHIP);
  holed.liveCount = 2;                      // a hole, without allocating
  list.add('a hole in the dense array IS reported',
    checkEntityInvariants(holed).some((m) => m.indexOf('hole') === 0),
    checkEntityInvariants(holed).join('; '));
}
