// lunar_lander/demos/gallery.js — full ROM shape gallery
//
// Renders every JSR/JMP-target subroutine from discovery_rom_data.js, grouped
// by ROM, each fit to a small cell and labelled by CPU address. A survey tool
// for identifying what each shape is.

import { ROM599, ROM598, ROM597 } from '../discovery_rom_data.js';
import { runList } from '../dvg.js';

const SECTIONS = [
  ['rom599', ROM599],
  ['rom598', ROM598],
  ['rom597', ROM597],
];

const COLS = 12, CELL = 92, LABEL_H = 13, PAD = 8;
let gs = 0;

function collect(obj, name) {
  const segs = [];
  const cur = { x: 0, y: 0 };
  try {
    runList(obj, obj[name], cur, gs, (fx, fy, tx, ty, bri) => segs.push({ fx, fy, tx, ty, bri }));
  } catch (e) { /* unresolved JSR target → render empty */ }
  return segs;
}

function bboxOf(segs) {
  if (!segs.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of segs) {
    minX = Math.min(minX, s.fx, s.tx); maxX = Math.max(maxX, s.fx, s.tx);
    minY = Math.min(minY, s.fy, s.ty); maxY = Math.max(maxY, s.fy, s.ty);
  }
  return { minX, minY, maxX, maxY };
}

function renderSection(canvasId, obj) {
  const names = Object.keys(obj);
  const rows = Math.ceil(names.length / COLS);
  const canvas = document.getElementById(canvasId);
  canvas.width = COLS * CELL;
  canvas.height = Math.max(1, rows) * CELL;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  names.forEach((name, i) => {
    const col = i % COLS, row = (i / COLS) | 0;
    const x = col * CELL, y = row * CELL;
    ctx.strokeStyle = '#1a1a1a';
    ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);

    const segs = collect(obj, name);
    const bb = bboxOf(segs);
    const innerW = CELL - PAD * 2, innerH = CELL - PAD * 2 - LABEL_H;
    if (bb) {
      const w = (bb.maxX - bb.minX) || 1, h = (bb.maxY - bb.minY) || 1;
      const sc = Math.min(innerW / w, innerH / h);
      const bcx = (bb.minX + bb.maxX) / 2, bcy = (bb.minY + bb.maxY) / 2;
      const cx = x + CELL / 2, cy = y + PAD + innerH / 2;
      ctx.lineWidth = 1;
      ctx.lineCap = 'round';
      for (const s of segs) {
        ctx.beginPath();
        ctx.moveTo(cx + (s.fx - bcx) * sc, cy - (s.fy - bcy) * sc);
        ctx.lineTo(cx + (s.tx - bcx) * sc, cy - (s.ty - bcy) * sc);
        ctx.strokeStyle = `rgba(0,255,0,${Math.max(0.35, s.bri / 15)})`;
        ctx.stroke();
      }
    }
    ctx.fillStyle = bb ? '#9a9' : '#555';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(name.replace(/^[ST]_/, '$'), x + CELL / 2, y + CELL - 3);
  });
}

function renderAll() {
  for (const [id, obj] of SECTIONS) renderSection(id, obj);
}

document.getElementById('gs-slider').addEventListener('input', (e) => {
  gs = Number(e.target.value);
  document.getElementById('gs-value').textContent = String(gs);
  renderAll();
});

renderAll();
