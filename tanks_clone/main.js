// main.js — boot + the frame pump
//
// Real time is diced into NES frames: one tick = one frame @ NTSC_FPS, and rAF is
// the RENDER pump only. rAF runs at the DISPLAY rate (60/120/144), which is not
// 60.0988 — so a single repaint may need 0, 1 or 2+ logic ticks. That is exactly
// why Mode.update() and Mode.render() are split (flow doc §7.4(1)): a fused
// update-and-draw would paint the same frame twice, or not at all.
//
// This mirrors demo/level_viewer.js, the accumulator's first use in this project.
// See constants.js NTSC_FPS and docs/research_system_interaction_map.md §1.

import { Game } from './game.js';
import { NTSC_FPS } from './constants.js';
import { hudText } from './hud.js';
import { renderControls } from './controls.js';

const canvas = document.getElementById('screen');
const game = new Game(canvas);
game.boot();

// NOT SOURCE — a debug handle on the live instance (same category as hud.js). Lets a
// console / test session inspect and drive the running game (e.g. force a Battle with
// enemies for a screenshot). The game never reads it back; it can be dropped anytime.
window.game = game;

// Debug instrument, NOT part of the game — it lives in main.js so Game stays clean
// and knows nothing about it. Retire it once Renderer draws. See hud.js.
const hud = document.getElementById('hud');

// The key legend. Painted once: KEYMAP is fixed at module load, so re-rendering it
// per frame would be 60 Hz of identical DOM writes. See controls.js.
renderControls(document.getElementById('controls'));

// Audio enable + mute — NOT SOURCE, the DOM/UX layer (same category as hud/controls).
// The Famicom had neither: an AudioContext is born suspended and can only unlock inside
// a user gesture (autoplay policy), and a web build wants a mute the console never had.
//
// Enable lazily on the FIRST input — the player presses a key to work the menu / hit
// Start anyway, and the attract/demo screens are silent, so no sound is ever wanted
// before that press. No modal, no "click to start". The `once` listeners cover both
// keyboard and pointer; the M key and the on-page button toggle mute thereafter
// (either also unlocks, since a click/keypress is itself a gesture).
const soundBtn = document.getElementById('sound');
function updateSoundBtn() {
  const muted = game.audio.enabled && game.audio.muted;
  soundBtn.textContent = (!game.audio.enabled ? '🔊 Enable sound'
                          : muted ? '🔇 Sound off' : '🔊 Sound on') + ' · M';
  soundBtn.classList.toggle('muted', muted);
}
function unlock() { if (!game.audio.enabled) { game.audio.enable(); updateSoundBtn(); } }
function toggleSound() { game.audio.enable(); game.audio.toggleMute(); updateSoundBtn(); }

window.addEventListener('keydown', unlock, { once: true });
window.addEventListener('pointerdown', unlock, { once: true });
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') { e.preventDefault(); toggleSound(); }   // M is not a game key
});
soundBtn.addEventListener('click', toggleSound);
updateSoundBtn();

const FIXED_DT = 1 / NTSC_FPS;
const MAX_CATCHUP = 0.25;   // clamp after a hidden/throttled gap, so we don't
                            // spiral trying to replay minutes of missed frames
let last = performance.now();
let acc = 0;

function frame(now) {
  // Always reschedule FIRST — the loop stays unkillable even if a tick throws.
  requestAnimationFrame(frame);

  let dt = (now - last) / 1000;
  if (dt > MAX_CATCHUP) dt = MAX_CATCHUP;
  last = now;

  acc += dt;
  while (acc >= FIXED_DT) {   // 0, 1, or 2+ times
    game.tick();
    acc -= FIXED_DT;
  }

  game.render();              // exactly once
  hud.textContent = hudText(game);
}

game.render();                // paint one frame at load, before rAF ever fires
hud.textContent = hudText(game);
requestAnimationFrame(frame);
