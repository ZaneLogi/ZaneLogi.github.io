// main.js — composition root: canvas, the fixed-timestep loop, input, wiring.
// NES Tetris port; see docs/research_gameplay.md.

import { NTSC_FPS, PIECE } from './src/constants.js';
import { ORIENTATIONS, ROTATION, SPAWN_TABLE, SPAWN_ORIENTATION, TYPE_FROM_ORIENTATION } from './src/pieces.js';
import { Game } from './src/game.js';
import { Input } from './src/input.js';
import { render, CANVAS_W, CANVAS_H } from './src/render.js';

const canvas = document.getElementById('game');
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;
const ctx = canvas.getContext('2d');

const game = new Game();
const input = new Input();

// --- Fixed-timestep loop. Real time is diced into NES frames; game.tick() is
//     one frame. NES logic is integer-frame-based, so ticks are unscaled. ---
const FIXED_DT = 1 / NTSC_FPS; // seconds per NES frame
let last = performance.now();
let acc = 0;

function loop(now) {
  let dt = (now - last) / 1000;
  if (dt > 0.25) dt = 0.25; // clamp catch-up after a hidden/throttled gap
  last = now;
  acc += dt;
  while (acc >= FIXED_DT) {
    input.poll();
    game.tick(input.heldButtons, input.newlyPressedButtons);
    acc -= FIXED_DT;
  }
  render(ctx, game);
  // ALWAYS reschedule — the loop must never conditionally stop, or it can die
  // permanently when the browser throttles rAF (the "black idle canvas" bug).
  // The browser auto-pauses rAF while hidden and resumes it when visible; the
  // dt clamp above absorbs the gap.
  requestAnimationFrame(loop);
}

// --- PHASE-1 debug input: keys 1-7 spawn each piece to verify the shape table.
//     The real DAS/soft-drop input system lands in phase 2. ---
const DEBUG_KEY_TO_TYPE = {
  '1': PIECE.T, '2': PIECE.J, '3': PIECE.Z, '4': PIECE.O,
  '5': PIECE.S, '6': PIECE.L, '7': PIECE.I,
};
document.addEventListener('keydown', (e) => {
  if (e.key in DEBUG_KEY_TO_TYPE) game.debugSpawn(DEBUG_KEY_TO_TYPE[e.key]);
});

// --- Console self-check: catch table transcription errors early. ---
function selfCheck() {
  const problems = [];
  if (ORIENTATIONS.length !== 20) problems.push(`ORIENTATIONS len ${ORIENTATIONS.length} != 20`);
  ORIENTATIONS.forEach((o, i) => {
    if (o.cells.length !== 4) problems.push(`ORIENTATIONS[${i}] has ${o.cells.length} cells != 4`);
  });
  if (ROTATION.length !== 19) problems.push(`ROTATION len ${ROTATION.length} != 19`);
  if (SPAWN_TABLE.length !== 7) problems.push(`SPAWN_TABLE len ${SPAWN_TABLE.length} != 7`);
  if (SPAWN_ORIENTATION.length !== 19) problems.push(`SPAWN_ORIENTATION len ${SPAWN_ORIENTATION.length} != 19`);
  if (TYPE_FROM_ORIENTATION.length !== 19) problems.push(`TYPE_FROM_ORIENTATION len ${TYPE_FROM_ORIENTATION.length} != 19`);
  // every spawn piece must be valid on an empty board at (5,0)
  for (let t = 0; t < 7; t++) {
    const ori = SPAWN_TABLE[t];
    if (!game.playfield.isPositionValid(ori, 5, 0)) problems.push(`spawn piece type ${t} invalid at (5,0)`);
  }
  if (problems.length) {
    console.error('[block_stacker] self-check FAILED:\n' + problems.join('\n'));
  } else {
    console.log('[block_stacker] self-check passed: tables + spawn OK.');
  }
}

selfCheck();
render(ctx, game);        // paint immediately so the very first view is never blank
last = performance.now();
requestAnimationFrame(loop);
