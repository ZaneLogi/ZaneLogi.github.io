// seafox/tests/test_input.js
//
// design_spec Chapter 19, sections 19.1 to 19.8 -- the input half. The HUD half
// (§ 19.9, § 19.10) is checked by test_renderer.
//
// Two properties are tested hardest because neither is visible in a screenshot
// and both are easy to implement as their opposite:
//
//   * the keyboard is **latched** (§ 19.2) -- a direction persists until another
//     replaces it, so releasing a key does nothing and there is a stop key;
//   * input during a Chapter 11 transition is **deferred, not discarded**
//     (§ 19.8) -- nothing polls, so the pending key is still there afterwards.

import { mount } from './harness.js';
import { Session } from '../src/core/session.js';
import { tick } from '../src/core/tick.js';
import {
  pollInput, KEY_TABLE, START_KEY, PAUSE_KEY, SOUND_KEY,
  SCHEME_KEYBOARD, SCHEME_GAMEPAD,
} from '../src/core/input.js';
import { nameOf, KeyboardSource } from '../src/platform/keyboard.js';
import { GamepadSource, bucket, BUTTON, DEADZONE } from '../src/platform/gamepad.js';
import { PHASE } from '../src/core/round.js';
import { TYPE } from '../src/core/types.js';

/**
 * A scripted key source: the one-key register, driven by hand.
 * @returns {{read: () => ?string, press: (k: string) => void, key: ?string}}
 */
function keys() {
  return {
    key: null,
    press(k) { this.key = k; },        // newest wins, exactly as the latch does
    read() { const k = this.key; this.key = null; return k; },
  };
}

/**
 * A scripted pad source: sampled fresh each poll, never event-driven.
 * @param {Object} [state]
 * @returns {{read: () => ?Object, set: (s: ?Object) => void}}
 */
function padSource(state) {
  return {
    state: state || { vx: 0, vy: 0, primary: false, secondary: false },
    set(s) {
      this.state = s === null ? null
        : Object.assign({ vx: 0, vy: 0, primary: false, secondary: false }, s);
    },
    read() { return this.state; },
  };
}

/**
 * A session in play under the GAMEPAD scheme -- started by the pad's own button,
 * which is what selects the scheme (§ 19.3).
 * @returns {Object}
 */
function padPlaying() {
  const s = new Session();
  s.startDemo();
  s.pad = padSource();
  s.pad.set({ primary: false });             // seen released -> armed
  tick(s);
  s.pad.set({ primary: true });              // now it starts
  tick(s);
  for (let t = 0; t < 400 && s.phase !== PHASE.PLAY; t++) tick(s);
  s.pad.set({});                             // release everything
  return s;
}

/**
 * A session already in play, with the keyboard scheme selected.
 * @returns {Object}
 */
function playing() {
  const s = new Session();
  s.startDemo();
  s.keys = keys();
  s.keys.press(START_KEY);
  for (let t = 0; t < 400 && s.phase !== PHASE.PLAY; t++) tick(s);
  return s;
}

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function theSeam(list) {
  list.section('§ 19.1, § 19.4 — one seam, and eleven bindings');

  list.eq('the table holds eleven bindings — nine directions and two weapons',
    Object.keys(KEY_TABLE).length, 11);

  // **The geometry IS the binding.** Y U I / H J K / N M , is the 3x3 block on
  // the keyboard, and each key commands the direction it sits in.
  const grid = [['y', 'u', 'i'], ['h', 'j', 'k'], ['n', 'm', ',']];
  let geometric = true;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const b = KEY_TABLE[grid[r][c]];
      if (b.vx !== (c - 1) * 2 || b.vy !== (r - 1) * 2) geometric = false;
    }
  }
  list.add('the 3 x 3 block\'s geometry is the direction it commands (§ 19.4)',
    geometric, 'Y U I / H J K / N M , maps to (-2..+2, -2..+2)');

  list.add('the centre key is the stop, and a latched scheme needs one (§ 19.2)',
    KEY_TABLE.j.vx === 0 && KEY_TABLE.j.vy === 0,
    'a held scheme releases to centre; a latched one cannot, so J exists');

  const axes = new Set();
  for (const k of Object.keys(KEY_TABLE)) {
    const b = KEY_TABLE[k];
    if (b.vx !== undefined) { axes.add(b.vx); axes.add(b.vy); }
  }
  list.add('every axis value is one of -2, 0, +2 — the § 19.1 seam',
    [...axes].every((v) => v === -2 || v === 0 || v === 2),
    'saw ' + [...axes].sort((a, b) => a - b).join(', ') +
    ' — nothing downstream knows where a value came from');
}

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function latching(list) {
  list.section('§ 19.2 — latched: a direction persists until another replaces it');

  const s = playing();
  s.keys.press('i');                                  // up-right
  pollInput(s);
  const first = { vx: s.input.vx, vy: s.input.vy };
  list.add('a movement key writes the pair once',
    first.vx === 2 && first.vy === -2, '(' + first.vx + ', ' + first.vy + ')');

  // **No key means nothing is written.** This is the whole of the latch: there
  // is no key-up to hear, so the pair simply keeps its value.
  for (let t = 0; t < 20; t++) pollInput(s);
  list.add('...and twenty polls with NO key leave it exactly where it was (§ 19.2)',
    s.input.vx === 2 && s.input.vy === -2,
    'holding does nothing extra and releasing does nothing at all — an ' +
    'implementation that clears on key-up has built the gamepad\'s model instead');

  s.keys.press('j');
  pollInput(s);
  list.add('only another movement key replaces it, and the stop key is one',
    s.input.vx === 0 && s.input.vy === 0, 'J — all stop');

  // A flurry between two polls collapses to one: the register holds one key.
  const s2 = playing();
  s2.keys.press('u'); s2.keys.press('h'); s2.keys.press('m');
  pollInput(s2);
  list.add('a flurry of presses between two polls collapses to the LAST (§ 19.4)',
    s2.input.vx === 0 && s2.input.vy === 2,
    '(' + s2.input.vx + ', ' + s2.input.vy + ') — the source is a one-key ' +
    'register, like the latch the original reads');
}

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function weapons(list) {
  list.section('§ 19.4 — D and F fire; § 13.2 — and F reads the pair at launch');

  const s = playing();
  s.keys.press('d');
  pollInput(s);
  let found = null;
  for (let i = 0; i < s.entities.liveCount; i++) {
    if (s.entities.slots[i].type === TYPE.VERTICAL_TORPEDO) found = s.entities.slots[i];
  }
  list.add('D fires the vertical torpedo', found !== null, 'type 1 in the list');

  // **The horizontal shot inherits the pair** (§ 13.2), which is why firing is a
  // poll-time action: the drift is the velocity being held at that instant.
  const drifts = [];
  for (const key of ['u', 'j', 'm']) {                // climbing, level, diving
    const sh = playing();
    sh.keys.press(key);
    pollInput(sh);
    sh.horizontalCooldown = 0;
    sh.keys.press('f');
    pollInput(sh);
    let shot = null;
    for (let i = 0; i < sh.entities.liveCount; i++) {
      if (sh.entities.slots[i].type === TYPE.HORIZONTAL_TORPEDO) shot = sh.entities.slots[i];
    }
    drifts.push(shot ? shot.scratch2 : 'none');
  }
  list.add('F fires the horizontal one, and it inherits the held direction (§ 13.2)',
    drifts[0] === -1 && drifts[1] === 0 && drifts[2] === 1,
    'U / J / M gave drift ' + drifts.join(' / ') +
    ' — fire while climbing and the shot climbs with you');
}

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function startingAGame(list) {
  list.section('§ 10.5.3, § 19.3 — the start key, and what it selects');

  const s = new Session();
  s.startDemo();
  s.keys = keys();

  // The demo reads no MOVEMENT keys: its own bounce writes the pair.
  s.keys.press('i');
  tick(s);
  list.add('a movement key does nothing on the title screen (§ 19.4)',
    s.mission === 0 && !s.startRequested,
    'the demo\'s bounce owns the pair; a keypress does not steer it');

  s.keys.press(START_KEY);
  tick(s);
  list.eq('the start key leaves the title screen on the tick it is pressed',
    s.mission, 1);
  list.eq('...and selects the keyboard scheme for the whole session (§ 19.3)',
    s.controller, SCHEME_KEYBOARD);

  // § 19.3: while one scheme is selected the other's controls are inert. With
  // the scheme forced to something else, the table stops being read at all.
  const s2 = playing();
  s2.controller = 'gamepad';
  s2.input.vx = 0; s2.input.vy = 0;
  s2.keys.press('i');
  pollInput(s2);
  list.add('under another scheme the movement keys are inert (§ 19.3)',
    s2.input.vx === 0 && s2.input.vy === 0,
    'the two schemes never meet — each half returns early when the other is live');
}

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function liveInBothSchemes(list) {
  list.section('§ 19.6, § 19.7 — pause and the sound toggle, ahead of every mode test');

  // -- the sound toggle has two layers (§ 19.7) -----------------------------
  const s = new Session();
  s.startDemo();
  s.keys = keys();
  const before = s.sound.enabled;
  s.keys.press(SOUND_KEY);
  tick(s);
  list.add('the toggle flips the preference on the TITLE SCREEN (§ 19.7)',
    s.sound.enabled === !before,
    'it works here because § 19.6 puts it ahead of every mode test');

  list.add('...but the title screen is silent, so nothing there can be heard (§ 18.8)',
    s.mission === 0,
    'suppression is derived from the mission counter, not stored — so the ' +
    'preference takes effect the moment the counter leaves zero');

  const s2 = playing();
  const live = s2.sound.enabled;
  s2.keys.press(SOUND_KEY);
  tick(s2);
  list.add('and during a mission the same key flips what is actually heard',
    s2.sound.enabled === !live, 'one key, two layers');

  // -- pause holds until any input (§ 19.6) ---------------------------------
  const s3 = playing();
  s3.keys.press(PAUSE_KEY);
  tick(s3);
  const frozenAt = s3.tick;
  for (let t = 0; t < 30; t++) tick(s3);
  list.add('a pause freezes the simulation — the tick counter does not advance',
    s3.paused && s3.tick === frozenAt,
    'thirty ticks later it is still at ' + s3.tick + ': a frozen game does not age');

  s3.keys.press('j');                                 // ANY key, not a resume key
  tick(s3);
  list.add('...and ANY input releases it (§ 19.6)',
    !s3.paused && s3.tick === frozenAt + 1,
    'the key that unpauses is consumed doing so, exactly as the original\'s ' +
    'busy-wait consumes it');
}

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function deferredNotDiscarded(list) {
  list.section('§ 19.8 — polled once per tick, and only from the two loops of § 9.2');

  // **Chapter 11's transitions poll nothing** (§ 10.6), which is what makes the
  // outro unstoppable -- and a key pressed during one is DEFERRED, not dropped.
  const s = new Session();
  s.startDemo();
  s.keys = keys();
  s.keys.press(START_KEY);
  tick(s);                                            // -> setup, a transition

  list.add('the launch is a transition, and it polls nothing',
    s.phase === PHASE.SETUP_ICONS, 'phase ' + s.phase);

  s.keys.press('i');                                  // pressed DURING the hold
  let ticked = 0;
  while (s.phase !== PHASE.PLAY && ticked < 400) { tick(s); ticked += 1; }
  list.add('a key pressed during the transition survives it, unread',
    s.keys.key === 'i',
    'still pending after ' + ticked + ' ticks of setup — nothing drained it');

  tick(s);                                            // the round's opening tick
  list.add('...and takes effect on the round\'s opening tick (§ 19.8)',
    s.input.vx === 2 && s.input.vy === -2,
    '(' + s.input.vx + ', ' + s.input.vy + ') — deferred, not discarded. A ' +
    'source that dropped unread keys would silently eat the first input of ' +
    'every round');
}

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function platformNaming(list) {
  list.section('§ 19.5 — the platform layer names keys and nothing else');

  const ev = (init) => Object.assign({ key: '', ctrlKey: false, metaKey: false }, init);

  list.eq('a letter arrives lowercased', nameOf(ev({ key: 'I' })), 'i');
  list.eq('the comma arrives as itself', nameOf(ev({ key: ',' })), ',');
  list.eq('space is the start key', nameOf(ev({ key: ' ' })), START_KEY);
  list.eq('escape is the pause', nameOf(ev({ key: 'Escape' })), PAUSE_KEY);
  list.eq('ctrl+S is a chord, distinct from the unbound s',
    nameOf(ev({ key: 's', ctrlKey: true })), SOUND_KEY);
  list.eq('a key core could never use is dropped, not passed on',
    nameOf(ev({ key: 'F5' })), null);

  // **keyup is deliberately not listened for** (§ 19.2). Tracking it would build
  // the gamepad's hold-to-move model on the keyboard's latched one.
  const src = new KeyboardSource({ addEventListener() {}, removeEventListener() {} });
  src.handler(ev({ key: 'U', preventDefault() {} }));
  src.handler(ev({ key: 'M', preventDefault() {} }));
  list.eq('the source keeps only the newest key', src.read(), 'm');
  list.eq('and reading it clears it — the strobe', src.read(), null);
}

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function theGamepad(list) {
  list.section('§ 19.5 — the gamepad: hold-to-move, and the pairing kept backwards');

  // -- the bucketing, which is where the only float in the input path dies ---
  list.eq('a centred stick buckets to 0', bucket(0.1), 0);
  list.eq('past the deadzone one way, -1', bucket(-0.9), -1);
  list.eq('past it the other, +1', bucket(0.9), 1);
  list.add('the deadzone is what separates them, and nothing analogue survives it',
    bucket(DEADZONE - 0.01) === 0 && bucket(DEADZONE + 0.01) === 1,
    'core sees one of three integers — a fractional velocity would break ' +
    '§ 2.7\'s step-divided speed model, and § 1.6 with it');

  // A fake pad driven through the REAL source, so the standard-mapping indices
  // are exercised rather than assumed.
  const fakeNav = (axes, pressed) => ({
    getGamepads: () => [{
      axes,
      buttons: Array.from({ length: 16 }, (v, i) => ({ pressed: pressed.indexOf(i) !== -1 })),
    }],
  });

  const stick = new GamepadSource({ navigator: fakeNav([0.9, -0.9], []) }).read();
  list.add('the left stick reaches core as (+1, -1) (§ 19.5)',
    stick.vx === 1 && stick.vy === -1, '(' + stick.vx + ', ' + stick.vy + ')');

  const dpad = new GamepadSource({
    navigator: fakeNav([0, 0], [BUTTON.DPAD_LEFT, BUTTON.DPAD_DOWN]),
  }).read();
  list.add('a D-pad maps directly, with no deadzone in the way (§ 19.5)',
    dpad.vx === -1 && dpad.vy === 1, '(' + dpad.vx + ', ' + dpad.vy + ')');

  list.add('no pad connected reads as null, not as a centred one',
    new GamepadSource({ navigator: { getGamepads: () => [null] } }).read() === null,
    'so core leaves the velocity pair alone rather than zeroing it every tick');

  // -- hold-to-move: the whole difference from the keyboard (§ 19.2) ---------
  const s = padPlaying();
  s.pad.set({ vx: 1, vy: -1 });
  tick(s);
  list.add('a held direction is scaled to the § 19.1 seam\'s ±2',
    s.input.vx === 2 && s.input.vy === -2,
    '(' + s.input.vx + ', ' + s.input.vy + ')');

  s.pad.set({});                                   // release to centre
  tick(s);
  list.add('and RELEASING it returns to (0, 0) — hold-to-move, not latched (§ 19.2)',
    s.input.vx === 0 && s.input.vy === 0,
    '(' + s.input.vx + ', ' + s.input.vy + ') — the keyboard would have KEPT the ' +
    'direction. This scheme writes every tick, zero included, and that is the ' +
    'whole difference between the two models');

  // -- the pairing the spec keeps backwards on purpose (§ 19.5) --------------
  const sh = padPlaying();
  sh.pad.set({ primary: true });
  tick(sh);
  list.add('the PRIMARY button fires the HORIZONTAL torpedo (§ 19.5)',
    countType(sh, TYPE.HORIZONTAL_TORPEDO) === 1 && countType(sh, TYPE.VERTICAL_TORPEDO) === 0,
    'this reads backwards to a modern player and is kept deliberately — the ' +
    'original puts the horizontal weapon on button 0');

  const sv = padPlaying();
  sv.pad.set({ secondary: true });
  tick(sv);
  list.add('...and the SECONDARY button the vertical one',
    countType(sv, TYPE.VERTICAL_TORPEDO) === 1, 'one shot away');

  // **Level-triggered.** The original tests the button every frame with no edge
  // detection (`LDA BUTN1 / BPL / JSR`), so a held button re-attempts every tick
  // and the CAP is what paces it.
  const sf = padPlaying();
  sf.pad.set({ secondary: true });
  for (let t = 0; t < 40; t++) tick(sf);
  list.add('holding fire re-attempts every tick, and the CAP paces it (§ 4.7)',
    countType(sf, TYPE.VERTICAL_TORPEDO) === 1,
    'still exactly one in flight after 40 ticks of a held button — the original ' +
    'has no edge detection and no debounce here, so edge-triggering would make ' +
    'the weapon slower than it is');
}

/**
 * @param {import('./harness.js').CheckList} list
 * @returns {void}
 */
function padStart(list) {
  list.section('§ 10.5.3, § 19.3 — the pad starts a game, and that start is debounced');

  // **Held from the very first tick, so it is never seen released**, and it must
  // therefore never start. Without the debounce a pad resting on its button
  // would skip the demo entirely, and the press ending one game would start the
  // next. This is the one place either scheme debounces anything.
  const held = new Session();
  held.startDemo();
  held.pad = padSource({ primary: true });
  for (let t = 0; t < 20; t++) tick(held);
  list.add('a button held from the start never starts a game — it is debounced',
    held.mission === 0 && !held.startRequested,
    'the demo keeps running; § 10.5.3 requires the button be seen released first');

  held.pad.set({ primary: false });                // release...
  tick(held);
  held.pad.set({ primary: true });                 // ...then press
  tick(held);
  list.eq('release, then press, and it starts', held.mission, 1);
  list.eq('...selecting the GAMEPAD scheme for the session (§ 19.3)',
    held.controller, SCHEME_GAMEPAD);

  // § 19.3: the other scheme's controls are now inert.
  const s = padPlaying();
  s.input.vx = 0; s.input.vy = 0;
  s.keys = keys();
  s.keys.press('i');
  pollInput(s);
  list.add('under the pad, the movement KEYS are inert (§ 19.3)',
    s.input.vx === 0 && s.input.vy === 0,
    'the two schemes never meet — each half returns early when the other is live');

  // § 19.6: pause and the sound toggle are not the keyboard SCHEME's, and stay
  // live under the pad because they sit ahead of every scheme test.
  const before = s.sound.enabled;
  s.keys.press(SOUND_KEY);
  pollInput(s);
  list.add('...while the sound toggle still works, because § 19.6 is scheme-blind',
    s.sound.enabled === !before,
    'pause and sound are typed under either scheme — they are not the keyboard\'s');
}

/**
 * @param {Object} s
 * @param {number} type
 * @returns {number}
 */
function countType(s, type) {
  let n = 0;
  for (let i = 0; i < s.entities.liveCount; i++) if (s.entities.slots[i].type === type) n += 1;
  return n;
}

mount('design_spec Chapter 19 — input: one seam, two schemes that never meet, ' +
  'a latched keyboard and a hold-to-move pad', (list) => {
  theSeam(list);
  latching(list);
  weapons(list);
  startingAGame(list);
  liveInBothSchemes(list);
  deferredNotDiscarded(list);
  theGamepad(list);
  padStart(list);
  platformNaming(list);
});
