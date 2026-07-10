// level_viewer.js -- browse the 32 Arkanoid-MSX brick layouts.
// Loads assets/levels.json, decodes with src/levels.js, draws colored blocks.

import { decodeLevel, COLS, ROWS } from '../src/levels.js';
import { brickColor, GOLD_INDEX, BRICK_COLORS } from '../src/palette.js';

const BRICK_W = 40;   // on-screen brick size (native is 16x8; kept 2:1)
const BRICK_H = 20;
const GAP = 1;

const canvas = document.getElementById('view');
const ctx = canvas.getContext('2d');
canvas.width = COLS * BRICK_W;
canvas.height = ROWS * BRICK_H;

const els = {
  prev: document.getElementById('prev'),
  next: document.getElementById('next'),
  num: document.getElementById('num'),
  label: document.getElementById('label'),
  status: document.getElementById('status'),
  legend: document.getElementById('legend'),
};

let levels = [];
let cur = 0;

function drawBrick(x, y, index) {
  const base = brickColor(index);
  ctx.fillStyle = base;
  ctx.fillRect(x + GAP, y + GAP, BRICK_W - 2 * GAP, BRICK_H - 2 * GAP);
  // simple bevel: light top/left, dark bottom/right
  ctx.fillStyle = '#ffffff30';
  ctx.fillRect(x + GAP, y + GAP, BRICK_W - 2 * GAP, 2);
  ctx.fillRect(x + GAP, y + GAP, 2, BRICK_H - 2 * GAP);
  ctx.fillStyle = '#00000040';
  ctx.fillRect(x + GAP, y + BRICK_H - GAP - 2, BRICK_W - 2 * GAP, 2);
  ctx.fillRect(x + BRICK_W - GAP - 2, y + GAP, 2, BRICK_H - 2 * GAP);
  if (index === GOLD_INDEX) {
    // gold: extra sheen line so the indestructible bricks read distinctly
    ctx.fillStyle = '#fff4c060';
    ctx.fillRect(x + GAP + 3, y + GAP + 3, BRICK_W - 2 * GAP - 6, 1);
  }
}

function render() {
  const level = levels[cur];
  const { grid, present } = decodeLevel(level);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const idx = grid[r][c];
      if (idx !== null) drawBrick(c * BRICK_W, r * BRICK_H, idx);
    }
  }

  els.num.value = String(cur + 1);
  els.label.textContent = `Level ${cur + 1}/${levels.length}`;

  // Decode check: bricks placed on the 11x12 grid must equal the ROM's present
  // count (== popcount). A mismatch would mean set bits fell in the padding
  // region -> wrong geometry. `breakable` excludes indestructible gold.
  const gold = level.brickCount - level.breakable;
  const match = present === level.brickCount;
  els.status.innerHTML =
    `<span class="${match ? 'ok' : 'bad'}">${match ? '✓' : '✗'} decode ` +
    `${present}/${level.brickCount} bricks placed</span> ` +
    `<span class="meta">· breakable ${level.breakable} · gold ${gold}</span>`;
}

function go(i) {
  cur = (i + levels.length) % levels.length;
  render();
}

function buildLegend() {
  const names = ['0', '1', '2', '3', '4', '5', '6', '7', 'silver?', 'GOLD'];
  els.legend.innerHTML = '';
  BRICK_COLORS.forEach((hex, i) => {
    const s = document.createElement('span');
    s.innerHTML = `<span class="sw" style="background:${hex}"></span>${i}${i === GOLD_INDEX ? ' gold' : (i === 8 ? ' silver?' : '')}`;
    els.legend.appendChild(s);
  });
}

async function main() {
  const res = await fetch('../assets/levels.json');
  levels = await res.json();
  buildLegend();

  // One-shot integrity report across all levels (logged for verification).
  let allOk = true;
  for (const lv of levels) {
    const { present } = decodeLevel(lv);
    if (present !== lv.brickCount) allOk = false;
  }
  console.log(`[level_viewer] ${levels.length} levels, all decode==present: ${allOk}`);

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
