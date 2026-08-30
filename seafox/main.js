// seafox/main.js
//
// The game. A cold boot into the title-screen demo, a fixed-rate loop, and a
// keyboard wired to design_spec Chapter 19's one seam. Press SPACE to play.
//
// **Nothing here is normative.** § 1.5 draws the line this file sits on the far
// side of: the loop, the canvas and the audio plumbing are a host, and the
// simulation cannot tell it is being hosted. If the game plays wrongly, the
// fault is in `core/`, never here. `demos/game.html` is the same core with a
// debugger's furniture bolted on instead; this one has none, because a player
// does not want a step button.

import { Session } from './src/core/session.js';
import { tick } from './src/core/tick.js';
import { KeyboardSource } from './src/platform/keyboard.js';
import { GamepadSource } from './src/platform/gamepad.js';
import { Renderer } from './src/presentation/renderer.js';
import { Screen } from './src/presentation/screen.js';
import { Speaker, DEFAULT_TICK_HZ } from './src/presentation/speaker.js';

/** @type {number} § 2.6: the tick. Every "N frames" in the spec is N of these. */
const TICK_HZ = DEFAULT_TICK_HZ;

/** @type {Renderer} */
const renderer = new Renderer();
/** @type {Screen} */
const screen = new Screen(document.getElementById('screen'), 2);
/** @type {Speaker} */
const speaker = new Speaker({ tickHz: TICK_HZ, coneHz: 6000, volume: 0.25 });
/** @type {KeyboardSource} */
const keyboard = new KeyboardSource(window);
/** @type {GamepadSource} */
const pad = new GamepadSource();

/** @type {Session} */
const session = new Session();
session.startDemo();
session.keys = keyboard;
session.pad = pad;
session.sound.sink = (pair) => speaker.tick(pair);

keyboard.attach();

/**
 * **The AudioContext can only start from a user gesture**, which is why there is
 * no sound button: an input the player was going to make anyway does double duty.
 *
 * **Gamepad input does not count as a gesture**, so a keypress alone is not
 * enough -- a player using only a controller would get a silent game. A pointer
 * press covers them, because focusing the page is what makes the browser expose
 * the pad in the first place.
 *
 * @returns {void}
 */
function startAudio() {
  if (!speaker.isRunning) speaker.resume();
  keyboard.onKey = null;
  window.removeEventListener('pointerdown', startAudio);
}

keyboard.onKey = startAudio;
window.addEventListener('pointerdown', startAudio);

/** @type {number} accumulated milliseconds owed to the simulation. */
let owed = 0;
/** @type {number} */
let last = performance.now();

/**
 * One simulation tick plus one composite. The two are separate on purpose
 * (§ 9.3): steps 1-3 are the game and the render is not part of it.
 * @returns {void}
 */
function step() {
  tick(session);
  renderer.render(session);
  screen.present(renderer.color);
}

/**
 * The driving loop. **Always reschedules**, so a thrown frame cannot kill the
 * page, and a long stall is dropped rather than fast-forwarded -- coming back to
 * a backgrounded tab should not fast-forward the game through a minute of play.
 * @param {number} now
 * @returns {void}
 */
function frame(now) {
  requestAnimationFrame(frame);

  const dt = now - last;
  last = now;

  owed = Math.min(owed + dt, 250);
  const period = 1000 / TICK_HZ;
  while (owed >= period) {
    owed -= period;
    step();
  }
}

// One frame painted at load, so the screen shows the cold boot before the loop
// has run at all.
step();
requestAnimationFrame(frame);
