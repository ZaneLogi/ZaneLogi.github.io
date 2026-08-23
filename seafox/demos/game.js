// seafox/demos/game.js
//
// The first picture this port produces: the core of Chapters 4-16 driven at a
// fixed rate, composited by Chapter 17 and presented to a canvas by § 17.5.
//
// **Nothing here is normative.** The loop, the controls and the readout are a
// harness; § 9.3 draws the line this page sits on the far side of, and the
// simulation cannot tell it is being watched. That is exactly what makes the
// page useful -- if the game looks wrong here, the fault is in `core/` or in
// the composite, never in this file.
//
// The session cold-boots into the demo (§ 10.5.1), which is the deterministic
// opening Oracles 2 and 3 assert. So the first few hundred ticks of this page
// are a picture of numbers already under test.

import { Session } from '../src/core/session.js';
import { tick } from '../src/core/tick.js';
import { PHASE } from '../src/core/round.js';
import { Renderer } from '../src/presentation/renderer.js';
import { Screen } from '../src/presentation/screen.js';
import { hudState } from '../src/presentation/hud.js';
import { Speaker, DEFAULT_TICK_HZ } from '../src/presentation/speaker.js';

/** @type {number} § 2.6: the tick, and the rate every "N frames" acquires here. */
const TICK_HZ = DEFAULT_TICK_HZ;

/** @type {Renderer} */
const renderer = new Renderer();
/** @type {Screen} */
const screen = new Screen(document.getElementById('screen'), 1);
/** @type {Speaker} */
const speaker = new Speaker({ tickHz: TICK_HZ, coneHz: 6000, volume: 0.25 });

/** @type {Session} */
let session = boot();
/** @type {boolean} */
let running = true;
/** @type {number} accumulated milliseconds owed to the simulation. */
let owed = 0;
/** @type {number} */
let last = performance.now();

/**
 * A cold boot: the session, the demo, and the sound sink wired to the speaker.
 * @returns {Session}
 */
function boot() {
  const s = new Session();
  s.startDemo();
  // Chapter 18's queue does not know what a speaker is; it hands out one pair a
  // tick and something downstream decides whether that becomes a sound.
  s.sound.sink = (pair) => speaker.tick(pair);
  return s;
}

/**
 * One simulation tick plus one composite. The two are separate on purpose
 * (§ 9.3): steps 1-3 are the game and step 4 is not.
 * @returns {void}
 */
function step() {
  tick(session);
  renderer.render(session);
  screen.present(renderer.color);
}

/**
 * The driving loop. **Always reschedules**, so a thrown frame cannot kill the
 * page, and a long stall is dropped rather than fast-forwarded.
 * @param {number} now
 * @returns {void}
 */
function frame(now) {
  requestAnimationFrame(frame);

  const dt = now - last;
  last = now;
  if (!running) return;

  owed = Math.min(owed + dt, 250);                  // drop a stall, never catch up
  const period = 1000 / TICK_HZ;
  while (owed >= period) {
    owed -= period;
    step();
  }
  readout();
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const els = {
  play: document.getElementById('play'),
  step: document.getElementById('step'),
  reset: document.getElementById('reset'),
  sound: document.getElementById('sound'),
  scale: document.getElementById('scale'),
  scaleVal: document.getElementById('scaleVal'),
  state: document.getElementById('state'),
};

els.play.addEventListener('click', () => {
  running = !running;
  owed = 0;
  els.play.textContent = running ? 'Pause' : 'Play';
  els.play.classList.toggle('on', running);
});

els.step.addEventListener('click', () => {
  running = false;
  els.play.textContent = 'Play';
  els.play.classList.remove('on');
  step();
  readout();
});

els.reset.addEventListener('click', () => {
  speaker.silence();
  session = boot();
  step();
  readout();
});

els.sound.addEventListener('click', async () => {
  // The AudioContext can only start from a gesture, which is why this is a
  // button and not a flag.
  if (speaker.isRunning) {
    speaker.silence();
    await speaker.ctx.suspend();
  } else {
    await speaker.resume();
  }
  els.sound.textContent = speaker.isRunning ? 'Sound on' : 'Sound off';
  els.sound.classList.toggle('on', speaker.isRunning);
});

els.scale.addEventListener('input', () => {
  const n = Number(els.scale.value);
  screen.setScale(n);
  els.scaleVal.textContent = n + '×';
});

/** @type {Object<string, string>} short names for the eight phases. */
const PHASE_NAME = {
  [PHASE.TITLE]: 'title', [PHASE.SETUP_ICONS]: 'setupIcons',
  [PHASE.SETUP_LAUNCH]: 'setupLaunch', [PHASE.FLY_IN]: 'flyIn',
  [PHASE.FLY_IN_HOLD]: 'flyInHold', [PHASE.PLAY]: 'play',
  [PHASE.OUTRO]: 'outro', [PHASE.DRAIN]: 'drain',
};

/**
 * The state line.
 *
 * **Every field is padded to the width its domain can reach**, so the line is
 * one constant length and nothing shifts sideways as values change. A live
 * readout that reflows every tick is unreadable, and a monospace font alone
 * does not fix it -- `7` and `11` are one cell against two.
 *
 * @returns {void}
 */
function readout() {
  const n = (v, w) => String(v).padStart(w, ' ');
  const t = (v, w) => String(v).padEnd(w, ' ');
  const res = session.resources;

  els.state.textContent = [
    'tick ' + n(session.tick, 6),
    'mission ' + session.mission,
    'phase ' + t(PHASE_NAME[session.phase] || session.phase, 11),
    'hud ' + t(hudState(session), 5),
    'ent ' + n(session.entities.liveCount, 2) + '/32',
    'fx ' + n(session.effects.liveCount, 2) + '/32',
    'fuel ' + n(res.fuel, 4),
    'torp ' + n(res.torpedoes, 2),
    'score ' + n(res.score, 6),
    'subs ' + session.spareSubs,
  ].join('   ');
}

// One frame painted at load, so the page shows the cold-boot screen before the
// loop has run at all.
step();
readout();
requestAnimationFrame(frame);
