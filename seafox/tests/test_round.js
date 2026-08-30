// seafox/tests/test_round.js
//
// The round lifecycle -- design_spec Chapter 11 -- and Chapter 16's resources,
// which its middle exit condition depends on.
//
// **This is the first page that runs a mission at all.** Everything before it
// exercised the attract demo, where § 10.5.2 suspends scoring, the fuel burn,
// the quota and the floating score -- so several chapters' worth of call sites
// fire here for the first time.
//
// The sharpest thing in the chapter, and the one this page is really for:
// § 11.2 tests three guards in a fixed order and § 11.3 re-tests them in the
// SAME order, so **meeting the quota on the same tick the tanks empty is a
// loss.** Guard 3 ends the round; the outro reaches fuel first. The mission is
// not cleared and the submarine is spent.

import { mount } from './harness.js';
import { Session } from '../src/core/session.js';
import { tick } from '../src/core/tick.js';
import { checkSessionInvariants } from '../src/core/invariants.js';
import {
  newGame, nextMission, beginOutro, PHASE, HOLD_TICKS, DRAIN_PASSES, DRAIN_PASS_TICKS,
} from '../src/core/round.js';
import {
  Resources, scoreFor, toBcd, fromBcd, bcdIsValid, MISSION_SCORED,
  FUEL_FULL, FUEL_BURN, FUEL_BURN_UPDATES, TORPEDOES_FULL,
} from '../src/core/resources.js';
import { STRIP } from '../src/core/messages.js';
import { ROSTER_STATUS } from '../src/core/spawners.js';
import { PLAYER_BOUNDS } from '../src/core/player.js';
import { TYPE } from '../src/core/types.js';
import { START_KEY } from '../src/core/input.js';

mount('design_spec Chapter 11 — the round lifecycle, with Chapter 16', run);

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function run(list) {
  setup(list);
  guards(list);
  banners(list);
  exitAndDrain(list);
  outro(list);
  drain(list);
  resources(list);
  wholeGame(list);
}

/**
 * A session mid-mission, with the spawners held off so nothing interferes.
 * @param {number} [mission]
 * @returns {Session}
 */
function inPlay(mission = 1) {
  const s = new Session();
  s.startDemo();
  newGame(s);
  s.mission = mission;
  s.applyRung();
  for (const k of Object.keys(s.spawners.cooldowns)) s.spawners.cooldowns[k] = 999999;
  s.caps.verticalTorpedo = 0;
  s.caps.horizontalTorpedo = 0;
  // Run out the launch sequence so play is actually running.
  let guard = 0;
  while (s.phase !== PHASE.PLAY && guard++ < 400) tick(s);
  s.entities.reset();
  s.effects.reset();
  s.stencil.clear();
  return s;
}

// ---------------------------------------------------------------------------
// § 11.1 -- setup
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function setup(list) {
  list.section('§ 11.1 — the two setup paths, and the three holds');

  // **The one spawner cooldown anything ever resets** (§ 11.1.1, § 12.3), and the
  // two paths differ: the fresh-submarine launch reloads it to a full 1000, the
  // mission-cleared fly-in does not. So a new submarine always gets the whole
  // interval before its first resupply, while a cleared mission inherits
  // whatever the counter was left at and the next one can arrive at once.
  {
    const sc = new Session();
    sc.startDemo();
    newGame(sc);
    sc.spawners.cooldowns.supplySubmarine = 7;     // nearly due
    for (let t = 0; t < 200 && sc.phase !== PHASE.PLAY; t++) tick(sc);
    list.eq('the fresh-submarine path reloads the supply countdown (§ 11.1.1)',
      sc.spawners.cooldowns.supplySubmarine, 1000,
      (v) => v + ' — the only spawner cooldown the game ever resets');

    const sf = new Session();
    sf.startDemo();
    newGame(sf);
    for (let t = 0; t < 200 && sf.phase !== PHASE.PLAY; t++) tick(sf);
    sf.spawners.cooldowns.supplySubmarine = 7;
    sf.killCounter = 0;
    nextMission(sf);                               // the fly-in path
    list.eq('...and the mission-cleared fly-in does NOT (§ 11.1.2)',
      sf.spawners.cooldowns.supplySubmarine, 7,
      (v) => v + ' — a cleared mission inherits it, so the next resupply can ' +
        'arrive almost at once. The asymmetry is normative');
  }

  const s = new Session();
  s.startDemo();
  newGame(s);

  list.eq('starting a game is a single increment out of attract mode (§ 10.1)',
    s.mission, 1);
  list.add('setup posts the MISSION banner (§ 11.1)',
    s.messages.isPosted(STRIP.MISSION),
    'from a five-entry table — that table having five entries is why the mission ' +
    'counter stops at 5');
  list.eq('a fresh submarine takes the icon path', s.phase, PHASE.SETUP_ICONS);
  list.eq('spareSubs starts at 3 and has not yet been spent', s.spareSubs, 3);

  // Hold one, then hold two, then play.
  const transitions = [];
  let last = s.phase;
  for (let t = 1; t <= 200; t++) {
    tick(s);
    if (s.phase !== last) { transitions.push({ tick: t, phase: s.phase }); last = s.phase; }
    if (s.phase === PHASE.PLAY) break;
  }
  list.add('the launch holds TWICE, ' + HOLD_TICKS + ' ticks each (§ 11.1)',
    transitions.length === 2 &&
    transitions[0].tick === HOLD_TICKS && transitions[1].tick === HOLD_TICKS * 2,
    transitions.map((x) => x.phase + '@' + x.tick).join(', ') +
    ' — § 11.1.1\'s numbered steps show only the second; its own prose says the ' +
    'launch holds twice, and the disassembly puts the first at $6BF6, before the ' +
    'icon is lifted off the rack');

  list.eq('spareSubs is decremented AT LAUNCH, not on death (§ 11.1.1)',
    s.spareSubs, 2);
  const p = s.entities.slots[s.playerSlot];
  list.add('the player spawns at (100, 100)',
    p.x === 100 && p.y === 100, '(' + p.x + ', ' + p.y + ')');
  list.add('and the round is live with the three flags cleared (§ 11.1)',
    s.roundLive && !s.replayMission && !s.gameOver && !s.ranDry, 'all four set correctly');

  // The other path: mission cleared.
  const s2 = new Session();
  s2.startDemo();
  newGame(s2);
  s2.replayMission = false;
  s2.mission = 1;
  // **Spend the gauges only once the first submarine is actually flying.** Its
  // launch takes the fresh-submarine path, which fills both gauges (§ 11.1.1
  // step 5) -- so setting them beforehand measures nothing, and a version of
  // this test that did so passed only while that refill was missing.
  let guard = 0;
  while (s2.phase !== PHASE.PLAY && guard++ < 2000) tick(s2);
  s2.resources.fuel = 600;
  s2.resources.torpedoes = 7;
  s2.killCounter = 0;                     // clear it, to take the advance path
  // Drive it round to the next mission's setup.
  while (s2.phase === PHASE.PLAY && guard++ < 2000) tick(s2);
  while (s2.phase === PHASE.DRAIN && guard++ < 2000) tick(s2);
  list.eq('clearing a mission takes the FLY-IN path, not the icon path (§ 11.1.2)',
    s2.phase === PHASE.FLY_IN || s2.phase === PHASE.FLY_IN_HOLD ||
      s2.phase === PHASE.PLAY ? 'fly-in' : s2.phase, 'fly-in');
  list.add('fuel and torpedoes carry over untouched -- no HUD rebuild (§ 11.1.2)',
    s2.resources.fuel === 600 && s2.resources.torpedoes === 7,
    'fuel ' + s2.resources.fuel + ', torpedoes ' + s2.resources.torpedoes);
  list.eq('and no submarine is spent for it', s2.spareSubs, 2);

  // The fly-in is live simulation, not a hold.
  const s3 = new Session();
  s3.startDemo();
  newGame(s3);
  s3.replayMission = false;
  s3.mission = 1;
  s3.killCounter = 0;
  guard = 0;
  while (s3.phase !== PHASE.FLY_IN && guard++ < 3000) tick(s3);
  const flyStart = s3.entities.slots[s3.playerSlot];
  const startX = flyStart.x;
  list.add('the player spawns OFF-SCREEN LEFT with the left clamp opened to 0 (§ 11.1.2)',
    startX === 0 && s3.playerBounds.minX === 0,
    'x=' + startX + ', minX=' + s3.playerBounds.minX);
  const before = s3.tick;
  while (s3.phase === PHASE.FLY_IN && guard++ < 3000) tick(s3);
  list.add('and swims in under its own steam -- live simulation, not a hold (§ 11.1.2)',
    s3.entities.slots[s3.playerSlot].x >= 100 && s3.tick - before > 40,
    'reached x=' + s3.entities.slots[s3.playerSlot].x + ' over ' + (s3.tick - before) +
    ' ticks of ordinary simulation');
  while (s3.phase === PHASE.FLY_IN_HOLD && guard++ < 3000) tick(s3);
  list.eq('the left clamp is restored afterwards (§ 11.1.2 step 4)',
    s3.playerBounds.minX, PLAYER_BOUNDS.minX);
}

// ---------------------------------------------------------------------------
// § 11.2 -- the guards
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function guards(list) {
  list.section('§ 11.2 — three guards, and their order is normative');

  const dead = inPlay();
  dead.playerAlive = false;
  tick(dead);
  list.add('guard 1: the player\'s alive flag ends the round',
    dead.phase === PHASE.DRAIN && dead.replayMission,
    'nothing that kills the player writes that flag directly — a lethal contact ' +
    'raises an ordinary removal request and the player\'s OWN handler clears it ' +
    'on its next update, so death reaches this guard one tick after the hit');

  const dry = inPlay();
  dry.resources.fuel = 0;
  tick(dry);
  list.add('guard 2: empty tanks end the round',
    dry.phase === PHASE.DRAIN && dry.ranDry, 'ranDry set');

  const done = inPlay();
  done.killCounter = 0;
  tick(done);
  list.add('guard 3: an emptied quota ends the round',
    done.phase === PHASE.DRAIN && !done.replayMission,
    'mission complete — not a life lost');
}

// ---------------------------------------------------------------------------
// § 11.3 -- the outro
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function banners(list) {
  list.section('§ 19.10.3 — one banner at a time, across missions and across games');

  const s = new Session();
  s.startDemo();
  let pending = null;
  s.keys = { read: () => { const k = pending; pending = null; return k; } };

  const shown = () => s.messages.stack.map((m) => m.strip).join(' + ');
  let maxDepth = 0;
  const banners = [];
  let lastMission = -1;

  for (let t = 1; t <= 3000; t++) {
    pending = (s.isTitleScreen && t >= 60) ? START_KEY : null;
    tick(s);
    if (s.phase === PHASE.PLAY) s.killCounter = 0;      // clear each mission at once
    maxDepth = Math.max(maxDepth, s.messages.stack.length);
    if (s.phase === PHASE.PLAY && s.mission !== lastMission) {
      banners.push(shown());
      lastMission = s.mission;
    }
  }

  // **The defect this pins.** The stack gets two posts per cleared round -- the
  // MISSION banner at setup and MISSION COMPLETE at the outro -- so it needs two
  // removals. With only one, the next setup pops MISSION COMPLETE, leaves the
  // old banner in place and posts the new one on top: MISSION ONE and MISSION
  // TWO drawn over each other on the same seven rows, one more every mission.
  list.eq('exactly one MISSION banner is posted while a round is being played',
    banners.every((b) => b === STRIP.MISSION) ? 'always one' : banners.join(' | '),
    'always one');

  // Two is correct and is the ceiling: the winning frame carries MISSION and
  // MISSION COMPLETE together (§ 19.10.3), and nothing else ever stacks.
  list.eq('the stack never grows past two, over ' + banners.length + ' rounds and several games',
    maxDepth, 2,
    (v) => v + ' — MISSION plus MISSION COMPLETE on the winning frame, and ' +
      'never a third');

  // And the title screen is a rebuilt screen: nothing posted outlives a game.
  while (!s.isTitleScreen) tick(s);
  list.eq('returning to the title leaves nothing posted',
    s.messages.stack.length, 0,
    (v) => v + ' — otherwise a MISSION banner outlives its game and is drawn ' +
      'over the demo, one more each time a game ends');
}

function exitAndDrain(list) {
  list.section('§ 11.3, § 11.4 — the player leaves, and the drain can then end early');

  const s = new Session();
  s.startDemo();
  newGame(s);
  for (let t = 0; t < 400 && s.phase !== PHASE.PLAY; t++) tick(s);

  const player = () => {
    for (let i = 0; i < s.entities.liveCount; i++) {
      if (s.entities.slots[i].type === TYPE.PLAYER) return s.entities.slots[i];
    }
    return null;
  };

  s.killCounter = 0;                          // clear the mission -> outro
  let n = 0;
  while (s.phase === PHASE.PLAY && n < 3000) { tick(s); n += 1; }
  list.add('the outro opens the right clamp off-screen and clears roundLive (§ 11.3)',
    s.playerBounds.maxX === 306 && !s.roundLive,
    'maxX ' + s.playerBounds.maxX);

  // **The right clamp is where the player LEAVES** (§ 13.11), and it fires only
  // because roundLive is now false. Without it the submarine drives to the
  // opened clamp and parks there, visible, for the whole drain.
  let removedAt = null;
  let m = 0;
  while (s.phase === PHASE.DRAIN && m < 1000) {
    tick(s); m += 1;
    if (!player() && removedAt === null) removedAt = m;
  }
  list.add('the submarine reaches the opened clamp and is removed there (§ 11.3)',
    removedAt !== null, removedAt === null
      ? 'it never left — it parked at the clamp instead'
      : 'gone at drain tick ' + removedAt);

  // **And that is what lets § 11.4 stop early.** The drain runs the FRAME only:
  // no spawners, so nothing refills the list and both lists reach empty.
  list.add('so the drain ends when the screen clears, not on its 20-pass cap (§ 11.4)',
    s.drainPass < DRAIN_PASSES,
    'ended on pass ' + s.drainPass + ' of ' + DRAIN_PASSES + ' — with spawners ' +
    'running during the drain, something new arrives every few ticks and the ' +
    'early exit is unreachable');
}

function outro(list) {
  list.section('§ 11.3 — the outro, and the loss hiding in the guard order');

  const s = inPlay();
  s.killCounter = 0;
  beginOutro(s);
  list.add('the exit is set up UNCONDITIONALLY, before any classification (§ 11.3)',
    s.input.vx === 4 && s.input.vy === 0 &&
    s.playerBounds.maxX === 306 && s.roundLive === false,
    'velocity 4 — double normal, so the exit is visibly brisk — level flight, ' +
    'the right clamp opened off-screen so the player drives off rather than ' +
    'stopping at the edge, and roundLive cleared, which is what lets the ' +
    'player\'s handler flag itself for removal and makes it invulnerable meanwhile');

  // **The check this page exists for.**
  const both = inPlay();
  both.killCounter = 0;
  both.resources.fuel = 0;
  beginOutro(both);
  list.add('meeting the quota on the same tick the tanks empty is a LOSS (§ 11.3)',
    both.ranDry && both.replayMission && both.input.vy === 2,
    'guard 3 ended the round, but the outro tests FUEL first — so the mission is ' +
    'not cleared and the submarine is spent. The only thing distinguishing it on ' +
    'screen is the descent: vy becomes +2, so the submarine sinks as it drifts off');

  const complete = inPlay(2);
  complete.killCounter = 0;
  beginOutro(complete);
  list.add('a clean mission-complete posts its banner and costs nothing',
    complete.messages.isPosted(STRIP.MISSION_COMPLETE) && !complete.replayMission &&
    !complete.gameOver && complete.spareSubs === 2,
    'and it is not game over, because this was not mission 5');

  const last = inPlay(5);
  last.killCounter = 0;
  beginOutro(last);
  list.add('clearing MISSION 5 sets gameOver -- there is no victory screen (§ 11.6)',
    last.gameOver && last.messages.isPosted(STRIP.MISSION_COMPLETE),
    'it takes the SAME mission-complete path as clearing any other mission, and ' +
    'then the game is over');

  const lastSub = inPlay();
  lastSub.spareSubs = 0;
  lastSub.playerAlive = false;
  beginOutro(lastSub);
  list.add('a life lost with no spare submarines is game over (§ 11.3)',
    lastSub.gameOver && lastSub.replayMission, 'there are no extra lives, ever');

  const ranOut = inPlay();
  ranOut.resources.torpedoes = 0;
  tick(ranOut);
  list.add('running out of TORPEDOES does not end the round (§ 16.3)',
    ranOut.phase === PHASE.PLAY,
    'a player with no torpedoes and fuel remaining can still reach a resupply');
}

// ---------------------------------------------------------------------------
// § 11.4, § 11.6 -- the drain and the ending
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function drain(list) {
  list.section('§ 11.4, § 11.6 — the drain, and an ending with two banners');

  // With nothing on screen the drain stops after its first pass.
  const empty = inPlay();
  empty.killCounter = 0;
  beginOutro(empty);
  empty.entities.reset();
  empty.effects.reset();
  const startTick = empty.tick;
  let guard = 0;
  while (empty.phase === PHASE.DRAIN && guard++ < 400) tick(empty);
  list.add('the drain stops early once both lists are empty (§ 11.4)',
    empty.tick - startTick <= DRAIN_PASS_TICKS + 2,
    'ended after ' + (empty.tick - startTick) + ' ticks — it does not sit out its ' +
    'full twenty passes when there is nothing left to finish');

  // A drain that never empties runs its full cap and no further.
  const busy = inPlay();
  busy.killCounter = 0;
  beginOutro(busy);
  for (const k of Object.keys(busy.spawners.cooldowns)) busy.spawners.cooldowns[k] = 0;
  const busyStart = busy.tick;
  guard = 0;
  while (busy.phase === PHASE.DRAIN && guard++ < 600) tick(busy);
  const ran = busy.tick - busyStart;
  list.add('and is capped at ' + DRAIN_PASSES + ' passes of ' + DRAIN_PASS_TICKS +
    ' ticks (§ 11.4)',
    ran <= DRAIN_PASSES * DRAIN_PASS_TICKS + 2,
    ran + ' ticks, against a cap of ' + (DRAIN_PASSES * DRAIN_PASS_TICKS) +
    ' — ordinary simulation with no input polled, which is what lets the ' +
    'submarine be driven off the screen while the player watches');

  // § 11.6: the winning frame carries BOTH banners.
  const win = inPlay(5);
  win.killCounter = 0;
  beginOutro(win);
  tick(win);
  list.add('**the winning frame carries MISSION COMPLETE and GAME OVER at once** (§ 11.6)',
    win.messages.isPosted(STRIP.MISSION_COMPLETE) && win.messages.isPosted(STRIP.GAME_OVER),
    'the same GAME OVER banner, from the same code, that greets a player who has ' +
    'just lost their last submarine. Nothing else distinguishes winning from ' +
    'losing — same drain, same erase, same return to the title screen');

  const dryEnd = inPlay();
  dryEnd.resources.fuel = 0;
  dryEnd.spareSubs = 0;
  beginOutro(dryEnd);
  tick(dryEnd);
  list.add('OUT OF FUEL and GAME OVER can both be posted, on different rows (§ 19.10.2)',
    dryEnd.messages.isPosted(STRIP.OUT_OF_FUEL) && dryEnd.messages.isPosted(STRIP.GAME_OVER),
    'rows 105-111 and 90-96');

  // And both are erased unconditionally at the end.
  guard = 0;
  while (dryEnd.phase === PHASE.DRAIN && guard++ < 600) tick(dryEnd);
  list.add('both direct banners are erased UNCONDITIONALLY at the end of the drain',
    !dryEnd.messages.isPosted(STRIP.OUT_OF_FUEL) && !dryEnd.messages.isPosted(STRIP.GAME_OVER),
    'whether they were ever shown or not — they bypass the stack, so nothing on ' +
    'it represents them and nothing else would remove them');

  // The message stack alternates a strip's palette on every post.
  const s = new Session();
  const a = s.messages.post(STRIP.MISSION);
  const b = s.messages.post(STRIP.MISSION);
  list.add('a stack-posted strip alternates colour every time it is shown (§ 19.10.1)',
    a !== b,
    'the flip is written back into the strip itself, so the MISSION banner is a ' +
    'different colour every round');
}

// ---------------------------------------------------------------------------
// Chapter 16
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function resources(list) {
  list.section('Chapter 16 — score, fuel and one shared magazine');

  // **§ 11.1.1 step 5: a fresh submarine gets FULL gauges, and running dry is
  // the case that proves it.** Without the refill a submarine inherits what the
  // last one died with, so emptying the tanks launches the next one at zero
  // fuel, which empties on its first burn and takes every remaining spare with
  // it. The bug is invisible until a submarine is actually lost, which is why
  // this drives a whole loss rather than calling the setup path directly.
  {
    const sd = new Session();
    sd.startDemo();
    newGame(sd);
    for (let t = 0; t < 400 && sd.phase !== PHASE.PLAY; t++) tick(sd);
    const spares = sd.spareSubs;

    sd.resources.torpedoes = 7;                    // spend some, visibly
    sd.resources.fuel = 10;                        // and run the tanks down
    let n = 0;
    while (sd.phase === PHASE.PLAY && n < 3000) { tick(sd); n += 1; }
    list.add('emptying the tanks ends the round and costs a submarine (§ 16.2)',
      sd.ranDry && sd.phase !== PHASE.PLAY, 'phase ' + sd.phase);

    let m = 0;
    while (sd.phase !== PHASE.PLAY && m < 4000) { tick(sd); m += 1; }
    list.eq('and the NEXT submarine launches with a full tank (§ 11.1.1 step 5)',
      sd.resources.fuel, FUEL_FULL,
      (v) => v + ' — inheriting the dead one\'s gauges cascades: it would empty ' +
        'on its first burn and take every remaining spare down with it');
    list.eq('...and a full magazine, because step 5 fills BOTH gauges',
      sd.resources.torpedoes, TORPEDOES_FULL);
    list.eq('one spare was spent getting there', sd.spareSubs, spares - 1);
  }

  // The $99 sentinel only means anything in decimal.
  list.eq('an ordinary merchant scores (m + 1) x 100 (§ 7.3.1)',
    [1, 2, 3, 4, 5].map((m) => scoreFor(MISSION_SCORED, m, false)).join(', '),
    '200, 300, 400, 500, 600');
  list.eq('the merchant that empties the quota scores (m + 1) x 1000',
    [1, 2, 3, 4, 5].map((m) => scoreFor(MISSION_SCORED, m, true)).join(', '),
    '2000, 3000, 4000, 5000, 6000');
  list.add('so the tenth merchant of a mission is worth more than the other nine together',
    scoreFor(MISSION_SCORED, 1, true) > 9 * scoreFor(MISSION_SCORED, 1, false),
    '2000 against 9 x 200 = 1800');
  list.add('a type with an ordinary score is untouched by the rule',
    scoreFor(150, 3, true) === 150, 'the Destroyer is 150 whatever the mission');

  list.add('$99 is a SENTINEL, not a value -- and only decimal makes it one (§ 7.3)',
    MISSION_SCORED === 0x99 && scoreFor(0x99, 1, false) === 200,
    'in binary it would be an ordinary 153 points and the merchant rule would ' +
    'never fire, which is why § 1.3 makes decimal semantics normative');

  // BCD, and § 20.6's nibble invariant.
  const bcd = toBcd(123456, 3);
  list.add('score is three bytes of BCD, six digits (§ 16.1)',
    fromBcd(bcd) === 123456 && bcdIsValid(bcd),
    '123456 -> ' + bcd.map((b) => b.toString(16).padStart(2, '0')).join(' ') +
    ', every nibble 0-9 as § 20.6 requires');

  // Fuel: the divider trap.
  const r = new Resources();
  list.eq('a full tank is ' + FUEL_FULL, r.fuel, FUEL_FULL);
  for (let i = 0; i < FUEL_BURN_UPDATES; i++) r.burn();
  list.eq('one burn of ' + FUEL_BURN + ' costs ' + FUEL_BURN_UPDATES + ' PLAYER UPDATES',
    r.fuel, FUEL_FULL - FUEL_BURN);

  const r2 = new Resources();
  let updates = 0;
  while (!r2.dry && updates < 5000) { r2.burn(); updates += 1; }
  list.add('endurance is 2160 TICKS, not 1080 (§ 16.2, § 20.7)',
    updates * 2 === 2160,
    updates + ' player updates x 2 ticks each = ' + (updates * 2) +
    ' — the burn interval is 9 UPDATES and the player\'s period is 2, so reading ' +
    'the interval as ticks halves the endurance. § 20.7 lists the halving as the ' +
    'signature of getting it wrong');

  // The magazine, shared.
  const r3 = new Resources();
  list.eq('one magazine of ' + TORPEDOES_FULL + ', shared by both weapons (§ 16.3)',
    r3.torpedoes, TORPEDOES_FULL);
  for (let i = 0; i < TORPEDOES_FULL; i++) r3.spendTorpedo();
  list.add('and firing on empty is refused rather than going negative',
    r3.spendTorpedo() === false && r3.torpedoes === 0, 'a distinct sound and no shot');

  // The resupply RESTORES.
  const r4 = new Resources();
  r4.fuel = 900;
  r4.torpedoes = 4;
  r4.refill();
  list.add('a resupply RESTORES rather than adds (§ 16.4)',
    r4.fuel === FUEL_FULL && r4.torpedoes === TORPEDOES_FULL,
    'collecting one with fuel remaining does not bank the surplus, and there is ' +
    'no way to exceed the starting values');

  // The high score is committed on ENTRY TO THE TITLE SCREEN.
  const s = new Session();
  s.startDemo();
  newGame(s);
  s.resources.score = 4200;
  list.eq('the high score is NOT committed when the game ends', s.resources.highScore, 0);
  s.startDemo();
  list.add('it is committed on entry to the title screen (§ 16.1)',
    s.resources.highScore === 4200,
    'so a player watching the end-of-game drain is still looking at the previous ' +
    'record; theirs appears as the title screen comes up');

  // Score is zeroed per GAME, not per mission.
  const s2 = new Session();
  s2.startDemo();
  newGame(s2);
  s2.resources.score = 1500;
  s2.mission = 1;
  s2.killCounter = 0;
  let guard = 0;
  while (s2.mission === 1 && guard++ < 3000) tick(s2);
  list.add('score carries across missions, and is zeroed only by a new game (§ 16.1)',
    s2.resources.score >= 1500, 'still ' + s2.resources.score + ' in mission ' + s2.mission);
}

// ---------------------------------------------------------------------------
// A whole game
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function wholeGame(list) {
  list.section('a whole game, played headless');

  const s = new Session();
  s.startDemo();
  newGame(s);
  let bad = null;
  let maxSpare = s.spareSubs;
  let ticks = 0;
  while (!s.isTitleScreen && ticks < 60000) {
    tick(s);
    ticks += 1;
    maxSpare = Math.max(maxSpare, s.spareSubs);
    if (bad === null) {
      const v = checkSessionInvariants(s);
      if (v.length) bad = 'tick ' + ticks + ': ' + v.join('; ');
    }
  }
  list.add('a game played with no input terminates and returns to the title screen',
    s.isTitleScreen && ticks < 60000,
    'over ' + ticks + ' ticks — the submarine sits still and is eventually killed ' +
    'three times, which is the only way a passive game can end');
  list.eq('spareSubs never rose: there are no extra lives, ever (§ 10.3)',
    maxSpare, 3);
  list.add('the invariants held throughout',
    bad === null, bad || 'clean');
  list.add('the high score was committed as the title screen came up',
    s.resources.highScore === s.resources.score,
    'high ' + s.resources.highScore);

  // The Ch.13 consequence that only becomes observable now.
  const s2 = inPlay();
  s2.spawners.roster.fill(ROSTER_STATUS.IN_FLIGHT);
  s2.spawners.cooldowns.merchant = 0;
  for (let t = 0; t < 400; t++) tick(s2);
  list.add('an escaped merchant makes the quota unreachable -- § 12.5 has no way back',
    s2.killCounter === 10 &&
    s2.spawners.roster.every((r) => r !== ROSTER_STATUS.AVAILABLE),
    'status goes available -> in-flight at spawn -> sunk by the collision ' +
    'response, and back to available only at the start of a mission. With a ' +
    'quota of ten against a roster of ten, every escape costs a mission. Found ' +
    'while porting Chapter 13; only testable now that a mission runs');
}
