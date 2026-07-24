// lemmings/demos/terrain_viewer.js
//
// Demo-only glue: shows the synthetic level's terrain buffer + object map through
// the original 320×160 viewport with horizontal scrolling. Uses the reusable
// src/ modules; adds only debug markers (entrance/exit, the 4×4 grid).

import { buildSyntheticLevel } from '../src/synthetic_level.js';
import { buildTerrainCanvas, paintObjectMapDebug } from '../src/terrain_render.js';
import { VIEWPORT_W, VIEWPORT_H, SCROLL_MAX, WORLD_W, WORLD_H } from '../src/constants.js';
import { CELL } from '../src/object_map.js';

const SKY = '#0e1524';

const errEl = document.getElementById('error');
const state = { scrollX: 0, scale: 1, showObjects: true, showGrid: false };
let level, terrainCanvas, world, wctx, view, vctx;

try { init(); } catch (e) { errEl.textContent = String((e && e.stack) || e); }

function init() {
  level = buildSyntheticLevel();
  terrainCanvas = buildTerrainCanvas(level.terrain, { solidColor: '#8a9b5a' });

  world = document.createElement('canvas');
  world.width = WORLD_W;
  world.height = WORLD_H;
  wctx = world.getContext('2d');
  rebuildWorld();

  view = document.getElementById('view');
  vctx = view.getContext('2d');
  applyScale();
  wireControls();
  redraw();
}

// Composite the full world once: sky, terrain silhouette, then (optionally) the
// object-map overlay. Rebuilt only when the object-map toggle changes.
function rebuildWorld() {
  wctx.fillStyle = SKY;
  wctx.fillRect(0, 0, WORLD_W, WORLD_H);
  wctx.drawImage(terrainCanvas, 0, 0);
  if (state.showObjects) paintObjectMapDebug(wctx, level.objectMap);
}

function applyScale() {
  view.width = VIEWPORT_W * state.scale;
  view.height = VIEWPORT_H * state.scale;
  vctx.imageSmoothingEnabled = false;
}

function redraw() {
  const s = state.scale, sx = state.scrollX;
  vctx.imageSmoothingEnabled = false;
  vctx.drawImage(world, sx, 0, VIEWPORT_W, VIEWPORT_H, 0, 0, VIEWPORT_W * s, VIEWPORT_H * s);
  if (state.showGrid) drawGrid(s, sx);
  drawMarker(level.entrance.x, level.entrance.y, sx, s, '#ff3fbf', 'IN', 'down');
  drawMarker(level.exit.x, level.exit.y, sx, s, '#3cdc5a', 'OUT', 'up');
}

function drawGrid(s, sx) {
  vctx.strokeStyle = 'rgba(255,255,255,0.08)';
  vctx.lineWidth = 1;
  vctx.beginPath();
  for (let gx = Math.ceil(sx / CELL) * CELL; gx < sx + VIEWPORT_W; gx += CELL) {
    const px = (gx - sx) * s + 0.5;
    vctx.moveTo(px, 0); vctx.lineTo(px, VIEWPORT_H * s);
  }
  for (let gy = 0; gy <= VIEWPORT_H; gy += CELL) {
    const py = gy * s + 0.5;
    vctx.moveTo(0, py); vctx.lineTo(VIEWPORT_W * s, py);
  }
  vctx.stroke();
}

function drawMarker(wx, wy, sx, s, color, label, dir) {
  const x = (wx - sx) * s, y = wy * s;
  if (x < -30 || x > VIEWPORT_W * s + 30) return;
  const t = 6;
  vctx.fillStyle = color;
  vctx.beginPath();
  if (dir === 'down') { vctx.moveTo(x - t, y - 16); vctx.lineTo(x + t, y - 16); vctx.lineTo(x, y - 6); }
  else { vctx.moveTo(x - t, y - 2); vctx.lineTo(x + t, y - 2); vctx.lineTo(x, y - 12); }
  vctx.closePath();
  vctx.fill();
  vctx.font = 'bold 11px system-ui';
  vctx.textAlign = 'center';
  vctx.fillText(label, x, dir === 'down' ? y - 20 : y - 16);
}

function wireControls() {
  const scroll = document.getElementById('scroll');
  const readout = document.getElementById('readout');
  const setScroll = (v) => {
    state.scrollX = Math.max(0, Math.min(SCROLL_MAX, Math.round(v)));
    scroll.value = state.scrollX;
    readout.textContent = `x ${state.scrollX} / ${SCROLL_MAX}`;
    redraw();
  };
  scroll.addEventListener('input', () => setScroll(+scroll.value));

  const scale = document.getElementById('scale');
  const scaleVal = document.getElementById('scaleVal');
  scale.addEventListener('input', () => {
    state.scale = +scale.value;
    scaleVal.textContent = state.scale + '×';
    applyScale();
    redraw();
  });

  document.getElementById('showObjects').addEventListener('change', (e) => {
    state.showObjects = e.target.checked;
    rebuildWorld();
    redraw();
  });
  document.getElementById('showGrid').addEventListener('change', (e) => {
    state.showGrid = e.target.checked;
    redraw();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') setScroll(state.scrollX - 16);
    else if (e.key === 'ArrowRight') setScroll(state.scrollX + 16);
    else return;
    e.preventDefault();
  });

  // drag-to-pan
  let dragging = false, lastX = 0;
  view.addEventListener('pointerdown', (e) => {
    dragging = true; lastX = e.clientX;
    view.classList.add('drag');
    view.setPointerCapture(e.pointerId);
  });
  view.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = (e.clientX - lastX) / state.scale;
    lastX = e.clientX;
    setScroll(state.scrollX - dx);
  });
  const end = () => { dragging = false; view.classList.remove('drag'); };
  view.addEventListener('pointerup', end);
  view.addEventListener('pointercancel', end);

  setScroll(0);
}
