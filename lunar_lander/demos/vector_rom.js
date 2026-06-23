// lunar_lander/demos/vector_rom.js — vector-ROM font-sheet demo
//
// Renders the whole alphabet (A-Z + space) decoded from 034598-01.np3,
// one glyph per grid cell, through the shared DVG interpreter (dvg.js).
// Each glyph is a tiny SVEC subroutine in DVG coordinate space; we run it
// to collect its visible segments, measure the ink bounding box, then draw
// every glyph at one shared scale so the sheet reads like a real font table.

import { VROM } from '../vector_rom_data.js';
import { runList } from '../dvg.js';

const canvas = document.getElementById('demo');
const ctx = canvas.getContext('2d');

const NAMES = Object.keys(VROM);          // Char_A .. Char_Z, Char_Space
const COLS = 7;
const ROWS = Math.ceil(NAMES.length / COLS);
const LABEL_H = 18;                        // caption strip at the bottom of each cell
const PAD = 12;                            // inner margin within a cell

let currentGs = 0;

// Run a glyph and collect its visible segments in DVG space (cursor starts
// at origin; LABS/positioning SVECs with bri=0 just move the cursor and are
// not drawn — so the captured segments are exactly the glyph's ink).
function collectSegments(name, gs) {
  const segs = [];
  const cursor = { x: 0, y: 0 };
  runList(VROM, VROM[name], cursor, gs, (fx, fy, tx, ty, bri) =>
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

function render() {
  const gs = currentGs;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Pass 1 — run + measure every glyph.
  const measured = NAMES.map(name => {
    const segs = collectSegments(name, gs);
    return { name, segs, bbox: bboxOf(segs) };
  });

  const cellW = canvas.width / COLS;
  const cellH = canvas.height / ROWS;
  const innerW = cellW - PAD * 2;
  const innerH = cellH - PAD * 2 - LABEL_H;

  // One shared scale: fit the largest glyph's ink box, so relative letter
  // sizes are preserved across the sheet.
  let maxW = 1, maxH = 1;
  for (const m of measured) {
    if (!m.bbox) continue;
    maxW = Math.max(maxW, m.bbox.maxX - m.bbox.minX);
    maxH = Math.max(maxH, m.bbox.maxY - m.bbox.minY);
  }
  const scale = Math.min(innerW / maxW, innerH / maxH);

  // Pass 2 — draw each glyph centered in its cell (DVG y-up → canvas y-down).
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

    const letter = m.name.slice('Char_'.length);
    ctx.fillStyle = '#bbb';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(letter === 'Space' ? '␣ space' : letter, centerX, cellY + cellH - 6);
  });

  document.getElementById('gs-value').textContent = String(gs);
  document.getElementById('info').textContent =
    `${NAMES.length} glyphs · shared scale ${scale.toFixed(2)} · gs=${gs}`;
}

document.getElementById('gs-slider').addEventListener('input', (e) => {
  currentGs = Number(e.target.value);
  render();
});

render();
