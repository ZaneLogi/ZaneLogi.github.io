// seafox/tests/test_golden.js
//
// design_spec § 20.5 -- Oracle 4, the last and most expensive of the four.
//
// The whole game is deterministic from cold boot until the first input (§ 1.6),
// so a rendered frame at a fixed tick count is reproducible to the byte. This
// page has two halves, and they are different KINDS of check:
//
//   * **Anchors** compare the frame against the SPECIFICATION -- the six-colour
//     palette, the waterline row, the HUD row, the drawable bounds. These are
//     external: they would catch a renderer that has been consistently wrong
//     since the day it was written, which no self-captured digest can.
//
//   * **Goldens** compare the frame against THIS PORT'S OWN PAST. They cannot
//     tell you the renderer is right, only that it changed -- see the header of
//     golden_frames.js for why that is still worth having, and for the rule
//     about regenerating them.
//
// § 20.5 asks for the buffer rather than a screenshot, and the reason is worth
// keeping in view: `color` is what the simulation and the renderer produce
// together, while a screenshot is that buffer plus § 17.5's free choices about
// scale and aspect. Comparing the buffer keeps the oracle independent of them.

import { mount } from './harness.js';
import { Session } from '../src/core/session.js';
import { tick } from '../src/core/tick.js';
import { Renderer, WATERLINE_ROW } from '../src/presentation/renderer.js';
import { SCREEN_W, SCREEN_H } from '../src/core/stencil.js';
import { COLOR } from '../src/presentation/palette.js';
import { HUD_ROW } from '../src/presentation/hud.js';
import { GOLDEN, GOLDEN_TICKS } from './golden_frames.js';
import { GOLDEN_PLAY, GOLDEN_PLAY_TICKS, PLAY_TIMELINE } from './golden_play.js';
import { START_KEY } from '../src/core/input.js';
import { PHASE, DRAIN_PASSES } from '../src/core/round.js';
import { FUEL_FULL, TORPEDOES_FULL } from '../src/core/resources.js';

/** @type {number} bands the digest splits the screen into, for locating a diff. */
const BANDS = 12;

/**
 * The digest of one `color` buffer.
 *
 * **The generator below uses this same function**, so the two cannot drift
 * apart -- which they would, silently and undetectably, if regeneration lived
 * in a separate script.
 *
 * @param {Uint8Array} color
 * @returns {{hash: string, lit: number, bands: number[], hist: Object<number, number>}}
 */
export function digest(color) {
  let h = 0x811c9dc5;
  let lit = 0;
  /** @type {Object<number, number>} */
  const hist = {};
  const bands = new Array(BANDS).fill(0);
  const rowsPerBand = SCREEN_H / BANDS;
  for (let i = 0; i < color.length; i++) {
    const v = color[i];
    h = Math.imul(h ^ v, 0x01000193) >>> 0;
    if (v !== 0) {
      lit += 1;
      hist[v] = (hist[v] || 0) + 1;
      bands[Math.floor((i / SCREEN_W) / rowsPerBand)] += 1;
    }
  }
  return { hash: '0x' + h.toString(16).padStart(8, '0'), lit, bands, hist };
}

/**
 * Cold-boot the demo and render at each tick count in `GOLDEN_TICKS`.
 * @returns {{frames: Object<number, Uint8Array>, digests: Object<number, Object>}}
 */
function capture() {
  const s = new Session();
  s.startDemo();
  const r = new Renderer();
  /** @type {Object<number, Uint8Array>} */
  const frames = {};
  /** @type {Object<number, Object>} */
  const digests = {};
  let t = 0;
  for (const want of GOLDEN_TICKS) {
    while (t < want) { tick(s); t += 1; }
    r.render(s);
    frames[want] = r.color.slice();
    digests[want] = digest(frames[want]);
  }
  return { frames, digests };
}

// ---------------------------------------------------------------------------
// § 20.5 extended -- a SCRIPTED-INPUT run
// ---------------------------------------------------------------------------
//
// **The demo goldens cannot see most of the game.** The title-screen demo never
// starts a round, so it never touches the launch sequence, the fuel burn, an
// out-of-fuel loss, the outro, the drain, the fresh-submarine refill or the
// fly-in. Every bug found in the Chapter 9-20 audit lived in exactly that code,
// and the demo goldens stayed green through all of them.
//
// Determinism does not stop at the first input -- it stops at an input the
// oracle cannot reproduce. A FIXED input script is as reproducible as no input
// at all, so the whole played game comes back into reach.

/** @type {number} the tick the script first presses start on. */
const START_AT = 60;
/** @type {number} long enough to run the tanks dry three times and end the game. */
const PLAY_RUN = 9000;

/**
 * The script: which key is pressed on tick `t`, or null.
 *
 * A repeating 240-tick figure that moves on both axes and fires both weapons,
 * chosen only to keep the submarine busy and the magazine draining. It is
 * arbitrary -- what matters is that it is FIXED.
 *
 * @param {number} t
 * @returns {?string}
 */
export function scriptedKey(t) {
  if (t < START_AT) return null;
  switch ((t - START_AT) % 240) {
    case 0: return 'u';        // climb
    case 60: return 'd';       // vertical torpedo
    case 100: return 'k';      // right
    case 140: return 'f';      // horizontal torpedo
    case 180: return 'm';      // dive
    case 220: return 'd';
    default: return null;
  }
}

/**
 * Run the script, capturing digests at fixed ticks and every phase transition.
 *
 * @returns {{digests: Object, timeline: {tick: number, phase: string}[],
 *            frames: Object, notes: Object}}
 */
function captureScripted() {
  const s = new Session();
  s.startDemo();

  let pending = null;
  s.keys = { read: () => { const k = pending; pending = null; return k; } };

  // **Restart whenever the game returns to the title.** Still fully
  // deterministic -- it is a function of deterministic state, not of a clock or
  // a person -- and it keeps the run inside a played round instead of spending
  // three quarters of it replaying the demo the OTHER goldens already cover.
  const keyFor = (t) => (s.isTitleScreen && t >= START_AT ? START_KEY : scriptedKey(t));

  const r = new Renderer();
  const digests = {};
  const frames = {};
  const timeline = [];
  const notes = { maxDrainPass: 0, fuelAtPlay: [], torpAtPlay: [] };
  let last = s.phase;

  for (let t = 1; t <= PLAY_RUN; t++) {
    pending = keyFor(t);
    tick(s);

    if (s.phase !== last) {
      timeline.push({ tick: t, phase: s.phase });
      // Each entry into PLAY is a round start; § 11.1.1 fills both gauges on the
      // fresh-submarine path, so these are the numbers that were wrong before.
      if (s.phase === PHASE.PLAY) {
        notes.fuelAtPlay.push(s.resources.fuel);
        notes.torpAtPlay.push(s.resources.torpedoes);
      }
      last = s.phase;
    }
    if (s.phase === PHASE.DRAIN) notes.maxDrainPass = Math.max(notes.maxDrainPass, s.drainPass);

    if (GOLDEN_PLAY_TICKS.indexOf(t) !== -1) {
      r.render(s);
      frames[t] = r.color.slice();
      digests[t] = Object.assign(digest(frames[t]), {
        phase: s.phase, mission: s.mission, subs: s.spareSubs,
        fuel: s.resources.fuel, torp: s.resources.torpedoes, live: s.entities.liveCount,
      });
    }
  }
  return { digests, timeline, frames, notes };
}

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function scripted(list) {
  list.section('§ 20.5 extended — a scripted-input run, which reaches the played game');

  const cap = captureScripted();

  // -- anchors: things the SPEC fixes, not things the past fixed -------------
  list.add('the script reaches a played round at all',
    cap.timeline.some((e) => e.phase === PHASE.PLAY),
    'phases seen: ' + [...new Set(cap.timeline.map((e) => e.phase))].join(' → '));

  const reached = new Set(cap.timeline.map((e) => e.phase));
  const wanted = [PHASE.SETUP_ICONS, PHASE.SETUP_LAUNCH, PHASE.PLAY, PHASE.DRAIN];
  const missing = wanted.filter((p) => !reached.has(p));
  list.add('...and passes through launch, play and the drain — the demo reaches none of these',
    missing.length === 0,
    missing.length ? 'never reached: ' + missing.join(', ')
      : 'every phase the title-screen goldens are blind to');

  // **§ 11.1.1 step 5**, the bug the demo goldens could not see: a fresh
  // submarine launches with FULL gauges, not the dead one's.
  const badFuel = cap.notes.fuelAtPlay.filter((f) => f !== FUEL_FULL && f !== null);
  list.add('every round begins with a full tank or a carried-over one, never an empty one',
    cap.notes.fuelAtPlay.length > 0 && !cap.notes.fuelAtPlay.some((f) => f === 0),
    'fuel at each entry to play: ' + cap.notes.fuelAtPlay.join(', ') +
    ' — a zero here is the cascade § 11.1.1 step 5 prevents' +
    (badFuel.length ? ' (carried-over values are the fly-in path)' : ''));

  // **§ 11.4: the cap is a ceiling, never exceeded.** Note what is NOT asserted
  // here: that a drain ends early. Reaching the cap after a death is correct --
  // the traffic that killed you is still crossing, and a merchant at 0.29 px a
  // tick needs far longer than 220 ticks to leave. The early exit is asserted
  // where it is actually reachable, on a mission clear, in test_round.
  list.add('no drain ever runs past its ' + DRAIN_PASSES + '-pass cap (§ 11.4)',
    cap.notes.maxDrainPass <= DRAIN_PASSES,
    'deepest pass reached: ' + cap.notes.maxDrainPass + ' of ' + DRAIN_PASSES);

  const legal = new Set(Object.values(COLOR));
  const seen = new Set();
  for (const t of GOLDEN_PLAY_TICKS) for (const v of cap.frames[t]) seen.add(v);
  list.add('every byte of every played frame is a legal palette index (§ 3.4)',
    [...seen].every((v) => legal.has(v)), 'saw ' + [...seen].sort().join(', '));

  // -- the timeline, which is a golden in its own right ---------------------
  const got = cap.timeline.map((e) => e.tick + ':' + e.phase).join(' ');
  const want = PLAY_TIMELINE.map((e) => e.tick + ':' + e.phase).join(' ');
  list.add('the phase timeline is identical to the golden run',
    got === want,
    got === want
      ? cap.timeline.length + ' transitions, ' + cap.notes.fuelAtPlay.length + ' rounds'
      : 'CHANGED — golden:\n      ' + want + '\n      now:\n      ' + got +
        '\n      A shifted transition is the most legible failure this page can ' +
        'give: it names the tick a round started, ended or drained differently');

  // -- the digests ----------------------------------------------------------
  for (const t of GOLDEN_PLAY_TICKS) {
    const g = cap.digests[t];
    const w = GOLDEN_PLAY[t];
    if (!w) { list.add('tick ' + t + ' has a golden', false, 'missing'); continue; }
    const stateOk = g.phase === w.phase && g.mission === w.mission && g.subs === w.subs &&
      g.fuel === w.fuel && g.torp === w.torp && g.live === w.live;
    const ok = g.hash === w.hash && stateOk;
    list.add('tick ' + t + ' matches the golden played frame',
      ok,
      ok ? g.hash + '  ' + g.phase + ', mission ' + g.mission + ', subs ' + g.subs +
        ', fuel ' + g.fuel + ', torp ' + g.torp + ', ' + g.live + ' live'
        : (g.hash !== w.hash ? w.hash + ' -> ' + g.hash + '; ' : '') +
          'state was ' + [w.phase, 'mission ' + w.mission, 'subs ' + w.subs,
            'fuel ' + w.fuel, 'torp ' + w.torp, w.live + ' live'].join(', ') +
          ' | now ' + [g.phase, 'mission ' + g.mission, 'subs ' + g.subs,
            'fuel ' + g.fuel, 'torp ' + g.torp, g.live + ' live'].join(', ') +
          ' — ASK WHAT CHANGED before regenerating');
  }
}

/**
 * The half that checks the specification rather than the past.
 *
 * @param {import('./harness.js').CheckList} list
 * @param {Object} cap
 * @returns {void}
 */
function anchors(list, cap) {
  list.section('§ 20.5 anchors — the frame against the SPEC, not against itself');

  const legal = new Set(Object.values(COLOR));
  /** @type {Set<number>} */
  const seen = new Set();
  for (const t of GOLDEN_TICKS) for (const v of cap.frames[t]) seen.add(v);
  const illegal = [...seen].filter((v) => !legal.has(v));
  list.add('every byte in every frame is one of § 3.4\'s six palette indices',
    illegal.length === 0,
    illegal.length ? 'saw ' + illegal.join(', ') : 'saw ' + [...seen].sort().join(', ') +
      ' — index 0 is the sea, and it PAINTS on the way to the display even though ' +
      'it is the skip value inside a sprite');

  // § 2.2: the buffer is the screen, exactly. A renderer that allocated a
  // different shape would still hash consistently against its own past.
  list.eq('the buffer is exactly 280 x 192 (§ 2.2)',
    cap.frames[1].length, SCREEN_W * SCREEN_H);

  // § 3.5: the waterline is a full-width row of blue at row 38, on every frame.
  let waterlineOk = true;
  for (const t of GOLDEN_TICKS) {
    const row = cap.frames[t].subarray(WATERLINE_ROW * SCREEN_W, (WATERLINE_ROW + 1) * SCREEN_W);
    let blue = 0;
    for (const v of row) if (v === COLOR.BLUE) blue += 1;
    // Entities crossing the surface occlude it (§ 17.2 draws them after), so
    // this asks that the line is THERE and mostly intact, not that it is pure.
    if (blue < SCREEN_W * 0.6) waterlineOk = false;
  }
  list.add('the waterline is a full-width blue row at row ' + WATERLINE_ROW + ' (§ 3.5)',
    waterlineOk,
    'present in all ' + GOLDEN_TICKS.length + ' frames — entities crossing the ' +
    'surface occlude it, because § 17.2 lays it down BEFORE them');

  // § 2.4 / § 19.9: the HUD line, and nothing above row 185 belongs to it.
  let hudOk = true;
  for (const t of GOLDEN_TICKS) {
    let lit = 0;
    for (let i = HUD_ROW * SCREEN_W; i < SCREEN_H * SCREEN_W; i++) if (cap.frames[t][i] !== 0) lit += 1;
    if (lit === 0) hudOk = false;
  }
  list.add('the HUD line is drawn at row ' + HUD_ROW + ' in every frame (§ 19.9)',
    hudOk, 'score and high score are always shown, even on the title screen');

  // § 2.4.1: nothing the game can reach touches the HUD. The lowest object is
  // the supply submarine at rows 177-183, and the HUD row is 185.
  let gapClean = true;
  for (const t of GOLDEN_TICKS) {
    for (let r = HUD_ROW - 1; r >= HUD_ROW - 1; r--) {
      for (let x = 0; x < SCREEN_W; x++) {
        if (cap.frames[t][r * SCREEN_W + x] !== 0) gapClean = false;
      }
    }
  }
  list.add('row ' + (HUD_ROW - 1) + ' is empty — nothing in the game reaches the HUD (§ 2.4.1)',
    gapClean,
    'the lowest object that exists is the supply submarine at rows 177-183');
}

/**
 * The half that checks this port against its own past.
 *
 * @param {import('./harness.js').CheckList} list
 * @param {Object} cap
 * @returns {void}
 */
function goldens(list, cap) {
  list.section('§ 20.5 goldens — the frame against its own past, byte for byte');

  for (const t of GOLDEN_TICKS) {
    const got = cap.digests[t];
    const want = GOLDEN[t];

    if (got.hash === want.hash) {
      list.add('tick ' + t + ' is byte-for-byte identical to the golden frame',
        true, got.hash + ', ' + got.lit + ' lit');
      continue;
    }

    // **A failure is a question.** Say where it differs as precisely as the
    // digest allows, so the answer is cheap to find.
    const bandDiff = [];
    for (let b = 0; b < BANDS; b++) {
      if (got.bands[b] !== want.bands[b]) {
        bandDiff.push('rows ' + (b * 16) + '-' + (b * 16 + 15) + ': ' +
          want.bands[b] + ' -> ' + got.bands[b]);
      }
    }
    const hues = [];
    for (const c of new Set([...Object.keys(got.hist), ...Object.keys(want.hist)])) {
      const a = want.hist[c] || 0;
      const b = got.hist[c] || 0;
      if (a !== b) hues.push('colour ' + c + ': ' + a + ' -> ' + b);
    }
    list.add('tick ' + t + ' is byte-for-byte identical to the golden frame',
      false,
      want.hash + ' -> ' + got.hash + '; lit ' + want.lit + ' -> ' + got.lit +
      (bandDiff.length ? '; ' + bandDiff.join('; ') : '') +
      (hues.length ? '; ' + hues.join('; ') : '') +
      ' — ASK WHAT CHANGED before regenerating: a golden regenerated to silence ' +
      'a red page promotes a bug to the reference');
  }
}

/**
 * @param {import('./harness.js').CheckList} list
 * @param {Object} cap
 * @returns {void}
 */
function determinism(list, cap) {
  list.section('§ 1.6 — the property the whole oracle rests on');

  // If this fails, every golden above is meaningless and so is Oracle 3.
  const again = capture();
  let identical = true;
  for (const t of GOLDEN_TICKS) {
    if (again.digests[t].hash !== cap.digests[t].hash) identical = false;
  }
  list.add('two cold boots produce identical frames at every tick (§ 1.6)',
    identical,
    'no clock, no entropy, no iteration order that varies — give this up and ' +
    'Chapter 20 goes with it');
}

/**
 * Print a fresh `golden_frames.js` body to the console.
 *
 * **Regeneration is a deliberate act, so it is not a button.** Run
 * `seafoxRegenerateGoldens()` from the console, read what changed on the page
 * first, and paste the result over the data block in `golden_frames.js` only
 * once you can say why it moved.
 *
 * @returns {string} the file's data section
 */
export function regenerate() {
  /** @type {string} a lone apostrophe, so the emitted quotes need no escaping. */
  const Q = String.fromCharCode(39);
  const cap = capture();
  const lines = ['export const GOLDEN_TICKS = [' + GOLDEN_TICKS.join(', ') + '];', '',
    'export const GOLDEN = {'];
  for (const t of GOLDEN_TICKS) {
    const d = cap.digests[t];
    const hist = Object.keys(d.hist).sort((a, b) => a - b)
      .map((c) => c + ': ' + d.hist[c]).join(', ');
    lines.push('  ' + t + ': {');
    lines.push('    hash: ' + Q + d.hash + Q + ', lit: ' + d.lit + ',');
    lines.push('    bands: [' + d.bands.join(', ') + '],');
    lines.push('    hist: { ' + hist + ' },');
    lines.push('  },');
  }
  lines.push('};');
  const text = lines.join('\n');
  // eslint-disable-next-line no-console
  console.log(text);
  return text;
}

/**
 * Print a fresh `golden_play.js` body to the console.
 *
 * Same rule as above: regenerate only after reading WHY the page went red. The
 * capture ticks are chosen here rather than in the data file, so widening the
 * sample means editing this list and regenerating.
 *
 * @returns {string}
 */
export function regeneratePlay() {
  const Q = String.fromCharCode(39);
  const ticks = [1, 100, 400, 1000, 2000, 2500, 3000, 4500, 6000, 7500, 9000];
  // The capture needs the tick list before it runs, so publish it first.
  GOLDEN_PLAY_TICKS.length = 0;
  for (const t of ticks) GOLDEN_PLAY_TICKS.push(t);
  const cap = captureScripted();

  const lines = ['export const GOLDEN_PLAY_TICKS = [' + ticks.join(', ') + '];', '',
    'export const GOLDEN_PLAY = {'];
  for (const t of ticks) {
    const d = cap.digests[t];
    lines.push('  ' + t + ': {');
    lines.push('    hash: ' + Q + d.hash + Q + ', lit: ' + d.lit + ',');
    lines.push('    phase: ' + Q + d.phase + Q + ', mission: ' + d.mission +
      ', subs: ' + d.subs + ',');
    lines.push('    fuel: ' + d.fuel + ', torp: ' + d.torp + ', live: ' + d.live + ',');
    lines.push('  },');
  }
  lines.push('};');
  lines.push('');
  lines.push('export const PLAY_TIMELINE = [');
  for (const e of cap.timeline) {
    lines.push('  { tick: ' + e.tick + ', phase: ' + Q + e.phase + Q + ' },');
  }
  lines.push('];');
  const text = lines.join(String.fromCharCode(10));
  // eslint-disable-next-line no-console
  console.log(text);
  return text;
}

if (typeof window !== 'undefined') {
  window.seafoxRegenerateGoldens = regenerate;
  window.seafoxRegeneratePlay = regeneratePlay;
}

mount('design_spec § 20.5 — Oracle 4, golden frames. Two halves: ANCHORS check ' +
  'the frame against the spec, GOLDENS check it against this port\'s own past. ' +
  'A golden failure is a question, not a verdict', (list) => {
  const cap = capture();
  anchors(list, cap);
  goldens(list, cap);
  determinism(list, cap);
  scripted(list);
});
