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
  pollInput, KEY_TABLE, START_KEY, PAUSE_KEY, SOUND_KEY, SCHEME_KEYBOARD,
} from '../src/core/input.js';
import { nameOf, KeyboardSource } from '../src/platform/keyboard.js';
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

mount('design_spec Chapter 19 — input: one seam, a latched keyboard, and a ' +
  'one-key register that makes deferral fall out for free', (list) => {
  theSeam(list);
  latching(list);
  weapons(list);
  startingAGame(list);
  liveInBothSchemes(list);
  deferredNotDiscarded(list);
  platformNaming(list);
});
