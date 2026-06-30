// lunar_lander/demos/landscape.js — the FAITHFUL lunar surface, drawn from the
// program source (NOT matched from a MAME snapshot like screen.html/scroll_view.html).
//
// The terrain is built exactly the way the ROM builds it (see
// docs/research_vector_usage.md §3):
//   • 24 segment-glyphs SEG001-024 compose into 16 sections SECT01-16,
//   • the on-screen order is the LNMIN table (SECT01…16, which here = address order
//     by a benign coincidence — see §3), with SECT11 = the flat SEG019 alias,
//   • each section's vertical baseline is the MINTBL Y table,
//   • the surface wraps: section 16 ends exactly where section 01 began.
// No lander, no HUD, no pad labels — just the landscape.

import { ROM598 } from '../discovery_rom_data.js';
import { runList } from '../dvg.js';

// The 16 sections in LNMIN order. S_516E is SECT11 (= SEG019, the flat pad) slotted
// at position 11 — exactly where LNMIN puts it. (Verified: each tile's net-dy matches
// the MINTBL boundary, all 16. See research_vector_usage.md §3.)
const LNMIN_KEYS = ['S_5000', 'S_500A', 'S_5010', 'S_5016', 'S_5020', 'S_5026', 'S_502E',
  'S_5038', 'S_5040', 'S_504C', 'S_516E', 'S_5058', 'S_5060', 'S_506C', 'S_5072', 'S_507E'];
// MINTBL — the Y baseline at the start of each section (A34598.1B:261). Used here only
// to verify the chained surface lands on it; the chain reproduces these exactly.
const MINTBL_Y = [896, 384, 656, 576, 224, 368, 864, 1440, 1088, 640, 64, 64, 448, 96, 64, 640];
const SECT_W = 256;                 // every section is 256 units wide
const LOOP_W = SECT_W * 16;         // 4096 — one full wrap

// Chain the 16 sections with a single accumulating DVG cursor (this is what makes the
// surface continuous; because each section's net-dy equals its MINTBL step, the chain
// passes through every MINTBL baseline). Start at MINTBL[0] = 896.
function buildTerrain() {
  const segs = [], bounds = [], cur = { x: 0, y: MINTBL_Y[0] };
  LNMIN_KEYS.forEach((key, i) => {
    bounds.push({ i, x: cur.x, y: cur.y });
    runList(ROM598, [{ op: 'JSR', target: key }], cur, 0,
            (fx, fy, tx, ty) => segs.push({ fx, fy, tx, ty }));
  });
  return { segs, bounds, end: { x: cur.x, y: cur.y } };   // end = {4096, 896}
}
const TERR = buildTerrain();

// self-check: every section boundary must equal its MINTBL value, and the loop must close
const FAITHFUL = TERR.bounds.every(b => b.y === MINTBL_Y[b.i]) &&
                 TERR.end.x === LOOP_W && TERR.end.y === MINTBL_Y[0];

let yMin = Infinity, yMax = -Infinity;
for (const s of TERR.segs) { yMin = Math.min(yMin, s.fy, s.ty); yMax = Math.max(yMax, s.fy, s.ty); }

// ---- wiring ---------------------------------------------------------------
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const W = cv.width, H = cv.height, PAD = 30;
const BASE = Math.min(W / LOOP_W, (H - 2 * PAD) / (yMax - yMin));   // zoom 1 = whole loop fits the width

const zoomEl = document.getElementById('zoom');
const scrollEl = document.getElementById('scroll');
const autoEl = document.getElementById('auto');
const boundsEl = document.getElementById('bounds');
const readout = document.getElementById('readout');

let scrollDVG = 0;                  // horizontal scroll, in DVG units (0..LOOP_W)

function draw() {
  const scale = BASE * Number(zoomEl.value);
  const yOf = y => H - PAD - (y - yMin) * scale;           // DVG +y up → canvas
  const sx = scrollDVG * scale;
  ctx.clearRect(0, 0, W, H);

  // surface — draw three loop-copies so the viewport stays filled while scrolling (the
  // net-dy=0 loop tiles seamlessly).
  ctx.strokeStyle = 'rgba(120,255,150,0.92)';
  ctx.lineWidth = 1.7; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(120,255,150,0.55)'; ctx.shadowBlur = 4;
  for (const copy of [-1, 0, 1]) {
    const ox = copy * LOOP_W * scale - sx;
    ctx.beginPath();
    for (const s of TERR.segs) {
      ctx.moveTo(s.fx * scale + ox, yOf(s.fy));
      ctx.lineTo(s.tx * scale + ox, yOf(s.ty));
    }
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  // section boundaries + numbers (optional)
  if (boundsEl.checked) {
    ctx.font = '10px monospace'; ctx.textAlign = 'center';
    for (const copy of [-1, 0, 1]) {
      const ox = copy * LOOP_W * scale - sx;
      for (let i = 0; i < 16; i++) {
        const x = i * SECT_W * scale + ox;
        if (x < -20 || x > W + 20) continue;
        ctx.strokeStyle = 'rgba(120,255,150,0.18)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, PAD - 6); ctx.lineTo(x, H - 6); ctx.stroke();
        ctx.fillStyle = 'rgba(140,200,150,0.7)';
        ctx.fillText(String(i + 1).padStart(2, '0'), x + SECT_W * scale / 2, PAD - 10);
      }
    }
    // wrap seam markers — the loop's start/end point (same height)
    for (const copy of [0, 1]) {
      const x = copy * LOOP_W * scale - sx;
      if (x < -10 || x > W + 10) continue;
      ctx.fillStyle = 'rgba(120,200,255,0.9)';
      ctx.beginPath(); ctx.arc(x, yOf(MINTBL_Y[0]), 3.5, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function tick() {
  if (autoEl.checked) {
    scrollDVG = (scrollDVG + 6) % LOOP_W;                  // fly right; wraps
    scrollEl.value = scrollDVG;
  }
  draw();
  const firstSec = Math.floor((scrollDVG % LOOP_W) / SECT_W) + 1;
  readout.textContent =
    `${FAITHFUL ? 'faithful ✓' : 'MISMATCH ✗'}  ·  loop ${LOOP_W} wide (16×256)  ·  ` +
    `zoom ${Number(zoomEl.value).toFixed(1)}×  ·  scroll ${Math.round(scrollDVG)}  ·  ` +
    `left edge ≈ SECT${String(firstSec).padStart(2, '0')}`;
  requestAnimationFrame(tick);
}

scrollEl.max = LOOP_W;
scrollEl.addEventListener('input', () => { autoEl.checked = false; scrollDVG = Number(scrollEl.value); });
requestAnimationFrame(tick);
