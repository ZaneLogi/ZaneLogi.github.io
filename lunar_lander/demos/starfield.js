// lunar_lander/demos/starfield.js — 034598 starfield (and region close-up)
//
// The starfield decoded from 034598 ($5244-$53E6): 24 subroutines of bright
// points (no lines), brightness 5-9 = star magnitudes, positioned by the CPU
// at runtime. Each shape is fit-to-box and enlarged, with points rendered as
// visible dots (they're invisible in gallery.html). A focus panel shows the
// selected shape; click any grid cell to focus it. The range is editable (hex)
// so this doubles as a close-up viewer for any 034598 region.

import { ROM598 } from '../discovery_rom_data.js';
import { runList } from '../dvg.js';

const CELL = 168, PAD = 14, LABEL_H = 16, COLS = 5;

const fromInput = document.getElementById('from');
const toInput = document.getElementById('to');
const rangeInfo = document.getElementById('range-info');
const focusCanvas = document.getElementById('focus');
const focusInfo = document.getElementById('focus-info');
const gridCanvas = document.getElementById('grid');

function collect(name) {
  const segs = [];
  const cur = { x: 0, y: 0 };
  try {
    runList(ROM598, ROM598[name], cur, 0,
      (fx, fy, tx, ty, bri) => segs.push({ fx, fy, tx, ty, bri }));
  } catch (e) { /* unresolved target → render whatever was collected */ }
  return segs;
}

function bboxOf(segs) {
  if (!segs.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of segs) {
    minX = Math.min(minX, s.fx, s.tx); maxX = Math.max(maxX, s.fx, s.tx);
    minY = Math.min(minY, s.fy, s.ty); maxY = Math.max(maxY, s.fy, s.ty);
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

function draw(ctx, shape, cx, cy, boxW, boxH, lineW) {
  const { segs, bb } = shape;
  const w = bb.w || 1, h = bb.h || 1;
  const sc = Math.min(boxW / w, boxH / h);
  const bcx = (bb.minX + bb.maxX) / 2, bcy = (bb.minY + bb.maxY) / 2;
  ctx.lineWidth = lineW;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const dotR = Math.max(2, lineW * 1.6);
  for (const s of segs) {
    const x0 = cx + (s.fx - bcx) * sc, y0 = cy - (s.fy - bcy) * sc;
    const x1 = cx + (s.tx - bcx) * sc, y1 = cy - (s.ty - bcy) * sc;
    const col = `rgba(0,255,0,${Math.max(0.45, s.bri / 9)})`;
    if (s.fx === s.tx && s.fy === s.ty) {   // zero-length bright vector = a point (a star)
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x0, y0, dotR, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  }
}

const label = (n) => n.replace(/^[ST]_/, '$');

let shapes = [];
let focused = 0;

function rebuild() {
  const lo = parseInt(fromInput.value, 16);
  const hi = parseInt(toInput.value, 16);
  shapes = [];
  if (!Number.isNaN(lo) && !Number.isNaN(hi)) {
    for (const name of Object.keys(ROM598)) {
      const a = parseInt(name.slice(2), 16);
      if (a < lo || a > hi) continue;
      const segs = collect(name);
      const bb = bboxOf(segs);
      if (!bb) continue;
      shapes.push({ name, segs, bb, addr: a });
    }
    shapes.sort((a, b) => a.addr - b.addr);
  }
  focused = 0;
  const rows = Math.max(1, Math.ceil(shapes.length / COLS));
  gridCanvas.width = COLS * CELL;
  gridCanvas.height = rows * CELL;
  rangeInfo.textContent = `${shapes.length} shapes in range`;
  renderFocus();
  renderGrid();
}

function renderFocus() {
  const ctx = focusCanvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, focusCanvas.width, focusCanvas.height);
  const s = shapes[focused];
  if (!s) { focusInfo.textContent = '—'; return; }
  const m = 48;
  draw(ctx, s, focusCanvas.width / 2, focusCanvas.height / 2,
       focusCanvas.width - m * 2, focusCanvas.height - m * 2, 3);
  focusInfo.textContent =
    `${label(s.name)}  ·  ${Math.round(s.bb.w)}×${Math.round(s.bb.h)} units  ·  ${s.segs.length} strokes`;
}

function renderGrid() {
  const ctx = gridCanvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, gridCanvas.width, gridCanvas.height);
  shapes.forEach((s, i) => {
    const col = i % COLS, row = (i / COLS) | 0;
    const x = col * CELL, y = row * CELL;
    ctx.strokeStyle = i === focused ? '#3a6' : '#1c1c1c';
    ctx.lineWidth = i === focused ? 2 : 1;
    ctx.strokeRect(x + 1, y + 1, CELL - 2, CELL - 2);
    const innerW = CELL - PAD * 2, innerH = CELL - PAD * 2 - LABEL_H;
    draw(ctx, s, x + CELL / 2, y + PAD + innerH / 2, innerW, innerH, 1.75);
    ctx.fillStyle = i === focused ? '#9fe6b0' : '#8a8';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label(s.name), x + CELL / 2, y + CELL - 6);
  });
}

gridCanvas.addEventListener('click', (e) => {
  const r = gridCanvas.getBoundingClientRect();
  const rows = Math.max(1, Math.ceil(shapes.length / COLS));
  const col = Math.floor((e.clientX - r.left) / (r.width / COLS));
  const row = Math.floor((e.clientY - r.top) / (r.height / rows));
  const i = row * COLS + col;
  if (i >= 0 && i < shapes.length) { focused = i; renderFocus(); renderGrid(); }
});

fromInput.addEventListener('change', rebuild);
toInput.addEventListener('change', rebuild);

rebuild();
