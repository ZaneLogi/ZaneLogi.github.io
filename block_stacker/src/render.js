// render.js — draws the game to canvas. Visual assets are not the point
// (see ../docs/research_gameplay.md); we draw plain colored cells.

import { COLS, ROWS, TILE_EMPTY, TILE1, TILE2, TILE3 } from './constants.js';
import { ORIENTATIONS, TYPE_FROM_ORIENTATION } from './pieces.js';

export const CELL = 24;
const BOARD_X = 20;
const BOARD_Y = 20;
const PANEL_X = BOARD_X + COLS * CELL + 24;

export const CANVAS_W = PANEL_X + 150;
export const CANVAS_H = BOARD_Y + ROWS * CELL + 20;

// tile color group -> fill (the 3 NES color groups; arbitrary distinct hues).
const TILE_COLOR = {
  [TILE1]: '#2dd4bf', // {T, O, I}
  [TILE2]: '#f59e0b', // {Z, L}
  [TILE3]: '#60a5fa', // {J, S}
};

const PIECE_NAME = ['T', 'J', 'Z', 'O', 'S', 'L', 'I'];

function drawCell(ctx, px, py, color) {
  ctx.fillStyle = color;
  ctx.fillRect(px, py, CELL, CELL);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, CELL - 1, CELL - 1);
}

export function render(ctx, game) {
  const { playfield, currentPiece, nextPiece } = game;

  // background
  ctx.fillStyle = '#0f1220';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // board well
  ctx.fillStyle = '#181c2e';
  ctx.fillRect(BOARD_X, BOARD_Y, COLS * CELL, ROWS * CELL);

  // grid
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(BOARD_X + c * CELL + 0.5, BOARD_Y);
    ctx.lineTo(BOARD_X + c * CELL + 0.5, BOARD_Y + ROWS * CELL);
    ctx.stroke();
  }
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(BOARD_X, BOARD_Y + r * CELL + 0.5);
    ctx.lineTo(BOARD_X + COLS * CELL, BOARD_Y + r * CELL + 0.5);
    ctx.stroke();
  }

  // locked cells
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const tile = playfield.get(x, y);
      if (tile < TILE_EMPTY) {
        drawCell(ctx, BOARD_X + x * CELL, BOARD_Y + y * CELL, TILE_COLOR[tile] || '#888');
      }
    }
  }

  // active piece
  const ori = ORIENTATIONS[currentPiece];
  const color = TILE_COLOR[ori.tile] || '#fff';
  for (const [dy, dx] of ori.cells) {
    const bx = game.tetriminoX + dx;
    const by = game.tetriminoY + dy;
    if (by < 0) continue; // vanish zone above the board
    drawCell(ctx, BOARD_X + bx * CELL, BOARD_Y + by * CELL, color);
  }

  // next-piece box
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '14px monospace';
  ctx.fillText('NEXT', PANEL_X, BOARD_Y + 14);
  const nOri = ORIENTATIONS[nextPiece];
  const nColor = TILE_COLOR[nOri.tile] || '#fff';
  const nx = PANEL_X + 40, ny = BOARD_Y + 60;
  for (const [dy, dx] of nOri.cells) {
    drawCell(ctx, nx + dx * CELL, ny + dy * CELL, nColor);
  }

  // debug overlay
  ctx.fillStyle = '#94a3b8';
  ctx.font = '12px monospace';
  const valid = playfield.isPositionValid(currentPiece, game.tetriminoX, game.tetriminoY);
  const bits = (b) => (b & 0xFF).toString(2).padStart(8, '0');
  const lines = [
    `frame ${String(game.frameCounter).padStart(6)}`,
    `piece ${PIECE_NAME[TYPE_FROM_ORIENTATION[currentPiece]]} ori 0x${currentPiece.toString(16).padStart(2, '0')}`,
    `state ${game.playState}`,
    `x,y   ${String(game.tetriminoX).padStart(2)},${String(game.tetriminoY).padStart(2)}`,
    `valid ${valid ? 'y' : 'n'}`,
    `dasX  ${String(game.autorepeatX).padStart(3)}`,
    `dropY ${String(game.autorepeatY).padStart(3)}`,
    `hdPts ${String(game.holdDownPoints).padStart(3)}`,
    `held  ${bits(game.heldButtons)}`,
    '',
    'move ←→  soft ↓',
    'rotate  Z / X',
    'debug 1-7 = piece',
  ];
  lines.forEach((t, i) => ctx.fillText(t, PANEL_X, BOARD_Y + 150 + i * 16));
}
