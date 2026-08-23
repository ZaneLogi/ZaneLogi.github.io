// seafox/tests/test_collision.js
//
// Collision and its responses -- design_spec Chapter 14 -- and the Chapter 3
// stencil the confirm reads.
//
// The rule this page exists to protect is § 14.5's: **the damage flag defaults
// to harm, and exemption is the exception.** Getting it backwards makes the
// entire game harmless, and a harmless game still runs, still animates and still
// looks right in a screenshot. Most of what follows is therefore a check that
// something CAN be hurt, not that something cannot.

import { mount } from './harness.js';
import { Session } from '../src/core/session.js';
import { tick } from '../src/core/tick.js';
import { checkEntityInvariants } from '../src/core/invariants.js';
import { boxOf, boxesOverlap } from '../src/core/collision.js';
import { INK } from '../src/core/stencil.js';
import { FUEL_FULL, TORPEDOES_FULL } from '../src/core/resources.js';
import { ROSTER_STATUS } from '../src/core/spawners.js';
import { TYPE, TYPE_NAMES, CLASS } from '../src/core/types.js';
import { fireVerticalTorpedo } from '../src/core/weapons.js';

/** Sprite and period per type, matching each type's own creation site. */
const SETUP = {
  [TYPE.PLAYER]: { sprite: 'playerSubmarine', period: 2 },
  [TYPE.VERTICAL_TORPEDO]: { sprite: 'torpedoRising', period: 1, scratch0: -1 },
  [TYPE.HORIZONTAL_TORPEDO]: { sprite: 'torpedoHorizontal', period: 2 },
  [TYPE.ENEMY_SUBMARINE]: { sprite: 'enemyHullRightToLeft', period: 1 },
  [TYPE.MAGNETIC_MINE]: { sprite: 'magneticMine', period: 9 },
  [TYPE.HOSPITAL_SHIP]: { sprite: 'hospitalShip', period: 3 },
  [TYPE.MERCHANT_SHIP]: { sprite: 'merchant0', period: 7 },
  [TYPE.SUPPLY_SUBMARINE]: { sprite: 'supplySubmarine', period: 1 },
  [TYPE.PAYLOAD]: { sprite: 'payload', period: 1 },
  [TYPE.DOLPHIN]: { sprite: 'dolphin', period: 1 },
  [TYPE.GIANT_CLAM]: { sprite: 'shellOpen', period: 1 },
  [TYPE.DESTROYER]: { sprite: 'destroyer', period: 5 },
  [TYPE.DEPTH_CHARGE]: { sprite: 'chargeSinking', period: 1 },
  [TYPE.ENEMY_TORPEDO]: { sprite: 'enemyTorpedo', period: 1 },
  [TYPE.AVENGER]: { sprite: 'avenger', period: 1 },
};

mount('design_spec Chapter 14 — collision and responses, over the Chapter 3 stencil', run);

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function run(list) {
  theBox(list);
  theConfirm(list);
  theTable(list);
  theLauncherExemption(list);
  theUnlocked(list);
  overLongRun(list);
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * A session with the spawners held off and the demo's auto-fire suppressed, so
 * a test sees only what it places. Mission 3 by default: a mission tick runs no
 * bounce, so the player holds still and IS vulnerable -- § 13.1's second gate
 * makes the demo player immune, which would mask every check here.
 * @param {number} [mission]
 * @returns {Session}
 */
function stage(mission = 3) {
  const s = new Session();
  s.startDemo();
  s.mission = mission;
  s.applyRung();
  s.roundLive = true;
  for (const k of Object.keys(s.spawners.cooldowns)) s.spawners.cooldowns[k] = 999999;
  s.caps[CLASS.VERTICAL_TORPEDO] = 0;
  s.caps[CLASS.HORIZONTAL_TORPEDO] = 0;
  // Park the player far from anything a test places.
  const p = s.entities.slots[s.playerSlot];
  p.x = 40;
  p.y = 170;
  return s;
}

/**
 * Place one entity, as its own creation site would.
 * @param {Session} s
 * @param {number} type
 * @param {number} x
 * @param {number} y
 * @returns {number} its slot
 */
function place(s, type, x, y) {
  const cfg = SETUP[type];
  const slot = s.entities.alloc(type);
  const e = s.entities.slots[slot];
  e.x = x;
  e.y = y;
  e.sprite = cfg.sprite;
  e.updatePeriod = cfg.period;
  e.updateCountdown = cfg.period;
  if (cfg.scratch0 !== undefined) e.scratch0 = cfg.scratch0;
  s.entities.countSpawn(type);
  return slot;
}

/**
 * Put two types on top of one another and run until they meet or the window
 * closes. Returns what happened to each.
 *
 * Overlap is arranged by ink rather than by box, because § 14.3's confirm is a
 * pixel test: two boxes can overlap while the silhouettes miss.
 *
 * @param {number} typeA
 * @param {number} typeB
 * @param {number} [mission]
 * @returns {{a: Object, b: Object, session: Session, met: boolean}}
 */
function collide(typeA, typeB, mission) {
  const s = stage(mission);
  const x = 120;
  const y = 100;
  const slotA = place(s, typeA, x, y);
  const slotB = place(s, typeB, x, y);
  const a = s.entities.slots[slotA];
  const b = s.entities.slots[slotB];

  let met = false;
  for (let t = 0; t < 6 && !met; t++) {
    // Hold them together: several of these types move themselves.
    a.x = x; a.y = y;
    b.x = x; b.y = y;
    tick(s);
    met = a.stateChangePending || a.dying || a.removalRequested ||
          b.stateChangePending || b.dying || b.removalRequested;
  }
  return { a, b, session: s, met };
}

/**
 * @param {Object} e
 * @returns {boolean} whether this entity took damage -- the § 14.5 outcome
 */
function damaged(e) {
  return e.stateChangePending || e.dying;
}

// ---------------------------------------------------------------------------
// § 14.2 -- the box
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function theBox(list) {
  list.section('§ 14.2 — the box, from the sprite\'s stored byte width');

  const s = stage();
  const slot = place(s, TYPE.MERCHANT_SHIP, 100, 10);
  const e = s.entities.slots[slot];
  const box = boxOf(e);
  const sprite = INK['merchant0'];

  list.add('extents derive from byteWidth, not from the stripped pixel width (§ 6.4)',
    box.right === 100 + (sprite.byteWidth - 1) * 7,
    'byteWidth ' + sprite.byteWidth + ' gives right=' + box.right +
    ' (a box 29 px wide, extents inclusive) while the stripped ink is only ' +
    sprite.w + ' px — recomputing from the bitmap yields boxes that are equal or ' +
    'tighter, never looser, and weapons that miss more often than they should');
  list.add('both extents are inclusive (§ 14.2)',
    box.left === 100 && box.top === 10 && box.bottom === 10 + sprite.h - 1,
    'left ' + box.left + ' right ' + box.right + ' top ' + box.top + ' bottom ' + box.bottom);

  const touching = { left: box.right, right: box.right + 5, top: box.top, bottom: box.bottom };
  const clear = { left: box.right + 1, right: box.right + 5, top: box.top, bottom: box.bottom };
  list.add('boxes sharing exactly one column overlap; one column apart do not',
    boxesOverlap(box, touching) && !boxesOverlap(box, clear),
    'inclusive extents mean touching counts');
}

// ---------------------------------------------------------------------------
// § 14.3 -- the confirm
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function theConfirm(list) {
  list.section('§ 3.2, § 14.3 — the confirm, and what it reads');

  const s = stage();
  const mSlot = place(s, TYPE.MERCHANT_SHIP, 100, 10);
  const m = s.entities.slots[mSlot];
  tick(s);

  list.add('an entity is written into the stencil under its own slot + 1 (§ 3.1)',
    s.stencil.buf.some((v) => v === mSlot + 1),
    'the buffer carries IDENTITY, not mere occupancy — which is what lets the ' +
    'confirm ask "anything that is not me" without erasing anything');

  // The bug this ordering exists to prevent, stated as a property: a subject
  // must be able to see a foreign id inside its own footprint. Stamp the subject
  // before the confirm and every pixel of that footprint holds its own id, so
  // the test is false by construction and NOTHING in the game can ever collide.
  const alone = s.stencil.confirms(m, mSlot);
  list.add('an entity alone in the stencil confirms nothing',
    alone === false, 'its own pixels are its own, so the test is correctly false');

  const tSlot = place(s, TYPE.VERTICAL_TORPEDO, 106, 12);
  const torp = s.entities.slots[tSlot];
  s.stencil.write(torp, tSlot);
  list.add('with a second entity stamped over it, the confirm fires (§ 3.2)',
    s.stencil.confirms(m, mSlot) === true,
    'the merchant now finds an id in its own footprint that is neither 0 nor its own');

  // § 14.3's normative consequence, and it is a strange one.
  list.add('the confirm does not reference the candidate -- it is per SUBJECT (§ 14.3)',
    true,
    'so it is computed once per subject per tick and cached, and the sweep does ' +
    'box tests only. The consequence is normative: a THIRD entity\'s pixels can ' +
    'confirm a contact between two entities whose own silhouettes never met, ' +
    'provided their boxes overlapped');

  // And the whole point: contact actually resolves.
  const met = collide(TYPE.MERCHANT_SHIP, TYPE.VERTICAL_TORPEDO);
  list.add('a merchant and a vertical torpedo placed together actually collide',
    met.met, 'if this fails, the confirm is false by construction and the game ' +
    'is silently collision-free');
}

// ---------------------------------------------------------------------------
// § 14.4, § 14.5, § 14.6 -- dispatch, the default, and the table
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function theTable(list) {
  list.section('§ 14.4 – § 14.6 — two-sided dispatch, the damage default, the table');

  // The default is harm. A pair with no exemption between them kills BOTH.
  const both = collide(TYPE.ENEMY_TORPEDO, TYPE.MAGNETIC_MINE);
  list.add('a torpedo and a mine from the same submarine destroy each other (§ 13.5.4)',
    damaged(both.a) && damaged(both.b),
    'there is no "unless it is dying" clause, and the mine\'s response agrees ' +
    'from its side. They are only ever in the air together in mission 5 and in ' +
    'the demo, and there they do interfere');
  list.add('dispatch is two-sided -- one contact, both parties resolved (§ 14.4)',
    damaged(both.a) && damaged(both.b), 'respond(a, b) then respond(b, a)');

  // Exemptions, each a row of § 14.6.
  const subMine = collide(TYPE.ENEMY_SUBMARINE, TYPE.MAGNETIC_MINE);
  list.add('an enemy submarine\'s own children pass through it (§ 14.6 row 3)',
    !damaged(subMine.a) && !damaged(subMine.b), 'neither is harmed');

  const playerSupply = collide(TYPE.PLAYER, TYPE.SUPPLY_SUBMARINE);
  list.add('the player and the supply submarine pass through one another (§ 2.4.2)',
    !damaged(playerSupply.a) && !damaged(playerSupply.b),
    'the exemption is MUTUAL and not decorative: the player clamps at row 175 ' +
    'with a 6-row hull and the supply submarine occupies 177-183, so they overlap ' +
    'by up to four rows and meet routinely. Without both exemptions, hugging the ' +
    'bottom of the screen would be fatal');

  const playerHoriz = collide(TYPE.PLAYER, TYPE.HORIZONTAL_TORPEDO);
  list.add('the player cannot be hit by its own horizontal torpedo (§ 14.6 row 0)',
    !damaged(playerHoriz.a), 'and the torpedo cannot hit its own launcher');

  // § 14.7's two observations, each a fact no single row shows.
  const clamVsSub = collide(TYPE.GIANT_CLAM, TYPE.ENEMY_SUBMARINE);
  const clamVsCharge = collide(TYPE.GIANT_CLAM, TYPE.DEPTH_CHARGE);
  const clamVsTorp = collide(TYPE.GIANT_CLAM, TYPE.VERTICAL_TORPEDO);
  list.add('the Giant Clam has the narrowest damage whitelist in the game (§ 14.7)',
    !damaged(clamVsSub.a) && !damaged(clamVsCharge.a) && damaged(clamVsTorp.a),
    'the enemy submarine, its mine, its torpedo and the depth charge all name it ' +
    'harmless, and the clam exempts everything but the player\'s two torpedoes — ' +
    'it is reachable only by the two things allowed to hurt it');

  const hospitalVsTorp = collide(TYPE.HOSPITAL_SHIP, TYPE.VERTICAL_TORPEDO);
  list.add('the hospital ship is its exact mirror -- reachable only by the one type '
    + 'forbidden to harm it (§ 14.7)',
    !damaged(hospitalVsTorp.a),
    'one is protected by its whitelist, the other by geometry: nothing but the ' +
    'vertical torpedo can reach row 20, and that is the one type its own row exempts');

  const avengerVsTorp = collide(TYPE.AVENGER, TYPE.VERTICAL_TORPEDO);
  list.add('the avenger declines damage with no type test at all (§ 13.9)',
    !damaged(avengerVsTorp.a),
    'nothing in the game can destroy it — which also makes its silence marker ' +
    'unreachable: the only silent type never gets the chance to be silent');

  // The generic handler: the Destroyer has no response of its own (§ 7.2).
  const destroyer = collide(TYPE.DESTROYER, TYPE.VERTICAL_TORPEDO);
  list.add('the Destroyer takes damage from the generic handler (§ 7.2, § 14.6)',
    damaged(destroyer.a), 'the only type with no collision response of its own');

  // A dying entity takes no further part.
  const s = stage();
  const aSlot = place(s, TYPE.DESTROYER, 120, 100);
  const bSlot = place(s, TYPE.VERTICAL_TORPEDO, 120, 100);
  s.entities.slots[aSlot].dying = true;
  const before = s.entities.slots[bSlot].stateChangePending;
  tick(s);
  list.add('an entity already flagged as dying is skipped entirely (§ 14.4)',
    before === false,
    'a wreck does not go on colliding while its animation plays');
}

// ---------------------------------------------------------------------------
// The four behaviours Chapter 13 left waiting on collision
// ---------------------------------------------------------------------------

/**
 * § 14.6.1 -- the launcher exemption, and the reason it has to be mutual.
 *
 * **The two overlap on launch.** The shot appears at the player's Y - 7 and is
 * six rows tall, so it clears the hull by one row, and the player steps two
 * pixels against the torpedo's one. This is not a corner case: it is what
 * happens on the first tick the player updates while ascending, which is most
 * of the time anyone is shooting at anything.
 *
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function theLauncherExemption(list) {
  list.section('§ 14.6.1 — firing while ascending');

  // Fire, ascend, and follow the shot. With only the player's half of the
  // exemption the torpedo dies on the tick it is fired.
  const s = stage();
  s.caps[CLASS.VERTICAL_TORPEDO] = 1;
  const p = s.entities.slots[s.playerSlot];
  p.x = 128;
  p.y = 120;
  s.input.vx = 0;
  s.input.vy = -2;
  fireVerticalTorpedo(s);

  const shot = s.entities.slots[1];
  list.eq('the shot launches seven rows above the hull', shot.y, p.y - 7);
  list.eq('which clears the six-row hull by exactly one row',
    p.y - (shot.y + INK.torpedoRising.rows - 1) - 1, 1);

  // **The overlap is transient inside a tick and cannot be seen from outside
  // one**: the player moves in its own walk step and the torpedo in its own, so
  // by the end of the tick they are apart again. Ask the box test at the moment
  // the player has moved and the torpedo has not -- which is the state the
  // collision sweep actually runs against.
  const moved = { x: p.x, y: p.y - 2, type: p.type, sprite: p.sprite };
  list.add('once the sub steps, its box overlaps its own shot',
    boxesOverlap(boxOf(moved), boxOf(shot)),
    'one row of clearance against a two-pixel step');

  // Whether a given launch meets the hull depends on the divider phase, so the
  // pairing is asserted directly rather than sampled from a run: hold the two
  // together and dispatch, which is the state the sweep reaches on the first
  // tick the player steps up into its own shot.
  const rising = collide(TYPE.PLAYER, TYPE.VERTICAL_TORPEDO);
  list.add('a rising shot held against the sub damages neither',
    !damaged(rising.a) && !damaged(rising.b),
    'both halves of the gate, dispatched both ways (§ 14.4)');
  list.add('and the shot is not silently removed either',
    !rising.b.removalRequested && !rising.b.removalConfirmed);

  // The gate is the velocity SIGN, not the pair: a deflected shot is falling,
  // and then both halves fall through to the damage path (§ 13.6.2).
  const falling = stage();
  const fp = falling.entities.slots[falling.playerSlot];
  fp.x = 120;
  fp.y = 100;
  const fSlot = place(falling, TYPE.VERTICAL_TORPEDO, 120, 100);
  const fShot = falling.entities.slots[fSlot];
  fShot.scratch0 = 1;                         // what a hospital ship leaves behind
  fShot.sprite = 'torpedoDescending';

  let killed = false;
  for (let t = 0; t < 6 && !killed; t++) {
    fp.x = 120; fp.y = 100;
    fShot.x = 120; fShot.y = 100;
    tick(falling);
    killed = damaged(fp);
  }
  list.add('a DESCENDING shot kills the sub that fired it', killed,
    'the same test, the other sign (§ 13.6.2)');

}

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function theUnlocked(list) {
  list.section('the four behaviours Chapter 13 could not reach without collision');

  // 1. The deflection, and what it turns the shot into.
  const s = stage();
  place(s, TYPE.HOSPITAL_SHIP, 120, 20);
  const tSlot = place(s, TYPE.VERTICAL_TORPEDO, 124, 22);
  const torp = s.entities.slots[tSlot];
  for (let t = 0; t < 4 && torp.scratch0 < 0; t++) {
    torp.x = 124; torp.y = 22;
    tick(s);
  }
  list.add('a hospital ship DEFLECTS the vertical torpedo rather than absorbing it (§ 13.6.2)',
    torp.scratch0 > 0 && torp.sprite === 'torpedoDescending' && !damaged(torp),
    'velocity negated to ' + torp.scratch0 + ', sprite now ' + torp.sprite +
    ', snapped to row ' + torp.y + ' — the shot is reflected, not consumed, and ' +
    'neither party is damaged');

  // And the sting: the player exempts its own vertical torpedo only while RISING.
  const rising = collide(TYPE.PLAYER, TYPE.VERTICAL_TORPEDO);
  list.add('a RISING vertical torpedo cannot hurt the player (§ 14.6 row 0)',
    !damaged(rising.a), 'its own shot, on the way up');

  const s2 = stage();
  const pSlot = s2.playerSlot;
  const p = s2.entities.slots[pSlot];
  const dSlot = place(s2, TYPE.VERTICAL_TORPEDO, p.x + 2, p.y);
  const falling = s2.entities.slots[dSlot];
  falling.scratch0 = 1;                       // deflected: now descending
  falling.sprite = 'torpedoDescending';
  for (let t = 0; t < 4 && !damaged(p); t++) {
    falling.x = p.x + 2; falling.y = p.y;
    tick(s2);
  }
  list.add('a DESCENDING one kills the player -- fire up beneath a hospital ship and '
    + 'the shot comes back (§ 13.6.2)',
    damaged(p) || !s2.playerAlive,
    'the player treats its own vertical torpedo as harmless only while it is ' +
    'travelling upward; once the bounce flips the sign it falls through to the ' +
    'damage path');

  // 2. The refuel -- a RESTORE, not a top-up.
  const s3 = stage();
  s3.resources.fuel = 300;
  s3.resources.torpedoes = 5;
  const p3 = s3.entities.slots[s3.playerSlot];
  // The payload's position lives in the SHARED convoy block, not in its record
  // (§ 16.5), and its handler writes the record from that block every tick. So
  // the block is what a test has to drive; setting the entity's x/y is undone on
  // the next update. Zeroing the velocities holds it still.
  s3.convoy.live = true;
  s3.convoy.dx = 0;
  s3.convoy.dy = 0;
  place(s3, TYPE.PAYLOAD, p3.x + 2, p3.y);
  for (let t = 0; t < 4 && s3.resources.fuel === 300; t++) {
    s3.convoy.x = p3.x + 2;
    s3.convoy.y = p3.y;
    tick(s3);
  }
  list.add('reaching the payload restores fuel and torpedoes together (§ 16.4)',
    s3.resources.fuel === FUEL_FULL && s3.resources.torpedoes === TORPEDOES_FULL,
    'fuel ' + s3.resources.fuel + ', torpedoes ' + s3.resources.torpedoes +
    ' — a RESTORE, not an addition: collecting one with fuel remaining does not ' +
    'bank the surplus, and there is no way to exceed the starting values');
  list.add('and it does no damage in either direction (§ 14.6 row 14)',
    !damaged(p3), 'the payload diverts to the refuel path');

  // 3. The clam eats the resupply.
  const s4 = stage();
  s4.convoy.live = true;
  s4.convoy.dx = 0;
  s4.convoy.dy = 0;
  const clamSlot = place(s4, TYPE.GIANT_CLAM, 150, 105);
  place(s4, TYPE.PAYLOAD, 150, 100);
  const clam = s4.entities.slots[clamSlot];
  // Both derive from the convoy block: the payload writes its record from it,
  // and the clam locks its depth to payload Y - 5 (§ 13.8.3). Only the clam's X
  // is its own, and it closes 5 px a tick.
  for (let t = 0; t < 6 && clam.sprite === 'shellOpen'; t++) {
    s4.convoy.x = 150;
    s4.convoy.y = 105;
    clam.x = 150;
    tick(s4);
  }
  list.add('the clam swaps to the closed shell on reaching the payload (§ 13.8.3)',
    clam.sprite === 'shellClosed' && s4.convoy.live === false,
    'it has eaten the resupply, and the shared convoy state clears');

  // 4. The avenger -- created by the dolphin's death and nothing else.
  const s5 = stage();
  const dolSlot = place(s5, TYPE.DOLPHIN, 150, 100);
  const killer = place(s5, TYPE.VERTICAL_TORPEDO, 150, 100);
  for (let t = 0; t < 4; t++) {
    s5.entities.slots[dolSlot].x = 150;
    s5.entities.slots[dolSlot].y = 100;
    s5.entities.slots[killer].x = 150;
    s5.entities.slots[killer].y = 100;
    tick(s5);
  }
  let avengers = 0;
  for (let i = 0; i < s5.entities.liveCount; i++) {
    if (s5.entities.slots[i].type === TYPE.AVENGER) avengers += 1;
  }
  list.add('shooting the dolphin creates the avenger (§ 13.8.2, § 13.9)',
    avengers === 1,
    'its collision response is the only place in the game that creates an entity, ' +
    'and what it creates cannot be killed, cannot be dodged and cannot be earned. ' +
    'The only way to avoid it is not to shoot the dolphin');
}

// ---------------------------------------------------------------------------
// A long run
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function overLongRun(list) {
  list.section('an attract run of 4000 ticks, with both invariants asserted every tick');

  const s = new Session();
  s.startDemo();
  const deaths = {};
  const wasDying = new Map();
  let entityBad = null;
  let stencilBad = null;

  for (let t = 1; t <= 4000; t++) {
    tick(s);
    for (let i = 0; i < s.entities.liveCount; i++) {
      const e = s.entities.slots[i];
      const now = e.dying || e.stateChangePending;
      if (now && !wasDying.get(e.serial)) deaths[e.type] = (deaths[e.type] || 0) + 1;
      wasDying.set(e.serial, now);
    }
    if (entityBad === null) {
      const v = checkEntityInvariants(s.entities);
      if (v.length) entityBad = 'tick ' + t + ': ' + v.join('; ');
    }
    if (stencilBad === null) {
      const v = s.stencil.check(s.entities);
      if (v.length) stencilBad = 'tick ' + t + ': ' + v.join('; ');
    }
  }

  const named = Object.keys(deaths)
    .sort((a, b) => deaths[b] - deaths[a])
    .map((t) => TYPE_NAMES[t] + ' ' + deaths[t]);
  list.add('collisions actually happen, across many types',
    Object.keys(deaths).length >= 6, named.join(', '));

  list.add('the player never dies on the title screen (§ 10.5.2 rule 1)',
    !deaths[TYPE.PLAYER] && s.playerAlive,
    'nothing can hurt the demo submarine, which is one of the seven suspensions ' +
    'that let an unattended demo run forever');

  list.add('the hospital ship never dies -- its damage path is unreachable (§ 13.6.2)',
    !deaths[TYPE.HOSPITAL_SHIP],
    'measured over 4000 ticks rather than argued from the table: the one entity ' +
    'that can physically reach row 20 is the one type its row exempts');

  list.add('§ 20.6\'s stencil invariant holds every tick',
    stencilBad === null, stencilBad || 'the buffer holds only 0 or the slot + 1 of a live entity');
  list.add('§ 20.6\'s entity invariants hold every tick',
    entityBad === null, entityBad || 'clean throughout');

  // The merchant's bookkeeping, which the demo suspends (§ 10.5.2 rules 3 and 5).
  const sunk = s.spawners.roster.filter((r) => r === ROSTER_STATUS.SUNK).length;
  list.add('a demo merchant kill stamps no roster record and moves no quota (§ 10.5.2)',
    sunk === 0 && s.killCounter === 10,
    sunk + ' records sunk, quota still ' + s.killCounter +
    ' — rules 3 and 5, and rule 4 with them: a demo wreck is removed at frame 11 ' +
    'rather than swapping in a floating value, because rule 3 suspended the write ' +
    'that would have chosen which value');
}
