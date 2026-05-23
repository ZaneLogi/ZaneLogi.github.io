// asteroids_clone/main.js
//
// Game bootstrap. Fixed-timestep tick loop at ~62.5 Hz drives the
// 15-JSR dispatch in task_seq.js. Render is a separate canvas paint
// per requestAnimationFrame — by I-7 it just clears the canvas and
// draws a diagnostic overlay since no objects are emitted yet.
//
// Canvas backing store is 1024×768 — matches the DVG visible area
// (research_dvg.md §3). CSS controls displayed size via the size-
// selector buttons in index.html; the browser scales the backing
// store to fit. Drawing code uses DVG coordinates directly, with
// only the Y-axis flip (DVG origin bottom-left → canvas top-left).
//
// See research_main_loop.md §9 for the port spec this implements.

import { GameState } from './state.js';
import { tick } from './task_seq.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

// DVG coordinates → canvas coordinates: 1:1 except Y is flipped.
// (Canvas backing store is sized to match DVG visible area.)
export function toCanvasX(dvgX) { return dvgX; }
export function toCanvasY(dvgY) { return canvas.height - dvgY; }

const TICK_HZ = 62.5;
const TICK_MS = 1000 / TICK_HZ;
// Guard against tab-switch / breakpoint stalls — if the rAF callback
// returns after a multi-second gap, draining the full backlog would
// burn CPU. Cap to ~5 ticks per painted frame and discard the rest.
const MAX_TICKS_PER_FRAME = 5;

const state = new GameState();

let lastFrameTime = 0;
let accumulator = 0;
let frameCount = 0;
let tickCount = 0;
const fpsBuffer = [];

function loop(now) {
  const dt = now - lastFrameTime;
  lastFrameTime = now;
  accumulator += dt;

  let drained = 0;
  while (accumulator >= TICK_MS && drained < MAX_TICKS_PER_FRAME) {
    tick(state);
    accumulator -= TICK_MS;
    tickCount++;
    drained++;
  }
  if (accumulator > TICK_MS * MAX_TICKS_PER_FRAME) {
    accumulator = 0; // dropped backlog after a long stall
  }

  paint(now);
  frameCount++;
  requestAnimationFrame(loop);
}

function paint(now) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Per-object draws will land here once I-8/I-9/I-10/I-12 fill in
  // their stubs. They call into dvg.runList via a small renderer
  // helper (added when the first stub needs it).

  // FPS / tick diagnostic.
  fpsBuffer.push(now);
  while (fpsBuffer.length > 0 && fpsBuffer[0] < now - 1000) {
    fpsBuffer.shift();
  }
  const fps = fpsBuffer.length;
  statusEl.textContent =
    `frame=${frameCount}  tick=${tickCount}  rAF=${fps} Hz  ` +
    `target tick=${TICK_HZ} Hz  accum=${accumulator.toFixed(2)} ms`;
}

// Display-size selector — toggles canvas CSS dimensions only; the
// backing store stays at 1024×768 so drawing coordinates are
// cabinet-faithful regardless of viewing size.
const sizeControls = document.getElementById('size-controls');
sizeControls.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  canvas.style.width = btn.dataset.w + 'px';
  canvas.style.height = btn.dataset.h + 'px';
  for (const b of sizeControls.querySelectorAll('button')) {
    b.classList.toggle('active', b === btn);
  }
});

requestAnimationFrame((now) => {
  lastFrameTime = now;
  requestAnimationFrame(loop);
});
