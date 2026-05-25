// asteroids_clone/main.js
//
// Game bootstrap. Fixed-timestep tick loop at ~62.5 Hz drives the
// 15-JSR dispatch in task_seq.js. Render is a separate canvas paint
// per requestAnimationFrame — by I-7 it just clears the canvas and
// draws a diagnostic overlay since no objects are emitted yet.
//
// Canvas backing store is DPR-aware: it's resized per displayed
// CSS size × devicePixelRatio so vector strokes render at native
// device pixels with no browser downscale blur. A DVG → device-
// pixel transform set in syncBackingStore() lets drawing code keep
// using DVG logical coordinates (1024×768 visible area per
// research_dvg.md §3); only the Y axis is flipped via toCanvasY.
//
// See research_main_loop.md §9 for the port spec this implements.

import { GameState } from './state.js';
import { simulate, render } from './task_seq.js';
import { drawPackedMessage } from './render.js';
import { VROM } from './vector_rom_data.js';
import { runList } from './dvg.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

// DVG coordinates → canvas coordinates: 1:1 except Y is flipped.
// Y mapping uses (900 - dvgY) so the test-pattern visible Y range
// [128, 896] plus a ~4 px slack lands inside the 1024×768 canvas.
// See research_hud_coords.md §5 for the choice; pre-I-11a used
// canvas.height - dvgY which clipped the HUD at the top edge.
export function toCanvasX(dvgX) { return dvgX; }
export function toCanvasY(dvgY) { return 900 - dvgY; }

const TICK_HZ = 62.5;
const TICK_MS = 1000 / TICK_HZ;
// Guard against tab-switch / breakpoint stalls — if the rAF callback
// returns after a multi-second gap, draining the full backlog would
// burn CPU. Cap to ~5 ticks per painted frame and discard the rest.
const MAX_TICKS_PER_FRAME = 5;

const state = new GameState();
// First wave spawns automatically via the I-9f wave-trailer on frame 1
// — state.astdWaveTimer = 0 + state.curAsteroidCount = 0 at init
// naturally satisfies the trailer's "both zero" condition. The real
// game-start sequence ($68F0+ burst, I-12) will set astdWaveTimer
// to $7F for a 2-second pre-wave pause before path (a) fires.
window.__game = state;  // dev hook for poking at state from the console
const renderer = makeRenderer(ctx);

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
    simulate(state);
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
  // Clear in DVG logical coords (1024×768) — the DVG→device-pixel
  // transform set by syncBackingStore() scales this fill to cover
  // the entire backing store.
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 1024, 768);

  // Render dispatch — per-object draws + frame trailer (LABS/HALT).
  // See task_seq.js header "Port deviation — sim/render split".
  render(state, renderer);

  // I-12b dev hook: render a packed message every frame when the dev
  // flag is set. Set via console: `__game.devPackedMessage = 'GAME_OVER'`.
  // Will retire once I-12d/e wires packed messages into the real attract
  // / game-over flow.
  if (state.devPackedMessage) {
    drawPackedMessage(renderer, state.devPackedMessage);
  }

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

// Renderer — wraps the DVG interpreter + canvas drawing. Exposes
// `drawAt(name, x, y, globalScale)` to per-object render stubs in
// task_seq.js. Coordinate handling: drawing uses DVG logical
// coords (1024×768); a DVG→device-pixel transform set in
// syncBackingStore() scales them to backing pixels. Only Y is
// flipped via toCanvasY since DVG origin is bottom-left.
function makeRenderer(ctx) {
  function drawSegment(fromX, fromY, toX, toY, bri) {
    ctx.beginPath();
    ctx.moveTo(toCanvasX(fromX), toCanvasY(fromY));
    ctx.lineTo(toCanvasX(toX),   toCanvasY(toY));
    ctx.strokeStyle = `rgba(0,255,0,${bri / 15})`;
    // Zero-length SVECs are dots (shrapnel sparks via $7CE0-style
    // emit); fatten them so they read as visible specks rather than
    // 1.5px nubs. Kept smaller than the 4px player-shot dot to stay
    // visually distinct from a bullet.
    const isDot = fromX === toX && fromY === toY;
    ctx.lineWidth = isDot ? 3 : 1.5;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  // Bright stroked-line renderer for ship-explosion fragments. Cabinet
  // vector CRTs make explosion sparks stand out via phosphor accumulation
  // from the double-SVEC reinforcement at $74DA/$74EC. We skip that double
  // emit (research_ship_explosion.md §5.3 — confirmed invisible on cabinet)
  // and compensate with max alpha + thick line + butt caps. With Plan B's
  // fixed gs per stage (drawShip exploding branch), line LENGTH no longer
  // cycles per frame, so the bullet/comet morphing artifact is gone.
  function drawSegmentBright(fromX, fromY, toX, toY, _bri) {
    ctx.beginPath();
    ctx.moveTo(toCanvasX(fromX), toCanvasY(fromY));
    ctx.lineTo(toCanvasX(toX),   toCanvasY(toY));
    ctx.strokeStyle = 'rgba(0,255,0,1.0)';
    const isDot = fromX === toX && fromY === toY;
    if (isDot) {
      // Zero-length SVEC: butt-capped 0-length line has no area; fall back
      // to a small filled square so the fragment still renders.
      ctx.fillStyle = 'rgba(0,255,0,1.0)';
      ctx.fillRect(toCanvasX(fromX) - 2, toCanvasY(fromY) - 2, 4, 4);
      return;
    }
    ctx.lineWidth = 3;
    ctx.lineCap = 'butt';
    ctx.stroke();
  }

  return {
    // Emit a ROM subroutine starting from `cursor` (a mutable {x, y}
    // object — runList mutates it as opcodes advance). For sequential
    // draws sharing one cursor (e.g. ship + thrust flame), the caller
    // passes the same cursor to consecutive calls — matches the source's
    // LABS-then-multiple-JSR pattern. xFlip/yFlip mirror the shape
    // around its anchor (see $750B port + $6AD3 EOR analog in dvg.js).
    drawAt(name, cursor, globalScale, xFlip = false, yFlip = false) {
      runList(VROM, VROM[name], cursor, globalScale, drawSegment, xFlip, yFlip);
    },

    // Single illuminated point — analog of the source's $7CE0 zero-length
    // VEC. Used for player + saucer shots. DVG units in, canvas-Y-flipped
    // by toCanvasY at draw time.
    drawDot(dvgX, dvgY) {
      ctx.fillStyle = 'rgba(0,255,0,0.9)';
      ctx.fillRect(toCanvasX(dvgX) - 2, toCanvasY(dvgY) - 2, 4, 4);
    },

    // Emit ONE SVEC from VROM.ShipExplosion[idx] at `cursor`, at the given
    // globalScale, with an optional alpha multiplier (0..1) to fade the
    // fragment as the explosion ages. Wraps a 1-element opList for runList
    // so the SVEC emits naturally with the same scale arithmetic as full
    // subroutines.
    //
    // Source $74D4-$74DA: A,X = ShipExplosion[Y], JSR $7D45 inline emit.
    // Port deviation: single SVEC per fragment (source emits twice with
    // EOR #$04 phosphor reinforcement — confirmed not visible on cabinet,
    // see research_ship_explosion.md §5.3). We compensate by routing
    // fragments through drawSegmentBright (max alpha + thicker line) AND
    // by fading them via ctx.globalAlpha as status progresses — that
    // fade-out approximates the phosphor decay the cabinet relies on.
    drawShipExplosionPiece(idx, cursor, globalScale, alpha = 1.0) {
      const prevAlpha = ctx.globalAlpha;
      ctx.globalAlpha = alpha;
      runList(VROM, [VROM.ShipExplosion[idx]], cursor, globalScale, drawSegmentBright, false, false);
      ctx.globalAlpha = prevAlpha;
    },
  };
}

// Keyboard input — polled-switch model (source reads $2003-$2407 each
// frame, not edge-triggered). Map arrow keys + space to state.input
// bools; the task_seq routines read them in their port of $703F /
// $6E74 / $6CD7. preventDefault on the arrows + space so the page
// doesn't scroll while playing.
const KEY_MAP = [
  { code: 'ArrowLeft',  slot: 'rotLeft',  label: '←  rotate left' },
  { code: 'ArrowRight', slot: 'rotRight', label: '→  rotate right' },
  { code: 'ArrowUp',    slot: 'thrust',   label: '↑  thrust' },
  { code: 'ArrowDown',  slot: 'hyper',    label: '↓  hyperspace' },
  { code: 'Space',      slot: 'fire',     label: 'space fire' },
  { code: 'Digit5',     slot: 'coin',     label: '5  insert coin' },
  { code: 'Digit1',     slot: 'start1',   label: '1  1-player start' },
];
const KEY_BY_CODE = Object.fromEntries(KEY_MAP.map((k) => [k.code, k.slot]));
window.addEventListener('keydown', (e) => {
  const slot = KEY_BY_CODE[e.code];
  if (slot) {
    state.input[slot] = true;
    e.preventDefault();
  }
});
window.addEventListener('keyup', (e) => {
  const slot = KEY_BY_CODE[e.code];
  if (slot) {
    state.input[slot] = false;
    e.preventDefault();
  }
});
// One <div> per entry so the 2-column CSS Grid in #keymap (see
// index.html) can lay them out as 4 movement keys in column 1 +
// 3 action keys in column 2, flowing top-to-bottom via
// grid-auto-flow: column.
{
  const keymapEl = document.getElementById('keymap');
  for (const k of KEY_MAP) {
    const row = document.createElement('div');
    row.textContent = k.label;
    keymapEl.appendChild(row);
  }
}

// Display-size selector. The CSS Grid layout (see index.html) gives
// the canvas a dedicated middle row clear of the keymap/status/size-
// controls overlays. JS owns the sizing math because pure-CSS
// aspect-ratio doesn't preserve ratio under simultaneous max-width
// + max-height clamps: when the user-chosen size exceeds the stage
// in BOTH dimensions, both clips fire and the ratio breaks.
//
// Each fixed-size button caps the canvas at its (W, H); "Fit" caps
// at Infinity (i.e. just fits the stage). In both cases the actual
// canvas size is the largest 4:3 rectangle that fits within
// min(cap, stage). After resizing the displayed canvas,
// syncBackingStore() resizes the backing store to match device
// pixels — drawing code keeps using DVG-1024×768 coords; the
// transform set by syncBackingStore() does the scaling.
const sizeControls = document.getElementById('size-controls');
const canvasStage = document.getElementById('canvas-stage');

function applyCanvasSize(maxW, maxH) {
  const wCap = Math.min(maxW, canvasStage.clientWidth);
  const hCap = Math.min(maxH, canvasStage.clientHeight);
  let w = wCap;
  let h = (w * 3) / 4;
  if (h > hCap) {
    h = hCap;
    w = (h * 4) / 3;
  }
  canvas.style.width  = Math.floor(w) + 'px';
  canvas.style.height = Math.floor(h) + 'px';
  syncBackingStore();
}

// Match the canvas backing store to (displayed CSS size × DPR) so
// vector strokes render at native device pixels — no browser
// bilinear downscale on top of the canvas's own anti-aliasing.
// Setting canvas.width/height resets the 2D context's transform
// stack, so we re-apply the DVG → device-pixel scale here every
// time. Drawing code stays in DVG logical coords (1024×768).
function syncBackingStore() {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  canvas.width  = Math.max(1, Math.floor(cssW * dpr));
  canvas.height = Math.max(1, Math.floor(cssH * dpr));
  ctx.setTransform(canvas.width / 1024, 0, 0, canvas.height / 768, 0, 0);
}

// Disable fixed-size buttons whose (W, H) exceeds the current stage,
// so picking a size never silently clamps. If the active button gets
// disabled (e.g. user resized the window down after picking 800×600),
// fall back to "Fit" so the canvas keeps a sensible size.
function updateButtonAvailability() {
  const sw = canvasStage.clientWidth;
  const sh = canvasStage.clientHeight;
  let activeStillAvailable = true;
  for (const btn of sizeControls.querySelectorAll('button')) {
    if (btn.dataset.fit) continue;   // "Fit" is always available
    const w = +btn.dataset.w;
    const h = +btn.dataset.h;
    const fits = w <= sw && h <= sh;
    btn.disabled = !fits;
    if (!fits && btn.classList.contains('active')) activeStillAvailable = false;
  }
  if (!activeStillAvailable) {
    for (const b of sizeControls.querySelectorAll('button')) {
      b.classList.toggle('active', !!b.dataset.fit);
    }
  }
}

function applyActiveButtonSize() {
  updateButtonAvailability();
  const btn = sizeControls.querySelector('button.active');
  if (!btn) return;
  if (btn.dataset.fit) {
    applyCanvasSize(Infinity, Infinity);
  } else {
    applyCanvasSize(+btn.dataset.w, +btn.dataset.h);
  }
}

sizeControls.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  for (const b of sizeControls.querySelectorAll('button')) {
    b.classList.toggle('active', b === btn);
  }
  applyActiveButtonSize();
});

window.addEventListener('resize', applyActiveButtonSize);
// Apply default sizing once initial layout settles.
requestAnimationFrame(applyActiveButtonSize);

requestAnimationFrame((now) => {
  lastFrameTime = now;
  requestAnimationFrame(loop);
});
