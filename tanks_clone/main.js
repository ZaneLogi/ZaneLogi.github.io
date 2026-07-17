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

// Debug instrument, NOT part of the game — it lives in main.js so Game stays clean
// and knows nothing about it. Retire it once Renderer draws. See hud.js.
const hud = document.getElementById('hud');

// The key legend. Painted once: KEYMAP is fixed at module load, so re-rendering it
// per frame would be 60 Hz of identical DOM writes. See controls.js.
renderControls(document.getElementById('controls'));

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
