// lunar_lander/demos/lander.js — lander pose demo
//
// Renders the 9 lander tilt poses decoded from 034599-01.r3 in a 3x3 grid,
// each pose = JSR base octagon + that angle's legs/thruster SVECs, run through
// the shared DVG interpreter (dvg.js). Diagnostic for the "legs too small"
// question: a "fit each to cell" toggle (default on) normalizes each pose's
// size; turning it off renders every pose at one shared scale so true sizes
// are comparable.

import { LANDER } from '../lander_rom_data.js';
import { runList } from '../dvg.js';

const canvas = document.getElementById('demo');
const ctx = canvas.getContext('2d');

const POSES = Object.keys(LANDER).filter(n => n.startsWith('Pose'));
const COLS = 3;
const ROWS = Math.ceil(POSES.length / COLS);
const LABEL_H = 20;
const PAD = 16;

let currentGs = 0;
let fitEach = true;

function collectSegments(name, gs) {
  const segs = [];
  const cursor = { x: 0, y: 0 };
  runList(LANDER, LANDER[name], cursor, gs, (fx, fy, tx, ty, bri) =>
    segs.push({ fx, fy, tx, ty, bri }));
  return segs;
}

function bboxOf(segs) {
  if (!segs.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of segs) {
    minX = Math.min(minX, s.fx, s.tx);
    maxX = Math.max(maxX, s.fx, s.tx);
    minY = Math.min(minY, s.fy, s.ty);
    maxY = Math.max(maxY, s.fy, s.ty);
  }
  return { minX, minY, maxX, maxY };
}

function poseLabel(name) {
  const n = name.slice('Pose'.length);
  return n === '8' ? 'Pose8 — standing' : `Pose${n} — tilt`;
}

function render() {
  const gs = currentGs;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const measured = POSES.map(name => {
    const segs = collectSegments(name, gs);
    return { name, segs, bbox: bboxOf(segs) };
  });

  const cellW = canvas.width / COLS;
  const cellH = canvas.height / ROWS;
  const innerW = cellW - PAD * 2;
  const innerH = cellH - PAD * 2 - LABEL_H;

  // Shared scale across all poses (used when "fit each" is OFF, and as the
  // fit ceiling). Each pose can additionally fit its own bbox when fitEach.
  let maxW = 1, maxH = 1;
  for (const m of measured) {
    if (!m.bbox) continue;
    maxW = Math.max(maxW, m.bbox.maxX - m.bbox.minX);
    maxH = Math.max(maxH, m.bbox.maxY - m.bbox.minY);
  }
  const sharedScale = Math.min(innerW / maxW, innerH / maxH);

  measured.forEach((m, i) => {
    const col = i % COLS;
    const row = (i / COLS) | 0;
    const cellX = col * cellW;
    const cellY = row * cellH;
    const centerX = cellX + cellW / 2;
    const glyphCenterY = cellY + PAD + innerH / 2;

    ctx.strokeStyle = '#1e1e1e';
    ctx.strokeRect(cellX + 0.5, cellY + 0.5, cellW - 1, cellH - 1);

    if (m.bbox) {
      const w = m.bbox.maxX - m.bbox.minX || 1;
      const h = m.bbox.maxY - m.bbox.minY || 1;
      const scale = fitEach ? Math.min(innerW / w, innerH / h) : sharedScale;
      const bcx = (m.bbox.minX + m.bbox.maxX) / 2;
      const bcy = (m.bbox.minY + m.bbox.maxY) / 2;
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      for (const s of m.segs) {
        ctx.beginPath();
        ctx.moveTo(centerX + (s.fx - bcx) * scale, glyphCenterY - (s.fy - bcy) * scale);
        ctx.lineTo(centerX + (s.tx - bcx) * scale, glyphCenterY - (s.ty - bcy) * scale);
        ctx.strokeStyle = `rgba(0,255,0,${Math.max(0.3, s.bri / 15)})`;
        ctx.stroke();
      }
    }

    ctx.fillStyle = '#bbb';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(poseLabel(m.name), centerX, cellY + cellH - 6);
  });

  document.getElementById('gs-value').textContent = String(gs);
  document.getElementById('info').textContent =
    `${POSES.length} poses · gs=${gs} · ${fitEach ? 'fit each to cell' : `shared scale ${sharedScale.toFixed(2)}`}`;
}

document.getElementById('gs-slider').addEventListener('input', (e) => {
  currentGs = Number(e.target.value);
  render();
});
document.getElementById('fit-toggle').addEventListener('change', (e) => {
  fitEach = e.target.checked;
  render();
});

render();
