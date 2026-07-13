// level_viewer.js -- browse the 32 Arkanoid-MSX brick layouts, rendered with
// the REAL MSX tiles: assets/dat_levels.js (pre-baked grids) + assets/dat_tiles.js
// (patterns/colors/colorToPattern) via src/tiles.js buildTileBitmaps.

import { LEVELS } from '../assets/dat_levels.js';
import { TILES } from '../assets/dat_tiles.js';
import { buildTileBitmaps, drawBrick } from '../src/tiles.js';

// Grid geometry is self-describing (pre-baked 12 rows x 11 cols).
const ROWS = LEVELS[0].grid.length;
const COLS = LEVELS[0].grid[0].length;

const BRICK_W = 40;   // on-screen brick size (native 16x8, drawn 2.5x)
const BRICK_H = 20;
const BG_COLOR = '#17294d';   // playfield backdrop behind the bricks (viewer presentation)

const canvas = document.getElementById('view');
const ctx = canvas.getContext('2d');
canvas.width = COLS * BRICK_W;
canvas.height = ROWS * BRICK_H;
ctx.imageSmoothingEnabled = false;

const els = {
  prev: document.getElementById('prev'),
  next: document.getElementById('next'),
  num: document.getElementById('num'),
  label: document.getElementById('label'),
  status: document.getElementById('status'),
  legend: document.getElementById('legend'),
};

const levels = LEVELS;
const tiles = buildTileBitmaps(TILES);   // 256 tile bitmaps, built once at load
const ctp = TILES.colorToPattern;
let cur = 0;

function render() {
  const level = levels[cur];
  const grid = level.grid;   // pre-baked at build time; no runtime decode

  ctx.fillStyle = BG_COLOR;                          // playfield backdrop
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const idx = grid[r][c];
      if (idx !== -1) drawBrick(ctx, tiles, ctp, idx, c * BRICK_W, r * BRICK_H, BRICK_W, BRICK_H);
    }
  }

  els.num.value = String(cur + 1);
  els.label.textContent = `Level ${cur + 1}/${levels.length}`;

  // Data is pre-validated at build time (placed == popcount == brickCount in
  // tools/extract.py), so the viewer just reports counts. gold = present - breakable.
  const gold = level.brickCount - level.breakable;
  els.status.innerHTML =
    `<span class="ok">${level.brickCount} bricks</span> ` +
    `<span class="meta">· breakable ${level.breakable} · gold ${gold}</span>`;
}

function go(i) {
  cur = (i + levels.length) % levels.length;
  render();
}

function buildLegend() {
  // The 10 real brick types, each drawn as its 16x8 tile pair (2x).
  els.legend.innerHTML = '';
  for (let i = 0; i < 10; i++) {
    const cv = document.createElement('canvas');
    cv.width = 32;
    cv.height = 16;
    drawBrick(cv.getContext('2d'), tiles, ctp, i, 0, 0, 32, 16);
    const s = document.createElement('span');
    s.appendChild(cv);
    const lbl = document.createElement('span');
    lbl.className = 'meta';
    lbl.textContent = i === 9 ? '9 gold' : String(i);
    s.appendChild(lbl);
    els.legend.appendChild(s);
  }
}

function main() {
  buildLegend();
  console.log(`[level_viewer] ${levels.length} levels, real MSX tiles (${tiles.length} tile bitmaps)`);

  els.prev.onclick = () => go(cur - 1);
  els.next.onclick = () => go(cur + 1);
  els.num.onchange = () => go((parseInt(els.num.value, 10) || 1) - 1);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') go(cur - 1);
    else if (e.key === 'ArrowRight') go(cur + 1);
  });

  go(0);
}

main();
