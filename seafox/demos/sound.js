// seafox/demos/sound.js
//
// Chapter 18's demo: A/B the live synthesis against the reference WAVs, and
// exercise the queue behaviours a WAV cannot show.
//
// Everything audible here goes through the SHIPPING path -- a real `Session`, a
// real `SoundQueue`, `advanceSound` once per tick, `Speaker.tick` on the other
// end of the sink. Nothing is short-circuited for the demo, so what you hear is
// what the game will make.

import { Session } from '../src/core/session.js';
import {
  SEQUENCES, SOUND, OUTPUT, QUEUE_PAIRS,
  playSound, advanceSound, outputFor,
  frequencyHz, burstSeconds, halfPeriodCycles,
} from '../src/core/sound.js';
import { Speaker, DEFAULT_TICK_HZ } from '../src/presentation/speaker.js';

/** @type {string} where the tools/sounds.py render lives, relative to this page. */
const REF_DIR = './sound_ref';

/**
 * § 18.6's assignments, as `[kind, text]`. Kept here rather than in core because
 * it is display copy -- core only needs the index.
 * @type {Array<[string, string]>}
 */
const TRIGGERS = [
  ['ev', 'depth charge hits the water'],
  ['ev', 'torpedo away, either weapon'],
  ['ev', 'hospital ship deflects your torpedo'],
  ['ev', 'fired on an empty magazine'],
  ['de', 'hospital ship · merchant ship'],
  ['de', 'Destroyer'],
  ['de', 'magnetic mine · depth charge'],
  ['de', 'all three torpedoes'],
  ['ev', 'Giant Clam closes on the payload'],
  ['ev', 'refuelling'],
  ['or', 'ORPHAN — nothing selects it'],
  ['de', 'enemy submarine'],
  ['de', 'supply submarine'],
  ['de', 'THE PLAYER'],
  ['de', 'dolphin · Giant Clam'],
  ['ev', 'MISSION COMPLETE'],
  ['de', 'the payload — same data as 14'],
  ['ev', 'the launch animation'],
];

// ---------------------------------------------------------------- state

/** @type {Session} the real thing, so suppression and the flush points are live. */
const session = new Session();
session.mission = 1;                       // § 18.8: mission 0 would suppress

/** @type {Speaker} */
const speaker = new Speaker({ tickHz: DEFAULT_TICK_HZ, coneHz: 6000, volume: 0.25 });

// § 18.9: core hands the pair out and knows nothing about what receives it.
session.sound.sink = (pair) => speaker.tick(pair);

/** @type {number} ticks the drain loop has run. */
let ticks = 0;
/** @type {?HTMLAudioElement} the reference WAV currently playing. */
let refAudio = null;
/** @type {?HTMLElement} the button lit as sounding. */
let litButton = null;

// ---------------------------------------------------------------- self-checks

/**
 * Deterministic assertions over the data and the queue -- the house convention
 * for these demos, and the part that does not need ears.
 * @returns {void}
 */
function runChecks() {
  const out = [];
  let failed = 0;

  /**
   * @param {string} label
   * @param {boolean} ok
   * @param {string} [detail]
   * @returns {void}
   */
  const check = (label, ok, detail) => {
    if (!ok) failed++;
    out.push(`<span class="${ok ? 'pass' : 'fail'}">${ok ? 'PASS' : 'FAIL'}</span>  ${label}` +
             (detail ? `  <span class="note">${detail}</span>` : ''));
  };

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // -- § 18.5 / § 18.7: the data, and the relationships that catch a bad transcription
  check('18 sequences', SEQUENCES.length === 18);
  check('14 and 16 are one sequence', same(SEQUENCES[14], SEQUENCES[16]));
  check('0 and 8 are exact inverses', same(SEQUENCES[0], [...SEQUENCES[8]].reverse()));
  check('9 is 0 with the durations doubled',
        same(SEQUENCES[9], SEQUENCES[0].map(([p, d]) => [p, d * 2])));
  check('15 is one pitch held 32 times',
        SEQUENCES[15].length === 32 && SEQUENCES[15].every(([p, d]) => p === 200 && d === 4));
  check('13 is 32 pairs — the player death', SEQUENCES[13].length === 32);
  check('10 is a 24-pair orphan', SEQUENCES[10].length === 24);

  // -- § 18.2: the five reference frequencies
  const table = [[8, 7972], [15, 5154], [100, 974], [200, 498], [250, 401]];
  for (const [pitch, hz] of table) {
    const got = frequencyHz(pitch);
    check(`pitch ${pitch} → ${hz} Hz`, Math.abs(got - hz) < 1, `got ${got.toFixed(1)}`);
  }

  // -- § 18.3: the longest single burst. The spec's prose says 40 ms; it is 19.4.
  let longest = 0, longestAt = '';
  SEQUENCES.forEach((seq, i) => seq.forEach(([p, d]) => {
    const ms = burstSeconds(p, d) * 1000;
    if (ms > longest) { longest = ms; longestAt = `seq ${i}, ${p},${d}`; }
  }));
  check('longest burst is well under one tick', longest < 1000 / DEFAULT_TICK_HZ,
        `${longest.toFixed(1)} ms (${longestAt}) vs ${(1000 / DEFAULT_TICK_HZ).toFixed(1)} ms tick` +
        ' — note § 18.3 prose says 40 ms');

  // -- § 18.3: one pair per tick, never two
  const s = new Session();
  s.mission = 1;
  playSound(s, SOUND.DEATH_PLAYER);
  check('a 32-pair sound queues 32 pairs', s.sound.queue.pending === 32);
  let drained = 0;
  for (let i = 0; i < 40; i++) if (advanceSound(s)) drained++;
  check('drains in exactly 32 ticks', drained === 32 && s.sound.queue.isEmpty);

  // -- § 18.4: nothing is ever pre-empted
  const s2 = new Session();
  s2.mission = 1;
  playSound(s2, SOUND.DEATH_PLAYER);
  playSound(s2, SOUND.TORPEDO_AWAY);
  const first = advanceSound(s2);
  check('a new sound queues BEHIND, never pre-empts',
        first.pitch === SEQUENCES[SOUND.DEATH_PLAYER][0][0],
        `first pair out is ${first.pitch},${first.duration} — the death, not the torpedo`);
  check('and it waits its turn', s2.sound.queue.pending === 31 + 3);

  // -- § 18.8: the two silences differ, and the difference is the queue
  const s3 = new Session();                       // mission 0 = title = suppressed
  playSound(s3, SOUND.DEATH_PLAYER);
  check('title screen is suppressed', outputFor(s3) === OUTPUT.SUPPRESSED);
  advanceSound(s3);
  check('suppressed does NOT drain — the demo banks a backlog',
        s3.sound.queue.pending === 32);
  s3.nextMission();
  check('starting a game flushes it (§ 18.8)', s3.sound.queue.isEmpty);

  const s4 = new Session();
  s4.mission = 1;
  s4.sound.enabled = false;                       // muted = cassette
  playSound(s4, SOUND.DEATH_PLAYER);
  check('muted is the cassette port', outputFor(s4) === OUTPUT.CASSETTE);
  check('and it DOES drain, silently',
        advanceSound(s4) === null && s4.sound.queue.pending === 31);

  // -- § 18.4: the two overflow behaviours, from an unchecked byte cursor
  const s5 = new Session();
  s5.mission = 1;
  for (let i = 0; i < 4; i++) playSound(s5, SOUND.DEATH_PLAYER);   // 4 x 32 = 128
  check(`exactly ${QUEUE_PAIRS} pairs reads as EMPTY — the backlog is discarded`,
        s5.sound.queue.isEmpty, 'write cursor landed on the read cursor');

  const s6 = new Session();
  s6.mission = 1;
  for (let i = 0; i < 4; i++) playSound(s6, SOUND.DEATH_PLAYER);
  playSound(s6, SOUND.EMPTY_MAGAZINE);                             // one pair past
  const head = advanceSound(s6);
  check('one pair past that overwrites in place, it does not drop the newest',
        head.pitch === SEQUENCES[SOUND.EMPTY_MAGAZINE][0][0],
        `head is now ${head.pitch},${head.duration} — sequence 3 wrote over sequence 13`);

  document.getElementById('checks').innerHTML =
    out.join('\n') +
    `\n\n<span class="${failed ? 'fail' : 'pass'}">${failed ? failed + ' FAILED' : 'all checks pass'}</span>` +
    `  <span class="note">— core only; the audio path below needs ears</span>`;
}

// ---------------------------------------------------------------- the table

/**
 * @returns {void}
 */
function buildRows() {
  const tbody = document.getElementById('rows');
  SEQUENCES.forEach((seq, i) => {
    const freqs = seq.map(([p]) => frequencyHz(p));
    const lo = Math.min(...freqs), hi = Math.max(...freqs);
    const burstMs = seq.reduce((a, [p, d]) => a + burstSeconds(p, d) * 1000, 0);
    const [kind, text] = TRIGGERS[i];

    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td class="n mono">${i}</td>` +
      `<td></td>` +
      `<td class="n mono">${seq.length}</td>` +
      `<td class="mono">${lo === hi ? Math.round(lo) : `${Math.round(lo)} – ${Math.round(hi)}`}</td>` +
      `<td class="n mono">${burstMs.toFixed(1)} ms</td>` +
      `<td class="n mono">${(seq.length / DEFAULT_TICK_HZ).toFixed(2)} s</td>` +
      `<td class="trig"><span class="${kind}">${text}</span></td>`;

    const cell = tr.children[1];
    const box = document.createElement('div');
    box.className = 'btns';
    box.append(
      makeButton('live', () => playLive(i, tr)),
      makeButton('wav', () => playRef(i, tr)),
      makeButton('A/B', () => playCompare(i, tr)),
    );
    cell.appendChild(box);
    tbody.appendChild(tr);
  });
}

/**
 * @param {string} label
 * @param {function} onClick
 * @returns {HTMLButtonElement}
 */
function makeButton(label, onClick) {
  const b = document.createElement('button');
  b.textContent = label;
  b.disabled = true;                      // until audio is enabled
  b.onclick = onClick;
  return b;
}

// ---------------------------------------------------------------- playback

/**
 * Queue a sequence through the real queue. The 30 Hz drain does the rest, which
 * is the whole point -- there is no "play a sequence" call anywhere in the game.
 * @param {number} index
 * @param {HTMLElement} [row]
 * @returns {void}
 */
function playLive(index, row) {
  playSound(session, index);
  if (row) highlight(row, SEQUENCES[index].length / DEFAULT_TICK_HZ);
}

/**
 * @param {number} index
 * @param {HTMLElement} [row]
 * @returns {void}
 */
function playRef(index, row) {
  if (refAudio) { refAudio.pause(); refAudio = null; }
  const name = index === -1 ? 'all' : `seq${String(index).padStart(2, '0')}`;
  refAudio = new Audio(`${REF_DIR}/${name}.wav`);
  refAudio.volume = Math.min(1, speaker.volume * 2);
  refAudio.play().catch((e) => showError(`reference WAV: ${e.message}`));
  if (row) highlight(row, SEQUENCES[index] ? SEQUENCES[index].length / DEFAULT_TICK_HZ : 1);
}

/**
 * Live, then the reference, with a beat between them -- the comparison the page
 * exists for.
 * @param {number} index
 * @param {HTMLElement} row
 * @returns {void}
 */
function playCompare(index, row) {
  playLive(index, row);
  const seconds = SEQUENCES[index].length / DEFAULT_TICK_HZ;
  setTimeout(() => playRef(index, row), (seconds + 0.35) * 1000);
}

/**
 * @param {HTMLElement} row
 * @param {number} seconds
 * @returns {void}
 */
function highlight(row, seconds) {
  row.classList.add('playing');
  setTimeout(() => row.classList.remove('playing'), seconds * 1000 + 400);
}

// ---------------------------------------------------------------- the drain

/**
 * § 9.3 step 3 in isolation: advance sound by exactly one pair, at the fixed
 * tick rate, whether or not there is anything to hear.
 *
 * A fixed-timestep accumulator rather than one tick per frame, because rAF runs
 * at the display's rate and the tick rate is 30 by decision, not by refresh.
 * @returns {void}
 */
function startDrain() {
  const step = 1000 / DEFAULT_TICK_HZ;
  let last = performance.now();
  let acc = 0;

  const loop = (now) => {
    acc += Math.min(now - last, 250);     // a long stall catches up, it does not sprint
    last = now;
    while (acc >= step) {
      acc -= step;
      advanceSound(session);              // -> session.sound.sink -> speaker.tick
      ticks++;
    }
    paintQueue();
    requestAnimationFrame(loop);          // never conditionally stopped
  };
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- the queue lab

/** @type {HTMLElement[]} one cell per pair-slot in the ring. */
const ringCells = [];

/**
 * @returns {void}
 */
function buildRing() {
  const ring = document.getElementById('ring');
  for (let i = 0; i < QUEUE_PAIRS; i++) {
    const cell = document.createElement('i');
    ring.appendChild(cell);
    ringCells.push(cell);
  }
}

/**
 * @returns {void}
 */
function paintQueue() {
  const q = session.sound.queue;
  const read = q.readCursor >> 1;
  const pending = q.pending;
  for (let i = 0; i < QUEUE_PAIRS; i++) {
    const inQueue = i >= 0 && ((i - read) & (QUEUE_PAIRS - 1)) < pending;
    ringCells[i].className = i === read && pending ? 'head' : (inQueue ? 'full' : '');
  }
  const out = outputFor(session);
  const name = out === OUTPUT.SPEAKER ? 'speaker'
             : out === OUTPUT.CASSETTE ? 'cassette (silent, still draining)'
             : 'suppressed (not draining)';
  document.getElementById('queueOut').textContent =
    `queued  ${String(pending).padStart(3)} pairs   ` +
    `backlog ${(pending / DEFAULT_TICK_HZ).toFixed(2).padStart(5)} s\n` +
    `cursors read $${hex(q.readCursor)}  write $${hex(q.writeCursor)}   ` +
    `output ${name}\n` +
    `ticks   ${String(ticks).padStart(6)}   sounded ${String(speaker.pairsSounded).padStart(4)} pairs`;
}

/**
 * @param {number} n
 * @returns {string}
 */
function hex(n) {
  return n.toString(16).toUpperCase().padStart(2, '0');
}

// ---------------------------------------------------------------- wiring

/**
 * @param {string} message
 * @returns {void}
 */
function showError(message) {
  document.getElementById('error').textContent = message;
}

/**
 * @returns {void}
 */
function wire() {
  document.getElementById('enable').onclick = async (e) => {
    try {
      await speaker.resume();
      e.target.textContent = 'Audio running';
      e.target.classList.remove('arm');
      e.target.disabled = true;
      for (const b of document.querySelectorAll('button[disabled]')) {
        if (b !== e.target) b.disabled = false;
      }
    } catch (err) {
      showError(`AudioContext: ${err.message}`);
    }
  };

  const vol = document.getElementById('vol');
  vol.oninput = () => {
    speaker.setVolume(vol.value / 100);
    document.getElementById('volVal').textContent = `${vol.value}%`;
  };

  const cone = document.getElementById('cone');
  cone.oninput = () => {
    const hz = Number(cone.value);
    speaker.setCone(hz);
    document.getElementById('coneVal').textContent = hz ? `${hz} Hz` : 'off';
  };

  for (const b of document.querySelectorAll('#output button')) {
    b.onclick = () => {
      for (const o of document.querySelectorAll('#output button')) o.classList.remove('on');
      b.classList.add('on');
      const mode = b.dataset.out;
      session.mission = mode === 'title' ? 0 : 1;
      session.sound.enabled = mode !== 'cassette';
    };
  }

  document.getElementById('silence').onclick = () => {
    session.sound.queue.flush();
    speaker.silence();
    if (refAudio) { refAudio.pause(); refAudio = null; }
  };

  for (const b of document.querySelectorAll('button[data-burst]')) {
    b.onclick = () => {
      // One tick's worth of events, queued together -- exactly what a multi-kill
      // frame does, and the reason the audio lags.
      for (const n of b.dataset.burst.split(',')) playSound(session, Number(n));
    };
  }
}

// ---------------------------------------------------------------- boot

try {
  runChecks();
  buildRows();
  buildRing();
  wire();
  startDrain();
} catch (e) {
  showError(`${e.message}\n${e.stack}`);
}

// Handy from the console when poking at this.
window.seafoxSound = { session, speaker, SEQUENCES, SOUND, playLive, playRef };
