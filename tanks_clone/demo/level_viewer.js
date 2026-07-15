// level_viewer.js -- browse all 35 Battle City stages, drawn with the real CHR
// tiles and the ROM's own palettes.
//
// The whole terrain pipeline, end to end, with nothing invented:
//   stage nibble -> block code -> BLOCK_TILES     -> 4 tile ids -> CHR @ $1000
//                              -> BLOCK_ATTRIBUTE -> palette    -> BG_PALETTE_SETS
// Data is pre-baked by tools/extract.py (and validated there); this file only draws.

import { LEVELS, DEMO_STAGE } from '../assets/dat_levels.js';
import { CHR, CHR_BG_BASE, BG_PALETTE_SETS, BLOCK_TILES, BLOCK_ATTRIBUTE }
  from '../assets/dat_chr.js';
import { decodeTiles, paintTile, imageDataToCanvas } from '../tiles.js';
import { NTSC_FPS, STAGE_COLS, STAGE_ROWS, BLOCK_PX } from '../constants.js';

const FIELD_W = STAGE_COLS * BLOCK_PX;   // 208
const FIELD_H = STAGE_ROWS * BLOCK_PX;   // 208

const tiles = decodeTiles(CHR);

// Presentation only -- the ROM has no names, just tbl_DACB comments ("full brick
// block", "full concrete block", ...). Half-blocks name the half that is SOLID.
const BLOCK_NAME = [
  'brick right', 'brick bottom', 'brick left', 'brick top', 'brick',
  'steel right', 'steel bottom', 'steel left', 'steel top', 'steel',
  'water', 'forest', 'ice', 'empty', '(unused $E)', '(unused $F)',
];

const ui = {
  view: document.getElementById('view'),
  prev: document.getElementById('prev'),
  next: document.getElementById('next'),
  num: document.getElementById('num'),
  label: document.getElementById('label'),
  demo: document.getElementById('demo'),
  zoom: document.getElementById('zoom'),
  set: document.getElementById('set'),
  water: document.getElementById('water'),
  grid: document.getElementById('grid'),
  out: document.getElementById('out'),
  legend: document.getElementById('legend'),
};

const state = {
  stage: 0,        // 0-based index into LEVELS
  demo: false,     // show DEMO_STAGE (stage_FF.bin) instead
  zoom: 3,
  set: 2,          // con_bg_pal_02 -- what $C31D lands on at frame 0
  water: true,     // run sub_C31D's swap on a real 60.0988 Hz clock
  grid: false,
};

const grid = () => (state.demo ? DEMO_STAGE : LEVELS[state.stage]);

// --- drawing ---------------------------------------------------------------

/** One 16x16 block = its 2x2 tiles (TL, TR, BL, BR) in its attribute's palette. */
function paintBlock(img, code, px, py, set) {
  const t = BLOCK_TILES[code];
  const pal = BG_PALETTE_SETS[set][BLOCK_ATTRIBUTE[code]];
  paintTile(img, tiles[CHR_BG_BASE + t[0]], pal, px, py);
  paintTile(img, tiles[CHR_BG_BASE + t[1]], pal, px + 8, py);
  paintTile(img, tiles[CHR_BG_BASE + t[2]], pal, px, py + 8);
  paintTile(img, tiles[CHR_BG_BASE + t[3]], pal, px + 8, py + 8);
}

function buildField(g, set) {
  const img = new ImageData(FIELD_W, FIELD_H);
  for (let r = 0; r < STAGE_ROWS; r++) {
    for (let c = 0; c < STAGE_COLS; c++) {
      paintBlock(img, g[r][c], c * BLOCK_PX, r * BLOCK_PX, set);
    }
  }
  return img;
}

function render() {
  const z = state.zoom;
  const cv = ui.view;
  const w = FIELD_W * z, h = FIELD_H * z;
  const ctx = cv.getContext('2d');

  // Assigning canvas.width/height -- even the SAME value -- reallocates the
  // backing store, clears the canvas, and resets ALL 2D context state. render()
  // runs from the rAF loop on every water swap, so doing it unconditionally threw
  // away a ~1.5 MB backing store twice a second and silently wiped
  // imageSmoothingEnabled (which is why it had to be re-set every call). Resize
  // only on a real size change; restore the context state that the resize ate.
  if (cv.width !== w || cv.height !== h) {
    cv.width = w;
    cv.height = h;
    ctx.imageSmoothingEnabled = false;
  }

  ctx.drawImage(imageDataToCanvas(buildField(grid(), state.set)),
    0, 0, FIELD_W, FIELD_H, 0, 0, w, h);

  if (state.grid) {
    ctx.strokeStyle = '#ffffff20';
    ctx.lineWidth = 1;
    for (let i = 0; i <= STAGE_COLS; i++) {
      const p = i * BLOCK_PX * z + 0.5;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, cv.height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(cv.width, p); ctx.stroke();
    }
  }

  ui.num.value = String(state.stage + 1);
  ui.label.textContent = state.demo ? 'attract stage' : `Stage ${state.stage + 1}/${LEVELS.length}`;
  ui.set.value = String(state.set);
}

// --- the water swap, on a real clock ---------------------------------------
// sub_C31D_water_palette_swap_handler ($C31D), step 18 of the battle pipeline.
// Kept PURE so it can be tested without the rAF loop (the preview pane throttles
// rAF while hidden, so a live observation there is worthless -- see selfTest).
// `frmCntLo` is the NMI's ram_frm_cnt_lo ($0B, INC at $D43C).
//
//   $C31D  LDA frm_cnt_lo / AND #$3F
//   $C321  BEQ  -> $C32C: LDA #con_bg_pal_02
//   $C323  CMP #$20 / BNE -> RTS (no change)
//   $C327  LDA #con_bg_pal_01
export function waterPaletteSwap(frm, cur) {
  const a = frm & 0x3F;
  if (a === 0x00) return 2;     // con_bg_pal_02  ($C32C)
  if (a === 0x20) return 1;     // con_bg_pal_01  ($C327)
  return cur;                   // $C330 RTS -- untouched
}

let frmCntLo = 0;
let bgPaletteId = state.set;

// Fixed-timestep loop: real time diced into NES frames, one tick = one frame.
// rAF is the render pump only. (See constants.js NTSC_FPS / map §1.)
const FIXED_DT = 1 / NTSC_FPS;
let last = performance.now();
let acc = 0;

function loop(now) {
  let dt = (now - last) / 1000;
  if (dt > 0.25) dt = 0.25;       // clamp catch-up after a hidden/throttled gap
  last = now;
  acc += dt;
  while (acc >= FIXED_DT) {
    frmCntLo = (frmCntLo + 1) & 0xFF;
    if (state.water) bgPaletteId = waterPaletteSwap(frmCntLo, bgPaletteId);
    acc -= FIXED_DT;
  }
  if (state.water && bgPaletteId !== state.set) {
    state.set = bgPaletteId;      // only repaint when the set actually changed
    render();
  }
  // ALWAYS reschedule -- a conditional stop can kill the loop permanently when
  // the browser throttles rAF. The dt clamp above absorbs the gap.
  requestAnimationFrame(loop);
}

// --- hover -----------------------------------------------------------------

ui.view.addEventListener('mouseleave', () => { ui.out.innerHTML = '&nbsp;'; });
ui.view.addEventListener('mousemove', (e) => {
  const rect = ui.view.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (ui.view.width / rect.width);
  const y = (e.clientY - rect.top) * (ui.view.height / rect.height);
  const c = Math.floor(x / (BLOCK_PX * state.zoom));
  const r = Math.floor(y / (BLOCK_PX * state.zoom));
  if (c < 0 || r < 0 || c >= STAGE_COLS || r >= STAGE_ROWS) return;
  const code = grid()[r][c];
  const t = BLOCK_TILES[code].map((v) => '$' + v.toString(16).toUpperCase().padStart(2, '0'));
  ui.out.innerHTML = `(${c},${r}) &nbsp; code <b>$${code.toString(16).toUpperCase()}</b> `
    + `<b>${BLOCK_NAME[code]}</b> &nbsp; · tiles ${t.join(' ')} · palette ${BLOCK_ATTRIBUTE[code]}`;
});

// --- legend ----------------------------------------------------------------

function buildLegend() {
  ui.legend.innerHTML = '';
  for (let code = 0; code <= 0xD; code++) {
    const img = new ImageData(BLOCK_PX, BLOCK_PX);
    paintBlock(img, code, 0, 0, state.set);
    const cv = imageDataToCanvas(img);
    cv.style.cssText = 'width:24px;height:24px;image-rendering:pixelated';
    const s = document.createElement('span');
    s.appendChild(cv);
    const l = document.createElement('span');
    l.textContent = `$${code.toString(16).toUpperCase()} ${BLOCK_NAME[code]}`;
    s.appendChild(l);
    ui.legend.appendChild(s);
  }
}

// --- wiring ----------------------------------------------------------------

function go(i) {
  state.demo = false;
  ui.demo.setAttribute('aria-pressed', 'false');
  state.stage = (i + LEVELS.length) % LEVELS.length;
  render();
}

// --- self-check ------------------------------------------------------------
// The data is validated at build time (tools/extract.py), so this checks only
// what the viewer itself adds: the $C31D swap schedule, driven deterministically
// rather than observed live (the pane throttles rAF when hidden -- a live check
// there proves nothing).
function selfTest() {
  const problems = [];

  // Sweep one full period. The ONLY frames that change the palette are
  // frm&$3F == $00 -> set 2, and == $20 -> set 1. Everything else holds.
  let cur = 0;
  const changes = [];
  for (let f = 0; f < 128; f++) {
    const next = waterPaletteSwap(f, cur);
    if (next !== cur) changes.push([f, next]);
    cur = next;
  }
  const want = JSON.stringify([[0, 2], [32, 1], [64, 2], [96, 1]]);
  if (JSON.stringify(changes) !== want) {
    problems.push(`$C31D schedule ${JSON.stringify(changes)} != ${want}`);
  }

  // The swap is only meaningful if sets 01/02 differ ONLY in palette 1 (water).
  const [a, b] = [BG_PALETTE_SETS[1], BG_PALETTE_SETS[2]];
  for (let p = 0; p < 4; p++) {
    const same = a[p].join() === b[p].join();
    if (p === 1 && same) problems.push('con_bg_pal_01/02 palette 1 identical — no shimmer');
    if (p !== 1 && !same) problems.push(`con_bg_pal_01/02 differ in palette ${p}, expected only 1`);
  }

  // Geometry the render assumes.
  if (LEVELS.length !== 35) problems.push(`LEVELS ${LEVELS.length} != 35`);
  for (const [name, g] of [['LEVELS[0]', LEVELS[0]], ['DEMO_STAGE', DEMO_STAGE]]) {
    if (g.length !== STAGE_ROWS || g[0].length !== STAGE_COLS) {
      problems.push(`${name} is ${g.length}x${g[0].length}, want ${STAGE_ROWS}x${STAGE_COLS}`);
    }
  }

  if (problems.length) console.error('[level_viewer] self-check FAILED:\n' + problems.join('\n'));
  else console.log('[level_viewer] self-check passed: $C31D schedule + palette sets + geometry.');
  return problems;
}

function main() {
  for (let s = 0; s < BG_PALETTE_SETS.length; s++) {
    const o = document.createElement('option');
    o.value = String(s);
    o.textContent = `con_bg_pal_${String(s).padStart(2, '0')}`;
    ui.set.appendChild(o);
  }

  ui.prev.onclick = () => go(state.stage - 1);
  ui.next.onclick = () => go(state.stage + 1);
  ui.num.onchange = () => go((parseInt(ui.num.value, 10) || 1) - 1);
  ui.demo.onclick = () => {
    state.demo = !state.demo;
    ui.demo.setAttribute('aria-pressed', String(state.demo));
    render();
  };
  ui.zoom.onchange = () => { state.zoom = parseInt(ui.zoom.value, 10); render(); };
  ui.set.onchange = () => {
    state.set = parseInt(ui.set.value, 10);
    bgPaletteId = state.set;
    state.water = false;                       // a manual pick stops the animation
    ui.water.setAttribute('aria-pressed', 'false');
    buildLegend(); render();
  };
  ui.water.onclick = () => {
    state.water = !state.water;
    ui.water.setAttribute('aria-pressed', String(state.water));
  };
  ui.grid.onclick = () => {
    state.grid = !state.grid;
    ui.grid.setAttribute('aria-pressed', String(state.grid));
    render();
  };
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') go(state.stage - 1);
    else if (e.key === 'ArrowRight') go(state.stage + 1);
  });

  buildLegend();
  selfTest();
  render();                       // paint immediately -- the first view is never blank
  last = performance.now();
  requestAnimationFrame(loop);

  console.log(`[level_viewer] ${LEVELS.length} stages + attract, `
    + `${STAGE_COLS}x${STAGE_ROWS} blocks, real CHR tiles`);
}

main();
