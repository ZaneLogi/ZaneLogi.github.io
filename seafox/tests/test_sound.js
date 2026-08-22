// seafox/tests/test_sound.js
//
// Chapter 18 -- the sound queue and every call site that feeds it.
//
// **Nothing here listens.** § 18.10 leaves the synthesis path free, so the tone
// is not testable and is not tested; what is normative is the pitch arithmetic,
// the eighteen sequences, one pair per tick, the queue, and § 18.6's
// assignments. All of those are ordinary state.
//
// The queue is where this chapter's surprises live, and both of them come from
// the same place -- a 256-byte ring with byte cursors and no bounds test:
//
//   * a new sound is appended at the WRITE cursor and never pre-empts, so the
//     audio lags the picture and a multi-kill tick banks seconds of backlog;
//   * a write cursor that laps the read cursor either overwrites unplayed pairs
//     in place, turning one sequence into another partway through, or lands
//     exactly on it and the whole backlog reads as empty.
//
// The call-site half exists because § 18.6's assignments are easy to break from
// a distance: nine of them are not events at all but the sound field of a type's
// definition row, so a change to Chapter 7's table silently re-sounds the game.

import { mount } from './harness.js';
import { Session } from '../src/core/session.js';
import { tick } from '../src/core/tick.js';
import {
  SEQUENCES, SOUND, OUTPUT, SoundQueue, QUEUE_PAIRS, CPU_HZ,
  playSound, advanceSound, outputFor, createSoundState,
  halfPeriodCycles, frequencyHz, burstSeconds,
} from '../src/core/sound.js';
import { TYPE } from '../src/core/types.js';
import { DEFINITIONS, SILENT, beginDeath } from '../src/core/definitions.js';
import { fireVerticalTorpedo, fireHorizontalTorpedo } from '../src/core/weapons.js';
import { updateDepthCharge } from '../src/core/depthcharge.js';
import { respond } from '../src/core/responses.js';
import { newGame, advanceRound, checkRoundGuards, PHASE } from '../src/core/round.js';
import { spawnPlayer } from '../src/core/player.js';

mount('design_spec Chapter 18 — the queue and its call sites', run);

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function run(list) {
  arithmetic(list);
  sequences(list);
  drain(list);
  queueDiscipline(list);
  overflow(list);
  silences(list);
  deathSounds(list);
  eventSounds(list);
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * A session that is in a mission, so § 18.8 does not suppress playback.
 * @param {number} [mission]
 * @returns {Session}
 */
function inMission(mission = 1) {
  const s = new Session();
  s.mission = mission;
  s.applyRung();
  return s;
}

/**
 * Record which sequences get queued, in order, without changing behaviour.
 * @param {Session} s
 * @returns {number[]} appended to as sounds are queued
 */
function watch(s) {
  const q = s.sound.queue;
  const log = [];
  const push = q.push.bind(q);
  q.push = (index) => { log.push(index); return push(index); };
  return log;
}

/**
 * Allocate an entity, positioned and past its first update.
 * @param {Session} s
 * @param {number} type
 * @param {number} x
 * @param {number} y
 * @returns {number} the slot
 */
function place(s, type, x, y) {
  const slot = s.entities.alloc(type);
  const e = s.entities.slots[slot];
  e.x = x;
  e.y = y;
  e.firstUpdate = false;
  return slot;
}

// ---------------------------------------------------------------------------
// § 18.2 -- pitch, frequency, burst length
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function arithmetic(list) {
  list.section('§ 18.2 — one formula, and pitch runs backwards');

  list.eq('half-period is 5 x pitch + 24 cycles', halfPeriodCycles(200), 1024);

  // § 18.2's own table. **Pitch is INVERSE to frequency** -- a larger value is a
  // lower note -- which is the one thing about this chapter that reads wrong at
  // a glance and stays wrong if it is ever "fixed".
  for (const [pitch, hz] of [[8, 7972], [15, 5154], [100, 974], [200, 498], [250, 401]]) {
    list.add('pitch ' + pitch + ' sounds ' + hz + ' Hz (§ 18.2)',
      Math.abs(frequencyHz(pitch) - hz) < 1,
      frequencyHz(pitch).toFixed(1) + ' Hz');
  }
  list.add('a larger pitch is a LOWER note',
    frequencyHz(250) < frequencyHz(8),
    '250 -> ' + frequencyHz(250).toFixed(0) + ' Hz, 8 -> ' + frequencyHz(8).toFixed(0) + ' Hz');

  // duration counts HALF-PERIODS, not milliseconds, so one duration byte is a
  // different length at every pitch.
  list.add('duration counts half-periods, so its length varies with pitch',
    burstSeconds(250, 4) > burstSeconds(8, 4),
    '(250,4) is ' + (burstSeconds(250, 4) * 1000).toFixed(2) + ' ms, ' +
    '(8,4) is ' + (burstSeconds(8, 4) * 1000).toFixed(2) + ' ms');
  list.eq('and it is exactly duration x half-period / CPU',
    burstSeconds(200, 4), 4 * 1024 / CPU_HZ);

  // § 18.3's prose says the longest burst is 40 ms. It is 19.4 -- sequence 17,
  // 200 half-periods of 99 cycles. Recorded as a check so the real figure has a
  // home; nothing in the port depends on the number.
  let longest = 0;
  let longestAt = '';
  SEQUENCES.forEach((seq, i) => seq.forEach(([p, d]) => {
    const ms = burstSeconds(p, d) * 1000;
    if (ms > longest) { longest = ms; longestAt = 'seq ' + i + ', ' + p + ',' + d; }
  }));
  list.add('the longest burst in the game is 19.4 ms, not § 18.3\'s stated 40',
    Math.abs(longest - 19.4) < 0.1,
    longest.toFixed(2) + ' ms at ' + longestAt + ' — spec errata, prose only');
}

// ---------------------------------------------------------------------------
// § 18.5, § 18.7 -- the data
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function sequences(list) {
  list.section('§ 18.5 — the eighteen sequences, and § 18.7\'s family resemblances');

  list.eq('eighteen sequences', SEQUENCES.length, 18);
  list.add('every pair is a byte pair, and no pitch is the terminator',
    SEQUENCES.every((s) => s.length > 0 && s.every(([p, d]) =>
      p > 0 && p < 256 && d > 0 && d < 256)),
    'a pitch of zero terminates a sequence, so it cannot appear inside one');

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // § 18.7 is a transcription check dressed as trivia: these relationships hold
  // in the ROM, so a mistyped byte breaks one of them.
  list.add('14 and 16 are ONE sequence, shared rather than duplicated',
    same(SEQUENCES[14], SEQUENCES[16]));
  list.add('0 and 8 are exact inverses -- the same four pairs reversed',
    same(SEQUENCES[0], [...SEQUENCES[8]].reverse()));
  list.add('9 is 0 with the durations doubled -- the refuel note IS the splash, drawn out',
    same(SEQUENCES[9], SEQUENCES[0].map(([p, d]) => [p, d * 2])));
  list.add('6 and 7 share one twelve-step contour, about an octave apart',
    SEQUENCES[6].length === 12 && SEQUENCES[7].length === 12 &&
    SEQUENCES[6].every(([p], i) => {
      const ratio = frequencyHz(SEQUENCES[7][i][0]) / frequencyHz(p);
      return ratio > 1.5 && ratio < 2.5;
    }),
    '7 is the torpedo, 6 the ordnance');
  list.add('15 is a single pitch held 32 times -- the only flat sequence',
    SEQUENCES[15].length === 32 &&
    SEQUENCES[15].every(([p, d]) => p === 200 && d === 4));
  list.eq('13, the player\'s death, is the longest at 32 pairs',
    SEQUENCES[13].length, 32);
  list.eq('10 is a fully-formed 24-pair orphan', SEQUENCES[10].length, 24);
}

// ---------------------------------------------------------------------------
// § 18.3 -- one pair per tick
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function drain(list) {
  list.section('§ 18.3 — exactly one pair per tick, not one sound and never two');

  const s = inMission();
  playSound(s, SOUND.DEATH_PLAYER);
  list.eq('a 32-pair sound queues 32 pairs', s.sound.queue.pending, 32);

  const first = advanceSound(s);
  list.eq('one tick takes one pair', s.sound.queue.pending, 31);
  list.eq('and it is the sequence\'s first', [first.pitch, first.duration],
    SEQUENCES[SOUND.DEATH_PLAYER][0], JSON.stringify);

  let drained = 1;
  for (let i = 0; i < 40; i++) if (advanceSound(s)) drained++;
  list.eq('a 32-pair sound occupies exactly 32 ticks', drained, 32);
  list.add('and the queue is empty afterwards', s.sound.queue.isEmpty);
  list.add('draining an empty queue is silent, not an error',
    advanceSound(s) === null);

  // The drain is wired into the tick itself (§ 9.3 step 3), not into playback.
  const s2 = inMission();
  playSound(s2, SOUND.DEATH_PLAYER);
  const before = s2.sound.queue.pending;
  tick(s2);
  list.eq('the tick drains it -- § 9.3 step 3, with no audio device attached',
    s2.sound.queue.pending, before - 1);

  // § 18.9: the sink is called every tick, INCLUDING the silent ones, or a
  // device that schedules ahead loses the gaps that separate the bursts.
  const s3 = inMission();
  const seen = [];
  s3.sound.sink = (pair) => seen.push(pair);
  playSound(s3, SOUND.DEFLECTED);          // two pairs
  for (let i = 0; i < 5; i++) advanceSound(s3);
  list.eq('the sink is fed on every tick, null on the silent ones',
    seen.map((p) => (p ? 1 : 0)).join(''), '11000');
}

// ---------------------------------------------------------------------------
// § 18.4 -- the queue never pre-empts
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function queueDiscipline(list) {
  list.section('§ 18.4 — nothing is ever pre-empted, and that is the whole design');

  const s = inMission();
  playSound(s, SOUND.DEATH_PLAYER);        // 32 pairs
  playSound(s, SOUND.TORPEDO_AWAY);        // 3 pairs, arriving mid-death

  const head = advanceSound(s);
  list.eq('a sound arriving during another queues BEHIND it',
    [head.pitch, head.duration], SEQUENCES[SOUND.DEATH_PLAYER][0], JSON.stringify);
  list.eq('and both are held, not one', s.sound.queue.pending, 31 + 3);

  // Drain the death and confirm the torpedo is still intact behind it.
  for (let i = 0; i < 31; i++) advanceSound(s);
  const tail = [advanceSound(s), advanceSound(s), advanceSound(s)]
    .map((p) => [p.pitch, p.duration]);
  list.eq('the waiting sound plays in full once the first finishes',
    tail, SEQUENCES[SOUND.TORPEDO_AWAY], JSON.stringify);

  // **This is what makes the audio lag the picture.** One tick's worth of kills
  // banks nearly a second of sound describing an event that is already over.
  const s2 = inMission();
  for (let i = 0; i < 3; i++) playSound(s2, SOUND.DEATH_SHIP);
  list.eq('three merchants sunk in one tick bank 24 ticks of audio',
    s2.sound.queue.pending, 24);
  list.add('which at 30 ticks/s is 0.8 s behind the picture',
    Math.abs(s2.sound.queue.pending / 30 - 0.8) < 0.001);

  list.add('the queue is flushed only between rounds, never during play (§ 18.4)',
    (() => {
      const s3 = inMission();
      playSound(s3, SOUND.DEATH_PLAYER);
      for (let i = 0; i < 10; i++) tick(s3);
      return s3.sound.queue.pending > 0;
    })(),
    'ten ticks of play drained ten pairs and discarded none');
}

// ---------------------------------------------------------------------------
// § 18.4 -- the two overflow behaviours
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function overflow(list) {
  list.section('§ 18.4 — a full queue loses everything, or mutates; it never drops the newest');

  list.eq('the ring holds 128 pair-slots', QUEUE_PAIRS, 128);

  // Landing EXACTLY on the read cursor: `CPX $667F / BEQ` cannot tell a full
  // ring from an empty one, so the entire backlog goes in one tick.
  const s = inMission();
  for (let i = 0; i < 4; i++) playSound(s, SOUND.DEATH_PLAYER);   // 4 x 32 = 128
  list.add('exactly 128 pairs reads as EMPTY -- the whole backlog is discarded',
    s.sound.queue.isEmpty,
    'the write cursor landed on the read cursor');
  list.add('and nothing sounds afterwards', advanceSound(s) === null);

  // Landing PAST it: unplayed pairs are overwritten where they lie, so a queued
  // sequence turns into a different one partway through.
  const s2 = inMission();
  for (let i = 0; i < 4; i++) playSound(s2, SOUND.DEATH_PLAYER);
  playSound(s2, SOUND.EMPTY_MAGAZINE);                            // one pair past
  const head = advanceSound(s2);
  list.eq('one pair further and the newest sound overwrites the oldest IN PLACE',
    [head.pitch, head.duration], SEQUENCES[SOUND.EMPTY_MAGAZINE][0], JSON.stringify);
  list.add('so the head of the queue is now a sequence that was never queued there',
    head.pitch === SEQUENCES[SOUND.EMPTY_MAGAZINE][0][0] &&
    head.pitch !== SEQUENCES[SOUND.DEATH_PLAYER][0][0],
    'sequence 3 wrote over sequence 13 -- the trade is the opposite of the ' +
    'obvious one: this never loses a sound until it loses all of them at once');

  // Both cursors stay on pair boundaries, which is what the `AND #$FE` is for.
  const q = new SoundQueue();
  for (let i = 0; i < 60; i++) q.push(SOUND.DEATH_PLAYER);
  list.add('both cursors stay even however far they wrap',
    q.readCursor % 2 === 0 && q.writeCursor % 2 === 0,
    'read $' + q.readCursor.toString(16) + ', write $' + q.writeCursor.toString(16));
}

// ---------------------------------------------------------------------------
// § 18.8 -- the two silences are not the same silence
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function silences(list) {
  list.section('§ 18.8 — muted still drains, suppressed does not');

  // The title screen. Playback is skipped before the cursors are even read, so
  // the demo banks a backlog it will never hear.
  const s = new Session();
  list.eq('the title screen suppresses playback (§ 18.8)',
    outputFor(s), OUTPUT.SUPPRESSED);
  playSound(s, SOUND.DEATH_PLAYER);
  advanceSound(s);
  list.eq('and does NOT drain -- the demo keeps queueing', s.sound.queue.pending, 32);

  // Muted is a different code path aimed at a harmless address, so it consumes.
  const s2 = inMission();
  s2.sound.enabled = false;
  list.eq('muting aims the toggle at the cassette port instead',
    outputFor(s2), OUTPUT.CASSETTE);
  playSound(s2, SOUND.DEATH_PLAYER);
  list.add('which drains the queue silently',
    advanceSound(s2) === null && s2.sound.queue.pending === 31,
    'a pair was consumed and nothing was handed out');

  // Suppression is DERIVED from the mission counter, never stored -- so the
  // preference set on the title screen takes effect the moment a game starts,
  // with no "apply" step to forget.
  const s3 = new Session();
  s3.sound.enabled = true;
  list.eq('a preference set while suppressed is still suppressed',
    outputFor(s3), OUTPUT.SUPPRESSED);
  s3.mission = 1;
  list.eq('and takes effect the moment the mission counter leaves zero',
    outputFor(s3), OUTPUT.SPEAKER);

  // The flush point.
  const s4 = new Session();
  s4.startDemo();
  playSound(s4, SOUND.DEATH_PLAYER);
  const banked = s4.sound.queue.pending;
  newGame(s4);
  list.add('starting a game flushes whatever the demo piled up (§ 18.8)',
    banked === 32 && s4.sound.queue.isEmpty,
    'banked ' + banked + ' pairs on the title screen, then discarded them');

  list.add('a fresh sound state starts enabled and empty',
    (() => {
      const st = createSoundState();
      return st.enabled === true && st.queue.isEmpty && st.sink === null;
    })());
}

// ---------------------------------------------------------------------------
// § 18.6 -- nine sounds selected by TYPE, not by event
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function deathSounds(list) {
  list.section('§ 18.6 — the nine death sounds come off Chapter 7\'s table, not from events');

  // § 7.4's rows, as § 18.6 lists them. Types sharing a row share a sound, which
  // is why the three torpedoes are one entry and the merchant slots another.
  const expected = [
    [TYPE.HOSPITAL_SHIP, 4], [TYPE.MERCHANT_SHIP, 4], [TYPE.DESTROYER, 5],
    [TYPE.MAGNETIC_MINE, 6], [TYPE.DEPTH_CHARGE, 6],
    [TYPE.VERTICAL_TORPEDO, 7], [TYPE.HORIZONTAL_TORPEDO, 7], [TYPE.ENEMY_TORPEDO, 7],
    [TYPE.ENEMY_SUBMARINE, 11], [TYPE.SUPPLY_SUBMARINE, 12], [TYPE.PLAYER, 13],
    [TYPE.DOLPHIN, 14], [TYPE.GIANT_CLAM, 14], [TYPE.PAYLOAD, 16],
  ];

  list.eq('the table assigns the sounds § 18.6 lists',
    expected.map(([t]) => DEFINITIONS[t].sound),
    expected.map(([, snd]) => snd), JSON.stringify);

  // Driven through the real death path, so moving the call site fails here.
  const sounded = expected.map(([type]) => {
    const s = inMission();
    const slot = place(s, type, 100, 100);
    s.entities.slots[slot].stateChangePending = true;
    const log = watch(s);
    beginDeath(s, slot);
    return log[0];
  });
  list.eq('and destroying one queues its row\'s sound, through beginDeath',
    sounded, expected.map(([, snd]) => snd), JSON.stringify);

  // The avenger: the one silent row, and § 13.9 makes it unreachable, so the
  // only silent type never gets the chance to be silent.
  list.eq('the avenger is the one silent type', DEFINITIONS[TYPE.AVENGER].sound, SILENT);
  const s = inMission();
  const slot = place(s, TYPE.AVENGER, 100, 100);
  s.entities.slots[slot].stateChangePending = true;
  const log = watch(s);
  beginDeath(s, slot);
  list.eq('and its death queues nothing', log.length, 0);

  // Sound 10 is fully formed and nothing selects it (§ 18.6). Ship it, never
  // play it -- so no row may claim it.
  list.add('no type claims the orphan, sound 10',
    DEFINITIONS.every((d) => !d || d.sound !== SOUND.ORPHAN),
    'it is specified for completeness and must never sound');
}

// ---------------------------------------------------------------------------
// § 18.6 -- the eight event sounds, each from its own site
// ---------------------------------------------------------------------------

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function eventSounds(list) {
  list.section('§ 18.6 — the eight events, driven from the sites that fire them');

  // 1 and 3 -- firing, with and without ammunition.
  {
    const s = inMission();
    s.playerAlive = true;
    spawnPlayer(s, 100, 100);
    const log = watch(s);
    fireVerticalTorpedo(s);
    fireHorizontalTorpedo(s);
    list.eq('both weapons queue sound 1 when they fire',
      log, [SOUND.TORPEDO_AWAY, SOUND.TORPEDO_AWAY], JSON.stringify);
  }
  {
    const s = inMission();
    s.playerAlive = true;
    spawnPlayer(s, 100, 100);
    s.resources.torpedoes = 0;
    const log = watch(s);
    const fired = fireVerticalTorpedo(s);
    list.add('firing on an empty magazine queues sound 3 and launches nothing',
      !fired && log.length === 1 && log[0] === SOUND.EMPTY_MAGAZINE,
      'the magazine is shared by both weapons (§ 16.3)');
  }
  {
    // Suspension 2 of § 10.5.2: the demo skips the ammunition path entirely, so
    // it gets free shots and never makes the empty sound.
    const s = new Session();
    s.startDemo();
    s.playerAlive = true;
    s.resources.torpedoes = 0;
    const log = watch(s);
    fireVerticalTorpedo(s);
    list.add('the demo still queues sound 1 but never sound 3 (§ 10.5.2 rule 2)',
      log.indexOf(SOUND.EMPTY_MAGAZINE) === -1 && log.indexOf(SOUND.TORPEDO_AWAY) !== -1,
      'the title screen suppresses playback, but the queueing is real');
  }

  // 0 -- the depth charge entering the water, queued with § 15.6's splash.
  {
    const s = inMission();
    const slot = place(s, TYPE.DEPTH_CHARGE, 100, 31);
    const e = s.entities.slots[slot];
    e.scratch0 = 4;                       // one arc step short of the water
    e.scratch1 = 175;                     // fuse far below, so it cannot detonate first
    e.scratch2 = 2;
    e.scratch3 = 8;
    e.animLastFrame = 8;
    e.updatePeriod = 1;
    e.updateCountdown = 1;
    const log = watch(s);
    updateDepthCharge(s, slot);
    list.eq('hitting the water queues sound 0', log, [SOUND.SPLASH], JSON.stringify);
    list.add('which is a different sound from the one its death makes',
      SOUND.SPLASH !== DEFINITIONS[TYPE.DEPTH_CHARGE].sound,
      'splash 0 on entry, ordnance 6 when destroyed');
  }

  // 2 -- the hospital ship deflecting a vertical torpedo, with neither damaged.
  {
    const s = inMission();
    const torp = place(s, TYPE.VERTICAL_TORPEDO, 100, 22);
    s.entities.slots[torp].scratch0 = -1;
    const ship = place(s, TYPE.HOSPITAL_SHIP, 96, 20);
    const log = watch(s);
    respond(s, torp, ship);
    list.add('a deflection queues sound 2 and destroys nothing (§ 13.6.2)',
      log.length === 1 && log[0] === SOUND.DEFLECTED &&
      !s.entities.slots[torp].stateChangePending,
      'the shot is reflected, not consumed');
  }

  // 8 -- the clam closing on the payload.
  {
    const s = inMission();
    const clam = place(s, TYPE.GIANT_CLAM, 100, 150);
    const load = place(s, TYPE.PAYLOAD, 100, 150);
    s.convoy.live = true;
    const log = watch(s);
    respond(s, clam, load);
    list.add('the clam closing on the payload queues sound 8 (§ 13.8.3)',
      log.length === 1 && log[0] === SOUND.CLAM_CLOSES &&
      s.entities.slots[clam].sprite === 'shellClosed');
  }

  // 9 -- refuelling.
  {
    const s = inMission();
    s.roundLive = true;
    s.playerAlive = true;
    spawnPlayer(s, 100, 150);
    const load = place(s, TYPE.PAYLOAD, 100, 150);
    s.convoy.live = true;
    s.resources.fuel = 10;
    const log = watch(s);
    respond(s, s.playerSlot, load);
    list.eq('collecting the payload queues sound 9 (§ 16.4)',
      log, [SOUND.REFUEL], JSON.stringify);
    list.add('and § 18.7 says why it sounds familiar: it is the splash, drawn out',
      JSON.stringify(SEQUENCES[SOUND.REFUEL]) ===
      JSON.stringify(SEQUENCES[SOUND.SPLASH].map(([p, d]) => [p, d * 2])));
  }

  // 17 -- the launch animation, and 15 -- MISSION COMPLETE.
  {
    const s = new Session();
    s.startDemo();
    newGame(s);
    const log = watch(s);
    let guard = 0;
    while (s.phase === PHASE.SETUP_ICONS && guard++ < 400) advanceRound(s);
    list.eq('the launch queues sound 17 when the icon lifts (§ 11.1.1)',
      log, [SOUND.LAUNCH], JSON.stringify);
    list.add('one pair of 200 half-periods -- the longest single burst in the game',
      SEQUENCES[SOUND.LAUNCH].length === 1 &&
      Math.abs(burstSeconds(15, 200) * 1000 - 19.4) < 0.1,
      '19.4 ms, which is what caps the tick rate at 51.5 -- see speaker.js');
  }
  {
    const s = new Session();
    s.startDemo();
    newGame(s);
    let guard = 0;
    while (s.phase !== PHASE.PLAY && guard++ < 400) tick(s);
    s.playerAlive = true;
    s.roundLive = true;
    s.resources.fuel = 500;
    s.killCounter = 0;                    // quota met, tanks not dry
    const log = watch(s);
    checkRoundGuards(s);
    for (let i = 0; i < 5; i++) advanceRound(s);
    list.add('clearing the mission queues sound 15 (§ 11.3)',
      log.indexOf(SOUND.MISSION_COMPLETE) !== -1,
      'a single pitch held 32 times — a steady second-long tone');
  }
}
